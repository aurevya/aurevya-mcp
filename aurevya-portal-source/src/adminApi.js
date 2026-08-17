import { supabase } from './supabase.js'

/* Client side of the admin user API.
 *
 * Creating a user with a password set up-front needs Supabase's admin API,
 * which requires the service-role key. That key bypasses row-level security,
 * so it cannot live in this bundle — a static site's JavaScript is public.
 * These calls therefore go to the Aurevya MCP server (the same Railway
 * service the Claude integration uses), which holds the key and re-checks
 * that the caller is an admin before doing anything.
 *
 * VITE_ADMIN_API_URL lets this point somewhere else (a local server, a
 * staging deploy) without a code change; the default is the live service. */
const API_BASE = (
  import.meta.env?.VITE_ADMIN_API_URL || 'https://aurevya-mcp-production.up.railway.app'
).replace(/\/+$/, '')

async function post(path, body) {
  // The server identifies the caller from this token — it never receives,
  // and never needs, the admin's own password.
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Your session has expired — please sign in again.')

  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    })
  } catch {
    // fetch only rejects for network/CORS failures, which look nothing like
    // a validation error and are worth naming explicitly.
    throw new Error('Could not reach the user administration service. Check your connection and try again.')
  }

  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.error || `Request failed (${res.status}).`)
  return payload
}

/** Creates a user whose password is active immediately. No invite email. */
export function createUser({ email, password, full_name, role, department }) {
  return post('/api/admin/create-user', { email, password, full_name, role, department })
}

/** Sets an existing user's password without emailing them a reset link. */
export function setUserPassword({ user_id, password }) {
  return post('/api/admin/set-password', { user_id, password })
}

/** Whether the server has the service-role key configured, so the UI can
 *  explain the situation rather than fail on the first attempt. */
export async function adminApiStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/status`)
    if (!res.ok) return { configured: false }
    return await res.json()
  } catch {
    return { configured: false, unreachable: true }
  }
}
