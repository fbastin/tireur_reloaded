/**
 * 01_parse_guide.js — parse a manufacturer reloading guide into raw load rows.
 *
 * Input : a text dump of the guide produced with `pdftotext -layout guide.pdf out.txt`.
 * Output: data/rs_loads.local.json  (RAW manufacturer data — gitignored, EULA).
 *
 * Usage : node scripts/01_parse_guide.js path/to/out.txt
 *
 * The parser anchors on the regular numeric tail of each data row (the
 * "barrel (twist)" token, e.g. `600 (1:12")`) so it is robust to the variable
 * number of leading text columns (bullet maker, case, primer…). Per row it reads
 * a MIN block and a MAX block, each: [charge_g, charge_gr, v0, Pmax, fill%].
 */
const fs = require('fs');
const path = require('path');

const input = process.argv[2];
if (!input) { console.error('usage: node scripts/01_parse_guide.js <guide.txt>'); process.exit(1); }
const lines = fs.readFileSync(input, 'utf8').split('\n');

const num = (s) => parseFloat(String(s).replace(',', '.'));
const isNum = (s) => /^-?\d+([.,]\d+)?$/.test(String(s).trim());
const barrelRe = /^\d{2,4}\s*\(1:/;

const rows = [];
let rejected = 0;
for (let raw of lines) {
  let t = raw.replace(/\t/g, ' ').split(/\s{2,}/).map((s) => s.trim()).filter((s) => s.length);
  while (t.length && /^[C*•]$/.test(t[t.length - 1])) t.pop();   // drop trailing flags (compressed, etc.)
  const idx = t.findIndex((x) => barrelRe.test(x));
  if (idx < 13) continue;
  const block = t.slice(idx - 11, idx);                          // 11 numbers: 5 min, 5 max, E0
  if (!block.every(isNum) || !isNum(t[1])) continue;
  const r = {
    cartridge: t[0], bullet_gr: num(t[1]), powder: t[idx - 12],
    barrel_mm: parseInt(t[idx]), coal_mm: (t[idx + 1] && isNum(t[idx + 1])) ? num(t[idx + 1]) : null,
    min: { C_gr: num(t[idx - 10]), v0: num(t[idx - 9]), Pmax: num(t[idx - 8]), fill: num(t[idx - 7]) },
    max: { C_gr: num(t[idx - 5]), v0: num(t[idx - 4]), Pmax: num(t[idx - 3]), fill: num(t[idx - 2]) },
  };
  // plausibility guards
  if (r.max.v0 > r.min.v0 * 0.5 && r.max.v0 < 1500 && r.max.Pmax > 200 && r.max.Pmax < 6500 &&
      r.bullet_gr > 20 && r.bullet_gr < 400) rows.push(r);
  else rejected++;
}

const out = path.join(__dirname, '..', 'data', 'rs_loads.local.json');
fs.writeFileSync(out, JSON.stringify(rows, null, 1));
const carts = new Set(rows.map((r) => r.cartridge)), pwd = new Set(rows.map((r) => r.powder));
console.log(`parsed ${rows.length} rows (${rejected} rejected) — ${carts.size} cartridges, ${pwd.size} powders`);
console.log(`-> ${out}  (raw manufacturer data, gitignored)`);
