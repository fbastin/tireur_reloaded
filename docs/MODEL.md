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

**Barrel-length scaling.** $\eta_b$ is geometry-free, so the equation above yields the
velocity **at the calibration (reference) barrel** $L_\text{ref}$ — the test-barrel length
the manufacturer data was measured at. The muzzle velocity at the *user's* barrel
$L_\text{user}$ is then obtained, for a **rifle** cartridge, with **Powley's rule** on the
expansion ratio, $v_0 \propto \sqrt{1 - R^{-1/4}}$, $R = 1 + A x / U$ ($x$ bullet travel, $U$ the
usable case capacity, the user's if entered; `VelocityModel.scaleByBarrelFor`), in the form of the
kwk.us calculator after Davis (1981). On 43 published cut-down series it beat a fixed exponent on
15 of 18 rifles, including the 6 barrels of two sources independent of the first experimenter
(sign test p = 0.004; [`BARREL_LENGTH.md`](BARREL_LENGTH.md)); the gain is small near the .308's
expansion ratio and large on magnums. Switched on 2026-10-11: the estimator's own validations
barely move, because manufacturer test barrels are close to the reference barrel (Lyman rifle
RMS 10.6 → 10.5 %, anchored leave-one-out 3.7 % unchanged); at a 16-inch user barrel the
displayed velocity drops by 1.3 % in the median, by up to 4.5 % on the largest magnums.
**Handgun** cartridges keep the empirical **power law** $v_0(L) = v_\text{ref}\,(L/L_\text{ref})^{k}$,
$k = 0.15$ on bullet travel (`VelocityModel.scaleByBarrel`), the median of 19 rifle series
(0.10–0.28; `scripts/barrel_exponent_fit.py`): no handgun cut-down series has been tested.
The former 0.27, credited to Powley/Litz, matched no measurement found; Powley's own rule is
$R^{-1/4}$ on the expansion ratio, not a power of barrel length.
Conversely, a velocity the user *supplies* (chronograph `vmeas`, or a rifle anchor fitted
from a chrono ladder) is already at $L_\text{user}$, so it is scaled **back** to
$L_\text{ref}$ before feeding the pressure equation (§3.2). At $L_\text{user}=L_\text{ref}$
the scaling is unity, so calibration and validation are unchanged. This makes velocity
**rise with barrel length** (with diminishing returns) while peak pressure stays
barrel-independent — the physically correct pairing. Far from $L_\text{ref}$ (ratio outside
~0.6–1.7) the extrapolation is flagged and best confirmed at the chronograph.

**User case capacity (loading-density assumption, 2026-10-13).** When the user enters a usable
case capacity $V$ different from the nominal $V_n$, the prediction is first made at $V_n$ (anchor
or cold model), then scaled as for the charge of the same loading density in the nominal case:
with $r = V_n/V$, $E_\mathrm{eff} \times r^{\delta}$ and $\eta_p \times r^{\delta-\gamma}$, i.e. at equal
charge $v_0 \propto r^{\delta/2}$ and $P_\max \propto r^{\gamma}$ (local-law exponents, §3.5). A case 10 %
smaller thus gives +23 % pressure and +4.6 % velocity. Before this date the UI applied the
*cold* model's fill and expansion-ratio terms instead — a regression across cartridges and
powders, silent about volume within one cartridge: a case 10 % smaller *lowered* the displayed
pressure by 0.7 % (.308 + Varget). The legacy burn-rate solver (`legacy/grt_solver.js`, explicit
chamber volume) gives, at equal charge, $d\ln P/d\ln V$ = −2.1 to −2.3 and $d\ln v/d\ln V$ ≈
−0.4 to −0.5 (.308 + RS 52, 9 mm + RS 12); the assumption gives $-\gamma \approx -2.0$ and
$-\delta/2 \approx -0.43$. It is not validated on measurements, and the UI says so. Usable capacity
entered as *full* (empty case to the brim) is converted with 0.90 for a rifle (median of 21
Peterson-measured cartridges, `calibers/facteur_utile.py`) and 0.66 for a handgun (no source).

### 3.2 Peak pressure — piezometric efficiency $\eta_p$

The **piezometric efficiency** relates the (work-equivalent) mean pressure to the
peak pressure. Equating the work done on the projectile to its kinetic energy,
$\bar P\,A\,L = E_k$, and writing $\eta_p \equiv \bar P / P_\max$:

$$\boxed{\,P_\max = \dfrac{\tfrac12 m_e v_0^2}{\eta_p\,A\,L}\,}$$

Pressure therefore depends on bore geometry ($A$, $L$) and on $\eta_p$.

> **Peak pressure is evaluated at a reference (test-barrel) travel, not the user's barrel.**
> Peak chamber pressure forms in the first few centimetres of bullet travel (the Le Duc
> peak is at $x=b/2$) and is **physically almost independent of total barrel length**. But
> the identity above ($\bar P\,A\,L = E_k$ with $E_k$ frozen, since velocity is
> geometry-free, §3.1) would make $P_\max \propto 1/L$ — so lengthening the barrel would
> *spuriously* lower the predicted peak pressure. To avoid this artefact, $P_\max$ (and the
> $\ln R_e$ term in $\eta_p$) is computed at a **fixed reference travel** $L_\text{ref} =
> L_\text{test} - L_c$ — the cartridge's standard test-barrel length (`test_barrel_mm`,
> default 600 mm rifle / 122 mm handgun), which is also the geometry $\eta_p$ was calibrated
> at. Pressure is thus a function of charge/bullet/cartridge only; the user's barrel length
> drives velocity (via the separate Le Duc tool) and the displayed pressure/travel extent,
> **not** the peak-pressure number.

### 3.3 Auxiliary geometric quantities

- **Travel:** $L = L_b - L_c$ (bullet base assumed near the case mouth).
- **Fill ratio** (loading density proxy): $\varphi = \dfrac{C/\rho_b}{V_0}$ (reported in %).
- **Expansion ratio:** $R_e = 1 + \dfrac{A\,L}{V_0}$.

The effective chamber volume $V_0$ per cartridge is taken from a standard caliber
table (`data/calibers.json`); $Q_\mathrm{ex}$, $B_a$, $\rho_b$ per powder from
`data/powders.json`.

### 3.4 Pressure–travel curve (Le Duc layer)

