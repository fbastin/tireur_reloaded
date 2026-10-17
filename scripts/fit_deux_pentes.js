/**
 * fit_deux_pentes.js — loi de pression à deux pentes des carabines (bloc `deux_pentes` de model_coefficients.json).
 *
 * Usage : node scripts/fit_deux_pentes.js              # estime γL et αM, valide ce que la page calcule (console)
 *         node scripts/fit_deux_pentes.js --variantes  # + essai hors ligne du 2026-10-16 (max propre, fenêtre ; γL)
 *         node scripts/fit_deux_pentes.js --write      # écrit le bloc, si la validation ne se dégrade pas (--force)
 * Ordre : --write, puis build_anchors.js (plafond des ancres : pc, mpc), build_start_charges.js (fenêtres par
 * masse), puis ce script sans option : validation de la configuration servie.
 *
 * POURQUOI. Les lois locales (fit_local_laws.js) n'ont qu'un exposant de charge γ pour deux choses : l'échelle
 * d'une balle (pente 2,7) et l'écart de charge maximale entre balles, toutes publiées au plafond de pression
 * (pente ≈ 0). Recalé le 2026-10-15 (γ 2,24), le modèle faisait moins bien balle laissée de côté.
 *
 * LOI (EnergyModel.pressionDeuxPentes). P = P_plafond · (m / m_plafond)^αM · (C / Cmax)^γL : P_plafond et
 * m_plafond, pression et masse moyennes (géométriques) des charges maximales publiées du couple ; Cmax, plus petite
 * charge maximale publiée pour la masse de balle (fenêtre par masse). La charge maximale publiée porte ce que le
 * modèle ignore de la balle (construction, portée) ; la pente γL ne sert plus qu'à l'échelle.
 *
 * ESTIMATION. γL : d ln P / d ln C à balle donnée (moindres carrés groupés, comme le γ de fit_local_laws.js) ;
 * αM : pente de ln P sur ln m entre les charges maximales d'un même couple et d'une même source.
 *
 * VALIDATION. Charges et balle laissée de côté de fit_local_laws.js. Plafond : charges maximales des AUTRES balles
 * (deux au moins). Fenêtre : celle que sert la page, qui compte la balle elle-même, comme pour un utilisateur dont
 * la balle est publiée. Sans plafond ou sans fenêtre, et en arme de poing : la loi des ancres (lois publiées).
 * Essai du 2026-10-16 (--variantes) : fenêtre de la balle elle-même (si l'outil connaissait la balle) ou de la
 * masse ; la masse seule surestimait l'arme de poing de 17 %, d'où les carabines seules.
 */
const fs = require('fs');
const path = require('path');
const EM = require('../energy_model.js');
const { groups, CAL, PWD } = require('./build_anchors.js');
const G = 6.479891e-5, GR2G = 0.06479891;
const d = (f) => path.join(__dirname, '..', 'data', f);
const COEF = JSON.parse(fs.readFileSync(d('model_coefficients.json'))), L = COEF.local;
const ln = Math.log, mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const by = (a, f) => a.reduce((o, r) => ((o[f(r)] = o[f(r)] || []).push(r), o), {});
const rowsP = (a) => a.filter((r) => r.m > 0 && r.C > 0 && r.eeff > 0);
// Types servis et maximum de référence (EnergyModel.pressionDeuxPentes). Arme de poing ajoutée le 2026-10-16 avec la
// MOYENNE (géométrique) des maxima de la masse : le plus petit maximum y surestimait la pression de 17 %, les balles d'une
// même masse variant beaucoup ; la carabine garde le plus petit (biais +2,3 %, côté prudent ; choix de Fabian).
const TYPES = ['rifle', 'handgun'], REF = { rifle: 'min', handgun: 'moy' }, PLAFOND_MIN = 2;

