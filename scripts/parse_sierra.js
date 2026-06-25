/**
 * parse_sierra.js — extract load data from a Sierra Bullets online load-data PDF
 * (e.g. https://sierrabullets.com/content/load-data/rifle/.../<cartridge>.pdf).
 *
 *   node scripts/parse_sierra.js <file.pdf> "<Cartridge Name>" [barrel_in]
 *
 * Format: one bullet weight per page; a matrix whose COLUMNS are target velocities
 * (fps) and whose CELLS are the charge (grains) reaching that velocity for each
 * powder (rows). VELOCITY only — no pressure. Feeds the velocity side (anchors /
 * E_eff) like the Sierra manual and the Vihtavuori guide.
 *
 * Parsed per <page> from `pdftotext -bbox-layout`: within a page the charge cells
 * align exactly in x to the velocity-header columns, so each (powder, velocity)
 * cell yields a (charge, velocity) point. A diagonal "for individual use only"
 * watermark is filtered (stop-words + grid alignment).
 *
 * Output is LOCAL/gitignored (Sierra EULA: "for individual use only" — not
 * redistributed). Only derived coefficients/anchors are published.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const pdf = process.argv[2];
const cartridge = process.argv[3];
const barrelIn = parseFloat(process.argv[4] || '24');
if (!pdf || !cartridge) { console.error('usage: node scripts/parse_sierra.js <file.pdf> "<Cartridge>" [barrel_in]'); process.exit(1); }
const barrel_mm = Math.round(barrelIn * 25.4);

const xml = execFileSync('pdftotext', ['-bbox-layout', pdf, '-']).toString();
const STOP = new Set(['this', 'data', 'is', 'for', 'individual', 'use', 'only', 'do', 'not', 'edit', 'ata', 'powder', 'velocity', 'special', 'load', 'accuracy', 'hunting', 'case', 'norma', 'remarks', 'components']);
const isCharge = (t) => /^\d{1,2}\.\d$/.test(t);
const isVel = (t) => /^[1-4]\d00$/.test(t);
// Sierra abbreviations -> catalogue names (RE 15 -> Reloder 15, A 2495 -> Accurate 2495).
function fixName(n) {
  return n.replace(/\s+End\.$/, '')
    .replace(/^RE\s+(\d)/i, 'Reloder $1')
    .replace(/^A\s+(\d{3,4})\b/, 'Accurate $1');
}

const rows = [];
const pages = xml.split('<page').slice(1);
for (const pg of pages) {
  const W = [...pg.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)]
    .map((m) => ({ x: +m[1], y: +m[2], t: m[5].trim() }));
  if (!W.length) continue;

  // bullet weight: token "<n>gr" (first on the page); skip pages without one
  const bw = W.find((w) => /^\d{2,3}gr/.test(w.t));
  if (!bw) continue;
  const bullet_gr = parseInt(bw.t, 10);

  // velocity header = the y-row carrying the most velocity tokens
  const velsByY = {};
  for (const w of W) if (isVel(w.t)) (velsByY[Math.round(w.y)] = velsByY[Math.round(w.y)] || []).push(w);
  let hdr = null;
  for (const y of Object.keys(velsByY)) if (!hdr || velsByY[y].length > velsByY[hdr].length) hdr = y;
  if (!hdr || velsByY[hdr].length < 3) continue;
  const cols = velsByY[hdr].map((w) => ({ x: w.x, v: +w.t })).sort((a, b) => a.x - b.x);
  const x0 = cols[0].x;                                  // first velocity column

  // group words into rows by y; a data row has charge cells aligned to columns
  const byY = {};
  for (const w of W) (byY[Math.round(w.y)] = byY[Math.round(w.y)] || []).push(w);
  for (const y of Object.keys(byY)) {
    if (Math.abs(+y - +hdr) < 3) continue;               // skip the header row itself
    const line = byY[y];
    // powder name = left-column tokens, minus the lowercase "for individual use only"
    // watermark fragments (real powder tokens are capitalized or alphanumeric).
    const name = line.filter((w) => w.x < x0 - 4 && w.x > 18).sort((a, b) => a.x - b.x)
      .map((w) => w.t).filter((t) => !/^[a-z]+\.?$/.test(t)).join(' ').trim();
    if (!name || /^[\d.]/.test(name) || STOP.has(name.toLowerCase().split(' ')[0])) continue;
    const powder = fixName(name);
    const cells = [];
    for (const c of cols) {
      const hit = line.find((w) => isCharge(w.t) && Math.abs(w.x - c.x) < 6);
      if (hit) cells.push({ charge: +hit.t, v: c.v });
    }
    if (cells.length < 2) continue;                      // not a real powder row
    for (const cell of cells) rows.push({ cartridge, bullet_gr, powder, charge_gr: cell.charge, v0_fps: cell.v, barrel_mm });
  }
}

const out = { _src: `Sierra Bullets load data — ${cartridge} (parsed; individual use only, not redistributed)`, rows };
const slug = cartridge.toLowerCase().replace(/[^a-z0-9]+/g, '');
const outPath = path.join(__dirname, '..', 'data', `sierra_${slug}.local.json`);
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));

const pw = [...new Set(rows.map((r) => r.powder))].sort();
const bl = [...new Set(rows.map((r) => r.bullet_gr))].sort((a, b) => a - b);
console.log(`Sierra ${cartridge}: ${rows.length} points | bullets ${bl.join('/')} gr | ${pw.length} powders`);
console.log('powders:', pw.join(', '));
console.log('-> data/' + path.basename(outPath));