For display, a two-parameter Le Duc profile $v(x) = \dfrac{a\,x}{b+x}$ is **anchored**
on the predicted pair $(v_0, P_\max)$. With $P(x) = \dfrac{m_c\,a^2 b\,x}{A\,(b+x)^3}$,
$m_c = m + C/2$, and peak at $x = b/2$, the constants $(a,b)$ are obtained in closed form from
$v(L)=v_0$ and $P_\max$. This layer adds **no new degrees of freedom**.

These are the formulas given by Alger [4] (*a* the velocity in a bore of infinite length, *b*
twice the travel to peak pressure, $P_\max = 4\,p\,a^2/(27\,g\,\omega\,b)$). **With the
projectile mass alone, the pressure they give is the *effective* pressure on the projectile
base.** Alger adds that the gas pressure at the base is somewhat higher still, and that the
chamber pressure where gauges read it is 15–20 % above the base pressure; Patterson [8] adds
12 %. The Lagrange gradient puts the breech pressure at $p_\text{base}(1 + C/2m)$ (Carlucci &
Jacobson [3], eq. 3.54, p. 71), 10–25 % above the base pressure for the rifle loads of the barrel-length test; with $m_c = m + C/2$
the curve is therefore a **chamber-pressure** curve, of the same kind as the C.I.P. or
manufacturer $P_\max$ it is anchored on. The effective mass $m_e = m + C/3$ of the energy model
belongs to the space-mean pressure (eq. 3.59) and was used here until 2026-10-11, which anchored
a chamber $P_\max$ 3–7 % too high; on 27 cut-down barrel series ([`BARREL_LENGTH.md`](BARREL_LENGTH.md))
the change lowered the median velocity error from 41.1 to 34.7 fps (reference) and from 37.0 to
31.4 fps (validation). After the peak the two-parameter curve falls below measured pressure: on a
single instrumented 5.56 × 45 shot, about 520 bar at the muzzle against 900 measured [9]. The layer is used for display only.

### 3.5 Local laws around an anchor: charge and bullet mass (2026-10-10)

Until 2026-10-10 an anchor was a constant pair (mean $E_\mathrm{eff}$, mean $\eta_p$). With the
energy constant, a given bullet followed $v_0 \propto \sqrt{C/m_e}$ and $P_\max \propto C$, and
$P_\max$ did not depend on bullet mass at all. The manuals say otherwise. Same bullet, start to
maximum load (medians of the per-bullet slopes):

| | model before | manuals |
|---|---|---|
| $v_0$ vs $C$ | $C^{0.5}$ | $C^{0.92}$ Western (6 083 bullets), $C^{0.93}$ Vihtavuori (4 550), $C^{1.04}$ Reload Swiss (849) |
| $P_\max$ vs $C$ | $C^{1}$ | $C^{2.7}$ Reload Swiss — the only guide measuring pressure at both charges (quartiles 2.2–3.1) |

Holding one bullet out and predicting it from the pair's other bullets (1 976 anchored pairs),
the anchored pressure was **9 % low at Reload Swiss maximum loads**, 16 % high at their
starting loads, **11 % low for bullets more than 16 % heavier** than the pair's mean, and 13 %
high for lighter ones — the low errors in the dangerous direction.

**Reference barrel.** Each published load is now brought back to the cartridge's reference
barrel (`test_barrel_mm`) before it enters an anchor: velocity by the barrel law of §3.1,
energy accordingly, and $\eta_p$ recomputed at the reference travel, since peak pressure does
not depend on barrel length. Until then an anchor kept the energy and $\eta_p$ of each source's
own barrel, while the tool reads them at the reference travel: a Reload Swiss 9 mm load measured
on 122 mm was read on the 102 mm test barrel, its pressure inflated by a quarter. Sources that
publish no barrel length are taken as they are, as before.

The anchor is now a **reference point** $(\bar C, \bar m)$, the geometric means of the pair's
charges and bullet masses, and

$$E_\mathrm{eff}(C,m) = \bar E\,(C/\bar C)^{\delta}(m/\bar m)^{\beta},\qquad
\eta_p(C,m) = \bar\eta_p\,(C/\bar C)^{\varepsilon}(m/\bar m)^{\zeta},$$

with $\varepsilon = \delta + 1 - \gamma$ and $\zeta = \beta - \alpha$ (since
$\eta_p = E_\mathrm{eff}\,C/(P_\max A L)$), so that $P_\max \propto C^{\gamma} m^{\alpha}$.
$\bar E$ and $\bar\eta_p$ are the geometric means of the pair's loads, each brought back to
the reference point first. Exponents (`scripts/fit_local_laws.js`, fixed-effects least squares,
block `local` of `model_coefficients.json`):

| | value | definition | estimated on |
|---|---|---|---|
| $\delta$ | 0.824 | $\partial\ln E_\mathrm{eff}/\partial\ln C$, same bullet | 21 890 loads, all sources |
| $\gamma$ | 1.948 | $\partial\ln P_\max/\partial\ln C$, same bullet | Reload Swiss (1 706 loads) |
| $\beta$ | 0.581 | $\partial\ln E_\mathrm{eff}/\partial\ln m$, between bullets of a pair and source, charge brought back by $\delta$ | 29 167 loads |
| $\alpha$ | 0.921 | $\partial\ln P_\max/\partial\ln m$, idem, charge brought back by $\gamma$ | 10 855 loads with pressure |

**Order matters.** Manufacturers' maximum loads all sit at the pressure ceiling, so between
bullets charge and mass move together ($C_\max \propto m^{-0.44}$, Western). Only $\gamma$
measured *within* a bullet separates the two effects; it is estimated first. Applying the
charge law without the mass law is worse than nothing (pressure RMS 15.0 → 22.5 %, light bullets
+27 %).

**Why $\gamma \approx 2$ and not 2.7.** The median per-bullet slope, 2.7, is the real slope of a
charge ladder (2.6–2.9 for the 85 % of bullets whose start–max spread is under 22 %; about a
hundred wide-spread Reload Swiss bullets pull the pooled estimate down to 1.99). But between two
bullets of the same weight the maximum charge also varies with construction (bearing surface,
monolithic bullets — the latter now declared by the user, § 3.6), which the model cannot see; a large $\gamma$ amplifies that scatter, and a
"hard" bullet at its own maximum then reads well below the limit — a false margin. Scan, $\alpha$
re-estimated for each $\gamma$, pressure, bullet held out:

