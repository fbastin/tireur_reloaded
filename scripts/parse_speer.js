/**
 * parse_speer.js — extract load data from a Speer online load-data PDF
 * (reloadingdata.speer.com/.../<cartridge>_<weight>.pdf). One cartridge + one
 * bullet weight per sheet; a clean table: Propellant | Case | Primer |
 * start charge (gr) | start velocity (fps) | max charge (gr)[C] | max velocity (fps).
 *
 *   node scripts/parse_speer.js <file.pdf> "<Cartridge Name>" [barrel_in]
 *
 * VELOCITY only (start + max) — feeds the velocity side (anchors / E_eff) like the
 * Vihtavuori and Norma guides. No barrel length is printed; velocity is treated as
 * at the cartridge reference barrel (as for Norma). Output is LOCAL/gitignored
 * (manufacturer data — derived coefficients only are published).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const pdf = process.argv[2];
const cartridge = process.argv[3];
if (!pdf || !cartridge) { console.error('usage: node scripts/parse_speer.js <file.pdf> "<Cartridge>" [barrel_in]'); process.exit(1); }
const barrel_mm = process.argv[4] ? Math.round(parseFloat(process.argv[4]) * 25.4) : null;
const FPS2MS = 0.3048;

const txt = execFileSync('pdftotext', ['-layout', pdf, '-']).toString();
const bm = txt.match(/Weight\s*\(grains\)\s+(\d{2,3})/i);
const bullet_gr = bm ? +bm[1] : null;
if (!bullet_gr) { console.error('bullet weight not found'); process.exit(1); }

const CASE = /^(Hornady|Federal|Winchester|Remington|Nosler|Norma|Lapua|Starline|Peterson|Alpha|ADG|Speer|RP|WW|FC)$/i;
// Speer typos / abbreviations -> catalogue names.
function fixName(n) {
  return n.replace(/^Aliant\b/i, 'Alliant')
    .replace(/^Hodgdon\s+(\d{3,4})\b/i, 'Hodgdon H$1');     // "Hodgdon 4350" -> "Hodgdon H4350"
}

const isVel = (t) => /^\d{4}$/.test(t) && +t >= 1500 && +t <= 4500;
const isChg = (t) => /^\d{1,2}\.\d$/.test(t);
const rows = [];
for (const raw of txt.split('\n')) {
  const toks = raw.trim().split(/\s+/);
  if (toks.length < 6) continue;
  // Parse the data tail from the RIGHT (so a leading powder number like 4350 is left
  // untouched): ... start_gr start_v max_gr [C] max_v
  let i = toks.length - 1;
  const max_v = toks[i--];
  if (/^c$/i.test(toks[i])) i--;                             // "C" = compressed load
  const max_gr = toks[i--], start_v = toks[i--], start_gr = toks[i--];
  if (!(isVel(max_v) && isVel(start_v) && isChg(max_gr) && isChg(start_gr))) continue;
  // remaining left tokens = [powder...] [case] [primer maker] [primer model]
  const left = toks.slice(0, i + 1);
  const ci = left.findIndex((t) => CASE.test(t));
  const powder = fixName(left.slice(0, ci >= 0 ? ci : Math.max(1, left.length - 3)).join(' ').trim());
  if (!powder || !/[A-Za-z]/.test(powder)) continue;
  rows.push({
    cartridge, bullet_gr, powder,
    start_gr: +start_gr, start_ms: Math.round(+start_v * FPS2MS),
    max_gr: +max_gr, max_ms: Math.round(+max_v * FPS2MS),
    barrel_mm,
  });
}

const out = { _src: `Speer load data — ${cartridge} ${bullet_gr} gr (parsed; manufacturer data, not redistributed)`, rows };
const slug = cartridge.toLowerCase().replace(/[^a-z0-9]+/g, '') + '_' + bullet_gr;
const outPath = path.join(__dirname, '..', 'data', `speer_${slug}.local.json`);
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));

console.log(`Speer ${cartridge} ${bullet_gr} gr: ${rows.length} powders (start+max)`);
console.log('powders:', rows.map((r) => r.powder).join(', '));
console.log('-> data/' + path.basename(outPath));
