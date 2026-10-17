/**
 * adi_modele_servi.js — le modèle SERVI (calcul de la page) confronté aux pressions publiées par ADI, poudres ADI
 * rapportées à leur équivalent Hodgdon selon la table du fabricant.
 *
 * Usage : node scripts/adi_modele_servi.js          (console seule, n'écrit rien)
 *         --variantes   couples de la loi à deux pentes : loi des ancres, loi à deux pentes, moyenne, plus haute des deux
 *         --deux-pentes charges maximales ADI contre la fenêtre servie, par couple
 *         --pires       les charges les plus sous-estimées, par classe
 * Entrées : data/adi.local.json (guide de 2013), data/adi_web.local.json (données en ligne), data/hodgdon.local.json
 *           (copies), data/powder_aliases.json (bloc « equivalences ») — fichiers .local.json gitignorés.
 *
 * POURQUOI. Les lois ajoutées les 2026-10-16 et 17 (deux pentes, plafond déduit de la limite, charge maximale estimée)
 * ne sont validées que sur les laboratoires qui les calent. ADI n'entre ni dans les ancres ni dans aucun calage ; ses
 * poudres portaient des clés à part (« ADI AR 2208 »), sur lesquelles aucune de ces lois ne s'applique. ADI déclare que
 * Hodgdon revend ses poudres sous un autre nom (AR2208 = Varget…) : rapportées à la clé Hodgdon, ses charges testent le
 * calcul que la page fait pour ces couples.
 *
 * COPIES. ADI réimprime des données Hodgdon (MODEL.md, 2026-10-13). Une ligne ADI identique à une ligne Hodgdon
 * (cartouche, poudre, masse de balle, charge, et vitesse OU pression) se compare à l'ancre qu'elle nourrit : elle est
 * écartée. Les lignes ADI communes au guide et aux données en ligne ne comptent qu'une fois.
 *
 * Charges subsoniques de carabine (moins de 340 m/s) écartées, comme des ancres : autre régime.
 *
 * RÉSULTAT (2026-10-17, MODEL.md § 3.10). Carabine. Loi à deux pentes seule, 154 charges de 41 couples : 15,3 %
 * d'écart quadratique, une charge sur cinq sous-estimée de plus de 15 %, contre 13,3 % et une sur onze avec la loi des
 * ancres ; les charges maximales d'ADI s'écartent de ±10 % de celles de Hodgdon à pression égale. D'où le plancher de la
 * loi des ancres (fit_deux_pentes.js) : 15,3 % et une sur douze. Plafond déduit de la limite : 14,9 → 11,4 %, 0 → 1,3 %.
 * À froid, charge maximale estimée : 20,8 → 19,4 %, 13,0 → 1,9 %. Tous les couples avec données : 13,1 → 12,8 %,
 * 4,1 → 4,2 %. Arme de poing : aucune poudre d'ADI n'a d'équivalent Hodgdon publié.
 * Équivalences servies par la page (même jour) : une poudre ADI de la table y prend les données et la densité de la clé
 * Hodgdon. Sur ses propres charges, carabine, 157 couples : pression 24,1 → 17,2 %, sous-estimées 7,5 → 2,7 % ; vitesse
 * 7,3 → 5,2 % ; couples où Hodgdon publie, pression 24,8 → 13,1 %, vitesse 7,3 → 3,1 %.
 *
 * Pression de la page : canon de référence de la cartouche, 21 °C, balle à noyau (option « monolithique » cochée pour
 * les balles que balle_monolithique.js reconnaît), sans volume d'étui mesuré. Lignes en CUP écartées (non convertible).
 */
const fs = require('fs');
const path = require('path');
const d = (f) => path.join(__dirname, '..', 'data', f);
const EM = require('../energy_model.js');
const VM = require('../velocity_model.js');
const { estMonolithique } = require('./balle_monolithique.js');
const CAL = JSON.parse(fs.readFileSync(d('calibers.json'))).calibers;
const PWD = JSON.parse(fs.readFileSync(d('powders.json'))).powders;
const COEF = JSON.parse(fs.readFileSync(d('model_coefficients.json')));
const ANC = JSON.parse(fs.readFileSync(d('anchors.json'))).anchors;
const FEN = JSON.parse(fs.readFileSync(d('start_charges.local.json'))).fenetres_masse || {};
const EQ = Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(d('powder_aliases.json'))).equivalences).filter(([k]) => k[0] !== '_'));
const PSI = 0.0689476, mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

