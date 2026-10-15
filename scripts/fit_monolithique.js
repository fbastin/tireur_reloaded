/**
 * fit_monolithique.js — effet d'une balle monolithique (cuivre, laiton massif) sur l'énergie effective et
 * sur la pression, à charge et masse de balle données, pour la carabine et pour l'arme de poing.
 *
 *   node scripts/fit_monolithique.js           # mesure et validations
 *   node scripts/fit_monolithique.js --write   # écrit le bloc `monolithique` de model_coefficients.json,
 *                                              # puis relancer node scripts/build_anchors.js
 *
 * POURQUOI. Une monolithique s'engage plus durement dans les rayures et porte plus longtemps ; à masse égale
 * elle est plus longue et s'enfonce plus dans l'étui. À charge égale elle donne donc plus de pression, et sa
 * charge maximale publiée est plus basse. L'ancre d'un couple mêle les deux sortes de balles et lit une
 * charge plus basse comme une pression plus basse (γ ≈ 2) : une monolithique laissée de côté et prédite par
 * les autres balles du couple sortait 4,8 % trop bas (Hodgdon et Western, 981 charges), et 15 % de ses charges
 * étaient sous-estimées de plus de 15 %, contre 7 % pour les autres balles — le sens dangereux (2026-10-15 ;
 * piste venue de ChamberSim Reloaded, qui donne aux balles en cuivre une pression de départ plus haute).
 *
 * MESURE. Effets fixes (couple × source), une fois charge et masse ramenées par les lois locales :
 *   μ_E = d ln E_eff / d mono   (Hodgdon, Western, Vihtavuori)
 *   μ_P = d ln P / d mono       (Hodgdon, Western : pression publiée au max)
 * et η_p = E·C/(P·A·L) donne μ_η = μ_E − μ_P. Un facteur par type d'arme : +2,5 % de pression en carabine,
 * +25 % en arme de poing (2026-10-15), où la balle plus longue prend une part bien plus grande du petit étui.
 * Un facteur commun (7,5 %) corrigeait trop la carabine et pas assez l'arme de poing. Classement des balles :
 * balle_monolithique.js.
 *
 * PORTÉE. Ce facteur vaut pour une prédiction ANCRÉE. Le modèle à froid, dont la pression varie peu avec la
 * charge, montre un écart bien plus faible au sein d'un couple : nul en carabine (ADI, hors ancres et hors
 * calage, l'a confirmé), −4,7 % en arme de poing, d'où un facteur à froid séparé (froidP), appliqué seulement
 * quand l'écart est net et de même sens chez Hodgdon et chez Western.
 */
const fs = require('fs');
const path = require('path');
const EM = require('../energy_model.js');
const { groups, CAL, PWD } = require('./build_anchors.js');
const d = (f) => path.join(__dirname, '..', 'data', f);
const COEF = JSON.parse(fs.readFileSync(d('model_coefficients.json')));
const L = COEF.local;
const G = 6.479891e-5, GR2G = 0.06479891, ln = Math.log;
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const by = (a, f) => a.reduce((o, r) => ((o[f(r)] = o[f(r)] || []).push(r), o), {});
const pc = (x) => `${(100 * (Math.exp(x) - 1)).toFixed(1)} %`;
const TYPES = [['rifle', 'CARABINE'], ['handgun', 'ARME DE POING']];

const all = [];
for (const [k, a] of Object.entries(groups)) {
  const ca = CAL[k.split('|')[0]];
  for (const r of a) if (ca && r.m > 0 && r.C > 0 && r.eeff > 0) all.push({ ...r, k, type: ca.type });
}
console.log('Charges de balles monolithiques :', JSON.stringify(Object.fromEntries(Object.entries(by(all.filter((r) => r.mono), (r) => r.type + '/' + r.src)).map(([s, a]) => [s, a.length]))));

// Différence intra-groupe (couple × source), pondérée n_m·n_a/(n_m+n_a) : l'estimateur à effets fixes d'une indicatrice.
function intra(rows, y) {
  let sw = 0, sd = 0, n = 0, pos = 0;
  for (const g of Object.values(by(rows, (r) => r.k + '#' + r.src))) {
    const M = g.filter((r) => r.mono), A = g.filter((r) => !r.mono);
    if (!M.length || !A.length) continue;
    const dl = mean(M.map(y)) - mean(A.map(y)), w = M.length * A.length / (M.length + A.length);
    sw += w; sd += w * dl; n++; if (dl > 0) pos++;
  }
  return { mu: sw ? sd / sw : 0, n, pos };
}
const yE = (r) => ln(r.eeff) - L.delta * ln(r.C) - L.beta * ln(r.m);
const yP = (r) => ln(r.P) - L.gamma * ln(r.C) - L.alpha * ln(r.m);
const sel = (t, s, P) => all.filter((r) => r.type === t && s.includes(r.src) && (!P || r.P > 0));
const mesure = (t, sE, sP) => { const e = intra(sel(t, sE), yE), p = intra(sel(t, sP, true), yP); return { muE: e.mu, muP: p.mu, muN: e.mu - p.mu, nE: e.n, nP: p.n, pos: p.pos }; };

