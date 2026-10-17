/**
 * fit_fourchettes.js — plages de pression de la page (bloc `fourchettes` de model_coefficients.json).
 *
 * Usage : node scripts/fit_fourchettes.js            # calcule, console seule
 *         node scripts/fit_fourchettes.js --write    # écrit le bloc
 * Après fit_deux_pentes.js, fit_repli_carabine.js et fit_froid_max.js, dont il lit les validations (ces scripts,
 * requis, n'affichent ni n'écrivent rien).
 *
 * POURQUOI. La précision de la pression va de ~10 % (carabine, données fabricant de pression) à ~31 % (arme de poing,
 * à froid) ; un chiffre unique la cache. La page affiche donc, sous la pression, la plage où tombent 8 pressions
 * publiées sur 10 dans la même situation (2026-10-17).
 *
 * MÉTHODE. Pour chaque situation que distingue la page, le rapport pression publiée / pression calculée, sur les
 * validations existantes, l'élément testé jamais dans sa propre référence :
 *  - deux_pentes : loi à deux pentes, fenêtre des AUTRES balles de la masse, plancher de la loi des ancres en carabine
 *    (fit_deux_pentes.js, servi2) ;
 *  - ancres : loi des ancres, couple avec pression publiée, balle laissée de côté (actuel) ;
 *  - plafond_limite : couple ancré sans pression publiée, simulé, fenêtre des autres balles (servi2) ;
 *  - ancre_sans_pression : même simulation sans fenêtre, par classe « type|r » (poudre du repli) ou « type|c »
 *    (poudre à constantes) (fit_repli_carabine.js) ;
 *  - froid_max : sans données fabricant, charge maximale estimée, validation croisée par couples (fit_froid_max.js) ;
 *  - froid : modèle à froid seul, toutes les charges publiées avec leur pression.
 * Plage = quantiles 10 % et 90 % de P publiée / P calculée, multiplicateurs de la pression affichée. Une situation
 * mesurée sur moins de 100 charges n'a pas de plage.
 *
 * D'UN LABORATOIRE À L'AUTRE. Ces validations laissent de côté une balle, pas un laboratoire : l'utilisateur, avec ses
 * composants, en est toujours un autre. Sur les charges d'ADI (hors calage, poudres rapportées à Hodgdon,
 * adi_modele_servi.js), les plages internes des couples avec données de carabine ne contenaient que 42 % (deux pentes)
 * à 72 % des pressions, au lieu de 80 %. Trop peu de couples sont publiés avec pression par deux éditeurs (49) pour
 * mesurer cet écart en interne. Pour ces situations en carabine, la plage est donc la plus large de trois : interne,
 * commune calée sur ADI, propre à la situation calée sur ADI. Validation croisée par couples ADI (adi_modele_servi.js
 * --plages) : de 80,5 à 92,8 % des pressions dedans selon la situation, au plus 10,2 % au-dessus du haut (une plage
 * commune seule en laissait jusqu'à 22 % au-dessus). Même règle pour toute situation où ADI compte au moins N_MIN
 * charges : à froid sans effet de poudre, en arme de poing, la plage interne ne contenait que 69 % des pressions ADI.
 * Arme de poing avec données : aucune donnée d'un autre laboratoire, plage interne seule.
 */
const fs = require('fs');
const path = require('path');
const d = (f) => path.join(__dirname, '..', 'data', f);
const COEF = JSON.parse(fs.readFileSync(d('model_coefficients.json')));
const NIVEAU = 0.8, N_MIN = 100;

const DP = require('./fit_deux_pentes.js'), RP = require('./fit_repli_carabine.js'), FM = require('./fit_froid_max.js');
const ADI = require('./adi_modele_servi.js');
const AVEC = ['deux_pentes', 'ancres', 'plafond_limite', 'ancre_sans_pression'];   // situations avec données fabricant
if (!DP.res) { console.error('fenêtres par masse absentes : relancer build_anchors.js puis build_start_charges.js'); process.exit(1); }

// rapports P publiée / P calculée, par situation et clé (type d'arme, ou type|r / type|c)
const R = {};
const ajout = (cls, cle, r) => { if (r > 0 && isFinite(r)) ((R[cls] = R[cls] || {})[cle] = R[cls][cle] || []).push(r); };
const inv = (e) => 1 / (1 + e);   // erreur relative (calculée / publiée − 1) → publiée / calculée
for (const x of DP.res) {
  ajout('ancres', x.type, inv(x.actuel));
  if (x.autres && x.deux2) ajout('deux_pentes', x.type, inv(x.servi2));
}
for (const x of DP.resSansNp) if (x.autres && x.comb2) ajout('plafond_limite', x.type, inv(x.servi2));
for (const [cls, { repli, x }] of Object.entries(RP.sim)) {
  const [type, chemin] = cls.split(', '), cle = type + '|' + (chemin === 'repli' ? 'r' : 'c');
  for (const v of x) ajout('ancre_sans_pression', cle, (repli ? RP.k : 1) / v);   // v : calculée / publiée, sans le facteur k
}
for (const x of FM.res) ajout('froid_max', x.type, inv(x.prudent));
for (const x of FM.froidTout) ajout('froid', x.type, inv(x.e));

