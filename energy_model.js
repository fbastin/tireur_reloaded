/**
 * Estimateur de balistique intérieure — cœur ÉNERGIE-EFFICACITÉ (Chantier 5).
 *
 * Sépare la prédiction en deux relations physiquement interprétables, calées
 * sur des données conjointes (v0, Pmax) — sans la fonction de forme propriétaire :
 *   - efficacité balistique  η_b : KE_bouche = η_b · (C · Qex)        → vitesse
 *   - efficacité piézométrique η_p : P_moy = η_p · Pmax, P_moy = KE/(A·course) → pression
 * Données de composants dérivées de Gordon's Reloading Tool (Gordon †) et de la
 * communauté (zen/grt_databases, CC0). Voir docs/balistique_interieure_roadmap.md.
 */
const EnergyModel = {
  G2KG: 6.479891e-5,            // kg par grain

  area(d_m) { return Math.PI * d_m * d_m / 4; },
  effMass(m, C) { return m + C / 3; },           // Lagrange
  travel(load) { return (load.barrel_mm - load.case_mm) / 1000; },

  /** Diagnostic : efficacités déduites d'une charge MESURÉE (v0, Pmax connus). */
  efficiencies(load) {
    const m = load.m_gr * this.G2KG, C = load.C_gr * this.G2KG;
    const A = this.area(load.d_mm / 1000), m_e = this.effMass(m, C);
    const travel = this.travel(load);
    const KE = 0.5 * m_e * load.v0 * load.v0;
    const Echem = C * load.Qex_kJkg * 1000;
    const eta_b = KE / Echem;
    const eta_p = KE / (load.Pmax_bar * 1e5 * A * travel);
    // Rapport de détente — MÊME définition qu'en production (Re = 1 + A·course/V0),
    // calculé uniquement si le volume d'étui est fourni (sinon null, pas de placeholder).
    const Re = load.case_vol_cm3 > 0 ? 1 + (A * travel) / (load.case_vol_cm3 * 1e-6) : null;
    return { eta_b, eta_p, KE, Echem, Re };
  },

  /**
   * Vitesse à partir d'une énergie effective E (J/kg) : v0 = sqrt(2·E·C/m_e).
   * Voie unique des trois chemins du modèle (ancrage E=eeff, η_b E=η_b·Qex, repli E=E_eff).
   */
  velocityFromEnergy(load, E_Jkg) {
    const m = load.m_gr * this.G2KG, C = load.C_gr * this.G2KG;
    return Math.sqrt(2 * E_Jkg * C / this.effMass(m, C));
  },

  /** Prédiction de v0 à partir de η_b (énergie effective = η_b·Qex). */
  predictV0(load, eta_b) {
    return this.velocityFromEnergy(load, eta_b * load.Qex_kJkg * 1000);
  },

  /**
   * Lois LOCALES (model_coefficients.json, bloc `local`, scripts/fit_local_laws.js) : facteurs
   * multiplicatifs de E_eff et de η_p autour d'un point de référence (C0, m0), en grains.
   * Sans elles, E_eff et η_p ne dépendaient ni de la charge (à poudre donnée) ni de la masse de
   * balle : v ∝ √C et P ∝ C à balle donnée, P indépendant de la masse — d'où, avant le
   * 2026-10-10, une pression sous-estimée au max d'une échelle (−10 %) et pour les balles
   * lourdes (−12 %).
   */
  localE(L, C, m, C0, m0) {
    return (L && C0 > 0 && m0 > 0) ? Math.pow(C / C0, L.delta) * Math.pow(m / m0, L.beta) : 1;
  },
  localNp(L, C, m, C0, m0) {
    return (L && C0 > 0 && m0 > 0) ? Math.pow(C / C0, L.eps) * Math.pow(m / m0, L.zeta) : 1;
  },

  /**
   * Énergie effective E (J/kg, au canon de référence) et η_p d'une charge, hors mesure de
   * l'utilisateur. Ancre du couple si elle existe (E, et η_p si l'ancre en porte un), lois
   * locales comprises ; sinon modèle à froid : η_b·Qex (poudre à constantes) ou E_eff
   * générique, et η_p global.
   *   coef : model_coefficients.json   pw : {Qex, Ba, pcd}   ff : remplissage (fraction), null
   *   si la densité de la poudre est inconnue   lnRe : ln du rapport de détente au canon de réf.
   *   anc : {eeff, np, C, m} ou null.
   * Le modèle à froid reste SANS lois locales. Essayé et rejeté le 2026-10-10 (pression, toutes
   * charges publiées) : lois de charge et de masse autour du remplissage et de la masse typiques
   * de la cartouche, RMS 24,6 → 37,6 % — d'une poudre à l'autre, φ suit la vivacité, pas une
   * échelle de charge ; masse seule, balles lourdes −1 → +21 %, légères +9 → −15 %. Le modèle à
   * froid n'avait pas le biais de masse de l'ancrage : ses termes φ et B_a le compensent déjà.
   */
  energyAndEtaP(coef, pw, ff, lnRe, m_gr, C_gr, anc) {
    const L = coef.local || null, lin = (c, f) => c.reduce((s, w, i) => s + w * f[i], 0);
    const ffx = ff == null ? 1 : ff;                          // remplissage nominal si densité inconnue
    const npCold = lin(coef.eta_p.coef, [1, ffx, lnRe]);
    if (anc) {
      return {
        E: anc.eeff * this.localE(L, C_gr, m_gr, anc.C, anc.m),
        np: anc.np != null ? anc.np * this.localNp(L, C_gr, m_gr, anc.C, anc.m) : npCold,
        path: 'anchor', npFromAnchor: anc.np != null,
      };
    }
    if (pw.Qex && pw.Ba) {
      const eta_b = lin(coef.eta_b.coef, [1, ffx, pw.Ba]);
      return { E: eta_b * pw.Qex * 1000, np: npCold, path: 'eta_b', eta_b };
    }
    return { E: lin(coef.e_eff.coef, [1, ffx]), np: npCold, path: 'e_eff' };
  },

  /** Prédiction de Pmax à partir de v0 et η_p. */
  predictPmax(load, v0, eta_p) {
    const m = load.m_gr * this.G2KG, C = load.C_gr * this.G2KG;
    const A = this.area(load.d_mm / 1000);
    return 0.5 * this.effMass(m, C) * v0 * v0 / (eta_p * A * this.travel(load)) / 1e5;
  },
};
if (typeof module !== 'undefined' && module.exports) module.exports = EnergyModel;