// --- Estimation -------------------------------------------------------------------------------------------
function pente(grp, x, y) {
  let sxy = 0, sxx = 0;
  for (const g of Object.values(grp)) {
    if (g.length < 2) continue;
    const mx = mean(g.map(x)), my = mean(g.map(y));
    for (const r of g) { sxy += (x(r) - mx) * (y(r) - my); sxx += (x(r) - mx) ** 2; }
  }
  return sxy / sxx;
}
const tout = Object.entries(groups).flatMap(([k, a]) => rowsP(a).map((r) => ({ ...r, k })));
const avecP = tout.filter((r) => r.P > 0 && r.np > 0);
// γL commun (toutes armes) : celui de la carabine, inchangé depuis sa validation ; l'arme de poing a le sien (ses
// échelles montent moins vite : médianes balle par balle 2,46 chez Reload Swiss et 1,75 chez Hodgdon, contre 2,76 et 2,35).
const typeDe = (r) => (CAL[r.k.split('|')[0]] || {}).type;
const gammaL = +pente(by(avecP, (r) => r.k + '#' + r.bid), (r) => ln(r.C), (r) => ln(r.P)).toFixed(3);
const gammaPoing = +pente(by(avecP.filter((r) => typeDe(r) === 'handgun'), (r) => r.k + '#' + r.bid), (r) => ln(r.C), (r) => ln(r.P)).toFixed(3);
const alphaM = +pente(by(avecP.filter((r) => r.max), (r) => r.k + '|' + r.src), (r) => ln(r.m), (r) => ln(r.P)).toFixed(3);
console.log(`γL = d ln P / d ln C à balle donnée : ${gammaL} (arme de poing seule : ${gammaPoing}) ; αM = d ln P_max / d ln m (couple × source) : ${alphaM}`);
// Plafond tiré de la LIMITE de la cartouche (pmax_cip_bar), pour les couples ancrés sur des données sans pression
// (2026-10-16) : moyenne géométrique de P max publiée / limite, par type d'arme.
const limite = (r) => (CAL[r.k.split('|')[0]] || {}).pmax_cip_bar || 0, plafondLimite = {};
for (const t of TYPES) {
  const v = avecP.filter((r) => r.max && typeDe(r) === t && limite(r) > 0).map((r) => ln(r.P / limite(r)));
  if (v.length) plafondLimite[t] = +Math.exp(mean(v)).toFixed(3);
}
console.log(`plafond tiré de la limite (P max publiée / limite, moyenne géométrique) : ${JSON.stringify(plafondLimite)}`);

// --- Validation, balle laissée de côté ----------------------------------------------------------------------
let FEN = null;
try { FEN = JSON.parse(fs.readFileSync(d('start_charges.local.json'))).fenetres_masse || null; } catch (e) { if (e.code !== 'ENOENT') throw e; }
function valider(D) {
  const res = [];
  for (const [k, a0] of Object.entries(groups)) {
    const a = rowsP(a0), balles = by(a, (r) => r.bid), ca = CAL[k.split('|')[0]], type = ca && ca.type;
    if (Object.keys(balles).length < 2) continue;
    for (const [bid, g] of Object.entries(balles)) {
      const autres = a.filter((r) => r.bid !== bid); if (autres.length < 3) continue;
      const lc = mean(autres.map((r) => ln(r.C))), lm = mean(autres.map((r) => ln(r.m))), pr = autres.filter((r) => r.np > 0);
      const E0 = Math.exp(mean(autres.map((r) => ln(r.eeff) - L.delta * (ln(r.C) - lc) - L.beta * (ln(r.m) - lm))));
      const N0 = pr.length ? Math.exp(mean(pr.map((r) => ln(r.np) - L.eps * (ln(r.C) - lc) - L.zeta * (ln(r.m) - lm)))) : null;
      const mx = autres.filter((r) => r.max && r.P > 0 && r.np > 0), lmx = mx.length ? mean(mx.map((r) => ln(r.m))) : 0;
      const anc = mx.length >= PLAFOND_MIN ? { pc: Math.exp(mean(mx.map((r) => ln(r.P) - (D ? D.alphaM : 0) * (ln(r.m) - lmx)))), mpc: Math.exp(lmx) } : null;
      for (const r of g) {
        if (!(r.np > 0 && r.P > 0) || N0 == null) continue;
        const Ep = E0 * EM.localE(L, r.C, r.m, Math.exp(lc), Math.exp(lm)), Np = N0 * EM.localNp(L, r.C, r.m, Math.exp(lc), Math.exp(lm));
        const actuel = (Ep / r.eeff) * (r.np / Np) - 1;
        const win = FEN && EM.fenetreMasse(FEN[k], r.m);
        const P2 = D ? EM.pressionDeuxPentes({ deux_pentes: D }, anc, win, r.m, r.C, type) : null;
        res.push({ src: r.src, max: r.max, type, mono: !!r.mono, dm: ln(r.m) - lm, actuel, servi: P2 != null ? P2 / r.P - 1 : actuel, deux: P2 != null });
      }
    }
  }
  return res;
}
const pc = (v) => (100 * v).toFixed(1);
const st = (e) => { if (!e.length) return '—'; const s = e.slice().sort((p, q) => p - q);
  return `${pc(mean(e)).padStart(5)} / ${pc(Math.sqrt(mean(e.map((v) => v * v)))).padStart(4)} % (${e.length}) | sous-estimées >15 % ${pc(e.filter((v) => v < -0.15).length / e.length).padStart(4)} % | centile 1 % ${pc(s[Math.floor(0.01 * s.length)]).padStart(5)} %`; };
