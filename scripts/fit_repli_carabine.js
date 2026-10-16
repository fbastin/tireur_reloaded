/**
 * fit_repli_carabine.js — facteur du repli E_eff en carabine (bloc `repli_carabine` de model_coefficients.json).
 *
 * Usage : node scripts/fit_repli_carabine.js            # estime et valide, console seule
 *         node scripts/fit_repli_carabine.js --write    # écrit le bloc, si la validation ne se dégrade pas
 *                                                       # (--force sinon)
 * Entrées : les charges de build_anchors.js (fichiers *.local.json, non redistribués).
 *
 * POURQUOI. Sans ancre et sans constantes de poudre (Qex, Ba), l'outil tire la vitesse d'une énergie
 * générique, E_eff = e0 + e1·remplissage, commune aux carabines et aux armes de poing. Confronté le
 * 2026-10-15 à toutes les charges publiées, ce repli surestime la vitesse des carabines (+3,2 %, 24 743
 * charges ; données en ligne d'ADI, hors calage : +2,5 %), et η_p sous-estime leur pression à vitesse
 * publiée (−4,8 %). Les deux écarts se compensent dans la pression à froid. Le facteur k multiplie
 * l'énergie ET η_p : la pression à froid ne bouge pas, la vitesse à froid baisse de √k, la pression tirée
 * d'une vitesse connue monte de 1/k. Arme de poing : pas de facteur (écart de vitesse +0,7 %). Poudres à
 * constantes (chemin η_b, Reload Swiss et Vihtavuori) : pas de facteur non plus, elles ont leur calage.
 *
 * ESTIMATION. k = moyenne géométrique de E publiée / E prédite, sur toutes les charges de carabine du
 * repli (au canon de référence, comme l'outil). Contrôle : chaque source prédite avec le k des autres.
 */
const fs = require('fs');
const path = require('path');
const EM = require('../energy_model.js');
const { groups, CAL, PWD } = require('./build_anchors.js');
const d = (f) => path.join(__dirname, '..', 'data', f);
const COEF = JSON.parse(fs.readFileSync(d('model_coefficients.json')));
const G = 6.479891e-5, GR2G = 0.06479891, ln = Math.log;
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const by = (a, f) => a.reduce((o, r) => ((o[f(r)] = o[f(r)] || []).push(r), o), {});

// Modèle à froid de l'outil, sans facteur (base de l'estimation) puis avec le facteur k.
const SANS = { ...COEF }; delete SANS.repli_carabine;
const res = [], FROID = new Map();
for (const [key, arr] of Object.entries(groups)) for (const r of arr) {
  if (!(r.m > 0 && r.C > 0 && r.eeff > 0)) continue;
  const ck = key.split('|')[0], pw = PWD[key.slice(ck.length + 1)], ca = CAL[ck];
  if (!(pw && ca && pw.pcd > 0 && ca.case_vol_cm3 > 0)) continue;
  const A = Math.PI * (ca.bore_mm / 1000) ** 2 / 4, C = r.C * G;
  const ff = (r.C * GR2G / (pw.pcd / 1000)) / ca.case_vol_cm3;
  // Course du canon de la ligne, retrouvée par η_p = E·C/(P·A·L) ; sinon canon de référence (fit_local_laws.js).
  const Lc = (r.np > 0 && r.P > 0) ? r.eeff * C / (r.P * 1e5 * r.np * A)
    : ((ca.test_barrel_mm || (ca.type === 'handgun' ? 122 : 600)) - ca.case_mm) / 1000;
  const p = EM.energyAndEtaP(SANS, pw, ff, ln(1 + A * Lc / (ca.case_vol_cm3 * 1e-6)), r.m, r.C, null, null, ca.type);
  const x = { src: r.src, type: ca.type, path: p.path, repli: ca.type === 'rifle' && p.path === 'e_eff',
    lE: ln(r.eeff / p.E), lN: r.np > 0 ? ln(r.np / p.np) : null };
  res.push(x); FROID.set(r, x);
}
const R = res.filter((x) => x.repli);
const kDe = (a) => Math.exp(mean(a.map((x) => x.lE)));
const k = +kDe(R).toFixed(3);

// Écarts relatifs prédit / publié avec un facteur f sur les charges du repli de carabine (1 ailleurs).
const vit = (a, f) => a.map((x) => Math.exp(-x.lE / 2) * Math.sqrt(x.repli ? f : 1) - 1);
const pres = (a) => a.filter((x) => x.lN != null).map((x) => Math.exp(-x.lE + x.lN) - 1);   // E·np publiés / prédits : f s'annule
const pv = (a, f) => a.filter((x) => x.lN != null).map((x) => Math.exp(x.lN) / (x.repli ? f : 1) - 1);  // P à vitesse publiée
const pct = (v) => (v * 100).toFixed(1);
const f = (a) => a.length ? `${pct(mean(a)).padStart(5)} / ${pct(Math.sqrt(mean(a.map((x) => x * x)))).padStart(4)} % (${a.length})` : '—';
const sous = (a) => `${(100 * a.filter((x) => x < -0.15).length / a.length).toFixed(1)} %`;

