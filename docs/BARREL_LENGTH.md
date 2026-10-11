# Muzzle velocity versus barrel length: four predictors tested on 43 cut-down series

*Working note, 2026-10-03; independent set added 2026-10-11. Every number below is printed by
[`scripts/barrel_predictors.py`](../scripts/barrel_predictors.py) and
[`scripts/barrel_exponent_fit.py`](../scripts/barrel_exponent_fit.py); rerun them rather
than copying from here.*

## Question

A muzzle velocity is known for one barrel length. What is it for a shorter barrel? Tools,
including this one, have used a power law $v \propto L^k$ with a fixed exponent. This note
asks whether interior-ballistics theory predicts the barrel-length effect better than a
fixed exponent, using only published measurements.

## Data

**Barrel cut-down tests by B. Marr (Rifleshooter.com, 2013–2018).** In each test, one barrel
is fired, cut back about an inch, and fired again. The velocity is the mean of 3 to 5 shots.
Only points of 16 inches or longer are used.

| Set | Cartridges | Series | Use |
|---|---|---|---|
| Reference | .223 Rem., .224 Valkyrie, 7.62×39, 6 mm Creedmoor, 6.5 Creedmoor, .243 Win., .308 Win., .300 Win. Mag. | 19 | Fixed the default $k$ (median 0.167 on barrel length) |
| Validation | 7 mm Rem. Mag., .338 Lapua Mag. (Marr); 7.62×54R (Clark 2011); .30-06 (Hatcher) | 8 | Added afterwards; nothing was tuned on it |
| Independent (2026-10-11) | 6.5 Creedmoor and two .223 Wylde barrels (Hodgdon 2026); 6.5 PRC, 7 mm PRC, 300 PRC (Eagleman Long Range 2023) | 16 | Other experimenters, added after this note was written; nothing was tuned on it |

**A second experimenter.** B. L. Clark's honors thesis (University of South Florida, 2011) cut a Mosin-Nagant from 28.75 to 16.75 inches in 2-inch steps, with 10 shots of Bulgarian 147 gr surplus per length, measured about 10 feet from the muzzle. The table 1 means were recomputed from the shot-by-shot tables 2 to 8.

**A third source.** *Hatcher's Notebook* (2nd ed., 1957), p. 399, item 14, gives Springfield Armory tests with Browning machine-gun barrels of 24, 28, 30 and 32 inches. Ammunition and shot count are not stated; a 172 gr M1 bullet is assumed (table on p. 400), which only Le Duc uses. The .50-calibre column of the same table is left out: there is no verified case capacity for the .50 BMG. The C.I.P. sheet gives dimensions and Pmax but no volume, none of the available loading guides publishes one, and the 18.97 cm³ in the calibers base was typed in without a source (searched 2026-10-04).

**Independent experimenters (added 2026-10-11).** Tables read as images on 2026-10-11; for every series the published per-step losses and totals match the velocities copied.
- *Hodgdon Powder Company*, "Barrel Length Versus Velocity" (hodgdonpowderco.com, 12 March 2026). Their ballistics laboratory cut one 6.5 Creedmoor and two .223 Wylde barrels on a lathe from 24 to 16 inches, one inch at a time, with five-shot strings and the barrel cleaned at each cut; pressure was recorded at each length. The 6.5 Creedmoor bullet is not given (Le Duc left out for that series). The first .223 barrel lists bullets and charges (40, 60 and 77 gr Sierra, Ramshot X-Terminator and Accurate 2520); the second ("540 total rounds") lists bullets but not charges, and its receiver was rebuilt before the 18-inch strings, where three series rise by 0 to 21 fps. The Wylde chamber takes the .223 Rem. case, whose volume is used.
- *Eagleman Long Range*, post on the Long Range Hunting forum (6 October 2023): Benchmark barrels cut from 26 to 18 inches in 2-inch steps, 6.5 PRC (147 gr), 7 mm PRC (175 gr) and 300 PRC (212 gr), LabRadar. Shot count and charges are not given.

**Considered and not used (2026-10-11).** J. Schmidt's 6 mm BR (AccurateShooter, 33 to 28 inches, 15 shots per length): no verified case capacity in the calibers base. Gun Mart's .308 cut from 24 to 14.5 inches (2017): only starting velocities and mean losses per inch are published. All4shooters' Tikka T3x comparison: three rifles, not one cut-down barrel. Lucky Gunner's 7.62×39: barrels shorter than 16 inches.

