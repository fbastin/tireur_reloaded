/**
 * build_start_charges.js — per-(cartridge×powder) STARTING charge for a typical bullet,
 * taken from REAL manufacturer minimum loads. The estimator pre-fills this when the user
 * changes cartridge/powder (a safe low default; model-derived charges are unsafe because
 * the pressure model under-predicts — see docs/MODEL.md §6).
 *
 * Usage : node scripts/build_start_charges.js
 * Inputs (local, gitignored): rs_dataset / western / vihtavuori / … .local.json.
 * Output (LOCAL, gitignored — real charges, not redistributed): data/start_charges.local.json
 *   { "<calKey>|<pwdKey>": { "m": <typical bullet gr>, "c": <start gr>, "cmax": <max gr>,
 *                            "nb": <bullets of that weight> } }
 *
 * Each table row is ONE bullet with its own start and max. For the typical weight, the window
 * takes the LOWEST start and the LOWEST max among the bullets of that weight: the most
 * cautious bullet sets the ceiling. Until 2026-10-10 every charge went into one min/max per
 * weight regardless of its role: Western rows (max loads only, the start column was dropped by
 * the extraction) pre-filled a MAXIMUM as the starting charge for 430 combos, Reload Swiss
 * (min level only) set the ceiling at the highest starting load, and the ceiling was the
 * highest max of all bullets of that weight.
 *
 * --check : rebuild in memory and compare with the served file, without writing (nightly, via
 * scripts/build.sh --check). The served file is gitignored, so no diff ever shows it stale: the
 * July build was still served on 2026-10-10, three days after the Western, ADI and Lyman
 * extractions were corrected, and 12 combos pre-filled a « start » above every published max.
 * On the live site the file is deployed; in the public repo it is gitignored, so the
 * feature works for users without publishing manufacturer load tables.
 */
const fs = require('fs');
const path = require('path');
const d = (f) => path.join(__dirname, '..', 'data', f);
const CHECK = process.argv.includes('--check');
const SERVED = 'reloading/tireur_reloaded/data/start_charges.local.json';
if (CHECK && !fs.existsSync(d('start_charges.local.json'))) {
  console.log(`${SERVED} absent : pas de pré-remplissage servi, rien à comparer`); process.exit(0);
}
if (CHECK) for (const f of ['rs_dataset.local.json', 'western.local.json']) {
  if (!fs.existsSync(d(f))) { console.log(`${SERVED} invérifiable : source locale ${f} absente`); process.exit(1); }
}
const CAL = JSON.parse(fs.readFileSync(d('calibers.json'))).calibers;
const PWD = JSON.parse(fs.readFileSync(d('powders.json'))).powders;
const norm = (s) => String(s).toLowerCase().replace(/\(.*?\)/g, '').replace(/winchester/g, 'win').replace(/remington/g, 'rem').replace(/magnum/g, 'mag').replace(/springfield/g, 'spring').replace(/[^a-z0-9]/g, '');
const calIdx = {}; for (const k of Object.keys(CAL)) { calIdx[norm(k)] = k; for (const a of (CAL[k].aliases || [])) calIdx[norm(a)] = k; }
const pwdIdx = {}; for (const k of Object.keys(PWD)) pwdIdx[norm(k)] = k;
for (const k of Object.keys(PWD)) { const nm = norm(PWD[k].name || ''); if (nm && !pwdIdx[nm]) pwdIdx[nm] = k; }  // nom de produit (Sierra écrit sans fabricant)
const stripV = (s) => String(s).replace(/\s*\+p\+?\b/ig, '').replace(/\bfor ar-?15.*/i, '');
const matchCal = (n) => calIdx[norm(n)] || calIdx[norm(stripV(n))] || null;
const isJunk = (s) => /\bpsi\b|specification|standard saami/i.test(String(s));

// groups["cal|pwd"][bullet_gr][bulletId] = { lo, hi } : plus petite et plus grande charge
// publiées pour UNE balle (une ligne de table, ou une table entière chez Sierra/LoadData).
const groups = {};
const add = (ck, pk, bullet, id, charge) => {
  if (!ck || !pk || !(bullet > 0 && charge > 0)) return;
  const g = (groups[ck + '|' + pk] = groups[ck + '|' + pk] || {});
  const w = (g[bullet] = g[bullet] || {});
  const b = (w[id] = w[id] || { lo: charge, hi: charge });
  if (charge < b.lo) b.lo = charge; if (charge > b.hi) b.hi = charge;
};