// Validation : une balle laissée de côté, prédite par les autres balles du couple (comme
// fit_local_laws.js), l'ancre ramenée à une balle à noyau et le facteur F[type] réappliqué.
function valider(F) {
  const res = [];
  for (const a0 of Object.values(by(all, (r) => r.k))) {
    const balles = by(a0, (r) => r.bid), f = F && F[a0[0].type];
    if (Object.keys(balles).length < 2) continue;
    const fE = (r) => f && r.mono ? f.muE : 0, fN = (r) => f && r.mono ? f.muN : 0;
    for (const [bid, g] of Object.entries(balles)) {
      const autres = a0.filter((r) => r.bid !== bid); if (autres.length < 3) continue;
      const lc = mean(autres.map((r) => ln(r.C))), lm = mean(autres.map((r) => ln(r.m)));
      const pr = autres.filter((r) => r.np > 0);
      const an = {
        eeff: Math.exp(mean(autres.map((r) => ln(r.eeff) - fE(r) - L.delta * (ln(r.C) - lc) - L.beta * (ln(r.m) - lm)))),
        np: pr.length ? Math.exp(mean(pr.map((r) => ln(r.np) - fN(r) - L.eps * (ln(r.C) - lc) - L.zeta * (ln(r.m) - lm)))) : null,
        C: Math.exp(lc), m: Math.exp(lm),
      };
      const riche = autres.filter((r) => r.mono).length >= 0.25 * autres.length;
      for (const r of g) {
        const Ep = an.eeff * EM.localE(L, r.C, r.m, an.C, an.m) * Math.exp(fE(r));
        const Np = an.np != null ? an.np * EM.localNp(L, r.C, r.m, an.C, an.m) * Math.exp(fN(r)) : null;
        res.push({ type: r.type, src: r.src, mono: r.mono, riche, ev: Math.sqrt(Ep / r.eeff) - 1, ep: (Np && r.np > 0) ? (Ep / r.eeff) * (r.np / Np) - 1 : null });
      }
    }
  }
  return res;
}
const p1 = (x) => (100 * x).toFixed(1).padStart(6);
function ligne(t, s, champ = 'ep') {
  const e = s.map((x) => x[champ]).filter((x) => x != null);
  console.log('  ' + t.padEnd(50) + (e.length ? `biais ${p1(mean(e))} %  RMS ${p1(Math.sqrt(mean(e.map((x) => x * x))))} %  sous-estimées de plus de 15 % : ${p1(e.filter((x) => x < -0.15).length / e.length)} %  (${e.length})` : '—'));
}

// Modèle à froid (comme fit_local_laws.js, section 4) : écart monolithiques − autres au sein d'un couple.
const froid = [];
for (const r of all.filter((x) => x.P > 0 && x.np > 0 && (x.src === 'Hodg' || x.src === 'West'))) {
  const ck = r.k.split('|')[0], pw = PWD[r.k.slice(ck.length + 1)], ca = CAL[ck];
  if (!(pw && ca && pw.pcd > 0 && ca.case_vol_cm3 > 0)) continue;
  const A = Math.PI * (ca.bore_mm / 1000) ** 2 / 4, C = r.C * G;
  const ff = (r.C * GR2G / (pw.pcd / 1000)) / ca.case_vol_cm3;
  const Lc = r.eeff * C / (r.P * 1e5 * r.np * A);
  const p = EM.energyAndEtaP(COEF, pw, ff, ln(1 + A * Lc / (ca.case_vol_cm3 * 1e-6)), r.m, r.C, null);
  froid.push({ ...r, e: ln((p.E / r.eeff) * (r.np / p.np)) });
}

