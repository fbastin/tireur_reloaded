/**
 * Harnais de validation du cœur énergie-efficacité (Chantier 5).
 * Lance :  node energy_model.test.js
 * Jeu de référence : data/reference_loads.json (Reload Swiss Guide 2025, cité).
 */
const M = require('./energy_model.js');
const DB = require('./data/reference_loads.json');

const mk = (l) => Object.assign({}, DB.powders[l.powder], l);
const loads = DB.loads.map(mk);
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
function fit(pts) {
  const n = pts.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [x, y] of pts) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return [(sy - b * sx) / n, b];
}

// 1) Efficacités : stabilité physique
const eb = loads.map(l => M.efficiencies(l).eta_b);
const ep = loads.map(l => M.efficiencies(l).eta_p);
const mean = a => a.reduce((s, x) => s + x) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
console.log(`η_b = ${mean(eb).toFixed(3)} ± ${sd(eb).toFixed(3)} (CV ${(sd(eb) / mean(eb) * 100).toFixed(0)}%)`);
console.log(`η_p = ${mean(ep).toFixed(3)} ± ${sd(ep).toFixed(3)} (CV ${(sd(ep) / mean(ep) * 100).toFixed(0)}%)`);

// 2) Calibration par poudre, η(fill%), validation leave-one-out
const byPowder = {};
for (const l of loads) (byPowder[l.powder] = byPowder[l.powder] || []).push(l);
for (const [pw, set] of Object.entries(byPowder)) {
  let ev = [], epr = [];
  for (let i = 0; i < set.length; i++) {
    const tr = set.filter((_, j) => j !== i);
    const fb = fit(tr.map(l => [l.fill, M.efficiencies(l).eta_b]));
    const fp = fit(tr.map(l => [l.fill, M.efficiencies(l).eta_p]));
    const l = set[i];
    const vp = M.predictV0(l, fb[0] + fb[1] * l.fill);
    const pp = M.predictPmax(l, vp, fp[0] + fp[1] * l.fill);
    ev.push((vp - l.v0) / l.v0 * 100);
    epr.push((pp - l.Pmax_bar) / l.Pmax_bar * 100);
  }
  console.log(`${pw} (leave-one-out) : v RMS ${rms(ev).toFixed(1)}% | P RMS ${rms(epr).toFixed(1)}%`);
}
