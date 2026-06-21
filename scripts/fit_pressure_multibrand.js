/**
 * fit_pressure_multibrand.js — recalibrate η_p on multiple brands (Reload Swiss +
 * Accurate/Ramshot from the Western guide) to reduce the cross-brand pressure bias.
 *
 * Usage : node scripts/fit_pressure_multibrand.js
 * Inputs (local, gitignored): data/rs_dataset.local.json, data/western.local.json
 * Output: updates only the eta_p block of data/model_coefficients.json.
 *
 * η_p = γ0 + γ1·(fill/100) + γ2·ln(Re), η_p ≡ ½ m_e v0² / (Pmax·A·L).
 */
const fs = require('fs');
const path = require('path');
const d = (f) => path.join(__dirname, '..', 'data', f);
const CAL = JSON.parse(fs.readFileSync(d('calibers.json'))).calibers;
const PWD = JSON.parse(fs.readFileSync(d('powders.json'))).powders;
const G = 6.479891e-5, GR2G = 0.06479891;
const norm = (s) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/winchester/g, 'win').replace(/remington/g, 'rem').replace(/magnum/g, 'mag').replace(/springfield/g, 'spring').replace(/[^a-z0-9]/g, '');
const calIdx = {}; for (const k of Object.keys(CAL)) calIdx[norm(k)] = k;
const pcdIdx = {}; for (const k of Object.keys(PWD)) if (PWD[k].pcd) pcdIdx[norm(k)] = PWD[k].pcd;

// --- build η_p records: {fill, Re, eta_p, brand} ---
const rec = [];
// Reload Swiss (already computed)
for (const r of JSON.parse(fs.readFileSync(d('rs_dataset.local.json'))))
  rec.push({ fill: r.fill, Re: r.Re, eta_p: r.eta_p, brand: 'ReloadSwiss' });
// Western (Accurate/Ramshot)
let wUsed = 0;
for (const r of JSON.parse(fs.readFileSync(d('western.local.json'))).rows) {
  const ck = calIdx[norm(r.cartridge)]; if (!ck) continue; const ca = CAL[ck];
  if (r.bore_mm && Math.abs(r.bore_mm - ca.bore_mm) > 0.3) continue;
  const pcd = pcdIdx[norm(r.powder || '')]; if (!pcd) continue;
  if (!(r.charge_gr > 0 && r.v0_fps > 0 && r.barrel_mm > ca.case_mm)) continue;
  const m = r.bullet_gr * G, C = r.charge_gr * G, me = m + C / 3;
  const A = Math.PI * (ca.bore_mm / 1000) ** 2 / 4, L = (r.barrel_mm - ca.case_mm) / 1000;
  const v0 = r.v0_fps * 0.3048, Pmax = r.Pmax_psi * 0.0689476 * 1e5;
  const fill = (r.charge_gr * GR2G / (pcd / 1000)) / ca.case_vol_cm3 * 100;
  const Re = 1 + (A * L) / (ca.case_vol_cm3 * 1e-6);
  const eta_p = 0.5 * me * v0 * v0 / (Pmax * A * L);
  rec.push({ fill, Re, eta_p, brand: r.powder.split(' ')[0] });
  wUsed++;
}

// --- OLS ---
function solve(A, b) { const n = A.length; for (let i = 0; i < n; i++) { let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r; [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]]; for (let r = 0; r < n; r++) { if (r === i) continue; const f = A[r][i] / A[i][i]; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; } } return b.map((v, i) => v / A[i][i]); }
function ols(rows, feat, key) { const X = rows.map(feat), y = rows.map((r) => r[key]), p = X[0].length; const M = Array.from({ length: p }, () => Array(p).fill(0)), bb = Array(p).fill(0); for (let k = 0; k < X.length; k++) for (let i = 0; i < p; i++) { bb[i] += X[k][i] * y[k]; for (let j = 0; j < p; j++) M[i][j] += X[k][i] * X[k][j]; } return solve(M, bb); }
const featP = (r) => [1, r.fill / 100, Math.log(r.Re)];
const dot = (w, x) => w.reduce((s, v, i) => s + v * x[i], 0);

// Pmax prediction error (% ) given η_p coef, evaluated on a record (needs back-calc of Pmax from eta_p def)
// We assess via η_p directly: relative error of predicted vs actual η_p -> equals relative Pmax error (since Pmax ∝ 1/η_p, small-err approx). Report η_p RMS.
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
const bias = (a) => a.reduce((s, x) => s + x) / a.length;
function pErr(set, w) { return set.map((r) => { const ep = dot(w, featP(r)); return (r.eta_p / ep - 1) * 100; }); } // Pmax_pred/Pmax_act = eta_p_act/eta_p_pred

const old = JSON.parse(fs.readFileSync(d('model_coefficients.json'))).eta_p.coef;
const neu = ols(rec, featP, 'eta_p');
const rs = rec.filter((r) => r.brand === 'ReloadSwiss'), we = rec.filter((r) => r.brand !== 'ReloadSwiss');
console.log(`records: RS ${rs.length} + Western ${wUsed} = ${rec.length}`);
console.log(`η_p OLD ${old.map((x) => x.toFixed(4))}  ->  NEW ${neu.map((x) => x.toFixed(4))}`);
for (const [nm, set] of [['RS', rs], ['Western', we], ['ALL', rec]]) {
  const eo = pErr(set, old), en = pErr(set, neu);
  console.log(`  ${nm}: Pmax RMS ${rms(eo).toFixed(1)}%→${rms(en).toFixed(1)}%  | biais ${bias(eo).toFixed(1)}%→${bias(en).toFixed(1)}%`);
}

// write back
const coef = JSON.parse(fs.readFileSync(d('model_coefficients.json')));
coef.eta_p.coef = neu.map((x) => +x.toFixed(5));
coef.eta_p.note = 'Re = 1 + A*travel/V0; pression INDICATIVE. Calé multi-marques (Reload Swiss + Accurate/Ramshot) ; sous-estimation résiduelle possible.';
coef.eta_p.lopo_P_rms_pct = +rms(pErr(rec, neu)).toFixed(1);
coef._date = new Date().toISOString().slice(0, 10);
fs.writeFileSync(d('model_coefficients.json'), JSON.stringify(coef, null, 2) + '\n');
console.log('-> model_coefficients.json (eta_p mis à jour)');
