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
// cartridge name = leading token run before "Test barrel" / "cont." / "Primers"
const CART_RE = /^\s*\.?([0-9][\w.&'’ x/()-]*?)\s+(?:cont\.?|Test barrel|Primers|Cases:)/;

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
for (const lines of ALL) {
  let cart = null, barrel = null, bulletGrs = null;
  for (const ln of lines) {
    const s = ln.toks.map((w) => w.t).join(' ');
    const cm = s.match(CART_RE); if (cm) { const nc = norm(cm[1]); if (nc !== cart) { cart = nc; bulletGrs = null; } }
    const bm = s.match(/Test barrel:\s*(\d+)\s*mm/); if (bm) barrel = +bm[1];
    const toks = ln.toks.slice().sort((a, b) => a.x - b.x);
    const pIdx = toks.findIndex((w) => isPowder(w.t));
    if (pIdx < 0 || !cart) continue;
    const after = toks.slice(pIdx + 1).map((w) => num(w.t)).filter((v) => v != null);
    if (after.length < 8) continue;
    const before = toks.slice(0, pIdx).map((w) => num(w.t)).filter((v) => v != null);
    if (before.length >= 2 && before[1] > 20 && before[1] < 600) bulletGrs = before[1];
    const [, sgr, sms, , , mgr, mms] = after;
    // plausibilité (rejette lignes mal alignées : notes, n° de page, COL lus comme charge…)
    const ok = bulletGrs >= 20 && bulletGrs <= 600 && mgr >= 2 && mgr <= 160 && sgr >= 1 && sgr <= mgr + 0.5
      && mms >= 200 && mms <= 1400 && sms >= 150 && sms <= mms + 5;
    if (!ok) continue;
    records.push({ cartridge: cart, barrel_mm: barrel, bullet_gr: bulletGrs,
      powder: toks[pIdx].t, start_gr: sgr, start_ms: sms, max_gr: mgr, max_ms: mms });
  }
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
