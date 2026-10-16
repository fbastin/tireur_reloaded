/**
 * essai_departs_hodgdon.js — les charges de DÉPART du manuel Hodgdon, avec leur pression, changent-elles le modèle ?
 * ESSAI (2026-10-16), console seule, n'écrit rien.
 *
 * Usage : node scripts/essai_departs_hodgdon.js
 *         (positionne lui-même ANCRES_DEPARTS_HODGDON=1 : build_anchors.js ajoute alors les départs Hodgdon aux charges)
 *
 * POURQUOI. La pente de pression à balle donnée (γ des lois locales, γL de la loi à deux pentes) n'est mesurée que sur
 * Reload Swiss, seul guide dont on lisait la pression au départ ET au maximum. Le manuel Hodgdon publie les deux
 * (colonne « Starting Loads », extraite depuis le 2026-10-16).
 *
 * 1. Pentes balle par balle, départ → maximum : pression (γ) et énergie (δ), Hodgdon contre Reload Swiss.
 * 2. Estimations groupées (moindres carrés, effets fixes par balle), avec et sans les départs Hodgdon.
 * 3. Validation, balle laissée de côté, sur toutes les charges avec pression, départs Hodgdon compris : modèle
 *    servi (ancres sans départs), mêmes lois avec les départs dans les ancres, lois recalées sans et avec eux.
 * Résultats et décision (rien d'appliqué) : docs/MODEL.md § 3.8.
 */
process.env.ANCRES_DEPARTS_HODGDON = '1';
const fs = require('fs');
const path = require('path');
const EM = require('../energy_model.js');
const { groups, CAL } = require('./build_anchors.js');
const d = (f) => path.join(__dirname, '..', 'data', f);
const COEF = JSON.parse(fs.readFileSync(d('model_coefficients.json')));
const FEN = JSON.parse(fs.readFileSync(d('start_charges.local.json'))).fenetres_masse || {};
const ln = Math.log, mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const by = (a, f) => a.reduce((o, r) => ((o[f(r)] = o[f(r)] || []).push(r), o), {});
const quant = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const pc = (v) => (100 * v).toFixed(1);

const rows = Object.entries(groups).flatMap(([k, a]) => a.filter((r) => r.m > 0 && r.C > 0 && r.eeff > 0)
  .map((r) => ({ ...r, k, type: (CAL[k.split('|')[0]] || {}).type })));

// --- 1. Pentes balle par balle (deux charges au moins, écart de charge d'au moins 2 %) ---------------------------
function pentes(src, avecDeparts) {
  const out = { g: [], dl: [] };
  for (const g of Object.values(by(rows.filter((r) => r.src === src && (avecDeparts || !r.depart)), (r) => r.k + '#' + r.bid))) {
    const lo = g.reduce((a, r) => (r.C < a.C ? r : a)), hi = g.reduce((a, r) => (r.C > a.C ? r : a));
    const dc = ln(hi.C / lo.C); if (dc < 0.02) continue;
    out.dl.push({ v: ln(hi.eeff / lo.eeff) / dc, type: lo.type });
    if (lo.P > 0 && hi.P > 0) out.g.push({ v: ln(hi.P / lo.P) / dc, type: lo.type, dc });
  }
  return out;
}
const resume = (a) => a.length ? `médiane ${quant(a.map((x) => x.v), 0.5).toFixed(2)}, quartiles ${quant(a.map((x) => x.v), 0.25).toFixed(2)}–${quant(a.map((x) => x.v), 0.75).toFixed(2)} (${a.length} balles)` : '—';
console.log('1. Pentes balle par balle, départ → maximum');
for (const [nom, src] of [['Reload Swiss', 'RS'], ['Hodgdon', 'Hodg']]) {
  const p = pentes(src, true);
  console.log(`  ${nom.padEnd(12)} pression γ : ${resume(p.g)}`);
  for (const t of ['rifle', 'handgun']) console.log(`  ${''.padEnd(12)}   ${t === 'rifle' ? 'carabine' : 'arme de poing'} : ${resume(p.g.filter((x) => x.type === t))}`);
  console.log(`  ${''.padEnd(12)} énergie δ  : ${resume(p.dl)}`);
  console.log(`  ${''.padEnd(12)} charge de départ / maximum : médiane ${Math.exp(-quant(p.g.map((x) => x.dc), 0.5)).toFixed(3)} (balles avec pression)`);
}

