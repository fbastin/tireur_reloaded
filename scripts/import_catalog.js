/**
 * import_catalog.js — import a propellant catalogue (HTML table) into the database.
 *
 * Usage : node scripts/import_catalog.js <Propellants.htm>
 *
 * Splits the source into:
 *  - data/powders.json (PUBLISHED): factual fields only — mfg (brand), name,
 *    base, type, energy_Jg (raw source "energy J/g" column — meaning INCONSISTENT:
 *    ~900–1200 for some rows = force/impetus, ~3700–4500 for others = heat of
 *    explosion; NOT a clean Qex, stored as-is for later vetting),
 *    pcd (bulk density, kg/m³). Existing Qex/Ba (from GRT) are preserved.
 *  - data/powders_catalog.local.json (GITIGNORED): the full rows incl. the
 *    editorial NOTES and the actual manufacturer column + source attribution —
 *    recorded for possible future use, not redistributed.
 *
 * The source "energy J/g" column is inconsistent (force/impetus for some rows, heat
 * of explosion for others). It is stored verbatim as energy_Jg for later vetting; it
 * is NOT placed in the Qex field.
 */
const fs = require('fs');
const path = require('path');
const src = process.argv[2];
if (!src) { console.error('usage: node scripts/import_catalog.js <file.htm>'); process.exit(1); }
const d = (f) => path.join(__dirname, '..', 'data', f);

const html = fs.readFileSync(src, 'utf8');
const dec = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&#8211;|&ndash;/g, '–').replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, ' ').trim();
const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) =>
  [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => dec(c[1])));

const num = (s) => { const v = parseFloat(String(s).replace(',', '.')); return isFinite(v) ? v : null; };
function keyName(brand, powder) {
  if (/reload\s*swiss/i.test(brand)) { const dd = (powder.match(/\d+/) || [''])[0]; return ['RS' + dd, dd, 'Reload Swiss']; }
  if (/vihtavuori/i.test(brand)) { const p = powder.replace(/\s+/g, ''); return [p, p, 'Vihtavuori']; }
  return [brand + ' ' + powder, powder, brand];
}

const pj = JSON.parse(fs.readFileSync(d('powders.json')));
// migration : la clé de démo "1680" devient "Accurate 1680"
if (pj.powders['1680'] && !pj.powders['Accurate 1680']) {
  pj.powders['Accurate 1680'] = Object.assign({ name: '1680', mfg: 'Accurate' }, pj.powders['1680']);
  delete pj.powders['1680'];
}

const catalog = [];
let added = 0, enriched = 0;
for (const c of rows) {
  if (c.length < 6 || c[0] === 'BRAND' || !c[0] || !c[1]) continue;
  const [brand, powder, base, type, energy, bulk, manuf, notes] = c;
  // catalogue complet (local) — tout, y compris notes/producteur
  catalog.push({ brand, powder, base, type, energy_Jg: num(energy), bulk_density: num(bulk), manufacturer: manuf || '', notes: notes || '' });
  // entrée publique — factuel uniquement
  const [key, name, mfg] = keyName(brand, powder);
  const e = pj.powders[key] || {};
  const wasNew = !pj.powders[key];
  e.mfg = e.mfg || mfg; e.name = e.name || name;
  if (base) e.base = base;
  if (type) e.type = type;
  const f = num(energy); if (f && !e.energy_Jg) e.energy_Jg = f;          // source brute, sens incohérent — PAS Qex
  let p = num(bulk); if (p && p < 10) p *= 1000;                          // g/cm³ -> kg/m³ si besoin
  if (p && !e.pcd) e.pcd = Math.round(p);                                 // ne pas écraser un pcd GRT
  pj.powders[key] = e;
  wasNew ? added++ : enriched++;
}

pj._doc = 'Constantes poudres. Chemin principal: Qex (kJ/kg)+Ba+pcd. Repli: pcd seul (ou rien) -> modele e_eff. Champs factuels supplementaires (base, type, energy_Jg, name, mfg) stockes pour usage futur. energy_Jg = colonne energie source (J/g) au sens INCOHERENT (force ~900-1200 OU chaleur explosion ~3700-4500) -> a verifier, PAS un Qex. Catalogue complet (avec notes) local: data/powders_catalog.local.json. Sources: GRT (.propellant) + ammoreference.com (donnees factuelles).';
pj.powders = Object.fromEntries(Object.keys(pj.powders).sort().map((k) => [k, pj.powders[k]]));
fs.writeFileSync(d('powders.json'), JSON.stringify(pj, null, 2) + '\n');

const cat = { _doc: 'Catalogue complet de poudres (donnees + NOTES editoriales). Local/gitignore — non redistribue. Source: ' + path.basename(src) + ' (ammoreference.com).', _date: new Date().toISOString().slice(0, 10), powders: catalog };
fs.writeFileSync(d('powders_catalog.local.json'), JSON.stringify(cat, null, 1));

console.log(`catalogue: ${catalog.length} lignes -> data/powders_catalog.local.json (local)`);
console.log(`powders.json: +${added} ajoutees, ${enriched} enrichies, total ${Object.keys(pj.powders).length}`);
