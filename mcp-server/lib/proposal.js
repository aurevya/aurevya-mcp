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
    trust = false,
    cis = false,
    nominee = true,
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
      const t = $('fTrust'); if (t) t.checked = cfg.trust;
      const c = $('fCis'); if (c) c.checked = cfg.cis;
      const n = $('fNominee'); if (n) n.checked = cfg.nominee;
    }
    $('fClient').value = cfg.clientName;
    $('fMonth').value = String(cfg.month);
    $('fYear').value = String(cfg.year);
    $('fCurrency').value = cfg.currency;
    // one change event on fMode fires onModeOrEntityChange(), which reads
    // all the fields above off the DOM and rebuilds STATE + the preview.
    $('fMode').dispatchEvent(new Event('change'));
  }, { mode, company, trust, cis, nominee, clientName, month, year, currency });

  // extra CIS cells beyond the two the page seeds by default
  const extraCells = Math.max(0, (opts.cisCells || 0) - 2);
  if (mode === 'structure' && cis && extraCells > 0) {
    await page.evaluate((n) => {
      for (let i = 0; i < n; i++) {
        if (typeof addStructNode === 'function') addStructNode('ciscell');
      }
    }, extraCells);
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
        currency: document.getElementById('fCurrency').value,
        setupFees: STATE.fees.setup,
        fixedFees: STATE.fees.fixed,
        setupTotal: STATE.fees.setup.reduce((s, f) => s + (f.t === 'item' ? Number(f.v) || 0 : 0), 0),
        fixedTotal: STATE.fees.fixed.reduce((s, f) => s + (f.t === 'item' ? Number(f.v) || 0 : 0), 0),
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

    const { html, filename, label, selections } = await page.evaluate(() => ({
      html: buildExportHTML(),
      filename: exportFilename(),
      label: currentSpec().label,
      selections: STATE.mode === 'structure' ? { ...STATE.entities } : { mode: STATE.mode },
    }));

    const clientDir = path.join(OUTPUT_ROOT, slugify(opts.clientName));
    fs.mkdirSync(clientDir, { recursive: true });

    const htmlPath = path.join(clientDir, filename);
    fs.writeFileSync(htmlPath, html, 'utf8');

    const pdfFilename = filename.replace(/\.html$/i, '.pdf');
    const pdfPath = path.join(clientDir, pdfFilename);
    await page.emulateMediaType('print');
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true });

    const pdfBase64 = fs.readFileSync(pdfPath).toString('base64');

    return { htmlPath, pdfPath, pdfFilename, pdfBase64, label, filename, selections };
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
