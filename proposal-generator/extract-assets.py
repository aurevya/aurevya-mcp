#!/usr/bin/env python3
"""
Aurevya Proposal Generator — brand asset extractor  (v2)
========================================================

Pulls the photography and graphics out of the sample proposal PDFs and files
them under  proposal-generator/assets/  with the exact names the generator
looks for.

WHAT CHANGED IN v2
------------------
* Transparency is preserved. The leaf-wheel graphics carry a soft mask in the
  PDF; v1 used extract_image() which discards it, so they came out with solid
  black backgrounds. v2 composites the mask back in and writes real PNGs.
* Images are auto-named. You no longer rename anything by hand — the mapping
  table below writes assets/cover-photograph.png, assets/leaf-board.png, etc.
* Anything unrecognised still lands in assets/raw/ so nothing is lost.

RUN
---
    python -m pip install pymupdf
    python extract-assets.py

or double-click  DOUBLE-CLICK-TO-EXTRACT-IMAGES.bat
"""

import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ASSETS = HERE / "assets"
RAW = ASSETS / "raw"

SEARCH_DIRS = [
    HERE.parent / "Sample Proposals",
    HERE.parent,
    Path.home() / "Downloads",
]

# The master lockup (monogram + "aurevya" + "WEALTH"). This is a vector/flat
# logo file, not something embedded in a PDF page, so it's handled separately
# from the PDF image extraction below.
LOGO_CANDIDATES = [
    HERE.parent / "logo.png.png",
    HERE.parent / "logo.png",
]


def copy_master_logo():
    for src in LOGO_CANDIDATES:
        if src.exists():
            dest = ASSETS / "logo-full-color.png"
            shutil.copy2(src, dest)
            print(f"    logo          copied from {src.name}")
            return True
    print("    logo          not found next to this script (looked for logo.png.png, logo.png)")
    return False

DECKS = {
    "ac":         "AWL_PROPOSAL_AC_20260805.pdf",
    "gbc":        "AUREVYA_WEALTH_PROPOSAL_GBC_20260805.pdf",
    "gbc_trust":  "AUREVYA_WEALTH_PROPOSAL_GBC+TRUST_OPTION_A_20260729.pdf",
    "trust_cis":  "AUREVYA_WEALTH_TRUST+GBC+CIS(PCC)_DP_21052026.pdf",
    "mfo":        "20260610_AWL_PROPOSAL_MFO_MB.pdf",
    "fund_lux":   "AUREVYA_FUND_LUXEMBOURG_19052026.pdf",
    "accounting": "AUREVYA_WEALTH_PROPOSAL_ACCOUNTING_SERVICES.pdf",
}

# (deck, page, image-index-on-page) -> slot filename the generator expects.
# Page numbers are 1-based, matching the PDF page order.
SLOTS = {
    # ── Authorised Company deck — the visual master ──────────────
    ("ac",  1, 0): "cover-photograph",        # redwood forest, man at base
    ("ac",  3, 1): "contents-photograph",     # redwood trunks, woman on log
    ("ac",  6, 1): "about-photograph",        # Capital Manor lit at night
    ("ac",  7, 0): "whatwedo-private",        # couple on a yacht
    ("ac",  7, 1): "whatwedo-enterprise",     # boardroom
    ("ac",  7, 2): "whatwedo-institutions",   # exchange facade
    ("ac",  7, 3): "whatwedo-sovereigns",     # flags outside the UN
    ("ac",  7, 4): "whatwedo-extra",
    ("ac",  8, 0): "divider-photograph",      # stone gate, lanterns, night
    ("ac",  9, 1): "structure-portrait",      # bearded man, dark portrait
    ("ac", 11, 1): "keyfeatures-photograph",  # hand stamping a document
    ("ac", 16, 2): "leaf-plain",              # gold vine, no leaf highlighted
    ("ac", 17, 1): "leaf-board",              # Board Services highlighted
    ("ac", 18, 1): "leaf-accounting",
    ("ac", 19, 1): "leaf-legal",
    ("ac", 20, 1): "leaf-compliance",
    ("ac", 21, 1): "leaf-it",
    ("ac", 22, 1): "leaf-concierge",

    # ── GBC deck ─────────────────────────────────────────────────
    ("gbc",  8, 1): "gbc-divider-photograph",  # world map / Mauritius
    ("gbc", 10, 1): "gbc-cityscape",           # night cityscape

    # ── Trust decks ──────────────────────────────────────────────
    ("trust_cis", 18, 1): "trust-validity-photograph",
    ("trust_cis", 13, 0): "cis-divider-photograph",
}

