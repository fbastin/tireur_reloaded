/**
 * parse_vihtavuori.js — extract load records from the Vihtavuori Reloading Guide PDF
 * (column-aware, via `pdftotext -bbox`). Each physical sheet holds TWO guide pages side
 * by side (split at x≈SPLIT). VELOCITY per load; the MAX load is at the CIP/SAAMI limit,
 * so each combo yields a velocity point and (with the test barrel) a max-load pressure
 * point. Output is LOCAL/gitignored — raw tables are not redistributed.
 *
 *   pdftotext -bbox guides/Vihtavuori_..._web.pdf /tmp/vv_bbox.html
 *   node scripts/parse_vihtavuori.js /tmp/vv_bbox.html [--cart "308 Winchester"]
 *
 * A cartridge header line carries "<Name> ... Test barrel: NNN mm"; "<Name> cont."
 * continues it (barrel from the cartridge→barrel map built in pass 1). A new cartridge
 * can start mid-column, so the current cartridge is tracked line-by-line by y.
 * A data row = <powder> <start g,grs,m/s,fps> <max g,grs,m/s,fps>; bullet weight (grs)
 * appears only on the first row of a bullet block and is carried down.
 */
const fs = require('fs');
const SPLIT = 500;
const file = process.argv[2] || '/tmp/vv_bbox.html';
const cartFilter = process.argv.includes('--cart') ? process.argv[process.argv.indexOf('--cart') + 1] : null;

