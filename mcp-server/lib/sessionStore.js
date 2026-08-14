import fs from 'fs';
import path from 'path';

/* Local (stdio) mode ties one Claude Desktop instance to one OS user, so a
   single cached session used to be enough. Hosted (HTTP) mode is one
   server shared by every staff member at once, so sessions are now keyed
   by MCP session id (one per Claude connection) instead of being global.
   Kept in memory for speed, mirrored to disk so a server restart doesn't
   force everyone to log in again — though on hosts with ephemeral disks
   (e.g. a fresh Railway deploy) that mirror won't survive either, and
   staff will just need to run aurevya_login again. Nothing sensitive
   beyond a short-lived Supabase refresh token is stored either way. */
const STORE_FILE = path.join(process.cwd(), '.data', 'sessions.json');

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch {
    cache = {};
  }
  return cache;
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(cache, null, 2), { mode: 0o600 });
  } catch (e) {
    // fine on read-only/ephemeral filesystems — in-memory cache still works
    // for the lifetime of this process
    console.error('[aurevya-mcp] could not persist session store:', e.message);
  }
}

export function saveSession(sessionId, data) {
  const store = load();
  store[sessionId] = data;
  persist();
}

export function loadSession(sessionId) {
  return load()[sessionId] || null;
}

export function clearSession(sessionId) {
  const store = load();
  delete store[sessionId];
  persist();
}
