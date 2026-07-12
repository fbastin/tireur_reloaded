/**
 * etap_refit_experiment.js — faut-il réestimer η_p sur les nouvelles sources ?
 *
 *   node scripts/etap_refit_experiment.js        (rapport console, n'écrit RIEN)
 *
 * RÉSULTAT : NON. Résultat NÉGATIF, conservé pour être reproductible — et pour qu'on ne
 * « corrige » pas naïvement, plus tard, ce qui n'est pas cassé.
 *
 * Contexte : le modèle est calé sur Reload Swiss SEUL (1700 charges), alors que Western
 * (2995 lignes exploitables) et Lovex (563) publient eux aussi vitesse ET pression. La
 * tentation est donc d'élargir le calage.
 *
 * Ce que l'expérience montre :
 *
 *   1. Le η_p OBSERVÉ diffère systématiquement d'une source à l'autre :
 *        Reload Swiss 0,447 | Western 0,399 | Lovex 0,384
 *      La seule source du calage est donc ~14 % AU-DESSUS des deux autres. Ce n'est pas du
 *      bruit : ce sont des bancs, des étuis et des canons d'essai différents.
 *
 *   2. Comme P ∝ 1/η_p, caler « proprement » sur Reload Swiss produit des pressions prédites
 *      trop BASSES sur tout le reste — le sens NON SÛR (on annonce au rechargeur une charge
 *      plus douce qu'elle ne l'est) :
 *
 *        coefficients            RS              Lovex                   Western
 *        actuels (publiés)   +9,8 % / 21,1 %   −7,8 % / 11,5 %      −0,2 % / 21,6 %
 *        recalés sur RS       0,0 % / 16,2 %  −14,5 % (sous-est. 97 %)  −9,2 % (sous-est. 83 %)
 *        recalés RS+Lovex    +3,7 % / 17,1 %  −11,1 %                −5,9 % / 22,9 %
 *
 *      Un recalage « propre » annule le biais sur SON jeu et améliore son RMS (21,1 → 16,2 %)
 *      — tout en dégradant la sécurité partout ailleurs. Le « défaut » des coefficients
 *      actuels (intercept 0,634 au lieu de 0,844) est précisément ce qui compense le décalage
 *      de Reload Swiss et leur donne un biais quasi NUL (−0,2 %) sur Western, le plus grand
 *      jeu indépendant.
 *
 *   3. Corollaire : le plancher de ~20 % de RMS en pression est STRUCTUREL. Trois fabricants
 *      mesurant la même grandeur s'écartent de ±14 % entre eux ; aucun modèle unique ne peut
 *      être juste sur les trois, et aucune quantité de données n'y changera rien. Même
 *      conclusion que la voie ODE (cf. §6.2 de MODEL.md).
 *
 * NB : les variables (fill, Re) sont ici recalculées avec le volume d'étui NOMINAL de
 * calibers.json — c'est-à-dire COMME L'UI LES CALCULE. Le calage historique, lui, dérive le
 * volume ligne par ligne du fill publié par Reload Swiss. Cette incohérence calage/usage
 * existe bel et bien, mais elle compense le décalage de source : la « réparer » seule
 * dégraderait la sécurité (ligne « recalés sur RS » ci-dessus). À ne pas toucher sans relire
 * ce qui précède.
 */
const fs = require('fs');
const path = require('path');
const d = (f) => path.join(__dirname, '..', 'data', f);

const CAL = JSON.parse(fs.readFileSync(d('calibers.json'))).calibers;
const PWD = JSON.parse(fs.readFileSync(d('powders.json'))).powders;
const M = JSON.parse(fs.readFileSync(d('model_coefficients.json')));

const G = 6.479891e-5;
const norm = (s) => String(s).toLowerCase().replace(/\(.*?\)/g, '').replace(/winchester/g, 'win')
  .replace(/remington/g, 'rem').replace(/magnum/g, 'mag').replace(/springfield/g, 'spring')
  .replace(/[^a-z0-9]/g, '');
