# Contributing

Thanks for helping improve the Interior Ballistics Estimator. Please read
[`MODEL.md`](MODEL.md), [`CALIBRATION.md`](CALIBRATION.md) and
[`DATA_FORMAT.md`](DATA_FORMAT.md) first.

## Golden rule: never commit raw manufacturer data

Manufacturer load tables are used **for calibration only and must not be
redistributed** (publisher EULA). The `.gitignore` excludes `data/*.local.json`;
keep it that way. Only **derived** artifacts are published:
`model_coefficients.json`, and standard public constants in `calibers.json` /
`powders.json`.

If you open a PR, double-check `git status` shows no `*.local.json`.

## Add a powder

Edit `data/powders.json`. Two cases:

**Full entry** (preferred, from a GRT `.propellant` export):
```jsonc
"RS62": { "Qex": 3722, "Ba": 0.4102, "pcd": 964, "mfg": "Reload Swiss" }
```

**Minimal / fallback entry** (only bulk density known, e.g. from a public spec sheet):
```jsonc
"1680": { "pcd": 960, "mfg": "Accurate" }
```
With `Qex`/`Ba` absent, the tool uses the **`e_eff` fallback** — same cold-start
accuracy (~10 %). **`pcd` itself is optional**: it only drives the fill ratio
(domain warnings + the pressure term), not the velocity (fill defaults to a nominal
100 % when absent). So the minimum to get a velocity estimate is just a name + `mfg`;
add `pcd` to also get fill warnings and a better pressure.

- `Qex` (kJ/kg), `Ba` (vivacity), `pcd` (bulk density, kg/m³) come from the
  GRT-derived component database (`*.propellant` files). `pcd` is also published
  by most spec sheets; `Qex`/`Ba` essentially only from GRT.
