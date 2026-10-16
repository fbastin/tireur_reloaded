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
const { groups, CAL } = require('./build_anchors.js');
const d = (f) => path.join(__dirname, '..', 'data', f);
const COEF = JSON.parse(fs.readFileSync(d('model_coefficients.json'))), L = COEF.local;
const ln = Math.log, mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const by = (a, f) => a.reduce((o, r) => ((o[f(r)] = o[f(r)] || []).push(r), o), {});
const rowsP = (a) => a.filter((r) => r.m > 0 && r.C > 0 && r.eeff > 0);
const TYPES = ['rifle'], PLAFOND_MIN = 2;

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
const gammaL = +pente(by(avecP, (r) => r.k + '#' + r.bid), (r) => ln(r.C), (r) => ln(r.P)).toFixed(3);
const alphaM = +pente(by(avecP.filter((r) => r.max), (r) => r.k + '|' + r.src), (r) => ln(r.m), (r) => ln(r.P)).toFixed(3);
console.log(`γL = d ln P / d ln C à balle donnée : ${gammaL} ; αM = d ln P_max / d ln m (couple × source) : ${alphaM}`);

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
const D = { gammaL, alphaM, types: TYPES };
const SOUS = [['tout', () => true], ['carabine', (x) => x.type === 'rifle'], ['  dont loi à deux pentes', (x) => x.type === 'rifle' && x.deux],
  ['  dont loi des ancres (sans plafond ou sans fenêtre)', (x) => x.type === 'rifle' && !x.deux], ['arme de poing (loi des ancres)', (x) => x.type === 'handgun'],
  ['RS départ', (x) => x.src === 'RS' && !x.max], ['RS max', (x) => x.src === 'RS' && x.max], ['max autres', (x) => x.src !== 'RS' && x.max],
  ['balles lourdes', (x) => x.dm > 0.15], ['balles légères', (x) => x.dm < -0.15]];
let res = null;
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
  const car = res && res.filter((x) => x.type === 'rifle'), rms = (a) => Math.sqrt(mean(a.map((v) => v * v)));
  const part = (a) => a.filter((v) => v < -0.15).length / a.length;
  const pire = car && (rms(car.map((x) => x.servi)) > rms(car.map((x) => x.actuel)) || part(car.map((x) => x.servi)) > part(car.map((x) => x.actuel)));
  if (pire && !process.argv.includes('--force')) {
    console.log('\n-> NON écrit : la loi à deux pentes dégrade la pression des carabines. --force pour écrire quand même.');
    process.exitCode = 1;
  } else {
    COEF.deux_pentes = { gammaL, alphaM, types: TYPES, plafond_min: PLAFOND_MIN,
      _doc: 'Loi de pression à deux pentes (scripts/fit_deux_pentes.js ; EnergyModel.pressionDeuxPentes) : P = pc · (m/mpc)^alphaM · (C/Cmax)^gammaL, pc et mpc dans les ancres (charges maximales publiées avec pression, plafond_min au moins), Cmax dans les fenêtres par masse de start_charges.local.json. Types listés seulement ; ailleurs, la loi des ancres.',
      _date: new Date().toISOString().slice(0, 10) };
    fs.writeFileSync(d('model_coefficients.json'), JSON.stringify(COEF, null, 2) + '\n');
    console.log(`\n-> bloc \`deux_pentes\` écrit dans data/model_coefficients.json${res ? '' : ' (sans validation : fenêtres par masse absentes)'} ; relancer build_anchors.js puis build_start_charges.js`);
  }
}
