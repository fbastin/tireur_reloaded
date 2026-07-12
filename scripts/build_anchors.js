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
// Index poudres : clé complète d'abord (prioritaire), puis le nom de produit seul
// (« Benchmark », « Varget »…) pour les sources qui n'écrivent pas le fabricant (Sierra).
const pwdIdx = {}; for (const k of Object.keys(PWD)) pwdIdx[norm(k)] = k;
for (const k of Object.keys(PWD)) { const nm = norm(PWD[k].name || ''); if (nm && !pwdIdx[nm]) pwdIdx[nm] = k; }
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

// Norma (Reloading Data — Balistix, 2023, parsé) — VITESSE seulement (eeff ; np=null →
// η_p global). Poudres Norma SANS Qex (→ mhr=null). Pas de longueur de canon publiée :
// v0 traitée comme au canon de référence (comme Vihtavuori). 2 points par ligne.
try {
  for (const r of JSON.parse(fs.readFileSync(d('norma.local.json'))).rows) {
    const ck = matchCal(r.cartridge); if (!ck) continue;
    const pk = pwdIdx[norm(r.powder || '')]; if (!pk) continue;
    const m = r.bullet_gr * G;
    for (const [cgr, v] of [[r.start_gr, r.start_ms], [r.max_gr, r.max_ms]]) {
      if (!(cgr > 0 && v > 0)) continue;
      const C = cgr * G, me = m + C / 3;
      add(ck, pk, me * v * v / (2 * C), null, null);   // np=null : Norma ne contribue qu'à la vitesse
    }
  }
} catch (e) { if (e.code !== 'ENOENT') throw e; }       // fichier local optionnel

// Speer — PDF en ligne par cartouche/balle (start + max). VITESSE seule (eeff ; np=null).
// Pas de longueur de canon publiée → v0 au canon de référence (comme Norma). Tous les
// fichiers data/speer_*.local.json.
try {
  const speerFiles = fs.readdirSync(path.join(__dirname, '..', 'data')).filter((f) => /^speer_.*\.local\.json$/.test(f));
  for (const f of speerFiles) {
    for (const r of JSON.parse(fs.readFileSync(d(f))).rows) {
      const ck = matchCal(r.cartridge); if (!ck) continue;
      const pk = pwdIdx[norm(r.powder || '')]; if (!pk) continue;
      const m = r.bullet_gr * G;
      for (const [cgr, v] of [[r.start_gr, r.start_ms], [r.max_gr, r.max_ms]]) {
        if (!(cgr > 0 && v > 0)) continue;
        const C = cgr * G, me = m + C / 3;
        add(ck, pk, me * v * v / (2 * C), null, null);
      }
    }
  }
} catch (e) { if (e.code !== 'ENOENT') throw e; }       // fichiers locaux optionnels

// Alliant (Reloader's Guide, PDF officiel à couche texte — pas d'OCR). Charges MAXIMALES
// seulement → 1 point par ligne, comme LoadData. VITESSE seule (eeff ; np=null). Canon
// d'essai SAAMI NON VENTÉ, longueur non publiée → v0 au canon de référence (comme Norma).
// Balles plomb écartées à l'extraction (coefficients calés sur du chemisé).
try {
  for (const r of JSON.parse(fs.readFileSync(d('alliant.local.json'))).rows) {
    const ck = matchCal(r.cartridge); if (!ck) continue;
    const pk = pwdIdx[norm(r.powder || '')]; if (!pk) continue;
    if (!(r.charge_gr > 0 && r.v0_fps > 0)) continue;
    const m = r.bullet_gr * G, C = r.charge_gr * G, me = m + C / 3, v = r.v0_fps * 0.3048;
    add(ck, pk, me * v * v / (2 * C), null, null);
  }
} catch (e) { if (e.code !== 'ENOENT') throw e; }       // fichier local optionnel

// Lovex / Explosia (guide officiel, normes CIP) — LA SEULE source « web » qui publie à la
// fois la LONGUEUR DE CANON et la PRESSION : elle alimente donc la VITESSE *et* la PRESSION
// (η_p), comme Reload Swiss / Western, et pas seulement E_eff. La pression publiée est celle
// de la charge MAX -> np n'est calculé que sur ce point ; la charge de départ ne donne que eeff.
try {
  for (const r of JSON.parse(fs.readFileSync(d('lovex.local.json'))).rows) {
    const ck = matchCal(r.cartridge); if (!ck) continue; const ca = CAL[ck];
    const pk = pwdIdx[norm(r.powder || '')]; if (!pk) continue;
    if (!(r.barrel_mm > ca.case_mm)) continue;
    const m = r.bullet_gr * G;
    const A = Math.PI * (ca.bore_mm / 1000) ** 2 / 4, L = (r.barrel_mm - ca.case_mm) / 1000;
    for (const [cgr, v, pbar] of [[r.start_gr, r.start_ms, null], [r.max_gr, r.max_ms, r.max_Pmax_bar]]) {
      if (!(cgr > 0 && v > 0)) continue;
      const C = cgr * G, me = m + C / 3;
      const np = pbar > 0 ? 0.5 * me * v * v / (pbar * 1e5 * A * L) : null;
      const mhr = pbar > 0 ? mhResidual({ ...ca, _bbl: r.barrel_mm }, r.bullet_gr, cgr, v, pbar, PWD[pk] && PWD[pk].Qex) : null;
      add(ck, pk, me * v * v / (2 * C), np, mhr);
    }
  }
} catch (e) { if (e.code !== 'ENOENT') throw e; }       // fichier local optionnel

