/**
 * fit_froid_max.js — pression À FROID par la charge maximale estimée (bloc `froid_max` de model_coefficients.json).
 *
 * Usage : node scripts/fit_froid_max.js            # valide (validation croisée par couples), console seule
 *         node scripts/fit_froid_max.js --write    # écrit le bloc, si la validation ne se dégrade pas (--force sinon)
 * Après fit_deux_pentes.js (plafond_limite, pentes γL) ; ne dépend ni des ancres ni des fenêtres servies.
 *
 * POURQUOI. Sans aucune donnée fabricant pour le couple, l'outil ignore sa charge maximale : la pression à froid était à
 * 25 % d'écart quadratique, une charge sur cinq sous-estimée de plus de 15 %. Mais la cartouche a des maxima publiés pour
 * d'autres poudres, et la poudre pour d'autres cartouches.
 *
 * MODÈLE. ln(remplissage à la charge maximale) = a[cartouche] + b[poudre] + s[type] · (ln m − lm[cartouche]), moindres
 * carrés alternés sur les charges maximales publiées (toutes sources des ancres). Charge maximale estimée
 * (EnergyModel.chargeMaxEstimee) → loi à deux pentes plafonnée à k × la limite de la cartouche (pressionPlafondLimite) ;
 * la page prend la moyenne géométrique avec le modèle à froid, SANS jamais descendre sous lui (EnergyModel.pressionFroidMax).
 * La charge maximale estimée n'est JAMAIS affichée : ce n'est pas une donnée de rechargement.
 *
 * PRUDENCE (2026-10-16). La validation ne voit que des couples PUBLIÉS, donc adaptés ; un couple sans données est souvent
 * une association que personne ne publie. Une charge maximale estimée trop haute y ferait BAISSER la pression : Accurate
 * 1680, publiée en petits étuis de carabine et en gros calibres droits, estimée à 45 gr en .308 (2 535 → 2 011 bar). D'où
 * le domaine par type d'arme (volume d'étui dans la plage de ceux où la poudre est publiée) et la règle : la moyenne ne
 * sert qu'à RELEVER la pression du modèle à froid. Validation (domaine) : carabine 19,2 → 17,8 %, sous-estimées de plus
 * de 15 % 19,1 → 6,6 % ; arme de poing 31,9 → 31,4 %, 23,0 → 11,8 % (moyenne simple : 14,8 % et 7,5 % ; 22,8 % et 14,4 %).
 *
 * VALIDATION. Croisée à 10 groupes de COUPLES : le couple testé n'entre jamais dans le calage de a et b. Essai du
 * 2026-10-16 : charge maximale à 6,6 % (carabine), 12,3 % (arme de poing) ; pression à froid, carabine 19,9 → 15,6 %,
 * sous-estimées de plus de 15 % 19,5 → 8,5 % ; arme de poing 36,6 → 26,8 %, 22,2 → 14,9 %.
 */
const fs = require('fs');
const path = require('path');
const EM = require('../energy_model.js');
const { groups, CAL, PWD } = require('./build_anchors.js');
const d = (f) => path.join(__dirname, '..', 'data', f);
const COEF = JSON.parse(fs.readFileSync(d('model_coefficients.json'))), D = COEF.deux_pentes;
const G = 6.479891e-5, GR2G = 0.06479891, ln = Math.log, mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const by = (a, f) => a.reduce((o, r) => ((o[f(r)] = o[f(r)] || []).push(r), o), {});
const TYPES = ['rifle', 'handgun'];
if (!(D && D.plafond_limite)) { console.error('bloc deux_pentes.plafond_limite absent : lancer d\'abord node scripts/fit_deux_pentes.js --write'); process.exit(1); }

const info = (k) => { const ck = k.split('|')[0], pk = k.slice(ck.length + 1); return { ck, pk, ca: CAL[ck], pw: PWD[pk] }; };
const paires = Object.keys(groups).filter((k) => { const { ca, pw } = info(k);
  return pw && ca && pw.pcd > 0 && ca.case_vol_cm3 > 0 && ca.pmax_cip_bar > 0 && TYPES.includes(ca.type); });
