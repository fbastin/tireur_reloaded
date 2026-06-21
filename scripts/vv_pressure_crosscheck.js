/**
 * vv_pressure_crosscheck.js — independent PRESSURE check of the η_p model against the
 * Vihtavuori guide. VV states its *max* loads are at the C.I.P./SAAMI pressure limit, so
 * for each VV max load the TRUE peak pressure ≈ the cartridge CIP. We feed VV's measured
 * muzzle velocity + geometry into the production η_p model and compare the predicted Pmax
 * to that CIP — a large, third independent pressure dataset (after Western/SAAMI and
 * QuickLOAD), with an unusually clean ground truth.
 *
 * Usage : node scripts/vv_pressure_crosscheck.js
 * Input : data/vihtavuori.local.json (local/gitignored) + calibers/powders/coefficients.
 * Output: console report only.
 */
const fs = require('fs');
const path = require('path');
const d = (f) => path.join(__dirname, '..', 'data', f);
const CAL = JSON.parse(fs.readFileSync(d('calibers.json'))).calibers;
const PWD = JSON.parse(fs.readFileSync(d('powders.json'))).powders;
const Ep = JSON.parse(fs.readFileSync(d('model_coefficients.json'))).eta_p.coef;
const G = 6.479891e-5, GR2G = 0.06479891;
const norm = (s) => String(s).toLowerCase().replace(/\(.*?\)/g, '').replace(/winchester/g, 'win').replace(/remington/g, 'rem').replace(/magnum/g, 'mag').replace(/springfield/g, 'spring').replace(/[^a-z0-9]/g, '');
const calIdx = {}; for (const k of Object.keys(CAL)) { calIdx[norm(k)] = k; for (const a of (CAL[k].aliases || [])) calIdx[norm(a)] = k; }
const pcdIdx = {}; for (const k of Object.keys(PWD)) if (PWD[k].pcd) pcdIdx[norm(k)] = PWD[k].pcd;
const lin = (c, f) => c.reduce((s, w, i) => s + w * f[i], 0);
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
const bias = (a) => a.reduce((s, x) => s + x, 0) / a.length;

const err = [], byType = { rifle: [], handgun: [] };
let noCip = 0, noGeom = 0, total = 0;
for (const r of JSON.parse(fs.readFileSync(d('vihtavuori.local.json'))).rows) {
  const ck = calIdx[norm(r.cartridge)]; if (!ck) continue; const ca = CAL[ck];
  total++;
  if (!ca.pmax_cip_bar) { noCip++; continue; }                        // need the CIP truth
  const pcd = pcdIdx[norm(r.powder || '')];
  if (!(pcd && r.barrel_mm > ca.case_mm && r.max_ms > 0)) { noGeom++; continue; }
  const m = r.bullet_gr * G, C = r.max_gr * G, me = m + C / 3, v0 = r.max_ms;
  const A = Math.PI * (ca.bore_mm / 1000) ** 2 / 4, L = (r.barrel_mm - ca.case_mm) / 1000;
  const fill = (r.max_gr * GR2G / (pcd / 1000)) / ca.case_vol_cm3 * 100;
  const Re = 1 + (A * L) / (ca.case_vol_cm3 * 1e-6);
  const etap = lin(Ep, [1, fill / 100, Math.log(Re)]);
  const Pmod = 0.5 * me * v0 * v0 / (etap * A * L) / 1e5;             // bar, model η_p + VV v0
  const e = (Pmod / ca.pmax_cip_bar - 1) * 100;                       // vs CIP (truth at max)
  err.push(e); (byType[ca.type] || (byType.rifle)).push(e);
}

console.log('VV pressure cross-check — model Pmax (η_p + VV v0) vs CIP at the max load');
console.log(`  evaluated ${err.length} max loads (skipped: ${noCip} no CIP, ${noGeom} no geom/pcd, of ${total} matched)`);
console.log(`  ALL     : bias ${bias(err).toFixed(1)} %  RMS ${rms(err).toFixed(1)} %`);
for (const t of ['rifle', 'handgun']) if (byType[t].length)
  console.log(`  ${t.padEnd(7)} : bias ${bias(byType[t]).toFixed(1)} %  RMS ${rms(byType[t]).toFixed(1)} %  (n=${byType[t].length})`);
console.log('  (negative bias = model under-predicts pressure vs the CIP ceiling — the §6 ceiling, independently)');
