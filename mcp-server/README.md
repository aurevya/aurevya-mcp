# Aurevya MCP — talk to the portal from Claude, no browser required

This is an MCP ("Model Context Protocol") server. Once it's reachable —
either hosted on Railway (recommended, one URL for everyone) or running
locally on one person's machine — staff can just type things like:

> "Create a GBC + Trust proposal for Mr. Peter Nguyen"
> "Any invoices overdue right now?"
> "What's on my plate today?"
> "Show me pending KYC screenings"

...and Claude answers directly, using their own portal login, without
opening a browser tab.

It talks to the same Supabase project the portal itself uses, and drives
the actual `proposal-generator.html` (headlessly) for proposal creation —
so the numbers, wording, and formatting are always identical to what the
portal and the Proposal Generator would produce by hand.

It runs in **two modes from the same code**, auto-selected: set a `PORT`
environment variable (Railway does this for you) and it runs as an HTTP
server; leave `PORT` unset and it runs as a local stdio process, the way
it did before.

---

## Option A — Hosted on Railway (recommended)

One deployment, one URL, every staff member just adds that URL to their
own Claude Desktop config. No `npm install`, no per-machine setup, no
Chromium download on anyone's laptop.

### 1. Get the code into a GitHub repo

Railway deploys from a GitHub repo. This server needs its sibling
`proposal-generator/` folder alongside it (that's the file it automates
for `create_proposal`/`quote_proposal`), so the repo needs **both**
folders, not just `mcp-server/`.

In a terminal, from inside `C:\Aurevya Portal\AWL AI Automation`:

```bash
git init
git add mcp-server proposal-generator
git commit -m "Aurevya MCP server"
```

