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
  const browser = await puppeteer.launch({ headless: 'new' });
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
    }
    $('fClient').value = cfg.clientName;
    $('fMonth').value = String(cfg.month);
    $('fYear').value = String(cfg.year);
    $('fCurrency').value = cfg.currency;
    // one change event on fMode fires onModeOrEntityChange(), which reads
    // all the fields above off the DOM and rebuilds STATE + the preview.
    $('fMode').dispatchEvent(new Event('change'));
  }, { mode, company, trust, cis, clientName, month, year, currency });

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
        currency: document.getElementById('fCurrency').value,
        setupFees: STATE.fees.setup,
        fixedFees: STATE.fees.fixed,
        setupTotal: STATE.fees.setup.reduce((s, f) => s + (Number(f.amt) || 0), 0),
        fixedTotal: STATE.fees.fixed.reduce((s, f) => s + (Number(f.amt) || 0), 0),
      };
    });
  });
}

/** Full proposal: same as clicking "Download HTML" + "Export PDF" in the
 *  app, just headless. Writes both files under
 *  "Generated Proposals/<client>/" next to the rest of the portal's files
 *  so staff (and this MCP's own list_generated_proposals tool) can find
 *  them without digging through a Downloads folder. */
export async function createProposal(opts) {
  return withPage(async (page) => {
    await configurePage(page, opts);

    const { html, filename, label } = await page.evaluate(() => ({
      html: buildExportHTML(),
      filename: exportFilename(),
      label: currentSpec().label,
    }));

    const clientDir = path.join(OUTPUT_ROOT, slugify(opts.clientName));
    fs.mkdirSync(clientDir, { recursive: true });

    const htmlPath = path.join(clientDir, filename);
    fs.writeFileSync(htmlPath, html, 'utf8');

    const pdfPath = path.join(clientDir, filename.replace(/\.html$/i, '.pdf'));
    await page.emulateMediaType('print');
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true });

    return { htmlPath, pdfPath, label, filename };
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
