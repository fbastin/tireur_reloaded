/**
 * parse_lyman.js — extract load data from the OCR'd Lyman Reloading Handbook (48th ed.).
 *
 *   node scripts/parse_lyman.js <file.pdf>
 *
 * VITESSE seule (start + max), comme Vihtavuori/Norma/Speer : aucune longueur de canon
 * n'est imprimée par cartouche → la vitesse est traitée au canon de référence.
 *
 * SOURCE OCR (ABBYY) — c'est la difficulté propre à ce parseur. Le texte est abîmé de
 * façon visible (« lOOgr. » pour « 100gr. », « MR4895 » pour « IMR4895 », « Starling »
 * pour « Starting »). Un chiffre mal lu dans une charge est indétectable par simple
 * contrôle de bornes, d'où la règle : ON NE DEVINE JAMAIS. Toute poudre non reconnue
 * dans powders.json, toute masse de balle non plausible, toute ligne violant les
 * invariants (départ < max, en charge ET en vitesse) est REJETÉE, jamais réparée.
 * Le compte des rejets est affiché : c'est la mesure de confiance de l'extraction.
 *
 * Sortie LOCALE/gitignorée (données fabricant, ouvrage sous copyright : seuls les
 * coefficients dérivés sont publiés). Destiné au CROSS-CHECK (scripts/lyman_crosscheck.js),
 * PAS à alimenter les charges affichées (start_charges) : voir ROADMAP.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const pdf = process.argv[2];
if (!pdf) { console.error('usage: node scripts/parse_lyman.js <file.pdf>'); process.exit(1); }

const d = (f) => path.join(__dirname, '..', 'data', f);
const CAL = JSON.parse(fs.readFileSync(d('calibers.json'))).calibers;
const PWD = JSON.parse(fs.readFileSync(d('powders.json'))).powders;
const FPS2MS = 0.3048;

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// Lyman écrit les cartouches en toutes lettres (« 300 Winchester Magnum ») là où nos clés
// suivent le Guide Reload Swiss (« 300 Win. Mag. »). Canonicalisation DÉTERMINISTE des mots
// de marque, appliquée des deux côtés — pas d'appariement flou (qui confondrait des voisins
// comme 7 Rem. Mag. et 7mm Rem. Short Action Ultra Mag).
const BRAND = [
  [/\bremington\b/g, 'rem'], [/\bwinchester\b/g, 'win'], [/\bmagnum\b/g, 'mag'],
  [/\bspringfield\b/g, 'spring'], [/\bweatherby\b/g, 'wby'], [/\bautomatic\b/g, 'auto'],
  [/\bmauser\b/g, ''], [/\bswedish\b/g, ''], [/\brussian\b/g, ''], [/\bmm\b/g, ''],
];
const canonCal = (s) => {
  let t = String(s).toLowerCase().replace(/[.,]/g, ' ');
  for (const [re, to] of BRAND) t = t.replace(re, to);
  return t.replace(/[^a-z0-9]/g, '');
};

const calIdx = {};
const canonCollide = new Map();
for (const k of Object.keys(CAL)) {
  for (const a of [k, ...(CAL[k].aliases || [])]) {
    calIdx[norm(a)] = k;
    const c = canonCal(a);
    if (canonCollide.has(c) && canonCollide.get(c) !== k) canonCollide.set(c, null);  // ambigu
    else if (!canonCollide.has(c)) canonCollide.set(c, k);
  }
}
// une clé canonique qui désigne DEUX cartouches est écartée : on préfère perdre des lignes
// plutôt que d'attribuer une charge à la mauvaise cartouche.
const ambiguous = [...canonCollide.entries()].filter(([, v]) => v === null).map(([c]) => c);
for (const c of ambiguous) canonCollide.delete(c);

const matchCal = (s) => calIdx[norm(s)] || canonCollide.get(canonCal(s)) || null;

// Index des poudres. powders.json a deux particularités qui font échouer un simple
// norm() : certaines clés REGROUPENT deux produits (« Hodgdon H4831, H4831C ») et
// d'autres portent un préfixe dupliqué (« IMR IMR 700X »). On indexe donc aussi chaque
// produit listé, avec et sans son fabricant — mais uniquement si l'alias reste NON
// AMBIGU (deux poudres différentes ne doivent jamais partager une clé).
const MFG = /^(hodgdon|imr|alliant|accurate|vihtavuori|winchester|norma|ramshot|lovex|shooters world|western|ba)\s+/i;
const pwdIdx = {};
const addPwd = (alias, k) => {
  const n = norm(alias);
  if (!n) return;
  if (n in pwdIdx && pwdIdx[n] !== k) { pwdIdx[n] = null; return; }   // ambigu → neutralisé
  if (!(n in pwdIdx)) pwdIdx[n] = k;
};
for (const k of Object.keys(PWD)) { pwdIdx[norm(k)] = k; }            // la clé exacte prime
for (const k of Object.keys(PWD)) {
  const cands = [k, PWD[k].name || ''];
  for (const c of cands) {
    for (const part of String(c).split(',')) {
      const p = part.trim();
      if (!p) continue;
      addPwd(p, k);
      const stripped = p.replace(MFG, '').trim();
      if (stripped && stripped !== p) addPwd(stripped, k);
    }
  }
}

// « lOOgr. » → 100 : l/I→1 et O/o→0 sont les deux seules confusions observées.
const fixDigits = (s) => s.replace(/[lI]/g, '1').replace(/[Oo]/g, '0');

// Abréviations maison de Lyman (RX19 = Alliant Reloder 19, XMP-5744 = Accurate 5744…) :
// règles typographiques déterministes, jamais un appariement approximatif de nom.
const fixPowder = (s) => s
  .replace(/[|]/g, 'I')
  .replace(/^[*†\s.]+/, '')                       // marqueurs de note de bas de page (**XMP-5744)
  .replace(/^(\d{3})[\s-]*X\b/i, 'IMR $1X')       // 700X / 800X = IMR 700-X / 800-X
  .replace(/^RX[\s-]*(\d+)/i, 'Reloder $1')       // RX19 → (Alliant) Reloder 19
  .replace(/^X(?:MR|MP)[\s-]*(\d+)/i, 'Accurate $1')
  .replace(/^AA\s*#\s*(\d+)/i, 'Accurate No. $1') // AA#9 → Accurate No.9
  .replace(/^AA[\s-]*(\d)/i, 'Accurate $1')       // AA-2230 → Accurate 2230
  .replace(/^MR\s*(\d)/i, 'IMR$1')                // « MR4895 » : le I initial saute à l'OCR
  .replace(/^H[\s-]+(\d)/i, 'H$1')                // H-4831 → H4831
  .replace(/^IMR[\s-]+(\d)/i, 'IMR$1')
  .replace(/\s+/g, ' ')
  .trim();

// Le nom d'une poudre peut lui aussi être océrisé (« Nl 10 » = N110). On ne corrige les
// chiffres QUE sur les noms de forme « préfixe court + chiffres » (N110, H4831), jamais sur
// un nom alphabétique (Varget, Lovex…) où l→1 détruirait le mot.
const digitish = (s) => /^[A-Za-z]{0,3}[\dlIOo\s.\-#]+$/.test(s);
const powderKey = (raw) => {
  const cands = [fixPowder(raw)];
  if (digitish(raw)) cands.push(fixPowder(fixDigits(raw)));
  for (const c of cands) { const k = pwdIdx[norm(c)]; if (k) return k; }
  return null;
};

const isChg = (t) => /^\d{1,3}\.\d$/.test(t);
const isVel = (t) => /^\d{3,4}$/.test(t);

const txt = execFileSync('pdftotext', ['-layout', pdf, '-'], { maxBuffer: 1 << 28 }).toString();
const pages = txt.split('\f');

const rows = [];
const rej = { page_sans_cartouche: 0, balle_illisible: 0, balle_invraisemblable: 0, poudre_inconnue: 0, invariant: 0, incomplet: 0 };
const unknownPowders = new Map();
let pagesData = 0;

const barrelOf = {};   // cartouche -> canon d'essai Lyman (mm)

for (const page of pages) {
  const lines = page.split('\n');

  // 1. cartouche = premier libellé de la page qui résout dans notre base (sinon on saute)
  // L'en-tête de section porte souvent des désignations en plus (« 308 Winchester
  // (7.62 x 51mm) (7.62 NATO) ») : on essaie la ligne entière, puis son premier bloc
  // (avant deux espaces ou une parenthèse). Sans cela toute la section est perdue —
  // et avec elle le bloc « Barrel Length », qui n'est imprimé que sur sa première page.
  let ck = null;
  for (const l of lines.slice(0, 4)) {
    const s = l.trim();
    if (s.length < 3) continue;
    for (const cand of [s, s.split(/\s{2,}|\(/)[0].trim()]) {
      if (!cand || cand.length < 3 || cand.length > 40) continue;
      const hit = matchCal(cand);
      if (hit) { ck = hit; break; }
    }
    if (ck) break;
  }

  // Canon d'essai (bloc « Test Specifications », présent sur la 1re page de la section
  // seulement → mémorisé pour les pages suivantes de la même cartouche). Il rend le
  // cross-check honnête : la vitesse Lyman peut être ramenée au canon de référence.
  if (ck) {
    const mb = page.match(/Barrel\s+Length\s+([\d.]{2,4})\s*"/i);
    if (mb) {
      const inches = parseFloat(mb[1]);
      if (inches >= 4 && inches <= 32) barrelOf[ck] = Math.round(inches * 25.4);
    }
  }

  // 2. Une page porte SOUVENT PLUSIEURS tableaux empilés (un par masse de balle). Chaque
  // « Powder … Grains » ouvre un bloc ; les masses d'un bloc se lisent entre l'en-tête
  // précédent et le sien. Appliquer les masses du premier bloc à toute la page corrompait
  // ~28 % des lignes (balle plus lourde donnée pour plus rapide — impossible).
  const hdrs = [];
  lines.forEach((l, i) => { if (/Powder/i.test(l) && /Grains/i.test(l)) hdrs.push(i); });
  if (!hdrs.length) continue;
  if (!ck) { rej.page_sans_cartouche++; continue; }
  pagesData++;

  for (let bi = 0; bi < hdrs.length; bi++) {
  const hdr = hdrs[bi];
  const blockStart = bi === 0 ? 0 : hdrs[bi - 1] + 1;      // zone où chercher les masses
  const blockEnd = bi + 1 < hdrs.length ? hdrs[bi + 1] : lines.length;

  const hdrLine = lines[hdr];
  const second = hdrLine.toLowerCase().indexOf('powder', hdrLine.toLowerCase().indexOf('powder') + 1);
  const cut = second > 0 ? second : Infinity;   // page à une seule colonne si pas de 2e « Powder »

  // 3. masses de balle. PIÈGE : le bloc « Test Components » liste TOUTES les balles de la
  // cartouche (110 gr, 125 gr, 150 gr…) ; y puiser donne une masse fausse — c'était la cause
  // d'un biais systématique de 11 %. La bonne masse est l'en-tête de colonne du tableau,
  // reconnaissable à la ligne « <x.xxx>" OAL » qui la suit 1 à 3 lignes plus bas et à la même
  // abscisse. On ne lit donc la masse qu'à l'aplomb d'une ligne OAL.
  // Discriminante : dans l'EN-TÊTE DE TABLEAU la masse PRÉCÈDE le type de balle
  // (« 110 gr. Jacketed HP ») ; dans la LISTE DES COMPOSANTS elle SUIT une référence et une
  // virgule (« Sierra HP #2110, 110 gr. »). Exiger le type de balle derrière la masse suffit
  // donc à ne lire que le bon libellé.
  const TYPE = 'Jacketed|Cast|Lead|Plated|Full|FMJ|HP|SP|SPT|RN|SWC|BT|Bullet';
  const weights = [null, null];
  for (const l of lines.slice(blockStart, hdr)) {
    const re = new RegExp(`([lIOo0-9]{2,3})\\s*gr\\.?\\s+(?:${TYPE})`, 'gi');
    let m;
    while ((m = re.exec(l)) !== null) {
      if (/[,#]\s*$/.test(l.slice(0, m.index))) continue;   // « …#2110, 110 gr. » = composants
      const w = parseInt(fixDigits(m[1]), 10);
      if (!(w >= 15 && w <= 700)) continue;
      const col = m.index < cut ? 0 : 1;
      if (weights[col] === null) weights[col] = w;
    }
  }

  // 4. lignes de données du bloc courant, colonne par colonne
  for (const l of lines.slice(hdr + 1, blockEnd)) {
    const halves = cut === Infinity ? [l] : [l.slice(0, cut), l.slice(cut)];
    halves.forEach((half, col) => {
      const toks = half.trim().split(/\s+/).filter(Boolean);
      if (toks.length < 5) return;

      // poudre = tokens de tête jusqu'au premier nombre décimal (= charge de départ)
      const iChg = toks.findIndex(isChg);
      if (iChg < 1) return;
      const rawPowder = toks.slice(0, iChg).join(' ');
      if (!/[A-Za-z]/.test(rawPowder)) return;

      // départ : charge puis vitesse ; max : charge suivante puis vitesse
      const start_gr = +toks[iChg];
      const iSv = toks.findIndex((t, i) => i > iChg && isVel(t));
      if (iSv < 0) { rej.incomplet++; return; }
      const iMg = toks.findIndex((t, i) => i > iSv && isChg(t));
      if (iMg < 0) { rej.incomplet++; return; }
      const iMv = toks.findIndex((t, i) => i > iMg && isVel(t));
      if (iMv < 0) { rej.incomplet++; return; }
      const start_v = +toks[iSv], max_gr = +toks[iMg], max_v = +toks[iMv];

      const bullet_gr = weights[col];
      if (!bullet_gr) { rej.balle_illisible++; return; }

      // Plausibilité PHYSIQUE de la masse de balle : l'OCR tronque parfois l'en-tête de
      // colonne (« 150 gr » lu « 50 gr »), et une balle deux fois trop légère fait exploser
      // la vitesse prédite sans violer aucune borne. La densité sectionnelle
      // SD = m(lb)/d(in)² tient dans une bande étroite pour toute balle réelle (~0,10-0,42) :
      // 50 gr en .311 donne 0,074 — rejeté. C'est ce contrôle qui a débusqué le cas 303 British.
      const dIn = CAL[ck].bore_mm / 25.4;
      const sd = (bullet_gr / 7000) / (dIn * dIn);
      if (!(sd >= 0.10 && sd <= 0.42)) { rej.balle_invraisemblable++; return; }

      const pk = powderKey(rawPowder);
      if (!pk) {
        rej.poudre_inconnue++;
        unknownPowders.set(rawPowder, (unknownPowders.get(rawPowder) || 0) + 1);
        return;
      }

      // invariants physiques : la charge max dépasse la charge de départ, et la vitesse
      // croît avec la charge. Un chiffre mal océrisé les viole le plus souvent.
      if (!(max_gr > start_gr && max_v > start_v)) { rej.invariant++; return; }
      if (!(start_gr >= 1 && max_gr <= 150 && start_v >= 500 && max_v <= 4500)) { rej.invariant++; return; }

      rows.push({
        cartridge: ck, bullet_gr, powder: pk,
        start_gr, start_ms: Math.round(start_v * FPS2MS),
        max_gr, max_ms: Math.round(max_v * FPS2MS),
        barrel_mm: barrelOf[ck] || null,
      });
    });
  }
  }   // fin du bloc (tableau) courant
}

const out = {
  _src: 'Lyman Reloading Handbook 48th ed. (2002), OCR — parsed. Ouvrage sous copyright : '
      + 'brut NON redistribué (local/gitignored), seuls les coefficients dérivés sont publiés. '
      + 'Vitesse seule (start+max), au canon de référence de la cartouche. '
      + 'USAGE : cross-check uniquement — les charges issues de l\'OCR n\'alimentent PAS start_charges.',
  _date: new Date().toISOString().slice(0, 10),
  rows,
};
fs.writeFileSync(d('lyman.local.json'), JSON.stringify(out, null, 1));

const combos = new Set(rows.map((r) => r.cartridge + '|' + r.powder));
console.log(`Lyman 48e : ${pagesData} pages de données exploitées`);
console.log(`  lignes retenues : ${rows.length}  (${combos.size} couples cartouche|poudre, ${new Set(rows.map((r) => r.cartridge)).size} cartouches)`);
console.log(`  rejets : poudre inconnue ${rej.poudre_inconnue} | balle illisible ${rej.balle_illisible} | balle invraisemblable (SD) ${rej.balle_invraisemblable} | invariant violé ${rej.invariant} | ligne incomplète ${rej.incomplet} | page sans cartouche ${rej.page_sans_cartouche}`);
const top = [...unknownPowders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
if (top.length) console.log('  poudres non reconnues (top) :', top.map(([k, n]) => `${k}×${n}`).join(', '));
console.log('-> data/lyman.local.json');