const calIdx = {}; for (const k of Object.keys(CAL)) { calIdx[norm(k)] = k; for (const a of (CAL[k].aliases || [])) calIdx[norm(a)] = k; }
const pwdIdx = {}; for (const k of Object.keys(PWD)) pwdIdx[norm(k)] = k;
for (const k of Object.keys(PWD)) { const n = norm(PWD[k].name || ''); if (n && !pwdIdx[n]) pwdIdx[n] = k; }

const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

// Ligne exploitable — variables NOMINALES (comme l'UI) pour TOUTES les sources.
function mk(ck, pk, m_gr, C_gr, v0_ms, Pmax_bar, barrel_mm) {
  const ca = CAL[ck], pw = PWD[pk];
  if (!ca || !pw || !(pw.pcd > 0) || !(ca.case_vol_cm3 > 0)) return null;
  if (!(m_gr > 0 && C_gr > 0 && v0_ms > 0 && Pmax_bar > 0 && barrel_mm > ca.case_mm)) return null;
  const m = m_gr * G, C = C_gr * G, me = m + C / 3;
  const A = Math.PI * (ca.bore_mm / 1000) ** 2 / 4;
  const L = (barrel_mm - ca.case_mm) / 1000;
  const fill = (C_gr * 0.06479891 / (pw.pcd / 1000)) / ca.case_vol_cm3 * 100;
  const Re = 1 + (A * L) / (ca.case_vol_cm3 * 1e-6);
  const eta_p = 0.5 * me * v0_ms * v0_ms / (Pmax_bar * 1e5 * A * L);   // η_p observé
  if (!(eta_p > 0 && eta_p < 2 && fill > 20 && fill < 160)) return null;
  return { me, A, L, fill, Re, v0: v0_ms, Pbar: Pmax_bar, eta_p };
}

const RS = [];
for (const r of JSON.parse(fs.readFileSync(d('rs_dataset.local.json')))) {
  const row = mk(calIdx[norm(r.cartridge)], pwdIdx[norm(r.powder)], r.m_gr, r.C_gr, r.v0, r.Pmax, r.barrel_mm);
  if (row) RS.push(row);                                    // NB : Pmax de RS est déjà en bar
}
const LV = [];
try {
  for (const r of JSON.parse(fs.readFileSync(d('lovex.local.json'))).rows) {
    const row = mk(r.cartridge, r.powder, r.bullet_gr, r.max_gr, r.max_ms, r.max_Pmax_bar, r.barrel_mm);
    if (row) LV.push(row);
  }
} catch (e) { if (e.code !== 'ENOENT') throw e; }
const WE = [];
for (const r of JSON.parse(fs.readFileSync(d('western.local.json'))).rows) {
  if (!(r.charge_gr > 0 && r.v0_fps > 0 && r.Pmax_psi > 0 && r.barrel_mm > 0)) continue;
  const row = mk(calIdx[norm(r.cartridge)], pwdIdx[norm(r.powder || '')], r.bullet_gr, r.charge_gr,
                 r.v0_fps * 0.3048, r.Pmax_psi * 0.0689476, r.barrel_mm);
  if (row) WE.push(row);
}
console.log(`jeux : Reload Swiss ${RS.length} (calage actuel) | Lovex ${LV.length} (CIP) | Western ${WE.length} (SAAMI)\n`);

