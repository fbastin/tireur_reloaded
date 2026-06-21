/**
 * mayer_hart_crosscheck.js — independent cross-check of the energy-efficiency model
 * against the closed-form **Mayer–Hart** lumped solution (J. Franklin Inst. 240, 1945).
 *
 * Usage : node scripts/mayer_hart_crosscheck.js [gamma]
 * Input (local, gitignored): data/rs_dataset.local.json (needs Qex per load).
 * Output: console only (a validation report; writes nothing).
 *
 * WHY this is an *independent* check. Mayer–Hart links peak pressure and muzzle
 * velocity through a closed form in γ, the specific force λ=Qex·(γ−1) (thermochemistry)
 * and the expansion ratio (geometry) — NOT through our fitted η_b/η_p. The poorly-known
 * burn-rate constant q is **eliminated** by reading p_q from a measured pressure
 * (MH Eq. 28). So:
 *   - direction A: predict v0 from MEASURED Pmax + thermochemistry  (does not use v0);
 *   - direction B: predict Pmax from MEASURED v0  + thermochemistry  (does not use η_p).
 * Agreement corroborates that the (v0,Pmax) coupling our two efficiencies jointly
 * encode is the same one the classical theory derives.
 *
 * Mayer–Hart equations used (SI; their imperial gravitational constants drop out):
 *   p_c = C·λ / v0free                              (Eq. 8)   constant-volume pressure
 *   p_q = e · Pmax · [1 + ¾(γ−1)]                   (Eq. 28)  back-out from Pmax
 *   φ   = p_c / (2·p_q)                             (Eq. 30)
 *   r   = ln( (v0free + A·L) / v0free )             (Eq. 29)  log expansion ratio
 *   E_m = (Cλ/(γ−1))·(1 − e^{−(γ−1)r}·[1−(γ−1)φ]⁻¹) (Eq. 34)  muzzle energy
 * with v0free = effective case volume − solid propellant volume (covolume ≈ charge
 * volume, MH assumption 2). Formal validity needs φ ≤ 1/(2γ) (Eq. 33′) — see report.
 */
const fs = require('fs');
const path = require('path');
const d = (f) => path.join(__dirname, '..', 'data', f);
const CAL = JSON.parse(fs.readFileSync(d('calibers.json'))).calibers;
const G = 6.479891e-5, RHO_P = 1600;            // kg/grain ; solid propellant density kg/m³
const GAMMA = parseFloat(process.argv[2]) || 1.20;
const norm = (s) => String(s).toLowerCase().replace(/\(.*?\)/g, '').replace(/winchester/g, 'win').replace(/remington/g, 'rem').replace(/magnum/g, 'mag').replace(/springfield/g, 'spring').replace(/[^a-z0-9]/g, '');
const calIdx = {}; for (const k of Object.keys(CAL)) { calIdx[norm(k)] = k; for (const a of (CAL[k].aliases || [])) calIdx[norm(a)] = k; }
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
const bias = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

const vErr = [], pErr = [], phiArr = []; let nViol = 0, total = 0;
for (const r of JSON.parse(fs.readFileSync(d('rs_dataset.local.json')))) {
  const ck = calIdx[norm(r.cartridge)]; if (!ck) continue; const ca = CAL[ck];
  if (!(r.Qex > 0 && r.v0 > 0 && r.Pmax > 0)) continue;
  const m = r.m_gr * G, C = r.C_gr * G, meff = m + C / 3;
  const A = Math.PI * (ca.bore_mm / 1000) ** 2 / 4, L = (r.barrel_mm - ca.case_mm) / 1000;
  const v0free = ca.case_vol_cm3 * 1e-6 - C / RHO_P; if (v0free <= 0) continue;
  const lam = r.Qex * 1000 * (GAMMA - 1);                   // λ impetus, J/kg
  const pc = C * lam / v0free;                              // Eq. 8
  const rr = Math.log((v0free + A * L) / v0free);           // Eq. 29
  total++;

  // direction A: v0 from measured Pmax
  const pq = Math.E * r.Pmax * 1e5 * (1 + 0.75 * (GAMMA - 1)); // Eq. 28
  const phi = pc / (2 * pq);                                   // Eq. 30
  phiArr.push(phi);
  if (phi > 1 / (2 * GAMMA)) nViol++;                          // Eq. 33′ validity
  if ((GAMMA - 1) * phi < 1) {
    const Em = (C * lam / (GAMMA - 1)) * (1 - Math.exp(-(GAMMA - 1) * rr) / (1 - (GAMMA - 1) * phi));
    if (Em > 0) vErr.push((Math.sqrt(2 * Em / meff) / r.v0 - 1) * 100);
  }

  // direction B: Pmax from measured v0 (invert Eq. 34 for φ → p_q → Pmax). η_p NOT used.
  const Em = 0.5 * meff * r.v0 * r.v0;
  const denom = 1 - Em * (GAMMA - 1) / (C * lam);
  if (denom > 0) {
    const phiB = (1 - Math.exp(-(GAMMA - 1) * rr) / denom) / (GAMMA - 1);
    if (phiB > 0) {
      const pqB = pc / (2 * phiB);
      const PmaxB = pqB / (Math.E * (1 + 0.75 * (GAMMA - 1))) / 1e5; // bar
      if (PmaxB > 0) pErr.push((PmaxB / r.Pmax - 1) * 100);
    }
  }
}

console.log(`Mayer–Hart cross-check (γ=${GAMMA}), Reload Swiss thermochem loads`);
console.log(`  loads: ${total} | mean φ = ${mean(phiArr).toFixed(2)} (MH validity needs φ≤${(1 / (2 * GAMMA)).toFixed(2)}; violated by ${nViol}/${total} = ${(100 * nViol / total).toFixed(0)}%)`);
console.log(`  A. v0  from measured Pmax : bias ${bias(vErr).toFixed(1)}%  RMS ${rms(vErr).toFixed(1)}%  (n=${vErr.length})`);
console.log(`  B. Pmax from measured v0  : bias ${bias(pErr).toFixed(1)}%  RMS ${rms(pErr).toFixed(1)}%  (n=${pErr.length})`);
console.log(`  -> independent of η_b/η_p (uses γ, λ=Qex(γ−1), geometry, and one measured value).`);