// cartouches : même appariement que adi_crosscheck.js
const norm = (s) => String(s).toLowerCase().replace(/\(.*?\)/g, '').replace(/winchester/g, 'win')
  .replace(/remington/g, 'rem').replace(/magnum/g, 'mag').replace(/springfield/g, 'spring').replace(/[^a-z0-9]/g, '');
const calIdx = {};
for (const k of Object.keys(CAL)) { calIdx[norm(k)] = k; for (const a of (CAL[k].aliases || [])) calIdx[norm(a)] = k; }
const stripV = (s) => String(s).replace(/\s*\+p\+?\b/ig, '').replace(/\bfor ar-?15.*/i, '');
const matchCal = (n) => calIdx[norm(n)] || calIdx[norm(stripV(n))] || null;

// --- copies des lignes Hodgdon (charges maximales et de départ) ----------------------------------------------------
const r1 = (x) => Math.round(x * 10) / 10;
const copV = new Set(), copP = new Set();
for (const r of JSON.parse(fs.readFileSync(d('hodgdon.local.json'))).rows) {
  const ck = matchCal(r.cartridge); if (!ck) continue;
  for (const [c, v, p] of [[r.charge_gr, r.v0_fps, r.Pmax_psi], [r.start_gr, r.start_v0_fps, r.start_P_psi]]) {
    if (!(c > 0)) continue;
    const b = [ck, r.powder, r.bullet_gr, r1(c)].join('|');
    if (v > 0) copV.add(b + '|' + Math.round(v));
    if (p > 0) copP.add(b + '|' + Math.round(p));
  }
}

// --- lignes ADI en psi, poudre rapportée à l'équivalent Hodgdon -------------------------------------------------------
const L = [], vus = new Set(), n = { lues: 0, equivalent: 0, copies: 0, doublons: 0, inconnues: 0, subsoniques: 0 };
for (const f of ['adi_web.local.json', 'adi.local.json']) {
  for (const r of JSON.parse(fs.readFileSync(d(f))).rows) {
    const pk = EQ[r.powder] || r.powder, ck = matchCal(r.cartridge), ca = ck && CAL[ck], pw = PWD[pk];
    for (const [c, v, p, u, max] of [[r.charge_gr, r.v0_fps, r.Pmax_psi, r.Pmax_unit, true], [r.start_gr, r.start_v0_fps, r.start_P, r.start_unit, false]]) {
      if (!(c > 0 && v > 0 && p > 0 && u === 'PSI')) continue;
      n.lues++;
      if (!(ca && pw && pw.pcd > 0 && ca.case_vol_cm3 > 0 && ['rifle', 'handgun'].includes(ca.type)) ||
          (r.bore_mm && Math.abs(r.bore_mm - ca.bore_mm) > 0.3) || !(r.barrel_mm > ca.case_mm)) { n.inconnues++; continue; }
      const b = [ck, pk, r.bullet_gr, r1(c)].join('|');
      if (vus.has(b + '|' + Math.round(v) + '|' + Math.round(p))) { n.doublons++; continue; }
      vus.add(b + '|' + Math.round(v) + '|' + Math.round(p));
      if (EQ[r.powder]) n.equivalent++;
      if (copV.has(b + '|' + Math.round(v)) || copP.has(b + '|' + Math.round(p))) { n.copies++; continue; }
      // carabine sous 340 m/s : autre régime, hors des ancres (build_anchors.js, 2026-10-15) et hors du domaine du modèle
      if (ca.type === 'rifle' && v * 0.3048 < 340) { n.subsoniques++; continue; }
      L.push({ ck, pk, ca, pw, m: r.bullet_gr, C: c, vPub: v, Ppub: p * PSI, bbl: r.barrel_mm, max, eq: !!EQ[r.powder], pkAdi: r.powder, mono: estMonolithique(r.bullet_desc) });
    }
  }
}