| $\gamma$ | $\alpha$ | all: bias / RMS | RS max: bias / RMS | other max loads | under by >15 % |
|---|---|---|---|---|---|
| 1.00 | 0.48 | +0.2 / 10.4 % | −10.6 / 14.2 % | −0.1 / 8.0 % | 4.4 % |
| 1.50 | 0.69 | +0.3 / 11.6 % | −6.7 / 14.1 % | +0.1 / 10.2 % | 5.9 % |
| **1.99** | **0.90** | **+0.7 / 14.6 %** | **−2.5 / 16.8 %** | **+0.5 / 13.7 %** | **7.8 %** |
| 2.45 | 1.09 | +1.1 / 18.8 % | +1.8 / 21.6 % | +1.0 / 18.3 % | 9.8 % |
| 2.70 | 1.20 | +1.5 / 21.8 % | +4.3 / 25.0 % | +1.3 / 21.5 % | 10.8 % |

(`node scripts/fit_local_laws.js --scan`, data of 2026-10-13.) A small $\gamma$ fits held-out bullets at their own
maximum best, but leaves every ladder about 10 % low near its top; a large one gets ladders right
and multiplies the large under-predictions. The ordinary estimator (pooled least squares, 1.99)
is kept, without hand tuning: against the anchor it replaces, it is better on every line of the
table below. **A ladder's slope stays below the real one** (2.0 against 2.7):
beyond the published maximum, real pressure climbs faster than the displayed one, and the UI's
ladder table says so.

**Validation, bullet held out** (`node scripts/fit_local_laws.js`), as the tool computes it — at
the reference barrel — bias / RMS:

| | constant anchor at the sources' barrels (before) | local laws, reference barrel |
|---|---|---|
| velocity, all (27 344) | +0.3 / 4.5 % | +0.1 / 3.8 % |
| pressure, all (10 425) | −0.4 / 18.3 % | +0.6 / 14.5 % |
| — Reload Swiss start loads | +15.5 / 29.5 % | +5.7 / 18.8 % |
| — Reload Swiss maximum loads | **−9.2** / 19.1 % | −2.8 / 16.4 % |
| — other maximum loads | −1.0 / 17.0 % | +0.5 / 13.9 % |
| — bullets > 16 % heavier than the pair mean | **−11.3** / 17.0 % | 0.0 / 15.8 % |
| — bullets > 14 % lighter | +12.6 / 23.2 % | −0.4 / 16.4 % |
| pressure under-predicted by more than 15 % | 10.5 % | 7.9 % |

Two sets the anchors never see. **Lyman** (start and maximum velocities): rifle
$E_\mathrm{eff}$ agreement with the anchors 9.5 → 8.1 % RMS, bias −6.2 → −3.7 %, pairs off by
more than 15 %: 28 → 19; handguns 19.7 → 17.7 %, bias −14.1 → −7.9 %
(`scripts/lyman_crosscheck.js`). **ADI** (174 maximum loads with PSI on anchored pairs, pressure
at the reference barrel, `scripts/adi_crosscheck.js`): bias +4.2 → +1.6 %, RMS 16.9 → 16.0 %,
heavy bullets −8.1 → +6.7 %, light +15.2 → −2.4 %; under-predicted by more than 15 %: 3 → 6
loads of 174. Anchored velocity unchanged (6.3 % RMS). *Correction, 2026-10-13: ADI reprints Hodgdon
data — 226 of the 341 ADI rows on anchored pairs (IMR 8208 XBR, Benchmark) are identical to a Hodgdon
or Western row that feeds the anchors, so these "anchored" figures mostly compared data with itself.
`adi_crosscheck.js` now drops the copies and also brings predicted velocities to ADI's barrel (many
rows are fired in a 15 in. barrel against a 24 in. reference). Independent ADI rows on anchored pairs:
velocity +1.1 / 4.4 % RMS (115 rows, cold model on the same rows +1.6 / 6.7 %), pressure −0.8 / 7.8 %
(49 rows) — too few for the mass-bias figures above.*

**Refit, 2026-10-13.** The exponents were estimated again (`node scripts/fit_local_laws.js --write`)
after a day of data corrections: Vihtavuori rows filed under the wrong cartridge or lost (titles
with a decimal comma), lead bullets removed from the anchors (LoadData, Hodgdon, Western), Vectan's
starting velocities dropped — they are computed, $v \propto \sqrt{C}$ to 0.3 %, not measured —
and Nosler added to the rifle anchors where the other sources have fewer than three loads; and
Hodgdon's reprints of Western's Accurate/Ramshot data dropped (1 870 rows identical to a Western row,
filed under Hodgdon's barrel header: .357 Magnum 10 in. instead of Western's 6). Those copies had also
**leaked into the validation**: a bullet held out kept its Western twin in the training set, which made
the pressure look better (14.1 % RMS with them, 14.6 % without).
$\delta$ 0.824 → 0.856, $\gamma$ 1.948 → 1.992, $\beta$ 0.581 → 0.553, $\alpha$ 0.921 → 0.897.
Bullet held out: velocity 3.4 % RMS, pressure +0.7 / 14.6 %, under-predicted by more than 15 %
for 7.8 % of loads, 1st percentile −37 %; cold model 7.7 % and 25.4 %, 20.5 %, −42 %. The tool's
banner quotes these figures. Not tried: a charge exponent by pressure class — ladders of
low-pressure handgun cartridges (under 1 800 bar: .38 Special, .45 Colt) have a median
$\delta$ near 1.0, against 0.74–0.89 for the other handgun classes.

**Subsonic loads removed from mixed pairs (2026-10-15).** Rifle loads published below 340 m/s are
another regime: much lower $\eta_p$, which the local laws cannot link to the supersonic loads. Mixed into a
pair's anchor, they raised the pressure shown for its normal loads: .30-30 + Benchmark +118 %, .30-30 +
H4895 +65 %, .308 + Accurate 5744 +53 %, .308 + H322 +48 %; nine anchors by more than 10 %. This showed up
on ADI's online data, read that day as a test set: one .30-30 load came out at 124 000 psi for 41 400
published. `build_anchors.js` now marks them, and removes them from every pair that also has supersonic
loads (94 loads; 128 subsonic loads were in rifle anchors, the others are in purely subsonic pairs, such as
300 BLK + RS24, which keep them). `build_start_charges.js` drops a subsonic bullet from the window of a
mixed pair (3 windows). With the published exponents, unchanged, bullet held out: pressure +0.5 / **13.1 %**
(14.6 % before), under-predicted by more than 15 % for 7.5 % of loads (7.8 %), 1st percentile −35 %;
Reload Swiss maximum loads −2.9 %; velocity 3.3 % (30 166 loads); cold model 7.6 % (32 609) and 25.3 %,
20.2 %, −40 %. **Not done:** re-estimated without the subsonic loads, the exponents move ($\gamma$ 1.99 →
2.24, $\alpha$ 0.90 → 0.98, $\delta$ 0.856 → 0.882): part of the gap between the pooled $\gamma$ and the
median ladder slope came from these loads. The refit is deferred with that of $\delta$, until the GRT
bench is compared.