console.log(`k = ${k} (moyenne géométrique sur ${R.length} charges de carabine du repli)`);
console.log('\nbiais / écart quadratique (n), sans facteur → avec');
console.log('  carabine, repli : vitesse à froid           ', f(vit(R, 1)), '→', f(vit(R, k)));
console.log('  carabine, repli : pression à froid          ', f(pres(R)), '(inchangée)');
console.log('  carabine, repli : pression à vitesse publiée', f(pv(R, 1)), '→', f(pv(R, k)));
console.log('  tout le modèle à froid : vitesse            ', f(vit(res, 1)), '→', f(vit(res, k)));
console.log('  tout le modèle à froid : pression           ', f(pres(res)), ' sous-estimée de plus de 15 % :', sous(pres(res)), '(inchangée)');

console.log('\nChaque source prédite avec le k des autres : vitesse à froid, sans facteur → avec');
for (const [src, g] of Object.entries(by(R, (x) => x.src)).sort((a, b) => b[1].length - a[1].length)) {
  const kAutres = kDe(R.filter((x) => x.src !== src));
  console.log(`  ${src.padEnd(7)} k ${kAutres.toFixed(3)} : ${f(vit(g, 1))} → ${f(vit(g, kAutres))}` +
    (g.some((x) => x.lN != null) ? ` | pression à vitesse publiée ${f(pv(g, 1))} → ${f(pv(g, kAutres))}` : ''));
}

// Ancre sans η_p, simulée sur les couples du repli qui publient la pression : chaque balle laissée de côté,
// énergie de l'ancre des autres balles (lois locales), η_p à froid de l'outil. C'est le calcul de l'outil pour
// un couple ancré par des sources sans pression.
{
  const L = COEF.local, sim = [];
  for (const a0 of Object.values(groups)) {
    const a = a0.filter((r) => FROID.has(r) && FROID.get(r).repli), balles = by(a, (r) => r.bid);
    if (Object.keys(balles).length < 2) continue;
    for (const [bid, g] of Object.entries(balles)) {
      const autres = a.filter((r) => r.bid !== bid); if (autres.length < 3) continue;
      const lc = mean(autres.map((r) => ln(r.C))), lm = mean(autres.map((r) => ln(r.m)));
      const E0 = Math.exp(mean(autres.map((r) => ln(r.eeff) - L.delta * (ln(r.C) - lc) - L.beta * (ln(r.m) - lm))));
      for (const r of g) if (FROID.get(r).lN != null)
        sim.push((E0 * EM.localE(L, r.C, r.m, Math.exp(lc), Math.exp(lm)) / r.eeff) * Math.exp(FROID.get(r).lN));
    }
  }
  const e = (fct) => sim.map((x) => x / fct - 1);
  console.log(`\nAncre sans η_p simulée (carabine, repli, balle laissée de côté) : pression ${f(e(1))} → ${f(e(k))}` +
    `, sous-estimée de plus de 15 % ${sous(e(1))} → ${sous(e(k))}`);
}

// Ancres de carabine sans η_p (sources sans pression) sur une poudre du repli : leur pression passe par le
// η_p à froid, elle monte donc de 1/k.
const ANC = JSON.parse(fs.readFileSync(d('anchors.json'))).anchors;
const sansNp = Object.keys(ANC).filter((key) => { const ck = key.split('|')[0], pw = PWD[key.slice(ck.length + 1)];
  return ANC[key].np == null && CAL[ck] && CAL[ck].type === 'rifle' && pw && !(pw.Qex && pw.Ba); });
console.log(`\nAncres de carabine sans η_p, poudre du repli : ${sansNp.length} sur ${Object.keys(ANC).length} (pression × ${(1 / k).toFixed(3)})`);

if (process.argv.includes('--write')) {
  const rms = (a) => Math.sqrt(mean(a.map((x) => x * x)));
  const pire = rms(vit(res, k)) > rms(vit(res, 1)) || rms(vit(R, k)) > rms(vit(R, 1));
  if (pire && !process.argv.includes('--force')) {
    console.log('\n-> NON écrit : le facteur dégrade la vitesse à froid. --force pour écrire quand même.');
    process.exitCode = 1;
  } else {
    COEF.repli_carabine = {
      k, n: R.length,
      _doc: 'Repli E_eff en carabine (cartouche de carabine, poudre sans Qex/Ba ; scripts/fit_repli_carabine.js) : E_eff et η_p à froid × k. La pression à froid ne change pas ; la vitesse à froid baisse de √k, la pression tirée d\'une vitesse connue (mesurée, ancre sans η_p) monte de 1/k.',
      _date: new Date().toISOString().slice(0, 10),
    };
    fs.writeFileSync(d('model_coefficients.json'), JSON.stringify(COEF, null, 2) + '\n');
    console.log('\n-> bloc `repli_carabine` écrit dans data/model_coefficients.json');
  }
}
