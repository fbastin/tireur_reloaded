/**
 * build_start_charges.js — per-(cartridge×powder) STARTING charge for a typical bullet,
 * taken from REAL manufacturer minimum loads. The estimator pre-fills this when the user
 * changes cartridge/powder (a safe low default; model-derived charges are unsafe because
 * the pressure model under-predicts — see docs/MODEL.md §6).
 *
 * Usage : node scripts/build_start_charges.js
 * Inputs (local, gitignored): rs_dataset / western / vihtavuori / … .local.json.
 * Output (LOCAL, gitignored — real charges, not redistributed): data/start_charges.local.json
 *   charges : { "<calKey>|<pwdKey>": { "m": <typical bullet gr>, "c": <start gr>, "cmax": <max gr>,
 *                                      "nb": <bullets of that weight> } }
 *   fenetres_masse (2026-10-16) : { "<calKey>|<pwdKey>": { "<bullet gr>": { "c": <start gr | null>, "cmax", "nb", "cmoy"? } } }
 *     for pairs of the types of the two-slope law (rifles; handguns, with cmoy) whose anchor carries a pressure
 *     ceiling (anchors.json: pc) — the two-slope pressure law
 *     (scripts/fit_deux_pentes.js) and the ladder window of the entered weight. A Hodgdon row without a starting
 *     charge counts for the maximum only: c = null when no bullet of that weight has a start.
 *   Run after build_anchors.js.
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
// Balle SUBSONIQUE de carabine (vitesse de sa charge MAXIMALE < 340 m/s), dans un couple qui a aussi des balles
// supersoniques : écartée (2026-10-15). Sa fenêtre est celle d'un autre régime, et la masse typique pouvait tomber
// sur elle (300 BLK + RS36 : 9,1-9,9 gr de balle subsonique de 240 gr). Un couple purement subsonique (300 BLK +
// RS24) garde sa fenêtre. Une charge de départ subsonique sous un maximum supersonique reste : c'est la vraie
// fenêtre du fabricant. Même seuil que build_anchors.js ; arme de poing non concernée.
const subsonique = (ck, vMax) => !!ck && CAL[ck] && CAL[ck].type === 'rifle' && vMax > 0 && vMax < 340;
let nSub = 0;
// maxSeul : balle dont on n'a que la charge MAXIMALE (ligne Hodgdon sans départ) ; elle compte pour le maximum des
// fenêtres par masse, jamais pour une charge de départ ni pour la fenêtre typique.
const add = (ck, pk, bullet, id, charge, vMax, maxSeul) => {
  if (!ck || !pk || !(bullet > 0 && charge > 0)) return;
  const g = (groups[ck + '|' + pk] = groups[ck + '|' + pk] || {});
  const w = (g[bullet] = g[bullet] || {});
  const b = (w[id] = w[id] || { lo: charge, hi: charge, sub: subsonique(ck, vMax), maxSeul: !!maxSeul });
  if (charge < b.lo) b.lo = charge; if (charge > b.hi) b.hi = charge;
};

// Reload Swiss — une ligne « min » suivie de sa ligne « max » (même cartouche, poudre, balle)
{
  const rs = JSON.parse(fs.readFileSync(d('rs_dataset.local.json'))); let id = 0;
  const ids = rs.map((r, i) => {
    const p = rs[i - 1];
    const suite = r.level === 'max' && p && p.level === 'min' && p.cartridge === r.cartridge && p.powder === r.powder && p.m_gr === r.m_gr;
    if (!suite) id++;
    return id;
  });
  const vMax = {}; rs.forEach((r, i) => { vMax[ids[i]] = Math.max(vMax[ids[i]] || 0, r.v0 || 0); });   // vitesse de la ligne « max »
  rs.forEach((r, i) => add(calIdx[norm(r.cartridge)], pwdIdx[norm(r.powder)] || r.powder, r.m_gr, 'RS' + ids[i], r.C_gr, vMax[ids[i]]));
}
// Western — départ (colonne START LOAD) + max
JSON.parse(fs.readFileSync(d('western.local.json'))).rows.forEach((r, i) => {
  if (r.cast || isJunk(r.cartridge)) return;            // balle en plomb : pas la fenêtre d'une balle chemisée
  const ck = matchCal(r.cartridge), pk = pwdIdx[norm(r.powder || '')];
  if (!(r.start_gr > 0)) throw new Error('western.local.json sans charge de départ : relancer scripts/import_western.js');
  const vM = r.v0_fps * 0.3048;
  add(ck, pk, r.bullet_gr, 'W' + i, r.start_gr, vM); add(ck, pk, r.bullet_gr, 'W' + i, r.charge_gr, vM);
});
// Vihtavuori — start + max charge
try {
  JSON.parse(fs.readFileSync(d('vihtavuori.local.json'))).rows.forEach((r, i) => {
    if (r.cast) return;                                   // balle en plomb : pas la fenêtre d'une balle chemisée
    const ck = matchCal(r.cartridge), pk = pwdIdx[norm(r.powder || '')];
    add(ck, pk, r.bullet_gr, 'VV' + i, r.start_gr, r.max_ms); add(ck, pk, r.bullet_gr, 'VV' + i, r.max_gr, r.max_ms);
  });
} catch (e) { if (e.code !== 'ENOENT') throw e; }
// Norma & Speer — start + max ; Sierra & LoadData — chaque charge de la table.
// (mêmes sources que build_anchors.js, pour que toute poudre « ● ancrée » ait aussi
//  une fenêtre de charge ladder.)
const glob = (re) => fs.readdirSync(path.join(__dirname, '..', 'data')).filter((f) => re.test(f));
// Une ligne start/max = une balle ; Sierra et LoadData publient une échelle de charges par
// balle (une ligne par charge) : la balle est alors la table entière (fichier + référence).
const addRange = (src, rows, lo, hi) => rows.forEach((r, i) => {
  if (r.cast) return;                                     // balle en plomb : pas la fenêtre d'une balle chemisée
  const ck = matchCal(r.cartridge), pk = pwdIdx[norm(r.powder || '')];
  const id = hi ? src + i : src + '|' + r.cartridge + '|' + r.powder + '|' + (r.bullet || '');
  // vitesse de la charge maximale (échelle Sierra, LoadData : celle de la ligne)
  const vM = hi ? (r.max_ms || (r.v0_fps || 0) * 0.3048) : (r.v0_fps || 0) * 0.3048;
  add(ck, pk, r.bullet_gr, id, r[lo], vM); if (hi) add(ck, pk, r.bullet_gr, id, r[hi], vM);
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
    const vM = (r.v0_fps || 0) * 0.3048;
    add(ck, pk, r.bullet_gr, 'AL' + i, r.charge_gr, vM);         // max publiée
    add(ck, pk, r.bullet_gr, 'AL' + i, r.charge_gr * 0.9, vM);   // départ = max − 10 % (consigne Alliant)
  });
} catch (e) { if (e.code !== 'ENOENT') throw e; }

// Hodgdon (manuel 2024) — départ (« Starting Loads ») et maximum. Mêmes lignes que build_anchors.js (ni balle en
// plomb, ni copie d'une ligne Western, alésage concordant). Jusqu'au 2026-10-16 la colonne de départ n'était pas
// extraite, et 660 couples ancrés sur Hodgdon n'avaient aucune fenêtre ; ce jour-là, les maxima seuls servaient aux
// fenêtres par masse. Ligne sans départ (+P, subsoniques), ou départ qui n'est pas sous le maximum (coquille du
// manuel : 7mm-08, 145 gr, StaBALL Match, 42,0 gr aux deux colonnes, vérifié sur l'image) : maximum seul.
try {
  const copieWestern = new Set(JSON.parse(fs.readFileSync(d('western.local.json'))).rows
    .map((r) => [matchCal(r.cartridge), pwdIdx[norm(r.powder || '')], r.bullet_gr, r.charge_gr, r.v0_fps].join('|')));
  JSON.parse(fs.readFileSync(d('hodgdon.local.json'))).rows.forEach((r, i) => {
    if (r.cast || isJunk(r.cartridge)) return;
    const ck = matchCal(r.cartridge), pk = pwdIdx[norm(r.powder || '')];
    if (!ck || copieWestern.has([ck, pk, r.bullet_gr, r.charge_gr, r.v0_fps].join('|'))) return;
    if (r.bore_mm && Math.abs(r.bore_mm - CAL[ck].bore_mm) > 0.3) return;
    const vM = (r.v0_fps || 0) * 0.3048, depart = r.start_gr > 0 && r.start_gr < r.charge_gr;
    add(ck, pk, r.bullet_gr, 'H' + i, r.charge_gr, vM, !depart);
    if (depart) add(ck, pk, r.bullet_gr, 'H' + i, r.start_gr, vM, false);
  });
} catch (e) { if (e.code !== 'ENOENT') throw e; }

// Nosler (fiches en ligne, scripts/nosler_fiches.py) — carabines, EN COMPLÉMENT comme dans build_anchors.js : seulement
// pour un couple qu'aucune autre source ne fenêtre (454 couples ancrés par Nosler seul n'avaient pas de fenêtre, le
// 2026-10-16). Une balle = une fiche et une poudre ; Nosler publie le maximum et deux charges plus faibles, sans
// nommer de charge de départ : la plus faible tient lieu de départ, comme pour les échelles Sierra.
try {
  // couples déjà fenêtrés : au moins une balle avec départ (une ligne Hodgdon à maximum seul ne fait pas de fenêtre)
  const deja = new Set(Object.keys(groups).filter((k) => Object.values(groups[k]).some((w) => Object.values(w).some((b) => !b.maxSeul))));
  const lignes = JSON.parse(fs.readFileSync(d('nosler.local.json'))).rows;
  const vMaxN = {};
  for (const r of lignes) if (r.max) vMaxN[r.fiche + '|' + r.poudre] = r.fps * 0.3048;
  for (const r of lignes) {
    const ca = CAL[r.cle]; if (!ca || ca.type === 'handgun' || !PWD[r.poudre] || deja.has(r.cle + '|' + r.poudre)) continue;
    if (!(r.balle_gr > 0 && r.charge_gr > 0)) continue;
    if (r.balle_plage && (r.balle_plage[1] - r.balle_plage[0]) / 2 / r.balle_gr > 0.02) continue;
    add(r.cle, r.poudre, r.balle_gr, 'NOS|' + r.fiche + '|' + r.poudre, r.charge_gr, vMaxN[r.fiche + '|' + r.poudre] || 0);
  }
} catch (e) { if (e.code !== 'ENOENT') throw e; }

// Fenêtres PAR MASSE (2026-10-16), pour la loi de pression à deux pentes (scripts/fit_deux_pentes.js) : carabines
// dont l'ancre porte un plafond de pression (anchors.json : pc). Pour chaque masse : plus petite charge de départ
// (null si seule une source « max seul » la publie), plus petite charge maximale, nombre de balles.
const ANCH = JSON.parse(fs.readFileSync(d('anchors.json'))).anchors;
// Types et maximum de référence de la loi à deux pentes (bloc deux_pentes) : arme de poing ajoutée le 2026-10-16, avec la
// moyenne géométrique des maxima de la masse (cmoy), qui ne sert qu'à la pression ; l'échelle de charge garde cmax.
const DP = JSON.parse(fs.readFileSync(d('model_coefficients.json'))).deux_pentes || {};
const parMasse = {}; let nMasses = 0;

const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const out = {}; let n = 0;
// Balles d'un couple, subsoniques retirées si le couple est mixte ; avec ou sans les sources « max seul ». Le
// filtrage se fait sur chaque ensemble : une balle Hodgdon supersonique ne rend pas « mixte » un couple dont la
// fenêtre typique était purement subsonique.
function balles(byBullet0, avecMaxSeul) {
  const tri = {};
  for (const [g, w] of Object.entries(byBullet0)) {
    const ww = Object.fromEntries(Object.entries(w).filter(([, b]) => avecMaxSeul || !b.maxSeul));
    if (Object.keys(ww).length) tri[g] = ww;
  }
  // couple mixte : les balles subsoniques partent ; couple purement subsonique : tout reste
  const mixte = Object.values(tri).some((w) => Object.values(w).some((b) => !b.sub));
  const garde = {}; let retirees = 0;
  for (const [g, w] of Object.entries(tri)) {
    const ww = Object.fromEntries(Object.entries(w).filter(([, b]) => !(mixte && b.sub)));
    retirees += Object.keys(w).length - Object.keys(ww).length;
    if (Object.keys(ww).length) garde[g] = ww;
  }
  return { garde, retirees };
}
for (const [k, byBullet0] of Object.entries(groups)) {
  const typ = CAL[k.split('|')[0]] && CAL[k.split('|')[0]].type;
  if (typ && (DP.types || []).includes(typ) && ANCH[k] && ANCH[k].pc > 0) {
    const f = {}, moy = (DP[typ] || {}).ref === 'moy';
    for (const [g, w] of Object.entries(balles(byBullet0, true).garde)) {
      const bs = Object.values(w), avecDepart = bs.filter((b) => !b.maxSeul);
      const cmax = +Math.min(...bs.map((b) => b.hi)).toFixed(2);
      let c = avecDepart.length ? +Math.min(...avecDepart.map((b) => b.lo)).toFixed(2) : null;
      // Départ au-dessus du maximum : les deux viennent de balles différentes, le maximum d'une ligne sans départ
      // (Hodgdon, .30 Carbine : 15,0 gr en 90 gr, contre 15,1 gr de départ ailleurs). La balle la plus prudente n'a
      // pas de départ publié : pas de départ (remplissage_publie.py --check le contrôle chaque nuit).
      if (c != null && c > cmax) c = null;
      f[g] = { c, cmax, nb: bs.length };
      if (moy) f[g].cmoy = +Math.exp(bs.reduce((s2, b) => s2 + Math.log(b.hi), 0) / bs.length).toFixed(2);
      nMasses++;
    }
    parMasse[k] = f;
  }
  const { garde: byBullet, retirees } = balles(byBullet0, false);   // fenêtre typique : sans les sources « max seul »
  nSub += retirees;
  const bullets = Object.keys(byBullet).map(Number);
  if (bullets.length < 1) continue;
  const m = median(bullets);                       // typical bullet = median weight
  const bs = Object.values(byBullet[m]);           // les balles de cette masse
  const c = Math.min(...bs.map((b) => b.lo)), cmax = Math.min(...bs.map((b) => b.hi));
  out[k] = { m: +m.toFixed(1), c: +c.toFixed(2), cmax: +cmax.toFixed(2), nb: bs.length };
  n++;
}
if (CHECK) {
  const servi = JSON.parse(fs.readFileSync(d('start_charges.local.json'))), served = servi.charges, sm = servi.fenetres_masse || {};
  const diff = [...new Set([...Object.keys(served), ...Object.keys(out)])]
    .filter((k) => JSON.stringify(served[k]) !== JSON.stringify(out[k]))
    .concat([...new Set([...Object.keys(sm), ...Object.keys(parMasse)])]
      .filter((k) => JSON.stringify(sm[k]) !== JSON.stringify(parMasse[k])).map((k) => k + ' (fenêtres par masse)'));
  if (diff.length) {
    console.log(`${SERVED} périmé : ${diff.length} couple(s) diffèrent de ses sources (${diff.slice(0, 3).join(' ; ')}…) — relancer node reloading/tireur_reloaded/scripts/build_start_charges.js`);
    process.exit(1);
  }
  console.log(`${SERVED} (${n} couples, ${nMasses} fenêtres par masse, à jour de ses sources)`);
  process.exit(0);
}
fs.writeFileSync(d('start_charges.local.json'),
  JSON.stringify({ _doc: 'Charge DÉPART et MAX fabricant pour la balle typique (médiane) par cartouche|poudre ; plusieurs balles de cette masse : le plus petit départ et le plus petit max. LOCAL/gitignored : charges réelles, non redistribuées. Pré-remplissage + fenêtre sûre de la ladder dans l UI.', m: 'balle typique (gr)', c: 'charge de départ (gr)', cmax: 'charge max (gr)', nb: 'balles de cette masse', charges: out,
    fenetres_masse_doc: 'Couples dont l ancre porte un plafond de pression (loi à deux pentes : carabines, armes de poing) : par masse de balle (gr), plus petite charge de départ (null : aucune balle de cette masse n en publie), plus petite charge maximale (cmax, échelle de charge), nombre de balles ; en arme de poing, moyenne géométrique des maxima (cmoy, pression).',
    fenetres_masse: parMasse }, null, 1));
console.log(`start charges for ${n} combos, ${nMasses} fenêtres par masse (${Object.keys(parMasse).length} couples) -> data/start_charges.local.json (gitignored) ; balles subsoniques de carabine écartées (couples mixtes) : ${nSub}`);
