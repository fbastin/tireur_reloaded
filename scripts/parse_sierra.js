/**
 * parse_sierra.js — extract load data from a Sierra Bullets online load-data PDF
 * (e.g. https://sierrabullets.com/content/load-data/rifle/.../<cartridge>.pdf).
 *
 *   node scripts/parse_sierra.js <file.pdf> "<Cartridge Name>" [barrel_in]
 *
 * Format: one bullet weight per page; a matrix whose COLUMNS are target velocities
 * (fps) and whose CELLS are the charge (grains) reaching that velocity for each
 * powder (rows). VELOCITY only — no pressure. Feeds the velocity side (anchors /
 * E_eff) like the Sierra manual and the Vihtavuori guide.
 *
 * Parsed per <page> from `pdftotext -bbox-layout`: within a page the charge cells
 * align exactly in x to the velocity-header columns, so each (powder, velocity)
 * cell yields a (charge, velocity) point. A diagonal "for individual use only"
 * watermark is filtered (stop-words + grid alignment).
 *
 * Output is LOCAL/gitignored (Sierra EULA: "for individual use only" — not
 * redistributed). Only derived coefficients/anchors are published.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const pdf = process.argv[2];
const cartridge = process.argv[3];
const barrelIn = parseFloat(process.argv[4] || '24');
if (!pdf || !cartridge) { console.error('usage: node scripts/parse_sierra.js <file.pdf> "<Cartridge>" [barrel_in]'); process.exit(1); }
const barrel_mm = Math.round(barrelIn * 25.4);

const xml = execFileSync('pdftotext', ['-bbox-layout', pdf, '-']).toString();
const STOP = new Set(['this', 'data', 'is', 'for', 'individual', 'use', 'only', 'do', 'not', 'edit', 'ata', 'powder', 'velocity', 'special', 'load', 'accuracy', 'hunting', 'case', 'norma', 'remarks', 'components', 'energy']);
const isCharge = (t) => /^\d{1,2}\.\d$/.test(t);
// Le filigrane « This data is for individual use only… » est diagonal : ses fragments
// tombent parfois DANS la colonne des poudres. Ceux en minuscules sont deja ecartes,
// mais un fragment CAPITALISE survit — « RE Th 22 » au lieu de « RE 22 » sur la page
// 225 gr du .338 Norma, soit une poudre fantome et 4 charges perdues. On n'ecarte que
// des jetons qui ne peuvent pas etre un nom de poudre : surtout PAS la liste STOP
// complete, qui contient « norma », un vrai fabricant.
const WATERMARK_FRAG = new Set(['th', 'thi', 'ata', 'ividual', 'ndividual', 'edi', 'ribute', 'istribute']);
// ⚠️ Les en-tetes de vitesse ne sont PAS toujours des multiples de 100 : la table
// du 6,5 x 47 Lapua est cadencee 2550/2650/2750..., decalee de 50. L'ancienne
// forme /^[1-4]\d00$/ ne reconnaissait alors qu'une colonne sur sept, la page
// tombait sous le seuil de 3 et etait abandonnee SANS UN MOT : 4 des 6 masses de
// balle de ce PDF etaient perdues, et le script annoncait un succes.
const isVel = (t) => /^[1-4]\d[05]0$/.test(t);
// Sierra abbreviations -> catalogue names (RE 15 -> Reloder 15, A 2495 -> Accurate 2495).
function fixName(n) {
  return n.replace(/\s+End\.$/, '')
    .replace(/^RE\s+(\d)/i, 'Reloder $1')
    .replace(/^A\s+(\d{3,4})\b/, 'Accurate $1')
    // « Viht N130 » -> « N130 » : le catalogue range les Vihtavuori sous leur seul code.
    .replace(/^Viht\.?\s+/i, '')
    // Renommage produit : Accurate 2015 BR est devenu Accurate 2015. Le catalogue porte
    // encore l'ancienne graphie, et aucune entree « Accurate 2015 » ne lui fait
    // concurrence — l'equivalence est une identification, pas une approximation.
    .replace(/^Accurate 2015$/, 'Accurate 2015BR')
    // Le catalogue GROUPE lui-meme H4831 et sa version Short Cut sous une entree
    // unique « H4831, H4831C » : l'equivalence est la sienne, pas la notre.
    .replace(/^H4831\s*sc$/i, 'H4831, H4831C')
    // ⚠️ DEDUCTION, pas un groupement du catalogue comme ci-dessus : celui-ci ne porte
    // qu'une seule entree 7828, nommee « 7828SC », et IMR ne commercialise plus que la
    // version Super Short Cut. Les deux designent donc le meme produit. A revoir si une
    // entree « IMR 7828 » simple apparaissait un jour au catalogue.
    .replace(/^IMR\s*7828\s*s?sc$/i, 'IMR 7828SC');
}

const rows = [];
const pages = xml.split('<page').slice(1);
const skipped = [];      // pages portant une masse de balle mais sans en-tete lisible
const seen = new Set();  // masses effectivement exploitees
let pageNo = 0;
for (const pg of pages) {
  pageNo++;
  const W = [...pg.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)]
    .map((m) => ({ x: +m[1], y: +m[2], t: m[5].trim() }));
  if (!W.length) continue;

  // bullet weight: token "<n>gr" (first on the page); skip pages without one
  const bw = W.find((w) => /^\d{2,3}gr/.test(w.t));
  if (!bw) continue;
  const bullet_gr = parseInt(bw.t, 10);

  // velocity header = the y-row carrying the most velocity tokens
  const velsByY = {};
  for (const w of W) if (isVel(w.t)) (velsByY[Math.round(w.y)] = velsByY[Math.round(w.y)] || []).push(w);
  let hdr = null;
  for (const y of Object.keys(velsByY)) if (!hdr || velsByY[y].length > velsByY[hdr].length) hdr = y;
  if (!hdr || velsByY[hdr].length < 3) {
    // Ne crier que pour une page qui porte VRAIMENT une matrice : la page de garde
    // cite une masse de balle sans table, et une alerte qui crie pour rien finit
    // ignoree — ce qui vaut une alerte absente.
    if (W.filter((w) => isCharge(w.t)).length >= 5) {
      skipped.push({ page: pageNo, bullet_gr, cols: hdr ? velsByY[hdr].length : 0 });
    }
    continue;
  }
  seen.add(bullet_gr);
  const cols = velsByY[hdr].map((w) => ({ x: w.x, v: +w.t })).sort((a, b) => a.x - b.x);
  const x0 = cols[0].x;                                  // first velocity column

  // group words into rows by y; a data row has charge cells aligned to columns
  const byY = {};
  for (const w of W) (byY[Math.round(w.y)] = byY[Math.round(w.y)] || []).push(w);
  for (const y of Object.keys(byY)) {
    if (Math.abs(+y - +hdr) < 3) continue;               // skip the header row itself
    const line = byY[y];
    // powder name = left-column tokens, minus the lowercase "for individual use only"
    // watermark fragments (real powder tokens are capitalized or alphanumeric).
    const name = line.filter((w) => w.x < x0 - 4 && w.x > 18).sort((a, b) => a.x - b.x)
      .map((w) => w.t).filter((t) => !/^[a-z]+\.?$/.test(t) && !WATERMARK_FRAG.has(t.toLowerCase()))
      .join(' ').trim();
    if (!name || /^[\d.]/.test(name) || STOP.has(name.toLowerCase().split(' ')[0])) continue;
    const powder = fixName(name);
    const cells = [];
    for (const c of cols) {
      const hit = line.find((w) => isCharge(w.t) && Math.abs(w.x - c.x) < 6);
      if (hit) cells.push({ charge: +hit.t, v: c.v });
    }
    if (cells.length < 2) continue;                      // not a real powder row
    // `powder` porte le nom du catalogue (c'est lui qui joint) ; `powder_src` garde
    // le libelle imprime par Sierra, pour qu'une renomination reste verifiable.
    for (const cell of cells) rows.push({ cartridge, bullet_gr, powder, powder_src: name,
      charge_gr: cell.charge, v0_fps: cell.v, barrel_mm });
  }
}

const out = { _src: `Sierra Bullets load data — ${cartridge} (parsed; individual use only, not redistributed)`, rows };
const slug = cartridge.toLowerCase().replace(/[^a-z0-9]+/g, '');
const outPath = path.join(__dirname, '..', 'data', `sierra_${slug}.local.json`);
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));

const pw = [...new Set(rows.map((r) => r.powder))].sort();
// Bilan bruyant : le silence sur une page perdue est ce qui a coute 4 masses de
// balle sur 6 le 2026-08-18. Une etape qui se saute doit crier, pas informer.
if (skipped.length) {
  console.error(`\n⚠️  ${skipped.length} page(s) PERDUE(S) — elles portent une masse de balle mais aucun`);
  console.error('   en-tete de vitesse lisible (moins de 3 colonnes reconnues) :');
  for (const s of skipped) console.error(`     page ${s.page} : ${s.bullet_gr} gr, ${s.cols} colonne(s) reconnue(s)`);
  console.error('   Verifier isVel contre le cadencement reel des colonnes de ce PDF.\n');
}
const bl = [...new Set(rows.map((r) => r.bullet_gr))].sort((a, b) => a - b);
console.log(`Sierra ${cartridge}: ${rows.length} points | bullets ${bl.join('/')} gr | ${pw.length} powders`);
console.log('powders:', pw.join(', '));
console.log('-> data/' + path.basename(outPath));
