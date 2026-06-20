# Gordon's Reloading Tool (GRT) Clone — Roadmap

This roadmap outlines the development plan for the web-based Gordon's Reloading Tool (GRT) clone on Tireur.org. The tool will feature a thermodynamic internal ballistics solver, a compiled components database, and interactive real-time visualization.

---

## Phase 1: Database Pre-compilation & API
- [x] Scan and parse all `.caliber`, `.projectile`, and `.propellant` XML files in `../grt_databases`.
- [x] Build a database compilation script (`compile_db.php`) that parses XML structures, decodes URL-encoded fields, and outputs a consolidated, minified `grt_db.json`.
- [x] Verify database accuracy and ensure units are correctly standardized (e.g., converting case capacity from grains of water to cm³).

## Phase 2: Internal Ballistics Simulation Core
- [x] Implement the zero-dimensional thermodynamic internal ballistics solver in Javascript.
- [x] Use a 4th-order Runge-Kutta (RK4) numerical integrator with a 1-microsecond time step.
- [x] Model the gas state using the Noble-Abel equation of state, accounting for gas covolume ($\eta$) and remaining solid propellant volume.
- [x] Model propellant burning rate using the vivacity coefficient ($Ba$) and shape functions ($\phi(z)$) defined by $a_0$, $z_1$, and $z_2$.
- [x] Account for physical constraints: bullet starting pressure ($P_s$), constant bore friction ($P_{friction}$), and heat losses to the barrel.

## Phase 3: Premium User Interface (UX/UI)
- [x] Design a gorgeous, responsive, single-page application dashboard matching Tireur.org's premium dark mode.
- [x] Implement reactive input controls for:
  - **Caliber selection** (loads default water capacity and maximum pressure $P_{max}$).
  - **Projectile selection** (loads weight, diameter, length, and start pressure).
  - **Powder selection** (loads vivacity, explosive heat, specific heats, covolume, and shape parameters).
  - **Charge weight** (grains).
  - **Bullet seating depth** or cartridge overall length (COAL).
  - **Barrel length** (travel distance).
- [x] Add real-time safety warnings if peak pressure exceeds the caliber's CIP/SAAMI maximum allowed pressure ($P_{max}$).

## Phase 4: Data Visualization & Plotly Charts
- [x] Render interactive, real-time charts using Plotly.js:
  - **Chamber Pressure vs. Time** (ms).
  - **Chamber Pressure vs. Bullet Travel** (mm or inches).
  - **Bullet Velocity vs. Bullet Travel** (m/s or fps).
- [x] Display key performance indicators (KPIs) in a card layout:
  - Peak Chamber Pressure (bar / psi).
  - Muzzle Velocity (m/s / fps).
  - Barrel Time (ms).
  - Propellant Burned Percentage (%).

## Phase 5: Integration with Exterior Ballistics & Offline PWA
- [x] Link the simulated muzzle velocity directly into the 3-DOF exterior ballistics solver (`CompetitionBallistics.js`).
- [x] Add unit toggle buttons (imperial vs. metric) matching the site's layout.
- [x] Implement offline capability using a Service Worker for standalone use on the shooting range.
- [x] Write detailed user guides and tooltips for reloading safety.

## Phase 6: Validation & calibration du solveur (EN COURS)

> Initiative plus large (théorie sourcée, doc de validation, modèle empirique « Voie A », guide données utilisateur) : voir **`docs/balistique_interieure_roadmap.md`** dans le dépôt principal.

Validation contre des données fabricant publiées (Reload Swiss Guide 2025, poudres RS validées Qlty 0,9–0,95) :

| Charge de référence | Δ vitesse | Δ pression | combustion |
|---|---|---|---|
| .308 Win / RS52 / 130 gr (min 38,6 gr) | −26 % | −36 % | 62 % |
| .308 Win / RS52 / 130 gr (max 47,5 gr) | −22 % | −24 % | 70 % |
| 9 mm Luger / RS12 / 115 gr (max 4,3 gr) | −17 % | **+1 %** | 88 % |

**Constats :**
- Le solveur **sous-estime systématiquement la vitesse (~15–26 %)**.
- Sur le cas 9 mm, le **pic de pression est juste (+1 %)** alors que la vitesse est −17 % → la courbe P(x) est **trop pointue** (aire ∫P·dx trop faible : ~0,21·pic contre ~0,30 mesuré). Défaut **structurel** de partage d'énergie / forme de combustion, pas seulement de vivacité.
- Une recherche à 3 paramètres (échelle de vivacité `kBa`, exposant de pression `n` dans `dz/dt = kBa·Ba·P^n·φ`, perte thermique `beta`) **ne descend pas sous ~16 % de RMS** : aucun jeu de paramètres ne cale simultanément v et P sur les trois charges. ⇒ une simple recalibration paramétrique est insuffisante.

**À faire (correctif de fond, non paramétrique) :**
- [ ] Aligner la **loi de combustion / fonction de forme** sur la formulation exacte de GRT (l'outil est un clone GRT) — origine probable de la « pointe » de pression (loi linéaire en P vs loi réelle avec exposant + progressivité).
- [ ] Revoir le **partage d'énergie** (perte thermique, énergie résiduelle des gaz en bouche, gradient de Lagrange) qui sous-alimente la balle.
- [ ] Re-valider sur ≥ 5 charges (pistolet + carabine) après correctif.
- ⚠️ Tant que non calibré : outil **indicatif/pédagogique**, ne pas développer de charges réelles sur ses seules valeurs.

**Déjà corrigé :** COAL/enfoncement par défaut (utilise la longueur max CIP `L6` ; l'ancienne estimation `gtailh+2` donnait 2 mm pour une balle à base plate → COAL irréaliste qui faussait volume et pression).
