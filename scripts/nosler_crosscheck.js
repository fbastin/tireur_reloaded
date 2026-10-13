/**
 * nosler_crosscheck.js — les vitesses des fiches Nosler confrontées aux ancres qui ne les contiennent pas.
 *
 * Usage : node scripts/nosler_crosscheck.js [--detail]     (console seule, n'écrit rien)
 * Entrée : data/nosler.local.json (gitignoré, scripts/nosler_fiches.py)
 *
 * Nosler publie, par balle et par poudre, trois charges et leurs vitesses, au canon d'essai de la fiche,
 * sans pression. Avant d'en faire une source d'ancres (vitesse seule, comme Vihtavuori ou Hodgdon en
 * CUP), on mesure l'écart à ce que prédisent les ancres actuelles : énergie de l'ancre ramenée à la charge
 * et à la balle de la ligne par les lois locales, vitesse au canon de référence de la cartouche, ramenée au
 * canon de la fiche par la loi de canon de l'outil. Un biais propre à Nosler (étuis, canons, chronographe)
 * se lirait ici. Fiches à plusieurs balles (« 165/168 grain ») : milieu de la plage, écartées si la
 * demi-plage dépasse 2 %. Depuis que Nosler comble les couples que les autres sources n'ancrent pas
 * (build_anchors.js, 2026-10-13), ces ancres portent nosler=true et sont écartées ici : le test reste
 * celui de Nosler contre les autres laboratoires.
 */
const fs = require('fs');
const path = require('path');
const d = (f) => path.join(__dirname, '..', 'data', f);

const CAL = JSON.parse(fs.readFileSync(d('calibers.json'))).calibers;
const PWD = JSON.parse(fs.readFileSync(d('powders.json'))).powders;
const COEF = JSON.parse(fs.readFileSync(d('model_coefficients.json')));
const ANC = JSON.parse(fs.readFileSync(d('anchors.json'))).anchors;
const EM = require('../energy_model.js');
const VM = require('../velocity_model.js');
const G = 6.479891e-5, GR2G = 0.06479891;

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };

const rows = JSON.parse(fs.readFileSync(d('nosler.local.json'))).rows;
const ecart = {};
const ecarter = (r) => { ecart[r] = (ecart[r] || 0) + 1; };
const anc = [], froid = [], parPoudre = {}, parCart = {}, sansAncre = {};
for (const r of rows) {
  const ca = CAL[r.cle], pw = PWD[r.poudre];
  if (!ca) { ecarter('cartouche absente'); continue; }
  if (!pw) { ecarter('poudre absente de la base'); continue; }
  if (!(r.canon_mm > ca.case_mm && r.balle_gr > 0 && r.charge_gr > 0 && r.fps > 0)) { ecarter('canon, balle ou charge illisible'); continue; }
  if (r.balle_plage && (r.balle_plage[1] - r.balle_plage[0]) / 2 / r.balle_gr > 0.02) { ecarter('plage de balles trop large'); continue; }
  const C = r.charge_gr * G, me = r.balle_gr * G + C / 3, v = r.fps * 0.3048;
  const refBbl = ca.test_barrel_mm || (ca.type === 'handgun' ? 122 : 600);
  const Lref = (refBbl - ca.case_mm) / 1000, Lnos = (r.canon_mm - ca.case_mm) / 1000;
  const a = ANC[`${r.cle}|${r.poudre}`];
  if (a && a.eeff && !a.nosler) {
    const E = a.eeff * EM.localE(COEF.local, r.charge_gr, r.balle_gr, a.C, a.m);
    const vp = VM.scaleByBarrelFor(ca, Math.sqrt(2 * E * C / me), Lref, Lnos);
    const e = (vp / v - 1) * 100;
    anc.push({ e, max: r.max, poing: ca.type === 'handgun', n: a.n });
    (parPoudre[r.poudre] = parPoudre[r.poudre] || []).push(e);
    (parCart[r.cle] = parCart[r.cle] || []).push(e);
  } else {
    const k = `${r.cle}|${r.poudre}`;
    sansAncre[k] = (sansAncre[k] || 0) + 1;
  }
  if (pw.pcd) {
    const fill = (r.charge_gr * GR2G / (pw.pcd / 1000)) / ca.case_vol_cm3;
    const eF = COEF.e_eff.coef[0] + COEF.e_eff.coef[1] * fill;
    froid.push((VM.scaleByBarrelFor(ca, Math.sqrt(2 * eF * C / me), Lref, Lnos) / v - 1) * 100);
  }
}

const ligne = (nom, a) => `${nom.padEnd(34)} n = ${String(a.length).padStart(5)}  biais ${mean(a).toFixed(1).padStart(5)} %  RMS ${rms(a).toFixed(1).padStart(4)} %  médiane |e| ${med(a.map(Math.abs)).toFixed(1)} %  P90 |e| ${q(a.map(Math.abs), 0.9).toFixed(1)} %`;
console.log(`Nosler — ${rows.length} lignes de charge`);
for (const [k, v] of Object.entries(ecart)) console.log(`  écartées : ${String(v).padStart(4)}  ${k}`);
console.log('\nvitesse prédite / vitesse Nosler, au canon de la fiche :');
console.log('  ' + ligne('couples ancrés (sans Nosler)', anc.map((x) => x.e)));
console.log('  ' + ligne('  carabine', anc.filter((x) => !x.poing).map((x) => x.e)));
console.log('  ' + ligne('  arme de poing', anc.filter((x) => x.poing).map((x) => x.e)));
console.log('  ' + ligne('  charges maximales', anc.filter((x) => x.max).map((x) => x.e)));
console.log('  ' + ligne('  ancres de 10 charges ou plus', anc.filter((x) => x.n >= 10).map((x) => x.e)));
console.log('  ' + ligne('modèle à froid (repli E_eff)', froid));
const nc = Object.values(sansAncre);
console.log(`\ncouples sans ancre : ${nc.length} (${nc.reduce((s, x) => s + x, 0)} lignes), dont ${nc.filter((x) => x >= 3).length} avec 3 lignes ou plus`);
const top = (o, n) => Object.entries(o).filter(([, v]) => v.length >= 6).sort((x, y) => Math.abs(mean(y[1])) - Math.abs(mean(x[1]))).slice(0, n);
console.log('\npoudres au plus grand biais (6 lignes ou plus) :');
for (const [k, v] of top(parPoudre, process.argv.includes('--detail') ? 40 : 10)) console.log(`  ${k.padEnd(30)} n = ${String(v.length).padStart(3)}  biais ${mean(v).toFixed(1).padStart(5)} %`);
console.log('\ncartouches au plus grand biais (6 lignes ou plus) :');
for (const [k, v] of top(parCart, process.argv.includes('--detail') ? 40 : 10)) console.log(`  ${k.padEnd(30)} n = ${String(v.length).padStart(3)}  biais ${mean(v).toFixed(1).padStart(5)} %`);
