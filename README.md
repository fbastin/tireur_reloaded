# Interior Ballistics Estimator (tireur.org)

A web tool that estimates **muzzle velocity** and (indicatively) **peak chamber
pressure** for handloads, plus an approximate pressure/velocity curve.

It uses an open **energy–efficiency model** calibrated on manufacturer data, rather
than a proprietary internal-ballistics solver.

## Documentation

- **[`docs/MODEL.md`](docs/MODEL.md)** — formal model, its unknowns, calibration summary.
- **[`docs/CALIBRATION.md`](docs/CALIBRATION.md)** — detailed extraction & calibration pipeline.
- **[`docs/DATA_FORMAT.md`](docs/DATA_FORMAT.md)** — schemas of all data files.
- **[`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)** — add powders/cartridges/data, re-fit.

> ⚠️ **Not a safety authority.** Pressure is indicative only; a load truly above the
> CIP limit can appear "safe". Always verify any charge against official manufacturer
> data. This is an estimation aid.
>
> This ceiling is **not specific to the empirical engine here**: every available tool —
> including the "physics-based" solvers (QuickLOAD, GRT) — is ultimately *calibrated to
> firing data* (form functions, vivacity, energy partition), shares the same
> measurement-scale divergence (CIP vs SAAMI) and small-calibre data gap, and so cannot
> turn a cold prediction into a safety verdict either. See
> [`docs/MODEL.md` §6.1](docs/MODEL.md) for the argument and evidence.

## Layout

```
index.php              Estimator UI (energy–efficiency model + Le Duc curve)
energy_model.js        Core model (η_b velocity, η_p pressure)
velocity_model.js      Le Duc / barrel-length helpers
energy_model.test.js   Validation harness  ->  node energy_model.test.js
data/
  calibers.json        Cartridge geometry (CIP) + derived case capacities
  powders.json         Reload Swiss powders: Qex, vivacity Ba, bulk density
  model_coefficients.json   Fitted η_b, η_p coefficients (published, derived)
  reference_loads.json      Small cited test fixture
scripts/               Calibration pipeline (01_parse_guide, 02_build_dataset,
                       03_fit_and_validate) — see docs/CALIBRATION.md
docs/                  MODEL, CALIBRATION, DATA_FORMAT, CONTRIBUTING
legacy/                Former Gordon's Reloading Tool clone (thermodynamic ODE,
                       indicative, kept for exploration only)
```

## Data provenance & licensing

- Component constants (powder `Qex`/`Ba`/`pcd`) derive from **Gordon's Reloading
  Tool** (Gordon, deceased) and the community dataset **zen/grt_databases** (CC0 1.0).
- Caliber capacities are derived aggregates (physical constants).
- Manufacturer load tables (Reload Swiss Guide 2025) are used **for calibration only
  and are not redistributed**; only the derived coefficients are published.

This tool is part of the [tireur.org](https://www.tireur.org) site and is consumed as
a git submodule under `reloading/tireur_reloaded/`.
