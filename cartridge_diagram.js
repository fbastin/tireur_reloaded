/**
 * cartridge_diagram.js — SVG schematic of a cartridge for the estimator.
 *   cartridgeDiagram(cal, dim, targetW) -> SVG string.
 *     cal = calibers.json entry (bore_mm, case_mm, case_vol_cm3, type).
 *     dim = cartridge_dims.json entry {rim,base,shoulder,neck,angle} or null.
 * If real CIP dims are present → dimensioned drawing (diameters/angle/length, real).
 * Else → stylized fallback (length + bullet exact; body class-estimated, flagged).
 */
function cartridgeDiagram(cal, dim, targetW) {
  if (!cal || !(cal.case_mm > 0 && cal.bore_mm > 0)) return '';
  const L = cal.case_mm, bore = cal.bore_mm, exact = !!(dim && dim.base);
  const rim = exact ? dim.rim : null;
  const neck = exact ? dim.neck : bore + 0.5;
  const bn = exact ? !!(dim.shoulder) : (cal.type !== 'handgun');
  let base;
  if (exact) base = dim.base;
  else { // repli : corps estimé par classe (cf. validation ~±1 mm)
    const dEq = Math.sqrt(4 * cal.case_vol_cm3 * 1000 / (Math.PI * L));
    const STR = new Set(['handgun']);
    const ratio = STR.has(cal.type) ? 1.06 : Math.min(1.75, Math.max(1.30, dEq / bore * 1.45));
    base = bn ? bore * ratio : Math.max(bore + 0.5, dEq);
  }
  const shoulder = exact && bn ? dim.shoulder : base;
  const ang = exact && dim.angle ? dim.angle : 20;          // défaut pour la géométrie si inconnu
  const neckLen = Math.min(L * 0.32, bore * 1.15);
  let bodyEnd = L, shEnd = L;
  if (bn) { const shAx = Math.max(0.5, (shoulder - neck) / 2 / Math.tan(ang * Math.PI / 180)); shEnd = L - neckLen; bodyEnd = Math.max(2, shEnd - shAx); }
  const bulletLen = bore * 1.7, totalL = L + bulletLen, maxD = Math.max(rim || base, base, bore);
  const S = Math.min(4.6, ((targetW || 300) - 60) / totalL);
  const ox = 44, rows0 = 0;
  // labels (mm) — seulement les cotes RÉELLES
  const labs = [];
  if (exact) {
    labs.push({ x: 1.6, d: base, t: '⌀' + base });
    if (rim - base > 0.6) labs.push({ x: 0, d: rim, t: 'bourr.⌀' + rim });
    if (bn) labs.push({ x: bodyEnd + (shEnd - bodyEnd) / 2, d: shoulder, t: '⌀' + shoulder + (dim.angle ? ' ·' + dim.angle + '°' : '') });
    labs.push({ x: L, d: neck, t: '⌀' + neck });
  }
  labs.push({ x: L + bulletLen * 0.45, d: bore, t: '⌀' + bore.toFixed(2) });
  labs.sort((a, b) => a.x - b.x);
  const ROWH = 13, CW = 5.6, re = [];
  labs.forEach(l => { const xpx = ox + l.x * S, w = l.t.length * CW, lo = xpx - w / 2; let r = 0; while (re[r] != null && lo < re[r]) r++; re[r] = xpx + w / 2; l.row = r; });
  const nRows = Math.max(1, re.length), topPad = 6 + nRows * ROWH, botPad = 26;
  const H = maxD * S + 16 + topPad + botPad, midY = topPad + 8 + (maxD * S + 16) / 2;
  const X = mm => ox + mm * S, T = d => midY - d * S / 2, Bm = d => midY + d * S / 2;
  const up = [[X(0), T(rim || base)], [X(1.6), T(rim || base)], [X(1.6), T(base)]];
  if (bn) up.push([X(bodyEnd), T(shoulder)], [X(shEnd), T(neck)], [X(L), T(neck)]); else up.push([X(L), T(neck)]);
  const dn = up.map(p => [p[0], 2 * midY - p[1]]).reverse();
  const path = 'M' + up.concat([[X(L), Bm(neck)]]).concat(dn).map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L') + 'Z';
  const bx = X(L - 2), tx = X(totalL);
  const bullet = `M${bx},${T(bore)} Q${(bx + tx) / 2},${T(bore)} ${tx},${midY} Q${(bx + tx) / 2},${Bm(bore)} ${bx},${Bm(bore)} Z`;
  const G = 'stroke="#888" stroke-width="0.5"', FT = 'font-family="sans-serif" font-size="10" fill="#444"';
  const d = [];
  labs.forEach(l => { const x = X(l.x), ly = topPad - 2 - l.row * ROWH; d.push(`<line x1="${x}" y1="${T(l.d)}" x2="${x}" y2="${ly + 2}" ${G} stroke-dasharray="2,2"/><text x="${x}" y="${ly}" text-anchor="middle" ${FT}>${l.t}</text>`); });
  const yL = Bm(maxD) + 16;
  d.push(`<line x1="${X(0)}" y1="${Bm(rim || base) + 3}" x2="${X(0)}" y2="${yL + 4}" ${G}/><line x1="${X(L)}" y1="${T(neck)}" x2="${X(L)}" y2="${yL + 4}" ${G}/>`);
  d.push(`<line x1="${X(0)}" y1="${yL}" x2="${X(L)}" y2="${yL}" ${G}/><path d="M${X(0)},${yL} l5,-2.5 v5 z" fill="#888"/><path d="M${X(L)},${yL} l-5,-2.5 v5 z" fill="#888"/>`);
  d.push(`<text x="${X(L / 2)}" y="${yL + 12}" text-anchor="middle" ${FT}>L = ${L} mm</text>`);
  const note = exact ? '' : `<text x="${ox}" y="${H - 4}" font-family="sans-serif" font-size="9" fill="#a60">profil estimé (cotes exactes : longueur + balle)</text>`;
  return `<svg width="${X(totalL) + 8}" height="${H}" viewBox="0 0 ${X(totalL) + 8} ${H}" style="max-width:100%;height:auto">
    <path d="${path}" fill="#caa84e" stroke="#6f5f28" stroke-width="1"/><path d="${bullet}" fill="#b06a2c" stroke="#6f3f18" stroke-width="1"/>${d.join('')}${note}</svg>`;
}
if (typeof module !== 'undefined' && module.exports) module.exports = cartridgeDiagram;
