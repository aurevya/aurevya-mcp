import fs from 'fs';
import os from 'os';
import path from 'path';

/* Each staff member's login session lives only on their own machine, in
   their own home directory — never in this repo, never shared between
   staff. Logging out (or never logging in) means the tools simply refuse
   to run; nothing here bypasses Supabase's own row-level security. */
const SESSION_DIR = path.join(os.homedir(), '.aurevya-mcp');
const SESSION_FILE = path.join(SESSION_DIR, 'session.json');

export function saveSession(data) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function loadSession() {
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  } catch {
    return null;
  }
}

export function clearSession() {
  try { fs.unlinkSync(SESSION_FILE); } catch { /* already gone */ }
}
