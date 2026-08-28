import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATOR_PATH = path.join(__dirname, '..', '..', 'proposal-generator', 'proposal-generator.html');
const OUTPUT_ROOT = path.join(__dirname, '..', '..', 'Generated Proposals');

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function slugify(s) {
  return String(s || 'client').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'client';
}

/** Drives the real proposal-generator.html in a headless tab exactly the
 *  way a staff member would in a browser — sets the same sidebar fields
 *  (#fMode, #fCompany, #fTrust, #fCis, #fClient, ...), lets the page's own
 *  JS (onModeOrEntityChange → liveBuild) do the work, then reads the
 *  result back out via the page's own buildExportHTML()/currentSpec()
 *  functions. Nothing about the proposal's content, pricing, or wording
 *  is duplicated here — this file only automates the UI. */
async function withPage(fn) {
  if (!fs.existsSync(GENERATOR_PATH)) {
    throw new Error('Could not find proposal-generator.html at ' + GENERATOR_PATH);
  }
  const browser = await puppeteer.launch({
    headless: 'new',
    // Running as root inside the Railway/Docker container — Chromium's
    // own sandbox refuses to start as root, so it's disabled here instead
    // (safe: the only thing this browser ever loads is our own local
    // proposal-generator.html, never arbitrary/untrusted pages).
    // --disable-dev-shm-usage avoids crashes from Docker's small default
    // /dev/shm size.
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(GENERATOR_PATH).href, { waitUntil: 'load' });
    return await fn(page);
  } finally {
    await browser.close();
  }
}