// Reload Swiss — une ligne « min » suivie de sa ligne « max » (même cartouche, poudre, balle)
{
  const rs = JSON.parse(fs.readFileSync(d('rs_dataset.local.json'))); let id = 0;
  rs.forEach((r, i) => {
    const p = rs[i - 1];
    const suite = r.level === 'max' && p && p.level === 'min' && p.cartridge === r.cartridge && p.powder === r.powder && p.m_gr === r.m_gr;
    if (!suite) id++;
    add(calIdx[norm(r.cartridge)], pwdIdx[norm(r.powder)] || r.powder, r.m_gr, 'RS' + id, r.C_gr);
  });
}
// Western — départ (colonne START LOAD) + max
JSON.parse(fs.readFileSync(d('western.local.json'))).rows.forEach((r, i) => {
  if (isJunk(r.cartridge)) return;
  const ck = matchCal(r.cartridge), pk = pwdIdx[norm(r.powder || '')];
  if (!(r.start_gr > 0)) throw new Error('western.local.json sans charge de départ : relancer scripts/import_western.js');
  add(ck, pk, r.bullet_gr, 'W' + i, r.start_gr); add(ck, pk, r.bullet_gr, 'W' + i, r.charge_gr);
});
// Vihtavuori — start + max charge
try {
  JSON.parse(fs.readFileSync(d('vihtavuori.local.json'))).rows.forEach((r, i) => {
    const ck = matchCal(r.cartridge), pk = pwdIdx[norm(r.powder || '')];
    add(ck, pk, r.bullet_gr, 'VV' + i, r.start_gr); add(ck, pk, r.bullet_gr, 'VV' + i, r.max_gr);
  });
} catch (e) { if (e.code !== 'ENOENT') throw e; }
// Norma & Speer — start + max ; Sierra & LoadData — chaque charge de la table.
// (mêmes sources que build_anchors.js, pour que toute poudre « ● ancrée » ait aussi
//  une fenêtre de charge ladder.)
const glob = (re) => fs.readdirSync(path.join(__dirname, '..', 'data')).filter((f) => re.test(f));
// Une ligne start/max = une balle ; Sierra et LoadData publient une échelle de charges par
// balle (une ligne par charge) : la balle est alors la table entière (fichier + référence).
const addRange = (src, rows, lo, hi) => rows.forEach((r, i) => {
  const ck = matchCal(r.cartridge), pk = pwdIdx[norm(r.powder || '')];
  const id = hi ? src + i : src + '|' + r.cartridge + '|' + r.powder + '|' + (r.bullet || '');
  add(ck, pk, r.bullet_gr, id, r[lo]); if (hi) add(ck, pk, r.bullet_gr, id, r[hi]);
});
try { addRange('NO', JSON.parse(fs.readFileSync(d('norma.local.json'))).rows, 'start_gr', 'max_gr'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
for (const f of glob(/^speer_.*\.local\.json$/)) addRange(f, JSON.parse(fs.readFileSync(d(f))).rows, 'start_gr', 'max_gr');
for (const f of glob(/^sierra_.*\.local\.json$/)) addRange(f, JSON.parse(fs.readFileSync(d(f))).rows, 'charge_gr');
for (const f of glob(/^loaddata_.*\.local\.json$/)) addRange(f, JSON.parse(fs.readFileSync(d(f))).rows, 'charge_gr');

// Lovex — charge départ + max (normes CIP).
try { addRange('LX', JSON.parse(fs.readFileSync(d('lovex.local.json'))).rows, 'start_gr', 'max_gr'); } catch (e) { if (e.code !== 'ENOENT') throw e; }

// Vectan — charge départ + max (données NORMES CIP).
try { addRange('VE', JSON.parse(fs.readFileSync(d('vectan.local.json'))).rows, 'start_gr', 'max_gr'); } catch (e) { if (e.code !== 'ENOENT') throw e; }

// Alliant — ne publie que la charge MAXIMALE. La charge de départ est DÉRIVÉE de la consigne
// imprimée dans le guide lui-même (« reduce rifle and handgun charge weights by 10% to
// establish a starting load ») : ce n'est donc pas une valeur inventée, mais la règle du
// fabricant appliquée à sa propre donnée. Sans elle, les 91 couples ancrés via Alliant
// seraient marqués « ● données » avec un ladder vide (l'incohérence corrigée le 2026-06-25).
try {
  JSON.parse(fs.readFileSync(d('alliant.local.json'))).rows.forEach((r, i) => {
    const ck = matchCal(r.cartridge), pk = pwdIdx[norm(r.powder || '')];
    if (!(r.charge_gr > 0)) return;
    add(ck, pk, r.bullet_gr, 'AL' + i, r.charge_gr);         // max publiée
    add(ck, pk, r.bullet_gr, 'AL' + i, r.charge_gr * 0.9);   // départ = max − 10 % (consigne Alliant)
  });
} catch (e) { if (e.code !== 'ENOENT') throw e; }

const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const out = {}; let n = 0;
for (const [k, byBullet] of Object.entries(groups)) {
  const bullets = Object.keys(byBullet).map(Number);
  if (bullets.length < 1) continue;
  const m = median(bullets);                       // typical bullet = median weight
  const bs = Object.values(byBullet[m]);           // les balles de cette masse
  const c = Math.min(...bs.map((b) => b.lo)), cmax = Math.min(...bs.map((b) => b.hi));
  out[k] = { m: +m.toFixed(1), c: +c.toFixed(2), cmax: +cmax.toFixed(2), nb: bs.length };
  n++;
}
if (CHECK) {
  const served = JSON.parse(fs.readFileSync(d('start_charges.local.json'))).charges;
  const diff = [...new Set([...Object.keys(served), ...Object.keys(out)])]
    .filter((k) => JSON.stringify(served[k]) !== JSON.stringify(out[k]));
  if (diff.length) {
    console.log(`${SERVED} périmé : ${diff.length} couple(s) diffèrent de ses sources (${diff.slice(0, 3).join(' ; ')}…) — relancer node reloading/tireur_reloaded/scripts/build_start_charges.js`);
    process.exit(1);
  }
  console.log(`${SERVED} (${n} couples, à jour de ses sources)`);
  process.exit(0);
}
fs.writeFileSync(d('start_charges.local.json'),
  JSON.stringify({ _doc: 'Charge DÉPART et MAX fabricant pour la balle typique (médiane) par cartouche|poudre ; plusieurs balles de cette masse : le plus petit départ et le plus petit max. LOCAL/gitignored : charges réelles, non redistribuées. Pré-remplissage + fenêtre sûre de la ladder dans l UI.', m: 'balle typique (gr)', c: 'charge de départ (gr)', cmax: 'charge max (gr)', nb: 'balles de cette masse', charges: out }, null, 1));
console.log(`start charges for ${n} combos -> data/start_charges.local.json (gitignored)`);
