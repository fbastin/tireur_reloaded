# Calibration Procedure

How the published efficiency coefficients (`data/model_coefficients.json`) are
produced from a manufacturer reloading guide. See [`MODEL.md`](MODEL.md) for the
model itself and [`DATA_FORMAT.md`](DATA_FORMAT.md) for file schemas.

The pipeline is three Node scripts in [`../scripts/`](../scripts). It is fully
reproducible **provided you supply the raw guide yourself** — the raw manufacturer
tables are not redistributed (publisher EULA), only the derived coefficients are.

```
guide.pdf ──pdftotext──▶ guide.txt
  │  01_parse_guide.js          02_build_dataset.js        03_fit_and_validate.js
  └─▶ data/rs_loads.local.json ─▶ data/rs_dataset.local.json ─▶ data/model_coefficients.json
        (raw rows, gitignored)     (per-load η, gitignored)      (PUBLISHED)
```

## Step 0 — obtain and flatten the guide

Download the manufacturer guide (currently the **Reload Swiss Guide 2025**) and
convert it to layout-preserving text:

```sh
pdftotext -layout guide.pdf guide.txt
```

`-layout` keeps the table columns separated by runs of spaces, which the parser
relies on.

## Step 1 — parse load rows (`01_parse_guide.js`)

```sh
node scripts/01_parse_guide.js guide.txt
```

Each data row is split on runs of ≥2 spaces. Because the number of leading text
columns varies (bullet maker, case, primer may be present or blank), the parser
**anchors on the barrel/twist token** (`NNN (1:..")`) near the end of the row and
reads positions relative to it:

```
… powder  Cg_min C_min v0_min P_min fill_min  Cg_max C_max v0_max P_max fill_max  E0  barrel(twist)  COAL
```

It keeps the MIN and MAX blocks as `[charge_gr, v0, Pmax, fill%]`. A plausibility
filter rejects rows with out-of-range velocity/pressure/bullet mass. Output:
`data/rs_loads.local.json` (raw, gitignored).

*Sanity check:* the muzzle energy printed in the guide equals
`½·m_e·v0²` to within ~1 J, which confirms the column decoding.

## Step 2 — build the efficiency dataset (`02_build_dataset.js`)

```sh
node scripts/02_build_dataset.js
```

Joins each row with `powders.json` (`Qex`, `Ba`, `pcd`) and `calibers.json`
(`bore_mm`, `case_mm`), then computes, for both the min and max load:

- `η_b = ½·m_e·v0² / (C·Qex)` — via `energy_model.js` (single source of truth);
- `η_p = ½·m_e·v0² / (Pmax·A·L)`, with `A = πd²/4`, `L = barrel − case`;
- combustion-chamber volume per load `V0 = (C/ρ_bulk)/(fill/100)`;
- expansion ratio `Re = 1 + A·L/V0`.

Output: `data/rs_dataset.local.json` (one record per load, gitignored).

## Step 3 — fit and validate (`03_fit_and_validate.js`)

```sh
node scripts/03_fit_and_validate.js
```

Fits two ordinary-least-squares models (normal equations):

```
η_b = β0 + β1·(fill/100) + β2·Ba
η_p = γ0 + γ1·(fill/100) + γ2·ln(Re)
```

and validates them at two levels:

- **Leave-one-powder-out (LOPO)** — withhold a whole powder, fit on the rest,
  predict the held-out powder. This is the *cold-start* generalization.
- **Per cartridge × powder leave-one-out** — the *anchored* accuracy. Here `Ba` is
  constant within a group (collinear with the intercept), so the anchored model
  uses `η_b = a + b·(fill/100)`.

It writes `data/model_coefficients.json` (the only published artifact) and prints
the RMS errors.

### Reference results (Reload Swiss 2025, 1700 records, 14 powders)

```
η_b = 0.1628, 0.1218, 0.0180   (1, fill/100, Ba)
η_p = 0.8868, 0.0515, -0.2239  (1, fill/100, lnRe)
LOPO (cold)  : v 9.8 %  | P 16.0 %
anchored LOO : v 4.9 %
```

Velocity is reliable; **pressure is the weak output and stays indicative**. Adding
features beyond the above (e.g. `Qex`, charge/bullet ratio, `Re` in `η_b`) improves
the in-sample fit but degrades LOPO, so it is omitted.

## Updating the model

To refresh or extend the calibration (e.g. a new guide edition, more powders):

1. add any new powders/cartridges (see [`CONTRIBUTING.md`](CONTRIBUTING.md));
2. re-run steps 0–3;
3. commit **only** `data/model_coefficients.json` (and any new
   `powders.json`/`calibers.json` entries). Never commit `data/*.local.json`.
