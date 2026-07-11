/**
 * parse_alliant.js — extrait les données de charge du Alliant Powder Reloader's Guide (PDF).
 *
 *   node scripts/parse_alliant.js <file.pdf>
 *
 * Contrairement au Lyman (scan OCR, cf. lyman_crosscheck.js), ce PDF a une VRAIE couche
 * texte : pas de bruit de reconnaissance, donc la source peut ANCRER.
 *
 * Alliant ne publie que la charge MAXIMALE (sa consigne : retrancher 10 % pour la charge de
 * départ) → 1 point (charge, vitesse) par ligne, comme LoadData. Les vitesses sont mesurées
 * « with SAAMI approved, UN-VENTED test barrels » (p.3) — canon fermé, donc comparable à
 * notre référence CIP ; la longueur n'est pas publiée → v0 traitée au canon de référence de
 * la cartouche, comme Norma/Speer/VV.
 *
 * Mise en page : 2 colonnes. Une ligne de texte porte 7 champs (une entrée) ou 14 (les deux
 * colonnes). Champs : « <NNN>-gr <balle> | poudre | amorce | étui | OAL | charge[C] | v0 ».
 * Le « C » final d'une charge = charge comprimée. Les tables SHOTSHELL sont naturellement
 * écartées : leurs lignes ne commencent pas par « NN-gr ».
 *
 * Règle identique aux autres parseurs : ON NE DEVINE JAMAIS. Cartouche ou poudre non
 * résolue, masse de balle physiquement invraisemblable ⇒ ligne rejetée, jamais réparée.
 *
 * Sortie LOCALE/gitignorée (données fabricant, non redistribuées ; seuls les coefficients
 * dérivés sont publiés).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const pdf = process.argv[2];
if (!pdf) { console.error('usage: node scripts/parse_alliant.js <file.pdf>'); process.exit(1); }

const d = (f) => path.join(__dirname, '..', 'data', f);
const CAL = JSON.parse(fs.readFileSync(d('calibers.json'))).calibers;
const PWD = JSON.parse(fs.readFileSync(d('powders.json'))).powders;

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// Alliant écrit les cartouches en toutes lettres (« 30-06 Springfield ») là où nos clés
// suivent le Guide Reload Swiss (« 30-06 Spring. »). Canonicalisation déterministe des mots
// de marque, appliquée des deux côtés — jamais d'appariement flou.
const BRAND = [
  [/\bremington\b/g, 'rem'], [/\bwinchester\b/g, 'win'], [/\bmagnum\b/g, 'mag'],
  [/\bspringfield\b/g, 'spring'], [/\bweatherby\b/g, 'wby'], [/\bautomatic\b/g, 'auto'],
  [/\bauto\b/g, 'auto'], [/\bmauser\b/g, ''], [/\bmm\b/g, ''],
];
const canonCal = (s) => {
  let t = String(s).toLowerCase().replace(/[.,]/g, ' ');
  for (const [re, to] of BRAND) t = t.replace(re, to);
  return t.replace(/[^a-z0-9]/g, '');
};
const calIdx = {};
const canonIdx = new Map();
for (const k of Object.keys(CAL)) {
  for (const a of [k, ...(CAL[k].aliases || [])]) {
    calIdx[norm(a)] = k;
    const c = canonCal(a);
    if (canonIdx.has(c) && canonIdx.get(c) !== k) canonIdx.set(c, null);   // ambigu → écarté
    else if (!canonIdx.has(c)) canonIdx.set(c, k);
  }
}
const matchCal = (s) => calIdx[norm(s)] || canonIdx.get(canonCal(s)) || null;

// Index poudres : la clé exacte, le nom produit, et le nom sans son fabricant (« Alliant
// Reloder 7 » → « Reloder 7 », qui est la forme employée par le guide). Un alias ambigu
// (deux poudres différentes) est neutralisé plutôt que d'attribuer la charge à la mauvaise.
const MFG = /^(hodgdon|imr|alliant|accurate|vihtavuori|winchester|norma|ramshot|lovex|western)\s+/i;
const pwdIdx = {};
const addPwd = (alias, k) => {
  const n = norm(alias);
  if (!n) return;
  if (n in pwdIdx && pwdIdx[n] !== k) { pwdIdx[n] = null; return; }
  if (!(n in pwdIdx)) pwdIdx[n] = k;
};
for (const k of Object.keys(PWD)) pwdIdx[norm(k)] = k;
for (const k of Object.keys(PWD)) {
  for (const c of [k, PWD[k].name || '']) {
    for (const part of String(c).split(',')) {
      const p = part.trim();
      if (!p) continue;
      addPwd(p, k);
      const stripped = p.replace(MFG, '').trim();
      if (stripped && stripped !== p) addPwd(stripped, k);
    }
  }
}

const CUT = 100;                                   // frontière des 2 colonnes (en caractères)
const isBullet = (t) => /^\d{2,3}-gr\b/.test(t);
const isOAL = (t) => /^\d\.\d{3}$/.test(t);
const isChg = (t) => /^\d{1,3}\.\d\s*C?$/.test(t);
const isVel = (t) => /^\d{3,4}$/.test(t);

const txt = execFileSync('pdftotext', ['-layout', pdf, '-'], { maxBuffer: 1 << 28 }).toString();

const rows = [];
const rej = { cartouche_inconnue: 0, poudre_inconnue: 0, balle_invraisemblable: 0, balle_plomb: 0, sans_cartouche: 0 };
const unknownCarts = new Map(), unknownPowders = new Map();
const cart = [null, null];                          // cartouche courante par colonne

for (const line of txt.split('\n')) {
  if (!line.trim()) continue;

  // Découpage en champs (le -layout garantit 2+ espaces entre colonnes du tableau)
  const parts = [];
  const re = /\S(?:.*?\S)?(?=\s{2,}|$)/g;
  let m;
  while ((m = re.exec(line)) !== null) parts.push({ t: m[0], x: m.index });

  // 1. En-têtes de cartouche. Un en-tête qui NE RÉSOUT PAS doit INVALIDER la colonne, et non
  // laisser la cartouche précédente active : le guide contient des sections « 38 Special +P »
  // (pression supérieure) et des tables shotshell. En héritant de l'en-tête précédent, on
  // attribuait des charges +P au 38 Special standard — d'où des balles lourdes plus rapides
  // que des légères (10,6 % d'incohérences physiques). Section inconnue ⇒ on ne prend rien.
  for (const p of parts) {
    if (isBullet(p.t) || isVel(p.t) || isOAL(p.t) || isChg(p.t)) continue;
    if (p.t.length < 3 || p.t.length > 44) continue;
    const looksHeader = /^[\d.]/.test(p.t) && /[A-Za-z]/.test(p.t) && parts.length <= 2;
    const hit = matchCal(p.t);
    if (hit) cart[p.x < CUT ? 0 : 1] = hit;
    else if (looksHeader) {
      cart[p.x < CUT ? 0 : 1] = null;                             // section non reconnue → bloquée
      unknownCarts.set(p.t, (unknownCarts.get(p.t) || 0) + 1);
    }
  }

  // 2. Lignes de données : groupes de 7 champs validés par motif.
  for (let i = 0; i + 6 < parts.length + 1 && i < parts.length; i++) {
    const f = parts.slice(i, i + 7);
    if (f.length < 7) break;
    if (!(isBullet(f[0].t) && isOAL(f[4].t) && isChg(f[5].t) && isVel(f[6].t))) continue;

    const col = f[0].x < CUT ? 0 : 1;
    const ck = cart[col];
    if (!ck) { rej.sans_cartouche++; i += 6; continue; }

    // Balles PLOMB / coulées : Alliant les mélange aux chemisées dans la même table
    // (« 125-gr Oregon Trails lead », « 98-gr HBWC »). Moins freinée dans les rayures, une
    // balle plomb rend un E_eff plus élevé — nos coefficients sont calés sur du CHEMISÉ.
    // Les inclure biaiserait les ancres, on les écarte (et cela explique les balles lourdes
    // « plus rapides » que des légères, qui n'étaient donc PAS des erreurs d'extraction).
    if (/\b(lead|cast|mou?ld|HBWC|BBWC|SWC|LSWC|LRN|LFN|Oregon Trails|Meister|Laser)\b/i.test(f[0].t)) {
      rej.balle_plomb++; i += 6; continue;
    }

    const bullet_gr = parseInt(f[0].t, 10);
    const rawPowder = f[1].t.trim();
    const charge_gr = parseFloat(f[5].t);
    const v0_fps = parseInt(f[6].t, 10);
    const compressed = /C\s*$/.test(f[5].t);

    // « Amer. Select » = American Select : abréviation du guide, règle déterministe.
    const pk = pwdIdx[norm(rawPowder)] || pwdIdx[norm(rawPowder.replace(/^Amer\.\s*/i, 'American '))];
    if (!pk) {
      rej.poudre_inconnue++;
      unknownPowders.set(rawPowder, (unknownPowders.get(rawPowder) || 0) + 1);
      i += 6; continue;
    }

    // Plausibilité physique de la masse : la densité sectionnelle SD = m(lb)/d(in)² tient dans
    // une bande étroite pour toute balle réelle. Écarte une masse mal appariée à la cartouche.
    const dIn = CAL[ck].bore_mm / 25.4;
    const sd = (bullet_gr / 7000) / (dIn * dIn);
    if (!(sd >= 0.10 && sd <= 0.42)) { rej.balle_invraisemblable++; i += 6; continue; }

    rows.push({ cartridge: ck, bullet_gr, powder: pk, charge_gr, v0_fps, compressed });
    i += 6;
  }
}

