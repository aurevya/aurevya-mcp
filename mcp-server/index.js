#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { login, logout, getAuthedClient, logAudit, AuthRequiredError } from './lib/supabaseClient.js';
import { createProposal, quoteProposal, listGeneratedProposals } from './lib/proposal.js';

/* Hosted (HTTP) mode only: generated PDFs are registered here under a
   random token and served back over plain HTTPS (see the /files/:token
   route further down), because embedding the PDF as a binary blob in the
   tool result — while spec-legal — isn't actually rendered as a
   downloadable attachment by Claude Desktop's chat UI in practice. A
   plain link works in literally any client. Tokens expire after an hour
   so the container's disk doesn't grow unbounded between redeploys. */
const fileRegistry = new Map(); // token -> { path, filename }
const FILE_TTL_MS = 60 * 60 * 1000;
function registerDownload(path, filename) {
  const token = randomUUID();
  fileRegistry.set(token, { path, filename });
  setTimeout(() => fileRegistry.delete(token), FILE_TTL_MS).unref?.();
  return token;
}

/* ── tool catalogue ─────────────────────────────────────────────────── */

const TOOLS = [
  {
    name: 'aurevya_login',
    description: 'Sign in to the Aurevya portal with a staff/admin email + password. Required once before any other Aurevya tool works. The session is cached for this connection so it only needs to run again after aurevya_logout, a password change, or (on the hosted server) a long idle period.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Staff portal login email' },
        password: { type: 'string', description: 'Staff portal login password' },
      },
      required: ['email', 'password'],
    },
  },
  {
    name: 'aurevya_whoami',
    description: 'Shows which Aurevya staff account (if any) is currently signed in on this connection.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'aurevya_logout',
    description: 'Clears the cached Aurevya portal session for this connection.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'daily_briefing',
    description: 'One-call snapshot of what needs attention: outstanding/overdue invoices and total value, pending KYC screenings, compliance deadlines due in the next 14 days, and unread client messages. Good default first tool to call for "what\'s on my plate" style questions.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_clients',
    description: 'Search/list client accounts on the portal.',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Filter by name, email, or company (case-insensitive, partial match)' },
        limit: { type: 'number', default: 25 },
      },
    },
  },
  {
    name: 'get_client',
    description: 'Full profile for one client: contact info, their entities, open invoices, and latest KYC status.',
    inputSchema: {
      type: 'object',
      properties: { client_id: { type: 'string', description: 'Client profile UUID (from list_clients)' } },
      required: ['client_id'],
    },
  },
  {
    name: 'list_entities',
    description: 'List corporate/trust entities (GBC, AC, Trust, Foundation, etc.), optionally filtered by client or status.',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'string' },
        status: { type: 'string', enum: ['active', 'in_progress', 'pending', 'completed', 'dissolved'] },
        type: { type: 'string', enum: ['GBC', 'AC', 'Trust', 'Foundation', 'Domestic Company', 'ADGM', 'DIFC'] },
        limit: { type: 'number', default: 50 },
      },
    },
  },
  {
    name: 'list_invoices',
    description: 'List invoices across all clients, filterable by status. Mirrors the admin Invoices page.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['outstanding', 'overdue', 'paid', 'cancelled', 'all'], default: 'outstanding' },
        client_id: { type: 'string' },
        limit: { type: 'number', default: 50 },
      },
    },
  },
  {
    name: 'create_invoice',
    description: 'Create a new invoice for a client. This only writes an internal billing record — it does not charge or move any money.',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'string' },
        entity_id: { type: 'string', description: 'Optional related entity UUID' },
        description: { type: 'string' },
        amount: { type: 'number' },
        currency: { type: 'string', default: 'USD' },
        due_date: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['client_id', 'amount'],
    },
  },
  {
    name: 'mark_invoice_paid',
    description: 'Marks an existing invoice as paid in the portal\'s records (status change only — does not process any actual payment).',
    inputSchema: {
      type: 'object',
      properties: {
        invoice_id: { type: 'string' },
        paid_date: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
      },
      required: ['invoice_id'],
    },
  },
  {
    name: 'list_compliance_deadlines',
    description: 'Upcoming or overdue compliance deadlines (annual returns, renewals, etc.) across all entities.',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'string' },
        within_days: { type: 'number', default: 30, description: 'Only deadlines due within this many days (ignored if status=overdue)' },
        status: { type: 'string', enum: ['pending', 'completed', 'overdue', 'all'], default: 'pending' },
      },
    },
  },
  {
    name: 'list_kyc_checks',
    description: 'KYC/AML screening results across clients — PEP, sanctions, adverse media, risk score, and review status.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'review', 'approved', 'escalated', 'all'], default: 'all' },
        client_id: { type: 'string' },
      },
    },
  },
  {
    name: 'list_documents',
    description: 'Documents on file for a client or entity, including which ones still need a signature.',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'string' },
        entity_id: { type: 'string' },
        requires_signature: { type: 'boolean' },
      },
    },
  },
  {
    name: 'list_conversations',
    description: 'Client message threads, most recently active first.',
    inputSchema: {
      type: 'object',
      properties: {
        unread_only: { type: 'boolean', default: false },
        limit: { type: 'number', default: 25 },
      },
    },
  },
  {
    name: 'get_conversation_messages',
    description: 'Full message history for one conversation.',
    inputSchema: {
      type: 'object',
      properties: { conversation_id: { type: 'string' } },
      required: ['conversation_id'],
    },
  },
  {
    name: 'send_message',
    description: 'Sends a reply as the signed-in staff member in an existing client conversation. Only call this after the user has explicitly approved the exact message text — this sends on their behalf.',
    inputSchema: {
      type: 'object',
      properties: {
        conversation_id: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['conversation_id', 'content'],
    },
  },
  {
    name: 'quote_proposal',
    description: 'Fast fee quote for a Mauritius structure (any combination of Authorised Company / GBC / none, + Trust, + CIS) or for the MFO / Fund Luxembourg / Accounting-only templates — no files written, just the numbers. Good for "what would a GBC with a trust cost" style questions.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['structure', 'mfo', 'fundlux', 'accounting'], default: 'structure' },
        company: { type: 'string', enum: ['ac', 'gbc', 'none'], default: 'ac', description: 'Only used when mode=structure' },
        trust: { type: 'boolean', default: false },
        cis: { type: 'boolean', default: false },
        currency: { type: 'string', enum: ['USD', 'EUR'], default: 'USD' },
      },
    },
  },
  {
    name: 'create_proposal',
    description: 'Generates a full Aurevya Wealth proposal (PDF) by driving the real proposal-generator tool headlessly — identical output to a staff member filling in the sidebar by hand and clicking Download. Handles any combination of Authorised Company / GBC / none + Trust + CIS, or the MFO / Fund Luxembourg / Accounting-only templates. Returns a download link for the PDF (valid for 1 hour) — share that link with the user so they can click it to download.',
    inputSchema: {
      type: 'object',
      properties: {
        clientName: { type: 'string', description: 'e.g. "Mr. Peter Nguyen" — used in the document title and filename' },
        mode: { type: 'string', enum: ['structure', 'mfo', 'fundlux', 'accounting'], default: 'structure' },
        company: { type: 'string', enum: ['ac', 'gbc', 'none'], default: 'ac', description: 'Only used when mode=structure' },
        trust: { type: 'boolean', default: false },
        cis: { type: 'boolean', default: false },
        cisCells: { type: 'number', description: 'Total CIS cells to show on the diagram (defaults to the standard 2 if cis=true)' },
        month: { type: 'number', description: '0-11, defaults to current month' },
        year: { type: 'number', description: 'defaults to current year' },
        currency: { type: 'string', enum: ['USD', 'EUR'], default: 'USD' },
      },
      required: ['clientName'],
    },
  },
  {
    name: 'list_generated_proposals',
    description: 'Lists recently generated proposal files (from create_proposal), most recent first.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', default: 20 } },
    },
  },
];

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
function fail(message) {
  return { content: [{ type: 'text', text: 'Error: ' + message }], isError: true };
}

