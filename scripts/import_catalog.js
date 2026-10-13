/**
 * import_catalog.js — import a propellant catalogue (HTML table) into the database.
 *
 * Usage : node scripts/import_catalog.js [Propellants.htm]
 *
 * Sans argument, le script se contente de réappliquer le bloc CORRECTIONS
 * ci-dessous aux fichiers déjà produits — utile quand le HTML source n'est plus
 * sous la main, ce qui est le cas normal (il n'est pas versé au dépôt).
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
const d = (f) => path.join(__dirname, '..', 'data', f);

const dec = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&#8211;|&ndash;/g, '–').replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, ' ').trim();
const rows = !src ? [] :
  [...fs.readFileSync(src, 'utf8').matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) =>
    [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => dec(c[1])));

/**
 * CORRECTIONS — surcharges ASSUMÉES sur le catalogue source (ammoreference.com).
 *
 * Elles vivent ici, et non dans powders.json ou powders_catalog.local.json, parce
 * que ces deux fichiers sont des ARTEFACTS de ce script : la boucle d'import
 * réécrit `base` et `type` sans condition, donc une correction portée à la main
 * dans le produit serait silencieusement annulée au prochain import.
 *
 * Chaque entrée porte sa raison ET sa source, la valeur d'une constante ne valant
 * que ce que vaut sa provenance.
 */
const CORRECTIONS = {
  'IMR 4320': {
    fields: { base: 'Single', type: 'Extruded', pcd: 900 },
    why: 'Le catalogue la donne « Double / Spherical » et sans densité. L\'IMR 4320 '
      + 'est une poudre extrudée simple-base comme toute la gamme IMR de fusil '
      + '(3031, 4064, 4350, 4831, 4895) : c\'est la SEULE que le catalogue classe '
      + 'autrement, et l\'anomalie se lit à l\'œil dans la colonne. La densité de '
      + '900 kg/m³ tombe au milieu de celle de ses sœurs (860 à 920), ce qui '
      + 'corrobore le reclassement — un sphérique double-base serait plus dense.',
    src: 'Densité relevée à la main sur preciseload.com le 2026-08-15 ; '
      + 'reclassement déduit de la gamme IMR du catalogue lui-même.',
  },
  'Alliant Power Pro Varmit': {
    fields: { name: 'Power Pro Varmint' },
    why: 'Faute de frappe du catalogue amont : le produit Alliant s\'appelle Power Pro '
      + 'VARMINT. Elle avait deux effets, tous deux silencieux. L\'interface affiche '
      + '`mfg + name`, donc la page servie annoncait « Alliant Power Pro Varmit » aux '
      + 'lecteurs. Et l\'index des poudres etant construit sur la cle ET sur `name`, '
      + 'aucune source ecrivant l\'orthographe correcte ne pouvait s\'y apparier : les '
      + '18 charges Power Pro Varmint du 6,5 x 47 Lapua etaient jetees sans un mot. '
      + 'La cle n\'est PAS renommee — rien d\'autre ne la reference, mais la corriger '
      + 'par le champ `name` suffit a reparer l\'affichage et l\'appariement.',
    src: 'Nomenclature Alliant (gamme Power Pro : 300-MP, 1200-R, 2000-MR, 4000-MR, '
      + 'Varmint) ; anomalie relevee le 2026-08-18 par le garde-fou des poudres '
      + 'orphelines de build_anchors.js.',
  },
  'Hodgdon Lil Gun': {
    fields: { pcd: 956 },
    why: 'Le catalogue ne donne pas de densité apparente : sans elle, les 110 charges '
      + 'Lil\'Gun du manuel Hodgdon 2024 (.357, .44, .410…) étaient écartées par les '
      + 'parseurs, qui n\'indexent que les poudres dotées d\'une densité. Aucun fabricant '
      + 'ne publie la valeur (la FDS Hodgdon des sphériques donne « 0.5 - 1 g/cc » pour '
      + 'toute la gamme).',
    src: 'Fichiers communautaires GRT de la base locale (legacy/grt_databases/powders) : '
      + '« Lil\' Gun QL » (Tom24, 2023-05-05, « QL Clone » : valeurs reprises de QuickLOAD) '
      + 'et « Lil\'Gun (sub-sonic) » (2023-05-07), tous deux à 956 kg/m³. Posée le 2026-10-08.',
  },
  'Shooters World Clean Shot': {
    fields: { type: 'Spherical' },
    why: 'Le catalogue la classe « Extruded ». Le guide du fabricant la dit sphérique '
      + '(« It\'s spherical geometry assures highly consistent powder drops ») et la nomme '
      + 'D032 chez Lovex, que le même catalogue classe déjà « Spherical ».',
    src: 'Shooters World, Reloading Guide (PDF de novembre 2022), p. 6 ; relevé le 2026-10-12.',
  },
};