**Not applied to the cold model.** Two attempts, both rejected (pressure, all published
loads): charge and mass laws around the cartridge's typical fill and bullet mass, RMS
24.6 → 37.6 % — across powders, fill follows burning rate, not a charge ladder; mass law alone,
heavy bullets −1 → +21 %, light +9 → −15 %. The cold model had no mass bias to fix: its fill and
$B_a$ terms already compensate.

**Temperature.** A predicted velocity is corrected by Litz's generic sensitivity (§ velocity
tool). Pressure, which used to stay at its 21 °C value, now follows as for the equivalent
change of charge: $P \propto v^{2\gamma/(\delta+1)} \approx v^{2.14}$. This is an
**assumption** — no pressure-versus-temperature measurement is in the data.

**User data.** A measured velocity gives the pressure through $\eta_p(C,m)$ of the anchor. A
rifle anchor (ladder) is fitted with the same charge law $\delta$ around its own reference
charge, so its smoothed curve now follows the measurements instead of rising as $\sqrt C$.

### 3.6 Monolithic bullets (2026-10-15)

A monolithic bullet (solid copper or brass) engraves harder, bears longer and, at equal weight, is
longer and sits deeper in the case. At equal charge it gives more pressure, so its published maximum
charge is lower. An anchor mixes both constructions, and the charge law ($\gamma \approx 2$) reads
that lower charge as a lower pressure: held out and predicted from the pair's other bullets, a
monolithic bullet came out **16 % low in a handgun** (56 % of its loads under-predicted by more than
15 %) and 2.8 % low in a rifle. The lead came from ChamberSim Reloaded (GitHub), which gives copper
bullets a higher start pressure.

**Classification.** `scripts/balle_monolithique.js` reads the bullet name of the sources that print
one: Hodgdon, Western and Vihtavuori. It retains the Barnes X family, TSX, TTSX, LRX, MRX, TAC-X and Banded
Solid, Hornady GMX, CX and MonoFlex, Nosler E-Tip, Lapua Naturalis, Lehigh, Cutting Edge, Hammer
and every "Solid". Reload Swiss, Lovex and Nosler print no bullet name, so their loads are not
classified.

**Effect at equal charge and bullet weight** (`scripts/fit_monolithique.js`). Fixed effects per pair ×
source, charge and mass brought back by the local laws:

| | $E_\mathrm{eff}$ | pressure | groups (pressure), positive |
|---|---|---|---|
| rifle, Hodgdon | +1.6 % | +5.3 % | 200, 156 |
| rifle, Western | −0.5 % | +1.9 % | 159, 110 |
| rifle, Vihtavuori | +0.6 % | — | |
| **rifle, retained** | **+0.4 %** | **+3.2 %** | 359, 266 |
| handgun, Hodgdon | +9.7 % | +23.0 % | 67, 62 |
| handgun, Western | +7.7 % | +27.8 % | 55, 46 |
| handgun, Vihtavuori | −9.5 % (18 groups) | — | |
| **handgun, retained** | **+4.8 %** | **+25.3 %** | 122, 108 |

Figures after the subsonic loads were removed from mixed pairs (§ 3.5). A single factor (+7.5 %) over-corrected rifles and under-corrected handguns. The anchors are now
built for a **lead-core** bullet (monolithic loads divided by the factor of their weapon type), and
the tool multiplies $E$ and $\eta_p$ back when the user selects "monolithic". Block `monolithique` of
`model_coefficients.json`: rifle $E$ × 1.004, $\eta_p$ × 0.973; handgun $E$ × 1.048, $\eta_p$ × 0.836.

**Validation, bullet held out, anchored pressure**, bias / RMS, share under-predicted by more than 15 %:

| | without factor | with factor |
|---|---|---|
| rifle, monolithic (770) | −2.8 / 8.7 %, 4.5 % | −0.4 / 8.3 %, 2.5 % |
| rifle, other bullets of anchors ≥ 25 % monolithic (729) | +0.8 / 6.9 % | −0.3 / 6.8 % |
| handgun, monolithic (207) | **−16.3** / 23.8 %, **56.0 %** | +2.4 / 20.9 %, 19.8 % |
| handgun, other bullets of anchors ≥ 25 % monolithic (179) | +7.5 / 19.3 % | −1.1 / 16.5 % |
| all loads (8 319) | +0.5 / 13.1 %, 7.5 % | +0.5 / 12.7 %, 7.0 % |

Cross-checked between sources. The factor measured on one source and applied to the other's
monolithic bullets gives, for handguns, Hodgdon −14.2 → +5.9 % and Western −18.7 → −1.4 %; for
rifles, Hodgdon −4.2 → −3.0 % and Western −1.9 → +2.3 %. The factor is estimated on the same loads,
but its size barely depends on the source.

**Cold model.** Its pressure moves little with charge, so it does not read a lower maximum charge
as a lower pressure. Within a pair, its monolithic-minus-other gap is +0.4 % for rifles (z = 0.7).
ADI rifle loads, outside anchors and calibration and nearly all on the cold path, give +0.3 % over
74 pairs. No factor is applied. For handguns it is −4.7 %
(z = −4.6; Hodgdon −5.6 %, Western −3.6 %): the cold $\eta_p$ is divided by `froidP` = 1.049. Applied
to the cold model, the anchored factor would have over-corrected it, by about 19 % for handguns.

**Not changed.** The local-law exponents were estimated with the monolithic loads included. Refitting
them with an indicator is deferred, since the GRT bench predictions are frozen (model `6e99a4b`).
The banner's figures come from `fit_local_laws.js`, without the factor. With the factor, and the
bullet declared, 7.0 % of loads instead of 7.5 % are under-predicted by more than 15 %.

## 4. Model unknowns

The model has exactly **two free (calibrated) unknowns**:

1. $\eta_b$ — ballistic efficiency (velocity);
2. $\eta_p$ — piezometric efficiency (pressure).

