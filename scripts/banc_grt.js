/**
 * banc_grt.js — banc commun estimateur / GRT (Gordon's Reloading Tool) sur des charges publiées que
 * l'estimateur n'a pas vues.
 *
 * Usage :
 *   node scripts/banc_grt.js --preparer            tire le jeu (graine fixe), fige les valeurs publiées et les
 *                                                   prédictions de l'estimateur (data/banc_grt.local.json),
 *                                                   écrit la feuille de saisie (data/banc_grt_feuille.local.csv)
 *   node scripts/banc_grt.js --comparer [feuille]   lit la feuille remplie et compare GRT et l'estimateur
 *
 * Deux parties :
 *   - ADI (Handloaders' Guide 2013) : vitesse ET pression (psi), carabine, copies de lignes Hodgdon ou Western
 *     écartées. ADI n'entre ni dans le calage ni dans les ancres de l'estimateur ; ses poudres AR n'ont pas
 *     d'ancre, l'estimateur y est à froid. Les poudres Hodgdon du guide ADI tombent sur des couples ancrés.
 *   - Nosler (fiches 9.0) : vitesse seule, trois charges par poudre. « ancré » : le couple a une ancre tirée
 *     d'autres laboratoires (les ancres comblées par Nosler sont écartées, elles contiennent ces lignes) ;
 *     « à froid » : aucune ancre.
 *
 * Les prédictions de l'estimateur sont FIGÉES à la préparation, avec la version du dépôt : un modèle retouché
 * après avoir vu les chiffres de GRT ne compterait plus comme une prédiction. Elles reprennent pas à pas
 * predict() de index.php (ancre ou modèle à froid, vitesse au canon de référence ramenée au canon de la ligne
 * par la loi de canon de l'outil, pression au canon de référence ; volume d'étui nominal, 21 °C).
 * La feuille ne montre ni les valeurs publiées ni les prédictions : GRT se règle sur les entrées seules.
 * Longueurs de balles : base du site (data/bullets/bullets.public.json), sinon la ligne n'est pas tirée.
 * Les données fabricant restent locales (gitignorées), comme les guides d'où elles viennent.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ICI = path.join(__dirname, '..');
const d = (f) => path.join(ICI, 'data', f);

const CAL = JSON.parse(fs.readFileSync(d('calibers.json'))).calibers;
const PWD = JSON.parse(fs.readFileSync(d('powders.json'))).powders;
const COEF = JSON.parse(fs.readFileSync(d('model_coefficients.json')));
const ANC = JSON.parse(fs.readFileSync(d('anchors.json'))).anchors;
const EM = require('../energy_model.js');
const VM = require('../velocity_model.js');
const GR2G = 0.06479891, IN = 25.4, PSI2BAR = 0.0689476, FPS2MS = 0.3048;
const CLE = d('banc_grt.local.json'), FEUILLE = d('banc_grt_feuille.local.csv');
const GUIDES_NOSLER = path.join(ICI, '..', 'guides', 'nosler');
const BALLES = path.join(ICI, '..', '..', 'data', 'bullets', 'bullets.public.json');
const GRAINE = 20261013, N_ADI_ANCRE = 5, N_ADI_FROID = 15, N_NOS_ANCRE = 12, N_NOS_FROID = 8;

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2; };

// --- prédiction : predict() de index.php, sans saisie de l'utilisateur (volume nominal, 21 °C, pas d'ancrage carabine)
function predire(ca, pw, m_gr, C_gr, bbl) {
  const A = Math.PI * (ca.bore_mm / 1000) ** 2 / 4;
  const ref = ca.test_barrel_mm || (ca.type === 'handgun' ? 122 : 600);
  const uT = (bbl - ca.case_mm) / 1000, refT = (ref - ca.case_mm) / 1000, cv = ca.case_vol_cm3;
  const fill = pw.pcd > 0 ? (C_gr * GR2G / (pw.pcd / 1000)) / cv : null;
  const anc = ANC[ca.__cle + '|' + pw.__cle] || null;
  const base = EM.energyAndEtaP(COEF, pw, fill, Math.log(1 + (A * refT) / (cv * 1e-6)), m_gr, C_gr, anc);
  const load = { m_gr, C_gr, d_mm: ca.bore_mm, barrel_mm: bbl, case_mm: ca.case_mm };
  const vRef = EM.velocityFromEnergy(load, base.E);
  return {
    v0_ms: VM.scaleByBarrelFor(ca, vRef, refT, uT, cv),
    P_bar: EM.predictPmax({ ...load, barrel_mm: ref }, vRef, base.np),
    mode: base.path, remplissage: fill,
  };
}
for (const k of Object.keys(CAL)) CAL[k].__cle = k;
for (const k of Object.keys(PWD)) PWD[k].__cle = k;

// --- tirage reproductible (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Une configuration par cartouche, en faisant tourner les poudres : on prend, pour chaque cartouche tirée,
// la candidate dont la poudre a le moins servi jusque-là (ex æquo départagés au hasard).
function tirer(cands, n, alea, dejaCart = new Set()) {
  const parCart = {};
  for (const c of cands) (parCart[c.cle] = parCart[c.cle] || []).push(c);
  const carts = Object.keys(parCart).sort().map((k) => [alea(), k]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  const usage = {}, pris = [];
  for (const k of carts) {
    if (pris.length >= n) break;
    if (dejaCart.has(k)) continue;
    const l = parCart[k].map((c) => [usage[c.poudre] || 0, alea(), c]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const c = l[0][2];
    usage[c.poudre] = (usage[c.poudre] || 0) + 1;
    pris.push(c); dejaCart.add(k);
  }
  return pris;
}

// --- longueurs de balles (base du site)
const BAL = JSON.parse(fs.readFileSync(BALLES)).bullets.filter((b) => b.length_in > 0);
const sansEntites = (s) => String(s).replace(/&(?:trade|reg|amp|#\d+);?/g, '').replace(/[®™;]/g, '').replace(/\s+/g, ' ').trim();
const nrm = (s) => sansEntites(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const MARQUES = { HDY: 'Hornady', NOS: 'Nosler', BAR: 'Barnes', SIE: 'Sierra', SPR: 'Speer', SFT: 'Swift', BER: 'Berger', WDLGH: 'Woodleigh', WIN: 'Winchester' };
// Abréviations du guide ADI → fragments du nom commercial (forme normalisée).
const ABR = {
  VMAX: ['vmax'], AMAX: ['amax'], ELD: ['eld'], ELDX: ['eldx'], ELDM: ['eldm', 'eldmatch'], SST: ['sst'], IB: ['interbond'],
  INTERLOCK: ['interlock'], IL: ['interlock'], GMX: ['gmx'], CX: ['cx'], BTHP: ['bthp', 'hpbt', 'boattailhollowpoint'], HPBT: ['hpbt', 'bthp', 'matchking'],
  MK: ['matchking'], TMK: ['tippedmatchking', 'tipped'], GK: ['gameking'], BT: ['ballistictip', 'boattail'], AB: ['accubond'], PT: ['partition'], PART: ['partition'],
  ABLR: ['accubondlongrange', 'longrange'], RDF: ['rdf'], ET: ['etip', 'expansiontip'], TSX: ['tsx'], TTSX: ['ttsx', 'tippedtripleshock'], LRX: ['lrx'], VG: ['varmintgrenade'],
  VLD: ['vld'], HYB: ['hybrid'], MFTX: ['monoflex'], FTX: ['ftx'], VAR: ['varmint'], LF: ['leadfree'], BTLF: ['leadfree'], SCIR: ['scirocco'], AF: ['aframe'], SP: ['softpoint', 'sp'], SPBT: ['spbt', 'spitzerboattail'], SBT: ['spitzerboattail', 'sbt'],
  FMJ: ['fmj'], HP: ['hollowpoint', 'hp'], RN: ['roundnose', 'rn'], FN: ['flatnose', 'fn'], GS: ['grandslam'], TNT: ['tnt'], DC: ['deepcurl'], MATCH: ['match'],
};
// « silvertip » : sans lui, le « tip » d'une Ballistic Tip trouvait la Ballistic Silvertip.
const QUALIFS = ['longrange', 'leadfree', 'tipped', 'silvertip'];
function longueurBalle(marque, cal_mm, m_gr, mots, formes = []) {
  // Une qualification que le guide ne mentionne pas désigne une autre balle : l'AccuBond 150 gr de la fiche
  // prenait la longueur de l'AccuBond Long Range, plus longue.
  const dit = mots.flatMap((w) => [nrm(w), ...(ABR[w.toUpperCase()] || [])]).join('|');
  const c = BAL.filter((b) => b.manufacturer === marque && Math.abs(b.caliber_in * IN - cal_mm) < 0.06 && Math.abs(b.weight_gr - m_gr) < 0.01
    && QUALIFS.every((q) => !nrm(b.name).includes(q) || dit.includes(q)));
  if (!c.length) return null;
  // Un mot d'une lettre hors du tableau des abréviations ne compte pas : « BAR X » (la balle X d'origine)
  // trouvait un « x » dans « Tipped Triple-Shock X ».
  const frag = (w) => ABR[w.toUpperCase()] || (nrm(w).length >= 2 ? [nrm(w)] : []);
  const compte = (b, l) => { const n = nrm(b.name); return l.reduce((s, w) => s + (frag(w).some((f) => n.includes(f)) ? 1 : 0), 0); };
  // Le nom d'abord ; la forme ne fait que départager (sur la forme seule, une AccuBond trouvait une Ballistic Tip).
  const sc = c.map((b) => [compte(b, mots), compte(b, formes), b]).filter((x) => x[0] > 0)
    .sort((x, y) => y[0] - x[0] || y[1] - x[1]).map((x) => [x[0] * 100 + x[1], x[2]]);
  // Au moins un mot du nom doit correspondre : sans cette exigence, une « NOS BT » de 180 gr prenait la
  // longueur de la seule balle Nosler de cette masse connue de la base, une AccuBond.
  if (!sc.length) return null;
  const tete = sc.filter((x) => x[0] === sc[0][0]).map((x) => x[1]);
  const L = tete.map((b) => b.length_in);
  // Plusieurs balles également plausibles : on garde la longueur si elles s'accordent à 2 % près.
  if (Math.max(...L) / Math.min(...L) > 1.02) return null;
  return { longueur_in: med(L), balles: tete.map((b) => sansEntites(`${b.manufacturer} ${b.name}`)), diam_in: tete[0].caliber_in };
}

// --- partie ADI
function candidatsADI() {
  const rows = JSON.parse(fs.readFileSync(d('adi.local.json'))).rows;
  const norm = (s) => String(s).toLowerCase().replace(/\(.*?\)/g, '').replace(/winchester/g, 'win').replace(/remington/g, 'rem')
    .replace(/magnum/g, 'mag').replace(/springfield/g, 'spring').replace(/[^a-z0-9]/g, '');
  const calIdx = {};
  for (const k of Object.keys(CAL)) { calIdx[norm(k)] = k; for (const a of (CAL[k].aliases || [])) calIdx[norm(a)] = k; }
  const stripV = (s) => String(s).replace(/\s*\+p\+?\b/ig, '').replace(/\bfor ar-?15.*/i, '');
  const matchCal = (n) => calIdx[norm(n)] || calIdx[norm(stripV(n))] || null;
  const pwdIdx = {}; for (const k of Object.keys(PWD)) pwdIdx[norm(k)] = k;
  for (const k of Object.keys(PWD)) { const nm = norm(PWD[k].name || ''); if (nm && !pwdIdx[nm]) pwdIdx[nm] = k; }
  const cleL = (ck, pk, m, c, v) => [ck, pk, m, Math.round(c * 10) / 10, Math.round(v)].join('|');
  const copies = new Set();
  for (const f of ['hodgdon', 'western']) for (const r of JSON.parse(fs.readFileSync(d(f + '.local.json'))).rows) copies.add(cleL(matchCal(r.cartridge), pwdIdx[norm(r.powder || '')], r.bullet_gr, r.charge_gr, r.v0_fps));
  const out = [];
  for (const r of rows) {
    const ck = matchCal(r.cartridge), ca = CAL[ck], pw = PWD[r.powder];
    if (!ca || ca.type === 'handgun' || !pw || !(pw.pcd > 0)) continue;
    if (!(r.Pmax_psi > 0 && r.barrel_mm > ca.case_mm && r.coal_in > 0 && r.charge_gr > 0 && r.v0_fps > 0)) continue;
    if (r.bore_mm && Math.abs(r.bore_mm - ca.bore_mm) > 0.3) continue;
    if (copies.has(cleL(ck, r.powder, r.bullet_gr, r.charge_gr, r.v0_fps))) continue;
    const mots = String(r.bullet_desc || '').toUpperCase().replace(/-/g, '').split(/\s+/).filter(Boolean);
    const marque = MARQUES[mots[0]];
    if (!marque) continue;                              // plomb (CAST, LEAD…) et marques absentes de la base
    const lb = longueurBalle(marque, ca.bore_mm, r.bullet_gr, mots.slice(1));
    if (!lb) continue;
    const a = ANC[ck + '|' + r.powder];
    out.push({ partie: 'ADI', strate: a ? 'ancré' : 'à froid', cle: ck, poudre: r.powder, poudre_libelle: r.powder_label,
      canon_mm: r.barrel_mm, coal_in: r.coal_in, balle_gr: r.bullet_gr, balle_guide: r.bullet_desc, balle: lb,
      charges: [{ charge_gr: r.charge_gr, v_fps: r.v0_fps, P_psi: r.Pmax_psi }] });
  }
  return out;
}