/**
 * CONFIRMATIONS — densités apparentes (pcd) qu'une source FABRICANT confirme.
 *
 * Elles ne changent aucune valeur : elles posent `pcd_src` dans powders.json, pour que la
 * provenance d'une densité se lise à côté d'elle (le catalogue amont et les fichiers GRT
 * sont des sources secondaires). Le guide arrondit (« approximately 0.9 grams/cc ») : une
 * valeur de la base à plus de 1 % de la sienne n'est pas confirmée, elle est signalée.
 * Les poudres Lovex sont confirmées par la même page, qui donne leur nom Lovex.
 */
const GUIDE_SW = 'Shooters World, Reloading Guide (PDF de novembre 2022)';
const CONFIRMATIONS = [
  // [clé Shooters World, page, densité imprimée (g/cc), nom imprimé, clé Lovex jumelle ou null]
  ['Shooters World Clean Shot', 6, 0.65, 'Clean Shot', 'Lovex D032'],
  ['Shooters World Ultimate Pistol', 7, 0.92, 'Ultimate Pistol', null],
  ['Shooters World Auto Pistol', 8, 0.95, 'Auto Pistol', 'Lovex D036'],
  ['Shooters World Major Pistol', 9, 0.98, 'Major Pistol', 'Lovex D037.1'],
  ['Shooters World Heavy Pistol', 10, 0.98, 'Heavy Pistol', 'Lovex D037.2'],
  ['Shooters World Buffalo Rifle', 11, 0.87, 'Buffalo Rifle', 'Lovex D060'],
  ['Shooters World SOCOM', 12, 0.99, 'SOCOM', null],
  ['Shooters World Blackout', 13, 1, 'Blackout', 'Lovex D063'],
  ['Shooters World Tactical Rifle', 15, 1.0, 'Tactical Rifle', null],
  ['Shooters World Match Rifle', 16, 1, 'Match Rifle', 'Lovex D073.6'],
  ['Shooters World Precision', 17, 0.9, 'Precision Rifle', 'Lovex S062'],
  ['Shooters World Long Rifle', 18, 0.9, 'Long Rifle', 'Lovex S065'],
  ['Shooters World SW 4350', 19, 0.9, 'SW4350', 'Lovex S070'],
  ['Shooters World SW50BMG', 20, 1, 'SW 50BMG', 'Lovex D100-1'],
];

function appliquerConfirmations(pj) {
  let n = 0;
  for (const [cle, page, gcc, nom, jumelle] of CONFIRMATIONS) {
    const cite = nom === 'SW 50BMG'
      ? `« has a density of approximately ${gcc} gram/cc »`
      : `« The density of ${nom} is approximately ${gcc} gram${gcc === 1 ? '' : 's'}/cc »`;
    for (const [k, txt] of [[cle, `${GUIDE_SW}, p. ${page} : ${cite}`],
      [jumelle, `${GUIDE_SW}, p. ${page} : ${cite} pour ${nom}, vendue sous le nom ${jumelle} (même page)`]]) {
      if (!k) continue;
      const e = pj.powders[k];
      if (!e) { console.warn(`  ⚠ confirmation sans cible : ${k}`); continue; }
      if (!e.pcd || Math.abs(e.pcd / (gcc * 1000) - 1) > 0.01) {
        console.warn(`  ⚠ ${k} : pcd ${e.pcd} contre ${gcc} g/cc dans le guide — non confirmée`);
        delete e.pcd_src;
        continue;
      }
      e.pcd_src = txt;
      n++;
    }
  }
  console.log(`  densités confirmées par le guide Shooters World : ${n}`);
}

