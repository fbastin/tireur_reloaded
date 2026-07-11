/**
 * lyman_crosscheck.js — contrôle INDÉPENDANT du modèle contre le Lyman 48e (2002).
 *
 *   node scripts/lyman_crosscheck.js
 *
 * Le Lyman est une source OCR : un chiffre mal lu est indétectable par contrôle de bornes.
 * Il ne nourrit donc NI les ancres NI les charges affichées (start_charges) — il sert de
 * jeu de validation externe, où une erreur d'extraction ne peut que gonfler un résidu.
 *
 * Deux mesures :
 *   1. PRÉDICTION À FROID — v0 prédite par le repli E_eff (le chemin qu'emprunte l'UI quand
 *      le couple n'est pas ancré) vs la vitesse Lyman. C'est le cross-check proprement dit.
 *   2. ACCORD AVEC LES ANCRES — pour les couples déjà ancrés (Reload Swiss/VV/Western/Norma),
 *      on compare le E_eff que donne Lyman au E_eff ancré. Un désaccord fort signalerait une
 *      extraction OCR défaillante plutôt qu'un défaut du modèle : c'est le garde-fou qui
 *      qualifie la SOURCE, pas le modèle.
 *
 * Entrée : data/lyman.local.json (local/gitignored). Sortie : rapport console seulement.
 */
const fs = require('fs');
const path = require('path');
const d = (f) => path.join(__dirname, '..', 'data', f);

const CAL = JSON.parse(fs.readFileSync(d('calibers.json'))).calibers;
const PWD = JSON.parse(fs.readFileSync(d('powders.json'))).powders;
const COEF = JSON.parse(fs.readFileSync(d('model_coefficients.json')));
const ANCH = JSON.parse(fs.readFileSync(d('anchors.json'))).anchors;
let LY;
try { LY = JSON.parse(fs.readFileSync(d('lyman.local.json'))).rows; }
catch (e) { console.error('data/lyman.local.json absent — lancer d\'abord scripts/parse_lyman.js'); process.exit(1); }

const G = 6.479891e-5;                       // grain -> kg
const [e0, e1] = COEF.e_eff.coef;            // E_eff = e0 + e1·(fill/100)   [J/kg]

const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

// fill% = volume occupé par la poudre / volume utile de l'étui
const fillPct = (ck, pk, C_gr) => {
  const pcd = PWD[pk].pcd, vol = CAL[ck].case_vol_cm3;
  if (!(pcd > 0 && vol > 0)) return null;
  return (C_gr * 0.06479891 / (pcd / 1000)) / vol * 100;   // g / (g/cm3) / cm3
};
const v0cold = (m_gr, C_gr, fill) => {
  const m = m_gr * G, C = C_gr * G;
  const Eeff = e0 + e1 * (fill / 100);
  return Math.sqrt(2 * Eeff * C / (m + C / 3));
};
const eeffOf = (m_gr, C_gr, v) => {
  const m = m_gr * G, C = C_gr * G;
  return (m + C / 3) * v * v / (2 * C);
};