// --- partie Nosler : balles de la fiche lues dans le PDF (nom, masse, longueur hors tout d'essai)
function ballesFiche(fiche) {
  const f = path.join(GUIDES_NOSLER, fiche);
  if (!fs.existsSync(f)) return [];
  const t = execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' });
  const out = [];
  let dedans = false;
  for (const l of t.split('\n')) {
    if (/TESTED O\.A\.C\.L\./.test(l)) { dedans = true; continue; }
    if (/CASE TYPE/.test(l)) break;
    if (!dedans) continue;
    const m = l.match(/^\s*(\S.*?)\s{2,}([A-Z][A-Za-z-]{0,6})\s+(\d+(?:\.\d+)?)\s*gr\.?\s*(.*?)\s{2,}(\d\.\d{3})"/);
    if (m) out.push({ produit: m[1].replace(/[®™]/g, '').trim(), code: m[2], masse: +m[3], forme: m[4].trim(), oacl_in: +m[5] });
  }
  return out;
}
function candidatsNosler() {
  const N = JSON.parse(fs.readFileSync(d('nosler.local.json')));
  const parFiche = {};
  for (const r of N.rows) (parFiche[r.fiche + '|' + r.poudre] = parFiche[r.fiche + '|' + r.poudre] || []).push(r);
  const out = [];
  for (const fi of N.fiches) {
    const ca = CAL[fi.cle];
    if (!ca || ca.type === 'handgun' || fi.balle_plage || !(fi.canon_mm > ca.case_mm)) continue;
    const bs = ballesFiche(fi.fiche).filter((b) => Math.abs(b.masse - fi.balle_gr) < 0.01);
    let balle = null, oacl = null;
    for (const b of bs) {                               // première balle de la fiche dont on connaît la longueur
      // Mots du nom commercial (« Ballistic Tip Varmint » : ballistic, tip, varmint) et code de la fiche (BTV).
      // La forme (Spitzer, RN, HPBT…) départage les balles d'un même nom.
      const mots = [...sansEntites(b.produit).split(/[^A-Za-z0-9]+/).filter((w) => w.length >= 3 && w.toLowerCase() !== 'ct'), b.code];
      const lb = longueurBalle('Nosler', ca.bore_mm, b.masse, mots, b.forme.split(/\s+/).filter(Boolean));
      if (lb) { balle = { ...lb, nosler: `Nosler ${b.produit} ${b.code} ${b.masse} gr ${b.forme}`.trim() }; oacl = b.oacl_in; break; }
    }
    if (!balle) continue;
    for (const [k, rs] of Object.entries(parFiche)) {
      if (!k.startsWith(fi.fiche + '|')) continue;
      const pw = PWD[rs[0].poudre];
      if (!pw || !(pw.pcd > 0) || rs.length !== 3) continue;
      const ch = rs.map((r) => r.charge_gr).sort((x, y) => x - y);
      if (Math.abs((ch[2] - ch[1]) - (ch[1] - ch[0])) > 0.05) continue;   // pas régulier : une seule échelle GRT
      const a = ANC[fi.cle + '|' + rs[0].poudre];
      if (a && a.nosler) continue;                      // ancre comblée par Nosler : elle contient ces lignes
      out.push({ partie: 'Nosler', strate: a && a.eeff ? 'ancré' : 'à froid', cle: fi.cle, poudre: rs[0].poudre, poudre_libelle: rs[0].poudre_nosler,
        canon_mm: fi.canon_mm, coal_in: oacl, balle_gr: fi.balle_gr, balle_guide: balle.nosler, balle, fiche: fi.fiche,
        charges: rs.map((r) => ({ charge_gr: r.charge_gr, v_fps: r.fps, max: r.max })).sort((x, y) => x.charge_gr - y.charge_gr) });
    }
  }
  return out;
}

const fr = (x, n) => (x == null || !isFinite(x)) ? '' : x.toFixed(n).replace('.', ',');
const csv = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

function preparer() {
  const alea = rng(GRAINE);
  const adi = candidatsADI(), nos = candidatsNosler();
  const st = (l, p, s) => l.filter((c) => c.strate === s).length;
  console.log(`candidates : ADI ${adi.length} (ancrées ${st(adi, 'ADI', 'ancré')}), Nosler ${nos.length} (ancrées ${st(nos, 'N', 'ancré')})`);
  const vusA = new Set(), vusN = new Set();
  const choix = [
    ...tirer(adi.filter((c) => c.strate === 'ancré'), N_ADI_ANCRE, alea, vusA),
    ...tirer(adi.filter((c) => c.strate === 'à froid'), N_ADI_FROID, alea, vusA),
    ...tirer(nos.filter((c) => c.strate === 'ancré'), N_NOS_ANCRE, alea, vusN),
    ...tirer(nos.filter((c) => c.strate === 'à froid'), N_NOS_FROID, alea, vusN),
  ];
  const git = (a) => execFileSync('git', ['-C', ICI, ...a], { encoding: 'utf8' }).trim();
  const lignes = [], feuille = [];
  feuille.push(['id', 'partie', 'configuration', 'calibre', 'canon_mm', 'canon_in', 'balle', 'masse_gr', 'diametre_in',
    'longueur_balle_mm', 'longueur_balle_in', 'longueur_balle_source', 'COAL_mm', 'COAL_in', 'poudre', 'charge_gr', 'echelle_GRT',
    'fichier_poudre_GRT', 'volume_etui_GRT_cm3', 'v0_GRT_ms', 'Pmax_GRT_bar', 'remarque'].join(';'));
  choix.forEach((c, i) => {
    const conf = (c.partie === 'ADI' ? 'A' : 'N') + String(i + 1).padStart(2, '0');
    const ca = CAL[c.cle], pw = PWD[c.poudre];
    const ch = c.charges;
    const pas = ch.length > 1 ? ch[1].charge_gr - ch[0].charge_gr : null;
    ch.forEach((x, j) => {
      const id = ch.length > 1 ? `${conf}-${j + 1}` : conf;
      const p = predire(ca, pw, c.balle_gr, x.charge_gr, c.canon_mm);
      lignes.push({ id, configuration: conf, partie: c.partie, strate: c.strate, cle: c.cle, poudre: c.poudre, balle_gr: c.balle_gr,
        canon_mm: c.canon_mm, charge_gr: x.charge_gr, max: x.max ?? null, fiche: c.fiche || null,
        publie: { v_fps: x.v_fps, P_psi: x.P_psi ?? null },
        estimateur: { v0_ms: +p.v0_ms.toFixed(1), P_bar: +p.P_bar.toFixed(0), mode: p.mode, remplissage: p.remplissage && +p.remplissage.toFixed(3) } });
      feuille.push([id, c.partie, conf, c.cle, fr(c.canon_mm, 1), fr(c.canon_mm / IN, 2),
        c.partie === 'Nosler' ? c.balle_guide : `${c.balle.balles[0]} (guide ADI : ${c.balle_guide})`, fr(c.balle_gr, 1), fr(c.balle.diam_in, 3),
        fr(c.balle.longueur_in * IN, 2), fr(c.balle.longueur_in, 3), 'base du site : ' + c.balle.balles.join(' / '), fr(c.coal_in * IN, 2), fr(c.coal_in, 3),
        `${c.poudre} (guide : ${c.poudre_libelle})`, fr(x.charge_gr, 1),
        j === 0 && pas ? `départ ${fr(ch[0].charge_gr, 1)} gr, pas ${fr(pas, 1)} gr, ${ch.length} charges` : '',
        '', '', '', '', ''].map(csv).join(';'));
    });
  });
  // Version du modèle : seuls comptent les fichiers qui font la prédiction.
  const sale = git(['status', '--porcelain', '--', 'energy_model.js', 'velocity_model.js', 'index.php', 'data/anchors.json',
    'data/model_coefficients.json', 'data/calibers.json', 'data/powders.json']);
  fs.writeFileSync(CLE, JSON.stringify({
    _doc: 'Banc estimateur / GRT (scripts/banc_grt.js) : valeurs publiées et prédictions de l\'estimateur FIGÉES à la préparation. Données fabricant : LOCAL, gitignoré, non redistribué.',
    prepare_le: new Date().toISOString(), version_estimateur: git(['rev-parse', '--short', 'HEAD']) + (sale ? ' (+ modifications non commitées)' : ''),
    graine: GRAINE, lignes,
  }, null, 1) + '\n');
  fs.writeFileSync(FEUILLE, '﻿' + feuille.join('\n') + '\n');
  const nb = (p, s) => lignes.filter((l) => l.partie === p && (!s || l.strate === s));
  console.log(`tirées : ${choix.length} configurations, ${lignes.length} charges`);
  console.log(`  ADI    : ${nb('ADI', 'ancré').length} ancrées + ${nb('ADI', 'à froid').length} à froid (vitesse et pression)`);
  console.log(`  Nosler : ${nb('Nosler', 'ancré').length} ancrées + ${nb('Nosler', 'à froid').length} à froid (vitesse)`);
  console.log(`  ${new Set(lignes.map((l) => l.cle)).size} cartouches, ${new Set(lignes.map((l) => l.poudre)).size} poudres`);
  console.log(`→ ${path.relative(process.cwd(), CLE)}\n→ ${path.relative(process.cwd(), FEUILLE)}`);
}

// --- comparaison : feuille remplie (séparateur ; ou , ou tabulation, virgule ou point décimal)
function lireFeuille(f) {
  const t = fs.readFileSync(f, 'utf8').replace(/^﻿/, '');
  const sep = [';', '\t', ','].find((s) => t.split('\n')[0].includes(s));
  const lig = [];
  for (const l of t.split(/\r?\n/)) {
    if (!l.trim()) continue;
    const c = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === sep) { c.push(cur); cur = ''; } else cur += ch;
    }
    c.push(cur); lig.push(c);
  }
  const tete = lig.shift();
  return lig.map((c) => Object.fromEntries(tete.map((h, i) => [h.trim(), (c[i] || '').trim()])));
}
const nombre = (s) => { const x = parseFloat(String(s).replace(/\s/g, '').replace(',', '.')); return isFinite(x) ? x : null; };
// Unités devinées à la grandeur, pour TOUTE la colonne d'après sa médiane : une ligne subsonique en fps (1 000)
// ressemble à des m/s, une colonne de carabines (médiane 2 000-4 600 fps contre 600-1 400 m/s) ne s'y trompe
// pas. Même chose pour la pression (1 000-6 000 bar contre 15 000-80 000 psi). --fps, --psi forcent l'unité.
function unites(lignes) {
  const col = (k) => lignes.map((r) => nombre(r[k])).filter((x) => x != null);
  const v = col('v0_GRT_ms'), p = col('Pmax_GRT_bar');
  const fps = process.argv.includes('--fps') || (v.length && med(v) > 1600);
  const psi = process.argv.includes('--psi') || (p.length && med(p) > 9000);
  return { v: fps ? FPS2MS : 1, p: psi ? PSI2BAR : 1, txt: `${fps ? 'fps' : 'm/s'}, ${psi ? 'psi' : 'bar'}` };
}