Around an anchor, four global exponents (§3.5) describe how both efficiencies move with charge
and bullet mass; they are constants of the model, not per-load unknowns.

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
This model deliberately uses **only bullet mass** (since 2026-10-10 it moves both velocity
and pressure on anchored pairs, §3.5), because:

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
$$E_\mathrm{eff} = 1\,162\,805 + 77\,418\,(\varphi/100)\ \text{J/kg}.$$
This takes the fallback velocity bias on Accurate/Ramshot from $-3.2\%$ to $\approx 0\%$
(RMS 6.6 → 5.9 %). Because $P_\max \propto v_0^2$, this removed ~6 points of pressure
under-estimation — see §6 (the propagated velocity bias was the larger half of it).

$$\eta_b = 0.1628 + 0.1218\,\tfrac{\varphi}{100} + 0.0180\,B_a,$$
$$\eta_p = 0.6337 + 0.1943\,\tfrac{\varphi}{100} - 0.1825\,\ln R_e.$$

$\eta_p$ is fitted **source-equal-weighted over three datasets**: Reload Swiss + Accurate/
Ramshot **+ Vihtavuori at the CIP ceiling** (each max load is a $(v_0,P_\max\!=\!\text{CIP})$
pair; weight $1/n_\text{source}$ so the 3245 VV points do not swamp the others). Adding the
at-the-limit VV data pulls $\eta_p$ down (higher predicted pressure), trading a centred fit
for a **safer, more source-consistent** one — per-source pressure bias moves
RS $+4.9\!\to\!+9.8\%$, Western $-3.7\!\to\!+0.7\%$, **VV $-13.4\!\to\!-10.0\%$**, and the worst
$|\text{bias}|$ drops 13 → 10 %. Crucially the **dangerous high-fill zone** ($\varphi\ge95\%$)
improves $-8\!\to\!-6\%$; the cost is conservative over-prediction at low fill (the *safe*
direction). RMS is ~flat (21.4 → 21.1 %). Pressure stays **indicative**.

**Out of sample, the safe direction does not hold** (`scripts/pression_par_source.py`, 2026-10-13).
Pressure from the *published* velocity and the model's $\eta_p$, rifles: Reload Swiss +7 %, but
Hodgdon −3 %, Western −5 %, ADI −5 %, Lovex −9 %, Shooters World −9 % (positive = model above the
published pressure). The tool's full cold prediction (energy and $\eta_p$ from the model) is
under by more than 15 % for one load in five on the calibration sources, one in four on Lovex, ADI
and Shooters World together, one in three on Lovex and on Shooters World. The spread is a
**laboratory** effect: Reload Swiss and Lovex, both C.I.P., sit at the two ends; a common refit on
four laboratories (Reload Swiss, Western, Hodgdon, Lovex) leaves ADI at −4.6 % and Shooters World at
−7.5 %, and a spherical-powder term comes out at zero once fill and expansion ratio are refitted.
Nothing was refitted; the tool's banner now says one load in three for manufacturers whose data
were not used in the fit.

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
| Anchored | manufacturer $(v_0,P_\max)$ for that cartridge × powder: a reference point plus the local laws of §3.5 (1 976 pairs, one load held out: 3.7 %) | ~4–5 % |
| User-anchored | user's own chronograph $v_0$ (efficiency recovered directly) | near-exact along the charge ladder |

This matches the tool's intent: the global model is a *cold prior*; supplying data
tightens it.

### 5.6 Published coefficients

`data/model_coefficients.json` stores the feature lists, fitted coefficients and the
reported LOPO RMS. The estimator loads these at runtime.

**It is produced by TWO passes, in this order**, then the local laws and the anchors. Running the
first alone leaves the model in the state §6.0 tested and rejected — better on its own training
set, unsafe elsewhere:

```bash
node scripts/03_fit_and_validate.js      # η_b, η_p, E_eff on Reload Swiss alone — INCOMPLETE
node scripts/fit_pressure_multibrand.js  # rewrites η_p (3 equiponderated sources) and E_eff
node scripts/fit_local_laws.js --write   # block `local` (§3.5); the first pass keeps it
node scripts/build_anchors.js            # anchors = reference points, read with `local`
```

The first pass writes a `_calage: "INCOMPLET…"` marker and prints a warning; the second
removes it. Check that key before trusting the file: on 2026-08-11 the first script was run
on its own "just to measure" and silently reverted the safety calibration.

Note that `fit_pressure_multibrand.js` rewrites **both** η_p *and* E_eff — the latter
recentred on the fallback's real clientele (powders without Qex/Ba). Its name understates
what it does.

## 6. Accuracy and limitations (safety)

- **Pressure is the weak output** ($\eta_p$ CV ~21 %, ~16 % LOPO) and is shown as
  **indicative only**. A load truly above the CIP limit can appear "safe".
- Velocity is reliable only **within the calibration envelope** (fill ratio roughly
  55–110 %); extrapolation is flagged.
- This is an **estimation aid, not a load-development authority**. Always verify any
  charge against official manufacturer data.

### 6.0 Why η_p is NOT refitted, even though far more data is now available (tested, rejected)

The model's coefficients are fitted on **Reload Swiss alone** (1700 charges), while Western
(2995 usable rows) and Lovex (563) also publish velocity **and** pressure. Widening the fit
looks like free accuracy. It is not. Reproduce with `node scripts/etap_refit_experiment.js`
(console only, writes nothing).

**The sources do not measure the same η_p.** Mean observed η_p:

| Reload Swiss | Western | Lovex | Hodgdon (2026-08-11) |
|---|---|---|---|
| **0.447** | 0.399 | 0.384 | 0.418 |

The only source used for calibration sits **12–16 % above** Western and Lovex — different
test rigs, cases and barrels, not noise.

**Fourth measurement, and it validates the compromise (2026-08-11).** The Hodgdon Annual
Manual (AM24, user-supplied — `hodgdonreloading.com` is behind Cloudflare) yields 4439 usable
rows, a set never seen by the calibration. Its η_p of 0.418 falls *between* Reload Swiss and
Western: RS is high, but not a lone outlier — four labs span 0.384–0.447, ±7.6 % about the
mean. And the **current published coefficients predict Hodgdon's pressure with a bias of
+0.6 % and RMS 15.4 %** — unbiased, and a *lower* RMS than on any of the three calibration
sources (RS 21.0, Western 21.5, VV-CIP 19.0). The deliberate "defect" of §6.0 is therefore
confirmed by an independent fourth laboratory; **η_p is still not refitted, now for a
positive reason rather than a defensive one.**

Because $P \propto 1/\eta_p$, fitting *cleanly* on Reload Swiss makes predicted pressures too
**low** everywhere else — the **unsafe** direction (the tool tells the handloader a charge is
milder than it is):

