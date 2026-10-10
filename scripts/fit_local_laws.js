/**
 * fit_local_laws.js — lois LOCALES du modèle : comment l'énergie effective et la pression
 * varient avec la charge et avec la masse de balle, autour d'un point de référence.
 *
 * Usage : node scripts/fit_local_laws.js            # estime et valide, console seule
 *         node scripts/fit_local_laws.js --scan     # + balayage de γ (le choix de 1,95)
 *         node scripts/fit_local_laws.js --write    # écrit le bloc `local` de model_coefficients.json
 * Entrées : les charges de build_anchors.js (fichiers *.local.json, non redistribués).
 * Ensuite : node scripts/build_anchors.js (les ancres portent leur point de référence).
 *
 * POURQUOI. Jusqu'au 2026-10-10, l'ancre d'un couple était une énergie effective E_eff et une
 * efficacité η_p MOYENNES, constantes, et le modèle à froid ne connaissait la charge que par un
 * terme de remplissage calé d'une cartouche à l'autre. Il s'ensuivait, à balle donnée, v ∝ √C et
 * P ∝ C, quand les guides publient du départ au max v ∝ C^0,9 et P ∝ C^2,7 ; et une pression
 * indépendante de la masse de balle. Mesuré en laissant une balle de côté : pression ancrée
 * sous-estimée de 10 % au max d'une échelle Reload Swiss, de 12 % pour les balles lourdes,
 * surestimée de 14 % au départ et de 12 % pour les balles légères.
 *
 * LES QUATRE EXPOSANTS (moindres carrés à effets fixes)
 *   δ = d ln E_eff / d ln C   à balle donnée                (toutes sources à deux charges ou plus)
 *   γ = d ln P / d ln C       à balle donnée                (Reload Swiss : pression au départ ET au max)
 *   β = d ln E_eff / d ln m   entre balles d'un couple, une fois la charge ramenée par δ
 *   α = d ln P / d ln m       entre balles d'un couple, une fois la charge ramenée par γ
 * Les charges maximales des guides sont toutes au plafond de pression : entre balles, charge et
 * masse varient ensemble (C_max ∝ m^-0,44), et seule la pente γ mesurée À BALLE DONNÉE sépare
 * les deux effets. γ est donc estimé d'abord, sur Reload Swiss.
 *
 * POURQUOI γ = 1,95 ET NON 2,7. La médiane des pentes balle par balle vaut 2,7, et c'est la
 * pente réelle d'une échelle de charge (2,6 à 2,9 pour 85 % des balles). Mais entre deux
 * balles de même masse, la charge maximale varie aussi avec la construction (portée, balle
 * monolithique), que le modèle ne connaît pas : avec γ = 2,7, cet écart est amplifié, l'erreur
 * quadratique passe de 15 à 22 %, et une balle « dure » à sa propre charge max paraît loin de la
 * limite — une fausse marge. Balayage (α ré-estimé à chaque γ), pression, balle laissée de
 * côté : γ = 1 → RMS 11,9 %, max RS −10,6 % ; 1,95 → 15,4 %, −2,8 % ; 2,7 → 21,6 %, +4,3 %.
 * On garde l'estimateur ordinaire (moindres carrés groupés, 1,95), sans réglage à la main :
 * il retire les biais à erreur quadratique égale. La pente d'une échelle reste SOUS la réalité
 * (1,95 contre 2,7) : au-delà du max publié, la pression réelle monte plus vite que l'affichée.
 *
 * FORME. Sur l'ancre : E(C,m) = Ē (C/C̄)^δ (m/m̄)^β, η_p(C,m) = η̄_p (C/C̄)^ε (m/m̄)^ζ, avec
 * ε = δ + 1 − γ et ζ = β − α (η_p = E·C / (P·A·L)) ; C̄, m̄ : moyennes géométriques du couple.
 * Le modèle à froid n'en reçoit pas (deux essais rejetés : voir energy_model.js).
 */
