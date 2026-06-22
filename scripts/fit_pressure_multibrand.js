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
const calIdx = {}; for (const k of Object.keys(CAL)) { calIdx[norm(k)] = k; for (const a of (CAL[k].aliases || [])) calIdx[norm(a)] = k; }
const pcdIdx = {}; for (const k of Object.keys(PWD)) if (PWD[k].pcd) pcdIdx[norm(k)] = PWD[k].pcd;
const stripV = (s) => String(s).replace(/\s*\+p\+?\b/ig, '').replace(/\bfor ar-?15.*/i, '');
const matchCal = (n) => calIdx[norm(n)] || calIdx[norm(stripV(n))] || null;

// --- build η_p records: {fill, Re, eta_p, brand} ---
const rec = [];
// Reload Swiss (already computed)
for (const r of JSON.parse(fs.readFileSync(d('rs_dataset.local.json')))) {
  const m = r.m_gr * G, C = r.C_gr * G;
  rec.push({ fill: r.fill, Re: r.Re, eta_p: r.eta_p, eeff: (m + C / 3) * r.v0 * r.v0 / (2 * C), brand: 'ReloadSwiss', src: 'RS' });
}
// Western (Accurate/Ramshot)
let wUsed = 0;
for (const r of JSON.parse(fs.readFileSync(d('western.local.json'))).rows) {
  const ck = matchCal(r.cartridge); if (!ck) continue; const ca = CAL[ck];
  if (r.bore_mm && Math.abs(r.bore_mm - ca.bore_mm) > 0.3) continue;
  const pcd = pcdIdx[norm(r.powder || '')]; if (!pcd) continue;
  if (!(r.charge_gr > 0 && r.v0_fps > 0 && r.barrel_mm > ca.case_mm)) continue;
  const m = r.bullet_gr * G, C = r.charge_gr * G, me = m + C / 3;
  const A = Math.PI * (ca.bore_mm / 1000) ** 2 / 4, L = (r.barrel_mm - ca.case_mm) / 1000;
  const v0 = r.v0_fps * 0.3048, Pmax = r.Pmax_psi * 0.0689476 * 1e5;
  const fill = (r.charge_gr * GR2G / (pcd / 1000)) / ca.case_vol_cm3 * 100;
  const Re = 1 + (A * L) / (ca.case_vol_cm3 * 1e-6);
  const eta_p = 0.5 * me * v0 * v0 / (Pmax * A * L);
  rec.push({ fill, Re, eta_p, eeff: me * v0 * v0 / (2 * C), brand: r.powder.split(' ')[0], src: 'West', v0, C, me, A, L, Pmax_bar: Pmax / 1e5 });
  wUsed++;
}
// Vihtavuori — η_p at the MAX load, whose Pmax = the cartridge CIP (VV loads to the limit).
// Pressure-only (eeff fallback stays calibrated on its own clientele — VV not added there).
const recP = rec.slice();   // η_p training set = RS + Western (+ VV below)
let vUsed = 0;
try {
  for (const r of JSON.parse(fs.readFileSync(d('vihtavuori.local.json'))).rows) {
    const ck = matchCal(r.cartridge); if (!ck) continue; const ca = CAL[ck]; if (!ca.pmax_cip_bar) continue;
    const pcd = pcdIdx[norm(r.powder || '')]; if (!(pcd && r.barrel_mm > ca.case_mm && r.max_ms > 0)) continue;
    const m = r.bullet_gr * G, C = r.max_gr * G, me = m + C / 3;
    const A = Math.PI * (ca.bore_mm / 1000) ** 2 / 4, L = (r.barrel_mm - ca.case_mm) / 1000;
    const fill = (r.max_gr * GR2G / (pcd / 1000)) / ca.case_vol_cm3 * 100, Re = 1 + (A * L) / (ca.case_vol_cm3 * 1e-6);
    recP.push({ fill, Re, eta_p: 0.5 * me * r.max_ms * r.max_ms / (ca.pmax_cip_bar * 1e5 * A * L), src: 'VV' });
    vUsed++;
  }
} catch (e) { if (e.code !== 'ENOENT') throw e; }

