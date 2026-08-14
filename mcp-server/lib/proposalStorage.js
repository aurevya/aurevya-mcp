import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from './supabaseClient.js';

/* Permanent proposal storage, separate from every other Supabase access in
   this server. Every other file (supabaseClient.js) deliberately uses only
   the public anon key, so every query runs AS the signed-in staff member
   and is bound by the portal's own row-level-security policies — there is
   no service-role key anywhere near client/entity/invoice/KYC data.

   Proposal PDFs are different: they're files, not rows, and staff need a
   link that still works after the next redeploy — Railway's container disk
   is wiped every time this server restarts, so anything saved only to
   local disk (the old behaviour) was never going to survive that. Supabase
   Storage is the fix, but creating a bucket and writing to it as a plain
   "file" (not tied to any one staff member's RLS-scoped session) needs
   elevated privileges — hence a service-role key, used ONLY in this file,
   ONLY for Storage calls, never for a database query.

   This key is optional. If SUPABASE_SERVICE_ROLE_KEY isn't set (e.g. it
   hasn't been added to Railway yet), every function below is a no-op that
   returns null, and index.js falls back to the previous local-disk +
   1-hour-link behaviour rather than failing outright. */

const BUCKET = 'proposals';

let _client;
function client() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  if (!_client) {
    _client = createClient(SUPABASE_URL, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}

export function storageConfigured() {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/** Called once at server startup. Creates the "proposals" bucket if it
 *  doesn't exist yet, as public (so getPublicUrl() links work with no
 *  token/expiry — the same "unguessable path, not truly secret" trade-off
 *  the old 1-hour token links already made, just permanent now instead of
 *  timing out). Never throws — a failure here just means storage stays
 *  unavailable and the old fallback behaviour kicks in. */
export async function ensureProposalsBucket() {
  const c = client();
  if (!c) return;
  try {
    const { data, error } = await c.storage.listBuckets();
    if (error) throw error;
    if (!data?.some((b) => b.name === BUCKET)) {
      const { error: createErr } = await c.storage.createBucket(BUCKET, { public: true });
      if (createErr) throw createErr;
      console.error('[aurevya-mcp] created Supabase Storage bucket "proposals"');
    }
  } catch (e) {
    console.error('[aurevya-mcp] could not ensure "proposals" storage bucket exists:', e.message || e);
  }
}

/** Uploads a locally-generated PDF to permanent storage and returns a
 *  public URL that does not expire. Returns null if storage isn't
 *  configured (see storageConfigured() above) rather than throwing, so
 *  callers can fall back gracefully. */
export async function uploadProposal(localPdfPath, clientSlug, pdfFilename) {
  const c = client();
  if (!c) return null;
  const objectPath = `${clientSlug}/${pdfFilename}`;
  const bytes = fs.readFileSync(localPdfPath);
  const { error } = await c.storage.from(BUCKET).upload(objectPath, bytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (error) throw new Error('Could not save proposal to permanent storage: ' + error.message);
  const { data } = c.storage.from(BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

/** Lists proposals from permanent storage (survives redeploys), most
 *  recently modified first. Returns null (not []) if storage isn't
 *  configured, so callers know to fall back to the local-disk listing
 *  instead of reporting "no proposals found" incorrectly. */
export async function listStoredProposals(limit = 20) {
  const c = client();
  if (!c) return null;
  const { data: top, error } = await c.storage.from(BUCKET).list('', { limit: 1000 });
  if (error) throw new Error(error.message);
  const all = [];
  for (const entry of top || []) {
    if (entry.id !== null) continue; // a file sitting directly at bucket root — not one of ours, skip
    const { data: inner, error: innerErr } = await c.storage.from(BUCKET).list(entry.name, { limit: 500 });
    if (innerErr) continue;
    for (const f of inner || []) {
      if (!f.name.toLowerCase().endsWith('.pdf')) continue;
      const objectPath = `${entry.name}/${f.name}`;
      const { data: pub } = c.storage.from(BUCKET).getPublicUrl(objectPath);
      all.push({
        client: entry.name,
        file: f.name,
        modified: f.updated_at || f.created_at || null,
        downloadUrl: pub.publicUrl,
      });
    }
  }
  all.sort((a, b) => new Date(b.modified || 0) - new Date(a.modified || 0));
  return all.slice(0, limit);
}