// --- calcul de la page (scripts/check_estimateur_page.py, window.__attendu ; index.php, predict) ----------------------
function page(x) {
  const { ck, pk, ca, pw, m, C, mono } = x, anc = ANC[ck + '|' + pk] || null;
  const A = Math.PI * (ca.bore_mm / 1000) ** 2 / 4, ref = ca.test_barrel_mm || (ca.type === 'handgun' ? 122 : 600);
  const refT = (ref - ca.case_mm) / 1000, uT = (x.bbl - ca.case_mm) / 1000, cv = ca.case_vol_cm3;
  const ff = (C * 0.06479891 / (pw.pcd / 1000)) / cv;
  const b = EM.energyAndEtaP(COEF, pw, ff, Math.log(1 + A * refT / (cv * 1e-6)), m, C, anc, mono ? ca.type : null, ca.type);
  const load = { m_gr: m, C_gr: C, d_mm: ca.bore_mm, barrel_mm: x.bbl, case_mm: ca.case_mm };
  const vRef = EM.velocityFromEnergy(load, b.E);
  const v = VM.scaleByBarrelFor(ca, vRef, refT, uT, cv);
  const P0 = EM.predictPmax({ ...load, barrel_mm: ref }, vRef, b.np);
  let P = P0, cls;
  const win = EM.fenetreMasse(FEN[ck + '|' + pk], m);
  const P2 = EM.pressionDeuxPentes(COEF, anc, win, m, C, ca.type, mono);
  const PL = (P2 == null && anc && anc.np == null) ? EM.pressionPlafondLimite(COEF, ca.pmax_cip_bar, win, m, C, ca.type, mono) : null;
  const PF = (P2 == null && PL == null && !anc) ? EM.pressionFroidMax(COEF, ck, pk, ca, pw, m, C, mono) : null;
  if (P2 != null) { P = EM.pressionServieDeuxPentes(COEF, ca.type, P0, P2); cls = 'deux pentes'; }   // plancher en carabine
  else if (PL != null) { P = Math.sqrt(P * PL); cls = 'plafond déduit de la limite'; }
  else if (anc) cls = anc.np != null ? 'loi des ancres' : 'ancre sans pression ni fenêtre';
  else if (PF != null) { if (Math.sqrt(P * PF) > P) P = Math.sqrt(P * PF); cls = 'à froid, charge maximale estimée'; }
  else cls = 'à froid, hors domaine';
  return { P, P0, P2, v, cls, win, anc };
}

const pc = (v) => (100 * v).toFixed(1);
const st = (e) => `${pc(mean(e)).padStart(5)} / ${pc(Math.sqrt(mean(e.map((v) => v * v)))).padStart(4)} % | sous-estimées >15 % ${pc(e.filter((v) => v < -0.15).length / e.length).padStart(4)} % (une sur ${String(Math.round(e.length / Math.max(1, e.filter((v) => v < -0.15).length))).padStart(3)}) | centile 1 % ${pc(e.slice().sort((a, b) => a - b)[Math.floor(0.01 * e.length)]).padStart(5)} %`;
const R = L.map((x) => { const y = page(x); return { ...x, ...y, e: y.P / x.Ppub - 1, e0: y.P0 / x.Ppub - 1, ev: y.v * 3.28084 / x.vPub - 1 }; });
console.log(`ADI, lignes en psi : ${n.lues} lues, ${n.inconnues} cartouche ou poudre inconnue, ${n.doublons} communes au guide et aux données en ligne,`);
console.log(`  ${n.copies} copies de lignes Hodgdon et ${n.subsoniques} charges subsoniques de carabine écartées ; restent ${L.length} (${L.filter((x) => x.eq).length} sur une poudre rapportée à son équivalent Hodgdon)`);
console.log('\nPression servie / publiée — biais / écart quadratique ; avant les lois des 16-17 octobre (loi des ancres ou modèle à froid) → servie');
const CLS = ['deux pentes', 'plafond déduit de la limite', 'loi des ancres', 'ancre sans pression ni fenêtre', 'à froid, charge maximale estimée', 'à froid, hors domaine'];
for (const t of ['rifle', 'handgun']) {
  console.log(t === 'rifle' ? 'carabine' : 'arme de poing');
  for (const c of CLS) for (const [nom, f] of [['', () => true], [' — maxima', (x) => x.max], [' — départs', (x) => !x.max]]) {
    const s = R.filter((x) => x.ca.type === t && x.cls === c && f(x)); if (s.length < 10 || (nom && s.length === R.filter((x) => x.ca.type === t && x.cls === c).length)) continue;
    console.log(`  ${(c + nom).padEnd(44)} n ${String(s.length).padStart(4)}\n    avant  ${st(s.map((x) => x.e0))}\n    servie ${st(s.map((x) => x.e))}`);
  }
}
const anc = R.filter((x) => x.ca.type === 'rifle' && x.anc), couples = (a) => new Set(a.map((x) => x.ck + '|' + x.pk)).size;
console.log(`carabine, couples avec données fabricant (${couples(anc)} couples, ${anc.length} charges)\n    avant  ${st(anc.map((x) => x.e0))}\n    servie ${st(anc.map((x) => x.e))}`);
for (const c of CLS) { const g = R.filter((x) => x.cls === c); if (g.length) console.log(`  ${c} : ${couples(g)} couples`); }
// Ce que la page servait AVANT de lire les équivalences (2026-10-17) : la clé ADI, sa densité, sans données ni effet.
const eqR = R.filter((x) => x.eq && PWD[x.pkAdi] && PWD[x.pkAdi].pcd > 0).map((x) => {
  const y = page({ ...x, pk: x.pkAdi, pw: PWD[x.pkAdi] }); return { ...x, eA: y.P / x.Ppub - 1, evA: y.v * 3.28084 / x.vPub - 1 }; });