async function configurePage(page, opts) {
  const {
    mode = 'structure',
    company = 'ac',
    // How many of the company layer (holding + operational, etc). Each gets
    // its own fee column with its own total.
    companyCount = 1,
    trust = false,
    cis = false,
    nominee = false,
    // One "Setup + Year 1 | Year 2" fee page instead of separate Setup and
    // Fixed pages — the layout the Trust decks use.
    feeCombined = false,
    clientName = '',
    month = new Date().getMonth(),
    year = new Date().getFullYear(),
    currency = 'USD',
  } = opts;

  await page.evaluate((cfg) => {
    const $ = (id) => document.getElementById(id);
    $('fMode').value = cfg.mode;
    if (cfg.mode === 'structure') {
      const co = $('fCompany');
      if (co) co.value = cfg.company;
      const cc = $('fCompanyCount'); if (cc) cc.value = String(cfg.companyCount);
      const t = $('fTrust'); if (t) t.checked = cfg.trust;
      const c = $('fCis'); if (c) c.checked = cfg.cis;
      const n = $('fNominee'); if (n) n.checked = cfg.nominee;
      const fc = $('fFeeCombined'); if (fc) fc.checked = cfg.feeCombined;
    }
    $('fClient').value = cfg.clientName;
    $('fMonth').value = String(cfg.month);
    $('fYear').value = String(cfg.year);
    $('fCurrency').value = cfg.currency;
    // one change event on fMode fires onModeOrEntityChange(), which reads
    // all the fields above off the DOM and rebuilds STATE (fees, sections,
    // structure diagram) synchronously.
    $('fMode').dispatchEvent(new Event('change'));
    // onModeOrEntityChange() does NOT touch the on-screen preview itself —
    // that's normally handled by the app's own delegated sidebar listener,
    // which calls liveBuild(), which defers the actual DOM rebuild via
    // setTimeout (0ms for checkboxes/selects, but still a separate event
    // loop tick). buildExportHTML() later clones #previewInner as-is, so
    // if we returned here immediately, Puppeteer would export whatever was
    // already on screen from BEFORE this change — stale content — even
    // though STATE itself is already correct. Call the app's own build()
    // synchronously right now so the preview (and therefore the export)
    // is guaranteed to reflect the settings we just applied.
    if (typeof build === 'function') build();
  }, { mode, company, companyCount, trust, cis, nominee, feeCombined, clientName, month, year, currency });

  // Named CIS cells take priority over the plain cisCells count — if both
  // are given, cisCellNames wins and cisCells is ignored.
  if (mode === 'structure' && cis && Array.isArray(opts.cisCellNames) && opts.cisCellNames.length) {
    // handled below, in the combined structure-detail step
  } else {
    // extra CIS cells beyond the two the page seeds by default (unnamed —
    // the page's own default "CELL C", "CELL D", ... naming applies)
    const extraCells = Math.max(0, (opts.cisCells || 0) - 2);
    if (mode === 'structure' && cis && extraCells > 0) {
      await page.evaluate((n) => {
        for (let i = 0; i < n; i++) {
          if (typeof addStructNode === 'function') addStructNode('ciscell');
        }
      }, extraCells);
    }
  }

  // Multiple shareholders/settlors, extra trusts beyond the first, and/or
  // named CIS cells — all optional, all built on top of the base
  // structure using the app's own diagram-editing functions (the same
  // ones the "+ Shareholder" / "+ Trust" / "+ CIS Cell" buttons call), so
  // nothing about node placement, fee book entries, or diagram wiring is
  // duplicated here.
  const hasShareholders = mode === 'structure' && Array.isArray(opts.shareholders) && opts.shareholders.length;
  const hasExtraTrusts = mode === 'structure' && trust && Array.isArray(opts.extraTrusts) && opts.extraTrusts.length;
  const hasCellNames = mode === 'structure' && cis && Array.isArray(opts.cisCellNames) && opts.cisCellNames.length;
  const hasEntities = mode === 'structure' && Array.isArray(opts.entities) && opts.entities.length;
  const hasAddons = mode === 'structure' && Array.isArray(opts.addons) && opts.addons.length;
  const hasNote = mode === 'structure' && !!opts.structureNote;
  if (hasShareholders || hasExtraTrusts || hasCellNames || hasEntities || hasAddons || hasNote) {
    await page.evaluate((cfg) => {
      if (STATE.mode !== 'structure' || !STATE.struct) return;
      const st = STATE.struct;

      // one box per requested shareholder/settlor, reusing whatever
      // default node(s) already exist before adding more. Each entry is
      // either a plain name or { name, pct } — the percentage is shown
      // under the name on the block, and is what the 100% ownership check
      // adds up.
      if (Array.isArray(cfg.shareholders) && cfg.shareholders.length) {
        cfg.shareholders.forEach((entry, i) => {
          const name = (entry && typeof entry === 'object') ? entry.name : entry;
          const pct = (entry && typeof entry === 'object') ? entry.pct : null;
          const existing = st.nodes.filter((n) => n.kind === 'shareholder');
          let node = existing[i];
          if (!node) {
            addStructNode('shareholder');
            node = st.nodes.filter((n) => n.kind === 'shareholder').slice(-1)[0];
          }
          if (!node) return;
          node.label = String(name);
          if (pct !== undefined && pct !== null && String(pct) !== '') {
            // accept 51, "51" or "51%" — the block renders whatever it's given
            node.pct = /%\s*$/.test(String(pct)) ? String(pct) : String(pct) + '%';
          }
        });
        // drop any leftover default shareholder box beyond the names given
        st.nodes.filter((n) => n.kind === 'shareholder').slice(cfg.shareholders.length)
          .forEach((n) => removeStructNode(n.id));
        if (typeof layoutShareholderRow === 'function') layoutShareholderRow(st);
      }

      // Any additional entity hung off a parent box — the same catalogue
      // the canvas offers (ac, gbc, trust, cis, mfo, foundation, domestic,
      // partnership, other). Routed through addEntityUnder so the entity
      // brings its price-book fees, its explanatory pages and its glossary
      // terms exactly as it would when added by hand.
      if (Array.isArray(cfg.entities) && cfg.entities.length && typeof addEntityUnder === 'function') {
        const findBox = (want) => {
          if (!want) return null;
          const needle = String(want).toUpperCase().replace(/\s+/g, ' ').trim();
          const plain = (s) => String(s || '').replace(/<br\s*\/?>/gi, ' ').toUpperCase().replace(/\s+/g, ' ').trim();
          return st.nodes.find((n) => n.id === want)
            || st.nodes.find((n) => plain(n.label) === needle)
            || st.nodes.find((n) => plain(n.label).indexOf(needle) === 0)
            || null;
        };
        cfg.entities.forEach((e) => {
          // default parent: the lowest box on the diagram, i.e. the end of
          // the existing chain
          let parent = findBox(e.under);
          if (!parent) {
            const boxes = st.nodes.filter((n) => n.kind === 'box').sort((a, b) => a.y - b.y);
            parent = boxes[boxes.length - 1] || st.nodes[0];
          }
          if (!parent) return;
          const before = st.nodes.map((n) => n.id);
          addEntityUnder(parent.id, e.type || 'other');
          const added = st.nodes.find((n) => before.indexOf(n.id) < 0);
          if (!added) return;
          if (e.name) added.label = String(e.name).toUpperCase();
          if (e.caption) added.cap = String(e.caption);
          if (e.pct !== undefined && e.pct !== null && String(e.pct) !== '') {
            const edge = st.edges.find((x) => x.to === added.id);
            if (edge) edge.label = /%\s*$/.test(String(e.pct)) ? String(e.pct) : String(e.pct) + '%';
          }
          if (Array.isArray(e.addons) && typeof toggleEntityAddon === 'function') {
            e.addons.forEach((k) => { try { toggleEntityAddon(added.id, k); } catch (_) {} });
          }
        });
        if (typeof closeEntityPanel === 'function') closeEntityPanel();
      }

      // Add-ons charged against the entity the sidebar seeded (as opposed
      // to one added above) — e.g. a second bank account on the GBC.
      if (Array.isArray(cfg.addons) && cfg.addons.length && typeof toggleEntityAddon === 'function') {
        const seeded = st.nodes.find((n) => /^(ac|gbc)\d*$/.test(n.id || ''))
          || st.nodes.filter((n) => n.kind === 'box')[0];
        if (seeded) cfg.addons.forEach((k) => { try { toggleEntityAddon(seeded.id, k); } catch (_) {} });
        if (typeof closeEntityPanel === 'function') closeEntityPanel();
      }

      // free-text note printed under the diagram
      if (cfg.structureNote) st.note = String(cfg.structureNote);

      // additional trusts beyond the first (which the Trust checkbox
      // already added as a real Section-1 entity) — each gets its own
      // copy of the real Trust setup/maintenance fee lines, not just a
      // placeholder, by copying straight out of PRICEBOOK.trust
      if (Array.isArray(cfg.extraTrusts) && cfg.extraTrusts.length && STATE.entities.trust) {
        cfg.extraTrusts.forEach((name) => {
          addStructNode('box');
          const added = st.nodes.filter((n) => n.kind === 'box').slice(-1)[0];
          if (!added) return;
          added.label = String(name).toUpperCase();
          ['setup', 'fixed'].forEach((which) => {
            STATE.fees[which] = STATE.fees[which].filter((r) => r._nodeId !== added.id);
            (PRICEBOOK.trust[which] || []).forEach((r) => {
              STATE.fees[which].push(Object.assign({}, r, { _nodeId: added.id }));
            });
          });
        });
        renderFeeEditor();
      }

      // named CIS cells — renames the default cells and adds/removes to
      // match the requested list exactly
      if (Array.isArray(cfg.cisCellNames) && cfg.cisCellNames.length && STATE.entities.cis) {
        cfg.cisCellNames.forEach((name, i) => {
          const existing = st.nodes.filter((n) => n.kind === 'ciscell');
          if (existing[i]) {
            existing[i].label = name;
          } else {
            addStructNode('ciscell');
            const added = st.nodes.filter((n) => n.kind === 'ciscell').slice(-1)[0];
            if (added) added.label = name;
          }
        });
        st.nodes.filter((n) => n.kind === 'ciscell').slice(cfg.cisCellNames.length)
          .forEach((n) => removeStructNode(n.id));
        if (typeof syncCellFees === 'function') syncCellFees();
      }

      // renumber same-kind entities and push those names onto their fee
      // headings, then redraw — same order the canvas uses
      if (typeof syncEntityNames === 'function') syncEntityNames();

      // Re-space the finished diagram, exactly as the canvas does after any
      // change of shape. addEntityUnder() centres each row under its own
      // parent as it goes, but nothing re-centres the tree as a whole, so a
      // nested structure — entities under an entity that is itself one of
      // several — ends up sitting off the page's centre line. Measured at
      // 14mm out on a four-entity nested example; boxes never overlapped and
      // each parent was correctly centred over its own children, so this is
      // purely where the whole drawing sits on the page.
      //
      // After syncEntityNames, not before: numbering changes labels, and a
      // label that wraps to a second line changes the node's drawn height,
      // which is what the spacing is measured from.
      //
      // typeof-guarded like the calls around it, so this still works against
      // a generator deployed before realignStructure existed.
      if (typeof realignStructure === 'function') realignStructure(STATE.struct);

      if (typeof renderFeeEditor === 'function') renderFeeEditor();
      if (typeof renderStructEditorUI === 'function') renderStructEditorUI();
      if (typeof build === 'function') build();
    }, {
      shareholders: opts.shareholders,
      extraTrusts: opts.extraTrusts,
      cisCellNames: opts.cisCellNames,
      entities: opts.entities,
      addons: opts.addons,
      structureNote: opts.structureNote,
    });
  }
}