Then create a new **empty, private** repository on GitHub (github.com →
New repository — don't initialize it with a README), and push:

```bash
git remote add origin https://github.com/<your-org>/aurevya-mcp.git
git branch -M main
git push -u origin main
```

(If `git` isn't installed, grab it from git-scm.com first.)

### 2. Create the Railway service

In the Railway dashboard (you're already logged in):

1. **New Project → Deploy from GitHub repo** → pick the repo you just pushed.
2. Once the service is created, open its **Settings** tab:
   - **Root Directory**: leave blank (it should build from the repo root, since the Dockerfile needs both `mcp-server/` and `proposal-generator/`).
   - **Builder**: switch to **Dockerfile** if it isn't auto-detected.
   - **Dockerfile Path**: `mcp-server/Dockerfile`.
3. Railway auto-assigns a `PORT` env var — you don't need to set one yourself; the server picks it up automatically and switches into HTTP mode.
4. Click **Deploy**. First build takes a few minutes (it's installing Chromium's system libraries + Puppeteer).
5. Once it's live, go to **Settings → Networking** and click **Generate Domain** to get a public URL, something like `https://aurevya-mcp-production.up.railway.app`.

### 3. Point Claude Desktop at it (per staff member)

Each person adds this to their `claude_desktop_config.json`
(`%APPDATA%\Claude\claude_desktop_config.json` on Windows), alongside any
other `mcpServers` entries already there:

```json
{
  "mcpServers": {
    "aurevya": {
      "type": "http",
      "url": "https://YOUR-RAILWAY-URL.up.railway.app/mcp"
    }
  }
}
```

Restart Claude Desktop, then in a new chat, sign in **without ever typing
your password into Claude**:

1. Open `https://YOUR-RAILWAY-URL.up.railway.app/login` in a normal
   browser tab and sign in with your usual staff portal email/password —
   this is a plain login page, nothing to do with Claude at that point.
2. It shows you a 6-character code.
3. Back in Claude, say: *"Link my Aurevya account with code ABC123"*
   (calls the `aurevya_link` tool, which takes only that code).

Claude never sees, stores, or is asked for a raw password this way —
which matters because some Claude clients correctly *refuse* to call a
tool that takes a password parameter directly (that's expected safety
behavior, not a bug to work around). The old direct `aurevya_login(email,
password)` tool still exists as a fallback for local/stdio setups, but
`aurevya_link` is the one to use whenever this server is reachable over
HTTP.

**Note on sessions in hosted mode:** each Claude Desktop connection gets
its own private session on the server, so logins never cross between
staff even though everyone's hitting the same URL. Sessions are kept in
memory (and mirrored to disk where possible) — if Railway restarts the
service (a redeploy, a crash, scaling to zero on the free tier), everyone
signed in at that moment will just need to run the login line again. This
is a known trade-off for v1, not a bug.

### 4. Making proposal download links permanent (recommended)

By default, `create_proposal` links point at a PDF sitting on this
container's local disk — which Railway wipes on every redeploy/restart, so
those links also stop working after ~1 hour or the next `git push`,
whichever comes first. To make them permanent instead, generated PDFs can
be saved to Supabase Storage (the same Supabase project the portal already
uses), which survives redeploys indefinitely:

1. In the Supabase dashboard for this project, go to **Settings → API** and
   copy the **`service_role`** secret key (not the `anon` key — this one
   bypasses row-level security, which is exactly why it's only ever used
   here for Storage file uploads, never for any database query. See the
   comment at the top of `lib/proposalStorage.js`).
2. In Railway, open this service's **Variables** tab and add a new
   variable named `SUPABASE_SERVICE_ROLE_KEY`, pasting that key as the
   value. **Paste it directly into Railway's own field — never into a
   Claude chat.**
3. Redeploy (Railway does this automatically after a variable change). The
   server creates a `proposals` storage bucket on startup if one doesn't
   already exist.

Once this is set, `create_proposal` and `list_generated_proposals` both
return links that never expire and survive every future redeploy. Without
it, everything still works exactly as before (1-hour links, reset on every
redeploy) — this step is optional, not required to use the server.

### 5. Redeploying after a code change

Any time this folder or `proposal-generator/` changes:
```bash
git add -A
git commit -m "update"
git push
```
Railway redeploys automatically on push.

---

## Option B — Local (one person, one machine)

Still works exactly as before, no Railway needed:

1. `cd "C:\Aurevya Portal\AWL AI Automation\mcp-server"` then `npm install`.
2. Add to `claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "aurevya": {
         "command": "node",
         "args": ["C:\\Aurevya Portal\\AWL AI Automation\\mcp-server\\index.js"]
       }
     }
   }
   ```
3. Restart Claude Desktop, log in with `aurevya_login`.

This copy needs to be repeated on every machine that wants to use it
locally — see Option A if you want one shared URL instead.

## What it can do

**Proposals**
- `quote_proposal` — instant fee quote for any AC/GBC/none × Trust × CIS × Nominee shareholder combination, or MFO / Fund Luxembourg / Accounting-only. No Supabase needed. Claude is instructed to ask about each optional component (Trust, CIS, Nominee shareholder — the latter only relevant for AC) explicitly rather than assume, and the result echoes back a `selections` object so you can confirm nothing was dropped before generating the final PDF.
- `create_proposal` — generates the full HTML + PDF proposal, saved to `Generated Proposals/<client name>/` locally. Also returns `selections` for the same reason — check it matches what the client asked for before sharing the download link. The link is permanent (Supabase Storage) if `SUPABASE_SERVICE_ROLE_KEY` is configured — see step 4 above — otherwise it's a 1-hour link to this container's local disk.
- `list_generated_proposals` — what's been generated recently, each with its own download link (permanent if storage is configured, otherwise 1-hour and limited to what's been generated since the container last restarted).

**Clients & entities** — `list_clients`, `get_client`, `list_entities`.

**Invoices** — `list_invoices`, `create_invoice`, `mark_invoice_paid` (record-only — never touches real money or payment rails).

**Compliance & KYC** — `list_compliance_deadlines`, `list_kyc_checks`.

**Documents & messages** — `list_documents`, `list_conversations`, `get_conversation_messages`, `send_message` (Claude always confirms exact wording before sending).

**Daily overview** — `daily_briefing` — outstanding/overdue invoices, pending KYC, deadlines due in 14 days, recent conversations, one call.

## Security notes

- **No shared secrets for data.** Every query against client/entity/invoice/KYC data runs *as the signed-in staff member*, using the same Supabase row-level-security policies the portal enforces (see `../supabase_schema.sql`). The optional `SUPABASE_SERVICE_ROLE_KEY` (see step 4 above) is the one exception, and it's scoped narrowly — used only in `lib/proposalStorage.js`, only for Storage file uploads, never for a database query.
- **Proposal PDFs in permanent storage are public-by-obscurity, not private.** The `proposals` Storage bucket is created as public so download links work with no login/token — the same trade-off the old 1-hour token links already made, just without an expiry. Anyone who obtains a link can open that one PDF; the path isn't guessable, but if a link leaks, that specific proposal is exposed. Don't rely on this bucket for anything more sensitive than what already goes into a client proposal.
- **Client accounts are rejected.** `aurevya_login` checks the signed-in user's `role` and refuses `role = 'client'` — staff/admin only.
- **Every write is logged** to the portal's own `audit_logs` table — one unified trail regardless of whether the action came from the browser, a local install, or the hosted server.
- **Nothing here executes a real payment.** `mark_invoice_paid` only flips an internal status field.
- **In hosted mode, treat the Railway URL like a login page**, not a public link — anyone with the URL can attempt `aurevya_login`, and Supabase's own auth rate-limiting/lockouts are what stop brute-forcing, the same as the portal's own login page. If you want an extra layer, Railway supports adding basic auth or an allowlist in front of the service.

## Extending it

Everything lives in a few small files:
- `index.js` — the tool catalogue + request handlers + the HTTP/stdio entry point.
- `lib/supabaseClient.js` — auth/session handling.
- `lib/sessionStore.js` — where per-connection sessions are kept.
- `lib/proposal.js` — the headless-browser automation of `proposal-generator.html`.
- `lib/proposalStorage.js` — optional permanent Storage upload/listing for generated PDFs (needs `SUPABASE_SERVICE_ROLE_KEY`).

To add a tool, add an entry to the `TOOLS` array and a matching branch in
`handle()` in `index.js` — the existing tools are good templates.
