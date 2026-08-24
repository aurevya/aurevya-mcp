#!/usr/bin/env python3
"""
Aurevya Portal — wire the new Proposal Generator into the "AI Tools" sidebar
=============================================================================

What this does
---------------
The portal's "Proposal Generator" nav item currently opens a 3-step AI
wizard built into the React bundle. This script points that same nav item
at the new template-based generator instead, and packages everything into
a ready-to-deploy zip.

It does this WITHOUT touching your React source (which is out of sync with
the live site anyway) — it patches the deployed, compiled bundle directly,
the same way every other fix in this project has been shipped.

VERSION 2 — plain link instead of iframe
-----------------------------------------
The first version of this script embedded the new generator in an <iframe>
on the /admin/proposals route. That render blank: the whole site sends
`X-Frame-Options: DENY` on every page (confirmed on /, /prequal.html,
/logo.png, and the generator's own URL), which blocks a page from framing
ANY other page — including itself — and a `_headers` file exception did
not override it (most likely a platform-level or `netlify.toml force=true`
rule that `_headers` cannot beat).

So this version takes a different, simpler approach that cannot be blocked
by X-Frame-Options at all: the sidebar's "Proposal Generator" item becomes
a plain link that opens the generator in a **new browser tab**, instead of
being routed through React Router into an iframe. No framing occurs, so
there is nothing for X-Frame-Options to block.

Concretely, it:
  1. Opens your last-deployed dist zip without fully unzipping it —
     Python's zipfile module reads/writes zip entries in place.
  2. Finds the sidebar's "Proposal Generator" nav link in
     assets/index-Aurevya127.js and replaces it with a plain
     `<a href="/proposal-generator/proposal-generator.html" target="_blank">`
     — opens in a new tab, same icon and label, same position in the menu.
  3. Reverts the /admin/proposals route back to the original wizard
     component (undoing the earlier iframe experiment), so that route
     shows something sensible if anyone links to it directly.
  4. Copies proposal-generator.html and everything in assets/ into a new
     `proposal-generator/` folder inside the deployed site, so the new
     link has something to open.
  5. Writes the result as a new zip, ready to drag onto Netlify.

Nothing else in the bundle is touched. The old wizard component is left
in place (just no longer linked from the menu) — if anything looks wrong,
redeploying the previous zip instantly reverts this change.

RUN
---
    python deploy-to-portal.py

or double-click DOUBLE-CLICK-TO-DEPLOY-PROPOSAL-GENERATOR.bat
"""

import re
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent          # .../proposal-generator
ROOT = HERE.parent                                # .../AWL AI Automation

_DIST_RE = re.compile(r"^aurevya-dist(\d+)\.zip$", re.IGNORECASE)


def latest_dist_zip():
    """Pick the highest-numbered aurevya-distNNN.zip — i.e. whatever was
    deployed most recently. Building on top of that (rather than a fixed
    filename) means re-running this script after later changes always
    patches the current state instead of reverting to an old one."""
    candidates = []
    for p in ROOT.glob("aurevya-dist*.zip"):
        m = _DIST_RE.match(p.name)
        if m:
            candidates.append((int(m.group(1)), p))
    if not candidates:
        return None
    candidates.sort(key=lambda t: t[0])
    return candidates[-1]


_latest = latest_dist_zip()
if _latest is None:
    sys.exit(
        "No aurevya-distNNN.zip files found in the AWL AI Automation folder.\n"
        "Deploy at least once first so there's something to build on."
    )
_latest_num, SOURCE_ZIP = _latest
OUTPUT_ZIP = ROOT / f"aurevya-dist{_latest_num + 1}.zip"

# The path inside the zip to the compiled bundle. If a newer dist zip is
# used and the hashed filename has changed, adjust this — or just tell
# Claude and it'll be fixed in five seconds.
BUNDLE_PATH = "dist132/assets/index-Aurevya127.js"