function comparer(f) {
  const K = JSON.parse(fs.readFileSync(CLE));
  const F = lireFeuille(f), U = unites(F);
  const S = Object.fromEntries(F.map((r) => [r.id, r]));
  console.log(`Banc estimateur / GRT — préparé le ${K.prepare_le.slice(0, 10)}, estimateur ${K.version_estimateur} ; unités lues : ${U.txt}`);
  const res = [];
  for (const l of K.lignes) {
    const s = S[l.id]; if (!s) continue;
    const n = (k, u) => { const x = nombre(s[k]); return x == null ? null : x * u; };
    const vG = n('v0_GRT_ms', U.v), pG = n('Pmax_GRT_bar', U.p);
    if (vG == null && pG == null) continue;
    const vP = l.publie.v_fps * FPS2MS, pP = l.publie.P_psi ? l.publie.P_psi * PSI2BAR : null;
    res.push({ ...l, eVg: vG != null ? (vG / vP - 1) * 100 : null, eVe: (l.estimateur.v0_ms / vP - 1) * 100,
      ePg: pP && pG != null ? (pG / pP - 1) * 100 : null, ePe: pP ? (l.estimateur.P_bar / pP - 1) * 100 : null });
  }
  console.log(`${res.length} charges remplies sur ${K.lignes.length}\n`);
  const bloc = (titre, sel, cle) => {
    const r = res.filter(sel).filter((x) => x['e' + cle + 'g'] != null && x['e' + cle + 'e'] != null);
    if (!r.length) return;
    const g = r.map((x) => x['e' + cle + 'g']), e = r.map((x) => x['e' + cle + 'e']);
    const sous = (a) => a.filter((x) => x < -15).length;
    const mieux = r.filter((x) => Math.abs(x['e' + cle + 'g']) < Math.abs(x['e' + cle + 'e'])).length;
    console.log(`${titre} (n=${r.length})`);
    console.log(`   GRT        : biais ${mean(g).toFixed(1).padStart(5)} %  RMS ${rms(g).toFixed(1).padStart(5)} %  médiane |écart| ${med(g.map(Math.abs)).toFixed(1)} %` + (cle === 'P' ? `  sous-estimée de plus de 15 % : ${sous(g)}` : ''));
    console.log(`   estimateur : biais ${mean(e).toFixed(1).padStart(5)} %  RMS ${rms(e).toFixed(1).padStart(5)} %  médiane |écart| ${med(e.map(Math.abs)).toFixed(1)} %` + (cle === 'P' ? `  sous-estimée de plus de 15 % : ${sous(e)}` : ''));
    console.log(`   GRT plus proche de la valeur publiée : ${mieux} sur ${r.length}`);
  };
  for (const [p, s] of [['ADI', 'ancré'], ['ADI', 'à froid'], ['Nosler', 'ancré'], ['Nosler', 'à froid']]) {
    bloc(`Vitesse — ${p}, ${s}`, (x) => x.partie === p && x.strate === s, 'V');
    if (p === 'ADI') bloc(`Pression — ${p}, ${s}`, (x) => x.partie === p && x.strate === s, 'P');
  }
  if (process.argv.includes('--detail')) {
    console.log('\nid        cartouche | poudre                         charge   v GRT   v est.   P GRT   P est.  (écarts en %)');
    for (const x of res) console.log(`${x.id.padEnd(8)}  ${(x.cle + ' | ' + x.poudre).slice(0, 40).padEnd(40)} ${String(x.charge_gr).padStart(5)}  ${fr(x.eVg, 1).padStart(6)}  ${fr(x.eVe, 1).padStart(6)}  ${fr(x.ePg, 1).padStart(6)}  ${fr(x.ePe, 1).padStart(6)}`);
  }
}

const a = process.argv.slice(2);
if (a.includes('--preparer')) preparer();
else if (a.includes('--comparer')) comparer(a.find((x) => !x.startsWith('--')) || FEUILLE);
else { console.error('Usage : node scripts/banc_grt.js --preparer | --comparer [feuille.csv] [--detail]'); process.exit(2); }