**Considered and not used.** Ballistics By The Inch (archived 2020) cut a .223 test barrel from 18 to 3 inches, 3 shots per length. Only the 18- and 16-inch points fall in the range studied here. The exponent from that single 2-inch step is 0.115, 0.249 and 0.280 for its three loads: the full spread seen elsewhere, so the step measures mostly noise. The short barrels (3–14 in.) would be a separate test, where the powder is not fully burnt and the expansion-ratio formulas are not expected to hold.

**How the values were taken.**
- Most tables are published as images, so they were read on screen.
- The published column totals ("Change from 28″", "CHG 30″") were checked against the row values.
- A series attributed to Litz (*Applied Ballistics*, 3rd ed., p. 322) was **removed**: it is an illustration, exactly 100 fps per 4″, not a measurement.

**Noise floor.** A free two-parameter fit to each series leaves a median residual of 14.0 fps
(power law) and 12.2 fps (Le Duc), on the reference series with four or more points.

## Predictors

Each predictor receives the longest-barrel point of a series and predicts the other points.
The score is the root-mean-square error over those points.

- **K — fixed exponent.**
  - $v = v_\text{ref}(L/L_\text{ref})^k$.
  - On the reference set, $k$ is the median of the *other* cartridges (leave-one-cartridge-out).
  - On the validation set, $k = 0.167$, the median of the 19 reference series.
- **P — Powley/Davis.**
  - $v \propto \sqrt{1 - R^{-1/4}}$, with $R = 1 + A x / U$.
  - $x$ is bullet travel (barrel minus case length), $A$ the bore area, and $U$ the effective chamber volume under the bullet (`data/calibers.json`).
  - This is the expansion term of the Powley computer: in the kwk.us implementation (source read on 2026-10-03, "variable names per Davis"), $M = R^{-1/4}$ and $V = 8000\sqrt{I(1-M)/(G+I/3)}$.
  - In a ratio of two lengths, the charge and bullet terms cancel. The predictor has **no parameter**.
