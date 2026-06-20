# Interior Ballistics Estimator — Model Description

> Formal description of the **energy–efficiency model** used by the *Interior
> Ballistics Estimator*, its unknown parameters, and the calibration procedure.
> This is the model promoted for use; the legacy thermodynamic ODE clone (GRT) is
> kept only for pedagogical exploration and is known to under-predict pressure and
> velocity.

## 1. Scope and rationale

The estimator predicts **muzzle velocity** $v_0$ and (indicatively) **peak chamber
pressure** $P_\max$ for a small-arms cartridge load, plus an approximate
pressure/velocity curve along the bore.

It is a **lumped-parameter (0-D)** model. It deliberately does **not** integrate a
burn-rate ODE. The reason is structural: faithful 0-D solvers (QuickLOAD, Gordon's
Reloading Tool) rely on a propellant **form function** and an **energy-partition
model** that are proprietary and were never published (the GRT author is deceased).
Attempts to calibrate the open burn-rate ODE against published data plateaued at
~16 % RMS because a single burn process couples velocity and pressure into an
inconsistent ("over-peaked") pressure curve.

The energy–efficiency formulation sidesteps this by **decoupling** the velocity and
pressure predictions into two physically interpretable efficiencies that are
**calibrated on manufacturer data** instead of derived from the unknown form
function.

## 2. Notation

| Symbol | Meaning | Unit |
|---|---|---|
| $m$ | bullet mass | kg |
| $C$ | propellant charge mass | kg |
| $m_e = m + C/3$ | effective mass (Lagrange approximation) | kg |
| $d$ | bore (groove) diameter | m |
| $A = \pi d^2/4$ | bore cross-sectional area | m² |
| $L_b$ | barrel length | m |
| $L_c$ | case length | m |
| $L = L_b - L_c$ | bullet travel in the bore | m |
| $V_0$ | effective chamber (case) volume | m³ |
| $\rho_b$ | propellant bulk (pour) density | kg/m³ |
| $Q_\mathrm{ex}$ | propellant specific energy (heat of explosion) | J/kg |
| $B_a$ | propellant vivacity coefficient | – |
| $v_0$ | muzzle velocity | m/s |
| $P_\max$ | peak chamber pressure | Pa |
| $E_k = \tfrac12 m_e v_0^2$ | muzzle kinetic energy | J |

## 3. Governing equations (formal model)

### 3.1 Velocity — ballistic efficiency $\eta_b$

The **ballistic efficiency** is defined as the fraction of the propellant's chemical
energy that appears as muzzle kinetic energy:

$$\eta_b \equiv \frac{E_k}{C\,Q_\mathrm{ex}} = \frac{\tfrac12 m_e v_0^2}{C\,Q_\mathrm{ex}}.$$

Solved for velocity:

$$\boxed{\,v_0 = \sqrt{\dfrac{2\,\eta_b\,C\,Q_\mathrm{ex}}{m_e}}\,}$$

$\eta_b$ is **geometry-free** — it depends only on masses, energy and burn
completeness — which is why velocity can be modelled across cartridges without bore
geometry.

### 3.2 Peak pressure — piezometric efficiency $\eta_p$

The **piezometric efficiency** relates the (work-equivalent) mean pressure to the
peak pressure. Equating the work done on the projectile to its kinetic energy,
$\bar P\,A\,L = E_k$, and writing $\eta_p \equiv \bar P / P_\max$:

$$\boxed{\,P_\max = \dfrac{\tfrac12 m_e v_0^2}{\eta_p\,A\,L}\,}$$

Pressure therefore depends on bore geometry ($A$, $L$) and on $\eta_p$.

### 3.3 Auxiliary geometric quantities

- **Travel:** $L = L_b - L_c$ (bullet base assumed near the case mouth).
- **Fill ratio** (loading density proxy): $\varphi = \dfrac{C/\rho_b}{V_0}$ (reported in %).
- **Expansion ratio:** $R_e = 1 + \dfrac{A\,L}{V_0}$.