| coefficients | Reload Swiss | Lovex | Western |
|---|---|---|---|
| **current (published)** | +9.8 % / RMS 21.1 % | −7.8 % / 11.5 % | **−0.2 %** / 21.6 % |
| refit on RS | 0.0 % / **16.2 %** | −14.5 % (under-predicts 97 % of cases) | **−9.2 %** (83 %) |
| refit on RS + Lovex | +3.7 % / 17.1 % | −11.1 % (94 %) | −5.9 % / 22.9 % |

A "clean" refit zeroes the bias **on its own training set** and improves its RMS (21.1 → 16.2 %)
— while degrading safety everywhere else. The apparent *defect* of the published coefficients
(intercept 0.634 instead of 0.844) is exactly what compensates the Reload Swiss offset and
gives them a near-zero bias (−0.2 %) on Western, the largest independent set (2995 rows).

**Caveat, deliberately left alone.** The historical fit derives the case volume per row from the
fill ratio *published by Reload Swiss*, whereas the UI only has the nominal volume from
`calibers.json` — a genuine train/serve mismatch. It happens to cancel the source offset:
"fixing" it in isolation is the "refit on RS" row above, i.e. a safety regression. Do not touch
it without re-reading this section.

**Corollary — the pressure floor is structural.** Three manufacturers measuring the same
quantity disagree by ±14 %; no single model can be right on all three, and **no amount of data
will change that**. Same conclusion as the ODE route (§6.2). Pressure stays *indicative*.

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

### 6.2 The legacy GRT ODE, tested on a GRT-perfect powder — and why it can't be faithfully rebuilt

A natural objection: the discrepancies might mean our *reimplementation* of GRT's solver
(`legacy/grt_solver.js`) is wrong, and a faithful rebuild would fix it. We tested this
directly using **Norma 202**, which GRT marks `Qlty=1` (its highest-confidence powder
calibration) and which ships a complete parameter set — vivacity $B_a$, $Q_\mathrm{ex}$,
$k$, covolume, and the full three-stage form-function parameters $a_0,z_1,z_2$. Feeding
those GRT-trusted constants into the legacy ODE and comparing to Norma's own velocities
(20 points, default $P_\mathrm{start}=150$, $P_\mathrm{friction}=100$ bar):

| Method on Norma 202 (Qlty=1) | velocity RMS | bias |
|---|---|---|
| **Legacy GRT ODE** (full GRT params) | **19.5 %** | **−19.4 %** |
| η_b surrogate | 8.3 % | −7.0 % |
| $E_\mathrm{eff}$ fallback | **5.0 %** | −0.5 % |

So even fed GRT's *best* constants, our ODE under-predicts velocity by ~19 % — exactly the
structural defect found in the original validation, now reproduced on a perfectly-calibrated
powder. This isolates the cause: it is **not** the data (the same loads are predicted to
5 % by the fallback) and **not** the η_b surrogate — it is our **reproduction of GRT's
combustion physics** (the parametric form $\varphi(z)$ and the energy-sharing model).

**Can the real model be sourced? No — investigated and closed (2026-06-24).**
- **Source code is closed.** Both GitHub repos (`GordonsReloadingTool/GRT`,
  `jbaconsult/GRT`) contain only a `README` — *"Copyright … all rights reserved.
  Commercial use without written permission is strictly prohibited."* No solver code.
- **The manual gives theory, not the proprietary model.** It documents the closed-bomb
  vivacity relation (which we already implement) and Noble–Abel, but states the form
  function is bespoke: *"it is not sufficient to use the differential equations from the
  literature 1:1 … new equations had to be compiled."* The $a_0,z_1,z_2$ parameters are
  described only **qualitatively** (progressive → primary-degressive → secondary-degressive
  transitions) — **no $\varphi(z)$ equation**. The energy budget (Sebert carrying-factor
  effective mass, friction/gas losses) is *"represented by models"* with *"empirically
  determined coefficients/constants"* whose **values are not published**.
- The author is deceased and the component DB is encrypted (H2).

Fitting those unknowns ourselves is exactly the path the original work tried and closed at a
**~16 % RMS floor** (parametric calibration of the form function / loss terms). The
conclusion is therefore **acted as closed**: a faithful GRT rebuild is blocked by a
*sourcing* problem (the form-function equations and energy-sharing constants are unpublished
and unrecoverable), not a coding one — and the experiment above shows the legacy ODE, even
ideally fed, is **worse than the empirical estimator**. The legacy solver is retained only
as a pedagogical pressure-curve illustrator; the estimator remains the primary tool.

**Could we instead *recalibrate* a 0-D ODE on all our data and beat the empirical model?**
Tested directly (`scripts/grt_recalib.js`, `scripts/grt_formfit.js`) on the **full 1700
RS joint (v0, Pmax) set** — well-calibrated powders with full form-function parameters:

1. *Baseline* (legacy ODE, per-powder $a_0,z_1,z_2$): **v −20.6 %, P −19.8 %** bias — a
   large systematic deficit, $\mathrm{corr}(v_\mathrm{err},P_\mathrm{err})=0.55$.
2. *Global energy/vivacity scaling*: removing the deficit on velocity (energy ×1.30 or
   $B_a$ ×1.5 → v bias ≈0) **explodes peak pressure (+25 % to +64 %)**; centring pressure
   (energy ×1.15) leaves **v at −11 %**. The two cannot be satisfied together.
3. *Free global form function* $\varphi(z)=(1+pz)(1-z)^q$ + energy scale, grid-searched for
   minimum combined RMS: best is $q=0.3$, energy ×1.15 → **v 11.6 %, P 23.9 %** (combined
   ≈18.8 %). **No** $(p,q,\text{energy})$ puts both v and P under ~15 %; pressure RMS floors
   at ~24 %.

So even with all the data, the full GRT parameters, and a freely-tunable global form
function, a single-energy-budget ODE floors at ~19 % combined (~24 % on pressure) — **worse
than the empirical η_b/η_p model** (v 5–10 %, P 16–21 %). The cause is structural: one
energy budget drives v and P through a **single** $P(x)$ curve, so they cannot be matched
independently; the lever that would (the correct per-powder grain-geometry $\varphi(z)$) is
GRT's unpublished piece, and a single global form cannot stand in for 14 different grain
geometries. The empirical model's two **independent** efficiencies are precisely the
degree of freedom the ODE lacks — i.e. the decoupled estimator *is* the best-achievable
form of the model once v and P are allowed to separate. (As a by-product, recalibrating the
legacy ODE to $q\approx0.3$, energy ×1.15 would re-centre it from −20 %/−20 % to ≈−7 %/−3 %
bias; not applied, since centring a 24 %-scatter pressure makes the *exploration* tool look
more trustworthy than it is, against the safety stance.)

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