const sheets = fs.readFileSync(file, 'utf8').split(/<page /).slice(1);
const isPowder = (t) => /^(N\d{2,3}[A-Z]?|\d{1,2}N\d{2})$/.test(t);
const num = (t) => { const c = t.replace(/[CFA]+$/i, '').replace(',', '.'); return /^\d+(\.\d+)?$/.test(c) ? +c : null; };
// cartridge name = leading token run before "Test barrel" / "cont." / "Primers". La virgule décimale
// (« 6,5 mm Grendel ») manquait jusqu'au 2026-10-13 : le titre n'était pas lu, et les lignes allaient à la
// cartouche précédente de la demi-page (.25-06 <- 6,5 Grendel, .300 Savage <- 7,62 x 53R, 300 RUM <- 7,62 x 39,
// 338 Lapua <- 9,3 x 62, 7 mm GJW <- 7,62 x 25), ou étaient perdues (1 088 lignes, dont 338 de 6,5 Creedmoor).
// « ; » : le texte extrait écrit « S&amp;W » ; sans lui, .460 et .500 S&W Magnum n'étaient pas lus (2026-10-13).
const CART_RE = /^\s*\.?([0-9][\w.,&;'’ x/()-]*?)\s+(?:cont\.?|Test barrel|Primers|Cases:)/;

// --- build per-half "lines" (array of {y, toks:[{x,t}]}) for every guide-page-half ---
function halves() {
  const out = [];
  sheets.forEach((s) => {
    const words = [...s.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)]
      .map((m) => ({ x: +m[1], y: +m[2], t: m[5] }));
    for (const side of ['L', 'R']) {
      const col = words.filter((w) => side === 'L' ? w.x < SPLIT : w.x >= SPLIT).sort((a, b) => a.y - b.y || a.x - b.x);
      if (!col.length) continue;
      const lines = []; let cur = [];
      for (const w of col) { if (cur.length && Math.abs(w.y - cur[0].y) > 4) { lines.push({ y: cur[0].y, toks: cur }); cur = []; } cur.push(w); }
      if (cur.length) lines.push({ y: cur[0].y, toks: cur });
      out.push(lines);
    }
  });
  return out;
}
const ALL = halves();

// Stateful top-to-bottom per half: cartridge updates on header lines, barrel on
// "Test barrel:" lines (a cartridge may have several barrel sub-sections), bullet
// carried until the next bullet block or cartridge change.
const norm = (s) => s.trim().replace(/\s+cont\.?$/i, '').replace(/\s+/g, ' ');
const records = [];
// Dernier canon vu par cartouche : une demi-page de suite (« cont. ») le reprend. Avec le PREMIER canon de
// la cartouche (repli ci-dessous, seul jusqu'au 2026-10-13), les tableaux à plusieurs sections de canon
// (6,5 x 55 SE / SKAN : 670, 700 puis 740 mm) donnaient à la fin d'une section le canon de la première.
const dernierCanon = {};
// Titre seul sur sa ligne, « Primers: » quelques points plus bas (« 8 x 68 S », « .357 Magnum », « .44
// Remington Magnum » : au-delà des 4 points qui regroupent une ligne) : il n'était pas lu, et les lignes du
// tableau restaient à la cartouche précédente (8 x 68 S sous la 8 x 57 IRS, 2026-10-13).
// Balle en plomb nu (« S N S Cast RNFP », « LSWC/HP », « LRN », « Sako LWC ») : marquée `cast`, écartée des
// ancres et des fenêtres de départ comme celles des autres guides (2026-10-13). Gardées : cuivrées (« Copper
// Plated », CamPro FCP, Berry's, X-Treme), chemisées (« TMJ-SWC »), H&N sans mention.
const PLOMB = /\bCast\b|\bL(SWC|RN|FN|FP|WC|TC)\b|^SWC\/HP$/i;
const CUIVRE = /plat|TMJ|\bCP\b|copper/i;
const NOM_SEUL = /^\s*\.?([0-9][\w.,&;'’ x/()-]*?)\s*$/;
// Un en-tête « X cont. » ne peut continuer que le tableau en cours à la fin de la demi-page précédente. S'il
// en nomme un autre, c'est l'en-tête qui se trompe : un seul cas dans le guide 2026, page 72, « .45 Auto /
// .45 ACP cont. » au-dessus de lignes de .460 S&W Magnum (longueur hors-tout 2,146 à 2,272 pouces ; le
// titre .460 est au bas de la demi-page précédente). Le tableau en cours l'emporte.
// Un bloc de balle coupé en bas de demi-page continue sous l'en-tête « X cont. » de la suivante, SANS la masse
// de balle, qui n'est imprimée que sur la première ligne du bloc. La balle de la fin de la demi-page précédente
// est donc reprise quand l'en-tête continue la même cartouche. Sans cela, ces lignes n'avaient pas de masse et
// étaient rejetées : 215 lignes du guide 2026, sur une cinquantaine de cartouches (relevé contre la base en ligne
// de Vihtavuori, 2026-10-15 ; avec les deux corrections plus bas, 278 lignes retrouvées, aucune perdue).
let derniere = null, derniereBalle = null;
for (const lines of ALL) {
  let cart = null, barrel = null, bulletGrs = null, bulletDesc = '', premierEnTete = true;
  const texte = (j) => lines[j].toks.slice().sort((a, b) => a.x - b.x).map((w) => w.t).join(' ');
  for (const [li, ln] of lines.entries()) {
    // mots de gauche à droite : un titre et « Test barrel » sur la même ligne se lisaient dans l'ordre
    // vertical, « Test barrel » en tête, et le titre n'était plus reconnu (6,5 x 55 SE /, 2026-10-13)
    const s = ln.toks.slice().sort((a, b) => a.x - b.x).map((w) => w.t).join(' ');
    let cm = s.match(CART_RE);
    if (!cm && s.length < 45 && !ln.toks.some((w) => isPowder(w.t)) && NOM_SEUL.test(s)
        && [li + 1, li + 2].some((j) => j < lines.length && /^Primers:/.test(texte(j)))) cm = s.match(NOM_SEUL);
    if (cm) {
      let nc = norm(cm[1].replace(/&amp;/g, '&'));
      if (premierEnTete && derniere && /\bcont\b/i.test(s) && nc !== derniere) nc = derniere;
      const suite = premierEnTete && derniere && /\bcont\b/i.test(s) && nc === derniere;
      premierEnTete = false;
      // Titre coupé (« .300 Remington » + « Ultra Magnum », « 6,5 x 55 SE / » + « 6,5 x 55 SKAN ») : sa fin
      // vient sous la ligne « Primers », avant « Cases: ». Toute ligne sans deux-points entre les deux est
      // recollée (cinq titres du guide 2026 : 300 RUM, .30-378 Weatherby, 6,5 x 55 SE / SKAN, .375
      // CheyTac, 9 mm Browning court / .380 Auto).
      if (/Test barrel/.test(s)) {
        for (let j = li + 1; j < Math.min(lines.length, li + 5); j++) {
          const sj = lines[j].toks.slice().sort((a, b) => a.x - b.x).map((w) => w.t).join(' ');
          if (/Cases:/.test(sj)) break;
          if (!sj.includes(':')) nc = norm(nc + ' ' + sj);
        }
      }
      if (nc !== cart) { cart = nc; bulletGrs = null; if (barrel == null && /\bcont\b/i.test(s)) barrel = dernierCanon[cart] ?? null; }
      if (suite && derniereBalle && derniereBalle.cart === cart) ({ bulletGrs, bulletDesc } = derniereBalle);
    }
    // « Test barrel: Sauer STR 200 » puis « Barrel length: 670 mm » (6,5 x 55 SE / SKAN, par section) : les
    // deux formes donnent le canon.
    const bm = s.match(/Test barrel:\s*(\d+)\s*mm/) || s.match(/Barrel length:\s*(\d+)\s*mm/); if (bm) barrel = +bm[1];
    const toks = ln.toks.slice().sort((a, b) => a.x - b.x);
    // La DERNIÈRE poudre de la ligne : le code produit des Lapua Naturalis (« N558 », « N563 ») a la forme d'une
    // poudre Vihtavuori et se lisait comme telle, la ligne de travers, rejetée (28 lignes, 2026-10-15). Après la
    // colonne des poudres ne viennent que des nombres.
    const pIdx = toks.findLastIndex((w) => isPowder(w.t));
    if (pIdx < 0 || !cart) continue;
    const after = toks.slice(pIdx + 1).map((w) => num(w.t)).filter((v) => v != null);
    if (after.length < 8) continue;
    const before = toks.slice(0, pIdx).map((w) => num(w.t)).filter((v) => v != null);
    // Bornes élargies le 2026-10-15 (balle 800 gr, charge max de 1 à 300 gr, vitesse de départ dès 100 m/s) : la
    // .50 Browning (balles de 647 à 750 gr, charges jusqu'à 256 gr) était rejetée entière, 31 lignes, et les plus
    // petites charges de .32 S&W Long (1,7 gr) et de .38 Special (125 m/s au départ) aussi.
    if (before.length >= 2 && before[1] > 20 && before[1] < 800) {
      bulletGrs = before[1];
      // fabricant et type de balle : les mots entre la masse en grains et la longueur hors-tout
      const iG = toks.findIndex((w) => num(w.t) === before[1]);
      bulletDesc = toks.slice(iG + 1, pIdx).filter((w) => num(w.t) == null).map((w) => w.t).join(' ').replace(/&amp;/g, '&');
    }
    const [, sgr, sms, , , mgr, mms] = after;
    // plausibilité (rejette lignes mal alignées : notes, n° de page, COL lus comme charge…)
    const ok = bulletGrs >= 20 && bulletGrs <= 800 && mgr >= 1 && mgr <= 300 && sgr >= 1 && sgr <= mgr + 0.5
      && mms >= 200 && mms <= 1400 && sms >= 100 && sms <= mms + 5;
    if (!ok) continue;
    if (barrel != null) dernierCanon[cart] = barrel;
    records.push({ cartridge: cart, barrel_mm: barrel, bullet_gr: bulletGrs,
      powder: toks[pIdx].t, start_gr: sgr, start_ms: sms, max_gr: mgr, max_ms: mms, bullet_desc: bulletDesc,
      cast: PLOMB.test(bulletDesc) && !CUIVRE.test(bulletDesc) });
  }
  if (cart) { derniere = cart; derniereBalle = bulletGrs != null ? { cart, bulletGrs, bulletDesc } : null; }
}

// fallback : combler barrel null par le 1er canon vu pour cette cartouche (cont. pages)
const firstBarrel = {};
for (const r of records) if (r.barrel_mm && !firstBarrel[r.cartridge]) firstBarrel[r.cartridge] = r.barrel_mm;
for (const r of records) if (!r.barrel_mm) r.barrel_mm = firstBarrel[r.cartridge] || null;

const sel = cartFilter ? records.filter((r) => r.cartridge.includes(cartFilter)) : records;
if (cartFilter) {
  console.log(`${sel.length} rows for "${cartFilter}" (barrel ${sel[0] && sel[0].barrel_mm} mm):`);
  sel.forEach((r) => console.log(`  ${r.bullet_gr}gr ${r.powder}: start ${r.start_gr}gr/${r.start_ms} · max ${r.max_gr}gr/${r.max_ms}`));
} else {
  fs.writeFileSync(__dirname + '/../data/vihtavuori.local.json', JSON.stringify({ _src: 'Vihtavuori Reloading Guide 2026 (parsed; derived use only, not redistributed)', rows: records }, null, 1));
  const carts = new Set(records.map((r) => r.cartridge)), pwds = new Set(records.map((r) => r.powder));
  const noBarrel = records.filter((r) => !r.barrel_mm).length;
  console.log(`extracted ${records.length} rows | ${carts.size} cartridges | ${pwds.size} powders | ${noBarrel} without barrel`);
  console.log('-> data/vihtavuori.local.json');
}
