/**
 * Voie A — Modèle EMPIRIQUE de vitesse pour le rechargement (prototype).
 *
 * Ne modélise PAS la combustion : s'appuie sur des corrélations publiques,
 * ancrées sur des données mesurées (chronographe) ou fabricant. Borné à
 * l'enveloppe des données. Réfs : loi de puissance canon recoupée sur 19 séries publiées (Marr, Rifleshooter.com) ;
 * Le Duc v(x). Voir docs/balistique_interieure_roadmap.md (Chantier 3).
 */
const VelocityModel = {
  /** Loi de puissance v0(L) = vRef * (L/LRef)^k, L = COURSE de la balle (canon − étui). Depuis le
   *  2026-10-11, loi des armes de poing et repli de scaleByBarrelFor ; les carabines passent par la
   *  règle de Powley. k = 0,15 : 19 séries publiées sur 8 cartouches
   *  (scripts/barrel_exponent_fit.py) donnent une médiane de 0,15 sur la course, mais de 0,10 à 0,28
   *  selon la cartouche et la charge (.243 Win. et .300 Win. Mag. hautes, 7.62×39 et 6.5 Creedmoor
   *  basses) : une mesure sur la carabine prime. L'ancien 0,27, « Powley/Litz », ne venait d'aucune
   *  mesure retrouvée. Voir verification:technique:estimateur_vitesse (2026-10-02). */
  scaleByBarrel(vRef, LRef, L, k = 0.15) {
    return vRef * Math.pow(L / LRef, k);
  },

  /** Règle de Powley : v ∝ √(1 − R^(−1/4)), R = 1 + A·x/U le rapport de détente (x course de la
   *  balle en m, U volume utile de l'étui sous la balle en cm³, d diamètre en mm). Forme du
   *  calculateur kwk.us, d'après Davis (Handloading, NRA, 1981) ; Powley (1961) n'en donne que
   *  les tables. */
  powleyFactor(x_m, U_cm3, d_mm) {
    const A = Math.PI * (d_mm / 1000) * (d_mm / 1000) / 4, U = U_cm3 * 1e-6;
    return Math.sqrt(1 - Math.pow(1 + A * x_m / U, -0.25));
  },

  /** Loi de canon d'une cartouche : vitesse v à la course xFrom (m) ramenée à la course xTo.
   *  Carabines : règle de Powley. Sur 43 séries de canons raccourcis, elle prédit mieux que
   *  l'exposant fixe sur 15 armes sur 18, dont les 6 canons de deux sources indépendantes de
   *  Marr (scripts/barrel_predictors.py, docs/BARREL_LENGTH.md, 2026-10-11) ; l'écart est
   *  faible près du rapport de détente de la .308, fort sur les magnums. Armes de poing, et
   *  cartouche sans volume d'étui ou sans calibre : loi de puissance (k = 0,15), faute de mesures.
   *  U_cm3 : volume utile saisi par l'utilisateur, sinon le nominal de la cartouche.
   *  LOI_CANON=puissance (variable d'environnement, Node seulement) rend l'ancienne loi partout,
   *  pour comparer les validations avant et après. */
  scaleByBarrelFor(cart, v, xFrom_m, xTo_m, U_cm3) {
    const U = U_cm3 > 0 ? U_cm3 : cart.case_vol_cm3;
    const puissance = typeof process !== 'undefined' && process.env && process.env.LOI_CANON === 'puissance';
    if (!puissance && cart.type === 'rifle' && U > 0 && cart.bore_mm > 0 && xFrom_m > 0 && xTo_m > 0) {
      return v * VelocityModel.powleyFactor(xTo_m, U, cart.bore_mm) / VelocityModel.powleyFactor(xFrom_m, U, cart.bore_mm);
    }
    return VelocityModel.scaleByBarrel(v, xFrom_m, xTo_m);
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
   *
   * P(x) est la pression au fond de la chambre, celle que mesurent les capteurs de la C.I.P.
   * et des fabricants, et donc celle du Pmax d'ancrage. Le gradient de Lagrange la relie à la
   * pression sur le culot, qui seule accélère la balle : p_chambre = p_culot·(1 + C/2m)
   * (Carlucci et Jacobson, éq. 3.54). D'où m_c = m + C/2 dans m_c·dv/dt = A·p_chambre.
   * Jusqu'au 2026-10-11, la masse était m + C/3, celle de la pression MOYENNE (éq. 3.59) :
   * ancrer un Pmax de chambre comme une pression moyenne revenait à le prendre 3 à 7 % trop
   * haut, d'où un b trop court. Sur les canons raccourcis (scripts/barrel_predictors.py), l'écart médian
   * passe de 41,1 à 34,7 fps sur les 19 séries de référence, de 37,0 à 31,4 sur les 8 de validation.
   */
  leDuc(v0_ms, Pmax_bar, m_kg, C_kg, d_m, xMuzzle_m) {
    const A = Math.PI * d_m * d_m / 4;        // section d'âme (m²)
    const m_c = m_kg + C_kg / 2;              // masse « de chambre » (gradient de Lagrange)
    const Pmax = Pmax_bar * 1e5;              // Pa
    const x = xMuzzle_m;
    // 27·A·Pmax·b·x² = 4·m_c·v0²·(b+x)²  →  quadratique en b
    const K = 4 * m_c * v0_ms * v0_ms / (27 * A * Pmax * x * x);
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
      P_bar: (xx) => (m_c * a * a * b * xx) / (A * Math.pow(b + xx, 3)) / 1e5,
      vMuzzle: a * x / (b + x),
      PmaxCheck_bar: (4 * m_c * a * a) / (27 * A * b) / 1e5,
    };
  },
};
if (typeof module !== 'undefined' && module.exports) module.exports = VelocityModel;