const fs = require('fs');
const path = require('path');
const EM = require('../energy_model.js');
const { groups, CAL, PWD, cartRefs } = require('./build_anchors.js');
const CREF = cartRefs(groups);   // masse typique par cartouche : seulement pour classer les balles à froid
const d = (f) => path.join(__dirname, '..', 'data', f);
const COEF = JSON.parse(fs.readFileSync(d('model_coefficients.json')));
const G = 6.479891e-5, GR2G = 0.06479891;

const rows = Object.entries(groups).flatMap(([k, a]) => a.map((r) => ({ ...r, k })))
  .filter((r) => r.m > 0 && r.C > 0 && r.eeff > 0);
const ln = Math.log;
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const median = (a) => { const t = a.slice().sort((x, y) => x - y), n = t.length; return n % 2 ? t[(n - 1) / 2] : (t[n / 2 - 1] + t[n / 2]) / 2; };
const by = (a, f) => a.reduce((o, r) => ((o[f(r)] = o[f(r)] || []).push(r), o), {});

// Pente intra-groupe (effets fixes) de y sur x : Σ(x−x̄)(y−ȳ) / Σ(x−x̄)².
function pente(grp, x, y) {
  let sxy = 0, sxx = 0, n = 0;
  for (const g of Object.values(grp)) {
    if (g.length < 2) continue;
    const mx = mean(g.map(x)), my = mean(g.map(y));
    for (const r of g) { sxy += (x(r) - mx) * (y(r) - my); sxx += (x(r) - mx) ** 2; n++; }
  }
  return { b: sxy / sxx, n };
}
// Pentes balle par balle (contexte : leur médiane, non retenue — voir l'en-tête).
function pentesParBalle(a, y) {
  const out = [];
  for (const g of Object.values(by(a, (r) => r.k + '#' + r.bid))) {
    if (g.length < 2) continue;
    const mx = mean(g.map((r) => ln(r.C))), my = mean(g.map(y));
    const sxx = g.reduce((s, r) => s + (ln(r.C) - mx) ** 2, 0);
    if (sxx < 0.02 ** 2) continue;
    out.push(g.reduce((s, r) => s + (ln(r.C) - mx) * (y(r) - my), 0) / sxx);
  }
  return out;
}

// --- 1. À balle donnée : δ et γ ---------------------------------------------------------------
const parBalle = (a) => by(a, (r) => r.k + '#' + r.bid);
const avecP = rows.filter((r) => r.P > 0 && r.np > 0);
const delta = pente(parBalle(rows), (r) => ln(r.C), (r) => ln(r.eeff));
const gamma = pente(parBalle(avecP), (r) => ln(r.C), (r) => ln(r.P));
console.log(`δ = d ln E_eff / d ln C, à balle donnée : ${delta.b.toFixed(3)} (${delta.n} charges ; médiane balle par balle ${median(pentesParBalle(rows, (r) => ln(r.eeff))).toFixed(3)})`);
console.log(`γ = d ln P / d ln C, à balle donnée     : ${gamma.b.toFixed(3)} (${gamma.n} charges ; médiane balle par balle ${median(pentesParBalle(avecP, (r) => ln(r.P))).toFixed(3)})`);

// --- 2. Entre balles d'un même couple et d'une même source : β et α -------------------------
const parCoupleSrc = (a) => by(a, (r) => r.k + '|' + r.src);
const beta = pente(parCoupleSrc(rows), (r) => ln(r.m), (r) => ln(r.eeff) - delta.b * ln(r.C));
const alpha = pente(parCoupleSrc(avecP), (r) => ln(r.m), (r) => ln(r.P) - gamma.b * ln(r.C));
console.log(`β = d ln E_eff / d ln m, à charge donnée : ${beta.b.toFixed(3)} (${beta.n})`);
console.log(`α = d ln P / d ln m, à charge donnée     : ${alpha.b.toFixed(3)} (${alpha.n})`);
const r3 = (x) => +x.toFixed(3);
const L = { delta: r3(delta.b), gamma: r3(gamma.b), beta: r3(beta.b), alpha: r3(alpha.b) };
L.eps = r3(L.delta + 1 - L.gamma); L.zeta = r3(L.beta - L.alpha);
console.log(`→ η_p ∝ C^ε m^ζ : ε = ${L.eps}, ζ = ${L.zeta}`);