const F = {}, SANS = valider(null);
for (const [t, nom] of TYPES) {
  console.log(`\n=== ${nom} — à charge et masse données (effets fixes couple × source)`);
  for (const s of ['Hodg', 'West', 'VV']) {
    const e = intra(sel(t, [s]), yE), p = s === 'VV' ? null : intra(sel(t, [s], true), yP);
    console.log(`  ${s.padEnd(5)} E_eff ${pc(e.mu).padStart(7)} (${e.n} groupes)` + (p ? `   pression ${pc(p.mu).padStart(7)} (${p.n} groupes, ${p.pos} positifs)` : ''));
  }
  F[t] = mesure(t, ['Hodg', 'West', 'VV'], ['Hodg', 'West']);
  console.log(`  retenu : E_eff ${pc(F[t].muE)} (${F[t].nE} groupes), pression ${pc(F[t].muP)} (${F[t].nP} groupes, ${F[t].pos} positifs)`);
}
const AVEC = valider(F);
for (const [t, nom] of TYPES) {
  for (const [titre, res] of [['SANS facteur', SANS], ['AVEC facteur', AVEC]]) {
    const r = res.filter((x) => x.type === t);
    console.log(`\n${nom}, ${titre} — pression ancrée, balle laissée de côté`);
    ligne('monolithiques', r.filter((x) => x.mono));
    ligne('autres balles, ancre à 25 % monolithique ou plus', r.filter((x) => !x.mono && x.riche));
    ligne('autres balles', r.filter((x) => !x.mono));
    ligne('toutes', r);
    ligne('vitesse, monolithiques', r.filter((x) => x.mono), 'ev');
  }
  console.log(`\n${nom}, croisé : facteur mesuré sur l'autre source, monolithiques de celle-ci`);
  for (const [src, autre] of [['Hodg', 'West'], ['West', 'Hodg']]) {
    const f = mesure(t, [autre], [autre]);
    ligne(`${src}, sans facteur`, SANS.filter((x) => x.type === t && x.src === src && x.mono));
    ligne(`${src}, facteur de ${autre} (pression ${pc(f.muP)})`, valider({ [t]: f }).filter((x) => x.type === t && x.src === src && x.mono));
  }
  const fr = intra(froid.filter((x) => x.type === t), (r) => r.e);
  const frS = ['Hodg', 'West'].map((s) => intra(froid.filter((r) => r.type === t && r.src === s), (r) => r.e));
  // Facteur à froid seulement si l'écart est net (test du signe, |z| > 3) et de même sens chez les deux sources.
  const z = (fr.pos - fr.n / 2) / Math.sqrt(fr.n / 4), net = Math.abs(z) > 3 && frS.every((x) => Math.sign(x.mu) === Math.sign(fr.mu));
  F[t].froid = net ? -fr.mu : 0;
  console.log(`\n${nom}, à froid : monolithiques − autres au sein d'un couple ${pc(fr.mu)} (${fr.n} groupes, ${fr.pos} positifs, z = ${z.toFixed(1)} ; `
    + `Hodg ${pc(frS[0].mu)}, West ${pc(frS[1].mu)}) → ${net ? `pression à froid × ${Math.exp(F[t].froid).toFixed(3)}` : 'pas de facteur'}`);
}
console.log('\nTOUTES ARMES — pression ancrée, balle laissée de côté');
ligne('sans facteur', SANS); ligne('avec facteur', AVEC);
ligne('monolithiques, sans facteur', SANS.filter((x) => x.mono)); ligne('monolithiques, avec facteur', AVEC.filter((x) => x.mono));

if (process.argv.includes('--write')) {
  const r3 = (x) => +x.toFixed(3);
  const bloc = (f) => ({ E: r3(Math.exp(f.muE)), np: r3(Math.exp(f.muN)), P: r3(Math.exp(f.muP)), groupes: f.nP, froidP: r3(Math.exp(f.froid)) });
  COEF.monolithique = {
    rifle: bloc(F.rifle), handgun: bloc(F.handgun),
    _doc: 'Balle monolithique (cuivre, laiton massif ; scripts/balle_monolithique.js), à charge et masse égales, par type d\'arme : '
      + 'E_eff × E, η_p × np, donc pression × P = E/np, sur une prédiction ANCRÉE (les ancres sont ramenées à une balle à noyau). '
      + 'froidP : pression du modèle à froid × froidP (1 quand l\'écart à froid n\'est pas net). Effets fixes couple × source sur Hodgdon '
      + 'et Western (pression) et Vihtavuori (E_eff), lois locales appliquées (scripts/fit_monolithique.js).',
    _date: new Date().toISOString().slice(0, 10),
  };
  fs.writeFileSync(d('model_coefficients.json'), JSON.stringify(COEF, null, 2) + '\n');
  console.log('\n-> bloc `monolithique` écrit dans data/model_coefficients.json ; relancer node scripts/build_anchors.js');
}