# ── 1. The sidebar nav link ──────────────────────────────────────────────
# Confirmed against the live bundle on 2026-08-13 (956,605 bytes). This is
# the exact JSX for the "Proposal Generator" item under the "AI Tools"
# section: a React Router <Link to="/admin/proposals"> with icon W_.
NAV_OLD = (
    'u("proposals")&&n.jsxs(Ee,{to:"/admin/proposals",'
    'className:({isActive:g})=>`nav-item${g?" active":""}`,'
    'children:[n.jsx(W_,{size:16})," Proposal Generator"]})'
)
# Swapped for a plain anchor tag that opens the generator in a new tab.
# This structurally cannot be blocked by X-Frame-Options, since no framing
# happens — the browser just navigates a new tab to the URL directly.
NAV_NEW = (
    'u("proposals")&&n.jsxs("a",{href:"/proposal-generator/proposal-generator.html",'
    'target:"_blank",rel:"noopener",className:"nav-item",'
    'children:[n.jsx(W_,{size:16})," Proposal Generator"]})'
)

# ── 2. The /admin/proposals route ────────────────────────────────────────
# An earlier version of this script pointed this route at an <iframe> of
# the new generator. That approach is abandoned (see module docstring), so
# this reverts the route back to the original wizard component. If the
# route is still in its very first, never-patched state, this is a no-op.
ROUTE_IFRAME = (
    'path:"proposals",element:n.jsx("iframe",{'
    'src:"/proposal-generator/proposal-generator.html",'
    'title:"Proposal Generator",'
    'style:{width:"100%",height:"100%",border:"none",display:"block"}'
    '})'
)
ROUTE_ORIGINAL = 'path:"proposals",element:n.jsx(RS,{})'

# Files from this folder that get copied into the deploy.
# (skip the deploy scripts themselves and the raw/ extraction scratch space)
INCLUDE_EXTS = {".html", ".png", ".json", ".md"}
SKIP_DIRS = {"raw"}

# ── 3. Favicon ───────────────────────────────────────────────────────────
# The deployed zip still carries the placeholder favicon.svg (a gold "A" on
# a navy plate) that shipped with the original Vite scaffold. These replace
# it with the real Aurevya monogram, and the <link> tags in index.html are
# repointed to match. The .ico holds 16/32/48 renders, each downsampled from
# its own high-resolution draw — the vine is hairline-thin, and one image
# scaled down by the browser loses the strokes entirely.
#
# Source files live in this folder's assets/, so they travel with the
# generator and there is nothing extra to remember to copy.
FAVICON_FILES = ["favicon.ico", "favicon.png", "apple-touch-icon.png"]

# ── 4. Public forms ──────────────────────────────────────────────────────
# The unauthenticated pages — the two KYC upload links, the UBO declaration
# and the pre-qualification questionnaire — are served as standalone HTML
# from the site root, not through the React bundle, along with the
# _redirects that route to them.
#
# They live outside the bundle because the portal's React source has drifted
# a long way from what is deployed (the live build has fourteen routes the
# source has never had) and can no longer rebuild it. Keeping the public
# forms as plain files means they can be changed, reviewed and tested
# without touching the bundle at all — and a form open to the whole internet
# is better off outside the staff application regardless.
#
# Each one talks to the database only through the token-scoped RPCs in
# rls-token-rpcs.sql. Deploy this at the same time as running that script:
# the pages need the functions, and the functions are what let the old
# blanket-read policies be dropped.
# ── 5. Staff landing on the client portal ────────────────────────────────
# The auth provider sets `user` synchronously but fetches `profile` over the
# network, and it clears `loading` independently of that fetch:
#
#   getSession().then(({data:{session}}) => {
#       setUser(session?.user ?? null);
#       session?.user ? loadProfile(session.user.id) : setLoading(false);
#   });
#   onAuthStateChange((evt, sess) => {
#       setUser(sess?.user ?? null);
#       sess?.user ? loadProfile(sess.user.id) : (setProfile(null), setLoading(false));
#   });
#
# So on a browser that arrives with no session, loading goes false first.
# The person then signs in, `user` is set immediately, and the profiles fetch
# is still in flight — a window in which the app has a signed-in user, no
# profile, and loading === false.
#
# Both routing decisions read the role straight off that missing profile and
# treat "no profile yet" as "not staff":
#
#   root:  role === 'admin' || role === 'staff' ? /admin/dashboard
#                                               : /portal/dashboard
#   guard: requireAdmin && role !== 'admin' && role !== 'staff' -> /portal/dashboard
#
# so a staff member is sent to /portal/dashboard a fraction of a second
# before their role arrives. And it sticks, because /portal has no role check
# of its own — nothing sends them back once the profile finally loads.
#
# The fix treats a signed-in user with no profile as still loading, which is
# what it is. Verified against the transcribed decision logic: in that window
# the old code answers /portal/dashboard and the new one waits, and once the
# profile lands both answer /admin/dashboard.
#
# This does not touch the role checks themselves — only when they are allowed
# to run.
LANDING_OLD_ROOT = (
    'function Fk(){const{user:e,profile:t,loading:r}=Ae();return r?null:e?'
)
LANDING_NEW_ROOT = (
    'function Fk(){const{user:e,profile:t,loading:r}=Ae();return r||e&&!t?null:e?'
)
LANDING_OLD_GUARD = (
    'function ff({children:e,requireAdmin:t}){const{user:r,profile:s,loading:i}=Ae();return i?'
)
LANDING_NEW_GUARD = (
    'function ff({children:e,requireAdmin:t}){const{user:r,profile:s,loading:i}=Ae();return i||r&&!s?'
)