const out = {
  _src: 'Alliant Powder Reloader\'s Guide (PDF officiel, couche texte) — charges MAXIMALES '
      + 'seulement (retrancher 10 % pour la charge de départ, consigne Alliant). Vitesses en '
      + 'canon d\'essai SAAMI NON VENTÉ, longueur non publiée → traitées au canon de référence '
      + 'de la cartouche. Données fabricant : brut NON redistribué (local/gitignored), seuls '
      + 'les coefficients dérivés sont publiés.',
  _date: new Date().toISOString().slice(0, 10),
  rows,
};
fs.writeFileSync(d('alliant.local.json'), JSON.stringify(out, null, 1));

const combos = new Set(rows.map((r) => r.cartridge + '|' + r.powder));
console.log(`Alliant : ${rows.length} lignes retenues`);
console.log(`  ${combos.size} couples cartouche|poudre, ${new Set(rows.map((r) => r.cartridge)).size} cartouches, ${new Set(rows.map((r) => r.powder)).size} poudres`);
console.log(`  rejets : poudre inconnue ${rej.poudre_inconnue} | cartouche/section non résolue ${rej.sans_cartouche} | balle plomb/coulée ${rej.balle_plomb} | balle invraisemblable ${rej.balle_invraisemblable}`);
const tp = [...unknownPowders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
if (tp.length) console.log('  poudres non reconnues :', tp.map(([k, n]) => `${k}×${n}`).join(', '));
const tc = [...unknownCarts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
if (tc.length) console.log('  en-têtes non résolus :', tc.map(([k, n]) => `${k}×${n}`).join(', '));
console.log('-> data/alliant.local.json');