const rms = (a) => Math.sqrt(mean(a.map((x) => x * x))) * 100, bias = (a) => mean(a) * 100;
const f = (a) => a.length ? `${bias(a).toFixed(1).padStart(6)} % / ${rms(a).toFixed(1).padStart(4)} % (${a.length})` : '—';
const sous = (a) => a.length ? `${(100 * a.filter((x) => x < -0.15).length / a.length).toFixed(1)} %` : '—';
function rapport(titre, res, dmLabel) {
  const P = res.filter((x) => x.ep != null).map((x) => x), e = (s) => P.filter(s).map((x) => x.ep);
  console.log(`\n${titre} — biais / RMS (n)`);
  console.log('  vitesse, tout             ', f(res.map((x) => x.ev)));
  console.log('  pression, tout            ', f(e(() => true)), ' sous-estimée de plus de 15 % :', sous(e(() => true)));
  console.log('  pression, RS départ       ', f(e((x) => x.src === 'RS' && !x.max)));
  console.log('  pression, RS max          ', f(e((x) => x.src === 'RS' && x.max)));
  console.log('  pression, max autres      ', f(e((x) => x.src !== 'RS' && x.max)));
  console.log(`  pression, balles lourdes   ${f(e((x) => x.dm > 0.15))}   (${dmLabel})`);
  console.log('  pression, balles légères  ', f(e((x) => x.dm < -0.15)));
}

// --- 3. Ancrage : une balle laissée de côté, prédite par les autres balles du couple ----------
// lois = null : l'ancre d'avant le 2026-10-10 — moyennes constantes, au canon de chaque SOURCE
// (eeff/kE, np/kN), alors que l'outil l'évalue au canon de référence. La comparaison se fait
// toujours au canon de référence, comme l'outil : P prédite / P publiée.
function ancre(autres, lois) {
  const lc = mean(autres.map((r) => ln(r.C))), lm = mean(autres.map((r) => ln(r.m)));
  const pr = autres.filter((r) => r.np > 0);
  if (!lois) return { eeff: mean(autres.map((r) => r.eeff / r.kE)), np: pr.length ? mean(pr.map((r) => r.np / r.kN)) : null, lm };
  return {
    eeff: Math.exp(mean(autres.map((r) => ln(r.eeff) - lois.delta * (ln(r.C) - lc) - lois.beta * (ln(r.m) - lm)))),
    np: pr.length ? Math.exp(mean(pr.map((r) => ln(r.np) - lois.eps * (ln(r.C) - lc) - lois.zeta * (ln(r.m) - lm)))) : null,
    C: Math.exp(lc), m: Math.exp(lm), lm,
  };
}
function validerAncre(lois) {
  const res = [];
  for (const a0 of Object.values(groups)) {
    const a = a0.filter((r) => r.m > 0 && r.C > 0 && r.eeff > 0), balles = by(a, (r) => r.bid);
    if (Object.keys(balles).length < 2) continue;
    for (const [bid, g] of Object.entries(balles)) {
      const autres = a.filter((r) => r.bid !== bid); if (autres.length < 3) continue;
      const an = ancre(autres, lois);
      for (const r of g) {
        const Ep = an.eeff * EM.localE(lois, r.C, r.m, an.C, an.m);
        const Np = an.np != null ? an.np * EM.localNp(lois, r.C, r.m, an.C, an.m) : null;
        res.push({ src: r.src, max: r.max, dm: ln(r.m) - an.lm, ev: Math.sqrt(Ep / r.eeff) - 1, ep: (Np && r.np > 0) ? (Ep / r.eeff) * (r.np / Np) - 1 : null });
      }
    }
  }
  return res;
}
rapport('ANCRAGE actuel (moyennes constantes)', validerAncre(null), 'écart à la masse moyenne du couple > 16 %');
rapport('ANCRAGE avec lois locales', validerAncre(L), 'idem');