// une ligne par charge maximale publiée
const MX = [];
for (const k of paires) { const { ck, pk, ca, pw } = info(k);
  for (const r of groups[k]) if (r.max && r.C > 0 && r.m > 0) MX.push({ k, ck, pk, type: ca.type, lm: ln(r.m), y: ln((r.C * GR2G / (pw.pcd / 1000)) / ca.case_vol_cm3) }); }
const lm = {}; for (const [ck, g] of Object.entries(by(MX, (x) => x.ck))) lm[ck] = +mean(g.map((x) => x.lm)).toFixed(4);

function caler(rows) {   // moindres carrés alternés : a[cartouche], b[poudre], pente s par type
  const a = {}, b = {}, s = { rifle: -0.5, handgun: -0.5 };
  for (const x of rows) { a[x.ck] = 0; b[x.pk] = 0; }
  for (let it = 0; it < 40; it++) {
    for (const [c, g] of Object.entries(by(rows, (x) => x.ck))) a[c] = mean(g.map((x) => x.y - b[x.pk] - s[x.type] * (x.lm - lm[x.ck])));
    for (const [p, g] of Object.entries(by(rows, (x) => x.pk))) b[p] = mean(g.map((x) => x.y - a[x.ck] - s[x.type] * (x.lm - lm[x.ck])));
    for (const t of TYPES) { let sxy = 0, sxx = 0;
      for (const x of rows) if (x.type === t) { const dx = x.lm - lm[x.ck]; sxy += dx * (x.y - a[x.ck] - b[x.pk]); sxx += dx * dx; }
      if (sxx > 0) s[t] = sxy / sxx; }
  }
  const r4 = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +v.toFixed(4)]));
  // DOMAINE : volumes d'étui (cm³) des cartouches où la poudre a des maxima publiés. L'effet poudre est additif : il ne
  // sait pas qu'une poudre rapide atteint son plafond bien plus tôt dans un grand étui. Hors de ce domaine (Accurate 1680,
  // publiée en 7,62 × 39 et .300 BLK, appliquée à la .308 : 45 gr estimés), pas d'estimation.
  const dom = {};
  // par TYPE d'arme : la 1680 de Accurate n'est publiée qu'en petits étuis de carabine et en gros calibres droits d'arme de
  // poing (.460 S&W, 3,07 cm³) ; c'est l'arme de poing qui étendait son domaine de carabine jusqu'à la .308.
  for (const x of rows) { const v = CAL[x.ck].case_vol_cm3, cle = x.pk + '|' + x.type, o = (dom[cle] = dom[cle] || [v, v]); o[0] = Math.min(o[0], v); o[1] = Math.max(o[1], v); }
  return { a: r4(a), b: r4(b), s: r4(s), lm, dom: Object.fromEntries(Object.entries(dom).map(([k, [u, w]]) => [k, [+u.toFixed(3), +w.toFixed(3)]])) };
}