| Class | Bias vs CIP (before → after §5.3 recal) | RMS |
|---|---|---|
| rifle | **−17.1 % → −14.0 %** | 18.8 → 16.2 % |
| handgun | +3.0 % → +7.6 % | 35.1 → 33.2 % |
| all | −13.4 % → −10.0 % | 22.7 → 20.5 % |

Before recalibration the **rifle −17 %** independently reproduced the under-estimation seen on
Western (−19 %) and QuickLOAD — a *third* source (European **CIP** vs Western **SAAMI**) confirming
the §6 ceiling. This cross-check is what **motivated folding VV-at-CIP into the η_p fit** (§5.3):
afterwards the rifle bias improves to **−14 %** (RMS 16 %) and handgun tips conservative (+7.6 %).
A residual rifle under-prediction remains — a single global η_p cannot fully reconcile the
CIP/SAAMI/RS measurement regimes (§6, η_p-residual note) — so pressure stays **indicative** and a
max load can still read ~86 % of CIP. This multi-source evidence is the basis for **never**
rendering a "safe" verdict from a cold pressure estimate.

### Independent cross-check on a fifth laboratory (ADI, 2026-08-11)

The **ADI Handloaders' Guide** (Thales Australia, 6th ed. 2013, parsed by `scripts/parse_adi.js`)
enters **nothing** — not the η_p fit, not the anchors, not the E_eff fallback. Its powders carry
their own keys (`ADI AR 2208`), disjoint from Hodgdon's, so it measures the shipped model on
genuinely new data. Reproduce with `node scripts/adi_crosscheck.js` (console only). 2073 usable
charges of 3563; 724 carry PSI pressure (the rest are CUP, not convertible — velocity only).

| | bias | RMS | n |
|---|---|---|---|
| Pressure (given real $v_0$, isolates η_p) | −3.6 % | **12.1 %** | 724 |
| Velocity, cold fallback | +3.5 % | 9.1 % | 2073 |
| Velocity, anchored couples | +0.2 % | **6.1 %** | 25 |

**Reload Swiss is not the outlier.** ADI measures η_p = **0.442**, essentially Reload Swiss's
0.447. Five laboratories now read:

| Reload Swiss | ADI | Hodgdon | Western | Lovex |
|---|---|---|---|---|
| 0.447 | 0.442 | 0.418 | 0.399 | 0.384 |

Two high, one middle, two low — a genuine inter-laboratory dispersion of ±7.6 % about the mean,
not one deviant rig. This *strengthens* the structural-floor argument of §6.0 rather than
explaining it away: no single η_p can be right on all five. Across those five sets the published
coefficients keep |bias| ≤ ~10 % (RS +9.8, VV-CIP −9.9, ADI −3.9, Hodgdon +0.6, Western −0.2),
which is the property they were chosen for.

