/**
 * build_test_barrels.js — derive a per-cartridge reference barrel length
 * (`test_barrel_mm`) from the local manufacturer datasets.
 *
 * Why: the live tool now (a) evaluates PEAK PRESSURE at a reference test-barrel travel and
 * (b) scales muzzle VELOCITY from that reference to the user's barrel (Powley/Litz). The
 * calibration (η_b, η_p) was fit on each load's *actual* test barrel, which varies widely:
 * Reload Swiss rifle = 600 mm, Western/SAAMI = 609.6 mm, Vihtavuori = 610–660 mm, magnums
 * 650 mm, handguns 120–190 mm. A uniform type default (600/122) therefore mislabels the
 * barrel a predicted velocity belongs to and biases the scaling by up to ~8 % (handguns).
 * Setting `test_barrel_mm` per cartridge = the modal calibration barrel removes that bias —
 * WITHOUT re-fitting any coefficient (they already used the real barrels).
 *
 * Usage : node scripts/build_test_barrels.js [--write]
 * Inputs (local, gitignored): rs_dataset / western / vihtavuori .local.json
 * Output: prints the proposed per-cartridge reference barrel; with --write, patches
 *         data/calibers.json (only when the modal barrel differs from the type default).
 */
const fs = require('fs');
const path = require('path');
const d = (f) => path.join(__dirname, '..', 'data', f);
const CALDOC = JSON.parse(fs.readFileSync(d('calibers.json')));
const CAL = CALDOC.calibers;

// même normalisation/correspondance de cartouche que build_anchors.js / fit_pressure_multibrand.js
const norm = (s) => String(s).toLowerCase().replace(/\(.*?\)/g, '').replace(/winchester/g, 'win').replace(/remington/g, 'rem').replace(/magnum/g, 'mag').replace(/springfield/g, 'spring').replace(/[^a-z0-9]/g, '');
const calIdx = {};
for (const k of Object.keys(CAL)) { calIdx[norm(k)] = k; for (const a of (CAL[k].aliases || [])) calIdx[norm(a)] = k; }
const stripVariant = (s) => String(s).replace(/\s*\+p\+?\b/ig, '').replace(/\bfor ar-?15.*/i, '');
const matchCal = (n) => calIdx[norm(n)] || calIdx[norm(stripVariant(n))] || null;
const isJunk = (s) => /\bpsi\b|specification|standard saami/i.test(String(s));

const load = (f) => { const j = JSON.parse(fs.readFileSync(d(f))); return Array.isArray(j) ? j : (j.rows || []); };
const counts = {};   // calKey -> { barrel_mm(arrondi) : nombre de charges }
function tally(rows) {
  for (const r of rows) {
    if (!r || isJunk(r.cartridge)) continue;
    const ck = matchCal(r.cartridge); if (!ck) continue;
    const b = Math.round(+r.barrel_mm); if (!(b > 0)) continue;
    (counts[ck] = counts[ck] || {})[b] = (counts[ck][b] || 0) + 1;
  }
}
for (const f of ['rs_dataset.local.json', 'western.local.json', 'vihtavuori.local.json']) {
  try { tally(load(f)); } catch (e) { console.warn('skip', f, '—', e.message); }
}

const def = (c) => (c.type === 'handgun' ? 122 : 600);
const MIN_N = 4;        // support minimal pour fixer une référence
const TOL = 3;          // mm : en-deçà on garde le défaut de type (pas d'override)
const rows = [];
for (const ck of Object.keys(CAL)) {
  const c = counts[ck]; if (!c) continue;
  const dist = Object.entries(c).map(([b, n]) => [+b, n]).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const n = dist.reduce((s, [, k]) => s + k, 0); if (n < MIN_N) continue;
  rows.push({ ck, modal: dist[0][0], share: dist[0][1] / n, n, dflt: def(CAL[ck]), dist });
}
rows.sort((a, b) => a.ck.localeCompare(b.ck, 'fr'));

console.log('cartouche                      | réf | part |  n  | défaut');
console.log('-------------------------------+-----+------+-----+-------');
for (const r of rows) {
  const ov = Math.abs(r.modal - r.dflt) > TOL;
  console.log(`${r.ck.slice(0, 30).padEnd(30)} |${String(r.modal).padStart(4)} | ${(r.share * 100).toFixed(0).padStart(3)}% | ${String(r.n).padStart(3)} | ${r.dflt}${ov ? '   ← override' : ''}`);
}

const overrides = rows.filter((r) => Math.abs(r.modal - r.dflt) > TOL);
if (process.argv.includes('--write')) {
  for (const r of overrides) CAL[r.ck].test_barrel_mm = r.modal;
  fs.writeFileSync(d('calibers.json'), JSON.stringify(CALDOC, null, 2) + '\n');
  console.log(`\n[write] ${overrides.length} cartouches dotées de test_barrel_mm ; data/calibers.json mis à jour.`);
} else {
  console.log(`\n(dry-run) ${overrides.length} overrides seraient écrits (sur ${rows.length} cartouches couvertes par les données). Relancer avec --write.`);
}