// --- 4. Modèle à froid : sans lois locales (essais rejetés, voir energy_model.js) ; rappel de
//        ses biais pour comparaison avec l'ancrage.
{
  const res = [];
  for (const r of rows) {
    const ck = r.k.split('|')[0], pw = PWD[r.k.slice(ck.length + 1)], ca = CAL[ck];
    if (!(pw && ca && pw.pcd > 0 && ca.case_vol_cm3 > 0)) continue;
    const A = Math.PI * (ca.bore_mm / 1000) ** 2 / 4, C = r.C * G;
    const ff = (r.C * GR2G / (pw.pcd / 1000)) / ca.case_vol_cm3;
    // Course du canon de la ligne, retrouvée par η_p = E·C/(P·A·L) ; sinon canon de référence.
    const Lc = (r.np > 0 && r.P > 0) ? r.eeff * C / (r.P * 1e5 * r.np * A)
      : ((ca.test_barrel_mm || (ca.type === 'handgun' ? 122 : 600)) - ca.case_mm) / 1000;
    const p = EM.energyAndEtaP(COEF, pw, ff, ln(1 + A * Lc / (ca.case_vol_cm3 * 1e-6)), r.m, r.C, null);
    const cref = CREF[ck];
    res.push({ src: r.src, max: r.max, dm: cref ? ln(r.m / cref.m) : 0, ev: Math.sqrt(p.E / r.eeff) - 1, ep: (r.np > 0) ? (p.E / r.eeff) * (r.np / p.np) - 1 : null });
  }
  rapport('À FROID (inchangé)', res, 'écart à la masse typique de la cartouche > 16 %');
}

// --- 5. Balayage de γ (--scan) : α ré-estimé pour chaque γ, pression, balle laissée de côté ---
if (process.argv.includes('--scan')) {
  console.log('\nBalayage — γ, α : pression tout (biais/RMS) | RS max | max autres | sous-estimée >15 %');
  for (const g of [1.0, 1.5, 1.75, L.gamma, 2.2, 2.45, 2.7]) {
    const a = pente(parCoupleSrc(avecP), (r) => ln(r.m), (r) => ln(r.P) - g * ln(r.C)).b;
    const lois = { ...L, gamma: g, alpha: a, eps: L.delta + 1 - g, zeta: L.beta - a };
    const P = validerAncre(lois).filter((x) => x.ep != null), e = (f) => P.filter(f).map((x) => x.ep);
    const t = (v) => `${bias(v).toFixed(1)} / ${rms(v).toFixed(1)} %`;
    console.log(`  ${g.toFixed(2)}, ${a.toFixed(2)} : ${t(e(() => true))} | ${t(e((x) => x.src === 'RS' && x.max))} | ${t(e((x) => x.src !== 'RS' && x.max))} | ${sous(e(() => true))}`);
  }
}

if (process.argv.includes('--write')) {
  COEF.local = {
    ...L,
    _doc: 'Lois locales de l\'ancrage (scripts/fit_local_laws.js) : E_eff ∝ C^delta·m^beta et η_p ∝ C^eps·m^zeta autour du point de référence de l\'ancre (C, m, grains) ; P ∝ C^gamma·m^alpha. Le modèle à froid n\'en reçoit pas. gamma = 1,95 (moindres carrés groupés) sous-estime la pente d\'une échelle de charge (médiane 2,7) : compromis retenu, voir l\'en-tête du script.',
    _date: new Date().toISOString().slice(0, 10),
  };
  fs.writeFileSync(d('model_coefficients.json'), JSON.stringify(COEF, null, 2) + '\n');
  console.log('\n-> bloc `local` écrit dans data/model_coefficients.json ; relancer node scripts/build_anchors.js');
}