- **MH — Mayer & Hart (1945), eq. 34.**
  - $v \propto \sqrt{1 - R'^{\,1-\gamma}/(1-(\gamma-1)\varphi)}$.
  - $R'$ uses the free volume ($U$ minus the solid volume of the charge).
  - $\varphi = p_c/(2p_q)$ (their eqs. 8, 28, 30), with $\gamma = 1.20$ and the C.I.P. maximum pressure.
  - Charge: the published value where Marr gives it; otherwise the Reload Swiss median for the cartridge; otherwise the median loading density.
- **MH, φ = 0.** The same without the burning term. With $\gamma = 1.25$ it **is** Powley's formula: an isentropic expansion of a charge burnt at once.
- **LD — Le Duc.**
  - $v = a x/(b+x)$, anchored on the reference point and on the peak chamber pressure $P_\max = 4 m_c a^2/(27 A b)$, $m_c = m + C/2$, as in [`MODEL.md` § 3.4](MODEL.md).
  - $P_\max$ is the C.I.P. value. This is an upper bound for factory ammunition; the 85 % variant is printed only as a sensitivity check, not as a predictor.
  - Written with the projectile mass alone, as Alger gives them, Le Duc's formulas yield the *effective* pressure on the projectile base. Alger (1911) puts the chamber pressure, where gauges read it, 15–20 % above it, and Patterson (1912) 12 %. The Lagrange gradient gives $p_\text{breech} = p_\text{base}(1 + C/2m)$ (Carlucci & Jacobson, *Ballistics*, 2008, eq. 3.54, p. 71), 10 to 25 % on these series. With $m + C/2$ the curve is a chamber-pressure curve, of the same kind as the C.I.P. anchor.
  - Until 2026-10-11 the effective mass $m + C/3$ was used. It belongs to the space-mean pressure (eq. 3.59), so a chamber $P_\max$ was anchored 3–7 % too high. The change lowered the median error from 41.1 to 34.7 fps (reference) and from 37.0 to 31.4 fps (validation); with $m + C/3$, Le Duc was no better than the fixed exponent (−0.8 fps, [−14.3 ; +13.8]).

## Results

### Median RMS error over the predicted points (fps)

| Predictor | Reference (19 series, 8 cartridges) | Validation (8 series, 4 new cartridges) | Independent (16 series, 6 barrels) |
|---|---|---|---|
| K, fixed exponent | 40.8 | 41.8 | 19.8 |
| P, Powley | 29.9 | 27.4 | 14.3 |
| MH, Mayer–Hart | 25.2 | 19.8 | 19.6 |
| MH, φ = 0 | 38.9 | 50.4 | 34.5 |
| LD, Le Duc (C.I.P. pressure) | 34.7 | 31.4 | 20.8 (15 series) |

On the independent set, $k$ is the median of the 19 reference series (0.167). Its errors are smaller than elsewhere: barrels of 16 to 26 inches only, and mostly .223 and 6.5 Creedmoor, whose expansion ratios are close to the median.

### Paired comparison by cartridge

Series of one cartridge share a rifle, so they are not independent. The 27 series are therefore averaged per cartridge, giving 12 cartridges. $k$ is fixed leave-one-cartridge-out; 10 000 bootstrap resamples are drawn over cartridges.

| Comparison | Better on | Mean difference | 95 % interval | Sign test (one-sided) |
|---|---|---|---|---|
| Powley vs. fixed $k$ | 9/12 | −10.4 fps | [−19.7 ; −1.9] | p = 0.073 |
| Mayer–Hart vs. fixed $k$ | 8/12 | −13.1 fps | [−25.9 ; −3.3] | p = 0.194 |
| Le Duc vs. fixed $k$ | 8/12 | −4.1 fps | [−16.5 ; +9.1] | p = 0.194 |
| Mayer–Hart vs. Powley | 7/12 | −2.7 fps | [−8.8 ; +2.9] | p = 0.387 |

### Paired comparison on the independent set, by barrel

Hodgdon's two .223 barrels are separate guns, so the 16 series give 6 barrels. $k$ = 0.167.

| Comparison | Better on | Mean difference | 95 % interval | Sign test (one-sided) |
|---|---|---|---|---|
| Powley vs. fixed $k$ | 6/6 | −13.1 fps | [−21.7 ; −4.5] | p = 0.016 |
| Mayer–Hart vs. fixed $k$ | 4/6 | −9.8 fps | [−22.1 ; +0.8] | p = 0.344 |
| Le Duc vs. fixed $k$ | 3/5 | −10.0 fps | [−21.1 ; +1.1] | p = 0.500 |
| Mayer–Hart vs. Powley | 1/6 | +3.3 fps | [−2.1 ; +7.5] | p = 0.984 |

Per barrel, Powley's gain is 3 fps on the .223 barrels and the 6.5 Creedmoor, and 14 to 28 fps on the three PRC magnums. Taken together, the 12 cartridges and the 6 barrels give Powley better than the fixed exponent on 15 of 18 (sign test p = 0.004); Mayer–Hart better than Powley on 8 of 18.
### Implied exponent on the reference set

The log-log slope of each predictor's own predictions is compared with the measured $k$:

| Predictor | Median implied $k$ | Measured median | Correlation with measured $k$ |
|---|---|---|---|
| Powley | 0.172 | 0.167 | r = 0.70 |
| Mayer–Hart | 0.188 | 0.167 | r = 0.73 |
| Le Duc | 0.168 | 0.167 | r = 0.58 |

## Findings

1. **The expansion ratio explains much of why the exponent changes from one cartridge to another.**
   - Cartridges with a large case for their bore lose more velocity per inch: measured $k$ is 0.26–0.31 for the .243 Win., 0.26 for the .300 Win. Mag., 0.20–0.29 for the 7 mm Rem. Mag. and 0.24–0.26 for the .338 Lapua. It is 0.11–0.16 for the 7.62×39.
   - The fixed exponent cannot follow this. Powley's formula, which uses only geometry, does.
   - On the four cartridges held out of everything, the median error falls from 41.8 fps (fixed exponent) to 27.4 (Powley) and 19.8 (Mayer–Hart). On the two magnums alone Powley roughly halves it; on Clark's 7.62×54R Powley gains little (33 against 40 fps) and Mayer–Hart does best (17 fps); on Hatcher's .30-06, whose $k$ (0.182) is close to the median, all three are within 10–11 fps.
2. **Mayer–Hart is not distinguishably better than Powley** (−2.7 fps, interval spanning zero). It also needs a charge, a powder energy and a pressure, and the $\varphi$ values it uses (0.42 to 0.79) all lie at or above its formal validity bound $\varphi \le 1/(2\gamma) \approx 0.42$ (eq. 33′).
   - Its burning term still matters. With $\varphi = 0$ the model loses its advantage (validation: 50.4 fps, worse than the fixed exponent).
   - Powley's formula (γ = 1.25, no burning term) nevertheless does about as well as the full Mayer–Hart model. Why the cruder formula matches is not established here.
3. **Le Duc anchored on the C.I.P. pressure is not reliably better than a fixed exponent** (−4.1 fps, interval spanning zero). Its result depends on the assumed peak pressure, which is not known for factory ammunition.
4. **Powley and Mayer–Hart miss the flattening of the 6 mm and 6.5 Creedmoor series beyond about 24 inches.**
   - For these two cartridges they do no better than the fixed exponent (6 mm: 70 and 80 fps against 72; 6.5: 55 and 64 against 59).
   - Le Duc, whose hyperbola flattens by construction, does better there (62 and 39 fps).
   - Marr's longest barrels (27–31″) gain less than the expansion ratio predicts. Friction and heat loss, which these lumped models ignore, are a plausible cause; this is not tested here.

5. **The independent set confirms the Powley result** (6 barrels out of 6, see above), with three experimenters other than Marr. Mayer–Hart, better than Powley on the reference set, is worse on the independent one (1/6); its $\varphi$ reaches 1.07 on the light .223 loads, far outside its domain.

**Practical consequence.** For a cartridge whose expansion ratio is far from that of the .308 (magnums, the .243, intermediate cartridges), a velocity transferred from one barrel to another is better estimated with Powley's ratio than with a fixed exponent. A second chronograph point on the actual rifle remains better than either.

## Limitations

- **Small sample.** There are 15 cartridges and 18 guns, and 3 to 15 shots per point (not stated for Hatcher or Eagleman). On the first 12 cartridges the Powley vs. fixed-$k$ sign test was not significant (p = 0.073); with the independent barrels it is (15/18, p = 0.004).
- **Charges partly estimated.** For factory ammunition the charge is unknown; Reload Swiss medians stand in for it. Only the Mayer–Hart and Le Duc predictors use it.
- **Chamber volumes are aggregates.** $U$ is a per-cartridge median derived from Reload Swiss fill ratios, not a measured volume for each load.
- **Data sources.** 25 of the 43 series come from one experimenter and one chronograph type (barrel-mounted MagnetoSpeed). The independent set is dominated by .223 (12 of 16 series, two barrels of one laboratory); the three PRC series come from a forum post without shot counts or charges. Ballistics By The Inch does not help in this range (see Data).

## Prior work

- **Already known.**
  - The expansion ratio as the governing variable: Corner (1950), Carlucci & Jacobson.
  - Closed-form energy and its logarithmic derivative: Mayer & Hart (1945).
  - Le Duc's hyperbolic law: built by Captain Leduc from measured velocity-versus-travel curves and taught at the French artillery school of Fontainebleau (Challéat, *Revue d'artillerie* 65, 1904, p. 184–185 and 194); as given by Alger (*Proceedings of the U.S. Naval Institute*, 1911), who tested it on barrel length: three 6-inch guns of 30, 35 and 40 calibres, and two cut-off 8-inch guns, each predicted within a few f.s. from a constant fitted on one gun. Patterson (*id.*, 1912) refitted its constants on cut-off 5-inch guns.
  - Powley's $R^{-1/4}$ (Davis, *Handloading*, NRA, 1981, as implemented by kwk.us; Davis not read). Powley's own *Instruction Manual* (1961, [scan](https://www.tireur.org/articles/Powley1961_Powley_Computer_instruction_manual.pdf)) gives no formula, only the slide rule's Expansion Ratio–Velocity tables. Its p. 12, "Barrel Length and Velocity", already states this note's main point: "you cannot specify a certain percentage change of muzzle velocity per inch of barrel unless you refer to only one particular gun." It names two factors: the expansion ratio and the ratio of powder charge to bullet weight. A low expansion ratio with a high charge-to-bullet ratio loses most by shortening. **The second factor is absent from predictor P as implemented here**: in a ratio of two lengths, Davis's formula cancels the charge and the bullet. Whether it would improve the predictions is untested.
  - Manual rules of thumb in "fps per inch" that grow with velocity.
  - Sharpe, *Complete Guide to Handloading* (3rd ed., 1953, p. 44): to go from the 30–32-inch laboratory barrels to a 24-inch rifle, "deduct from 150 to 200 fs." Around 2800 fps this is $k \approx 0.19$–$0.33$, at the high end of the measured range; Hatcher's .30-06 loses 139 fps from 32 to 24 inches ($k = 0.174$).
- **Not found elsewhere** (search of 2026-10-03):
  - a systematic test of these predictors against cut-down measurements;
  - the observation that the "0.27 Powley/Litz" exponent formerly used in this tool has no published source; Powley's ¼ applies to the expansion ratio, not to the length.
