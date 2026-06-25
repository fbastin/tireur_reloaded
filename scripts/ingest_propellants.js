/**
 * ingest_propellants.js — bulk-import powder constants from GRT .propellant files.
 *
 * Avoids exporting powders one by one: point this at a folder containing many
 * GRT `.propellant` files (e.g. a copy of the GRT database) and it extracts
 * Qex / Ba / pcd for every powder and merges them into data/powders.json.
 *
 * Usage : node scripts/ingest_propellants.js <folder> [--mfg <name>] [--force]
 *   --mfg <name>  only import powders whose manufacturer contains <name>
 *                 (e.g. --mfg Vihtavuori). Recommended: import one brand at a
 *                 time, since the tool currently labels non-RS powders as VV.
 *   --force       overwrite existing entries whose values differ (default: keep + warn)
 *
 * Keys: "RS 52" -> "RS52" (Reload Swiss), otherwise the product name as-is
 * (e.g. "N120", "20N29"). Match these to the powder column of the load guide.
 */
const fs = require('fs');
const path = require('path');

const folder = process.argv[2];
const force = process.argv.includes('--force');
const mfgI = process.argv.indexOf('--mfg');
const mfgFilter = mfgI > -1 ? (process.argv[mfgI + 1] || '').toLowerCase() : null;
if (!folder) { console.error('usage: node scripts/ingest_propellants.js <folder> [--mfg <name>] [--force]'); process.exit(1); }

const pjPath = path.join(__dirname, '..', 'data', 'powders.json');
const pj = JSON.parse(fs.readFileSync(pjPath));
const get = (xml, name) => { const m = xml.match(new RegExp('name="' + name + '"\\s+value="([^"]*)"')); return m ? m[1] : null; };
const dec = (s) => decodeURIComponent(String(s || '').replace(/\+/g, ' ')).trim();

function keyFor(mname, pname) {
  const p = dec(pname), m = dec(mname);
  if (/reload\s*swiss/i.test(m) || /^RS\s*\d/i.test(p)) return 'RS' + (p.match(/\d+/) || [''])[0];
  // Norma keys are manufacturer-prefixed in powders.json (e.g. "Norma 202"); the
  // numeric product "203" is sold/keyed as "203B".
  if (/norma/i.test(m)) return 'Norma ' + (p === '203' ? '203B' : p.replace(/\s+/g, ' '));
  return p.replace(/\s+/g, ' ');
}

let added = 0, kept = 0, conflicts = 0, skipped = 0;
const files = fs.readdirSync(folder).filter((f) => /\.propellant(\.xml)?$/i.test(f));
for (const f of files) {
  const xml = fs.readFileSync(path.join(folder, f), 'utf8');
  if (mfgFilter && !dec(get(xml, 'mname')).toLowerCase().includes(mfgFilter)) { skipped++; continue; }
  const Qex = parseFloat(get(xml, 'Qex')), Ba = parseFloat(get(xml, 'Ba')), pcd = parseFloat(get(xml, 'pcd'));
  if (!(Qex > 0 && Ba > 0 && pcd > 0)) { skipped++; continue; }
  const mname = dec(get(xml, 'mname'));
  const key = keyFor(get(xml, 'mname'), get(xml, 'pname'));
  const next = { Qex, Ba, pcd };
  if (mname) next.mfg = mname;
  const cur = pj.powders[key];
  if (!cur) { pj.powders[key] = next; added++; }
  else if (cur.Qex === Qex && cur.Ba === Ba && cur.pcd === pcd) { kept++; }
  else if (force) { pj.powders[key] = { ...cur, ...next }; conflicts++; console.log(`  overwrite ${key}: ${JSON.stringify(cur)} -> ${JSON.stringify(pj.powders[key])}`); }
  else { conflicts++; console.log(`  conflict ${key} (kept): have ${JSON.stringify(cur)} file ${JSON.stringify(next)} — use --force to replace`); }
}
// keep keys sorted for stable diffs
pj.powders = Object.fromEntries(Object.keys(pj.powders).sort().map((k) => [k, pj.powders[k]]));
fs.writeFileSync(pjPath, JSON.stringify(pj, null, 2) + '\n');
console.log(`scanned ${files.length} files: +${added} added, ${kept} unchanged, ${conflicts} conflicts, ${skipped} skipped (missing Qex/Ba/pcd)`);
console.log(`total powders now: ${Object.keys(pj.powders).length}  -> ${pjPath}`);