/** Fee quote only — no files written. Fast enough to answer "what would a
 *  GBC + Trust cost" directly in chat. */
export async function quoteProposal(opts) {
  return withPage(async (page) => {
    await configurePage(page, opts);
    return page.evaluate(() => {
      const p = currentSpec();
      return {
        label: p.label,
        // Echo back exactly what was actually applied inside the generator
        // (not just what was asked for) so a dropped/misread option — e.g.
        // "trust: true" never making it into the tool call — is visible
        // immediately in the quote instead of only showing up missing from
        // a finished PDF.
        selections: STATE.mode === 'structure' ? { ...STATE.entities } : { mode: STATE.mode },
        // Every shareholder/settlor, trust, and CIS cell actually on the
        // diagram right now, by name — read this back to the client
        // before generating the final PDF so a structure with (say) 3
        // shareholders and 2 trusts is confirmed correct, not assumed.
        structureDetail: STATE.mode === 'structure' && STATE.struct ? (function () {
          const plain = (s) => String(s || '').replace(/<br\s*\/?>/gi, ' ').trim();
          return {
            // shareholders with their holdings, so a 51/49 split can be
            // confirmed rather than assumed
            shareholders: STATE.struct.nodes.filter((n) => n.kind === 'shareholder')
              .map((n) => (n.pct ? plain(n.label) + ' — ' + n.pct : plain(n.label))),
            // every box on the diagram, in the numbered form the fee table
            // uses ("Global Business Company 2")
            entities: STATE.struct.nodes.filter((n) => n.kind === 'box')
              .sort((a, b) => (a.y - b.y) || (a.x - b.x))
              .map((n) => plain(n.label) + (n.cap ? ' (' + n.cap + ')' : '')),
            trusts: STATE.struct.nodes.filter((n) => n.kind === 'box' && /TRUST/i.test(n.label)).map((n) => plain(n.label)),
            cisCells: STATE.struct.nodes.filter((n) => n.kind === 'ciscell').map((n) => n.label),
            note: STATE.struct.note || null,
          };
        }()) : null,

        // Ownership groups that don't add up to 100%. Report these to the
        // user before sending anything to a client — the deck will still
        // generate, but the diagram is stating something incorrect.
        ownershipWarnings: (STATE.mode === 'structure' && typeof ownershipProblems === 'function')
          ? ownershipProblems(STATE.struct).map((g) => ({
            entity: String(g.label || '').replace(/<br\s*\/?>/gi, ' ').trim(),
            total: g.total,
            owners: g.parts.map((p) => ({
              name: String(p.fromLabel || '').replace(/<br\s*\/?>/gi, ' ').trim(),
              pct: p.v === null ? null : p.v,
            })),
          }))
          : [],
        currency: document.getElementById('fCurrency').value,
        setupFees: STATE.fees.setup,
        fixedFees: STATE.fees.fixed,
        // When several entities of the same type are being set up, each one
        // gets its own fee column with its own total (STATE.feeCols) rather
        // than being appended to the shared list — so the quoted totals have
        // to include those, or a 2-company proposal would report only the
        // trust/CIS remainder. Per-entity breakdown is echoed back too, so
        // the client can confirm each company's figure before generating.
        entityFees: (STATE.feeCols || []).map((c) => ({
          label: c.label,
          setupTotal: c.setup.reduce((s, f) => s + (f.t === 'item' ? Number(f.v) || 0 : 0), 0),
          fixedTotal: c.fixed.reduce((s, f) => s + (f.t === 'item' ? Number(f.v) || 0 : 0), 0),
        })),
        setupTotal: typeof feeTotal === 'function'
          ? feeTotal('setup')
          : STATE.fees.setup.reduce((s, f) => s + (f.t === 'item' ? Number(f.v) || 0 : 0), 0),
        fixedTotal: typeof feeTotal === 'function'
          ? feeTotal('fixed')
          : STATE.fees.fixed.reduce((s, f) => s + (f.t === 'item' ? Number(f.v) || 0 : 0), 0),
      };
    });
  });
}