MIN_PX = 90          # ignore rules, bullets, tiny glyphs
MIN_BYTES = 3000


def find_deck(filename: str):
    for d in SEARCH_DIRS:
        p = d / filename
        if p.exists():
            return p
    return None


def save_image(doc, xref, smask, dest_png: Path, fitz):
    """Write xref to dest_png, compositing the soft mask so transparency survives."""
    pix = fitz.Pixmap(doc, xref)

    # CMYK -> RGB before anything else
    if pix.n - pix.alpha >= 4:
        pix = fitz.Pixmap(fitz.csRGB, pix)

    if smask:
        try:
            mask = fitz.Pixmap(doc, smask)
            pix = fitz.Pixmap(pix, mask)      # attaches alpha channel
        except Exception:                      # noqa: BLE001
            pass                               # fall back to opaque

    dest_png.parent.mkdir(parents=True, exist_ok=True)
    pix.save(dest_png)
    w, h = pix.width, pix.height
    del pix
    return w, h


def main():
    try:
        import fitz  # PyMuPDF
    except ImportError:
        sys.exit("PyMuPDF is not installed.\n\n    python -m pip install pymupdf\n")

    ASSETS.mkdir(exist_ok=True)
    RAW.mkdir(exist_ok=True)

    copy_master_logo()

    manifest = {}
    named = {}
    total = 0
    missing_decks = []

    for key, filename in DECKS.items():
        path = find_deck(filename)
        if not path:
            missing_decks.append(filename)
            continue

        doc = fitz.open(path)
        entries = []

        for pno in range(len(doc)):
            for idx, img in enumerate(doc[pno].get_images(full=True)):
                xref, smask = img[0], img[1]

                slot = SLOTS.get((key, pno + 1, idx))
                dest = (ASSETS / f"{slot}.png") if slot else \
                       (RAW / key / f"p{pno+1:02d}_{idx}.png")

                try:
                    w, h = save_image(doc, xref, smask, dest, fitz)
                except Exception as exc:                       # noqa: BLE001
                    print(f"    ! {key} p{pno+1} img{idx}: {exc}")
                    continue

                # discard decorative scraps
                if (w < MIN_PX or h < MIN_PX) and not slot:
                    dest.unlink(missing_ok=True)
                    continue
                if dest.exists() and dest.stat().st_size < MIN_BYTES and not slot:
                    dest.unlink(missing_ok=True)
                    continue

                rec = {
                    "page": pno + 1, "index": idx,
                    "file": str(dest.relative_to(ASSETS)).replace("\\", "/"),
                    "width": w, "height": h,
                    "transparent": bool(smask),
                }
                entries.append(rec)
                if slot:
                    named[slot] = rec["file"]
                total += 1

        manifest[key] = {"source": str(path), "pages": len(doc), "images": entries}
        pages = len(doc)
        doc.close()
        print(f"    {key:<12} {len(entries):>3} images from {pages} pages")

    (ASSETS / "manifest.json").write_text(
        json.dumps({"named": named, "decks": manifest}, indent=2), encoding="utf-8")

    # ── report ────────────────────────────────────────────────────
    wanted = sorted(set(SLOTS.values()))
    got = [s for s in wanted if s in named]
    lost = [s for s in wanted if s not in named]

    lines = ["# Asset extraction report", "",
             f"{len(got)} of {len(wanted)} named slots filled.", "",
             "## Filled", ""]
    for s in got:
        lines.append(f"- `{s}.png` — from `{named[s]}`" if named[s] != f"{s}.png"
                     else f"- `{s}.png`")
    if lost:
        lines += ["", "## Not found", "",
                  "The generator falls back to a tonal panel for these.", ""]
        lines += [f"- `{s}`" for s in lost]
    lines += ["", "## Everything else", "",
              "Unmapped images are in `raw/<deck>/p<page>_<index>.png`.",
              "To use one, copy it over the slot name you want:", "",
              "    copy raw\\ac\\p07_2.png whatwedo-institutions.png", ""]

    (ASSETS / "EXTRACTION-REPORT.md").write_text("\n".join(lines), encoding="utf-8")

    print(f"\n    {total} images written")
    print(f"    {len(got)}/{len(wanted)} named slots filled")
    if lost:
        print(f"    missing: {', '.join(lost)}")
    print(f"\n    Report: {ASSETS / 'EXTRACTION-REPORT.md'}")
    if missing_decks:
        print("\n    Decks not found:")
        for m in missing_decks:
            print(f"      - {m}")


if __name__ == "__main__":
    main()
