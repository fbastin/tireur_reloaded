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

const col = (x, w) => execSync(`pdftotext -layout -x ${x} -y 0 -W ${w} -H 800 "${pdf}" - 2>/dev/null`, { maxBuffer: 1 << 26 }).toString().split('\n');
const lines = col(0, 292).concat(col(292, 293));     // left column then right column

const ds = (s) => s.replace(/\s+/g, '');
const num = (s) => parseFloat(String(s).replace(/,/g, ''));
// six trailing numbers anchored at end of the despaced line
const SIX = /(\d{1,3}\.\d)(\d{1,3}(?:,\d{3})?)(\d{1,3}\.\d)(\d{1,3}(?:,\d{3})?)(\d{1,3},\d{3})(\d\.\d{3})$/;

let cart = null, bore = null, barrel = null, powder = null, prev = '';
const rows = [];
for (const line of lines) {
  const d = ds(line);
  if (!d) continue;
  if (/iameter/i.test(d)) {                                  // "Barrel: 5” … Bullet Diameter: 0.224”"
    const m = d.match(/iameter:?(\d\.\d{3})/i); if (m) bore = +(parseFloat(m[1]) * 25.4).toFixed(2);
    const b = d.match(/Barrel:?(\d{1,2}(?:\.\d)?)/i); if (b) barrel = +(parseFloat(b[1]) * 25.4).toFixed(1);
    if (prev && !/^(ACCURATE|RAMSHOT)/.test(ds(prev))) cart = prev.trim().replace(/\s{2,}.*$/, '');
    prev = line; continue;
  }
  if (/^(ACCURATE|RAMSHOT)/.test(d) && !SIX.test(d)) { powder = line.trim().replace(/\s{2,}/g, ' '); prev = line; continue; }
  const m = d.match(SIX), bm = d.match(/^(\d{1,3})/);
  if (m && bm && cart) {
    const bullet = +bm[1];
    if (bullet > 10 && bullet < 800) rows.push({
      cartridge: cart, bore_mm: bore, barrel_mm: barrel, powder,
      bullet_gr: bullet, charge_gr: num(m[3]), v0_fps: num(m[4]), Pmax_psi: num(m[5]), coal_in: num(m[6]),
    });
  }
  prev = line;
}

const out = path.join(__dirname, '..', 'data', 'western.local.json');
fs.writeFileSync(out, JSON.stringify({ _doc: 'Western Powders Handloading Guide 8.0 (Accurate/Ramshot) — donnees brutes, LOCAL/gitignore, non redistribue (EULA). Charge max + v0(fps) + Pmax(psi) + COAL(in).', rows }, null, 1));
const carts = [...new Set(rows.map((r) => r.cartridge))], pwd = [...new Set(rows.map((r) => r.powder))];
console.log(`max-load rows: ${rows.length} | cartridges ${carts.length} | powders ${pwd.length}`);
console.log('sample:', rows.slice(0, 3).map((r) => `${r.cartridge}/${r.powder} ${r.bullet_gr}gr ${r.charge_gr}gr ${r.v0_fps}fps ${r.Pmax_psi}psi`).join(' | '));