- `mfg` sets the display label. Key = product name (must match the calibration
  guide's powder column if you also add load data, e.g. `RS62`).
- Bulk import: `node scripts/ingest_propellants.js <folder> [--mfg <name>]`.

**Importing `Qex` from GRT `.propellant` files** (extends the Mayer–Hart anchor guard,
[MODEL.md](MODEL.md) Appendix A/B). Drop the `.propellant` file(s) into
`legacy/grt_databases/powders/`, then:
```sh
node scripts/import_grt_qex.js --write   # adds REAL Qex to matching powders that lack it
node scripts/build_anchors.js            # recomputes anchors + mhr/mhflag guard
```
`import_grt_qex.js` adds **`Qex` only** (not `Ba`) on purpose: the η_b velocity path needs
*both*, so a Qex-only powder stays on the `e_eff` fallback — i.e. **production predictions
are unchanged**, only the consistency guard gains coverage. If you instead want such a
powder to use the η_b path, add its real `Ba` too — but note the η_b coefficients were fit
on single-base Reload Swiss, so doing this for double-base powders is a **production change
that must be re-validated** (LOPO/anchors), not a free win.

## Add a cartridge

Edit `data/calibers.json`. The key must be the **exact** label used by the
calibration guide (e.g. `"6.5 Creedmoor"`).

```jsonc
"6.5 Creedmoor": { "bore_mm": 6.71, "case_mm": 48.77, "case_vol_cm3": 2.97 }
```

- `bore_mm` = groove/bullet diameter; `case_mm` = case length (standard CIP/SAAMI).
- `case_vol_cm3` is normally produced by the calibration pipeline (median over the
  data). If you have no calibration data for the cartridge yet, set a best estimate
  of the effective chamber volume; it only affects the fill-ratio computed for the
  user and can be refined later.
- `test_barrel_mm` (optional) is the **reference barrel** for pressure and velocity-vs-barrel
  scaling. Don't hand-set it: run `node scripts/build_test_barrels.js --write` to (re)derive
  it per cartridge as the modal calibration barrel across RS/Western/Vihtavuori. Cartridges
  with no data keep the type default (600 rifle / 122 handgun). Re-run after adding data.

## Add / extend calibration data

1. Obtain the manufacturer guide and run the pipeline (see `CALIBRATION.md`):
   ```sh
   pdftotext -layout guide.pdf guide.txt
   node scripts/01_parse_guide.js guide.txt
   node scripts/02_build_dataset.js
   node scripts/03_fit_and_validate.js
   ```
2. Check the printed LOPO / anchored RMS are sane (velocity LOPO should stay
   roughly ≤ ~10–12 %).
3. Commit **only** the regenerated `data/model_coefficients.json` plus any new
   `powders.json` / `calibers.json` entries.

> Other manufacturers come from **their own** guides; `01_parse_guide.js` targets the
> Reload Swiss layout. Western (Accurate/Ramshot) and Vihtavuori have sibling parsers —
> add another if a new layout differs.

### Vihtavuori guide (velocity-only anchors)

The VV guide gives **charge + velocity** (start & max) with a stated **test barrel**, but
**no per-load pressure** — its *max* loads are at the C.I.P./SAAMI limit. So VV yields
**velocity anchors only** (`eeff`); the max-load point also feeds the Mayer–Hart guard
where a powder has `Qex`. Workflow:

```sh
# 1. the guide is a two-up booklet (two guide-pages per sheet) -> need word positions:
pdftotext -bbox guides/Vihtavuori_Reloading_Guide_*.pdf /tmp/vv_bbox.html
# 2. column-aware parse -> data/vihtavuori.local.json (gitignored raw rows)
node scripts/parse_vihtavuori.js /tmp/vv_bbox.html
#    spot-check one cartridge against the PDF before trusting it:
node scripts/parse_vihtavuori.js /tmp/vv_bbox.html --cart "308 Winchester"
# 3. rebuild anchors (build_anchors.js ingests vihtavuori.local.json if present)
node scripts/build_anchors.js
```

`build_anchors.js` adds VV rows as **velocity-only** (`np = null`): the VV "max-at-CIP"
η_p is a different regime from the ladder-averaged η_p of RS/Western, so it is **not**
blended. VV-only combos therefore have an anchored velocity but **no anchored pressure** —
the live tool falls back to the global η_p for those (shown as *"vitesse seule — pression
η_p global"*). Commit **only** the regenerated `data/anchors.json` (derived means); the
parsed `data/vihtavuori.local.json` stays gitignored (raw tables — golden rule).

> The guide PDFs live in `reloading/guides/` (outside this repo) and are **not**
> redistributed. Cartridges absent from `calibers.json` are skipped — add their geometry
> first (see *Add a cartridge*; `case_vol` can come from `P95(powder volume)/1.08` over the
> matched rows) to unlock those VV combos.

### Starting-charge pre-fill & the Ladder window

`node scripts/build_start_charges.js` regenerates `data/start_charges.local.json` — the
real manufacturer **minimum and maximum** charge (`c`, `cmax`) for the typical (median)
bullet of each cartridge×powder. The UI uses it twice: it **pre-fills** the start charge
when the user changes cartridge/powder, and it bounds the **Ladder** planner's safe window
(start → max). It is **gitignored** (real charges → golden rule): the live site ships it,
the public repo does not, and the UI degrades gracefully when it is absent (no pre-fill;
the ladder falls back to an indicative range around the current charge). **Never** derive
the max from the model — the pressure model under-predicts, so a model-derived "max at CIP"
is *too high* (unsafe); only published min/max loads bound the ladder.

> **Ladder mode** (UI, no data files beyond the above). The estimator *plans* a ladder
> (charge → v0 / Pmax / %CIP table over the safe window) and *exploits* measured
> `charge,velocity` pairs (fits the rifle's own `E_eff` + an apply-as-anchor button). It
> deliberately does **not** locate the harmonic "node" — the 0-D model is smooth; that is
> for the range and statistics to decide (see the wiki *méthode ladder* and the guide).
> Regenerate `start_charges.local.json` after any data change so the ladder window stays
> correct on the live site.

## Run the regression test

```sh
node energy_model.test.js
```

It checks the model against the cited fixture in `data/reference_loads.json`
(efficiency ranges + leave-one-out RMS by powder).

## Code conventions

- Plain Node.js, no build step, no runtime dependencies.
- `energy_model.js` is the single source of truth for the physics; reuse it rather
  than re-deriving formulas in scripts.
- Keep the safety framing intact: **pressure is indicative**, the tool is an
  estimation aid, not a load-development authority.

## The `legacy/` directory

`legacy/` holds the former Gordon's Reloading Tool clone (thermodynamic ODE),
retained for exploration only. It is not part of the estimator and is not
maintained; please direct improvements to the estimator.
