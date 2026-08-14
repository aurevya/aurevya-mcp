# Aurevya Wealth — Proposal Generator

Reproduces the Aurevya house-format proposal decks from a short form, in
**HTML** and **PDF**, using your existing content and an editable price book.

```
proposal-generator/
├── proposal-generator.html      ← the tool. Open in a browser.
├── extract-assets.py            ← pulls photography out of the sample PDFs
├── extract-assets.bat           ← double-click version of the above
├── assets/                      ← created by the extractor
└── content/                     ← verbatim text captured from all 7 samples
    ├── mfo-content.md
    ├── fund-luxembourg-content.md
    ├── accounting-services-content.md
    └── trust-gbc-cis-pcc-content.md
```

---

## How it works

The decks turned out to be highly systematic. Every proposal is the same
spine with different organs:

**Never changes** — Our Group, About Aurevya, What We Do, KYC Documents,
Our Services leaf wheel, the six service detail pages, back cover.

**Changes per product** — cover title, structure diagram, the product
overview section (GBC / Trust / CIS / Key Features), documentation process,
and the two fee tables.

So the generator holds the boilerplate once and swaps the product layer.
Adding a new proposal type means adding one entry to `PRODUCTS` — not
rebuilding a deck.

## Linking it into the portal (replaces the old AI wizard)

The "Proposal Generator" item under **AI Tools** in the staff sidebar
currently opens a 3-step AI wizard that's built into the portal's React
bundle. To make that same menu item open this tool instead:

Double-click **DOUBLE-CLICK-TO-DEPLOY-PROPOSAL-GENERATOR.bat**.

It produces a new zip in the `AWL AI Automation` folder (named one higher
than your last deploy, and so on each time you re-run it) — drag that onto
Netlify the same way as every previous update. The script always builds on
top of whatever you deployed most recently, so re-running it after making
changes to the generator is safe and won't lose anything.

Once deployed, clicking **Proposal Generator** in the sidebar opens this
tool in a new browser tab.

### What it actually changes

I inspected the live portal's compiled bundle directly (fetched it from
`aurevya-portal.netlify.app`, since the local source in `aurevya-portal-source`
is the incomplete copy — see the earlier notes on that) and found the exact
sidebar link for "Proposal Generator". The script changes only that one
piece of JSX, from a React Router link:

```
n.jsxs(Ee,{to:"/admin/proposals",...})
```

to a plain anchor tag that opens the tool in a **new browser tab**:

```
n.jsxs("a",{href:"/proposal-generator/proposal-generator.html",target:"_blank",...})
```

Same icon, same label, same position in the "AI Tools" menu — it just opens
in a new tab instead of loading inside the portal.

**Why a new tab, not embedded in the page?** The first version of this tried
embedding the tool in an iframe on the existing `/admin/proposals` page. That
came back blank — the whole site sends `X-Frame-Options: DENY` on every
single page (confirmed on `/`, `/prequal.html`, `/logo.png`, and the
generator's own URL), which blocks any page from being framed, including by
itself. A `_headers` file exception didn't override it either, which points
to that rule being enforced at a level `_headers` can't reach (a Netlify
account setting or a `netlify.toml force=true` rule). A new-tab link sidesteps
this entirely — no framing happens, so there's nothing to block.

The script also reverts the `/admin/proposals` route itself back to the
original wizard component (undoing that earlier iframe experiment), so if
anyone still has that URL bookmarked or types it directly, they see the old
wizard rather than a broken frame.

`RS` — the old wizard component — is left in the bundle, just no longer
linked from the menu. Nothing else changes: the sidebar, routing for every
other page, and the AI-generated proposals already saved in Supabase are
all untouched. If anything looks wrong after deploying, re-uploading the
previous zip instantly reverts it.

The script also copies this whole `proposal-generator` folder (the HTML
tool plus everything in `assets/`) into the deploy, so the iframe has
something to load at that URL.

**Before running it**, make sure you've run
`DOUBLE-CLICK-TO-EXTRACT-IMAGES.bat` at least once — the deploy script
packages whatever is currently in `assets/`, photographs included.

**If it reports the route line wasn't found:** the portal has been
redeployed with a rebuilt bundle since this was written, and the generated
JS changed shape. Tell me and I'll re-fetch the live bundle and update the
two strings in `deploy-to-portal.py` — it's a two-minute fix, not a rebuild.

### Using it

Open `proposal-generator.html` in Chrome or Edge. The deck renders
immediately and **updates live** — there is no Generate button. Type a
client name and watch the cover change as you type; tick a section off and
the page count and contents renumber themselves.

1. Pick a **proposal type**.
2. Type the **client name**, set **month/year** and currency.
3. Adjust the **structure diagram** — drag any box to reposition it, edit
   labels and connection percentages, and add or remove shareholders,
   entity boxes, or CIS cells from the sidebar (see below).
4. Tick sections on/off — every section is optional.
5. Override any **fee** line; totals and the fee pages recalculate.
6. **Export PDF** → in the print dialog choose *Save as PDF*, **Landscape**,
   margins **None**, and turn **Background graphics ON**.

