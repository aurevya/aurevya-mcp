import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadSession, saveSession, clearSession } from './sessionStore.js';

/* Same project, same public anon key the portal's own front end ships with
   (aurevya-portal-source/src/supabase.js) — it is not a secret, it is
   meaningless without a signed-in user, because every table is locked down
   by row-level security (see supabase_schema.sql: is_staff(), "Clients see
   own X" / "Staff manage X" policies). This server never uses a
   service-role key — every query below runs AS the staff member who ran
   `login`, so RLS applies exactly as it does inside the portal itself. */
export const SUPABASE_URL = 'https://wxwbfkhvkrwtmsgwdkjy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d2Jma2h2a3J3dG1zZ3dka2p5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTM5NDAsImV4cCI6MjA5NTg4OTk0MH0.RVFvV3Tu6vgIs3KvPsjOrfdsLaevncysHrirLjAATXM';

export class AuthRequiredError extends Error {
  constructor() {
    super('Not signed in. Ask the user for their Aurevya portal email + password and call the aurevya_login tool first.');
    this.name = 'AuthRequiredError';
  }
}

function freshClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Signs in with the staff member's own portal credentials, confirms they
 *  hold a staff/admin role, and persists the session under this MCP
 *  connection's session id so future tool calls on the *same* connection
 *  don't need the password again. In hosted (HTTP) mode, each staff
 *  member's Claude gets its own connection/session id, so logins never
 *  cross between people even though they're all hitting the same server. */
export async function login(sessionId, email, password) {
  const supabase = freshClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Login failed: ' + error.message);

  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, department')
    .eq('id', data.user.id)
    .single();
  if (pErr) throw new Error('Signed in, but could not load your profile: ' + pErr.message);

  if (profile.role === 'client') {
    await supabase.auth.signOut();
    throw new Error(
      'This tool is for Aurevya staff/admin accounts only. The account ' + email +
      ' is registered as a client on the portal.'
    );
  }

  saveSession(sessionId, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    profile,
  });
  return profile;
}

export function logout(sessionId) {
  clearSession(sessionId);
}

/* ── pairing-code login (hosted mode) ─────────────────────────────────
   Some Claude clients correctly refuse to call a tool that takes a raw
   "password" parameter, on the reasonable grounds that entering
   credentials on the user's behalf is exactly the kind of thing they're
   built not to do — regardless of who's asking or why. That's a policy
   this app should work WITH, not around, so login instead happens on a
   normal webpage (the staff member types their own password into their
   own browser, same as any other login page — nothing autofilled, no
   credential handed to Claude), which then hands back a short one-time
   code. Claude only ever sees that opaque code via aurevya_link, never a
   password. See index.js for the /login GET+POST routes. */
const PENDING_TTL_MS = 10 * 60 * 1000;
const pendingLogins = new Map(); // code -> { access_token, refresh_token, expires_at, profile, createdAt }

function makeCode() {
  // 6 chars, no ambiguous 0/O/1/I, easy to read aloud/type into chat
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[crypto.randomInt(alphabet.length)];
  return code;
}

/** Called by the POST /login form handler. Authenticates directly against
 *  Supabase (same as login() above) but stores the result under a fresh
 *  short code instead of a session id, since at this point there's no
 *  MCP connection yet — just a browser tab. */
export async function beginPairedLogin(email, password) {
  const supabase = freshClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Login failed: ' + error.message);

  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, department')
    .eq('id', data.user.id)
    .single();
  if (pErr) throw new Error('Signed in, but could not load your profile: ' + pErr.message);

  if (profile.role === 'client') {
    await supabase.auth.signOut();
    throw new Error(
      'This tool is for Aurevya staff/admin accounts only. The account ' + email +
      ' is registered as a client on the portal.'
    );
  }

  let code;
  do { code = makeCode(); } while (pendingLogins.has(code));
  pendingLogins.set(code, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    profile,
    createdAt: Date.now(),
  });
  setTimeout(() => pendingLogins.delete(code), PENDING_TTL_MS).unref?.();

  return { code, profile };
}

/** Called by the aurevya_link(code) tool — the only login-adjacent tool
 *  whose input schema has no password field at all. Consumes the code
 *  (one-time use) and attaches its session to this MCP connection. */
export function claimPairedLogin(sessionId, code) {
  const clean = String(code || '').trim().toUpperCase();
  const entry = pendingLogins.get(clean);
  if (!entry) {
    throw new Error(
      'That code is invalid or has expired (codes last 10 minutes and can only be used once). ' +
      'Go back to the login page and generate a new one.'
    );
  }
  pendingLogins.delete(clean); // one-time use
  saveSession(sessionId, {
    access_token: entry.access_token,
    refresh_token: entry.refresh_token,
    expires_at: entry.expires_at,
    profile: entry.profile,
  });
  return entry.profile;
}

/** Returns a Supabase client authenticated as the staff member signed in
 *  on this connection, refreshing the token first if it's stale, plus
 *  their cached profile. Throws AuthRequiredError if this connection
 *  hasn't logged in (or its session expired past refresh). */
export async function getAuthedClient(sessionId) {
  const session = loadSession(sessionId);
  if (!session) throw new AuthRequiredError();

  const supabase = freshClient();
  const nowSecs = Date.now() / 1000;

  if (session.expires_at && session.expires_at - nowSecs < 60) {
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: session.refresh_token,
    });
    if (error) {
      clearSession(sessionId);
      throw new AuthRequiredError();
    }
    session.access_token = data.session.access_token;
    session.refresh_token = data.session.refresh_token;
    session.expires_at = data.session.expires_at;
    saveSession(sessionId, session);
  }

  await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  return { supabase, profile: session.profile };
}

/** Writes one row to audit_logs so every action taken through Claude shows
   up in the same trail as actions taken by hand in the portal (see
   audit_logs_setup.sql). Never blocks the calling tool — a logging
   failure is reported to stderr, not surfaced as a tool error. */
export async function logAudit(supabase, profile, { action, module, record_id, record_type, details }) {
  try {
    await supabase.from('audit_logs').insert({
      user_id: profile.id,
      user_name: profile.full_name,
      user_role: profile.role,
      action,
      module,
      record_id: record_id || null,
      record_type: record_type || null,
      details: details || {},
    });
  } catch (e) {
    console.error('[aurevya-mcp] audit log write failed:', e.message);
  }
}
