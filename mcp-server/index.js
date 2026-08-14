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

import { login, logout, getAuthedClient, logAudit, AuthRequiredError, beginPairedLogin, claimPairedLogin } from './lib/supabaseClient.js';
import { createProposal, quoteProposal, listGeneratedProposals } from './lib/proposal.js';
import { ensureProposalsBucket, storageConfigured, uploadProposal, listStoredProposals } from './lib/proposalStorage.js';

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
function fileDownloadUrl(path, filename) {
  const token = registerDownload(path, filename);
  const domain = process.env.RAILWAY_PUBLIC_DOMAIN || 'aurevya-mcp-production.up.railway.app';
  return `https://${domain}/files/${token}`;
}

/* ── tool catalogue ─────────────────────────────────────────────────── */

const TOOLS = [
  {
    name: 'aurevya_link',
    description: 'RECOMMENDED way to sign in. Ask the user to open the login page in their browser (tell them the URL: this server\'s address + "/login"), sign in there with their own Aurevya staff email/password, and read back the 6-character code the page shows them. Pass that code here — never ask the user to type their password directly into chat. Required once before any other Aurevya tool works; cached for this connection until aurevya_logout or a long idle period.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'The 6-character code shown on the /login page after the user signs in there' },
      },
      required: ['code'],
    },
  },
  {
    name: 'aurevya_login',
    description: 'Alternate sign-in for local/stdio setups where a login web page isn\'t running. Takes a staff email + password directly. Prefer aurevya_link instead when this server is reachable over HTTP (hosted mode) — some Claude clients correctly refuse to call a tool with a raw password parameter, which is expected behavior, not a bug.',
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
    description: 'Fast fee quote for a Mauritius structure (any combination of Authorised Company / GBC / none, + Trust(s), + CIS, + Nominee shareholder) or for the MFO / Fund Luxembourg / Accounting-only templates — no files written, just the numbers. Good for "what would a GBC with a trust cost" style questions, and also a good way to sanity-check a combination before calling create_proposal — the result echoes back "selections" and "structureDetail" objects showing exactly what was applied (every shareholder, trust, and CIS cell by name); compare that against what the client actually asked for before proceeding. IMPORTANT — ask before assuming: (1) Trust, CIS, and (if company=ac) Nominee shareholder all default to NOT included. (2) How many shareholders/settlors are there, and what should each be named? Don\'t assume just one. (3) If a Trust is wanted, is it a single trust or does the client need more than one (e.g. one per family branch, one per jurisdiction)? (4) If a CIS is wanted, how many cells, and do they have specific names (e.g. "Cell A — Growth Fund") or should the standard "CELL A"/"CELL B" naming be used? Never silently default any of these to one when the client\'s situation might need more.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['structure', 'mfo', 'fundlux', 'accounting'], default: 'structure' },
        company: { type: 'string', enum: ['ac', 'gbc', 'none'], default: 'ac', description: 'Only used when mode=structure. Ask which one the client wants.' },
        trust: { type: 'boolean', default: false, description: 'Ask the client explicitly: do they want a Trust wrapper? Pass true/false based on their actual answer.' },
        cis: { type: 'boolean', default: false, description: 'Ask the client explicitly: do they want a CIS (Protected Cell Company)? Pass true/false based on their actual answer.' },
        nominee: { type: 'boolean', default: false, description: 'Only relevant when company=ac. Nominee shareholder is an OPTIONAL add-on where Aurevya holds the shares on the client\'s behalf — it defaults to false (not included). Only set true if the client explicitly asks for a nominee shareholder; do not include it just because the company is an AC.' },
        shareholders: { type: 'array', items: { type: 'string' }, description: 'REQUIRED whenever there is more than one shareholder/settlor — pass their actual names here, one per array entry, e.g. ["Mr. John Smith", "Mrs. Jane Smith"]. Do NOT write the names into the clientName field instead (e.g. do not do clientName: "Smith Family (Settlors: John & Jane)") — that will NOT put them on the diagram; this array is the only field that does. Ask how many shareholders/settlors there are before generating anything — don\'t assume a single shareholder. Omit only for the default single generic "SHAREHOLDER"/"SETTLOR" box.' },
        extraTrusts: { type: 'array', items: { type: 'string' }, description: 'Names for any ADDITIONAL trusts beyond the first (requires trust=true — the first trust is that one). Each extra trust gets its own full Trust setup/maintenance fee. Ask if more than one trust is needed before assuming a single trust covers everything.' },
        cisCellNames: { type: 'array', items: { type: 'string' }, description: 'Custom names for each CIS cell, e.g. ["Cell A — Growth Fund", "Cell B — Income Fund"]. Requires cis=true. Ask how many cells and whether they need specific names. If omitted, defaults to the standard 2 cells named "CELL A"/"CELL B" (or use cisCells for an unnamed count instead).' },
        currency: { type: 'string', enum: ['USD', 'EUR'], default: 'USD' },
      },
    },
  },
  {
    name: 'create_proposal',
    description: 'Generates a full Aurevya Wealth proposal (PDF) by driving the real proposal-generator tool headlessly — identical output to a staff member filling in the sidebar by hand and clicking Download, including manually adding extra shareholders, extra trusts, or naming CIS cells. Handles any combination of Authorised Company / GBC / none + Trust(s) + CIS + Nominee shareholder, or the MFO / Fund Luxembourg / Accounting-only templates. Returns a download link for the PDF (permanent — does not expire — as long as permanent storage is configured server-side; otherwise falls back to a 1-hour link) plus "selections" and "structureDetail" objects showing exactly what was applied inside the generator (every shareholder, trust, and CIS cell by name) — read that back to the client before sharing the link, to confirm nothing was dropped, defaulted incorrectly, or under-counted. IMPORTANT — ask before assuming: (1) Trust, CIS, and (if company=ac) Nominee shareholder all default to NOT included. (2) How many shareholders/settlors are there, and what should each be named? (3) If a Trust is wanted, does the client need more than one (extraTrusts)? (4) If a CIS is wanted, how many cells and do they need specific names (cisCellNames)? Recommend running quote_proposal first with the same options to confirm the combination, structure, and fees look right before generating the final PDF.',
    inputSchema: {
      type: 'object',
      properties: {
        clientName: { type: 'string', description: 'e.g. "Mr. Peter Nguyen" or "Smith Family" — used in the document title and filename ONLY. If there are multiple shareholders/settlors, put their names in the separate `shareholders` array, not here — do not append things like "(Settlors: John & Jane)" to this field.' },
        mode: { type: 'string', enum: ['structure', 'mfo', 'fundlux', 'accounting'], default: 'structure' },
        company: { type: 'string', enum: ['ac', 'gbc', 'none'], default: 'ac', description: 'Only used when mode=structure. Ask which one the client wants.' },
        trust: { type: 'boolean', default: false, description: 'Ask the client explicitly: do they want a Trust wrapper? Pass true/false based on their actual answer — never leave this out if they said yes.' },
        cis: { type: 'boolean', default: false, description: 'Ask the client explicitly: do they want a CIS (Protected Cell Company)? Pass true/false based on their actual answer.' },
        nominee: { type: 'boolean', default: false, description: 'Only relevant when company=ac. Nominee shareholder is an OPTIONAL add-on where Aurevya holds the shares on the client\'s behalf — it defaults to false (not included). Only set true if the client explicitly asks for a nominee shareholder; do not include it just because the company is an AC.' },
        shareholders: { type: 'array', items: { type: 'string' }, description: 'REQUIRED whenever there is more than one shareholder/settlor — pass their actual names here, one per array entry, e.g. ["Mr. John Smith", "Mrs. Jane Smith"]. Do NOT write the names into the clientName field instead (e.g. do not do clientName: "Smith Family (Settlors: John & Jane)") — that will NOT put them on the diagram; this array is the only field that does. Ask how many shareholders/settlors there are before generating anything — don\'t assume a single shareholder. Omit only for the default single generic "SHAREHOLDER"/"SETTLOR" box.' },
        extraTrusts: { type: 'array', items: { type: 'string' }, description: 'Names for any ADDITIONAL trusts beyond the first (requires trust=true — the first trust is that one). Each extra trust gets its own full Trust setup/maintenance fee, and its own box on the diagram. Ask if more than one trust is needed.' },
        cisCellNames: { type: 'array', items: { type: 'string' }, description: 'Custom names for each CIS cell, e.g. ["Cell A — Growth Fund", "Cell B — Income Fund"]. Requires cis=true. Takes priority over cisCells if both are given.' },
        cisCells: { type: 'number', description: 'Total (unnamed) CIS cells to show on the diagram (defaults to the standard 2 if cis=true). Ignored if cisCellNames is provided — use that instead when the client has specific names in mind.' },
        month: { type: 'number', description: '0-11, defaults to current month' },
        year: { type: 'number', description: 'defaults to current year' },
        currency: { type: 'string', enum: ['USD', 'EUR'], default: 'USD' },
      },
      required: ['clientName'],
    },
  },
  {
    name: 'list_generated_proposals',
    description: 'Lists recently generated proposal PDFs (from create_proposal), most recent first, each with its own download link. Good for "can I get that proposal again" or "what have I generated recently" style requests, instead of re-running create_proposal. If permanent storage is configured server-side, this is a real archive with permanent links that survive redeploys; otherwise it only sees files generated since the container last restarted, with links valid for 1 hour.',
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

// Defensive fallback: calling assistants have repeatedly been observed
// stuffing settlor/shareholder names into the free-text `clientName`
// field (e.g. clientName: "Smith Family (Settlors: John Smith & Jane
// Smith)") instead of using the dedicated `shareholders` array, even
// though the tool schema explicitly asks for the array. Rather than rely
// solely on prompt wording, parse a few common phrasings out of
// clientName and populate `shareholders` server-side when the caller
// didn't supply it. Also strips the matched fragment out of clientName so
// the document title/filename don't end up with a redundant
// "(Settlors: ...)" parenthetical baked in.
function extractShareholdersFromClientName(clientName) {
  if (!clientName || typeof clientName !== 'string') return { names: null, cleanedName: clientName };
  const m = clientName.match(/\(?\s*settlors?\s*:\s*([^)]+?)\)?\s*$/i);
  if (!m) return { names: null, cleanedName: clientName };
  const namesPart = m[1];
  const names = namesPart
    .split(/\s*(?:,|&|\band\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.length < 2) return { names: null, cleanedName: clientName };
  const cleanedName = clientName.slice(0, m.index).trim().replace(/[,\-–—]\s*$/, '').trim();
  return { names, cleanedName: cleanedName || clientName };
}

/** Every tool handler, parameterized by the MCP session id so hosted
 *  (HTTP) mode keeps each staff member's login completely separate even
 *  though they're all talking to the same running server. In local
 *  (stdio) mode sessionId is just a constant — there's only ever one
 *  user, the person running Claude Desktop. */
async function handle(sessionId, name, args) {
  args = args || {};
  if (name === 'create_proposal' || name === 'quote_proposal') {
    // Temporary debug aid: these two tools have been getting called
    // without newer optional fields (shareholders/extraTrusts/
    // cisCellNames) actually reaching the server, and the deploy logs
    // otherwise only show that a tools/call happened, not what was in
    // it — logging the full args here is the fastest way to tell whether
    // that's a calling-client behavior issue or a real bug on this end.
    console.error('[aurevya-mcp] %s args: %s', name, JSON.stringify(args));

    // Confirmed via those logs: the calling assistant was passing
    // clientName: "Smith Family (Settlors: John Appadoo & Jane Appadoo)"
    // with no `shareholders` array at all. Catch that pattern here so the
    // diagram/fees are correct even when the calling assistant doesn't
    // use the dedicated parameter.
    if ((!Array.isArray(args.shareholders) || args.shareholders.length === 0) && args.clientName) {
      const { names, cleanedName } = extractShareholdersFromClientName(args.clientName);
      if (names) {
        console.error('[aurevya-mcp] %s — extracted shareholders from clientName: %s', name, JSON.stringify(names));
        args = Object.assign({}, args, { shareholders: names, clientName: cleanedName });
      }
    }
  }

  if (name === 'aurevya_login') {
    const profile = await login(sessionId, args.email, args.password);
    return ok({ signedInAs: profile.full_name, email: profile.email, role: profile.role });
  }
  if (name === 'aurevya_link') {
    const profile = claimPairedLogin(sessionId, args.code);
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

  // proposal tools don't touch Supabase tables at all (quote_proposal
  // writes nothing; create_proposal/list_generated_proposals only touch
  // Supabase Storage, via a separate service-role client — see
  // lib/proposalStorage.js — never the RLS-scoped one used everywhere else)
  if (name === 'quote_proposal') return ok(await quoteProposal(args));
  if (name === 'create_proposal') {
    const result = await createProposal(args);
    if (storageConfigured()) {
      // Permanent link — survives redeploys/restarts, never expires.
      const downloadUrl = await uploadProposal(result.pdfPath, result.clientSlug, result.pdfFilename);
      return ok({
        label: result.label,
        selections: result.selections,
        structureDetail: result.structureDetail,
        filename: result.pdfFilename,
        downloadUrl,
        note: 'This link is permanent and does not expire. Read "selections" and "structureDetail" back to the client (every shareholder, trust, and CIS cell by name) to confirm the structure matches what they asked for before sharing it.',
      });
    }
    if (process.env.PORT) {
      // Fallback: permanent storage isn't configured yet (no
      // SUPABASE_SERVICE_ROLE_KEY in Railway), so this behaves like
      // before — a link good for 1 hour, pointing at this container's
      // local disk, which is wiped on the next redeploy/restart.
      const downloadUrl = fileDownloadUrl(result.pdfPath, result.pdfFilename);
      return ok({
        label: result.label,
        selections: result.selections,
        structureDetail: result.structureDetail,
        filename: result.pdfFilename,
        downloadUrl,
        note: 'This link expires in 1 hour and will break after the next server redeploy (permanent storage isn\'t configured yet — see SUPABASE_SERVICE_ROLE_KEY in the README). Read "selections" and "structureDetail" back to the client to confirm the structure matches what they asked for before sharing it.',
      });
    }
    // Local (stdio) mode: the file is genuinely on this machine's disk.
    return ok({
      label: result.label,
      selections: result.selections,
      structureDetail: result.structureDetail,
      htmlPath: result.htmlPath,
      pdfPath: result.pdfPath,
      note: 'Confirm "selections" and "structureDetail" match what the client asked for, then open the PDF to review before sending to the client.',
    });
  }
  if (name === 'list_generated_proposals') {
    const stored = storageConfigured() ? await listStoredProposals(args.limit) : null;
    if (stored) return ok(stored); // permanent links, survives redeploys
    const files = listGeneratedProposals(args.limit);
    if (process.env.PORT) {
      // Fallback: only sees proposals generated since this container last
      // restarted, and links expire in 1 hour — see note above.
      return ok(files.map((f) => ({
        client: f.client,
        file: f.file,
        modified: f.modified,
        downloadUrl: fileDownloadUrl(f.path, f.file),
      })));
    }
    return ok(files);
  }

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
  app.use(express.urlencoded({ extended: true }));

  const LOGIN_PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Aurevya — Sign in for Claude</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#0b1220;color:#e6ecf5;
    display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .card{background:#121b2e;border:1px solid #223050;border-radius:10px;padding:32px;max-width:380px;width:90%}
  h1{font-size:18px;margin:0 0 6px}
  p{color:#9fb0cc;font-size:13px;line-height:1.5;margin:0 0 20px}
  label{display:block;font-size:12px;color:#9fb0cc;margin:14px 0 4px}
  input{width:100%;box-sizing:border-box;padding:10px;border-radius:6px;border:1px solid #2c3c5e;
    background:#0b1220;color:#e6ecf5;font-size:14px}
  button{margin-top:20px;width:100%;padding:11px;border:none;border-radius:6px;background:#5b7fff;
    color:#fff;font-size:14px;font-weight:600;cursor:pointer}
  .code{font-size:28px;letter-spacing:4px;font-weight:700;text-align:center;background:#0b1220;
    border:1px solid #2c3c5e;border-radius:8px;padding:16px;margin:16px 0;color:#8fd694}
  .err{background:#3a1620;border:1px solid #7a2c3c;color:#ff9fb0;padding:10px 12px;border-radius:6px;
    font-size:13px;margin-bottom:14px}
</style></head><body><div class="card">
<h1>Sign in to Aurevya</h1>
<p>Use your normal staff portal login. This gives Claude a short one-time code — it never sees your password.</p>
{{BODY}}
</div></body></html>`;

  app.get('/login', (_req, res) => {
    res.send(LOGIN_PAGE.replace('{{BODY}}', `
      <form method="POST" action="/login">
        <label>Email</label>
        <input type="email" name="email" required autofocus>
        <label>Password</label>
        <input type="password" name="password" required>
        <button type="submit">Sign in</button>
      </form>`));
  });

  app.post('/login', async (req, res) => {
    try {
      const { code, profile } = await beginPairedLogin(req.body.email, req.body.password);
      res.send(LOGIN_PAGE.replace('{{BODY}}', `
        <p style="color:#8fd694">Signed in as ${profile.full_name}.</p>
        <div class="code">${code}</div>
        <p>Tell Claude: <b>"Link my Aurevya account with code ${code}"</b><br>
        This code works once and expires in 10 minutes.</p>`));
    } catch (e) {
      res.status(401).send(LOGIN_PAGE.replace('{{BODY}}', `
        <div class="err">${(e && e.message) || 'Login failed.'}</div>
        <form method="POST" action="/login">
          <label>Email</label>
          <input type="email" name="email" required autofocus value="${(req.body.email || '').replace(/"/g, '&quot;')}">
          <label>Password</label>
          <input type="password" name="password" required>
          <button type="submit">Sign in</button>
        </form>`));
    }
  });

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
      } else if (existingId) {
        // A session id was supplied but this process doesn't know it —
        // almost always because the server restarted (a redeploy) since
        // the client last talked to it. Per the MCP Streamable HTTP spec,
        // an unrecognized session MUST get 404 (not 400) specifically so
        // well-behaved clients treat it as "please reinitialize" and
        // transparently start a fresh session, instead of silently
        // retrying the same dead one forever.
        console.error('[aurevya-mcp] unknown session %s — responding 404 so the client reinitializes', existingId);
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Session not found or expired — please reinitialize.' },
          id: null,
        });
        return;
      } else {
        console.error('[aurevya-mcp] rejecting: no session id and not an initialize request');
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: missing mcp-session-id and not an initialize request' },
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
  ensureProposalsBucket(); // fire-and-forget; create_proposal falls back gracefully if this hasn't run yet or isn't configured
} else {
  const server = buildServer('local');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[aurevya-mcp] ready (local/stdio mode)');
  ensureProposalsBucket();
}
