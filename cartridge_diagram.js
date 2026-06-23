/**
 * cartridge_diagram.js — schéma SVG d'une cartouche pour l'estimateur.
 *   cartridgeDiagram(cal, dim, targetW) -> chaîne SVG.
 *     cal = entrée calibers.json (bore_mm, case_mm, case_vol_cm3, type).
 *     dim = entrée cartridge_dims.json {rim,base,shoulder,neck,angle} ou null.
 *
 * Rendu repris de la base de calibres (/calibres.php) — dessin vertical à dégradés
 * laiton/cuivre, fond quadrillé et cotes annotées. Les cotes (rim/base/épaulement/
 * collet) viennent de cartridge_dims.json quand elles existent ; sinon le corps est
 * estimé par classe (repli signalé). rim_type est dérivé (rim > base ⇒ à bourrelet).
 */
function cartridgeDiagram(cal, dim, targetW) {
  if (!cal || !(cal.case_mm > 0 && cal.bore_mm > 0)) return '';
  const L = cal.case_mm, bore = cal.bore_mm, exact = !!(dim && dim.base);
  const bn = exact ? !!(dim.shoulder) : (cal.type !== 'handgun');
  let base, rim, neck, shoulder, rimType;
  if (exact) {
    base = dim.base; rim = dim.rim; neck = dim.neck;
    shoulder = bn ? dim.shoulder : null;
    rimType = (rim > base * 1.06) ? 'Rimmed' : 'Rimless';   // les dims n'ont pas le type → dérivé
  } else {                                                    // repli : corps estimé par classe (~±1 mm)
    const dEq = Math.sqrt(4 * cal.case_vol_cm3 * 1000 / (Math.PI * L));
    const ratio = cal.type === 'handgun' ? 1.06 : Math.min(1.75, Math.max(1.30, dEq / bore * 1.45));
    base = bn ? bore * ratio : Math.max(bore + 0.5, dEq);
    neck = bore + 0.5; shoulder = bn ? base : null; rim = base; rimType = 'Rimless';
  }
  const c = {
    case_length_mm: L, bullet_diameter_mm: bore,
    category: cal.type === 'handgun' ? 'Handgun' : 'Rifle',
    rim_diameter_mm: rim, base_diameter_mm: base,
    shoulder_diameter_mm: shoulder, neck_diameter_mm: neck, rim_type: rimType
  };

  // ---- Dessin (porté de calibres.php : updateCartridgeDrawing) ----
  const caseLen = c.case_length_mm, bulletDia = c.bullet_diameter_mm;
  let bulletLenFactor = 1.3;
  if (c.category === 'Rifle') bulletLenFactor = 2.4; else if (c.category === 'Rimfire') bulletLenFactor = 1.1;
  const bulletLen = bulletDia * bulletLenFactor;
  const totalLen = caseLen + bulletLen;
  const maxLen = Math.max(totalLen, 70);
  const bottomY = 265;
  const scale = Math.min(210 / maxLen, 5.0);
  const cX = 140;
  const rRim = (c.rim_diameter_mm * scale) / 2;
  const rBase = (c.base_diameter_mm * scale) / 2;
  const isBottleneck = c.shoulder_diameter_mm !== null && c.shoulder_diameter_mm > 0;
  const rShoulder = isBottleneck ? (c.shoulder_diameter_mm * scale) / 2 : rBase;
  const rNeck = (c.neck_diameter_mm * scale) / 2;
  const rBullet = (c.bullet_diameter_mm * scale) / 2;
  const hCase = caseLen * scale, hBullet = bulletLen * scale;
  const rimThickness = Math.max(1.1 * scale, 3.5);
  const yRimBottom = bottomY, yRimTop = yRimBottom - rimThickness;
  const yCaseMouth = yRimBottom - hCase, yBulletTip = yCaseMouth - hBullet;

  let casingPath = '';
  if (isBottleneck) {
    const neckLen = Math.min(bulletDia * 0.9 * scale, hCase * 0.28);
    const yShoulderTop = yCaseMouth + neckLen;
    const shoulderLen = Math.min(2.2 * scale, hCase * 0.08);
    const yShoulderBottom = yShoulderTop + shoulderLen;
    casingPath = `M ${cX - rRim} ${yRimBottom} L ${cX + rRim} ${yRimBottom} L ${cX + rRim} ${yRimTop}`;
    if (c.rim_type !== 'Rimmed') {
      const grooveHeight = Math.max(2.5 * scale, 7), yGrooveTop = yRimTop - grooveHeight, rGroove = rBase - Math.max(1.0 * scale, 2.5);
      casingPath += ` L ${cX + rGroove} ${yRimTop} L ${cX + rGroove} ${yRimTop - grooveHeight + 1.5 * scale} L ${cX + rBase} ${yGrooveTop}`;
    } else casingPath += ` L ${cX + rBase} ${yRimTop} `;
    casingPath += ` L ${cX + rShoulder} ${yShoulderBottom} L ${cX + rNeck} ${yShoulderTop} L ${cX + rNeck} ${yCaseMouth} L ${cX - rNeck} ${yCaseMouth} L ${cX - rNeck} ${yShoulderTop} L ${cX - rShoulder} ${yShoulderBottom}`;
    if (c.rim_type !== 'Rimmed') {
      const grooveHeight = Math.max(2.5 * scale, 7), yGrooveTop = yRimTop - grooveHeight, rGroove = rBase - Math.max(1.0 * scale, 2.5);
      casingPath += ` L ${cX - rBase} ${yGrooveTop} L ${cX - rGroove} ${yRimTop - grooveHeight + 1.5 * scale} L ${cX - rGroove} ${yRimTop}`;
    } else casingPath += ` L ${cX - rBase} ${yRimTop} `;
    casingPath += ` L ${cX - rRim} ${yRimTop} Z`;
  } else {
    casingPath = `M ${cX - rRim} ${yRimBottom} L ${cX + rRim} ${yRimBottom} L ${cX + rRim} ${yRimTop}`;
    if (c.rim_type !== 'Rimmed') {
      const grooveHeight = Math.max(2.2 * scale, 6), yGrooveTop = yRimTop - grooveHeight, rGroove = rBase - Math.max(0.8 * scale, 2.0);
      casingPath += ` L ${cX + rGroove} ${yRimTop} L ${cX + rGroove} ${yRimTop - grooveHeight + 1.0 * scale} L ${cX + rBase} ${yGrooveTop}`;
    } else casingPath += ` L ${cX + rBase} ${yRimTop} `;
    casingPath += ` L ${cX + rBase} ${yCaseMouth} L ${cX - rBase} ${yCaseMouth}`;
    if (c.rim_type !== 'Rimmed') {
      const grooveHeight = Math.max(2.2 * scale, 6), yGrooveTop = yRimTop - grooveHeight, rGroove = rBase - Math.max(0.8 * scale, 2.0);
      casingPath += ` L ${cX - rBase} ${yGrooveTop} L ${cX - rGroove} ${yRimTop - grooveHeight + 1.0 * scale} L ${cX - rGroove} ${yRimTop}`;
    } else casingPath += ` L ${cX - rBase} ${yRimTop} `;
    casingPath += ` L ${cX - rRim} ${yRimTop} Z`;
  }

  const bulletPath = `M ${cX - rBullet} ${yCaseMouth} L ${cX - rBullet} ${yCaseMouth - hBullet * 0.15} C ${cX - rBullet} ${yCaseMouth - hBullet * 0.6}, ${cX - rBullet * 0.2} ${yBulletTip}, ${cX} ${yBulletTip} C ${cX + rBullet * 0.2} ${yBulletTip}, ${cX + rBullet} ${yCaseMouth - hBullet * 0.6}, ${cX + rBullet} ${yCaseMouth - hBullet * 0.15} L ${cX + rBullet} ${yCaseMouth} Z`;

  const grooveHeightVal = c.rim_type !== 'Rimmed' ? Math.max(2.5 * scale, 7) : 0;
  const yBaseBottom = c.rim_type !== 'Rimmed' ? (yRimTop - grooveHeightVal) : yRimTop;
  const rimLabel = c.rim_type === 'Rimmed' ? 'Ø R1 (Bourr.)' : 'Ø R1 (Culot)';
  let yShoulderBottomVal = yRimBottom;
  if (isBottleneck) {
    const neckLen = Math.min(bulletDia * 0.9 * scale, hCase * 0.28);
    const yShoulderTop = yCaseMouth + neckLen, shoulderLen = Math.min(2.2 * scale, hCase * 0.08);
    yShoulderBottomVal = yShoulderTop + shoulderLen;
  }
  const leftAnns = [
    { label: 'Ø G1 (Balle)', val: c.bullet_diameter_mm, measY: yCaseMouth - hBullet * 0.1, r: rBullet },
    { label: 'Ø H2 (Collet)', val: c.neck_diameter_mm, measY: yCaseMouth, r: rNeck }
  ];
  if (isBottleneck && c.shoulder_diameter_mm) leftAnns.push({ label: 'Ø P2 (Épaul.)', val: c.shoulder_diameter_mm, measY: yShoulderBottomVal, r: rShoulder });
  leftAnns.push({ label: 'Ø P1 (Base)', val: c.base_diameter_mm, measY: yBaseBottom, r: rBase },
    { label: rimLabel, val: c.rim_diameter_mm, measY: yRimBottom - rimThickness / 2, r: rRim });
  leftAnns.forEach(ann => { ann.textY = ann.measY; });
  leftAnns.sort((a, b) => a.measY - b.measY);
  const minSpacing = 16;
  for (let i = 1; i < leftAnns.length; i++) if (leftAnns[i].textY < leftAnns[i - 1].textY + minSpacing) leftAnns[i].textY = leftAnns[i - 1].textY + minSpacing;
  if (leftAnns[leftAnns.length - 1].textY > 288) {
    leftAnns[leftAnns.length - 1].textY = 288;
    for (let i = leftAnns.length - 2; i >= 0; i--) if (leftAnns[i].textY > leftAnns[i + 1].textY - minSpacing) leftAnns[i].textY = leftAnns[i + 1].textY - minSpacing;
  }
  let leftAnnsHtml = '';
  leftAnns.forEach(ann => {
    const jogX = cX - ann.r - 8, targetX = cX - ann.r;
    leftAnnsHtml += `<path d="M 25 ${ann.textY} L ${jogX} ${ann.textY} L ${targetX} ${ann.measY}" stroke="var(--color-text-light, #888)" stroke-width="0.75" fill="none" marker-end="url(#dim-arrow)" /><text x="25" y="${ann.textY - 3}" font-family="system-ui, -apple-system, sans-serif" font-size="8.5" fill="var(--color-text-light, #666)" font-weight="600">${ann.label}: ${ann.val.toFixed(2)} mm</text>`;
  });

  const rMax = Math.max(rRim, rBase);
  const l3Text = `L3: ${c.case_length_mm.toFixed(2)} mm`, l6Text = `L6: ${totalLen.toFixed(1)} mm`;
  const l3Height = yRimBottom - yCaseMouth, l3FontSize = l3Height < 70 ? 7.5 : 8.5;
  const rightAnnsHtml = `
    <line x1="${cX + rMax + 4}" y1="${yRimBottom}" x2="262" y2="${yRimBottom}" stroke="var(--color-text-light, #888)" stroke-width="0.5" stroke-dasharray="2,2" />
    <line x1="${cX + rNeck + 4}" y1="${yCaseMouth}" x2="237" y2="${yCaseMouth}" stroke="var(--color-text-light, #888)" stroke-width="0.5" stroke-dasharray="2,2" />
    <line x1="${cX}" y1="${yBulletTip}" x2="262" y2="${yBulletTip}" stroke="var(--color-text-light, #888)" stroke-width="0.5" stroke-dasharray="2,2" />
    <line x1="230" y1="${yRimBottom}" x2="230" y2="${yCaseMouth}" stroke="var(--color-text-light, #888)" stroke-width="0.75" marker-start="url(#dim-arrow)" marker-end="url(#dim-arrow)" />
    <text x="226" y="${(yRimBottom + yCaseMouth) / 2}" transform="rotate(-90, 226, ${(yRimBottom + yCaseMouth) / 2})" font-family="system-ui, -apple-system, sans-serif" font-size="${l3FontSize}" fill="var(--color-text-light, #666)" font-weight="600" text-anchor="middle">${l3Text}</text>
    <line x1="255" y1="${yRimBottom}" x2="255" y2="${yBulletTip}" stroke="var(--color-text-light, #888)" stroke-width="0.75" marker-start="url(#dim-arrow)" marker-end="url(#dim-arrow)" />
    <text x="251" y="${(yRimBottom + yBulletTip) / 2}" transform="rotate(-90, 251, ${(yRimBottom + yBulletTip) / 2})" font-family="system-ui, -apple-system, sans-serif" font-size="8.5" fill="var(--color-text-light, #666)" font-weight="600" text-anchor="middle">${l6Text}</text>`;

  const note = exact ? '' : `<text x="140" y="297" text-anchor="middle" font-family="system-ui, sans-serif" font-size="8" fill="#a60">profil estimé (cotes exactes : longueur + balle)</text>`;
  const w = Math.max(170, Math.min(targetW || 300, 270)), h = Math.round(w * 300 / 280);
  return `<svg viewBox="0 0 280 300" width="${w}" height="${h}" class="cartridge-svg" style="max-width:100%">
    <defs>
      <linearGradient id="brass-grad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#b8860b"/><stop offset="20%" stop-color="#f5d033"/><stop offset="50%" stop-color="#ffe680"/><stop offset="80%" stop-color="#d4af37"/><stop offset="100%" stop-color="#805500"/></linearGradient>
      <linearGradient id="copper-grad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#73250b"/><stop offset="25%" stop-color="#c45d3e"/><stop offset="50%" stop-color="#f8a488"/><stop offset="75%" stop-color="#c45d3e"/><stop offset="100%" stop-color="#541b08"/></linearGradient>
      <pattern id="drawing-grid" width="15" height="15" patternUnits="userSpaceOnUse"><path d="M 15 0 L 0 0 0 15" fill="none" stroke="var(--color-border, rgba(128,128,128,0.12))" stroke-width="0.5"/></pattern>
      <marker id="dim-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 2 L 10 5 L 0 8 z" fill="var(--color-text-light, #888)"/></marker>
    </defs>
    <rect width="280" height="300" fill="url(#drawing-grid)" rx="6"/>
    <line x1="${cX}" y1="${yBulletTip - 15}" x2="${cX}" y2="${yRimBottom + 15}" stroke="var(--color-text-light, rgba(128,128,128,0.25))" stroke-width="0.75" stroke-dasharray="10,2,2,2"/>
    <path d="${bulletPath}" fill="url(#copper-grad)" stroke="#4d1a0b" stroke-width="0.5"/>
    <path d="${casingPath}" fill="url(#brass-grad)" stroke="#4d3300" stroke-width="0.5"/>
    ${leftAnnsHtml}${rightAnnsHtml}${note}
  </svg>`;
}
if (typeof module !== 'undefined' && module.exports) module.exports = cartridgeDiagram;
