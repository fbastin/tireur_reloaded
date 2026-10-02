/**
 * Voie A — Modèle EMPIRIQUE de vitesse pour le rechargement (prototype).
 *
 * Ne modélise PAS la combustion : s'appuie sur des corrélations publiques,
 * ancrées sur des données mesurées (chronographe) ou fabricant. Borné à
 * l'enveloppe des données. Réfs : loi de puissance canon recoupée sur Marr (2014) et Litz (2015, p. 322) ;
 * Le Duc v(x). Voir docs/balistique_interieure_roadmap.md (Chantier 3).
 */
const VelocityModel = {
  /** Loi de puissance v0(L) = vRef * (L/LRef)^k, L = COURSE de la balle (canon − étui) : c'est ce
   *  que passent l'estimateur et build_anchors. k = 0,17 : médiane de six essais .308 publiés
   *  (Marr 2014, quatre munitions 28″→16,5″ ; Litz 2015 p. 322 ; tableau du manuel), 0,16–0,18 sur
   *  la course (0,18–0,20 sur la longueur du canon). L'ancien 0,27, « Powley/Litz », ne venait
   *  d'aucune mesure retrouvée. Voir verification:technique:estimateur_vitesse (2026-10-02). */
  scaleByBarrel(vRef, LRef, L, k = 0.17) {
    return vRef * Math.pow(L / LRef, k);
  },

  /** Ajuste l'exposant k à partir de deux points mesurés (L,v). */
  fitBarrelExponent(L1, v1, L2, v2) {
    return Math.log(v2 / v1) / Math.log(L2 / L1);
  },

  /** Correction thermique (Litz) : Δv = σT·ΔT. σT en fps/°C (défaut 1,8). */
  tempCorrect(v0_ms, dT_C, sigmaT_fps_perC = 1.8) {
    const FPS = 0.3048; // m/s par fps
    return v0_ms + sigmaT_fps_perC * FPS * dT_C;
  },

  /**
   * Modèle de Le Duc : v(x) = a·x/(b+x), ancré sur (v0 à la bouche, Pmax).
   * Résout (a,b) puis fournit les courbes v(x) et P(x).
   *  m_kg masse balle, C_kg masse charge, d_m calibre, xMuzzle_m course en bouche.
   */
  leDuc(v0_ms, Pmax_bar, m_kg, C_kg, d_m, xMuzzle_m) {
    const A = Math.PI * d_m * d_m / 4;        // section d'âme (m²)
    const m_e = m_kg + C_kg / 3;              // masse effective (Lagrange)
    const Pmax = Pmax_bar * 1e5;              // Pa
    const x = xMuzzle_m;
    // 27·A·Pmax·b·x² = 4·m_e·v0²·(b+x)²  →  quadratique en b
    const K = 4 * m_e * v0_ms * v0_ms / (27 * A * Pmax * x * x);
    // K·b² + (2K·x − 1)·b + K·x² = 0
    const qa = K, qb = 2 * K * x - 1, qc = K * x * x;
    const disc = qb * qb - 4 * qa * qc;
    if (disc < 0) return null;
    const b = (-qb - Math.sqrt(disc)) / (2 * qa); // racine physique (b>0, petite)
    const a = v0_ms * (b + x) / x;                 // vitesse asymptotique
    const xPeak = b / 2;                            // pic de pression à x=b/2
    return {
      a, b, xPeak_m: xPeak,
      v: (xx) => a * xx / (b + xx),
      P_bar: (xx) => (m_e * a * a * b * xx) / (A * Math.pow(b + xx, 3)) / 1e5,
      vMuzzle: a * x / (b + x),
      PmaxCheck_bar: (4 * m_e * a * a) / (27 * A * b) / 1e5,
    };
  },
};
if (typeof module !== 'undefined' && module.exports) module.exports = VelocityModel;