const D = { gammaL, alphaM, types: TYPES, rifle: { ref: REF.rifle }, handgun: { gammaL: gammaPoing, ref: REF.handgun }, plafond_limite: plafondLimite };
const SOUS = [['tout', () => true], ['carabine', (x) => x.type === 'rifle'], ['  dont loi à deux pentes', (x) => x.type === 'rifle' && x.deux],
  ['  dont loi des ancres (sans plafond ou sans fenêtre)', (x) => x.type === 'rifle' && !x.deux], ['arme de poing', (x) => x.type === 'handgun'],
  ['  dont loi à deux pentes', (x) => x.type === 'handgun' && x.deux], ['  dont loi des ancres', (x) => x.type === 'handgun' && !x.deux],
  ['RS départ', (x) => x.src === 'RS' && !x.max], ['RS max', (x) => x.src === 'RS' && x.max], ['max autres', (x) => x.src !== 'RS' && x.max],
  ['balles lourdes', (x) => x.dm > 0.15], ['balles légères', (x) => x.dm < -0.15]];
// Couples ancrés sur des données SANS pression, simulés sur ceux qui la publient (balle laissée de côté) : A = méthode de
// l'ancre (énergie de l'ancre, η_p générique, comme energyAndEtaP) ; servi = moyenne géométrique de A et de la loi à deux
// pentes plafonnée à k × la limite (pressionPlafondLimite), quand la fenêtre de la masse et la limite existent.
function validerSansNp(D) {
  const res = [];
  for (const [k, a0] of Object.entries(groups)) {
    const ck = k.split('|')[0], pw = PWD[k.slice(ck.length + 1)], ca = CAL[ck];
    if (!(pw && ca && pw.pcd > 0 && ca.case_vol_cm3 > 0)) continue;
    const a = rowsP(a0), balles = by(a, (r) => r.bid); if (Object.keys(balles).length < 2) continue;
    const A = Math.PI * (ca.bore_mm / 1000) ** 2 / 4;
    for (const [bid, g] of Object.entries(balles)) {
      const autres = a.filter((r) => r.bid !== bid); if (autres.length < 3) continue;
      const lc = mean(autres.map((r) => ln(r.C))), lm = mean(autres.map((r) => ln(r.m)));
      const anc = { eeff: Math.exp(mean(autres.map((r) => ln(r.eeff) - L.delta * (ln(r.C) - lc) - L.beta * (ln(r.m) - lm)))), np: null, C: Math.exp(lc), m: Math.exp(lm) };
      for (const r of g) {
        if (!(r.np > 0 && r.P > 0)) continue;
        const ff = (r.C * GR2G / (pw.pcd / 1000)) / ca.case_vol_cm3, Lc = r.eeff * r.C * G / (r.P * 1e5 * r.np * A);
        const p = EM.energyAndEtaP(COEF, pw, ff, ln(1 + A * Lc / (ca.case_vol_cm3 * 1e-6)), r.m, r.C, anc, null, ca.type);
        const PA = (p.E / r.eeff) * (r.np / p.np);
        const PB = EM.pressionPlafondLimite({ deux_pentes: D }, ca.pmax_cip_bar, FEN && EM.fenetreMasse(FEN[k], r.m), r.m, r.C, ca.type);
        res.push({ type: ca.type, max: r.max, actuel: PA - 1, servi: PB != null ? Math.sqrt(PA * PB / r.P) - 1 : PA - 1, comb: PB != null });
      }
    }
  }
  return res;
}
let res = null, resSansNp = null;
if (!FEN) console.log('\nValidation impossible : start_charges.local.json sans fenêtres par masse (relancer build_anchors.js puis build_start_charges.js).');
else {
  res = valider(D);
  console.log(`\nBalle laissée de côté — loi des ancres (lois publiées) → configuration servie ; biais / écart quadratique (n)`);
  for (const [nom, f] of SOUS) { const s = res.filter(f); if (s.length) console.log(`  ${nom}\n    ${st(s.map((x) => x.actuel))}\n  → ${st(s.map((x) => x.servi))}`); }
  // Balles monolithiques de carabine, construction déclarée. Loi des ancres : P × facteur P du bloc monolithique. Loi à
  // deux pentes : SANS facteur, la charge maximale publiée de la masse porte déjà la construction (avec le facteur, le
  // 2026-10-16 : +5,2 % de biais, contre +2,1 % sans).
  const MP = COEF.monolithique && COEF.monolithique.rifle && COEF.monolithique.rifle.P, mo = res.filter((x) => x.type === 'rifle' && x.mono);
  if (MP && mo.length) console.log(`  monolithiques de carabine, construction déclarée (ancres × ${MP} ; deux pentes sans facteur)\n    ${st(mo.map((x) => (1 + x.actuel) * MP - 1))}\n  → ${st(mo.map((x) => x.deux ? x.servi : (1 + x.servi) * MP - 1))}`);
  // Arme de poing : le maximum MOYEN de la masse ne porte qu'en partie la construction d'une monolithique (sans facteur,
  // −7,9 % ; avec le facteur de la loi des ancres, +15 %, le 2026-10-16) : facteur propre, mesuré ici (moyenne
  // géométrique de P publiée / P prédite sur ses monolithiques), appliqué quand la balle est déclarée monolithique.
  const MPh = COEF.monolithique && COEF.monolithique.handgun && COEF.monolithique.handgun.P, moh = res.filter((x) => x.type === 'handgun' && x.mono && x.deux);
  if (moh.length) {
    D.handgun.mono = +Math.exp(-mean(moh.map((x) => ln(1 + x.servi)))).toFixed(3);
    const mohA = res.filter((x) => x.type === 'handgun' && x.mono);
    console.log(`  monolithiques d'arme de poing, construction déclarée (ancres × ${MPh} ; deux pentes × ${D.handgun.mono}, facteur mesuré sur ${moh.length} charges)\n    ${st(mohA.map((x) => (1 + x.actuel) * MPh - 1))}\n  → ${st(mohA.map((x) => x.deux ? (1 + x.servi) * D.handgun.mono - 1 : (1 + x.servi) * MPh - 1))}`);
  }
  resSansNp = validerSansNp(D);
  console.log('\nCouples ancrés sans pression publiée (simulés) — ancre et η_p générique → moyenne avec le plafond tiré de la limite');
  for (const [nom, f] of [['carabine', (x) => x.type === 'rifle'], ['  dont combinés', (x) => x.type === 'rifle' && x.comb], ['  charges maximales', (x) => x.type === 'rifle' && x.max],
    ['arme de poing', (x) => x.type === 'handgun'], ['  dont combinés', (x) => x.type === 'handgun' && x.comb]]) {
    const s = resSansNp.filter(f); if (s.length) console.log(`  ${nom}\n    ${st(s.map((x) => x.actuel))}\n  → ${st(s.map((x) => x.servi))}`);
  }
}

