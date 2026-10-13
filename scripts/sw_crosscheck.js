/**
 * sw_crosscheck.js — le modèle confronté au guide Shooters World (poudres Explosia, données SAAMI).
 *
 * Usage : node scripts/sw_crosscheck.js        (console seule, n'écrit rien)
 * Entrée : data/shooters_world.local.json (gitignoré, scripts/parse_shooters_world.py)
 *
 * Calqué sur adi_crosscheck.js. Ni Shooters World ni Lovex n'entrent dans le calage de η_p, les
 * ancres ou le repli E_eff (aucune ancre ne porte une poudre Lovex ou Shooters World) : c'est le
 * MODÈLE GLOBAL sur données neuves. Charges maximales seulement (pression publiée pour elles).
 *
 * Carabines seulement. Le guide ne donne la longueur du canon que pour 23 lignes (« *24-inch
 * Barrel », « (22" barrel) », « *45" Test Barrel ») ; ailleurs elle est SUPPOSÉE de 24 pouces, et le
 * rapport sépare les deux cas. Écartées : cartouches militaires (5,56 mm, 7,62 mm NATO : étuis plus
 * épais que le volume civil de la base), reprises des données Lovex (scripts/sw_lovex_comparaison.py),
 * lignes sans pression.
 */
const fs = require('fs');
const path = require('path');
const d = (f) => path.join(__dirname, '..', 'data', f);

const CAL = JSON.parse(fs.readFileSync(d('calibers.json'))).calibers;
const PWD = JSON.parse(fs.readFileSync(d('powders.json'))).powders;
const COEF = JSON.parse(fs.readFileSync(d('model_coefficients.json')));
const G = 6.479891e-5, GR2G = 0.06479891, IN = 25.4;

// Libellés du guide -> clés de calibers.json (carabines ; même table que sw_remplissage.py).
const CLE = {
  '.204 Ruger': '204 Ruger', '.22-250 Remington': '22-250 Rem.', '.223 Remington': '223 Rem.',
  '224 Valkyrie': '224 Valkyrie', '.243 Winchester': '243 Win.', '243 Winchester': '243 Win.',
  '.260 Rem': '260 Rem.', '.260 Remington': '260 Rem.', '6mm BR': '6 Norma BR', '6mm BR Norma': '6 Norma BR',
  '6mm Creedmoor': '6 mm Creedmoor', '6XC': '6 XC', '6 mm ARC': '6mm ARC', '6mm ARC': '6mm ARC',
  '6.5 Creedmoor': '6.5 Creedmoor', '6.5 Grendel': '6.5 Grendel', '6.5 Precision Rifle Cartridge': '6.5 PRC',
  '270 Winchester': '270 Win.', '7mm-08': '7 -08 Rem.', '7mm-08 Winchester': '7 -08 Rem.', '7mm Rem Mag': '7 Rem. Mag.',
  '7.62x39': '7.62 x 39', '.30-30 Winchester': '30-30 Win.', '.300 Blackout': '300 AAC BLK', '300 Blackout': '300 AAC BLK',
  '.308 Winchester': '308 Win.', '308 Winchester': '308 Win.', '.30-06 Springfield': '30-06 Spring.',
  '30-06 Springfield Garand': '30-06 Spring.', '.300 Win Mag': '300 Win. Mag.', '.45-70': '45 - 70 Govt.',
  '.458 SOCOM': '458 SOCOM', '458 SOCOM': '458 SOCOM',
};
// Reprises des données Lovex (sw_lovex_comparaison.py, 2026-10-12) : les « psi » sont des bars convertis.
const REPRISES = new Set(['.222 Remington', '.303 British', '7.62x54R', '9.3x62']);

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

const rows = JSON.parse(fs.readFileSync(d('shooters_world.local.json'))).rows;
const res = { donne: { etas: [], errP: [], errV: [] }, suppose: { etas: [], errP: [], errV: [] } };
let used = 0;
const ecart = {};
const ecarter = (r) => { ecart[r] = (ecart[r] || 0) + 1; };
for (const r of rows) {
  const ck = CLE[r.cartouche];
  if (REPRISES.has(r.cartouche)) { ecarter('reprise des données Lovex'); continue; }
  if (!ck) { ecarter('arme de poing, militaire ou cartouche hors base'); continue; }
  const ca = CAL[ck];
  const pcd = PWD[r.poudre] && PWD[r.poudre].pcd;
  if (!ca || !ca.case_vol_cm3 || !pcd) { ecarter('cartouche ou poudre sans volume ni densité'); continue; }
  if (!(r.max_gr > 0 && r.max_fps > 0 && r.max_psi > 0)) { ecarter('sans pression ou sans vitesse maximale'); continue; }
  const cas = r.canon_in ? 'donne' : 'suppose';
  const barrel = (r.canon_in || 24) * IN;
  const m = r.balle_gr * G, C = r.max_gr * G, me = m + C / 3;
  const A = Math.PI * (ca.bore_mm / 1000) ** 2 / 4, L = (barrel - ca.case_mm) / 1000;
  const v0 = r.max_fps * 0.3048;
  const fill = (r.max_gr * GR2G / (pcd / 1000)) / ca.case_vol_cm3 * 100;
  const Re = 1 + (A * L) / (ca.case_vol_cm3 * 1e-6);
  const Pmax = r.max_psi * 0.0689476 * 1e5;
  used++;
  // vitesse, repli à froid (aucune ancre pour ces poudres)
  const eFall = COEF.e_eff.coef[0] + COEF.e_eff.coef[1] * fill / 100;
  res[cas].errV.push((Math.sqrt(2 * eFall * C / me) / v0 - 1) * 100);
  // pression | v0 réel : isole η_p
  res[cas].etas.push(0.5 * me * v0 * v0 / (Pmax * A * L));
  const np = COEF.eta_p.coef[0] + COEF.eta_p.coef[1] * fill / 100 + COEF.eta_p.coef[2] * Math.log(Re);
  res[cas].errP.push(((0.5 * me * v0 * v0 / (np * A * L)) / Pmax - 1) * 100);
}

console.log(`Shooters World — validation externe : ${used} charges maximales de carabine sur ${rows.length} lignes`);
for (const [k, v] of Object.entries(ecart)) console.log(`  écartées : ${String(v).padStart(3)}  ${k}`);
for (const [cas, nom] of [['donne', 'canon donné par le guide'], ['suppose', 'canon supposé de 24 pouces']]) {
  const x = res[cas];
  if (!x.errP.length) continue;
  console.log(`\n${nom} (n = ${x.errP.length})`);
  console.log(`  η_p mesuré   : moyenne ${mean(x.etas).toFixed(3)}  médiane ${med(x.etas).toFixed(3)}`);
  console.log(`  Pression (| v0 réel, isole η_p) : biais ${mean(x.errP).toFixed(1)}%  RMS ${rms(x.errP).toFixed(1)}%`);
  console.log(`  Vitesse, repli à froid          : biais ${mean(x.errV).toFixed(1)}%  RMS ${rms(x.errV).toFixed(1)}%`);
}
console.log(`\n  pour mémoire, η_p : Reload Swiss 0,447 · Hodgdon 0,418 · Western 0,399 · Lovex 0,384 (adi_crosscheck.js)`);
