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

// --- Garde-fou de cohérence Mayer-Hart (cross-check vitesse, voir scripts/mayer_hart_crosscheck.js) ---
// Prédit v0 depuis le Pmax MESURÉ + thermochimie (Qex) + géométrie, sans η_b/η_p. Un résidu
// de groupe très atypique signale un couple (v0,Pmax) fabricant douteux. Nécessite Qex.
const RHO_P = 1600, MH_GAMMA = 1.20;
function mhResidual(ca, m_gr, C_gr, v0_ms, Pmax_bar, Qex) {
  if (!(Qex > 0 && v0_ms > 0 && Pmax_bar > 0)) return null;
  const m = m_gr * G, C = C_gr * G, meff = m + C / 3;
  const A = Math.PI * (ca.bore_mm / 1000) ** 2 / 4, L = (ca._bbl - ca.case_mm) / 1000;
  const v0free = ca.case_vol_cm3 * 1e-6 - C / RHO_P; if (!(v0free > 0 && L > 0)) return null;
  const lam = Qex * 1000 * (MH_GAMMA - 1);
  const pq = Math.E * Pmax_bar * 1e5 * (1 + 0.75 * (MH_GAMMA - 1));
  const phi = (C * lam / v0free) / (2 * pq);
  const rr = Math.log((v0free + A * L) / v0free);
  if ((MH_GAMMA - 1) * phi >= 1) return null;
  const Em = (C * lam / (MH_GAMMA - 1)) * (1 - Math.exp(-(MH_GAMMA - 1) * rr) / (1 - (MH_GAMMA - 1) * phi));
  if (!(Em > 0)) return null;
  return (Math.sqrt(2 * Em / meff) / v0_ms - 1) * 100;
}

const groups = {};   // "calKey|pwdKey" -> [{eeff, np, mhr}]
function add(calKey, pwdKey, eeff, np, mhr) {
  if (!calKey || !pwdKey) return;
  const k = calKey + '|' + pwdKey;
  (groups[k] = groups[k] || []).push({ eeff, np, mhr });
}

// Reload Swiss (cartridge/powder already match our keys; eta_p known; compute E_eff)
for (const r of JSON.parse(fs.readFileSync(d('rs_dataset.local.json')))) {
  const ck = calIdx[norm(r.cartridge)];
  const m = r.m_gr * G, C = r.C_gr * G;
  const eeff = (m + C / 3) * r.v0 * r.v0 / (2 * C);
  const mhr = ck ? mhResidual({ ...CAL[ck], _bbl: r.barrel_mm }, r.m_gr, r.C_gr, r.v0, r.Pmax, r.Qex) : null;
  add(ck, pwdIdx[norm(r.powder)] || r.powder, eeff, r.eta_p, mhr);
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
  const mhr = mhResidual({ ...ca, _bbl: r.barrel_mm }, r.bullet_gr, r.charge_gr, v0, Pmax / 1e5, PWD[pk] && PWD[pk].Qex);
  add(ck, pk, me * v0 * v0 / (2 * C), 0.5 * me * v0 * v0 / (Pmax * A * L), mhr);
}

