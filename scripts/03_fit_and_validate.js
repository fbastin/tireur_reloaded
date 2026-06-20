/**
 * 03_fit_and_validate.js — fit the efficiency coefficients and validate them.
 *
 * Input : data/rs_dataset.local.json (from 02), data/calibers.json
 * Output: data/model_coefficients.json  (PUBLISHED — derived coefficients only)
 *
 * Usage : node scripts/03_fit_and_validate.js
 *
 * Models (OLS, normal equations):
 *   η_b = β0 + β1·(fill/100) + β2·Ba
 *   η_p = γ0 + γ1·(fill/100) + γ2·ln(Re)
 * Validation: leave-one-powder-out (cold start) and per cartridge×powder
 * leave-one-out (anchored).
 */
const fs = require('fs');
const path = require('path');
const EM = require('../energy_model.js');
const d = (f) => path.join(__dirname, '..', 'data', f);

const D = JSON.parse(fs.readFileSync(d('rs_dataset.local.json')));
const CAL = JSON.parse(fs.readFileSync(d('calibers.json'))).calibers;
const featB = (r) => [1, r.fill / 100, r.Ba];
const featP = (r) => [1, r.fill / 100, Math.log(r.Re)];

function solve(A, b) {
  const n = A.length;
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let r = 0; r < n; r++) { if (r === i) continue; const f = A[r][i] / A[i][i]; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; }
  }
  return b.map((v, i) => v / A[i][i]);
}
function ols(rows, feat, key) {
  const X = rows.map(feat), y = rows.map((r) => r[key]), p = X[0].length;
  const M = Array.from({ length: p }, () => Array(p).fill(0)), bb = Array(p).fill(0);
  for (let k = 0; k < X.length; k++) for (let i = 0; i < p; i++) { bb[i] += X[k][i] * y[k]; for (let j = 0; j < p; j++) M[i][j] += X[k][i] * X[k][j]; }
  return solve(M, bb);
}
const dot = (w, x) => w.reduce((s, v, i) => s + v * x[i], 0);
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
const G2KG = 6.479891e-5;
const v0pred = (r, eb) => Math.sqrt(2 * eb * r.C_gr * G2KG * r.Qex * 1000 / (r.m_gr * G2KG + r.C_gr * G2KG / 3));
function pPred(r, ep) {
  const c = CAL[r.cartridge], A = EM.area(c.bore_mm / 1000), travel = (r.barrel_mm - c.case_mm) / 1000;
  return 0.5 * (r.m_gr * G2KG + r.C_gr * G2KG / 3) * r.v0 * r.v0 / (ep * A * travel) / 1e5;
}

// --- leave-one-powder-out (cold start) ---
const powders = [...new Set(D.map((r) => r.powder))];
let ev = [], ep = [];
for (const pw of powders) {
  const tr = D.filter((r) => r.powder !== pw), te = D.filter((r) => r.powder === pw);
  const wb = ols(tr, featB, 'eta_b'), wp = ols(tr, featP, 'eta_p');
  for (const r of te) { ev.push((v0pred(r, dot(wb, featB(r))) - r.v0) / r.v0 * 100); ep.push((pPred(r, dot(wp, featP(r))) - r.Pmax) / r.Pmax * 100); }
}
const lopoV = rms(ev), lopoP = rms(ep);

// --- per cartridge × powder leave-one-out (anchored velocity) ---
// Within one powder, Ba is constant (collinear with the intercept), so the
// anchored model uses fill only: η_b = a + b·(fill/100).
const featAnchor = (r) => [1, r.fill / 100];
const grp = {}; for (const r of D) (grp[r.cartridge + '|' + r.powder] = grp[r.cartridge + '|' + r.powder] || []).push(r);
let av = [];
for (const pts of Object.values(grp)) {
  if (pts.length < 4) continue;
  for (let i = 0; i < pts.length; i++) {
    const wb = ols(pts.filter((_, j) => j !== i), featAnchor, 'eta_b');
    av.push((v0pred(pts[i], dot(wb, featAnchor(pts[i]))) - pts[i].v0) / pts[i].v0 * 100);
  }
}

// --- final fit on all data + write published coefficients ---
const wb = ols(D, featB, 'eta_b'), wp = ols(D, featP, 'eta_p');
const coef = {
  _doc: 'Derived (publishable) coefficients of the energy-efficiency model. Calibrated on a manufacturer guide; raw load tables are NOT redistributed (EULA).',
  _date: new Date().toISOString().slice(0, 10),
  _credit: "Component database derived from Gordon's Reloading Tool (Gordon, deceased) and the community (zen/grt_databases, CC0 1.0).",
  _n_records: D.length, _n_powders: powders.length,
  eta_b: { features: ['1', 'fill/100', 'Ba'], coef: wb.map((x) => +x.toFixed(5)), lopo_v_rms_pct: +lopoV.toFixed(1), note: "cold prior; ~5% when anchored on a cartridge x powder, near-exact with user's own chrono" },
  eta_p: { features: ['1', 'fill/100', 'ln(Re)'], coef: wp.map((x) => +x.toFixed(5)), lopo_P_rms_pct: +lopoP.toFixed(1), note: 'Re = 1 + A*travel/V0; pressure is INDICATIVE only' },
};
fs.writeFileSync(d('model_coefficients.json'), JSON.stringify(coef, null, 2));

console.log(`records ${D.length} | powders ${powders.length}`);
console.log(`η_b = ${wb.map((x) => x.toFixed(4))}  (1, fill/100, Ba)`);
console.log(`η_p = ${wp.map((x) => x.toFixed(4))}  (1, fill/100, lnRe)`);
console.log(`LOPO (cold)     : v ${lopoV.toFixed(1)}%  | P ${lopoP.toFixed(1)}%`);
console.log(`anchored LOO    : v ${rms(av).toFixed(1)}%  (${av.length} pts)`);
console.log(`-> ${d('model_coefficients.json')}  (published)`);
