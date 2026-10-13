# The Powley Computer (1961) against 390 loads measured in the 1950s

*Working note, 2026-10-12. Every number below is printed by
[`scripts/powley_nra1960.py`](../scripts/powley_nra1960.py); rerun it rather than copying from here.
The barrel-length rule of the computer is treated in [BARREL_LENGTH.md](BARREL_LENGTH.md).*

## Question

H. S. Powley's slide rule (1961) gives, from case capacity, bullet weight and calibre, an IMR powder, a
charge and a muzzle velocity. Does it describe loads measured with the powders it was made for?

## Sources

* **Powley, *Powley Computer for Handloaders: Instruction Manual*, 1961** (scan hosted by tireur.org),
  read in full on 2026-10-12. The velocity tables are printed on the slide, not in the manual; the
  manual gives seven worked velocities. The computer fills the case to a loading density of 0.86 (0.80
  for IMR 4198 and 4227) and aims at "the middle of the 40,000 to 50,000 psi range" (copper crusher).
* **kwk.us, "Powley Computer for Handloaders"** (online calculator, JavaScript read 2026-10-03):
  $V = 8000\sqrt{I(1-R^{-1/4})/(G+I/3)}$ and the powder index $X = 20 + 12/(Z\sqrt{0.86W/G})$,
  "variable names per Davis" (*Handloading*, NRA, 1981 — not read).
* **NRA Illustrated Reloading Handbook, 1960** (reprints from *The American Rifleman*). 39 rifle load
  tables with velocity and pressure, nearly all "Ballistic data supplied by H. P. White Laboratory":
  averages of 10 rounds, pressure barrels of 17⅜ to 30⅞ inches, instrumental velocity at 20 ft, crusher
  pressure. The book does not mention Powley, Davis or the expansion ratio.

## Data

552 load lines transcribed from the page images on 2026-10-12 (each table read twice), then checked
against an independent OCR (tesseract, 400 dpi, line by line): 475 lines match on bullet weight, charge,
velocity and pressure; the other 72 were re-read on the image, with no transcription error. The
transcription is kept locally (`data/nra1960_charges.local.json`, git-ignored): the values are cited for
this test, the document is not redistributed.

On the bench: IMR and Hercules HiVel No. 2 loads of the 23 cartridges that have a case volume in
`data/calibers.json` — 390 lines. Left out: 115 lines of 11 cartridges without a volume, 25 factory
loads, 13 loads of other powders (Hercules 2400 and Unique, black powder, Lightning), 9 lines without a
barrel length. Conventions of the site's tools
(`velocity_model.js`): bore area, bullet travel = barrel − case length, $U$ = `case_vol_cm3`.

## Results

1. **The kwk.us formula reproduces the manual's seven worked velocities** within −1.2 % to +0.2 %,
   nearly always about 1 % low.
2. **Measured / predicted velocity**: median 1.009 over 390 loads. It follows pressure, as $P^{0.28}$:

   | Pressure (psi) | Loads | Median | Quartiles |
   |---|---:|---:|---|
   | under 35,000 | 54 | 0.928 | 0.850–0.959 |
   | 35,000–40,000 | 27 | 0.958 | 0.916–0.977 |
   | 40,000–45,000 | 100 | 1.004 | 0.977–1.017 |
   | 45,000–50,000 | 154 | 1.022 | 1.000–1.058 |
   | 50,000–60,000 | 55 | 1.055 | 1.028–1.079 |

   In the computer's own range, 40,000–50,000 psi: median 1.013 over 254 loads, quartiles 0.989–1.038.
   HiVel No. 2: 1.041 (40 loads), the manual calls it a higher-energy powder. For the 14 cartridges with at
   least five loads in that range: 0.967 (.250 Savage) to 1.057 (.270 Winchester).
   * Case volume: using 0.90 × Peterson's measured water capacity instead moves the medians of six
     cartridges by 1.2 % at most.
   * Velocities taken at 20 ft are 0.5 to 1 % below muzzle velocity (G1 drag table of the site's solver:
     16 fps for a G1 BC of 0.40 at 3,000 fps, 36 fps for 0.20 at 3,500 fps). Not corrected.
3. **"If you change the weight by a given percentage, inside the same case, the velocity changes by
   the SAME GIVEN PERCENTAGE. However, at the same time, the pressure changes by TWICE THE GIVEN
   PERCENTAGE."** On 13 homogeneous series (same table, bullet, powder, lot, primer and seating depth;
   charges at least 5 % apart; 9 of them from one .222 Remington article): velocity × 1.01 (0.53 to
   1.41), pressure × 2.89 (1.60 to 4.96).
4. **Powder index**: it gives the powder of the manual's five examples. For the 56 bullets fired with
   at least two powders between 40,000 and 52,000 psi, the fastest powder is in the indicated class 35
   times, in it or the next class by burning rate 41 times (velocities compared as printed, at
   pressures that differ).
5. **Muzzle pressure.** The formula implies $P \propto R^{-5/4}$ whatever the bullet: 5,215 psi at
   $R = 10$, where the manual gives 5,600 to 9,800 psi, and 9,876 psi at $R = 6$, where the manual gives
   29,000 and 40,000. From $R = 6$ to $R = 10$, the formula and adiabatic expansion ($\gamma = 1.25$)
   both divide the pressure by 1.89; the manual's figures by more than 5.

## Limits

IMR lots of 1960 are not today's powders; nothing here says the computer holds for current lots. The
formula's source (Davis, 1981) was not read. Crusher pressures are not piezoelectric pressures.