// --- OLS ---
function solve(A, b) { const n = A.length; for (let i = 0; i < n; i++) { let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r; [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]]; for (let r = 0; r < n; r++) { if (r === i) continue; const f = A[r][i] / A[i][i]; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; } } return b.map((v, i) => v / A[i][i]); }
function ols(rows, feat, key) { const X = rows.map(feat), y = rows.map((r) => r[key]), p = X[0].length; const M = Array.from({ length: p }, () => Array(p).fill(0)), bb = Array(p).fill(0); for (let k = 0; k < X.length; k++) for (let i = 0; i < p; i++) { bb[i] += X[k][i] * y[k]; for (let j = 0; j < p; j++) M[i][j] += X[k][i] * X[k][j]; } return solve(M, bb); }
// source-equal weighted OLS (weight 1/n_source so RS/Western/VV count the same despite size)
function wols(rows, feat, key) { const cnt = {}; for (const r of rows) cnt[r.src] = (cnt[r.src] || 0) + 1; const p = feat(rows[0]).length, M = Array.from({ length: p }, () => Array(p).fill(0)), bb = Array(p).fill(0); for (const r of rows) { const x = feat(r), w = 1 / cnt[r.src]; for (let i = 0; i < p; i++) { bb[i] += w * x[i] * r[key]; for (let j = 0; j < p; j++) M[i][j] += w * x[i] * x[j]; } } return solve(M, bb); }
const featP = (r) => [1, r.fill / 100, Math.log(r.Re)];
const dot = (w, x) => w.reduce((s, v, i) => s + v * x[i], 0);

// Pmax prediction error (% ) given η_p coef, evaluated on a record (needs back-calc of Pmax from eta_p def)
// We assess via η_p directly: relative error of predicted vs actual η_p -> equals relative Pmax error (since Pmax ∝ 1/η_p, small-err approx). Report η_p RMS.
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
const bias = (a) => a.reduce((s, x) => s + x) / a.length;
function pErr(set, w) { return set.map((r) => { const ep = dot(w, featP(r)); return (r.eta_p / ep - 1) * 100; }); } // Pmax_pred/Pmax_act = eta_p_act/eta_p_pred

const old = JSON.parse(fs.readFileSync(d('model_coefficients.json'))).eta_p.coef;
const neu = wols(recP, featP, 'eta_p');     // 3 sources équipondérées (RS + Western + VV-au-CIP)
const rs = rec.filter((r) => r.brand === 'ReloadSwiss'), we = rec.filter((r) => r.brand !== 'ReloadSwiss');
const vv = recP.filter((r) => r.src === 'VV');
console.log(`records η_p: RS ${rs.length} + Western ${wUsed} + VV-CIP ${vUsed} = ${recP.length}`);
console.log(`η_p OLD ${old.map((x) => x.toFixed(4))}  ->  NEW ${neu.map((x) => x.toFixed(4))}`);
for (const [nm, set] of [['RS', rs], ['Western', we], ['VV-CIP', vv], ['ALL', recP]]) {
  const eo = pErr(set, old), en = pErr(set, neu);
  console.log(`  ${nm}: Pmax RMS ${rms(eo).toFixed(1)}%→${rms(en).toFixed(1)}%  | biais ${bias(eo).toFixed(1)}%→${bias(en).toFixed(1)}%`);
}

