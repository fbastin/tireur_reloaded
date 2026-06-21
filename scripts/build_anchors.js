/**
 * build_anchors.js — derive per-(cartridge×powder) anchor coefficients from the local
 * manufacturer datasets, so the tool can refine a known combo from ~10% (cold) to ~5%.
 *
 * Usage : node scripts/build_anchors.js
 * Inputs (local, gitignored): data/rs_dataset.local.json, data/western.local.json
 * Output (PUBLISHED, derived only — no raw load tables): data/anchors.json
 *   { "<caliberKey>|<powderKey>": { eeff: J/kg, np: η_p, n: count } }
 *
 * Anchors store only the mean effective energy E_eff (=η_b·Qex) and mean η_p of the
 * combo — derived constants, not the manufacturer rows.
 */
const fs = require('fs');
const path = require('path');
const d = (f) => path.join(__dirname, '..', 'data', f);
const CAL = JSON.parse(fs.readFileSync(d('calibers.json'))).calibers;
const PWD = JSON.parse(fs.readFileSync(d('powders.json'))).powders;
const G = 6.479891e-5, GR2G = 0.06479891;
const norm = (s) => String(s).toLowerCase().replace(/\(.*?\)/g, '').replace(/winchester/g, 'win').replace(/remington/g, 'rem').replace(/magnum/g, 'mag').replace(/springfield/g, 'spring').replace(/[^a-z0-9]/g, '');
const calIdx = {};
for (const k of Object.keys(CAL)) { calIdx[norm(k)] = k; for (const a of (CAL[k].aliases || [])) calIdx[norm(a)] = k; }
const pwdIdx = {}; for (const k of Object.keys(PWD)) pwdIdx[norm(k)] = k;
// Variantes de pression (+P/+P+) = même étui → on les ramène à la cartouche de base.
const stripVariant = (s) => String(s).replace(/\s*\+p\+?\b/ig, '').replace(/\bfor ar-?15.*/i, '');
const matchCal = (name) => calIdx[norm(name)] || calIdx[norm(stripVariant(name))] || null;
// Lignes parasites du guide (en-têtes de spec, pas des cartouches).
const isJunkCart = (s) => /\bpsi\b|specification|standard saami/i.test(String(s));

const groups = {};   // "calKey|pwdKey" -> [{eeff, np}]
function add(calKey, pwdKey, eeff, np) {
  if (!calKey || !pwdKey) return;
  const k = calKey + '|' + pwdKey;
  (groups[k] = groups[k] || []).push({ eeff, np });
}

// Reload Swiss (cartridge/powder already match our keys; eta_p known; compute E_eff)
for (const r of JSON.parse(fs.readFileSync(d('rs_dataset.local.json')))) {
  const m = r.m_gr * G, C = r.C_gr * G;
  const eeff = (m + C / 3) * r.v0 * r.v0 / (2 * C);
  add(calIdx[norm(r.cartridge)], pwdIdx[norm(r.powder)] || r.powder, eeff, r.eta_p);
}
// Western (Accurate/Ramshot) — match keys, bore guard
for (const r of JSON.parse(fs.readFileSync(d('western.local.json'))).rows) {
  if (isJunkCart(r.cartridge)) continue;
  const ck = matchCal(r.cartridge); if (!ck) continue; const ca = CAL[ck];
  if (r.bore_mm && Math.abs(r.bore_mm - ca.bore_mm) > 0.3) continue;
  if (!(r.charge_gr > 0 && r.v0_fps > 0 && r.barrel_mm > ca.case_mm)) continue;
  const pk = pwdIdx[norm(r.powder || '')]; if (!pk) continue;
  const m = r.bullet_gr * G, C = r.charge_gr * G, me = m + C / 3;
  const A = Math.PI * (ca.bore_mm / 1000) ** 2 / 4, L = (r.barrel_mm - ca.case_mm) / 1000;
  const v0 = r.v0_fps * 0.3048, Pmax = r.Pmax_psi * 0.0689476 * 1e5;
  add(ck, pk, me * v0 * v0 / (2 * C), 0.5 * me * v0 * v0 / (Pmax * A * L));
}

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const anchors = {}; let kept = 0;
const looErr = [];
for (const [k, arr] of Object.entries(groups)) {
  if (arr.length < 3) continue;                       // need a few loads
  anchors[k] = { eeff: Math.round(mean(arr.map((x) => x.eeff))), np: +mean(arr.map((x) => x.np)).toFixed(4), n: arr.length };
  kept++;
  // leave-one-out on E_eff -> velocity relative error (~ proportional, /2 for sqrt)
  for (let i = 0; i < arr.length; i++) {
    const others = arr.filter((_, j) => j !== i);
    looErr.push((Math.sqrt(mean(others.map((x) => x.eeff)) / arr[i].eeff) - 1) * 100);
  }
}
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
const out = { _doc: 'Ancrages par cartouche|poudre (coef DÉRIVÉS : E_eff moyen J/kg, η_p moyen). Affinent la prédiction quand le couple est connu (~5% vs ~10% à froid). Pas de données brutes (EULA).', _date: new Date().toISOString().slice(0, 10), anchors };
fs.writeFileSync(d('anchors.json'), JSON.stringify(out, null, 1));
console.log(`combos ancrés (≥3 charges) : ${kept} | LOO vitesse RMS ${rms(looErr).toFixed(1)}%`);
console.log('-> data/anchors.json');
