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
   *   mono : type de la cartouche ('rifle', 'handgun') quand la balle est monolithique (cuivre, laiton
   *   massif), sinon null. Bloc `monolithique` (scripts/fit_monolithique.js, 2026-10-15) : l'ancre est celle
   *   d'une balle à noyau, son E et son η_p sont multipliés par les facteurs du type ; le η_p à froid est
   *   divisé par froidP (arme de poing seulement : en carabine, le modèle à froid n'a pas l'écart).
   *   type : type de la cartouche ('rifle', 'handgun'), pour le facteur du repli des carabines ; à défaut,
   *   celui de `mono`. Bloc `repli_carabine` (scripts/fit_repli_carabine.js, 2026-10-16) : voir repliCarabine.
   * Le modèle à froid reste SANS lois locales. Essayé et rejeté le 2026-10-10 (pression, toutes
   * charges publiées) : lois de charge et de masse autour du remplissage et de la masse typiques
   * de la cartouche, RMS 24,6 → 37,6 % — d'une poudre à l'autre, φ suit la vivacité, pas une
   * échelle de charge ; masse seule, balles lourdes −1 → +21 %, légères +9 → −15 %. Le modèle à
   * froid n'avait pas le biais de masse de l'ancrage : ses termes φ et B_a le compensent déjà.
   */
  energyAndEtaP(coef, pw, ff, lnRe, m_gr, C_gr, anc, mono, type) {
    const L = coef.local || null, lin = (c, f) => c.reduce((s, w, i) => s + w * f[i], 0);
    const ffx = ff == null ? 1 : ff;                          // remplissage nominal si densité inconnue
    const M = (mono && coef.monolithique && coef.monolithique[mono]) || null;
    const k = this.repliCarabine(coef, pw, type || mono);
    const npCold = k * lin(coef.eta_p.coef, [1, ffx, lnRe]) / ((M && M.froidP) || 1);
    if (anc) {
      return {
        E: anc.eeff * this.localE(L, C_gr, m_gr, anc.C, anc.m) * (M ? M.E : 1),
        np: anc.np != null ? anc.np * this.localNp(L, C_gr, m_gr, anc.C, anc.m) * (M ? M.np : 1) : npCold,
        path: 'anchor', npFromAnchor: anc.np != null, mono: !!M,
      };
    }
    if (pw.Qex && pw.Ba) {
      const eta_b = lin(coef.eta_b.coef, [1, ffx, pw.Ba]);
      return { E: eta_b * pw.Qex * 1000, np: npCold, path: 'eta_b', eta_b, mono: !!M };
    }
    return { E: k * lin(coef.e_eff.coef, [1, ffx]), np: npCold, path: 'e_eff', mono: !!M, repli: k };
  },

  /**
   * Facteur du repli E_eff en carabine (bloc `repli_carabine`, scripts/fit_repli_carabine.js) : k pour une
   * cartouche de carabine et une poudre sans Qex/Ba, 1 sinon. Il multiplie l'énergie générique ET le η_p à
   * froid : la pression à froid, E·C/(η_p·A·L), n'en change pas ; la vitesse à froid baisse de √k, et la
   * pression calculée depuis une vitesse connue (mesurée, ou ancre sans η_p) monte de 1/k.
   */
  repliCarabine(coef, pw, type) {
    const R = coef.repli_carabine;
    return (R && R.k > 0 && type === 'rifle' && !(pw && pw.Qex && pw.Ba)) ? R.k : 1;
  },

  /**
   * Loi de pression à DEUX PENTES (bloc `deux_pentes`, scripts/fit_deux_pentes.js, 2026-10-16), pour les types
   * listés (carabine) : P = P_plafond · (m / m_plafond)^αM · (C / Cmax)^γL, en bar. P_plafond, m_plafond : pression
   * et masse moyennes des charges MAXIMALES publiées du couple (ancre : pc, mpc) ; Cmax : plus petite charge
   * maximale publiée pour cette masse de balle, ou leur moyenne (fenêtre par masse, start_charges.local.json). Les lois locales n'ont
   * qu'un exposant pour l'échelle d'une balle (pente 2,7) et pour l'écart de charge maximale entre balles, toutes
   * au plafond de pression ; rapportée au maximum publié de la masse, la pression n'a plus besoin du second.
   * null si l'ancre n'a pas de plafond ou la masse pas de fenêtre : la loi des ancres (energyAndEtaP) s'applique.
   */
  //   Par type d'arme (bloc deux_pentes[type], 2026-10-16) : pente γL, maximum de référence `ref` (« min » : le plus
  //   petit maximum de la masse, win.cmax ; « moy » : la moyenne géométrique des maxima de ses balles, win.cmoy) et
  //   facteur `mono` d'une balle monolithique déclarée (mono vrai). Carabine : min, sans facteur ; arme de poing : moy
  //   (le plus petit maximum surestimait la pression de 17 %, les balles d'une même masse y variant beaucoup).
  pressionDeuxPentes(coef, anc, win, m_gr, C_gr, type, mono) {
    const D = coef.deux_pentes;
    if (!(D && (D.types || []).includes(type) && anc && anc.pc > 0 && anc.mpc > 0 && win)) return null;
    const T = D[type] || {}, cRef = T.ref === 'moy' ? win.cmoy : win.cmax;
    if (!(cRef > 0)) return null;
    return anc.pc * Math.pow(m_gr / anc.mpc, D.alphaM) * Math.pow(C_gr / cRef, this.penteDeuxPentes(coef, type))
      * (mono && T.mono > 0 ? T.mono : 1);
  },

  /** Pente γL de la loi à deux pentes pour ce type d'arme (celle du bloc commun à défaut). */
  penteDeuxPentes(coef, type) {
    const D = coef.deux_pentes || {};
    return (D[type] && D[type].gammaL) || D.gammaL;
  },

  /** Fenêtre de la masse publiée la plus proche, à moins de 0,5 gr ({ masse: {c, cmax, nb} }) ; sinon null. */
  fenetreMasse(fen, m_gr) {
    let best = null, e0 = 0.5;
    for (const [k, w] of Object.entries(fen || {})) {
      const e = Math.abs(+k - m_gr);
      if (e < e0) { e0 = e; best = Object.assign({ m: +k }, w); }
    }
    return best;
  },

  /** Prédiction de Pmax à partir de v0 et η_p. */
  predictPmax(load, v0, eta_p) {
    const m = load.m_gr * this.G2KG, C = load.C_gr * this.G2KG;
    const A = this.area(load.d_mm / 1000);
    return 0.5 * this.effMass(m, C) * v0 * v0 / (eta_p * A * this.travel(load)) / 1e5;
  },
};
if (typeof module !== 'undefined' && module.exports) module.exports = EnergyModel;