/** Every tool handler, parameterized by the MCP session id so hosted
 *  (HTTP) mode keeps each staff member's login completely separate even
 *  though they're all talking to the same running server. In local
 *  (stdio) mode sessionId is just a constant — there's only ever one
 *  user, the person running Claude Desktop. */
async function handle(sessionId, name, args) {
  args = args || {};

  if (name === 'aurevya_login') {
    const profile = await login(sessionId, args.email, args.password);
    return ok({ signedInAs: profile.full_name, email: profile.email, role: profile.role });
  }
  if (name === 'aurevya_logout') {
    logout(sessionId);
    return ok({ status: 'signed out' });
  }
  if (name === 'aurevya_whoami') {
    try {
      const { profile } = await getAuthedClient(sessionId);
      return ok({ signedInAs: profile.full_name, email: profile.email, role: profile.role });
    } catch (e) {
      if (e instanceof AuthRequiredError) return ok({ signedIn: false });
      throw e;
    }
  }

  // proposal tools don't touch Supabase at all
  if (name === 'quote_proposal') return ok(await quoteProposal(args));
  if (name === 'create_proposal') {
    const result = await createProposal(args);
    if (process.env.PORT) {
      // Hosted mode: the file only exists on this container, which the
      // staff member can never browse to directly — hand back a real
      // clickable download URL instead of a path.
      const token = registerDownload(result.pdfPath, result.pdfFilename);
      const domain = process.env.RAILWAY_PUBLIC_DOMAIN || 'aurevya-mcp-production.up.railway.app';
      const downloadUrl = `https://${domain}/files/${token}`;
      return ok({
        label: result.label,
        filename: result.pdfFilename,
        downloadUrl,
        note: 'Click the link to download the PDF (valid for 1 hour). Download it now — the link itself is not meant to be sent to the client.',
      });
    }
    // Local (stdio) mode: the file is genuinely on this machine's disk.
    return ok({
      label: result.label,
      htmlPath: result.htmlPath,
      pdfPath: result.pdfPath,
      note: 'Open the PDF to review before sending to the client.',
    });
  }
  if (name === 'list_generated_proposals') return ok(listGeneratedProposals(args.limit));

  // everything else needs a signed-in staff session
  const { supabase, profile } = await getAuthedClient(sessionId);

  if (name === 'daily_briefing') {
    const [inv, kyc, deadlines, convos] = await Promise.all([
      supabase.from('invoices').select('status,amount,currency').in('status', ['outstanding', 'overdue']),
      supabase.from('kyc_checks').select('status').in('status', ['pending', 'review', 'escalated']),
      supabase.from('compliance_deadlines').select('id,deadline_type,due_date,status')
        .eq('status', 'pending')
        .lte('due_date', new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)),
      supabase.from('conversations').select('id,subject,last_message_at').order('last_message_at', { ascending: false }).limit(10),
    ]);
    const outstandingTotal = (inv.data || []).reduce((s, i) => s + Number(i.amount || 0), 0);
    return ok({
      outstandingInvoices: (inv.data || []).length,
      outstandingValue: outstandingTotal,
      pendingKycScreenings: (kyc.data || []).length,
      complianceDeadlinesNext14Days: deadlines.data || [],
      recentConversations: convos.data || [],
    });
  }

  if (name === 'list_clients') {
    let q = supabase.from('profiles').select('id,full_name,email,company,department,portal_active,is_active').eq('role', 'client').limit(args.limit || 25);
    if (args.search) q = q.or(`full_name.ilike.%${args.search}%,email.ilike.%${args.search}%,company.ilike.%${args.search}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ok(data);
  }

  if (name === 'get_client') {
    const [profileRes, entitiesRes, invoicesRes, kycRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', args.client_id).single(),
      supabase.from('entities').select('*').eq('client_id', args.client_id),
      supabase.from('invoices').select('*').eq('client_id', args.client_id).order('issued_date', { ascending: false }),
      supabase.from('kyc_checks').select('*').eq('client_id', args.client_id).order('checked_at', { ascending: false }).limit(1),
    ]);
    if (profileRes.error) throw new Error(profileRes.error.message);
    return ok({
      profile: profileRes.data,
      entities: entitiesRes.data || [],
      invoices: invoicesRes.data || [],
      latestKyc: (kycRes.data || [])[0] || null,
    });
  }

  if (name === 'list_entities') {
    let q = supabase.from('entities').select('*,profiles(full_name,email)').limit(args.limit || 50).order('created_at', { ascending: false });
    if (args.client_id) q = q.eq('client_id', args.client_id);
    if (args.status) q = q.eq('status', args.status);
    if (args.type) q = q.eq('type', args.type);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ok(data);
  }

  if (name === 'list_invoices') {
    let q = supabase.from('invoices').select('*,profiles(full_name,email),entities(name)').order('issued_date', { ascending: false }).limit(args.limit || 50);
    if (args.status && args.status !== 'all') q = q.eq('status', args.status);
    if (args.client_id) q = q.eq('client_id', args.client_id);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ok(data);
  }

  if (name === 'create_invoice') {
    const { data, error } = await supabase.from('invoices').insert({
      client_id: args.client_id,
      entity_id: args.entity_id || null,
      description: args.description || 'Professional services',
      amount: args.amount,
      currency: args.currency || 'USD',
      due_date: args.due_date || null,
    }).select().single();
    if (error) throw new Error(error.message);
    await logAudit(supabase, profile, { action: 'invoice.created', module: 'invoices', record_id: data.id, record_type: 'invoice', details: { amount: args.amount, client_id: args.client_id } });
    return ok(data);
  }

  if (name === 'mark_invoice_paid') {
    const { data, error } = await supabase.from('invoices')
      .update({ status: 'paid', paid_date: args.paid_date || new Date().toISOString().slice(0, 10) })
      .eq('id', args.invoice_id).select().single();
    if (error) throw new Error(error.message);
    await logAudit(supabase, profile, { action: 'invoice.marked_paid', module: 'invoices', record_id: args.invoice_id, record_type: 'invoice' });
    return ok(data);
  }

  if (name === 'list_compliance_deadlines') {
    let q = supabase.from('compliance_deadlines').select('*,entities(name,type),profiles(full_name)').order('due_date', { ascending: true });
    if (args.client_id) q = q.eq('client_id', args.client_id);
    const status = args.status || 'pending';
    if (status !== 'all') q = q.eq('status', status);
    if (status !== 'overdue') {
      const withinDays = args.within_days ?? 30;
      q = q.lte('due_date', new Date(Date.now() + withinDays * 86400000).toISOString().slice(0, 10));
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ok(data);
  }

  if (name === 'list_kyc_checks') {
    let q = supabase.from('kyc_checks').select('*,profiles(full_name,email)').order('checked_at', { ascending: false });
    if (args.status && args.status !== 'all') q = q.eq('status', args.status);
    if (args.client_id) q = q.eq('client_id', args.client_id);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ok(data);
  }

  if (name === 'list_documents') {
    let q = supabase.from('documents').select('*').order('uploaded_at', { ascending: false });
    if (args.client_id) q = q.eq('client_id', args.client_id);
    if (args.entity_id) q = q.eq('entity_id', args.entity_id);
    if (typeof args.requires_signature === 'boolean') q = q.eq('requires_signature', args.requires_signature);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ok(data);
  }

  if (name === 'list_conversations') {
    let q = supabase.from('conversations').select('*,profiles(full_name,email)').order('last_message_at', { ascending: false }).limit(args.limit || 25);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!args.unread_only) return ok(data);
    const withUnread = [];
    for (const c of data) {
      const { count } = await supabase.from('messages').select('id', { count: 'exact', head: true })
        .eq('conversation_id', c.id).is('read_at', null).neq('sender_id', profile.id);
      if (count > 0) withUnread.push(c);
    }
    return ok(withUnread);
  }

  if (name === 'get_conversation_messages') {
    const { data, error } = await supabase.from('messages').select('*,profiles(full_name,role)')
      .eq('conversation_id', args.conversation_id).order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return ok(data);
  }

  if (name === 'send_message') {
    const { data, error } = await supabase.from('messages').insert({
      conversation_id: args.conversation_id,
      sender_id: profile.id,
      content: args.content,
    }).select().single();
    if (error) throw new Error(error.message);
    await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', args.conversation_id);
    await logAudit(supabase, profile, { action: 'message.sent', module: 'messages', record_id: data.id, record_type: 'message', details: { conversation_id: args.conversation_id } });
    return ok(data);
  }

  throw new Error('Unknown tool: ' + name);
}

/** Builds one MCP Server instance wired to the shared tool catalogue and
 *  handler above, closing over a fixed sessionId. Hosted mode calls this
 *  once per incoming connection; local mode calls it once, ever. */
function buildServer(sessionId) {
  const server = new Server(
    { name: 'aurevya-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      return await handle(sessionId, name, args);
    } catch (e) {
      if (e instanceof AuthRequiredError) return fail(e.message);
      return fail(e.message || String(e));
    }
  });
  return server;
}

/* ── entry point: HTTP (hosted, e.g. Railway) when PORT is set,
   otherwise stdio (local, one person, one Claude Desktop config) ────── */

if (process.env.PORT) {
  const express = (await import('express')).default;
  const app = express();
  app.use(express.json());

  const transports = {}; // mcp-session-id -> StreamableHTTPServerTransport

  app.get('/', (_req, res) => res.status(200).send('aurevya-mcp is running'));

  // One-time-ish download link for a create_proposal PDF — see
  // registerDownload() above. Not behind Supabase auth (a plain link has
  // to work from a browser click, not a logged-in tool call), but the
  // token is an unguessable UUID and expires after an hour.
  app.get('/files/:token', (req, res) => {
    const entry = fileRegistry.get(req.params.token);
    if (!entry) return res.status(404).send('This download link has expired or is invalid. Ask Claude to generate the proposal again.');
    res.download(entry.path, entry.filename);
  });

  app.all('/mcp', async (req, res) => {
    const existingId = req.headers['mcp-session-id'];
    console.error('[aurevya-mcp] %s /mcp session=%s body.method=%s', req.method, existingId || '(none)', req.body && req.body.method);
    try {
      let transport;

      if (existingId && transports[existingId]) {
        transport = transports[existingId];
      } else if (!existingId && isInitializeRequest(req.body)) {
        // Choose the session id ourselves (rather than letting the SDK pick
        // one lazily) so the login-session store key and the transport's own
        // "mcp-session-id" always match up.
        const sessionId = randomUUID();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => sessionId,
          onsessioninitialized: (sid) => { transports[sid] = transport; },
        });
        transport.onclose = () => { delete transports[sessionId]; };
        const server = buildServer(sessionId);
        await server.connect(transport);
      } else {
        console.error('[aurevya-mcp] rejecting: no matching session and not an initialize request');
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: missing or invalid mcp-session-id' },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.error('[aurevya-mcp] /mcp handler threw:', e && e.stack || e);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error: ' + (e && e.message) }, id: null });
      }
    }
  });

  const port = Number(process.env.PORT);
  app.listen(port, () => {
    console.error('[aurevya-mcp] listening on :' + port + ' (hosted/HTTP mode)');
  });
} else {
  const server = buildServer('local');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[aurevya-mcp] ready (local/stdio mode)');
}
