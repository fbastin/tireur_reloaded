/**
 * parse_norma.js — extract load records from the Norma "Reloading Data — Balistix
 * Bullets" guide (PDF print of an .xlsx, 3 pages, well-aligned columns).
 *
 *   node scripts/parse_norma.js [path/to/Norma-Reloading-Data-11-23.pdf]
 *
 * Columns (per the header):
 *   Cartridge | Calibre | Bullet weight | Bullet type | Barrel twist rate |
 *   COAL (mm) | Norma propellant | Start (grain) | Fill% | Start vel (ft/s) |
 *   Max (grain) | Fill% | Max vel (ft/s)
 *
 * VELOCITY only — no pressure, no test-barrel length. Feeds the velocity side
 * (E_eff / η_b) exactly like the Vihtavuori guide. Output is LOCAL/gitignored:
 * the raw manufacturer table is NOT redistributed (EULA) — only derived
 * coefficients (anchors, e_eff) are published.
 *
 * Parsing is anchored on the propellant token (Norma numbers ≥200, or URP/MRP*),
 * which sits between the geometry columns and the six trailing data numbers
 * (start_gr, start_fill, start_vel, max_gr, max_fill, max_vel). Cartridge/calibre
 * appear only on the first row of a block (left-aligned) and are carried down;
 * bullet weight is likewise carried down when a continuation row omits it.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const pdf = process.argv[2] || path.join(__dirname, '..', '..', 'guides', 'Norma-Reloading-Data-11-23.pdf');
const txt = execFileSync('pdftotext', ['-layout', pdf, '-']).toString();
const FPS2MS = 0.3048;

// Norma propellant: numeric products are ≥200 (200..217, 1010) so they never collide
// with charges/COAL/twist (<100); plus the named rifle powders. A trailing *X is a
// footnote marker (test lot/primer) — stripped for the catalogue name.
const isPowder = (t) => /^(URP|MRP2?|MAGNUM|R1|R123|(?:200|201|202|203|204|205|217|1010)\*?[A-Z]?)$/i.test(t);
const num = (t) => (/^\d+(?:\.\d+)?$/.test(t) ? +t : null);

// Map a raw Norma token to the catalogue key in powders.json (e.g. "203*B" -> "Norma 203B").
function catalogName(tok) {
  const up = tok.toUpperCase().replace('*', '');
  if (/^(URP|MRP2?|MAGNUM|R1|R123)$/.test(up)) return 'Norma ' + up.replace('MAGNUM', 'Magnum');
  const m = up.match(/^(\d{3,4})([A-Z])?$/);
  if (!m) return null;
  if (m[1] === '203') return 'Norma 203B';            // sold as "203-B"
  return 'Norma ' + m[1];
}

const rows = [];
let cart = null, cal = null, bulletGr = null;
for (const raw of txt.split('\n')) {
  if (!raw.trim()) continue;
  const header = /^\S/.test(raw);                      // cartridge name starts at col 0
  const toks = raw.trim().split(/\s+/);

  const pIdx = toks.findIndex(isPowder);
  // Update bullet weight whenever a "<n>gr" token is present (also on non-data lines).
  const bIdx = toks.findIndex((t) => /^\d+gr$/i.test(t));
  if (bIdx >= 0) bulletGr = parseInt(toks[bIdx], 10);

  // On a block header, the tokens before the bullet weight are "<cartridge...> <calibre>".
  if (header && bIdx >= 1) {
    cal = toks[bIdx - 1];
    cart = toks.slice(0, bIdx - 1).join(' ');
  }

  if (pIdx < 0 || !cart) continue;
  const after = toks.slice(pIdx + 1).map(num).filter((v) => v != null);
  if (after.length < 6) continue;
  const [sgr, sfill, sfps, mgr, mfill, mfps] = after;
  const coal = num(toks[pIdx - 1]);                                // column before propellant
  const twist = toks[pIdx - 2] || null;                            // twist rate (e.g. "10", "9/8.75")
  const btype = toks.slice(bIdx + 1, pIdx - 2).join(' ') || null;  // between bullet weight and twist

  // Plausibility — drops misaligned/OCR-merged lines (e.g. "4645" max charge).
  const ok = bulletGr >= 20 && bulletGr <= 600 && mgr >= 5 && mgr <= 120 && sgr >= 2 && sgr <= mgr + 0.5
    && mfps >= 700 && mfps <= 4500 && sfps >= 500 && sfps <= mfps + 30
    && sfill >= 50 && sfill <= 115 && mfill >= 50 && mfill <= 115;
  if (!ok) continue;

  rows.push({
    cartridge: cart, calibre: cal, bullet_gr: bulletGr, bullet_type: btype, twist: twist, coal_mm: coal,
    powder: catalogName(toks[pIdx]) || toks[pIdx], powder_raw: toks[pIdx],
    start_gr: sgr, start_fill: sfill, start_ms: Math.round(sfps * FPS2MS),
    max_gr: mgr, max_fill: mfill, max_ms: Math.round(mfps * FPS2MS),
  });
}

const out = {
  _src: 'Norma Reloading Data — Balistix Bullets, Aug 2023 (parsed; derived use only, not redistributed)',
  rows,
};
const outPath = path.join(__dirname, '..', 'data', 'norma.local.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));

const carts = new Set(rows.map((r) => r.cartridge));
const pwd = new Set(rows.map((r) => r.powder));
const unmatched = [...new Set(rows.filter((r) => r.powder === r.powder_raw).map((r) => r.powder_raw))];
console.log(`Norma: ${rows.length} rows | ${carts.size} cartridges | ${pwd.size} powders`);
console.log('powders:', [...pwd].sort().join(', '));
if (unmatched.length) console.log('UNMAPPED powder tokens:', unmatched.join(', '));
console.log('-> data/norma.local.json');
