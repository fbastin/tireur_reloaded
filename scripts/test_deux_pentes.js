/**
 * test_deux_pentes.js — loi de pression à deux pentes, TEST hors ligne (console seule, n'écrit rien ; 2026-10-16).
 *
 * Usage : node scripts/test_deux_pentes.js [γL,...]       (défaut 2.0,2.24,2.5,2.7)
 *
 * POURQUOI. Les lois locales (fit_local_laws.js) n'ont qu'un exposant de charge γ pour deux choses : l'échelle
 * d'une balle (pente 2,7) et l'écart de charge maximale entre balles, toutes publiées au plafond de pression
 * (pente ≈ 0). Recalé le 2026-10-15 (γ 2,24), le modèle faisait moins bien balle laissée de côté.
 *
 * ESSAI. P = P_plafond(m) · (C / Cmax)^γL : Cmax, charge maximale publiée de la balle ; P_plafond, pression des
 * charges maximales des AUTRES balles du couple, ramenée à la masse par αM. Deux Cmax : celui de la balle (« max
 * propre » : l'outil devrait connaître la balle, pas seulement sa masse) ; le plus petit max des balles de même
 * masse du couple (« fenêtre » : ce que donnerait une fenêtre de charge par masse). Charges et balle laissée de
 * côté : celles de fit_local_laws.js ; « actuel » = lois publiées. Résultats : docs/MODEL.md § 3.5.
 */
const EM = require('../energy_model.js');
const { groups, CAL } = require('./build_anchors.js');
const COEF = require('../data/model_coefficients.json'), L = COEF.local;
const ln = Math.log, mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const by = (a, f) => a.reduce((o, r) => ((o[f(r)] = o[f(r)] || []).push(r), o), {});
const rowsP = (a) => a.filter((r) => r.m > 0 && r.C > 0 && r.eeff > 0);
// αM : effets fixes couple × source, charges maximales avec pression
let sxy = 0, sxx = 0;
for (const [k, a0] of Object.entries(groups)) for (const g of Object.values(by(rowsP(a0).filter((r) => r.max && r.P > 0 && r.np > 0), (r) => r.src))) {
  if (g.length < 2) continue; const mx = mean(g.map((r) => ln(r.m))), my = mean(g.map((r) => ln(r.P)));
  for (const r of g) { sxy += (ln(r.m) - mx) * (ln(r.P) - my); sxx += (ln(r.m) - mx) ** 2; }
}
const aM = sxy / sxx;
console.log(`αM (ln P_max sur ln m, couple × source) = ${aM.toFixed(3)}`);
const variantes = (process.argv[2] || '2.0,2.24,2.5,2.7').split(',').map(Number);
const res = [];
for (const [k, a0] of Object.entries(groups)) {
  const a = rowsP(a0), balles = by(a, (r) => r.bid), type = CAL[k.split('|')[0]] && CAL[k.split('|')[0]].type;
  if (Object.keys(balles).length < 2) continue;
  for (const [bid, g] of Object.entries(balles)) {
    const autres = a.filter((r) => r.bid !== bid); if (autres.length < 3) continue;
    const lc = mean(autres.map((r) => ln(r.C))), lm = mean(autres.map((r) => ln(r.m))), pr = autres.filter((r) => r.np > 0);
    const E0 = Math.exp(mean(autres.map((r) => ln(r.eeff) - L.delta * (ln(r.C) - lc) - L.beta * (ln(r.m) - lm))));
    const N0 = pr.length ? Math.exp(mean(pr.map((r) => ln(r.np) - L.eps * (ln(r.C) - lc) - L.zeta * (ln(r.m) - lm)))) : null;
    // plafond : charges maximales des autres balles, avec pression
    const mx = autres.filter((r) => r.max && r.P > 0 && r.np > 0);
    const lmx = mx.length ? mean(mx.map((r) => ln(r.m))) : null;
    const lPc = mx.length ? mean(mx.map((r) => ln(r.P) - aM * (ln(r.m) - lmx))) : null;
    // Cmax de la balle : le sien ; ou le plus petit max des balles de même masse du couple (fenêtre prudente)
    const maxB = g.filter((r) => r.max).map((r) => r.C);
    const cPropre = maxB.length ? Math.max(...maxB) : null;
    const memes = a.filter((r) => r.max && Math.abs(r.m - g[0].m) < 0.5);
    const parBalle = by(memes, (r) => r.bid), cFen = memes.length ? Math.min(...Object.values(parBalle).map((x) => Math.max(...x.map((r) => r.C)))) : null;
    for (const r of g) {
      if (!(r.np > 0 && r.P > 0) || N0 == null) continue;
      const Ep = E0 * EM.localE(L, r.C, r.m, Math.exp(lc), Math.exp(lm)), Np = N0 * EM.localNp(L, r.C, r.m, Math.exp(lc), Math.exp(lm));
      const actuel = (Ep / r.eeff) * (r.np / Np);
      const x = { src: r.src, max: r.max, type, dm: ln(r.m) - lm, actuel: actuel - 1, propre: {}, fen: {} };
      for (const gL of variantes) {
        const plafond = lPc != null ? Math.exp(lPc + aM * (ln(r.m) - lmx)) : null;
        x.propre[gL] = (plafond && cPropre) ? plafond * (r.C / cPropre) ** gL / r.P - 1 : actuel - 1;
        x.fen[gL] = (plafond && cFen) ? plafond * (r.C / cFen) ** gL / r.P - 1 : actuel - 1;
      }
      x.couvert = !!(lPc != null && cPropre);
      res.push(x);
    }
  }
}
const pc = (v) => (100 * v).toFixed(1);
const st = (e) => { const s = e.slice().sort((p, q) => p - q); return `${pc(mean(e)).padStart(5)} / ${pc(Math.sqrt(mean(e.map((v) => v * v)))).padStart(4)} % | >15 % ${pc(e.filter((v) => v < -0.15).length / e.length).padStart(4)} % | c1 ${pc(s[Math.floor(0.01 * s.length)]).padStart(5)} %`; };
const sets = [['tout', () => true], ['RS départ', (x) => x.src === 'RS' && !x.max], ['RS max', (x) => x.src === 'RS' && x.max], ['max autres', (x) => x.src !== 'RS' && x.max],
  ['lourdes', (x) => x.dm > 0.15], ['légères', (x) => x.dm < -0.15], ['carabine', (x) => x.type === 'rifle'], ['arme de poing', (x) => x.type === 'handgun']];
console.log(`charges ${res.length}, couvertes par le plafond et le max propre ${res.filter((x) => x.couvert).length}`);
for (const [nom, f] of sets) {
  const s = res.filter(f);
  console.log(`\n${nom} (${s.length})`);
  console.log(`  actuel              ${st(s.map((x) => x.actuel))}`);
  for (const gL of variantes) console.log(`  max propre, γL ${gL.toFixed(2)} ${st(s.map((x) => x.propre[gL]))}`);
  for (const gL of variantes) console.log(`  fenêtre,    γL ${gL.toFixed(2)} ${st(s.map((x) => x.fen[gL]))}`);
}
