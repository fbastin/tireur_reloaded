/**
 * parse_hodgdon.js — Hodgdon Annual Manual (AM24) → jeu (charge, vitesse, pression) LOCAL.
 *
 * Usage : node scripts/parse_hodgdon.js <AM24.pdf>
 * Sortie : data/hodgdon.local.json  (gitignoré — tables brutes fabricant, non redistribuées)
 *
 * Comble la lacune nommée par docs/balistique_interieure_roadmap.md : Hodgdon/IMR, 9 poudres
 * ancrées sur 44, `hodgdonreloading.com` derrière Cloudflare. Le manuel fourni par
 * l'utilisateur est la voie actée — aucun crawler.
 *
 * DEUX PIÈGES D'EXTRACTION, mesurés le 2026-08-11 :
 *
 * 1. COLONNES. La page est sur deux colonnes que `pdftotext -layout` recolle sur une même
 *    ligne, mêlant deux cartouches : le 6x47 Lapua s'y voyait attribuer les pressions de sa
 *    voisine. On lit donc en `-raw`, qui suit l'ordre de lecture et sépare les colonnes.
 *
 * 2. UNITÉS. Le manuel mélange PSI et CUP, parfois d'une cartouche à l'autre. Le CUP n'est
 *    PAS convertible en psi : les lignes en CUP gardent `Pmax_psi: null` — elles restent
 *    exploitables pour la VITESSE, jamais pour la pression.
 *
 * Le nom de poudre du manuel est nu (« H4350 ») quand la base le préfixe de sa marque
 * (« Hodgdon H4350 »). L'appariement essaie les préfixes de marque connus et n'accepte
 * qu'une entrée POSSÉDANT une densité apparente (pcd) — sans elle le taux de remplissage,
 * qui est une variable des deux régressions, n'est pas calculable.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pdf = process.argv[2];
if (!pdf) { console.error('usage: node scripts/parse_hodgdon.js <AM24.pdf>'); process.exit(1); }
const d = (f) => path.join(__dirname, '..', 'data', f);

const PWD = JSON.parse(fs.readFileSync(d('powders.json'))).powders;
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const idx = {};
for (const k of Object.keys(PWD)) if (PWD[k].pcd) idx[norm(k)] = k;

// Alias curés à la main (data/powder_aliases.json) : fichier SÉPARÉ, parce que powders.json
// est écrit par les scripts d'import et qu'un alias inscrit dedans disparaîtrait au prochain.
const ALIAS = JSON.parse(fs.readFileSync(d('powder_aliases.json'))).alias;

// Le manuel couvre trois marques ; l'ordre n'importe pas, les clés normalisées sont disjointes.
const MARQUES = ['', 'Hodgdon ', 'IMR ', 'Winchester ', 'Accurate ', 'Alliant ', 'Ramshot '];
function matchPoudre(label) {
  // « <poudre> Subsonic » = la MÊME poudre, dans la section de données subsoniques du manuel.
  const l = label.replace(/\s+subsonic$/i, '').trim();
  const a = ALIAS[l] || ALIAS[label];
  if (a && idx[norm(a)]) return idx[norm(a)];
  for (const m of MARQUES) { const k = idx[norm(m + l)]; if (k) return k; }
  let m = l.match(/^A-?\s?(\d{4})$/i);                  // « A-4350 » -> « Accurate 4350 »
  if (m && idx[norm('Accurate ' + m[1])]) return idx[norm('Accurate ' + m[1])];
  m = l.match(/^W(\d{3})$/i);                           // « W760 »  -> « Winchester 760 »
  if (m && idx[norm('Winchester ' + m[1])]) return idx[norm('Winchester ' + m[1])];
  return null;
}

// Balle en plomb : coulée (CAST, LC, CPB, MEI, BTB, MBW, MTB, MCB), à gas-check (GC), ou de forme « L… »
// (LSWC, LRN, LFP, LFN, LWLN, LTC, L PT…), wadcutter HBWC. Exclus à dessein : Barnes LRX, Lehigh, Berger LRHT,
// Lapua, Nosler LF (sans plomb), Berry's (cuivrées). Marquée `cast`, écartée des ancres (2026-10-13).
const PLOMB = /CAST|LEAD|\bLC\b|\bCPB?\b|\bMEI\b|\bBTB\b|\bMBW\b|\bMTB\b|\bMCB\b|GCK?\b|HBWC|\bL ?(RN|SWC|FP|FN|WLN|WFN|GC|LFN|CN|TC|PT|WC)/i;
const txt = execSync(`pdftotext -q -raw "${pdf}" - 2>/dev/null`, { maxBuffer: 1 << 28 }).toString();
const IN = 25.4;
const num = (s) => parseFloat(String(s).replace(/,/g, ''));

// Une ligne de charge : poudre, puis départ (grains, vitesse, pression+unité) puis maximum.
// Le « C » suffixe une charge comprimée, gardée dans `compressed`. « C* » : « Max loads that
// show an asterisk following the "C" for compressed load will not fit with standard IMR 7828.
// Reduce by 4% » (bas des pages de données) — la charge vaut pour l'IMR 7828 SSC, pas pour la
// 7828 : ces lignes-là sont écartées. Le départ est FACULTATIF : les sections +P (38 Special
// +P…) ne publient que le maximum, et exiger un départ les faisait disparaître.
const LOAD = /^(.+?)\s+(?:([\d.]+)C?\*?\s+(\d{3,5})\s+([\d,]+)\s*(PSI|CUP)\s+)?([\d.]+)(C)?(\*)?\s+(\d{3,5})\s+([\d,]+)\s*(PSI|CUP)\s*$/;

let cartridge = null, barrel = null, bullet_gr = null, bullet_desc = null, bore = null, coal = null;
const rows = [];
const inconnues = {};
let nCup = 0, nPsi = 0, nComp = 0, nTropPour7828 = 0;

const lignes = txt.split('\n');
for (let i = 0; i < lignes.length; i++) {
  const l = lignes[i].trim();
  if (!l) continue;

  // En-tête de cartouche : le nom seul, suivi d'une ligne « Barrel: … Twist: … »
  const suivante = (lignes[i + 1] || '').trim();
  if (/^Barrel:.*Twist:/i.test(suivante) && !LOAD.test(l)) {
    cartridge = l;
    const b = suivante.match(/Barrel:\s*([\d.]+)\s*[”"]/);
    barrel = b ? +(num(b[1]) * IN).toFixed(1) : null;
    continue;
  }
  let m = l.match(/^Bullet:\s*([\d.]+)\s*GR\.?\s*(.*?)\s*Dia:\s*\.?(\d{3})\s*[”"]?/i);
  if (m) { bullet_gr = num(m[1]); bullet_desc = m[2].trim(); bore = +((num('0.' + m[3])) * IN).toFixed(2); continue; }
  m = l.match(/Col:\s*([\d.]+)\s*[”"]/);
  if (m) { coal = num(m[1]); }

  m = l.match(LOAD);
  if (!m || !cartridge || !bullet_gr) continue;
  const label = m[1].trim();
  const poudre = matchPoudre(label);
  if (!poudre) { inconnues[label] = (inconnues[label] || 0) + 1; continue; }

  if (m[8] && poudre === 'IMR 7828') { nTropPour7828++; continue; }
  const unite = m[11].toUpperCase();
  if (unite === 'CUP') nCup++; else nPsi++;
  rows.push({
    cartridge, bore_mm: bore, barrel_mm: barrel,
    powder: poudre, powder_label: label,
    bullet_gr, bullet_desc, cast: PLOMB.test(bullet_desc || ''),
    // Charge de DÉPART (colonnes « Starting Loads »), lue depuis le 2026-10-16 : l'expression la captait, la ligne ne la
    // rangeait pas, et 660 couples ancrés sur Hodgdon n'avaient pas de fenêtre de charge. null pour les sections qui
    // ne publient que le maximum (+P, subsoniques, certaines poudres).
    start_gr: m[2] ? num(m[2]) : null, start_v0_fps: m[3] ? num(m[3]) : null,
    start_P_psi: m[2] && m[5] && m[5].toUpperCase() === 'PSI' ? num(m[4]) : null,
    charge_gr: num(m[6]), v0_fps: num(m[9]),
    // CUP non convertible : la pression reste nulle, la ligne sert la vitesse seule.
    Pmax_psi: unite === 'PSI' ? num(m[10]) : null,
    Pmax_unit: unite,
    coal_in: coal,
    compressed: !!m[7],
  });
  if (m[7]) nComp++;
}

const out = {
  _doc: "Hodgdon Annual Manual (AM24) — donnees brutes, LOCAL/gitignore, non redistribue. "
      + "Charge de depart (start_gr, start_v0_fps, start_P_psi en PSI seulement ; null si le manuel ne la publie pas) et "
      + "charge max + v0(fps) + Pmax(psi) quand l'unite est le PSI ; Pmax_psi=null pour les "
      + "lignes en CUP, non convertible. compressed = charge max marquee « C ». Lu en pdftotext -raw : "
      + "la page est sur deux colonnes que -layout recolle, ce qui melange deux cartouches.",
  _source: path.basename(pdf),
  rows,
};
fs.writeFileSync(d('hodgdon.local.json'), JSON.stringify(out, null, 1));

const cartouches = new Set(rows.map((r) => r.cartridge));
const poudres = new Set(rows.map((r) => r.powder));
console.log(`-> data/hodgdon.local.json`);
console.log(`   ${rows.length} charges · ${cartouches.size} cartouches · ${poudres.size} poudres · avec charge de départ : ${rows.filter((r) => r.start_gr > 0).length}`);
console.log(`   pression exploitable : ${nPsi} en PSI · ${nCup} en CUP (vitesse seule)`);
console.log(`   charges maximales comprimées (« C ») : ${nComp} · écartées, trop pour l'IMR 7828 standard (« C* ») : ${nTropPour7828}`);
const inc = Object.entries(inconnues).sort((a, b) => b[1] - a[1]);
if (inc.length) {
  const perdues = inc.reduce((s, [, n]) => s + n, 0);
  console.log(`   /!\\ ${inc.length} libelles de poudre sans correspondance (${perdues} charges perdues) :`);
  console.log(`       ${inc.slice(0, 12).map(([p, n]) => `${p} (${n})`).join(', ')}`);
}
