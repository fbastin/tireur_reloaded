/**
 * adi_crosscheck.js — le modèle confronté à un CINQUIÈME laboratoire, jamais utilisé.
 *
 * Usage : node scripts/adi_crosscheck.js        (console seule, n'écrit rien)
 * Entrée : data/adi.local.json (gitignoré)
 *
 * ADI (Thales Australia) n'entre ni dans le calage de η_p, ni dans les ancres, ni dans le
 * repli E_eff. Ses poudres portent leurs propres clés (« ADI AR 2208 »), disjointes de celles
 * de Hodgdon : ce test mesure donc le MODÈLE GLOBAL sur données neuves, et non le bénéfice
 * des ancres Hodgdon ajoutées le 2026-08-11.
 *
 * Les lignes en CUP servent la vitesse seule — le CUP n'est pas convertible en psi.
 */
const fs = require('fs');
const path = require('path');
const d = (f) => path.join(__dirname, '..', 'data', f);

const CAL = JSON.parse(fs.readFileSync(d('calibers.json'))).calibers;
const PWD = JSON.parse(fs.readFileSync(d('powders.json'))).powders;
const COEF = JSON.parse(fs.readFileSync(d('model_coefficients.json')));
const ANC = JSON.parse(fs.readFileSync(d('anchors.json'))).anchors;
const G = 6.479891e-5, GR2G = 0.06479891;

const norm = (s) => String(s).toLowerCase().replace(/\(.*?\)/g, '').replace(/winchester/g, 'win')
  .replace(/remington/g, 'rem').replace(/magnum/g, 'mag').replace(/springfield/g, 'spring')
  .replace(/[^a-z0-9]/g, '');
const calIdx = {};
for (const k of Object.keys(CAL)) { calIdx[norm(k)] = k; for (const a of (CAL[k].aliases || [])) calIdx[norm(a)] = k; }
const stripV = (s) => String(s).replace(/\s*\+p\+?\b/ig, '').replace(/\bfor ar-?15.*/i, '');
const matchCal = (n) => calIdx[norm(n)] || calIdx[norm(stripV(n))] || null;

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

const rows = JSON.parse(fs.readFileSync(d('adi.local.json'))).rows;
const etas = [], errP = [], errVanc = [], errVfall = [];
let used = 0, ancres = 0, skipped = 0;

for (const r of rows) {
  const ck = matchCal(r.cartridge); if (!ck) { skipped++; continue; }
  const ca = CAL[ck];
  if (r.bore_mm && Math.abs(r.bore_mm - ca.bore_mm) > 0.3) { skipped++; continue; }
  const pcd = PWD[r.powder] && PWD[r.powder].pcd; if (!pcd) { skipped++; continue; }
  if (!(r.charge_gr > 0 && r.v0_fps > 0 && r.barrel_mm > ca.case_mm)) { skipped++; continue; }

  const m = r.bullet_gr * G, C = r.charge_gr * G, me = m + C / 3;
  const A = Math.PI * (ca.bore_mm / 1000) ** 2 / 4, L = (r.barrel_mm - ca.case_mm) / 1000;
  const v0 = r.v0_fps * 0.3048;
  const fill = (r.charge_gr * GR2G / (pcd / 1000)) / ca.case_vol_cm3 * 100;
  const Re = 1 + (A * L) / (ca.case_vol_cm3 * 1e-6);
  used++;

  // --- vitesse : ancre du couple si elle existe, sinon repli E_eff ---
  const a = ANC[`${ck}|${r.powder}`];
  const eFall = COEF.e_eff.coef[0] + COEF.e_eff.coef[1] * fill / 100;
  const vFall = Math.sqrt(2 * eFall * C / me);
  errVfall.push((vFall / v0 - 1) * 100);
  if (a && a.eeff) { ancres++; errVanc.push((Math.sqrt(2 * a.eeff * C / me) / v0 - 1) * 100); }

  // --- pression : seulement sur les lignes en PSI ---
  if (!r.Pmax_psi) continue;
  const Pmax = r.Pmax_psi * 0.0689476 * 1e5;
  etas.push(0.5 * me * v0 * v0 / (Pmax * A * L));
  const np = COEF.eta_p.coef[0] + COEF.eta_p.coef[1] * fill / 100 + COEF.eta_p.coef[2] * Math.log(Re);
  errP.push(((0.5 * me * v0 * v0 / (np * A * L)) / Pmax - 1) * 100);   // Pmax | v0 réel → isole η_p
}

console.log(`ADI — validation externe : ${used} charges exploitables sur ${rows.length} (${skipped} écartées : cartouche ou poudre inconnue)`);
console.log('');
console.log(`η_p mesuré        : moyenne ${mean(etas).toFixed(3)}  médiane ${med(etas).toFixed(3)}   (n=${etas.length}, lignes PSI)`);
console.log(`   pour mémoire   : Reload Swiss 0,447 · Hodgdon 0,418 · Western 0,399 · Lovex 0,384`);
console.log('');
console.log(`Pression (| v0 réel, isole η_p) : biais ${mean(errP).toFixed(1)}%  RMS ${rms(errP).toFixed(1)}%   n=${errP.length}`);
console.log(`Vitesse, repli à froid          : biais ${mean(errVfall).toFixed(1)}%  RMS ${rms(errVfall).toFixed(1)}%   n=${errVfall.length}`);
if (errVanc.length) {
  console.log(`Vitesse, couples ancrés         : biais ${mean(errVanc).toFixed(1)}%  RMS ${rms(errVanc).toFixed(1)}%   n=${errVanc.length}`);
} else {
  console.log(`Vitesse, couples ancrés         : aucun couple ADI n'est ancré (clés de poudre disjointes)`);
}
