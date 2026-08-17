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
  if (hasShareholders || hasExtraTrusts || hasCellNames) {
    await page.evaluate((cfg) => {
      if (STATE.mode !== 'structure' || !STATE.struct) return;
      const st = STATE.struct;

      // one box per requested shareholder/settlor name, reusing whatever
      // default node(s) already exist before adding more
      if (Array.isArray(cfg.shareholders) && cfg.shareholders.length) {
        cfg.shareholders.forEach((name, i) => {
          const existing = st.nodes.filter((n) => n.kind === 'shareholder');
          if (existing[i]) {
            existing[i].label = name;
          } else {
            addStructNode('shareholder');
            const added = st.nodes.filter((n) => n.kind === 'shareholder').slice(-1)[0];
            if (added) added.label = name;
          }
        });
        // drop any leftover default shareholder box beyond the names given
        st.nodes.filter((n) => n.kind === 'shareholder').slice(cfg.shareholders.length)
          .forEach((n) => removeStructNode(n.id));
      }

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

      if (typeof renderStructEditorUI === 'function') renderStructEditorUI();
      if (typeof build === 'function') build();
    }, { shareholders: opts.shareholders, extraTrusts: opts.extraTrusts, cisCellNames: opts.cisCellNames });
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
        structureDetail: STATE.mode === 'structure' && STATE.struct ? {
          shareholders: STATE.struct.nodes.filter((n) => n.kind === 'shareholder').map((n) => n.label),
          trusts: STATE.struct.nodes.filter((n) => n.kind === 'box' && /TRUST/i.test(n.label)).map((n) => n.label),
          cisCells: STATE.struct.nodes.filter((n) => n.kind === 'ciscell').map((n) => n.label),
        } : null,
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

    const { html, filename, label, selections, structureDetail } = await page.evaluate(() => ({
      html: buildExportHTML(),
      filename: exportFilename(),
      label: currentSpec().label,
      selections: STATE.mode === 'structure' ? { ...STATE.entities } : { mode: STATE.mode },
      structureDetail: STATE.mode === 'structure' && STATE.struct ? {
        shareholders: STATE.struct.nodes.filter((n) => n.kind === 'shareholder').map((n) => n.label),
        trusts: STATE.struct.nodes.filter((n) => n.kind === 'box' && /TRUST/i.test(n.label)).map((n) => n.label),
        cisCells: STATE.struct.nodes.filter((n) => n.kind === 'ciscell').map((n) => n.label),
      } : null,
    }));

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

    return { htmlPath, pdfPath, pdfFilename, pdfBase64, label, filename, selections, structureDetail, clientSlug };
  });
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