// Vihtavuori (guide 2026, parsé) — VITESSE seulement (eeff). Le np VV serait « au max=CIP »,
// régime différent du np moyenné RS/Western → non mêlé (les couples VV-seuls retombent sur
// le η_p global pour la pression). 2 points vitesse par ligne (start + max).
try {
  for (const r of JSON.parse(fs.readFileSync(d('vihtavuori.local.json'))).rows) {
    const ck = matchCal(r.cartridge); if (!ck) continue; const ca = CAL[ck];
    const pk = pwdIdx[norm(r.powder || '')]; if (!pk) continue;
    const m = r.bullet_gr * G;
    for (const [cgr, v] of [[r.start_gr, r.start_ms], [r.max_gr, r.max_ms]]) {
      if (!(cgr > 0 && v > 0)) continue;
      const C = cgr * G, me = m + C / 3;
      // mhr seulement pour le point max (Pmax≈CIP) si Qex connu + canon
      const isMax = cgr === r.max_gr;
      const mhr = (isMax && ca.pmax_cip_bar && r.barrel_mm)
        ? mhResidual({ ...ca, _bbl: r.barrel_mm }, r.bullet_gr, cgr, v, ca.pmax_cip_bar, PWD[pk] && PWD[pk].Qex) : null;
      add(ck, pk, me * v * v / (2 * C), null, mhr);     // np=null : VV ne contribue qu'à la vitesse
    }
  }
} catch (e) { if (e.code !== 'ENOENT') throw e; }       // fichier local optionnel

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const anchors = {}; let kept = 0;
const looErr = [];
for (const [k, arr] of Object.entries(groups)) {
  if (arr.length < 3) continue;                       // need a few loads
  anchors[k] = { eeff: Math.round(mean(arr.map((x) => x.eeff))), n: arr.length };
  const nps = arr.map((x) => x.np).filter((v) => v != null);   // VV ne fournit pas de np
  if (nps.length) anchors[k].np = +mean(nps).toFixed(4);       // sinon η_p global (UI)
  // résidu MH moyen du groupe (si ≥3 charges avec Qex)
  const mhrs = arr.map((x) => x.mhr).filter((v) => v != null);
  if (mhrs.length >= 3) anchors[k].mhr = +mean(mhrs).toFixed(1);
  kept++;
  // leave-one-out on E_eff -> velocity relative error (~ proportional, /2 for sqrt)
  for (let i = 0; i < arr.length; i++) {
    const others = arr.filter((_, j) => j !== i);
    looErr.push((Math.sqrt(mean(others.map((x) => x.eeff)) / arr[i].eeff) - 1) * 100);
  }
}
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);

// Garde-fou MH : flag les ancres dont le résidu MH s'écarte de >2σ de la cohorte (couple
// (v0,Pmax) fabricant atypique). Seuil relatif à la moyenne (le biais systématique ~+5 %
// de la direction A n'est pas un défaut de groupe).
const covered = Object.values(anchors).filter((a) => a.mhr != null).map((a) => a.mhr);
let flagged = 0;
if (covered.length > 5) {
  const gm = mean(covered), gsd = Math.sqrt(mean(covered.map((x) => (x - gm) ** 2)));
  const thr = 2 * gsd;
  for (const a of Object.values(anchors)) {
    if (a.mhr == null) continue;
    if (Math.abs(a.mhr - gm) > thr) { a.mhflag = true; flagged++; }
  }
  console.log(`garde-fou MH : ${covered.length} ancres couvertes (Qex) | moyenne ${gm.toFixed(1)}% σ ${gsd.toFixed(1)}% | ${flagged} flaguées (|écart|>${thr.toFixed(0)}pts)`);
}

const out = { _doc: 'Ancrages par cartouche|poudre (coef DÉRIVÉS : E_eff moyen J/kg, η_p moyen, n charges). Affinent la prédiction quand le couple est connu (~5% vs ~10% à froid). Pas de données brutes (EULA). Sources : Reload Swiss + Accurate/Ramshot (v0+Pmax) ; Vihtavuori (VITESSE seule -> np absent, l UI replie sur η_p global). mhr = résidu vitesse Mayer-Hart du groupe (% ; cohérence thermochimique du couple v0/Pmax, poudres à Qex) ; mhflag=true si atypique (>2σ) → couple fabricant à vérifier, ancrage pression moins fiable.', _date: new Date().toISOString().slice(0, 10), anchors };
fs.writeFileSync(d('anchors.json'), JSON.stringify(out, null, 1));
console.log(`combos ancrés (≥3 charges) : ${kept} | LOO vitesse RMS ${rms(looErr).toFixed(1)}%`);
console.log('-> data/anchors.json');
