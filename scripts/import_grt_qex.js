/**
 * import_grt_qex.js — import REAL specific explosive heat (Qex) from GRT .propellant
 * files into data/powders.json, for powders that lack it.
 *
 * Usage : node scripts/import_grt_qex.js [--write]
 * Source: legacy/grt_databases/powders/*.propellant (GRT, CC0) — each carries the
 *   measured thermochemistry (Qex kJ/kg, k=γ, covolume, Ba…). This is strictly better
 *   than interpolating Qex by powder family (which is too coarse — see docs/MODEL.md
 *   Appendix B): family means differ ~6 % while within-family scatter is ~7 %, and the
 *   real blocker is γ (1.14–1.27), so λ=Qex(γ−1) cannot be guessed for catalogue powders.
 *
 * SAFE BY DESIGN: imports **Qex only** (not Ba), so the production velocity path is
 * unchanged — index.php takes the η_b path only when *both* Qex and Ba are present;
 * Qex-only powders stay on the E_eff fallback. The sole effect is to extend the
 * Mayer–Hart anchor consistency guard (scripts/build_anchors.js) to these powders.
 * Existing Qex values are left untouched.
 */
const fs = require('fs');
const path = require('path');
const d = (f) => path.join(__dirname, '..', 'data', f);
const dir = path.join(__dirname, '..', 'legacy', 'grt_databases', 'powders');
const WRITE = process.argv.includes('--write');

const norm = (s) => String(s).toLowerCase().replace(/%20/g, ' ').replace(/[^a-z0-9]/g, '');
const grab = (xml, n) => { const m = xml.match(new RegExp(`name="${n}"\\s+value="([^"]*)"`)); return m ? m[1] : null; };

const POW = JSON.parse(fs.readFileSync(d('powders.json')));
const PWD = POW.powders;
const pidx = {};
for (const k of Object.keys(PWD)) { const p = PWD[k]; pidx[norm((p.mfg || '') + (p.name || k))] = k; pidx[norm(p.name || k)] = k; pidx[norm(k)] = k; }

const added = [];
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.propellant'))) {
  const xml = fs.readFileSync(path.join(dir, f), 'utf8');
  const mname = decodeURIComponent(grab(xml, 'mname') || ''), pname = decodeURIComponent(grab(xml, 'pname') || '');
  const Qex = +grab(xml, 'Qex'); if (!(Qex > 0)) continue;
  const pk = pidx[norm(mname + pname)] || pidx[norm(pname)] || null;
  if (!pk || PWD[pk].Qex) continue;                 // skip unmatched or already-known
  // insert Qex right after the opening, keeping the entry's other fields
  PWD[pk] = { Qex, ...PWD[pk] };
  added.push(`${pk} (Qex=${Qex}, ${mname} ${pname})`);
}

console.log(`GRT files scanned. New Qex for ${added.length} powders:`);
added.forEach((s) => console.log('  ' + s));
if (WRITE && added.length) {
  fs.writeFileSync(d('powders.json'), JSON.stringify(POW, null, 2) + '\n');
  console.log('-> data/powders.json written. Re-run scripts/build_anchors.js to extend the MH guard.');
} else if (!WRITE) {
  console.log('(dry-run; pass --write to apply)');
}