const quant = (a, q) => { const s = a.slice().sort((u, v) => u - v); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const classes = {};
console.log(`Plages de pression : ${100 * NIVEAU} % des pressions publiées entre bas × P et haut × P (P : pression affichée)`);
for (const [cls, par] of Object.entries(R)) for (const [cle, a] of Object.entries(par).sort()) {
  const bas = quant(a, (1 - NIVEAU) / 2), haut = quant(a, (1 + NIVEAU) / 2), ok = a.length >= N_MIN;
  console.log(`  ${(cls + ', ' + cle).padEnd(36)} n ${String(a.length).padStart(5)}  ${bas.toFixed(3)} – ${haut.toFixed(3)}  (−${(100 * (1 - bas)).toFixed(0)} % / +${(100 * (haut - 1)).toFixed(0)} %)${ok ? '' : '  trop peu de charges : pas de plage'}`);
  if (ok) (classes[cls] = classes[cls] || {})[cle] = [+bas.toFixed(3), +haut.toFixed(3), a.length];
}
// Écart d'un laboratoire à l'autre : pressions ADI / pressions de la page, par type et situation (N_MIN charges au
// moins) et, en carabine, commun aux situations avec données. Plage servie : la plus large de la plage interne et de
// celles-ci.
const rA = (a) => a.map((x) => x.Ppub / x.P);
const plage = (a) => [+quant(a, (1 - NIVEAU) / 2).toFixed(3), +quant(a, (1 + NIVEAU) / 2).toFixed(3), a.length];
const entre = {};
for (const t of ['rifle', 'handgun']) for (const cls of Object.keys(R)) {
  const a = rA(ADI.R.filter((x) => x.ca.type === t && ADI.SIT[x.cls] === cls)); if (a.length >= N_MIN) (entre[t] = entre[t] || {})[cls] = plage(a);
}
const gA = ADI.R.filter((x) => x.ca.type === 'rifle' && AVEC.includes(ADI.SIT[x.cls]));
if (gA.length >= N_MIN) (entre.rifle = entre.rifle || {}).commun = plage(rA(gA));
console.log(`\nD'un laboratoire à l'autre (ADI) : ${JSON.stringify(entre)}\nPlages servies :`);
for (const cls of Object.keys(classes)) for (const [cle, v] of Object.entries(classes[cls])) {
  const E = entre[cle.split('|')[0]]; if (!E) continue;
  const w0 = v.slice(0, 2);
  for (const w of [AVEC.includes(cls) && E.commun, E[cls]].filter(Boolean)) { v[0] = Math.min(v[0], w[0]); v[1] = Math.max(v[1], w[1]); }
  if (v[0] === w0[0] && v[1] === w0[1]) continue;
  console.log(`  ${(cls + ', ' + cle).padEnd(36)} ${v[0].toFixed(3)} – ${v[1].toFixed(3)}  (−${(100 * (1 - v[0])).toFixed(0)} % / +${(100 * (v[1] - 1)).toFixed(0)} %)`);
}

if (process.argv.includes('--write')) {
  COEF.fourchettes = { niveau: NIVEAU, classes, entre_laboratoires: entre,
    _doc: 'Plages de pression de la page (scripts/fit_fourchettes.js ; EnergyModel.fourchettePression) : par situation (deux_pentes, ancres, plafond_limite, ancre_sans_pression par type|r ou type|c, froid_max, froid) et type d arme, [bas, haut, n] : quantiles de P publiée / P calculée qui encadrent la part « niveau » des charges publiées de la validation (l élément testé jamais dans sa référence). Multiplicateurs de la pression affichée. Carabine, situations avec données : la plus large de la plage interne et des plages entre_laboratoires (pressions ADI, autre laboratoire hors calage : commune et par situation).',
    _date: new Date().toISOString().slice(0, 10) };
  fs.writeFileSync(d('model_coefficients.json'), JSON.stringify(COEF, null, 2) + '\n');
  console.log('\n-> bloc `fourchettes` écrit dans data/model_coefficients.json');
}