// --- 2. Estimations groupées ---------------------------------------------------------------------------------------
function pente(grp, x, y) {
  let sxy = 0, sxx = 0;
  for (const g of Object.values(grp)) {
    if (g.length < 2) continue;
    const mx = mean(g.map(x)), my = mean(g.map(y));
    for (const r of g) { sxy += (x(r) - mx) * (y(r) - my); sxx += (x(r) - mx) ** 2; }
  }
  return sxy / sxx;
}
function lois(avecDeparts) {
  const a = rows.filter((r) => avecDeparts || !r.depart), avecP = a.filter((r) => r.P > 0 && r.np > 0);
  const parBalle = (s) => by(s, (r) => r.k + '#' + r.bid), parCoupleSrc = (s) => by(s, (r) => r.k + '|' + r.src);
  const delta = pente(parBalle(a), (r) => ln(r.C), (r) => ln(r.eeff)), gamma = pente(parBalle(avecP), (r) => ln(r.C), (r) => ln(r.P));
  const beta = pente(parCoupleSrc(a), (r) => ln(r.m), (r) => ln(r.eeff) - delta * ln(r.C));
  const alpha = pente(parCoupleSrc(avecP), (r) => ln(r.m), (r) => ln(r.P) - gamma * ln(r.C));
  const alphaM = pente(parCoupleSrc(avecP.filter((r) => r.max)), (r) => ln(r.m), (r) => ln(r.P));
  const r3 = (x) => +x.toFixed(3);
  const L = { delta: r3(delta), gamma: r3(gamma), beta: r3(beta), alpha: r3(alpha) };
  L.eps = r3(L.delta + 1 - L.gamma); L.zeta = r3(L.beta - L.alpha);
  return { L, D: { gammaL: r3(gamma), alphaM: r3(alphaM), types: ['rifle'] } };
}
const sans = lois(false), avec = lois(true);
console.log('\n2. Estimations groupées (moindres carrés, effets fixes)');
console.log(`  publiées              : δ ${COEF.local.delta}, γ ${COEF.local.gamma}, β ${COEF.local.beta}, α ${COEF.local.alpha} ; γL ${COEF.deux_pentes.gammaL}, αM ${COEF.deux_pentes.alphaM}`);
console.log(`  sans départs Hodgdon  : δ ${sans.L.delta}, γ ${sans.L.gamma}, β ${sans.L.beta}, α ${sans.L.alpha} ; γL ${sans.D.gammaL}, αM ${sans.D.alphaM}`);
console.log(`  avec départs Hodgdon  : δ ${avec.L.delta}, γ ${avec.L.gamma}, β ${avec.L.beta}, α ${avec.L.alpha} ; γL ${avec.D.gammaL}, αM ${avec.D.alphaM}`);

