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

        print(f"Writing {OUTPUT_ZIP.name} ...")
        with zipfile.ZipFile(OUTPUT_ZIP, "w", zipfile.ZIP_DEFLATED) as zout:
            # copy everything from the source zip, substituting the patched bundle
            for item in zin.infolist():
                if item.filename == BUNDLE_PATH:
                    data = patched.encode("utf-8")
                else:
                    data = zin.read(item.filename)
                zout.writestr(item, data)

            # add the new generator + its assets under dist132/proposal-generator/
            added = 0
            for path in HERE.rglob("*"):
                if path.is_dir():
                    continue
                if any(part in SKIP_DIRS for part in path.relative_to(HERE).parts):
                    continue
                if path.suffix.lower() not in INCLUDE_EXTS:
                    continue
                rel = path.relative_to(HERE)
                arcname = f"dist132/proposal-generator/{rel.as_posix()}"
                zout.write(path, arcname)
                added += 1

    print(f"  {added} generator files added under proposal-generator/")
    print(f"\nDone: {OUTPUT_ZIP}")
    print("Drag this zip onto your Netlify site to deploy.")


if __name__ == "__main__":
    main()