PUBLIC_DIR = ROOT / "portal-public"
PUBLIC_FILES = [
    "kyc-upload.html",
    "kyc-upload-party.html",
    "ubo-declaration-form.html",
    "prequal.html",
    "_redirects",
]
FAVICON_OLD_LINK = '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />'
FAVICON_NEW_LINK = (
    '<link rel="icon" href="/favicon.ico" sizes="any" />\n'
    '    <link rel="icon" type="image/png" href="/favicon.png" sizes="512x512" />\n'
    '    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />'
)


def main():
    print(f"Latest deploy found: {SOURCE_ZIP.name}")
    print(f"Building on top of it as: {OUTPUT_ZIP.name}")
    print(f"Reading {SOURCE_ZIP.name} ...")
    with zipfile.ZipFile(SOURCE_ZIP, "r") as zin:
        names = zin.namelist()
        if BUNDLE_PATH not in names:
            sys.exit(
                f"Could not find {BUNDLE_PATH} inside {SOURCE_ZIP.name}.\n"
                "The bundle filename may have changed since this script was "
                "written — tell Claude the new hashed filename (visible in "
                "the zip under dist132/assets/) and it'll be one-line fix."
            )

        bundle = zin.read(BUNDLE_PATH).decode("utf-8")
        patched = bundle

        # -- nav link: Link-into-iframe  ->  plain new-tab anchor --------
        if NAV_NEW in patched:
            print("  nav link already patched (new-tab link already wired up) — skipping")
        else:
            count = patched.count(NAV_OLD)
            if count == 0:
                sys.exit(
                    "Could not find the 'Proposal Generator' nav link in the "
                    "bundle (neither old nor new form). The bundle was likely "
                    "rebuilt since this script was written. Nothing has been "
                    "changed. Tell Claude and it will re-derive the correct "
                    "string from the live site."
                )
            if count > 1:
                sys.exit(
                    f"The nav link appears {count} times (expected exactly 1) "
                    "— refusing to patch automatically. Tell Claude."
                )
            patched = patched.replace(NAV_OLD, NAV_NEW)
            print("  nav link patched: 'Proposal Generator' now opens the new tool in a new tab")

        # -- route: revert the earlier iframe experiment back to original --
        if ROUTE_IFRAME in patched:
            patched = patched.replace(ROUTE_IFRAME, ROUTE_ORIGINAL)
            print("  route reverted: /admin/proposals shows the original wizard again")
        elif ROUTE_ORIGINAL in patched:
            print("  route already original — nothing to revert")
        else:
            print("  route: neither iframe nor original form found — leaving untouched")

        # -- staff landing: wait for the profile before deciding a route --
        for label, old, new in (
            ("root redirect", LANDING_OLD_ROOT, LANDING_NEW_ROOT),
            ("route guard",   LANDING_OLD_GUARD, LANDING_NEW_GUARD),
        ):
            if new in patched:
                print(f"  staff landing: {label} already patched — skipping")
            elif patched.count(old) == 1:
                patched = patched.replace(old, new)
                print(f"  staff landing: {label} now waits for the profile to load")
            elif patched.count(old) == 0:
                sys.exit(
                    f"Could not find the {label} in the bundle, in either form. "
                    "It was rebuilt since this script was written. Nothing has "
                    "been changed."
                )
            else:
                sys.exit(
                    f"The {label} appears {patched.count(old)} times (expected 1) "
                    "— refusing to patch automatically."
                )

        # -- favicon: point index.html at the real monogram ---------------
        # Derive the zip's top-level folder from the bundle path rather than
        # hardcoding it, so this keeps working if the dist folder is renamed.
        root = BUNDLE_PATH.split("/")[0]
        index_path = f"{root}/index.html"
        index_html = None
        if index_path in names:
            index_html = zin.read(index_path).decode("utf-8")
            if FAVICON_NEW_LINK.splitlines()[0] in index_html:
                print("  favicon already wired up in index.html — skipping")
            elif FAVICON_OLD_LINK in index_html:
                index_html = index_html.replace(FAVICON_OLD_LINK, FAVICON_NEW_LINK)
                print("  favicon: index.html repointed from the placeholder to the monogram")
            else:
                print("  favicon: no recognised <link rel=icon> in index.html — left untouched")
                index_html = None
        else:
            print(f"  favicon: {index_path} not in the zip — skipping")

        missing_icons = [f for f in FAVICON_FILES if not (HERE / "assets" / f).exists()]
        if missing_icons:
            print("  favicon: missing from assets/ — " + ", ".join(missing_icons))

        # Work out what this run will write from disk, so those entries can
        # be skipped when copying the source zip across. Without this, every
        # re-run appends a second copy of each generator file and each icon
        # under a name already in the archive — the zip still works (readers
        # take the first match) but it grows on every deploy and hides the
        # fact that the older copy is the one being served.
        from_disk = {}
        for path in HERE.rglob("*"):
            if path.is_dir():
                continue
            rel = path.relative_to(HERE)
            if any(part in SKIP_DIRS for part in rel.parts):
                continue
            if path.suffix.lower() not in INCLUDE_EXTS:
                continue
            from_disk[f"{root}/proposal-generator/{rel.as_posix()}"] = path
        for name in FAVICON_FILES:
            src = HERE / "assets" / name
            if src.exists():
                from_disk[f"{root}/{name}"] = src

        missing_public = []
        for name in PUBLIC_FILES:
            src = PUBLIC_DIR / name
            if src.exists():
                from_disk[f"{root}/{name}"] = src
            else:
                missing_public.append(name)
        if missing_public:
            # Loud, because a half-deployed set is worse than none: the
            # _redirects could point at a page that isn't there.
            sys.exit(
                "portal-public/ is missing: " + ", ".join(missing_public) +
                "\nNothing has been written. These files and the RPCs in "
                "rls-token-rpcs.sql have to ship together."
            )
        print(f"  public forms: {len(PUBLIC_FILES)} file(s) from portal-public/")

        print(f"Writing {OUTPUT_ZIP.name} ...")
        with zipfile.ZipFile(OUTPUT_ZIP, "w", zipfile.ZIP_DEFLATED) as zout:
            # copy everything from the source zip, substituting the patched
            # bundle and (if it was rewritten) index.html, and leaving out
            # anything about to be written fresh from disk
            replaced = 0
            for item in zin.infolist():
                if item.filename in from_disk:
                    replaced += 1
                    continue
                if item.filename == BUNDLE_PATH:
                    data = patched.encode("utf-8")
                elif index_html is not None and item.filename == index_path:
                    data = index_html.encode("utf-8")
                else:
                    data = zin.read(item.filename)
                zout.writestr(item, data)

            for arcname, path in from_disk.items():
                zout.write(path, arcname)
            added = len(from_disk)

    print(f"  {added} files written from disk ({replaced} refreshed in place)")
    print(f"\nDone: {OUTPUT_ZIP}")
    print("Drag this zip onto your Netlify site to deploy.")


if __name__ == "__main__":
    main()