function appliquerCorrections(pj, catalog) {
  for (const [key, c] of Object.entries(CORRECTIONS)) {
    const e = pj.powders[key];
    // Une correction sans cible est un bug silencieux : la clé a pu changer.
    if (!e) { console.warn(`  ⚠ correction sans cible : ${key}`); continue; }
    Object.assign(e, c.fields);
    const row = catalog.find((r) => keyName(r.brand, r.powder)[0] === key);
    if (row) {
      if (c.fields.base) row.base = c.fields.base;
      if (c.fields.type) row.type = c.fields.type;
      if (c.fields.pcd) row.bulk_density = c.fields.pcd;
      const marque = 'CORRIGÉ (tireur.org) : ';
      if (!String(row.notes || '').includes(marque)) {
        row.notes = (row.notes ? row.notes + ' — ' : '') + marque + c.why + ' [' + c.src + ']';
      }
    }
    console.log(`  corrigé ${key} : ${JSON.stringify(c.fields)}`);
  }
}

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

// Sans HTML source on repart du catalogue local : le reconstruire à vide
// l'effacerait, alors qu'il porte les notes éditoriales non redistribuées.
const catPrev = fs.existsSync(d('powders_catalog.local.json'))
  ? JSON.parse(fs.readFileSync(d('powders_catalog.local.json'))) : { powders: [] };
const catalog = src ? [] : catPrev.powders;
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

appliquerCorrections(pj, catalog);
appliquerConfirmations(pj);

pj._doc = 'Constantes poudres. Chemin principal: Qex (kJ/kg)+Ba+pcd. Repli: pcd seul (ou rien) -> modele e_eff. Champs factuels supplementaires (base, type, energy_Jg, name, mfg) stockes pour usage futur. energy_Jg = colonne energie source (J/g) au sens INCOHERENT (force ~900-1200 OU chaleur explosion ~3700-4500) -> a verifier, PAS un Qex. Catalogue complet (avec notes) local: data/powders_catalog.local.json. Sources: GRT (.propellant) + ammoreference.com (donnees factuelles), plus les surcharges assumees du bloc CORRECTIONS de scripts/import_catalog.js (chacune avec sa raison et sa provenance). pcd_src : source fabricant qui confirme la densite (bloc CONFIRMATIONS du meme script).';
pj.powders = Object.fromEntries(Object.keys(pj.powders).sort().map((k) => [k, pj.powders[k]]));
fs.writeFileSync(d('powders.json'), JSON.stringify(pj, null, 2) + '\n');

const cat = {
  _doc: src
    ? 'Catalogue complet de poudres (donnees + NOTES editoriales). Local/gitignore — non redistribue. Source: '
      + path.basename(src) + ' (ammoreference.com). Corrections assumees: voir CORRECTIONS dans scripts/import_catalog.js.'
    : catPrev._doc,
  _date: src ? new Date().toISOString().slice(0, 10) : catPrev._date,
  powders: catalog,
};
fs.writeFileSync(d('powders_catalog.local.json'), JSON.stringify(cat, null, 1));

console.log(src
  ? `catalogue: ${catalog.length} lignes -> data/powders_catalog.local.json (local)`
  : `catalogue: ${catalog.length} lignes relues (pas de HTML source), corrections seules`);
console.log(`powders.json: +${added} ajoutees, ${enriched} enrichies, total ${Object.keys(pj.powders).length}`);
