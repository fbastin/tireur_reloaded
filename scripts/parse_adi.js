/**
 * parse_adi.js — ADI Handloaders' Guide (6e éd., 2013) → jeu (charge, vitesse, pression) LOCAL.
 *
 * Usage : node scripts/parse_adi.js <ADI-guide.pdf>
 * Sortie : data/adi.local.json  (gitignoré — tables brutes fabricant, non redistribuées)
 *
 * ADI (Thales Australia) est un CINQUIÈME laboratoire, dont aucune donnée n'entre ni dans le
 * calage ni dans les ancres : il sert de jeu de VALIDATION externe. Ses poudres portent leurs
 * propres clés dans powders.json (« ADI AR 2208 »), disjointes de celles de Hodgdon — ce test
 * mesure donc le modèle global, PAS le bénéfice des ancres Hodgdon.
 *
 * Deux particularités du guide :
 *   - le mélange PSI/CUP, parfois d'une cartouche à l'autre. Le CUP n'étant pas convertible,
 *     ces lignes gardent `Pmax_psi: null` et ne servent que la vitesse ;
 *   - « Barrel length: » est imprimé sur la ligne PRÉCÉDANT le nom de cartouche.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pdf = process.argv[2];
if (!pdf) { console.error("usage: node scripts/parse_adi.js <ADI-guide.pdf>"); process.exit(1); }
const d = (f) => path.join(__dirname, '..', 'data', f);

const PWD = JSON.parse(fs.readFileSync(d('powders.json'))).powders;
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const idx = {};
for (const k of Object.keys(PWD)) if (PWD[k].pcd) idx[norm(k)] = k;
// Alias curés à la main — fichier séparé, powders.json étant écrit par les scripts d'import.
const ALIAS = JSON.parse(fs.readFileSync(d('powder_aliases.json'))).alias;
const MARQUES = ['', 'ADI ', 'Hodgdon ', 'Thales '];
function matchPoudre(label) {
  const a = ALIAS[label];
  if (a && idx[norm(a)]) return idx[norm(a)];
  for (const m of MARQUES) { const k = idx[norm(m + label)]; if (k) return k; }
  return null;
}

const txt = execSync(`pdftotext -q -layout "${pdf}" - 2>/dev/null`, { maxBuffer: 1 << 28 }).toString();
const IN = 25.4;
const num = (s) => parseFloat(String(s).replace(/,/g, ''));

// ogive (optionnelle sur les lignes de continuation), poudre, Ø, COL, puis départ et maximum.
const LOAD = new RegExp(
  '^\\s*(?:(\\d{1,3})\\s*GR\\.\\s*(.*?))?\\s{2,}' +      // 1 masse  2 description
  '([A-Za-z][A-Za-z0-9 .\\-]{1,18}?)\\s{2,}' +           // 3 poudre
  '\\.(\\d{3})"\\s+([\\d.]+)"\\s+' +                     // 4 Ø  5 COL
  '([\\d.]+)C?\\s+([\\d,]+)\\s*fps\\s+([\\d,]+)\\s*(PSI|CUP)\\s+' +   // 6-9 départ
  '([\\d.]+)C?\\s+([\\d,]+)\\s*fps\\s+([\\d,]+)\\s*(PSI|CUP)\\s*$');  // 10-13 maximum

let cartridge = null, barrel = null, bullet_gr = null, bullet_desc = null;
const rows = [];
const inconnues = {};
let nPsi = 0, nCup = 0;

const lignes = txt.split('\n');
for (let i = 0; i < lignes.length; i++) {
  const l = lignes[i];
  const mb = l.match(/Barrel length:\s*([\d.]+)\s*"/i);
  if (mb) barrel = +(num(mb[1]) * IN).toFixed(1);        // imprimé AVANT le nom de cartouche
  const mc = l.match(/^(\S.{0,45}?)\s{2,}Twist:/);
  if (mc) { cartridge = mc[1].trim(); bullet_gr = null; continue; }

  const m = l.match(LOAD);
  if (!m || !cartridge) continue;
  if (m[1]) { bullet_gr = num(m[1]); bullet_desc = (m[2] || '').trim(); }
  if (!bullet_gr) continue;                              // continuation avant toute ogive

  const label = m[3].trim();
  const poudre = matchPoudre(label);
  if (!poudre) { inconnues[label] = (inconnues[label] || 0) + 1; continue; }

  const unite = m[13].toUpperCase();
  if (unite === 'CUP') nCup++; else nPsi++;
  rows.push({
    cartridge, bore_mm: +((num('0.' + m[4])) * IN).toFixed(2), barrel_mm: barrel,
    powder: poudre, powder_label: label,
    bullet_gr, bullet_desc,
    charge_gr: num(m[10]), v0_fps: num(m[11]),
    Pmax_psi: unite === 'PSI' ? num(m[12]) : null,
    Pmax_unit: unite,
    coal_in: num(m[5]),
  });
}

fs.writeFileSync(d('adi.local.json'), JSON.stringify({
  _doc: "ADI Handloaders' Guide 6e ed. 2013 (Thales Australia) — donnees brutes, LOCAL/gitignore, "
      + "non redistribue. JEU DE VALIDATION : n'entre ni dans le calage ni dans les ancres. "
      + "Pmax_psi=null pour les lignes en CUP, non convertible.",
  _source: path.basename(pdf),
  rows,
}, null, 1));

console.log('-> data/adi.local.json');
console.log(`   ${rows.length} charges · ${new Set(rows.map((r) => r.cartridge)).size} cartouches · ${new Set(rows.map((r) => r.powder)).size} poudres`);
console.log(`   pression exploitable : ${nPsi} en PSI · ${nCup} en CUP (vitesse seule)`);
const inc = Object.entries(inconnues).sort((a, b) => b[1] - a[1]);
if (inc.length) {
  console.log(`   /!\\ ${inc.length} libelles sans correspondance (${inc.reduce((s, [, n]) => s + n, 0)} charges) : `
    + inc.slice(0, 8).map(([p, n]) => `${p} (${n})`).join(', '));
}
