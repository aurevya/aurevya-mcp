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

### 4. Redeploying after a code change

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

**Proposals** (no Supabase needed)
- `quote_proposal` — instant fee quote for any AC/GBC/none × Trust × CIS combination, or MFO / Fund Luxembourg / Accounting-only.
- `create_proposal` — generates the full HTML + PDF proposal, saved to `Generated Proposals/<client name>/`.
- `list_generated_proposals` — what's been generated recently.

**Clients & entities** — `list_clients`, `get_client`, `list_entities`.

**Invoices** — `list_invoices`, `create_invoice`, `mark_invoice_paid` (record-only — never touches real money or payment rails).

**Compliance & KYC** — `list_compliance_deadlines`, `list_kyc_checks`.

**Documents & messages** — `list_documents`, `list_conversations`, `get_conversation_messages`, `send_message` (Claude always confirms exact wording before sending).

**Daily overview** — `daily_briefing` — outstanding/overdue invoices, pending KYC, deadlines due in 14 days, recent conversations, one call.

## Security notes

- **No shared secrets.** Every query runs *as the signed-in staff member*, using the same Supabase row-level-security policies the portal enforces (see `../supabase_schema.sql`). There is no service-role key anywhere in this server, hosted or local.
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

To add a tool, add an entry to the `TOOLS` array and a matching branch in
`handle()` in `index.js` — the existing tools are good templates.