// --- E_eff (repli vitesse) : calé sur la CLIENTÈLE du repli, PAS multi-marques ---
// En production, les poudres avec Qex/Ba (RS, VV) passent par la voie η_b et n'utilisent
// JAMAIS E_eff. Or eeff moyen RS ≈ 1.11 MJ/kg vs sans-Qex/Ba (Western) ≈ 1.27 MJ/kg (~14 %).
// Caler E_eff multi-marques tire donc le niveau ~3 % trop bas pour sa vraie clientèle →
// sous-estimation vitesse qui, via Pmax ∝ v0², double en sous-estimation de pression.
// Correctif : caler E_eff sur des charges MESURÉES de poudres sans Qex/Ba (Western :
// Accurate/Ramshot), en CONSERVANT la pente (positive, ~physique, sûre en extrapolation)
// et en recentrant le seul niveau pour annuler le biais vitesse.
const oldE = JSON.parse(fs.readFileSync(d('model_coefficients.json'))).e_eff.coef;
const B_EEFF = 77418; // pente conservée (production)
const vBias = (a) => we.reduce((s, r) => s + (Math.sqrt((a + B_EEFF * r.fill / 100) / r.eeff) - 1), 0) / we.length;
let aLo = 0.8e6, aHi = 1.8e6;                       // bissection : intercept qui annule le biais vitesse sur la clientèle
for (let i = 0; i < 60; i++) { const am = (aLo + aHi) / 2; if (vBias(am) < 0) aLo = am; else aHi = am; }
const neuE = [Math.round((aLo + aHi) / 2), B_EEFF];

// Décomposition reproductible vitesse → pression (clientèle sans Qex/Ba), η_p = coef recalibré.
const ev = (ec, r) => ec[0] + ec[1] * r.fill / 100;                                   // E_eff(fill)
const PmaxPred = (r, v) => 0.5 * r.me * v * v / (dot(neu, featP(r)) * r.A * r.L) / 1e5; // bar
function decompose(tag, ec) {
  const vw = we.map((r) => (Math.sqrt(ev(ec, r) / r.eeff) - 1) * 100);
  const peA = we.map((r) => (PmaxPred(r, r.v0) / r.Pmax_bar - 1) * 100);                          // Pmax | v0 RÉEL → isole η_p
  const peP = we.map((r) => (PmaxPred(r, Math.sqrt(2 * ev(ec, r) * r.C / r.me)) / r.Pmax_bar - 1) * 100); // pipeline complet
  console.log(`  [${tag}] E_eff [${ec.map((x) => Math.round(x))}] | v0 biais ${bias(vw).toFixed(1)}% (RMS ${rms(vw).toFixed(1)}%) | Pmax|v0réel biais ${bias(peA).toFixed(1)}% | Pmax pipeline biais ${bias(peP).toFixed(1)}% (RMS ${rms(peP).toFixed(1)}%)`);
}
console.log(`\nE_eff — clientèle du repli (poudres sans Qex/Ba = Western, n=${we.length}) :`);
decompose('AVANT', oldE);
decompose('APRÈS', neuE);

// write back
const coef = JSON.parse(fs.readFileSync(d('model_coefficients.json')));
coef.eta_p.coef = neu.map((x) => +x.toFixed(5));
coef.eta_p.note = 'Re = 1 + A*travel/V0; pression INDICATIVE. Calé 3 sources ÉQUIPONDÉRÉES (Reload Swiss + Accurate/Ramshot + Vihtavuori-au-CIP) : inclut la charge max au plafond CIP, ce qui réduit la sous-estimation en zone haute (dangereuse) et rend le biais plus cohérent entre sources (max |biais| ~10%). Penche conservateur (sur-prédit légèrement RS / bas remplissage) — direction SÛRE.';
coef.eta_p.lopo_P_rms_pct = +rms(pErr(recP, neu)).toFixed(1);
coef.e_eff.coef = neuE;
coef.e_eff.note = 'FALLBACK quand Qex/Ba inconnus: v0=sqrt(2*E_eff*C/m_e); densité bulk optionnelle (fill nominal sinon). Calé sur la CLIENTÈLE du repli (poudres SANS Qex/Ba : Accurate/Ramshot) — pente conservée, niveau recentré pour annuler le biais vitesse et réduire la sous-estimation de pression (∝ v0²). RS/VV passent par η_b.';
coef.e_eff.lopo_v_rms_pct = +rms(we.map((r) => (Math.sqrt(neuE[0] + neuE[1] * r.fill / 100) / Math.sqrt(r.eeff) - 1) * 100)).toFixed(1);
coef._date = new Date().toISOString().slice(0, 10);
fs.writeFileSync(d('model_coefficients.json'), JSON.stringify(coef, null, 2) + '\n');
console.log('-> model_coefficients.json (eta_p mis à jour)');
