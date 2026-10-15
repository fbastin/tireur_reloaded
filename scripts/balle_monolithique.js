/**
 * balle_monolithique.js — reconnaît une balle monolithique (cuivre ou laiton massif, sans noyau de
 * plomb) à son libellé dans les guides : « BAR TSX FB » (Hodgdon, ADI), « BARNESTSX-BT » (Western,
 * sans espaces), « Lapua Naturalis » (Vihtavuori).
 *
 * Retenues : Barnes TSX, TTSX, LRX, X, XFB, XBT, XPB, MRX, TAC-X/XP/TX, Banded Solid ; Hornady GMX,
 * CX, MonoFlex ; Nosler E-Tip ; Lapua Naturalis ; Lehigh ; Cutting Edge ; Hammer ; Rhino Solid Shank ;
 * toute « Solid » (CEB, LOS, UP Bullets). Écartées : Varmint Grenade et MPG (noyau fritté
 * cuivre-étain, fragmentable), Barnes Original et Match Burner (noyau de plomb), Buster (plomb dur),
 * Sako Hammerhead (noyau de plomb soudé, malgré le nom).
 *
 * Utilisé par build_anchors.js (ancres ramenées à une balle à noyau) et fit_monolithique.js (mesure
 * de l'effet). Les guides sans libellé de balle (Reload Swiss, Lovex, Nosler) ne sont pas classés.
 */
const MOTIFS = [
  /TTSX|TSX|XPB|MRX|TAC-?XP|TAC-?TX|TAC-?X|BAND(ED)?-?S|LRX|XFB|XBT/i,   // Barnes (Western écrit sans espaces)
  /^(BAR|BARNES)\s?X$/i,                                                // la X d'origine
  /GMX|MONOFLEX|MFTX|(^|[\s.]|HDY)CX\b/i,                               // Hornady
  /E-?TIP|NOS(LER)?\s?ET\b/i,                                           // Nosler
  /NATURALIS|LEHIGH|XTREME PENETRATOR|CUTTING EDGE|HAMMER(?!HEAD)|SOLID/i,
];
function estMonolithique(libelle) {
  return !!libelle && MOTIFS.some((re) => re.test(String(libelle).trim()));
}
if (typeof module !== 'undefined' && module.exports) module.exports = { estMonolithique };
