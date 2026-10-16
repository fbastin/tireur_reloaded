/**
 * parse_adi_web.js — données de rechargement en ligne d'ADI (adiworldclass.com.au, rubriques « Rifle Data » et
 * « Pistol Data ») → jeu (charge, vitesse, pression) LOCAL.
 *
 * Usage : node scripts/parse_adi_web.js <dossier des pages>
 *         (pages lues une à une, une par seconde, dans reloading/guides/adi_web_<date>/{rifle,pistol}/<cartouche>.html,
 *          après acceptation de l'avertissement de sécurité du site, à la demande de Fabian, le 2026-10-15)
 * Sortie : data/adi_web.local.json (gitignoré — tables brutes du fabricant, non redistribuées)
 *
 * JEU DE VALIDATION, comme le guide imprimé de 2013 (parse_adi.js) : aucune ligne n'entre ni dans le calage ni dans
 * les ancres. Décision du 2026-10-15 : ADI reste le laboratoire indépendant de l'estimateur. Données plus récentes
 * que le guide de 2013 (édition en ligne, 2024 ou après), avec cartouches et poudres nouvelles.
 *
 * Une page = un tableau d'en-tête (étui, pas, amorce, canon, longueur de recoupe, limite de pression) puis un tableau
 * de charges : balle, poudre, Ø, longueur hors tout, départ (grains, fps, pression), maximum (idem, « ( C ) » pour une
 * charge comprimée). Pression en psi ou en CUP ; le CUP n'est pas convertible et reste à part (`unit`).
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/parse_adi_web.js <dossier des pages>'); process.exit(1); }
const d = (f) => path.join(__dirname, '..', 'data', f);

// Correspondance des poudres : même règle que parse_adi.js (alias curés, puis marques ADI, Hodgdon, Thales).
const PWD = JSON.parse(fs.readFileSync(d('powders.json'))).powders;
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const idx = {};
for (const k of Object.keys(PWD)) if (PWD[k].pcd) idx[norm(k)] = k;
const ALIAS = JSON.parse(fs.readFileSync(d('powder_aliases.json'))).alias;
const MARQUES = ['', 'ADI ', 'Hodgdon ', 'Thales '];
function matchPoudre(label) {
  const a = ALIAS[label];
  if (a && idx[norm(a)]) return idx[norm(a)];
  for (const m of MARQUES) { const k = idx[norm(m + label)]; if (k) return k; }
  return null;
}

const IN = 25.4;
const texte = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#8221;|&#8243;|″/g, '"').replace(/&amp;/g, '&')
  .replace(/&#0?39;|&#8217;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
// Point initial admis : le diamètre s'écrit « .308" » (lu 308 sans cela).
const nombre = (s) => { const m = String(s).replace(/,/g, '').match(/-?\d*\.\d+|-?\d+/); return m ? +m[0] : null; };
// « 48800 psi », « 52000 CUP », « - »
function pression(s) {
  const v = nombre(s); if (v == null) return { P: null, unit: null };
  return { P: v, unit: /cup/i.test(s) ? 'CUP' : /psi/i.test(s) ? 'PSI' : null };
}

const rows = [], inconnues = {}, pages = { lues: 0, sans_tableau: [] };
let nPsi = 0, nCup = 0;
for (const arme of ['rifle', 'pistol']) {
  const sous = path.join(dir, arme);
  if (!fs.existsSync(sous)) continue;
  for (const f of fs.readdirSync(sous).filter((x) => x.endsWith('.html')).sort()) {
    const h = fs.readFileSync(path.join(sous, f), 'utf8');
    const i = h.indexOf('id="adi_data"'); if (i < 0) { pages.sans_tableau.push(`${arme}/${f}`); continue; }
    const bloc = h.slice(i);
    const titre = texte((bloc.match(/^[^>]*>([\s\S]*?)<table/) || [, ''])[1]);
    pages.lues++;
    let ctx = { case: null, twist: null, primer: null, barrel_mm: null, trim_in: null, limite: null };
    let lignesPage = 0;
    for (const t of bloc.match(/<table[\s\S]*?<\/table>/g) || []) {
      const trs = (t.match(/<tr[\s\S]*?<\/tr>/g) || []).map((tr) => (tr.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/g) || []).map(texte));
      // Tableau d'en-tête : paires « clé : valeur »
      if (trs.length && trs.every((c) => c.length === 2 && /:$/.test(c[0]))) {
        for (const [k, v] of trs) {
          if (/^Case/i.test(k)) ctx.case = v;
          else if (/^Twist/i.test(k)) ctx.twist = v;
          else if (/^Primer/i.test(k)) ctx.primer = v;
          else if (/^Barrel/i.test(k)) { const b = nombre(v); ctx.barrel_mm = b != null ? +(b * (/mm/i.test(v) ? 1 : IN)).toFixed(1) : null; }
          else if (/^Trim/i.test(k)) ctx.trim_in = nombre(v);
          else if (/^Pressure/i.test(k)) ctx.limite = v;
        }
        continue;
      }
      for (const c of trs) {
        if (c.length < 12 || !/Maximum/i.test(c[8])) continue;
        const mb = c[0].match(/^(\d+(?:\.\d+)?)\s*GR\.?\s*(.*)$/i); if (!mb) continue;
        // « AR2207 ( S ) » : charge subsonique ; « ( R ) » : recul réduit (légende de la page). Le suffixe part du
        // libellé, le type reste sur la ligne (`load_type`) pour écarter ces charges hors du domaine courant.
        const ms = c[1].match(/^(.*?)\s*\(\s*([SR])\s*\)\s*$/);
        const label = ms ? ms[1] : c[1], loadType = ms ? ms[2] : null;
        const poudre = matchPoudre(label);
        if (!poudre) { inconnues[label] = (inconnues[label] || 0) + 1; continue; }
        const ps = pression(c[7]), pm = pression(c[11]);
        if (pm.unit === 'CUP') nCup++; else if (pm.unit === 'PSI') nPsi++;
        const diam = nombre(c[2]);
        rows.push({
          weapon: arme, cartridge: titre, slug: f.replace(/\.html$/, ''),
          bore_mm: diam != null ? +(diam * IN).toFixed(2) : null, barrel_mm: ctx.barrel_mm, twist: ctx.twist, case: ctx.case,
          powder: poudre, powder_label: label, load_type: loadType, bullet_gr: +mb[1], bullet_desc: mb[2].trim(),
          coal_in: nombre(c[3]),
          start_gr: nombre(c[5]), start_v0_fps: nombre(c[6]), start_P: ps.P, start_unit: ps.unit,
          charge_gr: nombre(c[9]), v0_fps: nombre(c[10]), compressed: /\(\s*C\s*\)/.test(c[9]),
          Pmax_psi: pm.unit === 'PSI' ? pm.P : null, Pmax_unit: pm.unit,
        });
        lignesPage++;
      }
    }
    if (!lignesPage) pages.sans_tableau.push(`${arme}/${f}`);
  }
}

fs.writeFileSync(d('adi_web.local.json'), JSON.stringify({
  _doc: 'ADI, données de rechargement en ligne (Thales Australia), pages lues le ' + path.basename(dir).replace(/^adi_web_/, '')
    + ' — données brutes, LOCAL/gitignoré, non redistribué. JEU DE VALIDATION : n\'entre ni dans le calage ni dans les ancres. '
    + 'Une ligne = une balle × poudre : départ (start_*) et maximum (charge_gr, v0_fps, Pmax_psi). Pmax_psi=null pour le CUP.',
  _source: path.basename(dir),
  rows,
}, null, 1));
console.log('-> data/adi_web.local.json');
console.log(`   ${pages.lues} pages · ${rows.length} lignes · ${new Set(rows.map((r) => r.cartridge)).size} cartouches · ${new Set(rows.map((r) => r.powder)).size} poudres`);
console.log(`   pression au maximum : ${nPsi} en PSI · ${nCup} en CUP (vitesse seule)`);
if (pages.sans_tableau.length) console.log(`   /!\\ ${pages.sans_tableau.length} page(s) sans ligne lue : ${pages.sans_tableau.slice(0, 12).join(', ')}`);
const inc = Object.entries(inconnues).sort((a, b) => b[1] - a[1]);
if (inc.length) console.log(`   /!\\ ${inc.length} libellés de poudre sans correspondance (${inc.reduce((s, [, n]) => s + n, 0)} lignes) : ${inc.map(([p, n]) => `${p} (${n})`).join(', ')}`);
