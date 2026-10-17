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
// Densités du catalogue que deux mesures tierces INDÉPENDANTES contredisent ensemble (2026-10-17, scripts/lee_vmd.py) :
// la densité implicite des fiches Nosler et la table VMD de Lee (doseur), concordantes à 2 % près, à 8 % ou plus du
// catalogue. Valeur posée : leur moyenne. Aucune n'est une valeur du fabricant de la poudre (Hodgdon et Accurate n'en
// publient pas) ; sur les poudres dont le fabricant publie la densité, Lee mesure 2,7 % plus bas en médiane.
const LEE_NOSLER = (pcd, lee, nos, cat) => ({
  fields: { pcd, pcd_src: `Moyenne de deux mesures tierces concordantes : Nosler ${nos} (densité implicite de ses fiches) et `
    + `Lee ${lee} (table VMD du 2024-01-08, doseur) ; le catalogue donnait ${cat}. Pas une valeur du fabricant de la poudre.` },
  why: `Densité du catalogue (${cat}) contredite par deux mesures tierces indépendantes et concordantes : Nosler ${nos} `
    + `(densité implicite de ses fiches) et Lee ${lee} (table VMD, doseur). Moyenne des deux.`,
  src: 'Nosler, fiches de rechargement (scripts/nosler_fiches.py, relevé du 2026-10-13) ; Lee Precision, « Powder '
    + 'VMD\'s », https://leeprecision.com/files/instruct/VMD.pdf (VMD 1-8-24, lu le 2026-10-17, scripts/lee_vmd.py). '
    + 'Posée le 2026-10-17.',
});
const CORRECTIONS = {
  'Accurate LT-30': LEE_NOSLER(862, 864, 861, 980),
  'Hodgdon CFE Pistol': LEE_NOSLER(856, 859, 852, 638),
  'Hodgdon Long Shot': LEE_NOSLER(792, 786, 797, 940),
  'Hodgdon Titegroup': LEE_NOSLER(756, 764, 747, 817),
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
  'Winchester 296': {
    fields: { pcd: 970 },
    why: 'Le catalogue donne 860 à la W296 et 970 à la H110. Le manuel Hodgdon, qui distribue '
      + 'les deux, publie pour elles les mêmes charges, vitesses et pressions dans les 80 cas où '
      + 'il donne les deux poudres pour une même balle : il les traite comme une seule poudre. '
      + 'Les fiches Nosler leur appliquent aussi une seule densité (0,980). La W296 reprend la '
      + 'valeur de la H110 ; à 860, ses charges paraissaient remplir l\'étui 13 % de plus.',
    src: 'Hodgdon, Annual Manual 2024 (lignes W296 et H110 de 17 Hornet, 22 Hornet, 30 Carbine, '
      + '300 AAC Blackout…) ; fiches Nosler (scripts/nosler_fiches.py). Posée le 2026-10-13.',
  },
  'N120': {
    fields: { pcd: 860 },
    why: 'Valeur du fabricant (la base avait 870, d\'un fichier GRT ; le catalogue avait 860).',
    src: 'Vihtavuori, Reloading Guide 2026 (PDF anglais), p. 148, « Bulk density (g/l) ». Posée le 2026-10-13.',
  },
  'N568': {
    fields: { pcd: 907 },
    why: 'Valeur du fabricant (le catalogue avait 965).',
    src: 'Vihtavuori, Reloading Guide 2026 (PDF anglais), p. 148, « Bulk density (g/l) ». Posée le 2026-10-13.',
  },
  '20N29': {
    fields: { pcd: 960 },
    why: 'Valeur du fabricant (le catalogue avait 990).',
    src: 'Vihtavuori, Reloading Guide 2026 (PDF anglais), p. 148, « Bulk density (g/l) ». Posée le 2026-10-13.',
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
  let nv = 0;
  for (const [k, gl] of Object.entries(DENSITES_VV)) {
    const e = pj.powders[k];
    if (!e) { console.warn(`  ⚠ confirmation sans cible : ${k}`); continue; }
    if (!e.pcd || Math.abs(e.pcd / gl - 1) > 0.01) {
      console.warn(`  ⚠ ${k} : pcd ${e.pcd} contre ${gl} g/l dans le guide Vihtavuori — non confirmée`);
      delete e.pcd_src;
      continue;
    }
    e.pcd_src = `${GUIDE_VV} : ${gl}`;
    nv++;
  }
  console.log(`  densités confirmées par le guide Vihtavuori : ${nv}`);
}

/**
 * Le fabricant Vihtavuori publie la densité apparente de ses poudres. Trois valeurs de la base
 * s'en écartaient (N120, N568, 20N29) : elles sont corrigées dans CORRECTIONS.
 */
const GUIDE_VV = 'Vihtavuori, Reloading Guide 2026 (PDF anglais), p. 148, « Bulk density (g/l) »';
const DENSITES_VV = {
  N110: 800, N120: 860, N130: 870, N133: 870, N135: 870, N140: 910, N150: 910, N160: 920, N165: 920,
  N170: 960, '24N41': 970, '20N29': 960, N310: 560, N320: 550, N330: 620, N340: 620, N350: 660,
  '3N37': 720, '3N38': 730, N540: 940, N550: 940, N555: 900, N560: 960, N565: 960, N568: 907, N570: 960,
};

/**
 * DENSITES_NOSLER — densité apparente IMPLICITE des fiches de rechargement Nosler, pour les
 * poudres qui n'en ont aucune ailleurs.
 *
 * Chaque fiche imprime la capacité en eau de l'étui balle en place (« CASE HOLDS: x Gr. WATER »)
 * et, pour chaque charge, une densité de chargement (« LOAD DENSITY (VOLUME) », en %). Leur
 * rapport donne la densité qu'emploie Nosler : charge / (densité de chargement × capacité en
 * eau). Nosler applique une table fixe, qu'il ne publie pas : les médianes par fiche d'une même
 * poudre concordent à 1 % près (scripts/nosler_fiches.py, 285 fiches, relevé du 2026-10-13).
 *
 * Ce n'est PAS une valeur de fabricant de poudre. Sur les poudres Vihtavuori, dont le fabricant
 * publie la densité, Nosler est plus bas de 1 à 14 % (médiane 5 %) ; sur les autres marques, la
 * moitié centrale des écarts au catalogue tient dans ±2 %. Elle ne remplace donc jamais une
 * densité existante : elle comble un manque, pour que les charges de ces poudres entrent dans les
 * données (les parseurs écartent une poudre sans densité) et que le remplissage soit calculable.
 * Une erreur de quelques pour cent ne touche que le remplissage affiché et le modèle à froid :
 * les ancres tirent l'énergie et η_p des vitesses et pressions publiées.
 *
 * Trois clés sont créées, les poudres n'existant pas dans le catalogue :
 *   - IMR 7828 : distincte de l'IMR 7828SC (« IMR 7828 SSC … allows up to 4 percent more powder
 *     space », Hodgdon, Annual Manual 2024, p. 64 ; Nosler : 0,940 contre 0,970, soit +3,2 %) ;
 *   - Hodgdon H4831SC : « Extreme Extruded », « better loading density » que la H4831 (même
 *     manuel, p. 63) ; un fichier communautaire GRT donne 968, à 1 % de Nosler ;
 *   - Accurate 2015 : distincte de l'Accurate 2015BR, dont l'identité n'est pas établie
 *     (data/powder_aliases.json, « _a_confirmer »).
 */
const DENSITES_NOSLER = [
  // [clé, g/cm³, fiches, lignes, champs d'une clé créée (ou null), remarque]
  ['Winchester Autocomp', 0.850, 11, 33],
  ['Winchester WSF Super-Field', 0.750, 5, 15],
  ['Winchester WST', 0.525, 4, 12],
  ['Hodgdon US869', 0.973, 2, 6],
  ['Hodgdon Hi-Skor 700X', 0.500, 5, 15],
  ['Hodgdon Hi-Skor 800X', 0.633, 8, 24],
  ['Alliant Power Pro Varmit', 0.989, 10, 30],
  ['Alliant Power Pro 2000-MR', 0.990, 3, 9],
  ['Alliant Power Pro 4000-MR', 0.950, 10, 30],
  ['Alliant Power Pro 300-MP', 0.945, 3, 9],
  ['Alliant Green Dot', 0.521, 3, 9],
  ['Ramshot Competition', 0.510, 1, 3],
  ['IMR 4007 SSC', 0.930, 1, 3],
  ['IMR Blue', 0.775, 2, 6],
  ['IMR Target', 0.613, 1, 3],
  ['Norma 200', 0.868, 1, 3],
  ['IMR 7828', 0.940, 47, 141, { mfg: 'IMR', name: '7828' }],
  ['Hodgdon H4831SC', 0.960, 52, 156, { mfg: 'Hodgdon', name: 'H4831SC', type: 'Extruded' }],
  ['Accurate 2015', 0.880, 27, 81, { mfg: 'Accurate', name: '2015' }],
];

/**
 * DENSITES_LEE — densité apparente mesurée par Lee Precision au doseur, pour les poudres qui n'en ont aucune
 * ailleurs (ni catalogue, ni fabricant, ni Nosler). Table « Powder VMD's » (volume en cm³ d'un grain de poudre),
 * https://leeprecision.com/files/instruct/VMD.pdf, fichier « VMD 1-8-24 » lu le 2026-10-17 ; densité = 0,06479891 / VMD.
 *
 * Ce n'est pas une valeur du fabricant de la poudre. Sur les 34 poudres dont le fabricant publie la densité
 * (Vihtavuori, Shooters World), Lee mesure 2,7 % plus bas en médiane (moitié centrale −4 % à −1 %, extrêmes −6 % et
 * +1 %) : un doseur tasse moins la poudre (scripts/lee_vmd.py). Elle comble un manque, comme DENSITES_NOSLER, et ne
 * remplace jamais une densité existante. Lee donne parfois une même valeur à plusieurs poudres d'une gamme (Vectan SP 3
 * et SP 8 : 0,0682 ; Tubal 7000 et 8000 : 0,0704) : mesure de gamme, plutôt que poudre par poudre.
 * Libellés de Lee rapportés aux clés de la base : table LIBELLES de scripts/lee_vmd.py.
 */
const DENSITES_LEE = [
  // [clé, VMD (cm³/grain), libellé de Lee]
  ['ADI AR 2206', 0.0714, 'ADI AR2206'], ['ADI AS50N', 0.1208, 'ADI AS50'], ['Alliant 410', 0.0804, 'ALNT 410'],
  ['Alliant American Select', 0.1341, 'AMER-SELECT'], ['Alliant Reloder 12', 0.0691, 'RELODER12'],
  ['Alliant Steel', 0.1063, 'ALLIANT STEEL'], ['Hodgdon International', 0.1266, 'INTERNATIONAL'],
  ['Hodgdon PB', 0.1205, 'IMR PB'], ['Hodgdon Superformance', 0.0658, 'H-SUPRFORM'], ['Hodgdon Titewad', 0.1300, 'TITEWAD'],
  ['IMR SR 4756', 0.1100, 'SR4756'], ['IMR SR 7625', 0.1046, 'SR7625'], ['Vectan SP 3', 0.0682, 'VEC SP3'],
  ['Vectan SP 8', 0.0682, 'VEC SP8'], ['Vectan Tubal 7000', 0.0704, 'VEC TU7000'], ['Vectan Tubal 8000', 0.0704, 'VEC TU8000'],
  ['Winchester 244', 0.0788, 'WIN 244 (deux lignes chez Lee, 0,0789 et 0,0787 : moyenne)'], ['Winchester Supreme 780', 0.0684, 'SUPRM780'],
  ['Winchester WMR', 0.0718, 'WIN MAG RIFLE'], ['Winchester WSH Super-Handicap', 0.0859, 'WIN SUPER HANDI'],
  // Hybrid 100V : jusqu'au 2026-10-17, densité implicite Nosler 0,971, déjà jugée douteuse (Hodgdon marque comprimées 78
  // de ses 156 charges maximales, au remplissage médian de 0,91 avec elle ; l'étalon des marques « comprimée » la plaçait
  // 11,3 % plus bas, scripts/etalon_comprime.py). Lee mesure 893 : la seule mesure directe l'emporte.
  ['Hodgdon Hybrid 100V', 0.0726, 'HYBRID100'],
];

function appliquerDensitesLee(pj) {
  let n = 0;
  for (const [k, vmd, libelle] of DENSITES_LEE) {
    const e = pj.powders[k];
    if (!e) { console.warn(`  ⚠ densité Lee sans cible : ${k}`); continue; }
    // une valeur Nosler retirée de DENSITES_NOSLER (Hybrid 100V) reste dans powders.json : Lee la remplace
    const nosOrpheline = String(e.pcd_src || '').startsWith('Nosler') && !DENSITES_NOSLER.some(([kn]) => kn === k);
    if (e.pcd && !String(e.pcd_src || '').startsWith('Lee') && !nosOrpheline) {
      console.warn(`  ⚠ ${k} a désormais une densité (${e.pcd}) : la valeur Lee n'est plus posée`);
      continue;
    }
    e.pcd = Math.round(64.79891 / vmd);
    e.pcd_src = `Lee Precision, table « Powder VMD's » du 2024-01-08 (lue le 2026-10-17) : « ${libelle} » ${vmd} cm³ `
      + `par grain, mesure au doseur. Pas une valeur du fabricant de la poudre : Lee mesure 2,7 % plus bas que les `
      + `fabricants qui publient la leur, en médiane.`;
    n++;
  }
  console.log(`  densités Lee posées : ${n}`);
}

function appliquerDensitesNosler(pj) {
  let n = 0;
  for (const [k, gcc, fiches, lignes, cree, remarque] of DENSITES_NOSLER) {
    if (!pj.powders[k]) {
      if (!cree) { console.warn(`  ⚠ densité Nosler sans cible : ${k}`); continue; }
      pj.powders[k] = { ...cree };
    }
    const e = pj.powders[k];
    if (e.pcd && !String(e.pcd_src || '').startsWith('Nosler')) {
      console.warn(`  ⚠ ${k} a désormais une densité (${e.pcd}) : la valeur Nosler (${gcc}) n'est plus posée`);
      continue;
    }
    e.pcd = Math.round(gcc * 1000);
    e.pcd_src = `Nosler, fiches de rechargement en ligne : densité implicite (charge / (densité de chargement `
      + `× capacité en eau)), médiane de ${lignes} lignes sur ${fiches} fiche${fiches > 1 ? 's' : ''}, `
      + `relevé du 2026-10-13. Table de Nosler, pas une valeur du fabricant de la poudre.` + (remarque ? ' ' + remarque : '');
    n++;
  }
  console.log(`  densités implicites Nosler posées : ${n}`);
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
appliquerDensitesNosler(pj);
appliquerDensitesLee(pj);

pj._doc = 'Constantes poudres. Chemin principal: Qex (kJ/kg)+Ba+pcd. Repli: pcd seul (ou rien) -> modele e_eff. Champs factuels supplementaires (base, type, energy_Jg, name, mfg) stockes pour usage futur. energy_Jg = colonne energie source (J/g) au sens INCOHERENT (force ~900-1200 OU chaleur explosion ~3700-4500) -> a verifier, PAS un Qex. Catalogue complet (avec notes) local: data/powders_catalog.local.json. Sources: GRT (.propellant) + ammoreference.com (donnees factuelles), plus les surcharges assumees du bloc CORRECTIONS de scripts/import_catalog.js (chacune avec sa raison et sa provenance). pcd_src : provenance de la densite, soit une source fabricant qui la confirme (Shooters World, Vihtavuori : bloc CONFIRMATIONS et DENSITES_VV du meme script), soit, quand elle commence par « Nosler », la densite implicite des fiches Nosler, posee faute d autre valeur (bloc DENSITES_NOSLER), soit, quand elle commence par « Lee », la mesure au doseur de Lee Precision, posee faute d autre valeur (bloc DENSITES_LEE).';
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
