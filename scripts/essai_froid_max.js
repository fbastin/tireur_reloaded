/**
 * essai_froid_max.js — pression À FROID d'un couple jamais vu : sa charge maximale estimée par effets cartouche + poudre,
 * puis plafond tiré de la limite. ESSAI (2026-10-16), console seule, n'écrit rien. Résultats : docs/balistique_interieure_roadmap.md.
 *
 * Usage : node scripts/essai_froid_max.js
 *
 * POURQUOI. Sans aucune donnée fabricant pour le couple, l'outil ignore sa charge maximale : la pression à froid est
 * à 25 % d'écart quadratique, une charge sur cinq sous-estimée de plus de 15 %. Mais la cartouche a des maxima publiés
 * pour d'autres poudres, et la poudre pour d'autres cartouches.
 *
 * ESSAI. ln(remplissage à la charge maximale) = a_cartouche + b_poudre + s_type · ln(m / m_cartouche), moindres carrés
 * alternés, validation croisée à 10 groupes de COUPLES (le couple testé n'entre jamais dans le calage). Charge maximale
 * estimée → loi à deux pentes plafonnée à k × la limite (comme pour les couples sans pression publiée), en moyenne
 * géométrique avec le modèle à froid actuel. Couples de carabine et d'arme de poing à limite connue.
 */
const EM = require('../energy_model.js');
const { groups, CAL, PWD } = require('./build_anchors.js');
const COEF = require('../data/model_coefficients.json'), D = COEF.deux_pentes;
const G = 6.479891e-5, GR2G = 0.06479891, ln = Math.log, mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const by = (a, f) => a.reduce((o, r) => ((o[f(r)] = o[f(r)] || []).push(r), o), {});
const paires = Object.keys(groups).filter((k) => { const ck = k.split('|')[0], pw = PWD[k.slice(ck.length + 1)], ca = CAL[ck];
  return pw && ca && pw.pcd > 0 && ca.case_vol_cm3 > 0 && ca.pmax_cip_bar > 0 && (D.types || []).includes(ca.type); });
const info = (k) => { const ck = k.split('|')[0]; return { ck, pk: k.slice(ck.length + 1), ca: CAL[ck], pw: PWD[k.slice(ck.length + 1)] }; };
// données max : une ligne par charge maximale
const MX = [];
for (const k of paires) { const { ck, pk, ca, pw } = info(k);
  for (const r of groups[k]) if (r.max && r.C > 0 && r.m > 0) MX.push({ k, ck, pk, type: ca.type, lm: ln(r.m), y: ln((r.C * GR2G / (pw.pcd / 1000)) / ca.case_vol_cm3) }); }
const lmC = {}; for (const [ck, g] of Object.entries(by(MX, (x) => x.ck))) lmC[ck] = mean(g.map((x) => x.lm));
function caler(rows) {   // moindres carrés alternés : a_c, b_p, pente s par type
  const a = {}, b = {}, s = { rifle: -0.5, handgun: -0.5 };
  for (const x of rows) { a[x.ck] = 0; b[x.pk] = 0; }
  for (let it = 0; it < 30; it++) {
    const ra = by(rows, (x) => x.ck); for (const [c, g] of Object.entries(ra)) a[c] = mean(g.map((x) => x.y - b[x.pk] - s[x.type] * (x.lm - lmC[x.ck])));
    const rb = by(rows, (x) => x.pk); for (const [p, g] of Object.entries(rb)) b[p] = mean(g.map((x) => x.y - a[x.ck] - s[x.type] * (x.lm - lmC[x.ck])));
    for (const t of ['rifle', 'handgun']) { const g = rows.filter((x) => x.type === t); let sxy = 0, sxx = 0;
      for (const x of g) { const dx = x.lm - lmC[x.ck], dy = x.y - a[x.ck] - b[x.pk]; sxy += dx * dy; sxx += dx * dx; } if (sxx > 0) s[t] = sxy / sxx; }
  }
  return { a, b, s };
}
// 10 groupes de couples
const pli = {}; paires.forEach((k, i) => { pli[k] = (i * 7919) % 10; });
const res = [], errC = [];
for (let f = 0; f < 10; f++) {
  const M = caler(MX.filter((x) => pli[x.k] !== f));
  for (const k of paires.filter((k) => pli[k] === f)) {
    const { ck, pk, ca, pw } = info(k); if (M.a[ck] == null || M.b[pk] == null) continue;   // cartouche ou poudre jamais vue ailleurs
    const T = D[ca.type] || {}, gL = EM.penteDeuxPentes(COEF, ca.type), A_ = Math.PI * (ca.bore_mm / 1000) ** 2 / 4;
    const cMax = (m) => Math.exp(M.a[ck] + M.b[pk] + M.s[ca.type] * (ln(m) - lmC[ck])) * ca.case_vol_cm3 * (pw.pcd / 1000) / GR2G;
    for (const r of groups[k]) {
      if (r.max && r.C > 0) errC.push({ type: ca.type, e: cMax(r.m) / r.C - 1 });
      if (!(r.np > 0 && r.P > 0 && r.m > 0 && r.C > 0 && r.eeff > 0)) continue;
      const ff = (r.C * GR2G / (pw.pcd / 1000)) / ca.case_vol_cm3, Lc = r.eeff * r.C * G / (r.P * 1e5 * r.np * A_);
      const p = EM.energyAndEtaP(COEF, pw, ff, ln(1 + A_ * Lc / (ca.case_vol_cm3 * 1e-6)), r.m, r.C, null, null, ca.type);
      const PA = (p.E / r.eeff) * (r.np / p.np);
      const PB = D.plafond_limite[ca.type] * ca.pmax_cip_bar * Math.pow(r.C / cMax(r.m), gL) / r.P;
      res.push({ type: ca.type, src: r.src, max: r.max, A: PA - 1, B: PB - 1, AB: Math.sqrt(PA * PB) - 1 });
    }
  }
}
const pc = (v) => (100 * v).toFixed(1);
const st = (e) => e.length ? `${pc(mean(e)).padStart(5)} / ${pc(Math.sqrt(mean(e.map((v) => v * v)))).padStart(4)} % (${String(e.length).padStart(4)}) | >15 % ${pc(e.filter((v) => v < -0.15).length / e.length).padStart(4)} % | c1 ${pc(e.slice().sort((x, y) => x - y)[Math.floor(0.01 * e.length)]).padStart(5)} %` : '—';
for (const t of ['rifle', 'handgun']) console.log(`charge max prédite, ${t} : ${st(errC.filter((x) => x.type === t).map((x) => x.e))}`);
for (const [n, f] of [['carabine', (x) => x.type === 'rifle'], ['  max', (x) => x.type === 'rifle' && x.max], ['arme de poing', (x) => x.type === 'handgun'], ['  max', (x) => x.type === 'handgun' && x.max]]) {
  const s = res.filter(f); console.log(`${n}\n   A froid ${st(s.map((x) => x.A))}\n   B       ${st(s.map((x) => x.B))}\n   AB      ${st(s.map((x) => x.AB))}`);
}