// Vectan / Nobel Sport (catalogue officiel) — charge DÉPART + MAX, données NORMES CIP.
// VITESSE seule (eeff ; np=null). Pas de longueur de canon publiée → v0 au canon de référence
// (comme Norma). Seules les lignes dont la balle est NON AMBIGUË sont extraites (cf. parseur).
try {
  for (const r of JSON.parse(fs.readFileSync(d('vectan.local.json'))).rows) {
    const ck = matchCal(r.cartridge); if (!ck) continue;
    const pk = pwdIdx[norm(r.powder || '')]; if (!pk) continue;
    const m = r.bullet_gr * G;
    for (const [cgr, v] of [[r.start_gr, r.start_ms], [r.max_gr, r.max_ms]]) {
      if (!(cgr > 0 && v > 0)) continue;
      const C = cgr * G, me = m + C / 3;
      add(ck, pk, me * v * v / (2 * C), null, null);
    }
  }
} catch (e) { if (e.code !== 'ENOENT') throw e; }       // fichier local optionnel

// LoadData.com (agrégateur ; données issues de manuels fabricant) — pages uniques
// ouvertes par l'utilisateur, charge→vitesse. VITESSE seule (eeff ; np=null). Souvent
// du revolver (canon ventilé) → v0 traitée au canon de référence (pas de loi de canon).
try {
  const ldFiles = fs.readdirSync(path.join(__dirname, '..', 'data')).filter((f) => /^loaddata_.*\.local\.json$/.test(f));
  for (const f of ldFiles) {
    for (const r of JSON.parse(fs.readFileSync(d(f))).rows) {
      const ck = matchCal(r.cartridge); if (!ck) continue;
      const pk = pwdIdx[norm(r.powder || '')]; if (!pk) continue;
      if (!(r.charge_gr > 0 && r.v0_fps > 0)) continue;
      const m = r.bullet_gr * G, C = r.charge_gr * G, me = m + C / 3, v = r.v0_fps * 0.3048;
      add(ck, pk, me * v * v / (2 * C), null, null);
    }
  }
} catch (e) { if (e.code !== 'ENOENT') throw e; }       // fichiers locaux optionnels

// Sierra — tables charge→vitesse (manuel 6e éd. legacy + PDF en ligne par cartouche).
// VITESSE seule (eeff ; np absent → η_p global). La vitesse est RAMENÉE au canon de
// référence de la cartouche (test_barrel_mm) avant le calcul de eeff (le canon d'essai
// Sierra diffère de la référence ; l'UI rescale ensuite depuis cette référence).
// Tous les fichiers data/sierra_*.local.json sont pris en compte.
try {
  const VM = require('../velocity_model.js');
  const sierraFiles = fs.readdirSync(path.join(__dirname, '..', 'data')).filter((f) => /^sierra_.*\.local\.json$/.test(f));
  for (const f of sierraFiles) {
    for (const r of JSON.parse(fs.readFileSync(d(f))).rows) {
      const ck = matchCal(r.cartridge); if (!ck) continue; const ca = CAL[ck];
      const pk = pwdIdx[norm(r.powder || '')]; if (!pk) continue;
      if (!(r.charge_gr > 0 && r.v0_fps > 0 && r.barrel_mm > ca.case_mm && ca.test_barrel_mm > 0)) continue;
      const m = r.bullet_gr * G, C = r.charge_gr * G, me = m + C / 3;
      const Lsrc = (r.barrel_mm - ca.case_mm) / 1000, Lref = (ca.test_barrel_mm - ca.case_mm) / 1000;
      const vRef = VM.scaleByBarrel(r.v0_fps * 0.3048, Lsrc, Lref);   // canon Sierra → canon de réf
      add(ck, pk, me * vRef * vRef / (2 * C), null, null);
    }
  }
} catch (e) { if (e.code !== 'ENOENT') throw e; }       // fichiers locaux optionnels

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
