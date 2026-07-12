/**
 * parse_lovex.js — extrait les tables du LOVEX Reloading Guide (Explosia).
 *
 *   node scripts/parse_lovex.js <file.pdf>
 *
 * Source fabricant (Explosia / Lovex, distribué par Shooters World), PDF à couche texte,
 * données « tested to CIP standards ».
 *
 * LA SOURCE LA PLUS RICHE DE TOUTES : contrairement à Norma/Speer/Vectan/Alliant, elle
 * publie la LONGUEUR DE CANON *et* la PRESSION (bar) de chaque charge. On peut donc en
 * dériver non seulement E_eff (vitesse) mais aussi η_p (pression) — comme Reload Swiss et
 * Western, et contrairement à toutes les autres sources « vitesse seule ».
 *
 * Comme Vectan, tout est publié en DEUX UNITÉS (g et grains, m/s et fps, bar et psi) :
 * chaque ligne porte sa propre redondance et une ligne mal découpée est rejetée.
 *
 * Structure : une section par cartouche (« <nom> » puis « Barrel Length: 150 mm »), puis un
 * bloc par masse de balle (« FMJ … 7.50 g … 115 grs »), puis les lignes de poudre :
 *   Poudre | départ (g, grs, m/s, fps) | max (g, grs, m/s, fps) | pression (bar, psi)
 *
 * Balles PLOMB (type « (L) ») écartées : nos coefficients sont calés sur du chemisé.
 * Règle commune : ON NE DEVINE JAMAIS — cartouche/poudre non résolue, unités discordantes,
 * invariants violés ⇒ rejet.
 *
 * Sortie LOCALE/gitignorée (données fabricant, non redistribuées).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const pdf = process.argv[2];
if (!pdf) { console.error('usage: node scripts/parse_lovex.js <file.pdf>'); process.exit(1); }

const d = (f) => path.join(__dirname, '..', 'data', f);
const CAL = JSON.parse(fs.readFileSync(d('calibers.json'))).calibers;
const PWD = JSON.parse(fs.readFileSync(d('powders.json'))).powders;

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const num = (s) => parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));

// Lovex écrit « .308 Winchester », « 7 mm Remington Mag. » ; nos clés suivent Reload Swiss.
const BRAND = [
  [/\bremington\b/g, 'rem'], [/\bwinchester\b/g, 'win'], [/\bmagnum\b/g, 'mag'], [/\bmag\b/g, 'mag'],
  [/\bspringfield\b/g, 'spring'], [/\bweatherby\b/g, 'wby'], [/\bmauser\b/g, ''], [/\bmm\b/g, ''],
];
const canonCal = (s) => {
  let t = String(s).toLowerCase().replace(/[.,]/g, ' ');
  for (const [re, to] of BRAND) t = t.replace(re, to);
  return t.replace(/[^a-z0-9]/g, '');
};
const calIdx = {}, canonIdx = new Map();
for (const k of Object.keys(CAL)) {
  for (const a of [k, ...(CAL[k].aliases || [])]) {
    calIdx[norm(a)] = k;
    const c = canonCal(a);
    if (canonIdx.has(c) && canonIdx.get(c) !== k) canonIdx.set(c, null);
    else if (!canonIdx.has(c)) canonIdx.set(c, k);
  }
}
const one = (s) => calIdx[norm(s)] || canonIdx.get(canonCal(s)) || null;
// « 9 mm Luger / 9 mm Parabelum / 9 x 19 » : plusieurs libellés séparés par « / »
const matchCal = (s) => {
  for (const part of String(s).split('/')) {
    const hit = one(part.trim());
    if (hit) return hit;
  }
  return null;
};

const pwdIdx = {};
for (const k of Object.keys(PWD)) pwdIdx[norm(k)] = k;
for (const k of Object.keys(PWD)) { const n = norm(PWD[k].name || ''); if (n && !pwdIdx[n]) pwdIdx[n] = k; }
const powderKey = (raw) => pwdIdx[norm(raw)] || pwdIdx[norm('Lovex ' + raw)] || null;

const GR2G = 0.06479891, FPS2MS = 0.3048, PSI2BAR = 0.0689476;
const close = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b));

const NUM = '\\d+(?:[.,]\\d+)?';
const INT = '\\d[\\d\\s]{2,6}';
// Poudre + départ(g, grs, m/s, fps) + max(g, grs, m/s, fps) + pression(bar, psi)
const ROW = new RegExp(
  `^\\s*([A-Z][A-Za-z0-9.]{1,8})\\s+(${NUM})\\s+(${NUM})\\s+(${INT})\\s+(${INT})\\s+(${NUM})\\s+(${NUM})\\s+(${INT})\\s+(${INT})\\s+(${INT})\\s+(${INT})`);

const txt = execFileSync('pdftotext', ['-layout', pdf, '-'], { maxBuffer: 1 << 28 }).toString();
const lines = txt.split('\n');

const rows = [];
const rej = { cartouche_inconnue: 0, poudre_inconnue: 0, unites_discordantes: 0, invariant: 0, balle_plomb: 0, type_absent: 0, sans_balle: 0 };
const unkP = new Map(), unkC = new Map();

let ck = null, barrel = null;
let bullet = null;      // { gr, g, type }
let pendingType = null;

for (let i = 0; i < lines.length; i++) {
  const l = lines[i];

  // 1. Section cartouche : le nom est la ligne qui PRÉCÈDE « Barrel Length: »
  const mb = /^\s*Barrel Length:\s*(\d+(?:[.,]\d+)?)\s*mm/i.exec(l);
  if (mb) {
    barrel = num(mb[1]);
    const name = (lines[i - 1] || '').trim();
    const hit = matchCal(name);
    if (hit) ck = hit;
    else { ck = null; if (name) { unkC.set(name, (unkC.get(name) || 0) + 1); rej.cartouche_inconnue++; } }
    bullet = null;
    continue;
  }

  // 2. En-tête d'un bloc balle : « <TYPE>   Powder Charge Velocity … » (le type est en tête
  //    de ligne ; « (L) » = balle PLOMB). La masse suit sur les lignes voisines, en g ET en grs.
  // Le type est le jeton qui précède « Powder Charge ». Il peut s'écrire « FMJ », « SP »,
  // « (L) » ou « (L)LRN » — cette dernière forme (plomb round-nose) échappait à une regex
  // trop stricte, si bien que des blocs PLOMB héritaient d'un type périmé et étaient traités
  // comme du chemisé. On capture donc le jeton tel quel, sans présumer de sa forme.
  const mt = /^\s*(\S{1,12})\s+Powder\s+Charge/.exec(l);
  if (mt) { pendingType = mt[1]; bullet = null; continue; }

  // « 7.50 g » et « 115 grs » ouvrent la ligne mais celle-ci se poursuit par des libellés de
  // colonne (« … Cartridge », « … Length ») : on n'ancre donc PAS la fin de ligne.
  const mg = /^\s*(\d+(?:[.,]\d+)?)\s*g\b(?!r)/.exec(l);       // « 7.50 g »  (pas « 115 grs »)
  const mgr = /^\s*(\d{2,3})\s*grs\b/.exec(l);                 // « 115 grs »
  if (mg) { bullet = { ...(bullet || {}), g: num(mg[1]), type: pendingType }; continue; }
  if (mgr) { bullet = { ...(bullet || {}), gr: parseInt(mgr[1], 10), type: pendingType }; continue; }

  // 3. Lignes de données
  const m = ROW.exec(l);
  if (!m) continue;
  if (!ck) continue;
  if (!bullet || !(bullet.g > 0 && bullet.gr > 0)) { rej.sans_balle++; continue; }

  // masse de balle : les deux unités doivent concorder (garde-fou propre à cette source)
  if (!close(bullet.g, bullet.gr * GR2G, 0.03)) { rej.unites_discordantes++; continue; }
  // Balles PLOMB : « (L) », « (L)LRN », LRN, SWC, WC… Nos coefficients sont calés sur du
  // CHEMISÉ ; une balle plomb, moins freinée, rendrait un E_eff plus élevé. Un type ABSENT
  // est également rejeté (on ne suppose pas qu'il s'agit de chemisé).
  const bt = bullet.type || '';
  if (!bt) { rej.type_absent++; continue; }
  if (/\(L\)|LRN|LEAD|SWC|\bWC\b|PLOMB/i.test(bt)) { rej.balle_plomb++; continue; }

  const [, pw, sg, sgr, sms, sfps, mgc, mgrc, mms, mfps, bar, psi] =
    m.map((x, idx) => (idx === 1 ? x : x));
  const v = {
    sg: num(sg), sgr: num(sgr), sms: num(sms), sfps: num(sfps),
    mg: num(mgc), mgr: num(mgrc), mms: num(mms), mfps: num(mfps),
    bar: num(bar), psi: num(psi),
  };

  // REDONDANCE DES UNITÉS : g↔grains, m/s↔fps, bar↔psi. Toute discordance = mauvais découpage.
  if (!close(v.sg, v.sgr * GR2G, 0.06) || !close(v.mg, v.mgr * GR2G, 0.06)) { rej.unites_discordantes++; continue; }
  if (!close(v.sms, v.sfps * FPS2MS, 0.02) || !close(v.mms, v.mfps * FPS2MS, 0.02)) { rej.unites_discordantes++; continue; }
  if (!close(v.bar, v.psi * PSI2BAR, 0.03)) { rej.unites_discordantes++; continue; }
  if (!(v.mgr > v.sgr && v.mms > v.sms)) { rej.invariant++; continue; }

  const pk = powderKey(pw);
  if (!pk) { rej.poudre_inconnue++; unkP.set(pw, (unkP.get(pw) || 0) + 1); continue; }

  rows.push({
    cartridge: ck, bullet_gr: bullet.gr, powder: pk, barrel_mm: barrel,
    start_gr: +v.sgr.toFixed(2), start_ms: Math.round(v.sms),
    max_gr: +v.mgr.toFixed(2), max_ms: Math.round(v.mms),
    max_Pmax_bar: Math.round(v.bar),      // pression AU MAX (permet η_p, comme Reload Swiss)
  });
}

const out = {
  _src: 'LOVEX Reloading Guide (Explosia) — données testées aux normes CIP. Publie la longueur '
      + 'de canon ET la pression (bar) : permet de dériver E_eff ET η_p. Charge départ + max. '
      + 'Données fabricant : brut NON redistribué (local/gitignored), seuls les coefficients '
      + 'dérivés sont publiés.',
  _date: new Date().toISOString().slice(0, 10),
  rows,
};
fs.writeFileSync(d('lovex.local.json'), JSON.stringify(out, null, 1));

const combos = new Set(rows.map((r) => r.cartridge + '|' + r.powder));
console.log(`Lovex : ${rows.length} lignes retenues`);
console.log(`  ${combos.size} couples cartouche|poudre, ${new Set(rows.map((r) => r.cartridge)).size} cartouches, ${new Set(rows.map((r) => r.powder)).size} poudres`);
console.log(`  rejets : poudre inconnue ${rej.poudre_inconnue} | unités discordantes ${rej.unites_discordantes} | balle plomb ${rej.balle_plomb} | type absent ${rej.type_absent} | sans balle ${rej.sans_balle} | invariant ${rej.invariant} | cartouche non résolue ${rej.cartouche_inconnue}`);
const tp = [...unkP.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
if (tp.length) console.log('  poudres non reconnues :', tp.map(([k, n]) => `${k}×${n}`).join(', '));
const tc = [...unkC.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
if (tc.length) console.log('  cartouches non résolues :', tc.map(([k, n]) => `${k}×${n}`).join(', '));
console.log('-> data/lovex.local.json');
