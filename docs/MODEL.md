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

It is a **lumped-parameter (0-D)** model — the model family that the field's review
literature [6] identifies as the standard for fast parametric work (vs the heavier
multiphase CFD codes), while noting that such 0-D models structurally cannot capture
pressure waves or flame-spread non-uniformity, so their **pressure output is inherently
indicative**. The same review also observes that the published models (0-D and CFD
alike) are **overwhelmingly built and validated for medium/large-calibre artillery**
(AGARD test gun) and that **small-calibre guns are under-served** — which is exactly why
transplanting an artillery-lineage combustion solver (GRT, QuickLOAD, TorShot) onto
small arms is ill-conditioned, and motivates the data-calibrated approach here.

This estimator deliberately does **not** integrate a burn-rate ODE. The reason is
structural: faithful 0-D solvers (QuickLOAD, Gordon's Reloading Tool) rely on a
propellant **form function** and an **energy-partition model** that are proprietary and
were never published (the GRT author is deceased). Attempts to calibrate the open
burn-rate ODE against published data plateaued at ~16 % RMS because a single burn
process couples velocity and pressure into an inconsistent ("over-peaked") pressure
curve. (The closed-form **Mayer–Hart** lumped model [2,7] is the closest published analogue
to the η_b/η_p approach used here; we implemented it as an independent cross-check — it
corroborates the velocity coupling at ~9 % RMS but is itself out of its formal validity
envelope for smokeless small-arms loads and is not a remedy for the pressure scatter. See
Appendix A and §6.)

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

> **Theoretical grounding (not just curve-fitting).** This definition is *not* an ad-hoc
> empirical convenience: it is exactly the muzzle-energy relation of the classical
> closed-form **Mayer–Hart** lumped model (Corner [2]; Mayer & Hart [7]). Their Eq. (22)
> can be written $E_m = C\,Q_\mathrm{ex}\cdot\eta_b^{\mathrm{MH}}$ with
> $\eta_b^{\mathrm{MH}} = 1 - e^{-(\gamma-1)r}\,[1-(\gamma-1)\varphi]^{-1}$ — i.e. the same
> "fixed fraction of the chemical energy reaches the muzzle" structure, with an analytic
> expression for that fraction in terms of the expansion ratio $r$ and loading $\varphi$.
> We replace that analytic fraction by a **data-calibrated $\eta_b$**. Computing it per-load
> from the Mayer–Hart constants instead is possible (we implemented it, Appendix A) but needs
> per-powder thermochemistry *and* a measured pressure, and is no more accurate (~9 % RMS) —
> so Mayer–Hart serves as the **theoretical scaffold of the retained approach** while the
> calibration supplies the working constants. Full derivation, the numerical check
> ($E_k/(C Q_\mathrm{ex})=0.285\approx\eta_b$) and a runnable cross-check are in **Appendix A**.

**Hybrid fallback (no $Q_\mathrm{ex}$/$B_a$).** Since the *effective* specific energy
$E_\mathrm{eff} = \eta_b\,Q_\mathrm{ex}$ is near-universal across smokeless powders
(≈ 1.1 MJ/kg, CV ~17 %), a powder with only its bulk density known can be predicted
from a fitted $E_\mathrm{eff} = a + b\,(\varphi/100)$:
$v_0 = \sqrt{2\,E_\mathrm{eff}\,C / m_e}$. Leave-one-powder-out shows this matches the
$\eta_b$ path (**10.1 % vs 9.8 %**) — the GRT-specific constants add almost nothing at
cold start. The tool uses the $\eta_b$ path when $Q_\mathrm{ex}$ and $B_a$ are present,
and the $E_\mathrm{eff}$ fallback otherwise (coefficients in `model_coefficients.json`).

In the fallback, **bulk density `pcd` is optional**: it enters only through the fill
ratio, which feeds the domain warnings and the (weak) pressure term — *not* the
velocity (a constant $E_\mathrm{eff}$ scores 10.05 % LOPO vs 10.06 % with the fill
term). When `pcd` is absent, fill defaults to a nominal 100 %, so a velocity estimate
needs only charge and bullet mass.

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
against the model's intrinsic scatter.

**Re-checked on the larger Western set** (Accurate/Ramshot, with COAL + bullet type):
COAL/seating still barely moves velocity (8.7→8.6 %, ~1 pt on pressure, r ≈ 0.24).
Velocity residuals *do* differ by bullet category (bias −4 % soft/tip/mono … −9 %
FMJ/plinking, ~5 pt spread) — but that spread is mostly the **brand bias** (fixed by
the multi-brand $E_\mathrm{eff}$) and the **pistol/rifle class** confound, not pure
construction; and any genuine per-combo effect is **already captured by the anchors**
(`anchors.json`) where data exists. A per-bullet-type input would add a control for a
~2-3 pt, confounded residual. Mass stays the single bullet input.

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

Current fitted coefficients ($\eta_b$ on Reload Swiss; $\eta_p$ recalibrated
**multi-brand** on Reload Swiss + Accurate/Ramshot to remove the cross-brand bias —
see `scripts/fit_pressure_multibrand.js`). The fallback $E_\mathrm{eff}$ is **not**
fitted multi-brand: in production, powders with $Q_\mathrm{ex}$/$B_a$ (RS, VV) take the
$\eta_b$ path and **never** reach $E_\mathrm{eff}$, so averaging it over RS (whose mean
effective energy ≈ 1.11 MJ/kg) dragged it ~3 % below its real clientele — the
no-$Q_\mathrm{ex}$/$B_a$ powders (Accurate/Ramshot ≈ 1.27 MJ/kg). $E_\mathrm{eff}$ is
therefore calibrated on **measured loads of its own clientele** (Western), keeping the
(positive, physical) slope and recentering only the level to zero the velocity bias:
$$E_\mathrm{eff} = 1\,185\,074 + 77\,418\,(\varphi/100)\ \text{J/kg}.$$
This takes the fallback velocity bias on Accurate/Ramshot from $-3.2\%$ to $\approx 0\%$
(RMS 6.6 → 5.9 %). Because $P_\max \propto v_0^2$, this removed ~6 points of pressure
under-estimation — see §6 (the propagated velocity bias was the larger half of it).

$$\eta_b = 0.1628 + 0.1218\,\tfrac{\varphi}{100} + 0.0180\,B_a,$$
$$\eta_p = 0.7741 + 0.1481\,\tfrac{\varphi}{100} - 0.2196\,\ln R_e.$$

The multi-brand $\eta_p$ centres the bias (RS $+5\%$, Accurate/Ramshot $-7\%$, overall
$\approx 0\%$; RMS ~17.5 %) instead of favouring Reload Swiss — pressure stays
indicative.

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

### 6.1 A ceiling shared by every available tool — the data-driven reality

It is tempting to read this model's limits as the price of being "only empirical", and
to assume a physics-based solver (QuickLOAD, GRT, the MATLAB TorShot code, the artillery
codes IBHVG2 / STANAG 4367) would not share them. That assumption is wrong, and it is
worth stating plainly because it governs what any small-arms tool can honestly promise.

**Every available tool is data-driven — the engines differ, the dependence on calibration
data does not.** A 0-D burn-rate solver does not predict pressure from first principles.
Its decisive inputs are themselves *fitted to firings*: the propellant **form function**,
the **vivacity / burn-rate law** $r=\beta\,\bar P^{\,\alpha}$ (Vieille coefficients measured
in a **closed-bomb** test), the **impetus** and **covolume**, the **heat-loss fraction**,
and the **shot-start / bore-resistance** pressures. These are not knowable a priori for a
given commercial lot; they are reverse-engineered so the code reproduces reference data.
The published review of the field [6] makes the same point structurally: 0-D models cannot
represent pressure waves or flame-spread non-uniformity at all, so their pressure number is
a *calibrated interpolation*, not a derivation. Our η_b/η_p model simply makes that
calibration **explicit and auditable** (two efficiencies, published coefficients, stated
RMS) instead of burying it inside a proprietary, unpublished form function.

Consequently the **ceiling is common to all of them**, and it has four data-side causes
that no choice of engine removes:

1. **Measurement-scale divergence.** Reference pressures are produced by *different
   protocols* — **CIP** (transducer, drilled case) vs **SAAMI** (conformal/copper-crusher
   lineage), in different test barrels. The same cartridge reads differently on each. We
   measured this directly: η_p differs ~10 % between a CIP-sourced brand (Reload Swiss) and
   SAAMI-sourced brands (Accurate/Ramshot), and **no physical model can reconcile two
   measurement scales** — a solver calibrated on one is biased on the other exactly as we
   are (§6, decomposition).
2. **Reference data is itself noisy.** Two QuickLOAD runs for the *same* load disagree by
   **~8 % on pressure** (below). When the calibration target has ~8 % internal spread, no
   tool calibrated to it can claim better than indicative pressure.
3. **Lot-to-lot propellant variation.** Burn-rate and impetus drift between production lots
   by several percent — larger than many of the modelling refinements being argued over.
4. **The small-calibre gap.** The review [6] notes that the published models (0-D and CFD)
   are built and validated for **medium/large-calibre artillery** (AGARD test gun); small
   arms are under-served. A solver whose constants were tuned on artillery is *not* a
   first-principles authority when pointed at a 9 mm case.

**What this means for the product.** No currently available tool — empirical or
"physical" — can deliver a trustworthy *safety* verdict on an arbitrary untested load; all
of them are interpolators over calibration data of finite, scale-divergent, noisy quality.
The honest levers are therefore **not** a more elaborate combustion engine but: (i)
**transparency** about the calibration and its error; (ii) **anchoring** on data close to
the user's actual load (§5.5), which sidesteps the cross-brand/scale residual where it
matters; and (iii) **never** rendering a "safe" verdict from a cold prediction. This is the
design stance of the estimator, and it is a deliberate consequence of the analysis above —
not a limitation we expect to engineer away.

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

A larger cross-check against the **Western Powders guide** (1248 Accurate/Ramshot
max loads, cartridge + bore verified) gives **velocity RMS 8.7 %** — confirming
cross-brand generalization of the velocity model. The original RS-only η_p gave a
**−19 % pressure bias** on this set; the multi-brand η_p (§5.3) centred it.

### Independent pressure cross-check (Vihtavuori, at the CIP ceiling)

A third, larger pressure cross-check uses the **Vihtavuori guide**, whose *max* loads are
explicitly set **at the C.I.P./SAAMI limit** — so each max load is a clean
$(v_0,\;P_\max\!=\!\text{CIP})$ pair. Feeding VV's measured $v_0$ + geometry into the
production η_p model and comparing the predicted $P_\max$ to the cartridge CIP
(`scripts/vv_pressure_crosscheck.js`, **3245 max loads** with a CIP value):

| Class | Bias vs CIP | RMS |
|---|---|---|
| rifle | **−17.1 %** | 18.8 % |
| handgun | +3.0 % | 35.1 % |
| all | −13.4 % | 22.7 % |

The **rifle −17 %** independently reproduces the pressure under-estimation seen on Western
(−19 %) and QuickLOAD — a *third* source (now European **CIP**, vs Western **SAAMI**) confirming
the §6 ceiling: at a true at-the-limit load the estimate reads ~17 % low, i.e. a max load can
display as ~83 % of CIP. Handgun pressure is near-zero-bias but very scattered (RMS 35 %),
consistent with η_p being least reliable for small fast-powder cases. This is the quantified,
multi-source basis for **never** rendering a "safe" verdict from a cold pressure estimate.

**Decomposition of the residual pressure under-estimation** (1121 matched Accurate/
Ramshot loads, `scripts/fit_pressure_multibrand.js`). Because $P_\max \propto v_0^2$,
a velocity bias enters pressure roughly doubled, so the pipeline bias splits in two:

| Stage | Bias | RMS |
|---|---|---|
| $v_0$ (fallback $E_\mathrm{eff}$) | −3.2 % → **0.0 %** | 6.6 → 5.9 % |
| $P_\max$ given **measured** $v_0$ (η_p alone) | −7.1 % | 16.9 % |
| $P_\max$ **full pipeline** (predicted $v_0$) | −12.5 % → **−6.6 %** | 22.6 → 21.1 % |

Recentering $E_\mathrm{eff}$ on the fallback's own clientele (§5.3) zeroed the velocity
bias and **halved the pipeline pressure bias** (−12.5 → −6.6 %). The remaining −6.6 % is
now the η_p term (−7.1 %), whose cross-powder scatter is irreducible without per-powder
vivacity ($B_a$ exists for only 16 of 469 powders). Pressure therefore stays
**indicative only**, with no "safe" verdict ever shown — note the fix moves the estimate
*upward* (less under-estimation), i.e. in the safer direction for a CIP check.

**Why the η_p residual is not closed by a brand or feature term (tested).** The split is
structural — RS actual η_p ≈ 0.447 vs Accurate/Ramshot ≈ 0.407 (~10 %) — and survives the
pistol/rifle split (RS rifle 0.456 vs Western rifle 0.405). Leave-one-**brand**-out shows
no fix generalizes: adding $\ln(\text{loading density})$ leaves the in-sample bias and
**blows up** LOBO RMS (20.7 → 37.9 %); a pistol term gives LOBO RMS 122 %; an explicit
brand dummy corrects in-sample but by construction does not transfer to the other brand
(LOBO) and is undefined for the ~450 powders with no joint data; equal-brand weighting
moves Western only −7.1 → −6.1 %. The most likely cause is a **pressure-measurement-method
offset** (RS reports **CIP**; Accurate/Ramshot report **SAAMI** — different protocols give
different numbers for the same round), which no physical model can reconcile. The residual
is therefore treated as irreducible at the global cold-start level; the lever for it is
**anchoring** (§5.5, per-cartridge×powder `np`), not a richer global η_p.

## 7. Data provenance and licensing

- **Component database** (powder $Q_\mathrm{ex}$, $B_a$, $\rho_b$; cartridge
  geometry) derived from **Gordon's Reloading Tool** (Gordon, deceased) and the
  community dataset *zen/grt_databases* (CC0 1.0).
- **Caliber capacities** are derived aggregates (medians) over the calibration set —
  physical constants, publicly known.
- **Manufacturer load tables** (Reload Swiss Guide 2025) are used for calibration
  only and are **not redistributed**.

## Appendix A. Mayer–Hart closed-form model (explored)

The review [6] highlights the **Mayer–Hart** lumped model (Mayer & Hart, 1945 [7]) — the only
classical model giving *closed-form* expressions for peak pressure and muzzle energy.
We examined whether it can serve as an **independent thermochemical cross-check** for our
efficiencies. The relevant forms (review Eqs. 21–22, in our symbols) are:

$$P_{\max}^{\,\mathrm{MH}} = \frac{P_q}{e}\,\Bigl[1+\tfrac34(\gamma-1)\Bigr]^{-1},
\qquad
E_m^{\,\mathrm{MH}} = \frac{C\lambda}{\gamma-1}\Bigl(1 - e^{-(\gamma-1)r}\,[1-(\gamma-1)\varphi]^{-1}\Bigr),$$

with $\lambda$ the specific force (impetus), and $P_q,\varphi,r$ analytic constants. The
primary source [7] defines them (its Eqs. 8, 28, 29, 30) — with $v_0$ the **free volume**
(case minus solid propellant, MH assuming covolume = charge volume):

$$p_c=\frac{C\lambda}{v_0},\quad p_q=e\,P_\max\bigl[1+\tfrac34(\gamma-1)\bigr],\quad
\varphi=\frac{p_c}{2p_q},\quad r=\ln\frac{v_0+AL}{v_0}.$$

The burn-rate constant $q$ (our $B_a$) is **eliminated** by reading $p_q$ from a *measured*
pressure (Eq. 28), so the link can be tested without it.

**Finding 1 — Eq. 22 *is* our $\eta_b$, in closed form.** Since $\lambda=Q_\mathrm{ex}(\gamma-1)$,
the prefactor $C\lambda/(\gamma-1)=C\,Q_\mathrm{ex}$ is the total chemical energy, so Eq. 22
reads $E_m = C\,Q_\mathrm{ex}\cdot\eta_b^{\mathrm{MH}}$ with
$\eta_b^{\mathrm{MH}}=1-e^{-(\gamma-1)r}[1-(\gamma-1)\varphi]^{-1}$ — i.e. Mayer–Hart gives
the **functional form of the ballistic efficiency we fit empirically** (§3.1). Measured on
the 1700-load RS set, $E_k/(C\,Q_\mathrm{ex})=0.285$ (CV 17 %), matching the fitted
$\eta_b\approx0.29$. So Mayer–Hart is the *theoretical scaffold* that explains why $\eta_b$
is bounded near 0.29 and predicts it should depend on the **expansion ratio** ($r$) and
**loading** ($\varphi$). (Note a tension with §5.4: empirically the expansion ratio does
*not* reduce cross-cartridge $\eta_b$ error — Mayer–Hart's $r$-dependence is a same-gun
charge-ladder effect, largely absorbed into the per-cartridge scatter.)

**Finding 2 — implemented and run** (`scripts/mayer_hart_crosscheck.js`, 1700 RS loads with
$Q_\mathrm{ex}$, $\gamma=1.20$). With the primary-source constants the link is now computable
two ways, each using thermochemistry + geometry + *one* measured value, and **never** our
$\eta_b/\eta_p$:

| Direction | Predict | Bias | RMS |
|---|---|---|---|
| A | $v_0$ from **measured $P_\max$** | **+5.0 %** | **8.7 %** |
| B | $P_\max$ from **measured $v_0$** | −13.5 % | 41.2 % |

Direction A — an independent thermochemical velocity prediction — corroborates the model at
**~9 % RMS** (≈ our $\eta_b$ cold-start), confirming that the $(v_0,P_\max)$ coupling the two
efficiencies jointly encode is the one the 1945 theory derives. Direction B (pressure from
velocity) is **poor (~41 % RMS)**: inverting Eq. 34 for $\varphi$ amplifies noise, so MH is
*not* a usable independent pressure estimator in this regime.

**The validity envelope quantifies the small-calibre gap.** MH's closed form is formally valid
only for $\varphi\le 1/(2\gamma)\approx0.4$ (Eq. 33′). Modern smokeless small-arms loads sit far
outside it — mean $\varphi=0.81$, with **94 % of RS loads violating $\varphi\le0.4$** — because
their loading density dwarfs the 1945 artillery regime the theory was built for. This is
exactly the "small-calibre gap" the review [6] flags, here made numerical: the classical
closed form degrades gracefully on velocity (Direction A still ~9 %) but cannot be trusted on
pressure for our cartridges.

**Verdict.** Mayer–Hart is confirmed as the **theoretical scaffold** of the retained approach
(Finding 1) and gives a *working independent velocity cross-check* (Direction A) — a genuine,
non-circular corroboration. It is **not** an independent pressure estimator here (Direction B,
out of validity envelope) and so does **not** lift the §6.1 pressure ceiling: like every lumped
model it ultimately ties pressure to firing-calibrated constants. Net value delivered:
theoretical grounding + a reproducible velocity check; no change to the production model.

The guard built on Direction A (`scripts/build_anchors.js`, fields `mhr`/`mhflag` per anchor)
needs a per-powder $Q_\mathrm{ex}$, available for only the powders with measured thermochemistry.

## Appendix B. Extending the guard: Qex interpolation (explored, rejected) vs real import

The Mayer–Hart guard (Appendix A) covers only powders with a known specific energy
$Q_\mathrm{ex}$. We explored **interpolating $Q_\mathrm{ex}$ by powder family** to extend it to
the ~450 catalogue powders that carry only a bulk density. **Verdict: too coarse — rejected.**
On 35 GRT powders with measured $Q_\mathrm{ex}$ spanning both families:

- by **base**: single 3834 vs double 4067 kJ/kg — a ~6 % mean gap, *smaller* than the
  within-family scatter (σ ≈ 7 %); by **type** only "flake" stands out (~4350). Family
  explains little.
- the real blocker is **$\gamma$**: the guard uses $\lambda=Q_\mathrm{ex}(\gamma-1)$, and the
  measured $\gamma$ ranges **1.14–1.27**, so $(\gamma-1)$ varies ~2×. Guessing both
  $Q_\mathrm{ex}$ (±7 %) and $\gamma$ for a catalogue powder gives a $\lambda$ error of
  20–30 % → ~10–15 % velocity noise, which **swamps** the guard's 12-pt (2σ) threshold.

So interpolated thermochemistry cannot feed the guard reliably. Instead we **import the real
$Q_\mathrm{ex}$** from the GRT `.propellant` files (`scripts/import_grt_qex.js`, CC0 source),
which carry measured $Q_\mathrm{ex}$, $\gamma$ and covolume. This added 8 powders
(Accurate Magpro, Alliant Reloder 15 / Red Dot, Hodgdon Clays / Superformance,
Ramshot Enforcer, Winchester StaBall Match / HD) and extended the guard from 171 to **179
anchors** — notably onto **SAAMI-brand** (Accurate/Ramshot) anchors, where it is most useful.
**Import is Qex-only by design** (not $B_a$), so the production velocity path is unchanged
(η_b needs both); the sole effect is wider guard coverage with *real*, not guessed, constants.

## See also

- [`CALIBRATION.md`](CALIBRATION.md) — detailed extraction & calibration pipeline.
- [`DATA_FORMAT.md`](DATA_FORMAT.md) — data file schemas.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — adding powders, cartridges, data.

## References

1. Reload Swiss — *Reloading Guide 2025* (joint $v_0$ + $P_\max$ load data).
2. J. Corner, *Theory of the Interior Ballistics of Guns*, John Wiley & Sons, New York;
   Chapman & Hall, London, 1950 (viii + 442 pp.). Contains the lumped-parameter theory
   and the Mayer–Hart-type closed-form solution.
3. Carlucci & Jacobson, *Ballistics: Theory and Design of Guns and Ammunition*.
4. Le Duc, empirical $v(x)$ velocity–travel relation.
5. zen/grt_databases (CC0 1.0) — community GRT component data.
6. F. Ongaro, C. Robbe, A. Papy, B. Stirbu, A. Chabotier — *Modelling of internal
   ballistics of gun systems: A review*, Defence Technology 41 (2024) 35–58,
   doi:10.1016/j.dt.2024.05.004 (open access). Classifies lumped-parameter vs CFD
   models; documents Baer–Frankle, IBHVG2, STANAG 4367, Mayer–Hart; notes the
   small-calibre gap.
7. J. R. Mayer & B. I. Hart, *Simplified Equations of Interior Ballistics*, Journal of
   the Franklin Institute, vol. 240, no. 5, Nov. 1945, pp. 401–411. Primary source for
   the closed-form $P_\max$ / muzzle-energy expressions and the constants $P_q,\varphi,r$.