The effective chamber volume $V_0$ per cartridge is taken from a standard caliber
table (`data/calibers.json`); $Q_\mathrm{ex}$, $B_a$, $\rho_b$ per powder from
`data/powders.json`.

### 3.4 Pressure–travel curve (Le Duc layer)

For display, a two-parameter Le Duc profile $v(x) = \dfrac{a\,x}{b+x}$ is **anchored**
on the predicted pair $(v_0, P_\max)$. With $P(x) = \dfrac{m_e\,a^2 b\,x}{A\,(b+x)^3}$
and peak at $x = b/2$, the constants $(a,b)$ are obtained in closed form from
$v(L)=v_0$ and $P_\max$. This layer adds **no new degrees of freedom**.

## 4. Model unknowns

The model has exactly **two free (calibrated) unknowns**:

1. $\eta_b$ — ballistic efficiency (velocity);
2. $\eta_p$ — piezometric efficiency (pressure).

Everything the proprietary solvers compute explicitly — burn rate, the 3-stage form
function, heat loss to the barrel, friction, gas leakage, the energy-partition /
effective-mass detail beyond Lagrange — is **absorbed into these two efficiencies**.
They are not derived from first principles here; they are **functions calibrated on
data** (Section 5). The Le Duc constants $(a,b)$ are *determined*, not free.

Empirically the two unknowns are bounded and stable, but not constant:

| Unknown | Mean | Spread (CV) | Driver |
|---|---|---|---|
| $\eta_b$ | ≈ 0.29 | ~17 % | rises with fill ratio; weak powder dependence |
| $\eta_p$ | ≈ 0.45 | ~21 % | falls with expansion ratio $\ln R_e$ |

### Design note — why only bullet mass (not a full projectile database)

QuickLOAD/GRT take detailed projectile inputs (length, bearing surface, seating).
This model deliberately uses **only bullet mass**, because:

- friction / engraving / bearing-surface losses are **absorbed empirically** into
  η_b, η_p (they are not modelled, by design);
- the only extra lever a projectile selection would give is a bullet-specific
  **chamber volume V0** (via seating depth) → fill ratio and Re.

Measured empirically on the calibration set (1700 loads), using each load's *exact*
V0 instead of the per-cartridge median changes the error by only **+0.12 pts RMS on
velocity** (9.56→9.44 %) and **+0.52 pts on pressure** (16.11→15.59 %) — negligible
against the model's intrinsic scatter. A QuickLOAD-style projectile database would
add inputs and a recalibration burden for no measurable accuracy gain here. Mass
stays the single bullet input.

## 5. Calibration procedure

### 5.1 Data

Joint $(v_0, P_\max)$ load tables from manufacturer guides — currently the
**Reload Swiss Guide 2025**: 850 charges, 54 cartridges, 14 RS powders (min & max
loads). The **raw tables are not redistributed** (publisher EULA); only the derived
coefficients are published (`data/model_coefficients.json`). A small cited fixture
(`data/reference_loads.json`) is kept for regression tests.

### 5.2 Per-load efficiencies

For each reference load, $\eta_b$ and $\eta_p$ are computed directly from their
definitions (Sections 3.1–3.2) using $Q_\mathrm{ex}$, $\rho_b$ from the powder file
and $d$, $L_c$, $V_0$ from the caliber table.

### 5.3 Regression model

Ordinary least squares (normal equations) fits each efficiency to physically chosen
covariates:

$$\eta_b = \beta_0 + \beta_1\,\tfrac{\varphi}{100} + \beta_2\,B_a,
\qquad
\eta_p = \gamma_0 + \gamma_1\,\tfrac{\varphi}{100} + \gamma_2\,\ln R_e.$$

Current fitted coefficients (all RS data):

$$\eta_b = 0.1628 + 0.1218\,\tfrac{\varphi}{100} + 0.0180\,B_a,$$
$$\eta_p = 0.8868 + 0.0515\,\tfrac{\varphi}{100} - 0.2239\,\ln R_e.$$

Adding further features (e.g. $Q_\mathrm{ex}$, charge/bullet ratio, expansion ratio
in $\eta_b$) improves the in-sample fit but **degrades generalization** and is
therefore omitted.