// --- Essai hors ligne du 2026-10-16 : fenêtre de la balle elle-même ou de la masse, plusieurs γL --------------
if (process.argv.includes('--variantes')) {
  const vs = [2.0, gammaL, 2.5, 2.7], out = [];
  for (const [k, a0] of Object.entries(groups)) {
    const a = rowsP(a0), balles = by(a, (r) => r.bid), type = CAL[k.split('|')[0]] && CAL[k.split('|')[0]].type;
    if (Object.keys(balles).length < 2) continue;
    for (const [bid, g] of Object.entries(balles)) {
      const autres = a.filter((r) => r.bid !== bid); if (autres.length < 3) continue;
      const mx = autres.filter((r) => r.max && r.P > 0 && r.np > 0); if (!mx.length) continue;
      const lmx = mean(mx.map((r) => ln(r.m))), lPc = mean(mx.map((r) => ln(r.P) - alphaM * (ln(r.m) - lmx)));
      const maxB = g.filter((r) => r.max).map((r) => r.C), cPropre = maxB.length ? Math.max(...maxB) : null;
      const memes = by(a.filter((r) => r.max && Math.abs(r.m - g[0].m) < 0.5), (r) => r.bid);
      const cFen = Object.keys(memes).length ? Math.min(...Object.values(memes).map((x) => Math.max(...x.map((r) => r.C)))) : null;
      for (const r of g) {
        if (!(r.np > 0 && r.P > 0) || !cPropre) continue;
        const P0 = Math.exp(lPc + alphaM * (ln(r.m) - lmx)), x = { type, propre: {}, fen: {} };
        for (const gL of vs) { x.propre[gL] = P0 * (r.C / cPropre) ** gL / r.P - 1; x.fen[gL] = P0 * (r.C / cFen) ** gL / r.P - 1; }
        out.push(x);
      }
    }
  }
  console.log('\nVariantes (plafond d\'une charge maximale au moins) : fenêtre de la balle elle-même / de la masse');
  for (const [nom, f] of [['tout', () => true], ['carabine', (x) => x.type === 'rifle'], ['arme de poing', (x) => x.type === 'handgun']]) {
    const s = out.filter(f);
    for (const gL of vs) console.log(`  ${nom.padEnd(13)} γL ${gL.toFixed(2)} : balle ${st(s.map((x) => x.propre[gL]))}\n  ${''.padEnd(13)}         masse ${st(s.map((x) => x.fen[gL]))}`);
  }
}

