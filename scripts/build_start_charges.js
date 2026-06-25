/**
 * build_start_charges.js — per-(cartridge×powder) STARTING charge for a typical bullet,
 * taken from REAL manufacturer minimum loads. The estimator pre-fills this when the user
 * changes cartridge/powder (a safe low default; model-derived charges are unsafe because
 * the pressure model under-predicts — see docs/MODEL.md §6).
 *
 * Usage : node scripts/build_start_charges.js
 * Inputs (local, gitignored): rs_dataset / western / vihtavuori .local.json.
 * Output (LOCAL, gitignored — real charges, not redistributed): data/start_charges.local.json
 *   { "<calKey>|<pwdKey>": { "m": <typical bullet gr>, "c": <its min charge gr> } }
 * On the live site the file is deployed; in the public repo it is gitignored, so the
 * feature works for users without publishing manufacturer load tables.
 */
const fs = require('fs');
const path = require('path');
const d = (f) => path.join(__dirname, '..', 'data', f);
const CAL = JSON.parse(fs.readFileSync(d('calibers.json'))).calibers;
const PWD = JSON.parse(fs.readFileSync(d('powders.json'))).powders;
const norm = (s) => String(s).toLowerCase().replace(/\(.*?\)/g, '').replace(/winchester/g, 'win').replace(/remington/g, 'rem').replace(/magnum/g, 'mag').replace(/springfield/g, 'spring').replace(/[^a-z0-9]/g, '');
const calIdx = {}; for (const k of Object.keys(CAL)) { calIdx[norm(k)] = k; for (const a of (CAL[k].aliases || [])) calIdx[norm(a)] = k; }
const pwdIdx = {}; for (const k of Object.keys(PWD)) pwdIdx[norm(k)] = k;
for (const k of Object.keys(PWD)) { const nm = norm(PWD[k].name || ''); if (nm && !pwdIdx[nm]) pwdIdx[nm] = k; }  // nom de produit (Sierra écrit sans fabricant)
const stripV = (s) => String(s).replace(/\s*\+p\+?\b/ig, '').replace(/\bfor ar-?15.*/i, '');
const matchCal = (n) => calIdx[norm(n)] || calIdx[norm(stripV(n))] || null;
const isJunk = (s) => /\bpsi\b|specification|standard saami/i.test(String(s));

// groups["cal|pwd"][bullet_gr] = min charge (gr) seen for that bullet
const groups = {};
const add = (ck, pk, bullet, charge) => {
  if (!ck || !pk || !(bullet > 0 && charge > 0)) return;
  const k = ck + '|' + pk, g = (groups[k] = groups[k] || {});
  const b = (g[bullet] = g[bullet] || { min: charge, max: charge });
  if (charge < b.min) b.min = charge; if (charge > b.max) b.max = charge;
};

// Reload Swiss — use the 'min' level loads
for (const r of JSON.parse(fs.readFileSync(d('rs_dataset.local.json')))) {
  if (r.level !== 'min') continue;
  add(calIdx[norm(r.cartridge)], pwdIdx[norm(r.powder)] || r.powder, r.m_gr, r.C_gr);
}
// Western — min charge per bullet
for (const r of JSON.parse(fs.readFileSync(d('western.local.json'))).rows) {
  if (isJunk(r.cartridge)) continue;
  add(matchCal(r.cartridge), pwdIdx[norm(r.powder || '')], r.bullet_gr, r.charge_gr);
}
// Vihtavuori — start + max charge
try {
  for (const r of JSON.parse(fs.readFileSync(d('vihtavuori.local.json'))).rows) {
    const ck = matchCal(r.cartridge), pk = pwdIdx[norm(r.powder || '')];
    add(ck, pk, r.bullet_gr, r.start_gr); add(ck, pk, r.bullet_gr, r.max_gr);
  }
} catch (e) { if (e.code !== 'ENOENT') throw e; }
// Norma & Speer — start + max ; Sierra & LoadData — chaque charge de la table.
// (mêmes sources que build_anchors.js, pour que toute poudre « ● ancrée » ait aussi
//  une fenêtre de charge ladder.)
const glob = (re) => fs.readdirSync(path.join(__dirname, '..', 'data')).filter((f) => re.test(f));
const addRange = (rows, lo, hi) => { for (const r of rows) { const ck = matchCal(r.cartridge), pk = pwdIdx[norm(r.powder || '')]; add(ck, pk, r.bullet_gr, r[lo]); if (hi) add(ck, pk, r.bullet_gr, r[hi]); } };
try { addRange(JSON.parse(fs.readFileSync(d('norma.local.json'))).rows, 'start_gr', 'max_gr'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
for (const f of glob(/^speer_.*\.local\.json$/)) addRange(JSON.parse(fs.readFileSync(d(f))).rows, 'start_gr', 'max_gr');
for (const f of glob(/^sierra_.*\.local\.json$/)) addRange(JSON.parse(fs.readFileSync(d(f))).rows, 'charge_gr');
for (const f of glob(/^loaddata_.*\.local\.json$/)) addRange(JSON.parse(fs.readFileSync(d(f))).rows, 'charge_gr');

const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const out = {}; let n = 0;
for (const [k, byBullet] of Object.entries(groups)) {
  const bullets = Object.keys(byBullet).map(Number);
  if (bullets.length < 1) continue;
  const m = median(bullets);                       // typical bullet = median weight
  out[k] = { m: +m.toFixed(1), c: +byBullet[m].min.toFixed(2), cmax: +byBullet[m].max.toFixed(2) }; // min (start) + max charge
  n++;
}
fs.writeFileSync(d('start_charges.local.json'),
  JSON.stringify({ _doc: 'Charge DÉPART (min) et MAX fabricant pour la balle typique (médiane) par cartouche|poudre. LOCAL/gitignored : charges réelles, non redistribuées. Pré-remplissage + fenêtre sûre de la ladder dans l UI.', m: 'balle typique (gr)', c: 'charge min (gr)', cmax: 'charge max (gr)', charges: out }, null, 1));
console.log(`start charges for ${n} combos -> data/start_charges.local.json (gitignored)`);
