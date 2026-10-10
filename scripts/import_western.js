/**
 * import_western.js — parse the Western Powders Handloading Guide (Accurate/Ramshot)
 * into a LOCAL joint (charge, velocity, pressure) dataset for validation/calibration.
 *
 * Usage : node scripts/import_western.js <guide.pdf>
 * Output: data/western.local.json  (gitignored — raw manufacturer data, EULA)
 *
 * The PDF is 2-column with per-character letter spacing (inconsistent: digits are
 * sometimes glued by single spaces, sometimes separated by wide gaps). We de-interleave
 * by cropping each column (pdftotext -layout -x/-W), then DESPACE each line entirely and
 * capture the six trailing numbers with an anchored regex:
 *   start_charge, start_vel, max_charge, max_vel, Pmax(psi), COAL
 */
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const pdf = process.argv[2];
if (!pdf) { console.error('usage: node scripts/import_western.js <guide.pdf>'); process.exit(1); }

const col = (x, w) => execSync(`pdftotext -layout -x ${x} -y 0 -W ${w} -H 800 "${pdf}" - 2>/dev/null`, { maxBuffer: 1 << 26 }).toString().split('\f');
// Reading order, PAGE BY PAGE: left column, then right column. Concatenating every left
// column before every right column made a right column inherit the cartridge of the
// previous page's right column: on p. 30, .357 Magnum rows came out as « 38 SPECIAL +P »
// (33 000-35 000 psi) and on p. 31 .357 Maximum rows as « 357 MAGNUM ».
const L = col(0, 292), R = col(292, 293);
const lines = L.flatMap((page, i) => page.split('\n').concat((R[i] || '').split('\n')));

const ds = (s) => s.replace(/\s+/g, '');
const num = (s) => parseFloat(String(s).replace(/,/g, ''));
// six trailing numbers anchored at end of the despaced line, then an optional « C » =
// compressed charge (without it, every compressed max load was silently dropped)
const SIX = /(\d{1,3}\.\d)(\d{1,3}(?:,\d{3})?)(\d{1,3}\.\d)(\d{1,3}(?:,\d{3})?)(\d{1,3},\d{3})(\d\.\d{3})(C?)$/;

// A sub-heading may sit between the cartridge name and the "Barrel … Diameter" line
// (« 223 REMINGTON » / « 55,000 PSI -- STANDARD SAAMI … », « 7MM REMINGTON SHORT ACTION
// ULTRA » / « MAGNUM (SAUM) »). Taken alone it hid the cartridge: 207 rows of .223 / 5.56
// came out under the previous title, « 222 REMINGTON ». A data row is letter-spaced
// (« 6 0 SIE R R A »), a title is not (« 20 PPC (59,000 PSI) » is a title on its own).
const SUBHEAD = /PSI|SPECIFICATION|These loads|For chambers|^MAGNUM\b|TRAPDOOR/i;
const isData = (s) => /^\d( \d)+\b/.test(s.trim()) || /^(ACCURATE|RAMSHOT)/.test(ds(s));
const title = (s) => s.trim().replace(/\s{2,}.*$/, '');

// Deux découpages ambigus de la ligne despacée, que la charge de départ rend visibles
// (2026-10-10, 54 lignes) :
//  - la référence de la balle finit par un chiffre (moule Lyman « #311359 », « MILM855 ») qui
//    se colle à la charge de départ : « 910.0 » pour 10.0 ;
//  - une vitesse de départ imprimée sans séparateur de milliers (« 2596 ») cède son dernier
//    chiffre à la charge maximale : « 259 » et « 623.5 » pour 2596 et 23.5.
// La charge de départ vaut 90 % du maximum dans ce guide (médiane) : une charge max plus de
// deux fois supérieure, ou une charge de départ au-dessus du max, trahit le mauvais découpage.
function reparer(depart, vDepart, max) {
  if (num(max) > 2 * num(depart) && /^\d{3}$/.test(vDepart) && max.length > 3) {
    vDepart += max[0]; max = max.slice(1);
  }
  let colle = '';
  while (num(depart) > num(max) && depart.length > 3) { colle += depart[0]; depart = depart.slice(1); }
  return { depart, vDepart, max, colle };
}

let cart = null, bore = null, barrel = null, powder = null, prev = '', prev2 = '';
const rows = [];
for (const line of lines) {
  const d = ds(line);
  if (!d) continue;
  if (/iameter/i.test(d)) {                                  // "Barrel: 5” … Bullet Diameter: 0.224”"
    const m = d.match(/iameter:?(\d\.\d{3})/i); if (m) bore = +(parseFloat(m[1]) * 25.4).toFixed(2);
    const b = d.match(/Barrel:?(\d{1,2}(?:\.\d{1,3})?)/i); if (b) barrel = +(parseFloat(b[1]) * 25.4).toFixed(1);   // « 7.75” » : jusqu'à trois décimales
    if (prev && !isData(prev)) cart = SUBHEAD.test(prev) && prev2 && !isData(prev2) ? `${title(prev2)} ${title(prev)}` : title(prev);
    prev2 = prev; prev = line; continue;
  }
  if (/^(ACCURATE|RAMSHOT)/.test(d) && !SIX.test(d)) { powder = line.trim().replace(/\s{2,}/g, ' '); prev2 = prev; prev = line; continue; }
  const m = d.match(SIX), bm = d.match(/^(\d{1,3})/);
  if (m && bm && cart) {
    const bullet = +bm[1];
    const f = reparer(m[1], m[2], m[3]);
    const desc = (d.slice(bm[1].length, d.length - m[0].length) + f.colle).replace(/[*]/g, '');   // maker+type (despacé)
    if (bullet > 10 && bullet < 800) rows.push({
      cartridge: cart, bore_mm: bore, barrel_mm: barrel, powder,
      bullet_gr: bullet, bullet_desc: desc,
      // La charge de DÉPART (colonne « START LOAD ») était capturée puis jetée : la fenêtre du
      // ladder prenait alors la charge maximale pour charge de départ (2026-10-10).
      start_gr: num(f.depart), start_v0_fps: num(f.vDepart),
      charge_gr: num(f.max), v0_fps: num(m[4]), Pmax_psi: num(m[5]), coal_in: num(m[6]), compressed: m[7] === 'C',
    });
  }
  prev2 = prev; prev = line;
}

const out = path.join(__dirname, '..', 'data', 'western.local.json');
fs.writeFileSync(out, JSON.stringify({ _doc: 'Western Powders Handloading Guide 8.0 (Accurate/Ramshot) — donnees brutes, LOCAL/gitignore, non redistribue (EULA). Charge de départ + v0 de départ (fps), charge max + v0(fps) + Pmax(psi) + COAL(in).', rows }, null, 1));
const carts = [...new Set(rows.map((r) => r.cartridge))], pwd = [...new Set(rows.map((r) => r.powder))];
console.log(`max-load rows: ${rows.length} | cartridges ${carts.length} | powders ${pwd.length}`);
console.log('sample:', rows.slice(0, 3).map((r) => `${r.cartridge}/${r.powder} ${r.bullet_gr}gr ${r.charge_gr}gr ${r.v0_fps}fps ${r.Pmax_psi}psi`).join(' | '));