> **Extraction errors in the Western, ADI and Lyman sets, corrected 2026-10-07.** Western read
> every left column before every right column (1 998 of 4 717 rows filed under the wrong
> cartridge, e.g. .357 Magnum as « 38 Special +P », .223 as « 222 Remington ») and dropped every
> **compressed** max load (trailing « C »: 1 369 rows). ADI skipped 185 indented cartridge headers
> (1 268 of 3 563 rows re-labelled). Lyman dropped compressed loads too (« 57.0+ »: 345 rows),
> and Hodgdon every row published without a starting load (258 rows, 127 of them .38 Special +P).
> Every Western, ADI or Lyman figure in this document that predates the fix was measured on
> those sets. With the **same** η_p coefficients, the corrected sets take Western's Pmax RMS from
> 21.5 % to 13.2 % and the pooled RMS from 20.3 % to 17.4 %; refitting would only reach 17.2 %,
> so the coefficients have **not** been refitted. Anchors rebuilt (LOO velocity RMS 4.2 → 4.0 %).
>
> **Lyman, second pass, 2026-10-08** (cross-check only — no anchor, no coefficient depends on it).
> 1 622 → 3 275 rows (860 of them cast bullets), none lost, no existing row altered. Recovered:
> powders Lyman names by number only (2400, 231, 748, 760: any label without a letter was dropped
> silently); continuation pages whose title the OCR truncated (« 43 WINCHESTER », « 08 Winchester »:
> a page with a table and no « Test Components » block now inherits the previous page's
> cartridge — checked page by page, no counter-example; this alone recovered every jacketed .222
> row); the first page of a section whose banner title was missed (the whole .357 Magnum 4″
> section); tables whose « Powder … Grains » header the OCR split over two lines; cast-bullet
> tables (« 150 gr. (#358477) », « 90 gr. (Linotype) »: now flagged `cast`, kept out of the model
> comparisons); start loads below 500 fps (.38 Special, 473 fps). Barrel lengths: one-digit values
> (« 4" ») and long leader dots were missed, so the .357/.44 revolver rows inherited the 20″
> carbine barrel; 227 rows still have no barrel. The extraction self-test (heavier bullet faster)
> now compares within the same barrel and bullet type: mixing the 4″, 10″ and 20″ sections had
> inflated it (8.1 % now). Cross-check after the pass: rifle n = 3 676, RMS 10.6 % (was 2 480,
> 11.0 %); handgun n = 946, RMS 26.1 % (was 608, 37.0 %, mostly the wrong 20″ barrel); Lyman ↔
> anchors, rifle 255 pairs, E_eff RMS 9.5 % (was 213, 10.1 %). Still lost: OCR-mangled powder
> names (« 1+110 », « Jnique »), max-only rows (no start load), powders whose identity or density
> is not established (see `data/powder_aliases.json`). The values published from Lyman on the
> wiki were re-checked against the page images.
>
> **Powder aliases with a source, 2026-10-08.** ADI states that it exports propellant « rebranded
> by Hodgdon » and pairs BM2 with Benchmark and Bench Mark 8208 with 8208 XBR (FAQ, 2021-02-24);
> Hodgdon's own manual names LEVERevolution « LVR »; IMR 7828 SSC is matched to the « 7828SC » key
> by deduction (documented in `data/powder_aliases.json`, `_sources`). Lil'Gun received a bulk
> density (956 kg/m³, community GRT files, QuickLOAD value) through `CORRECTIONS` in
> `scripts/import_catalog.js`. Rows recovered: Hodgdon +179, ADI +727, none lost. Anchors 1 936 →
> 1 953 (17 new, none changed), LOO velocity RMS 4.1 % before and after. **ADI reprints Hodgdon
> data**: BM2 and Benchmark share the same max charge in all 96 common cartridge × bullet pairs, and
> 1 201 of 4 289 ADI rows copy a Hodgdon row exactly (cartridge, bullet, charge, velocity) — 985 of
> them under ADI powder names before any alias (AR2208 for Varget…). ADI does not feed the anchors,
> but `adi_crosscheck.js` therefore partly re-tests Hodgdon data, and any pooled count across
> guides must drop these copies (the wiki medians now do).

The anchored-vs-cold gap (6.1 % vs 9.0 %) reproduces on independent data, on a small sample
(25 couples — ADI's powders are mostly unanchored by construction).

### Independent velocity cross-check (Norma)

A fourth source, the **Norma "Reloading Data — Balistix" guide** (Aug 2023, parsed by
`scripts/parse_norma.js`), is velocity-only (ft/s, no pressure, no test-barrel length) and
uses **Norma powders that have no $Q_\mathrm{ex}/B_a$** in our component base — i.e. exactly
the clientele of the $E_\mathrm{eff}$ fallback (§5.3). Feeding its 138 velocity points
(69/88 rows whose cartridge matches a known caliber) through the **cold** $E_\mathrm{eff}$
fallback — *without any Norma-specific calibration* — gives **velocity RMS 4.5 %, bias +1.3 %**.
This independently confirms the fallback generalizes to a fourth brand, and the small
*positive* bias is in the **safe** direction (slightly over-predicts $v_0$, hence $P_\max$).
Norma is therefore folded into the per-cartridge×powder **anchors** (§5.5, velocity-only,
$\eta_p$ left to the global term) — 22 new combos — but the global coefficients are left
untouched, since the cold fallback already covers it within tolerance. Raw table not
redistributed (EULA); only the derived anchors are published.

*Note — why fallback-clientele brands keep the fallback even when a powder file exists.*
GRT `.propellant` files for some fallback-brand powders are available (and are used by the
legacy GRT simulator), but routing them through the **η_b path** with those constants
(η_b fitted on Reload Swiss, $Q_\mathrm{ex}\approx 3900$–$4400$) *degrades* the cold velocity
and biases it **−10 % = the unsafe direction** (under-predicts $v_0$, hence $P_\max$),
because these brands' GRT $Q_\mathrm{ex}$ run low (~3700–3760, often $Qlty<1$):

| Powder (GRT consts) | η_b path | $E_\mathrm{eff}$ fallback | test set |
|---|---|---|---|
| Norma 202 ($Q_\mathrm{ex}3760,B_a0.61$) | 9.9 % / −9.0 % | **5.2 % / −2.6 %** | 14 Norma pts |
| Accurate 2230 ($Q_\mathrm{ex}3710,B_a0.55$) | 11.8 % / −9.7 % | **5.7 % / −2.8 %** | 153 Western loads |

So the estimator deliberately keeps these brands on the $E_\mathrm{eff}$ fallback (no
$Q_\mathrm{ex}/B_a$ in their `powders.json` entries); the GRT files feed only the legacy
simulator. This is the same cross-brand non-transfer of η_b documented for pressure in §5.3.

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
- **Manufacturer load tables** (Reload Swiss Guide 2025 for calibration; Accurate/
  Ramshot, Vihtavuori 2026 and Norma 2023 as cross-checks / velocity anchors) are used
  for calibration/validation only and are **not redistributed** (EULA). Only the derived
  coefficients and anchors are published.

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
3. D. E. Carlucci & S. S. Jacobson, *Ballistics: Theory and Design of Guns and Ammunition*, CRC Press, Boca Raton, 2008. Lagrange gradient: eqs. 3.54 (breech/base) and 3.59 (space-mean/base), p. 71.
4. P. R. Alger, « The Le Duc Velocity Formula », *Proceedings of the U.S. Naval Institute* 37 (2), whole no. 138, 1911, p. 535–540. [Scan](https://www.tireur.org/articles/Alger1911_Le_Duc_velocity_formula.pdf). Formula attributed to Captain Le Duc (spelt *Leduc* in the French source), from J. Challéat, « Théorie des affûts à déformation, à lien élastique et bêche de crosse », *Revue d'artillerie* 65, Dec. 1904, p. 184–185 ([Gallica](https://gallica.bnf.fr/ark:/12148/bpt6k64398706/f190.item)): $V_0 = a\,u_0/(b+u_0)$, $b = \beta\,(s/p)^{3/8}(1-\tfrac34\Delta)$, taken « sous la forme qui leur a été donnée dans les cours de l'École d'application de Fontainebleau ». Leduc built them from measured velocity–travel curves (p. 194, note).
5. zen/grt_databases (CC0 1.0) — community GRT component data.
6. F. Ongaro, C. Robbe, A. Papy, B. Stirbu, A. Chabotier — *Modelling of internal
   ballistics of gun systems: A review*, Defence Technology 41 (2024) 35–58,
   doi:10.1016/j.dt.2024.05.004 (open access). Classifies lumped-parameter vs CFD
   models; documents Baer–Frankle, IBHVG2, STANAG 4367, Mayer–Hart; notes the
   small-calibre gap.
7. J. E. Mayer & B. I. Hart, *Simplified Equations of Interior Ballistics*, Journal of
   the Franklin Institute, vol. 240, no. 5, Nov. 1945, pp. 401–411. Primary source for
   the closed-form $P_\max$ / muzzle-energy expressions and the constants $P_q,\varphi,r$.
8. G. W. Patterson, « The Le Duc Ballistic Formulæ », *Proceedings of the U.S. Naval Institute* 38 (3), whole no. 143, 1912, p. 885–892. [Scan](https://www.tireur.org/articles/Patterson1912_Le_Duc_ballistic_formulae.pdf). Constants refitted on cut-off 5-inch guns; chamber pressure taken as 12 % above the effective pressure on the shell.
9. H. D. Yoon, S. H. Choi, S. K. Lee, « An Experimental Study for the Projectile Velocity versus Travel Distance in the Gun Barrel », *한국군사학논집* 66 (2), 2010, p. 55–69, [doi:10.31066/kjmas.2010.66.2.003](https://doi.org/10.31066/kjmas.2010.66.2.003). Le Duc anchored on muzzle velocity and case-mouth $P_\max$ on a 5.56 × 45 test barrel, one M193 shot, compared with measured pressure.