// --- 3. Validation, balle laissée de côté ------------------------------------------------------------------------
// Loi des ancres (L) partout ; loi à deux pentes (D) en carabine quand le plafond (charges maximales des AUTRES
// balles, deux au moins) et la fenêtre servie de la masse existent — comme la page.
function valider(L, D, ancresSansDeparts) {
  const res = [];
  for (const [k, a0] of Object.entries(groups)) {
    const a = a0.filter((r) => r.m > 0 && r.C > 0 && r.eeff > 0), balles = by(a, (r) => r.bid), type = (CAL[k.split('|')[0]] || {}).type;
    if (Object.keys(balles).length < 2) continue;
    for (const [bid, g] of Object.entries(balles)) {
      const autres = a.filter((r) => r.bid !== bid && !(ancresSansDeparts && r.depart)); if (autres.length < 3) continue;
      const lc = mean(autres.map((r) => ln(r.C))), lm = mean(autres.map((r) => ln(r.m))), pr = autres.filter((r) => r.np > 0);
      const E0 = Math.exp(mean(autres.map((r) => ln(r.eeff) - L.delta * (ln(r.C) - lc) - L.beta * (ln(r.m) - lm))));
      const N0 = pr.length ? Math.exp(mean(pr.map((r) => ln(r.np) - L.eps * (ln(r.C) - lc) - L.zeta * (ln(r.m) - lm)))) : null;
      const mx = autres.filter((r) => r.max && r.P > 0 && r.np > 0), lmx = mx.length ? mean(mx.map((r) => ln(r.m))) : 0;
      const anc = mx.length >= 2 ? { pc: Math.exp(mean(mx.map((r) => ln(r.P) - D.alphaM * (ln(r.m) - lmx)))), mpc: Math.exp(lmx) } : null;
      for (const r of g) {
        if (!(r.np > 0 && r.P > 0) || N0 == null) continue;
        const Ep = E0 * EM.localE(L, r.C, r.m, Math.exp(lc), Math.exp(lm)), Np = N0 * EM.localNp(L, r.C, r.m, Math.exp(lc), Math.exp(lm));
        const P2 = EM.pressionDeuxPentes({ deux_pentes: D }, anc, EM.fenetreMasse(FEN[k], r.m), r.m, r.C, type);
        res.push({ src: r.src, max: r.max, depart: !!r.depart, type, ev: Math.sqrt(Ep / r.eeff) - 1, ep: P2 != null ? P2 / r.P - 1 : (Ep / r.eeff) * (r.np / Np) - 1 });
      }
    }
  }
  return res;
}
const st = (e) => e.length ? `${pc(mean(e)).padStart(5)} / ${pc(Math.sqrt(mean(e.map((v) => v * v)))).padStart(4)} % (${String(e.length).padStart(4)}) | >15 % ${pc(e.filter((v) => v < -0.15).length / e.length).padStart(4)} % | c1 ${pc(quant(e, 0.01)).padStart(5)} %` : '—';
const V = [['servi (ancres sans départs)', COEF.local, COEF.deux_pentes, true], ['publié, départs dans ancres', COEF.local, COEF.deux_pentes, false],
  ['recalé sans départs Hodgdon', sans.L, sans.D, false], ['recalé avec départs Hodgdon', avec.L, avec.D, false]];
const SOUS = [['tout', () => true], ['carabine', (x) => x.type === 'rifle'], ['arme de poing', (x) => x.type === 'handgun'],
  ['Hodgdon départ', (x) => x.depart], ['Hodgdon départ, carabine', (x) => x.depart && x.type === 'rifle'], ['Hodgdon départ, arme de poing', (x) => x.depart && x.type === 'handgun'],
  ['Hodgdon max', (x) => x.src === 'Hodg' && x.max], ['RS départ', (x) => x.src === 'RS' && !x.max], ['RS max', (x) => x.src === 'RS' && x.max],
  ['max autres', (x) => x.src !== 'RS' && x.max]];
console.log('\n3. Validation, balle laissée de côté, départs Hodgdon compris — pression biais / écart quadratique (n) ; vitesse des mêmes charges');
const R = V.map(([nom, L, D, sd]) => [nom, valider(L, D, sd)]);
for (const [s, f] of SOUS) {
  console.log(`  ${s}`);
  for (const [nom, res] of R) { const x = res.filter(f); console.log(`    ${nom.padEnd(28)} ${st(x.map((y) => y.ep))}`); }
}
for (const [nom, res] of R) console.log(`  vitesse, ${nom.padEnd(28)} ${st(res.map((y) => y.ev))}`);