if (process.argv.includes('--write')) {
  const rms = (a) => Math.sqrt(mean(a.map((v) => v * v))), part = (a) => a.filter((v) => v < -0.15).length / a.length;
  const degrade = (R, t) => { const x = (R || []).filter((y) => y.type === t);
    return x.length && (rms(x.map((y) => y.servi)) > rms(x.map((y) => y.actuel)) || part(x.map((y) => y.servi)) > part(x.map((y) => y.actuel))); };
  const pire = res && TYPES.filter((t) => degrade(res, t)).concat(TYPES.filter((t) => degrade(resSansNp, t)).map((t) => t + ', couples sans pression'));
  if (pire && pire.length && !process.argv.includes('--force')) {
    console.log(`\n-> NON écrit : la loi à deux pentes dégrade la pression (${pire.join(', ')}). --force pour écrire quand même.`);
    process.exitCode = 1;
  } else {
    // facteur monolithique de l'arme de poing : mesuré par la validation ; sans fenêtres (première passe), l'ancien
    const anc = COEF.deux_pentes && COEF.deux_pentes.handgun;
    if (D.handgun.mono == null && anc && anc.mono) D.handgun.mono = anc.mono;
    COEF.deux_pentes = { ...D, plafond_min: PLAFOND_MIN,
      _doc: 'Loi de pression à deux pentes (scripts/fit_deux_pentes.js ; EnergyModel.pressionDeuxPentes) : P = pc · (m/mpc)^alphaM · (C/Cref)^gammaL, pc et mpc dans les ancres (charges maximales publiées avec pression, plafond_min au moins), Cref dans les fenêtres par masse de start_charges.local.json : plus petit maximum (ref min, cmax) ou moyenne géométrique des maxima (ref moy, cmoy). Par type : gammaL propre s il est donné (sinon le commun), mono = facteur d une balle monolithique déclarée. plafond_limite (par type) : P max publiée / limite de la cartouche, plafond de la même loi pour un couple ancré sans pression (EnergyModel.pressionPlafondLimite, en moyenne géométrique avec la méthode de l ancre). Types listés seulement ; ailleurs, la loi des ancres.',
      _date: new Date().toISOString().slice(0, 10) };
    fs.writeFileSync(d('model_coefficients.json'), JSON.stringify(COEF, null, 2) + '\n');
    console.log(`\n-> bloc \`deux_pentes\` écrit dans data/model_coefficients.json${res ? '' : ' (sans validation : fenêtres par masse absentes)'} ; relancer build_anchors.js puis build_start_charges.js, puis ce script (validation ; --write une seconde fois pour le facteur monolithique de l'arme de poing)`);
  }
}