Scroll position is held while you edit, so the page you're inspecting stays
put. `Download HTML` gives a file you can email or archive — keep it next to
the `assets` folder so the photography travels with it.

Shortcuts: `Ctrl/Cmd + P` export, `Ctrl/Cmd + +/−` zoom.

### Proposal types — the Mauritius structure is now build-your-own

Rather than a fixed list of named combinations, **Mauritius Structure**
mode (the default) is three independent choices that combine freely:

- **Company type** — Authorised Company, Global Business Company, or none.
- **Trust** — on/off. Wraps the company: Settlor → Trust → Company.
- **CIS — Protected Cell Company (PCC)** — on/off. Layered beneath whatever
  else is selected as a fund vehicle.

Any combination works — a bare Trust with no company, GBC + CIS with no
Trust, AC + Trust, a standalone CIS, the full Trust + GBC + CIS stack, and
so on. The structure diagram, the documentation-process pages, the price
book, the glossary, and the cover/footer wording all assemble themselves
from whichever boxes are ticked — there's no fixed list to run out of, and
no code change needed when a client needs a combination that hasn't come up
before.

The other three proposal types stay as their own modes, since their content
genuinely isn't "composable" with the Mauritius entities — different
jurisdiction, currency, licence and deck shape entirely:

- **Multiple Family Office (MFO)**
- **Luxembourg Fund Platform**
- **Accounting Services** (services-only, no entity, no structure diagram)

### The structure diagram is a live editor, not a fixed picture

Every box on the "Your Tailored Solution" page can be dragged directly on
the diagram to reposition it, and the sidebar lets you:

- Edit any box's label text.
- Add a **Shareholder** (for joint/multiple shareholders — add as many as
  needed, then set each connection's percentage separately).
- Add an **Entity box** — a generic box for anything else: a second trust,
  a holding company, whatever the structure needs that isn't already one
  of the standard AC/GBC/Trust/CIS pieces.
- Add a **CIS Cell** — individual Protected Cell Company cells are real,
  separate boxes now (two are added by default when CIS is selected), not
  just a caption.
- Add or remove **connections** between any two boxes, and edit each
  connection's label (e.g. a percentage).
- **Reset diagram to default** if you want to discard your changes and
  go back to the auto-generated layout for the current selection.

Manual edits to the diagram (dragging, added boxes, relabelled entities)
are preserved while you keep working on the same proposal — they only
reset if you change the proposal type or the AC/GBC/Trust/CIS selection,
since that regenerates the default layout from scratch.

One limitation worth knowing: the diagram sits on a fixed-size printed
page. Adding a lot of extra boxes can push the layout past the visible
area — if that happens, drag things closer together or remove a box.

### Roughly what each combination looks like

| Selection | Notes |
|---|---|
| AC alone | Includes Key Features of an AC section |
| GBC alone | GBC Comprehensive Overview, 3pp |
| Trust + GBC | Adds trust pages + a second documentation process |
| Trust + GBC + CIS (PCC) | Most complex structure diagram, three documentation-process pages |
| Trust alone, GBC + CIS with no Trust, AC + CIS, etc. | Any other combination — assembles the same way from the same building blocks |
| Multiple Family Office | Separate mode — see caveat below |
| Luxembourg Fund Platform | Separate mode — EUR, no Mauritius content |
| Accounting Services | Separate mode — no entity, no structure diagram, no service pages |

Page count scales with how many sections a given combination pulls in —
typically somewhere in the low-to-mid 20s for one entity, up into the
low 30s for Trust + company + CIS.

---

## Images

Double-click **DOUBLE-CLICK-TO-EXTRACT-IMAGES.bat**.

It pulls the photography out of the sample PDFs and writes it straight into
`assets/` under the exact names the generator looks for — no renaming. Open
`proposal-generator.html` afterwards and the photographs appear.

Where a file is missing the deck falls back to a tonal panel, labelled with
what belongs there. It never shows a broken image.

### Slots

| File in `assets/` | Used on |
|---|---|
| `cover-photograph.png` | Front cover, full bleed |
| `contents-photograph.png` | Contents, left half |
| `about-photograph.png` | About Aurevya |
| `whatwedo-private/enterprise/institutions/sovereigns.png` | What We Do, four columns |
| `divider-photograph.png` | Section dividers |
| `structure-portrait.png` | Tailored Solution, left panel |
| `keyfeatures-photograph.png` | Key Features |
| `gbc-divider-photograph.png`, `gbc-cityscape.png` | GBC overview |
| `trust-validity-photograph.png` | Trust Validity |
| `leaf-plain.png` | Our Services |
| `leaf-board/accounting/legal/compliance/it/concierge.png` | Service pages |

To swap any image, drop your own PNG over that filename.

### If you ran the earlier version

Re-run the extractor. **v1 had a transparency bug**: the leaf-wheel graphics
carry a soft mask in the PDF that `extract_image()` discards, so they came
out as gold leaves on solid black — which would have printed as black boxes
on the white service pages. v2 composites the mask back in and writes proper
transparent PNGs. It also names files automatically, which v1 did not.

The old `assets/raw/*.jpeg` files from v1 are harmless and can be deleted.

### The Aurevya logo, and why the six subsidiary logos are text, not images

**Main logo** — the extractor now copies `logo.png.png` (from the
`AWL AI Automation` folder) into `assets/logo-full-color.png` automatically.
If that copy ever goes missing, the generator falls back to the same file at
its original location, and if that's also missing, to a text lockup — so the
crest can never render as a broken image.

**The six subsidiary logos on "Our Group"** (Aurevya, GMS, SDPW, AFK
Petroleum, Atelier Clinic, IgKnight) are drawn as vector paths inside the
source PDFs, not embedded pictures. PyMuPDF — and every other PDF text/image
extractor — can only pull out raster images, so there is nothing there to
extract. Rather than leave an empty box, each card now gets a plain gold
hairline rule and the company name set in the brand serif. If you have the
original logo files (AI, EPS, SVG or PNG) for any of the six, drop them in
as `assets/logo-gms.png`, `assets/logo-sdpw.png`, `assets/logo-afk.png`,
`assets/logo-atelier.png`, `assets/logo-igknight.png`, `assets/logo-nec.png`
and tell me — wiring them in is a small change.

---

## Bugs found in your existing proposals

Reading all seven decks surfaced errors that have been going out to clients.
The generator fixes each one, but you may want to check what's already been
sent.

### Wrong company named as trustee — highest priority

`AUREVYA_WEALTH_PROPOSAL_GBC+TRUST_OPTION_A_20260729.pdf` (p9) and
`AUREVYA_WEALTH_TRUST+GBC+CIS(PCC)_DP_21052026.pdf` (p17), under **TRUSTEE**:

> "Capital Horizons is a licensed corporate trustee by the Financial Services
> Commission in Mauritius."

Should be Aurevya Wealth Ltd. This is a competitor's name in a live client
proposal. The generator says *"Aurevya Wealth Ltd is a licensed corporate
trustee…"*.

### Another leftover: "CHL"

GBC decks, Documentation Process step 4:

> "one person from **CHL** must have view access and shall be an authorized
> signatory on the account."

Corrected to *Aurevya Wealth Ltd*.

### Unfilled placeholder on a client-facing cover

`AUREVYA_WEALTH_PROPOSAL_ACCOUNTING_SERVICES.pdf` — the cover reads
`Prepared for XXXXXXXXXX`. The generator won't produce a deck without a
client name.

### Fee table that doesn't add up

MFO deck p53 — the Deputy MLRO row has no price, and the visible line items
total **59,900** against a stated **TOTAL of 102,400**. A ~42,500 discrepancy.
The generator computes totals from the line items, so this can't recur — but
the correct MFO pricing needs confirming before that product is used in anger.

### Content bugs

- **Media Monitoring page** (Trust+GBC+CIS p31) repeats its own bullet list
  verbatim under the COMMUNICATION heading, then truncates mid-sentence.
- **Accounting Services deck** contradicts itself: it's a services-only
  proposal but still carries "Documentation Process — *For the setup of your
  GBC*" and prices both a Trust and a full GBC in the fee tables. Its glossary
  also retains all seven trust-law definitions.
- **Front/back cover mismatch** in the same deck: "Accounting Services" on the
  front, "Accounting & Finance Services" on the back.
- **Un-scrubbed third-party firm**: the Luxembourg deck names **Dentons**
  twice on the Tax Services page.
- **Stale metadata**: the GBC deck's embedded PDF title still reads
  "…FOR SETTING UP A TRUST AND AN AUTHORISED COMPANY".
- **TOC mismatch**: several decks list "Tailored Solution" in the contents
  while the page itself is titled "Bespoke Solution".
- **Page numbering**: MFO back cover is folio 67 in a 66-page document.
- **Glossary drift**: the GBC deck's glossary still carries trust terms
  (SETTLOR, TRUSTEE, PROTECTOR…) though no trust is proposed. The generator
  scopes the glossary to the product automatically.

---

## Caveats — what still needs your input

**MFO deck.** The source is 66 pages, of which ~35 are a general
family-office guide (13 chapters: Understanding Family Offices, Core Pillars,
Four-Step Framework, Common Mistakes, Governance & Succession, Cost
Considerations…). That's a standalone essay rather than a proposal template.
The generator currently produces the MFO **proposal** spine — cover, group,
structure, GBC overview, documentation, KYC, fees, services. Tell me whether
the 13-chapter guide should be included verbatim as a fixed appendix, or kept
as a separate document.

**MFO, Fund and CIS pricing** is indicative. The AC, GBC and Trust figures are
transcribed exactly from your samples and are safe to use. The others need a
pass from whoever owns pricing — every figure is editable in the sidebar and
the price book sits in one block near the top of the file.

**CIS / PCC content is newly written.** The source deck names a Protected Cell
Company throughout but contains no PCC section — no Protected Cell Companies
Act 1999 reference, no ring-fencing explanation. I've drafted that page from
the statutory position; it should be reviewed before it goes to a client.

**Page geometry** is set to 297×186mm landscape, close to your originals. If
you want exact parity, tell me the InDesign page size and I'll match it.