const feat = (r) => [1, r.fill / 100, Math.log(r.Re)];
function ols(rows) {
  const p = 3;
  const XtX = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty = new Array(p).fill(0);
  for (const r of rows) {
    const x = feat(r);
    for (let i = 0; i < p; i++) { for (let j = 0; j < p; j++) XtX[i][j] += x[i] * x[j]; Xty[i] += x[i] * r.eta_p; }
  }
  const Mx = XtX.map((row, i) => [...row, Xty[i]]);
  for (let i = 0; i < p; i++) {
    let mx = i; for (let k = i + 1; k < p; k++) if (Math.abs(Mx[k][i]) > Math.abs(Mx[mx][i])) mx = k;
    [Mx[i], Mx[mx]] = [Mx[mx], Mx[i]];
    for (let k = i + 1; k < p; k++) { const f = Mx[k][i] / Mx[i][i]; for (let j = i; j <= p; j++) Mx[k][j] -= f * Mx[i][j]; }
  }
  const w = new Array(p).fill(0);
  for (let i = p - 1; i >= 0; i--) { let s = Mx[i][p]; for (let j = i + 1; j < p; j++) s -= Mx[i][j] * w[j]; w[i] = s / Mx[i][i]; }
  return w;
}
const dot = (w, x) => w.reduce((s, wi, i) => s + wi * x[i], 0);

// Erreur de pression. NÉGATIF = sous-estimation = sens NON SÛR.
function evalP(rows, w) {
  const e = [];
  for (const r of rows) {
    const etap = dot(w, feat(r));
    if (!(etap > 0)) continue;
    const Ppred = 0.5 * r.me * r.v0 * r.v0 / (etap * r.A * r.L) / 1e5;
    e.push((Ppred - r.Pbar) / r.Pbar * 100);
  }
  if (!e.length) return { n: 0 };
  return { n: e.length, biais: mean(e), rms: rms(e), sous: 100 * e.filter((x) => x < 0).length / e.length };
}
const show = (label, s) => s.n
  ? console.log(`   ${label.padEnd(32)} n=${String(s.n).padStart(4)}  biais ${s.biais >= 0 ? '+' : ''}${s.biais.toFixed(1)} %  RMS ${s.rms.toFixed(1)} %  (pression SOUS-estimée dans ${s.sous.toFixed(0)} % des cas)`)
  : console.log(`   ${label.padEnd(32)} (jeu vide)`);

const wCur = M.eta_p.coef, wRS = ols(RS), wRSLV = LV.length ? ols(RS.concat(LV)) : null;
console.log('COEFFICIENTS  [γ0, γ1·fill, γ2·ln(Re)]');
console.log('   actuels (publiés)    :', wCur.map((x) => x.toFixed(5)).join(', '));
console.log('   recalés sur RS       :', wRS.map((x) => x.toFixed(5)).join(', '));
if (wRSLV) console.log('   recalés sur RS+Lovex :', wRSLV.map((x) => x.toFixed(5)).join(', '));

console.log('\n1. COEFFICIENTS ACTUELS (à conserver — voir en-tête)');
show('Reload Swiss', evalP(RS, wCur));
show('Lovex (jamais vu)', evalP(LV, wCur));
show('Western (jamais vu)', evalP(WE, wCur));

console.log('\n2. RECALÉS SUR RELOAD SWISS — meilleurs chez eux, PIRES ailleurs');
show('Reload Swiss', evalP(RS, wRS));
show('Lovex', evalP(LV, wRS));
show('Western', evalP(WE, wRS));

if (wRSLV) {
  console.log('\n3. RECALÉS SUR RS + LOVEX — le compromis ne sauve rien');
  show('Reload Swiss', evalP(RS, wRSLV));
  show('Lovex', evalP(LV, wRSLV));
  show('Western', evalP(WE, wRSLV));
}

console.log('\n4. LA CAUSE : les sources ne mesurent pas le même η_p');
const mp = (rows) => (rows.length ? mean(rows.map((r) => r.eta_p)) : NaN);
console.log(`   η_p observé moyen : Reload Swiss ${mp(RS).toFixed(3)} | Western ${mp(WE).toFixed(3)} | Lovex ${mp(LV).toFixed(3)}`);
console.log(`   Reload Swiss (seule source du calage) est ${((mp(RS) / mp(WE) - 1) * 100).toFixed(0)} % au-dessus de Western`
          + ` et ${((mp(RS) / mp(LV) - 1) * 100).toFixed(0)} % au-dessus de Lovex.`);
console.log('   => plancher de pression STRUCTUREL : aucune quantité de données ne le fera tomber.');