/** Full proposal: same as clicking "Download HTML" + "Export PDF" in the
 *  app, just headless. Writes both files under
 *  "Generated Proposals/<client>/" (useful when running locally — see
 *  README Option B — but on a hosted server like Railway that folder is
 *  invisible to the staff member and gets wiped on every redeploy, so the
 *  PDF's raw bytes are also returned here as base64 for index.js to hand
 *  back as a real downloadable attachment in the chat itself). */
export async function createProposal(opts) {
  return withPage(async (page) => {
    await configurePage(page, opts);

    const { html, filename, label, selections, structureDetail, ownershipWarnings, totals } =
      await page.evaluate(() => {
        const plain = (s) => String(s || '').replace(/<br\s*\/?>/gi, ' ').trim();
        return {
          html: buildExportHTML(),
          filename: exportFilename(),
          label: currentSpec().label,
          selections: STATE.mode === 'structure' ? { ...STATE.entities } : { mode: STATE.mode },
          // Same read-back as quote_proposal, so whichever tool was used the
          // structure can be confirmed in the same words before the link is
          // passed to anyone.
          structureDetail: STATE.mode === 'structure' && STATE.struct ? {
            shareholders: STATE.struct.nodes.filter((n) => n.kind === 'shareholder')
              .map((n) => (n.pct ? plain(n.label) + ' — ' + n.pct : plain(n.label))),
            entities: STATE.struct.nodes.filter((n) => n.kind === 'box')
              .sort((a, b) => (a.y - b.y) || (a.x - b.x))
              .map((n) => plain(n.label) + (n.cap ? ' (' + n.cap + ')' : '')),
            trusts: STATE.struct.nodes.filter((n) => n.kind === 'box' && /TRUST/i.test(n.label)).map((n) => plain(n.label)),
            cisCells: STATE.struct.nodes.filter((n) => n.kind === 'ciscell').map((n) => n.label),
            note: STATE.struct.note || null,
          } : null,
          ownershipWarnings: (STATE.mode === 'structure' && typeof ownershipProblems === 'function')
            ? ownershipProblems(STATE.struct).map((g) => ({
              entity: plain(g.label),
              total: g.total,
              owners: g.parts.map((p) => ({ name: plain(p.fromLabel), pct: p.v === null ? null : p.v })),
            }))
            : [],
          totals: {
            setup: typeof feeTotal === 'function' ? feeTotal('setup') : null,
            fixed: typeof feeTotal === 'function' ? feeTotal('fixed') : null,
            perEntity: (STATE.feeCols || []).map((c) => ({
              label: c.label,
              setup: c.setup.reduce((s, f) => s + (f.t === 'item' ? Number(f.v) || 0 : 0), 0),
              fixed: c.fixed.reduce((s, f) => s + (f.t === 'item' ? Number(f.v) || 0 : 0), 0),
            })),
          },
        };
      });

    const clientSlug = slugify(opts.clientName);
    const clientDir = path.join(OUTPUT_ROOT, clientSlug);
    fs.mkdirSync(clientDir, { recursive: true });

    const htmlPath = path.join(clientDir, filename);
    fs.writeFileSync(htmlPath, html, 'utf8');

    const pdfFilename = filename.replace(/\.html$/i, '.pdf');
    const pdfPath = path.join(clientDir, pdfFilename);
    await page.emulateMediaType('print');
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true });

    const pdfBase64 = fs.readFileSync(pdfPath).toString('base64');

    return { htmlPath, pdfPath, pdfFilename, pdfBase64, label, filename, selections,
      structureDetail, ownershipWarnings, totals, clientSlug };
  });
}

