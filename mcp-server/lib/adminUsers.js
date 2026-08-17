import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient.js';

/* Admin user provisioning.
 *
 * Creating a user with a password set up-front — rather than emailing an
 * invite and letting them choose one — is only possible through Supabase's
 * admin API, which needs the service-role key. That key bypasses row-level
 * security entirely, so it must never reach the browser: the portal is a
 * static site served from Netlify, and anything in its bundle is public.
 * That's why this lives here, on the server, behind an endpoint that checks
 * the caller is an admin before doing anything.
 *
 * Like proposalStorage.js, the service-role client here is used narrowly —
 * only for auth.admin.* calls and the profiles row that has to accompany a
 * newly created auth user. Everything else in this server still runs as the
 * signed-in staff member under RLS.
 */

export const MIN_PASSWORD_LENGTH = 8;

/* Full module list from the portal's nav (Er in the built bundle), each
 * tagged with its section. Kept in sync manually — if a module is added to
 * the portal nav, it needs adding here too, or new staff will simply not
 * get a row for it (which the portal treats as "not granted" once any row
 * exists for them, so an out-of-sync list fails closed rather than open). */
const ALL_MODULES = [
  { module: 'onboarding', section: 'Client Management' },
  { module: 'clients',    section: 'Client Management' },
  { module: 'kyc',        section: 'Client Management' },
  { module: 'proposals',  section: 'AI Tools' },
  { module: 'documents',  section: 'AI Tools' },
  { module: 'comms',      section: 'AI Tools' },
  { module: 'compliance', section: 'Compliance' },
  { module: 'regulatory', section: 'Compliance' },
  { module: 'invoices',   section: 'Finance' },
  { module: 'messages',   section: 'Communications' },
  { module: 'engagement', section: 'Communications' },
  { module: 'users',      section: 'System' },
  { module: 'security',   section: 'System' },
  { module: 'audit',      section: 'System' },
  { module: 'checklist',  section: 'Programme' },
];

/* Sections every new staff account is denied by default. Admins can still
 * grant them back per-person from the portal's "Manage Permissions" modal. */
const STAFF_DEFAULT_DENIED_SECTIONS = ['System', 'Programme'];

let _admin;
/** Service-role client. Returns null when the key isn't configured, so
 *  callers can fail with a clear message instead of a crash. */
function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  if (!_admin) {
    _admin = createClient(SUPABASE_URL, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

export function adminApiConfigured() {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/** Thrown for anything the caller could fix (bad input, not an admin, etc).
 *  Carries an HTTP status so the route handler doesn't have to guess. */
export class AdminApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Verifies the bearer token belongs to a signed-in admin.
 *
 *  The token is validated by Supabase itself (via the anon client, which is
 *  all that's needed to resolve a JWT to a user), and then the role is read
 *  from the profiles table rather than trusted from the token's metadata —
 *  user_metadata is self-editable, so it can't be the source of truth for
 *  "is this person an admin". Returns the caller's profile. */
export async function requireAdmin(authHeader) {
  const token = /^Bearer\s+(.+)$/i.exec(authHeader || '')?.[1];
  if (!token) throw new AdminApiError(401, 'Not signed in.');

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await anon.auth.getUser(token);
  if (userErr || !userData?.user) throw new AdminApiError(401, 'Session expired — please sign in again.');

  const admin = adminClient();
  if (!admin) throw new AdminApiError(503, 'User administration is not configured on the server.');

  const { data: profile, error: profErr } = await admin
    .from('profiles').select('id,email,full_name,role').eq('id', userData.user.id).single();
  if (profErr || !profile) throw new AdminApiError(403, 'No profile found for this account.');
  if (profile.role !== 'admin') throw new AdminApiError(403, 'Only administrators can manage users.');
  return profile;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new AdminApiError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
}

/** Creates an auth user with the password already set, plus the matching
 *  profiles row.
 *
 *  email_confirm:true marks the address as verified so the account is usable
 *  immediately — without it Supabase would hold the login until the person
 *  clicked a confirmation link, which is exactly the invite flow we're
 *  avoiding here. No email is sent by this call. */
export async function createUserWithPassword({ email, password, full_name, role, department }) {
  const admin = adminClient();
  if (!admin) throw new AdminApiError(503, 'User administration is not configured on the server.');

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AdminApiError(400, 'A valid email address is required.');
  if (!full_name || !full_name.trim()) throw new AdminApiError(400, 'Full name is required.');
  const allowed = ['admin', 'staff', 'client'];
  if (!allowed.includes(role)) throw new AdminApiError(400, `Role must be one of: ${allowed.join(', ')}.`);
  validatePassword(password);

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name.trim() },
  });
  if (error) {
    /* Supabase surfaces a duplicate address as a 422; translate it into
       something a staff member reading the portal can act on. */
    const dup = /already|exists|registered/i.test(error.message || '');
    throw new AdminApiError(dup ? 409 : 400, dup ? 'An account with that email already exists.' : error.message);
  }

  const userId = data.user.id;

  /* A trigger may already have inserted a profiles row for the new auth
     user, so upsert rather than insert — and if this step fails we remove
     the auth user again, otherwise there'd be a login with no profile,
     which the portal treats as a broken account. */
  const { error: profErr } = await admin.from('profiles').upsert({
    id: userId,
    email,
    full_name: full_name.trim(),
    role,
    department: department || null,
    is_active: true,
  }, { onConflict: 'id' });

  if (profErr) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    throw new AdminApiError(500, 'Could not create the user profile: ' + profErr.message);
  }

  /* New staff accounts start locked out of System and Programme (matches the
   * standing policy applied to existing staff). This is best-effort: the
   * account is already fully created at this point, and a permissions-row
   * failure shouldn't undo that — it would just mean this one person
   * defaults to full access until an admin opens Manage Permissions for
   * them, same as before this existed. */
  let permissionsWarning = null;
  if (role === 'staff') {
    const rows = ALL_MODULES.map(({ module, section }) => ({
      staff_id: userId,
      module,
      granted: !STAFF_DEFAULT_DENIED_SECTIONS.includes(section),
    }));
    const { error: permErr } = await admin
      .from('staff_permissions')
      .upsert(rows, { onConflict: 'staff_id,module' });
    if (permErr) permissionsWarning = 'Account created, but default module permissions could not be set: ' + permErr.message;
  }

  return { id: userId, email, full_name: full_name.trim(), role, department: department || null, permissionsWarning };
}

/** Sets an existing user's password directly. Used for "reset this person's
 *  password" without sending them a reset email. */
export async function setUserPassword({ user_id, password }) {
  const admin = adminClient();
  if (!admin) throw new AdminApiError(503, 'User administration is not configured on the server.');
  if (!user_id) throw new AdminApiError(400, 'A user id is required.');
  validatePassword(password);

  const { error } = await admin.auth.admin.updateUserById(user_id, { password });
  if (error) throw new AdminApiError(400, error.message);
  return { id: user_id };
}

/** Best-effort audit trail entry, using the same table the portal writes to.
 *  Never throws — a failure to log must not undo a successful change. */
export async function logAdminUserAction(actorProfile, action, details) {
  const admin = adminClient();
  if (!admin) return;
  try {
    await admin.from('audit_logs').insert({
      user_id: actorProfile.id,
      action,
      module: 'user_management',
      details,
    });
  } catch {
    /* ignore */
  }
}