// --- validation croisée par couples ---------------------------------------------------------------------------
const pli = {}; paires.forEach((k, i) => { pli[k] = (i * 7919) % 10; });
const res = [], errC = [], froidTout = [];   // froidTout : modèle à froid seul, toutes charges avec pression
for (let f = 0; f < 10; f++) {
  const C2 = { ...COEF, froid_max: caler(MX.filter((x) => pli[x.k] !== f)) };
  for (const k of paires.filter((k) => pli[k] === f)) {
    const { ck, pk, ca, pw } = info(k), A_ = Math.PI * (ca.bore_mm / 1000) ** 2 / 4;
    for (const r of groups[k]) {
      if (!(r.m > 0 && r.C > 0)) continue;
      const cEst = EM.chargeMaxEstimee(C2, ck, pk, ca, pw, r.m);
      if (cEst != null && r.max) errC.push({ type: ca.type, e: cEst / r.C - 1 });
      if (!(r.np > 0 && r.P > 0 && r.eeff > 0)) continue;
      const ff = (r.C * GR2G / (pw.pcd / 1000)) / ca.case_vol_cm3, Lc = r.eeff * r.C * G / (r.P * 1e5 * r.np * A_);
      const p = EM.energyAndEtaP(COEF, pw, ff, ln(1 + A_ * Lc / (ca.case_vol_cm3 * 1e-6)), r.m, r.C, null, null, ca.type);
      const PA = (p.E / r.eeff) * (r.np / p.np);
      froidTout.push({ type: ca.type, e: PA - 1 });
      if (cEst == null) continue;                                   // cartouche ou poudre jamais vue ailleurs, ou hors domaine
      const PB = EM.pressionFroidMax(C2, ck, pk, ca, pw, r.m, r.C) / r.P;
      res.push({ type: ca.type, max: r.max, src: r.src, actuel: PA - 1, servi: Math.sqrt(PA * PB) - 1, prudent: Math.max(PA, Math.sqrt(PA * PB)) - 1 });
    }
  }
}
// Lu par fit_fourchettes.js (plages de pression de la page) : erreurs de validation, sans rien afficher ni écrire.
if (require.main !== module) { module.exports = { res, froidTout }; return; }
const pc = (v) => (100 * v).toFixed(1);
const st = (e) => e.length ? `${pc(mean(e)).padStart(5)} / ${pc(Math.sqrt(mean(e.map((v) => v * v)))).padStart(4)} % (${String(e.length).padStart(4)}) | sous-estimées >15 % ${pc(e.filter((v) => v < -0.15).length / e.length).padStart(4)} % | centile 1 % ${pc(e.slice().sort((x, y) => x - y)[Math.floor(0.01 * e.length)]).padStart(5)} %` : '—';
console.log('Validation croisée par couples (le couple testé hors du calage)');
for (const t of TYPES) console.log(`  charge maximale estimée, ${t === 'rifle' ? 'carabine' : 'arme de poing'} : ${st(errC.filter((x) => x.type === t).map((x) => x.e))}`);
console.log('Pression à froid — modèle à froid → moyenne avec la loi plafonnée à la limite, charge maximale estimée');
for (const [n, f] of [['carabine', (x) => x.type === 'rifle'], ['  charges maximales', (x) => x.type === 'rifle' && x.max], ['arme de poing', (x) => x.type === 'handgun'], ['  charges maximales', (x) => x.type === 'handgun' && x.max]]) {
  const s = res.filter(f); if (s.length) console.log(`  ${n}\n    ${st(s.map((x) => x.actuel))}\n    ${st(s.map((x) => x.servi))}  (moyenne simple, non servie)\n  → ${st(s.map((x) => x.prudent))}  (servie : jamais sous le modèle à froid)`);
}

if (process.argv.includes('--write')) {
  const rms = (a) => Math.sqrt(mean(a.map((v) => v * v))), part = (a) => a.filter((v) => v < -0.15).length / a.length;
  const pire = TYPES.filter((t) => { const x = res.filter((y) => y.type === t);
    return x.length && (rms(x.map((y) => y.prudent)) > rms(x.map((y) => y.actuel)) || part(x.map((y) => y.prudent)) > part(x.map((y) => y.actuel))); });
  if (pire.length && !process.argv.includes('--force')) {
    console.log(`\n-> NON écrit : la pression à froid se dégrade (${pire.join(', ')}). --force pour écrire quand même.`);
    process.exitCode = 1;
  } else {
    COEF.froid_max = { ...caler(MX),
      _doc: 'Pression à froid par la charge maximale estimée (scripts/fit_froid_max.js ; EnergyModel.chargeMaxEstimee, pressionFroidMax) : ln(remplissage à la charge maximale) = a[cartouche] + b[poudre] + s[type]·(ln m − lm[cartouche]), sur les maxima publiés des ancres. Coefficients dérivés : la charge maximale estimée n est jamais affichée ni donnée comme charge de rechargement.',
      _date: new Date().toISOString().slice(0, 10) };
    fs.writeFileSync(d('model_coefficients.json'), JSON.stringify(COEF, null, 2) + '\n');
    console.log(`\n-> bloc \`froid_max\` écrit dans data/model_coefficients.json (${Object.keys(COEF.froid_max.a).length} cartouches, ${Object.keys(COEF.froid_max.b).length} poudres)`);
  }
}