// ---- 0. qualité de la SOURCE, sans le modèle -------------------------------------------
// À cartouche, poudre et palier de charge identiques, une balle plus lourde est plus lente.
// C'est une contrainte purement physique : la violer signe une ligne corrompue par l'OCR
// (masse ou vitesse mal lue). On la mesure AVANT tout usage du modèle — filtrer le jeu de
// validation avec le modèle qu'on valide serait circulaire.
{
  const g = new Map();
  for (const r of LY) { const k = r.cartridge + '|' + r.powder; if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
  let pairs = 0, viol = 0;
  for (const rows of g.values()) for (const a of rows) for (const b of rows) {
    if (!(a.bullet_gr < b.bullet_gr)) continue;
    for (const t of ['start', 'max']) { pairs++; if (b[t + '_ms'] > a[t + '_ms'] * 1.02) viol++; }
  }
  console.log('=== 0. Qualité de l\'extraction OCR (test physique, sans modèle) ===');
  console.log(`  lignes : ${LY.length}   comparaisons contraignantes : ${pairs}`);
  console.log(`  incohérences (balle plus lourde ET plus rapide) : ${viol} = ${(100 * viol / pairs).toFixed(1)} %`);
  console.log('  → bruit résiduel de l\'OCR : le Lyman ne peut PAS servir d\'ancre, seulement d\'ordre de grandeur.\n');
}

// ---- 1. prédiction à froid -------------------------------------------------------------
// Lyman tire en canon d'essai SAAMI. Pour les cartouches de REVOLVER, le canon SAAMI est
// VENTÉ (il reproduit la fuite au jeu barillet-canon) : la vitesse publiée est structurellement
// plus basse que dans notre référence CIP à canon fermé. Comparer les deux mesure cette
// différence de convention, pas le modèle — les deux familles sont donc séparées.
const VM = require('../velocity_model.js');
// Lyman publie le canon d'essai employé (24" en général) : on ramène sa vitesse au canon de
// référence de la cartouche avant toute comparaison, comme build_anchors le fait pour Sierra.
const toRef = (ck, v, barrel_mm) => {
  const ca = CAL[ck];
  if (!(barrel_mm > ca.case_mm && ca.test_barrel_mm > ca.case_mm)) return v;
  const Lsrc = (barrel_mm - ca.case_mm) / 1000, Lref = (ca.test_barrel_mm - ca.case_mm) / 1000;
  return VM.scaleByBarrel(v, Lsrc, Lref);
};

const err = { rifle: [], handgun: [] };
const perCart = new Map();
let noFill = 0, noBarrel = 0;
for (const r of LY) {
  const type = CAL[r.cartridge].type === 'handgun' ? 'handgun' : 'rifle';
  if (!r.barrel_mm) noBarrel++;
  for (const [C_gr, v0] of [[r.start_gr, r.start_ms], [r.max_gr, r.max_ms]]) {
    const fill = fillPct(r.cartridge, r.powder, C_gr);
    if (fill === null) { noFill++; continue; }
    const v = r.barrel_mm ? toRef(r.cartridge, v0, r.barrel_mm) : v0;
    const e = (v0cold(r.bullet_gr, C_gr, fill) - v) / v * 100;
    err[type].push(e);
    if (type === 'rifle') {
      if (!perCart.has(r.cartridge)) perCart.set(r.cartridge, []);
      perCart.get(r.cartridge).push(e);
    }
  }
}

console.log('=== 1. Prédiction à froid (repli E_eff) vs Lyman 48e ===');
console.log(`  écartés faute de densité de poudre : ${noFill}`);
for (const t of ['rifle', 'handgun']) {
  const a = err[t];
  if (!a.length) continue;
  const lbl = t === 'rifle' ? 'CARABINE' : 'POING (canon SAAMI venté ≠ réf. CIP fermée)';
  console.log(`  ${lbl} : n=${a.length}  RMS ${rms(a).toFixed(1)} %  biais ${mean(a) >= 0 ? '+' : ''}${mean(a).toFixed(1)} %`);
}
const worst = [...perCart.entries()].map(([c, a]) => [c, mean(a), a.length])
  .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6);
console.log('  carabines les plus biaisées :');
for (const [c, b, n] of worst) console.log(`     ${c.padEnd(20)} biais ${b >= 0 ? '+' : ''}${b.toFixed(1)} %  (n=${n})`);

// ---- 2. accord avec les ancres (qualifie la SOURCE) -------------------------------------
const dev = [];
for (const [key, a] of Object.entries(ANCH)) {
  const [ck, pk] = key.split('|');
  const rows = LY.filter((r) => r.cartridge === ck && r.powder === pk);
  if (!rows.length || !a.eeff) continue;
  const es = [];
  for (const r of rows) {
    const vs = r.barrel_mm ? toRef(ck, r.start_ms, r.barrel_mm) : r.start_ms;
    const vm = r.barrel_mm ? toRef(ck, r.max_ms, r.barrel_mm) : r.max_ms;
    es.push(eeffOf(r.bullet_gr, r.start_gr, vs));
    es.push(eeffOf(r.bullet_gr, r.max_gr, vm));
  }
  dev.push({ key, type: CAL[ck].type === 'handgun' ? 'handgun' : 'rifle', d: (mean(es) - a.eeff) / a.eeff * 100, n: es.length });
}
console.log('\n=== 2. Accord Lyman ↔ ancres existantes (contrôle de l\'extraction OCR) ===');
if (!dev.length) { console.log('  aucun couple commun.'); }
else {
  for (const t of ['rifle', 'handgun']) {
    const ds = dev.filter((x) => x.type === t).map((x) => x.d);
    if (!ds.length) continue;
    const lbl = t === 'rifle' ? 'CARABINE' : 'POING (canon venté : écart ATTENDU)';
    console.log(`  ${lbl} : ${ds.length} couples  écart E_eff RMS ${rms(ds).toFixed(1)} %  biais ${mean(ds) >= 0 ? '+' : ''}${mean(ds).toFixed(1)} %`);
  }
  const bad = dev.filter((x) => x.type === 'rifle' && Math.abs(x.d) > 15).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  console.log(`  carabines en désaccord > 15 % : ${bad.length}`);
  for (const b of bad.slice(0, 6)) console.log(`     ${b.key.padEnd(28)} ${b.d >= 0 ? '+' : ''}${b.d.toFixed(1)} %  (n=${b.n})`);
}