### 5.4 Validation — leave-one-powder-out (LOPO)

Generalization is judged by withholding an **entire powder**, fitting on the rest,
and predicting the held-out powder (1700 velocity points):

| Output | Cold-start (LOPO) |
|---|---|
| velocity | **~10 % RMS** (vs ~25 % for the raw GRT ODE) |
| peak pressure | **~16 % RMS** (with $\ln R_e$; ~22 % without) |

Expansion ratio does **not** reduce the velocity error — the residual cross-cartridge
variance in $\eta_b$ is irreducible at the global level with the available data.

### 5.5 Two-tier anchoring

Accuracy improves as data closer to the user's load becomes available:

| Tier | Information used | Velocity RMS |
|---|---|---|
| Cold start | global coefficients only | ~10 % |
| Anchored | manufacturer $(v_0,P_\max)$ for that cartridge × powder (per-group $\eta_b(\varphi)$, LOO over 171 groups) | ~5 % |
| User-anchored | user's own chronograph $v_0$ (efficiency recovered directly) | near-exact along the charge ladder |

This matches the tool's intent: the global model is a *cold prior*; supplying data
tightens it.

### 5.6 Published coefficients

`data/model_coefficients.json` stores the feature lists, fitted coefficients and the
reported LOPO RMS. The estimator loads these at runtime.

## 6. Accuracy and limitations (safety)

- **Pressure is the weak output** ($\eta_p$ CV ~21 %, ~16 % LOPO) and is shown as
  **indicative only**. A load truly above the CIP limit can appear "safe".
- Velocity is reliable only **within the calibration envelope** (fill ratio roughly
  55–110 %); extrapolation is flagged.
- This is an **estimation aid, not a load-development authority**. Always verify any
  charge against official manufacturer data.

### Independent cross-check (QuickLOAD)

As an out-of-sample, cross-tool check, the estimator was compared with a
**QuickLOAD** report for **6.5 Creedmoor / Vihtavuori N160 / 143 gr ELD-X**
(24.4″ barrel). N160 is a Vihtavuori powder added by its constants only, with **no
VV calibration** (coefficients fitted on Reload Swiss). Across the charge ladder the
muzzle-velocity agreement is **within ~3.5 %**, and at the nominal charge (42.3 gr)
QuickLOAD gives 784 m/s / 3102 bar versus 759 m/s / 3036 bar here — **−3.2 % / −2.1 %**.
A second QuickLOAD report for the same load confirms velocity (778.8 m/s, **−3.0 %**)
but lists 3342 bar — i.e. **QuickLOAD's own two runs disagree by ~8 % on pressure**.
The estimator sits just below both, consistent with treating pressure as indicative.
Velocity agreement (~3 %) supports the cross-brand generalization claim (§4) against
an independent reference.

## 7. Data provenance and licensing

- **Component database** (powder $Q_\mathrm{ex}$, $B_a$, $\rho_b$; cartridge
  geometry) derived from **Gordon's Reloading Tool** (Gordon, deceased) and the
  community dataset *zen/grt_databases* (CC0 1.0).
- **Caliber capacities** are derived aggregates (medians) over the calibration set —
  physical constants, publicly known.
- **Manufacturer load tables** (Reload Swiss Guide 2025) are used for calibration
  only and are **not redistributed**.

## See also

- [`CALIBRATION.md`](CALIBRATION.md) — detailed extraction & calibration pipeline.
- [`DATA_FORMAT.md`](DATA_FORMAT.md) — data file schemas.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — adding powders, cartridges, data.

## References

1. Reload Swiss — *Reloading Guide 2025* (joint $v_0$ + $P_\max$ load data).
2. Corner, *Theory of the Interior Ballistics of Guns* (1950).
3. Carlucci & Jacobson, *Ballistics: Theory and Design of Guns and Ammunition*.
4. Le Duc, empirical $v(x)$ velocity–travel relation.
5. zen/grt_databases (CC0 1.0) — community GRT component data.
