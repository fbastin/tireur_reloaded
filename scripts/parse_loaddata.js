/**
 * parse_loaddata.js — extract one SAVED LoadData.com "MetallicPrintable" HTML page.
 *
 *   node scripts/parse_loaddata.js <saved-page.html> "<Cartridge>" [barrel_in]
 *
 * ⚠️ LoadData.com is a *paid aggregator* (Wolfe Publishing); the data here originates
 * from a manufacturer manual (e.g. Speer #14). This parses a SINGLE page the user has
 * already opened/saved — it is NOT a crawler and must not be used to bulk-scrape the
 * site. Raw output is LOCAL/gitignored (not redistributed); only derived coefficients
 * /anchors are published. Prefer original manufacturer sources when available.
 *
 * Table columns: Wt. | Bullet | Powder Manufacturer | Powder | Charge (gr) |
 * Velocity (fps). VELOCITY only (start + max rows per bullet×powder).
 */
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
const cartridge = process.argv[3];
if (!file || !cartridge) { console.error('usage: node scripts/parse_loaddata.js <page.html> "<Cartridge>" [barrel_in]'); process.exit(1); }
const barrel_mm = process.argv[4] ? Math.round(parseFloat(process.argv[4]) * 25.4) : null;

const html = fs.readFileSync(file, 'utf8');
const strip = (s) => s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
// Vihtavuori "VV-N350"/"VV-3N37" -> "N350"/"3N37" ; sinon "Mfg Product".
function powderName(mfg, prod) {
  if (/vihtavuori/i.test(mfg)) return prod.replace(/^VV-?/i, '');
  return (mfg + ' ' + prod).trim();
}

const rows = [];
for (const tr of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || []) {
  const c = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => strip(m[1]));
  if (c.length !== 6) continue;
  const [wt, bullet, mfg, prod, chg, vel] = c;
  if (!/^\d{2,3}$/.test(wt) || !/^\d{1,2}(\.\d+)?$/.test(chg) || !/^\d{3,4}$/.test(vel)) continue;
  rows.push({ cartridge, bullet_gr: +wt, bullet, powder: powderName(mfg, prod), charge_gr: +chg, v0_fps: +vel, barrel_mm });
}

const out = { _src: `LoadData.com (aggregator; manufacturer manual) — ${cartridge} (parsed from a single user-opened page; not redistributed)`, rows };
const slug = cartridge.toLowerCase().replace(/[^a-z0-9]+/g, '');
const outPath = path.join(__dirname, '..', 'data', `loaddata_${slug}.local.json`);
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));

const pw = [...new Set(rows.map((r) => r.powder))].sort();
const bl = [...new Set(rows.map((r) => r.bullet_gr))].sort((a, b) => a - b);
console.log(`LoadData ${cartridge}: ${rows.length} points | bullets ${bl.join('/')} gr | ${pw.length} powders`);
console.log('powders:', pw.join(', '));
console.log('-> data/' + path.basename(outPath));