console.log('\nPoudres ADI de la table, clé ADI (page avant le 2026-10-17) → clé Hodgdon (page servie)');
for (const [n, f] of [['carabine', (x) => x.ca.type === 'rifle'], ['  couples avec données Hodgdon', (x) => x.ca.type === 'rifle' && x.anc], ['  couples sans données', (x) => x.ca.type === 'rifle' && !x.anc]]) {
  const g = eqR.filter(f); if (!g.length) continue;
  console.log(`  ${n} (${couples(g)} couples, ${g.length} charges)\n    pression ${st(g.map((x) => x.eA))}\n          → ${st(g.map((x) => x.e))}\n    vitesse  ${st(g.map((x) => x.evA))}\n          → ${st(g.map((x) => x.ev))}`);
}
const vit = R.filter((x) => x.eq);
console.log(`\nVitesse au canon ADI, poudres rapportées à Hodgdon : ${st(vit.map((x) => x.ev))} (n ${vit.length})`);
if (process.argv.includes('--pires')) {   // les plus sous-estimées, par classe
  for (const c of CLS) {
    const s = R.filter((x) => x.cls === c).sort((a, b) => a.e - b.e).slice(0, 12); if (!s.length) continue;
    console.log(`\n${c}`);
    for (const x of s) console.log(`  ${pc(x.e).padStart(6)} % (avant ${pc(x.e0).padStart(6)} %)  ${x.ck} + ${x.pk}, ${x.m} gr, ${x.C} gr${x.max ? ' max' : ' départ'}, ${Math.round(x.Ppub / PSI)} psi publiés, ${Math.round(x.P / PSI)} servis, ${x.vPub} ft/s, canon ${x.bbl} mm`);
  }
}
if (process.argv.includes('--deux-pentes')) {   // charges maximales ADI contre la fenêtre servie (même masse)
  const s = R.filter((x) => x.cls === 'deux pentes' && x.max), mC = s.map((x) => Math.log(x.C / x.win.cmax)), mP = s.map((x) => Math.log(x.Ppub / x.anc.pc));
  console.log(`\nDeux pentes, charges maximales ADI (${s.length}) : ln(C ADI / plus petit maximum servi) moyenne ${mean(mC).toFixed(3)}, médiane ${mC.slice().sort((a, b) => a - b)[mC.length >> 1].toFixed(3)} ; ln(P ADI / plafond de l'ancre) ${mean(mP).toFixed(3)}`);
  const par = {}; for (const x of s) (par[x.ck + ' + ' + x.pk] = par[x.ck + ' + ' + x.pk] || []).push(x);
  for (const [k, g] of Object.entries(par).sort((a, b) => b[1].length - a[1].length).slice(0, 25))
    console.log(`  ${k.padEnd(40)} n ${String(g.length).padStart(2)}  C/Cmax ${mean(g.map((x) => x.C / x.win.cmax)).toFixed(3)} (fenêtre : ${mean(g.map((x) => x.win.nb)).toFixed(1)} balle(s))  P/pc ${mean(g.map((x) => x.Ppub / x.anc.pc)).toFixed(3)}  écart servi ${pc(mean(g.map((x) => x.e)))} %, avant ${pc(mean(g.map((x) => x.e0)))} %`);
}
if (process.argv.includes('--variantes')) {   // couples de la loi à deux pentes : A loi des ancres, B deux pentes
  console.log('\nCouples de la loi à deux pentes, carabine : A loi des ancres, B loi à deux pentes');
  for (const [nom, f] of [['tout', () => true], ['maxima', (x) => x.max], ['départs', (x) => !x.max]]) {
    const s = R.filter((x) => x.cls === 'deux pentes' && x.ca.type === 'rifle' && f(x)), Pp = (x) => x.Ppub;
    console.log(`  ${nom}`);
    for (const [n, g] of [['A', (x) => x.P0], ['B', (x) => x.P2], ['√(A·B)', (x) => Math.sqrt(x.P0 * x.P2)], ['max(A, B)', (x) => Math.max(x.P0, x.P2)]])
      console.log(`    ${n.padEnd(10)} ${st(s.map((x) => g(x) / Pp(x) - 1))} (n ${s.length})`);
  }
}