/* ── render a finished deck to PDF ────────────────────────────────────────
 *  Takes the HTML the generator produces in the browser and returns PDF
 *  bytes, so staff get a named file without going through Chrome's print
 *  dialog, and the pages come out as vector text rather than pictures of
 *  text.
 *
 *  Two things here are deliberate and worth not undoing.
 *
 *  The HTML is written into the generator's own folder and opened as a
 *  file:// URL rather than pushed in with setContent(). The deck refers to
 *  its photography with relative paths (assets/cover-photograph.png and so
 *  on); setContent leaves those unresolvable, and the alternative — the
 *  browser inlining forty-odd images as data URIs before posting — would
 *  mean sending megabytes over the wire to say something the server already
 *  has on disk.
 *
 *  Every http(s) request the page tries to make is blocked, bar the two
 *  Google Fonts hosts. This browser runs with --no-sandbox (it has to, as
 *  root in the container), and it is now being handed HTML from outside
 *  rather than only our own file. Without this an image tag pointing at an
 *  internal address would make the server fetch it and hand the result to
 *  Chrome — the ordinary server-side request forgery shape. Local files and
 *  data: URIs are all the deck legitimately needs.
 */
const PDF_ALLOWED_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

/** Whether the render browser may fetch this URL. Exported so the rule can
 *  be tested directly — it is the thing standing between "render the HTML I
 *  sent you" and "fetch this internal address and tell me what it said". */
