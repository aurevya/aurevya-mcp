// Keeps a rendered proposal under the email limit (10 MB).
// Chromium writes images at full resolution, so a photo-heavy deck can be large.
// A PDF that is already under the limit is returned untouched. Otherwise Ghostscript
// re-encodes the images, trying gentler settings first and stopping at the first that fits:
//   /printer (300 dpi)  ->  /ebook (150 dpi)  ->  /screen (72 dpi)
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const PDF_LIMIT = 10 * 1024 * 1024;
const PRESETS = ['/printer', '/ebook', '/screen'];

function gs(input, output, preset) {
  return new Promise((resolve, reject) => {
    const p = spawn('gs', [
      '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.6', `-dPDFSETTINGS=${preset}`,
      '-dNOPAUSE', '-dBATCH', '-dQUIET', '-dDetectDuplicateImages=true', '-dSubsetFonts=true', '-dCompressFonts=true',
      `-sOutputFile=${output}`, input,
    ]);
    let err = '';
    const timer = setTimeout(() => p.kill('SIGKILL'), 120000);
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(err.slice(0, 300) || `gs exited ${code}`)); });
  });
}

/** @returns {{pdf: Buffer, bytes: number, original: number, preset: string|null, fits: boolean}} */
export async function fitPdf(buf, limit = PDF_LIMIT) {
  const original = buf.length;
  if (original <= limit) return { pdf: buf, bytes: original, original, preset: null, fits: true };

  const dir = await mkdtemp(join(tmpdir(), 'pdf-'));
  try {
    const input = join(dir, 'in.pdf');
    await writeFile(input, buf);
    let best = { pdf: buf, bytes: original, preset: null };
    for (const preset of PRESETS) {
      const out = join(dir, `out${preset.replace('/', '-')}.pdf`);
      try { await gs(input, out, preset); } catch (e) {
        console.error('[aurevya-mcp] pdf compression with %s failed: %s', preset, e.message);
        if (e.code === 'ENOENT') break; // Ghostscript is not installed
        continue;
      }
      const got = await readFile(out);
      if (got.length < best.bytes) best = { pdf: got, bytes: got.length, preset };
      if (got.length <= limit) break;
    }
    console.error('[aurevya-mcp] pdf %s MB -> %s MB (%s)', (original / 1048576).toFixed(1), (best.bytes / 1048576).toFixed(1), best.preset || 'unchanged');
    return { ...best, original, fits: best.bytes <= limit };
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
