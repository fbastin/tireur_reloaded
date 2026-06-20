/**
 * 02_build_dataset.js — enrich raw rows into per-load efficiency records.
 *
 * Input : data/rs_loads.local.json        (from 01_parse_guide.js)
 *         data/powders.json, data/calibers.json
 * Output: data/rs_dataset.local.json       (per-load η_b, η_p, Re, fill — gitignored)
 *
 * Usage : node scripts/02_build_dataset.js
 *
 * η_b is geometry-free; η_p and the expansion ratio Re need bore + travel. The
 * combustion-chamber volume is taken per row from fill% and bulk density
 * (V0 = (C/ρ_bulk)/(fill/100)), the most load-specific estimate available.
 */
const fs = require('fs');
const path = require('path');
const EM = require('../energy_model.js');
const d = (f) => path.join(__dirname, '..', 'data', f);

const rows = JSON.parse(fs.readFileSync(d('rs_loads.local.json')));
const PWD = JSON.parse(fs.readFileSync(d('powders.json'))).powders;
const CAL = JSON.parse(fs.readFileSync(d('calibers.json'))).calibers;
const G2KG = 6.479891e-5, GR2G = 0.06479891;

const out = [];
let skipped = 0;
for (const r of rows) {
  const pw = PWD[r.powder], cal = CAL[r.cartridge];
  if (!pw || !cal) { skipped++; continue; }
  for (const level of ['min', 'max']) {
    const b = r[level];
    if (!(b.C_gr > 0 && b.v0 > 0)) continue;
    const load = {
      m_gr: r.bullet_gr, C_gr: b.C_gr, d_mm: cal.bore_mm, barrel_mm: r.barrel_mm,
      case_mm: cal.case_mm, Qex_kJkg: pw.Qex, v0: b.v0, Pmax_bar: b.Pmax,
    };
    const eff = EM.efficiencies(load);                                   // η_b, η_p (single source of truth)
    const caseVol_m3 = (b.C_gr * GR2G / (pw.pcd / 1000)) / (b.fill / 100) * 1e-6;
    const A = EM.area(cal.bore_mm / 1000), travel = EM.travel(load);
    const Re = 1 + (A * travel) / caseVol_m3;
    out.push({
      cartridge: r.cartridge, powder: r.powder, level, m_gr: r.bullet_gr, C_gr: b.C_gr,
      v0: b.v0, Pmax: b.Pmax, fill: b.fill, barrel_mm: r.barrel_mm,
      Qex: pw.Qex, Ba: pw.Ba, Re: +Re.toFixed(4),
      eta_b: +eff.eta_b.toFixed(5), eta_p: +eff.eta_p.toFixed(5),
    });
  }
}
fs.writeFileSync(d('rs_dataset.local.json'), JSON.stringify(out, null, 1));
console.log(`built ${out.length} efficiency records (${skipped} rows skipped: unknown powder/cartridge)`);
console.log(`-> ${d('rs_dataset.local.json')}  (gitignored)`);