export function pdfRequestAllowed(url) {
  if (typeof url !== 'string') return false;
  if (url.startsWith('file:') || url.startsWith('data:') || url.startsWith('about:')) return true;
  try {
    return PDF_ALLOWED_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

export async function renderHtmlToPdf(html, { landscape = true } = {}) {
  const dir = path.dirname(GENERATOR_PATH);
  const tmp = path.join(dir, `.render-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(tmp, html, 'utf8');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();

    await page.setRequestInterception(true);
    page.on('request', (r) => {
      if (pdfRequestAllowed(r.url())) r.continue();
      else r.abort();
    });

    await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.emulateMediaType('print');
    /* let the webfonts finish, so the PDF embeds the real faces instead of
       whatever the renderer happened to substitute mid-load */
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));

    return await page.pdf({
      printBackground: true,
      /* honour the @page size the deck's own stylesheet declares — the deck
         is 297 x 186mm, not A4, and forcing A4 would scale every page */
      preferCSSPageSize: true,
      landscape,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  } finally {
    await browser.close();
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
  }
}

export function listGeneratedProposals(limit = 20) {
  if (!fs.existsSync(OUTPUT_ROOT)) return [];
  const files = [];
  for (const client of fs.readdirSync(OUTPUT_ROOT)) {
    const dir = path.join(OUTPUT_ROOT, client);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.toLowerCase().endsWith('.pdf')) continue;
      const full = path.join(dir, f);
      files.push({ client, file: f, path: full, modified: fs.statSync(full).mtime });
    }
  }
  files.sort((a, b) => b.modified - a.modified);
  return files.slice(0, limit);
}

export { MONTHS };
