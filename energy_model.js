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

  /** Prédiction de Pmax à partir de v0 et η_p. */
  predictPmax(load, v0, eta_p) {
    const m = load.m_gr * this.G2KG, C = load.C_gr * this.G2KG;
    const A = this.area(load.d_mm / 1000);
    return 0.5 * this.effMass(m, C) * v0 * v0 / (eta_p * A * this.travel(load)) / 1e5;
  },
};
if (typeof module !== 'undefined' && module.exports) module.exports = EnergyModel;
