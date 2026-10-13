# Data Formats

Schemas of the files under [`../data/`](../data). Published files are committed;
`*.local.json` are raw/intermediate calibration data and are **gitignored** (EULA).

## Published files

### `calibers.json`

Standard cartridge geometry (CIP/SAAMI, public domain). Keys are the **exact**
cartridge labels used by the calibration guide.

```jsonc
{
  "calibers": {
    "308 Win.": {
      "type": "rifle",         // "rifle" | "handgun" — groups/sorts the UI dropdown and
                               // sets the default barrel length (122 mm vs 600 mm)
      "bore_mm": 7.82,         // groove/bullet diameter -> bore area A = πd²/4
      "case_mm": 51.18,        // case length -> bullet travel L = barrel − case
      "case_vol_cm3": 2.981,   // effective chamber volume (see note)
      "pmax_cip_bar": 4150,    // CIP/SAAMI max pressure (bar) — drives the overpressure
                               // warning; nominal/indicative, omitted if uncertain
      "test_barrel_mm": 610    // optional: reference test-barrel length. Peak PRESSURE is
                               // evaluated at this travel (peak forms near the chamber,
                               // ~independent of the real barrel), and predicted VELOCITY is
                               // anchored here then scaled to the user's barrel (power law, k = 0.15 on travel).
                               // Auto-derived per cartridge by `scripts/build_test_barrels.js`
                               // (modal calibration barrel across RS/Western/Vihtavuori).
                               // Falls back to 600 (rifle) / 122 (handgun) when absent.
    },
    "45 ACP (Auto)": {
      "type": "handgun",
      "aliases": ["45 Auto"],  // optional: extra manufacturer-guide names that map to this
                               // SAME geometry at ingest time (e.g. "45 AUTO (ACP)", and
                               // "+P" variants, are matched to the base cartridge by the
                               // anchor builder). Used only by scripts, ignored by the UI.
      "bore_mm": 11.48, "case_mm": 22.81, "case_vol_cm3": 1.126, "pmax_cip_bar": 1300
    }
  }
}
```

`case_vol_cm3` is a **derived aggregate**: the median over the calibration set of
`V0 = (C/ρ_bulk)/(fill/100)`. It is used by the live tool to compute the fill ratio
from a user's charge (the user does not know fill%). It is a physical constant, not
manufacturer data.

### `powders.json`

Propellant constants, from the GRT-derived component database.

```jsonc
{
  "powders": {
    "RS52": {
      "Qex": 3920,          // specific energy / heat of explosion (kJ/kg)
      "Ba": 0.5163,         // vivacity coefficient
      "pcd": 949,           // bulk (pour) density (kg/m³)
      "mfg": "Reload Swiss" // manufacturer (display label)
    },
    "1680": {               // HYBRID fallback entry: only bulk density known
      "pcd": 960,           // -> velocity via the e_eff fallback (no Qex/Ba needed)
      "mfg": "Accurate"
    }
  }
}
```

All powder fields are optional. With `Qex`+`Ba`, the tool uses the η_b path;
otherwise it falls back to the **`e_eff`** model (same ~10 % cold accuracy).
**`pcd` is optional too**: it only feeds the fill ratio (domain warnings + the
pressure term), **not the velocity** — if absent, fill is taken at a nominal 100 %.
So a powder can be added from bulk density, or even **from its name alone** (velocity
only, no fill warnings, rougher pressure). `mfg` sets the dropdown label (key =
product name). `pcd_src`, when present, says where the density comes from: a powder
maker's published value that confirms it (Shooters World, Vihtavuori), or, when it starts
with « Nosler », the density implied by Nosler's load-data sheets, set only where no other
value exists (`DENSITES_NOSLER` in `scripts/import_catalog.js`; Nosler's table runs 1 to 14 %
below Vihtavuori's own values, within ±2 % of the catalogue for half the other powders).

### `model_coefficients.json`

The published output of calibration. Loaded by the estimator at runtime.

```jsonc
{
  "_doc": "...", "_date": "YYYY-MM-DD", "_credit": "...",
  "_n_records": 1700, "_n_powders": 14,
  "eta_b": {
    "features": ["1", "fill/100", "Ba"],   // evaluation order
    "coef":     [0.1628, 0.1218, 0.0180],  // dot(coef, features) = η_b
    "lopo_v_rms_pct": 9.8,
    "note": "..."
  },
  "eta_p": {
    "features": ["1", "fill/100", "ln(Re)"],
    "coef":     [0.8868, 0.0515, -0.2239],
    "lopo_P_rms_pct": 16.0,
    "note": "Re = 1 + A*travel/V0; pressure is INDICATIVE only"
  },
  "e_eff": {                                 // fallback when Qex/Ba unknown
    "features": ["1", "fill/100"],
    "coef":     [927679, 214304],            // J/kg ; v0 = sqrt(2*E_eff*C/m_e)
    "unit": "J/kg",
    "lopo_v_rms_pct": 10.1
  }
}
```

To evaluate: `η = Σ coef[i] · feature[i]`, where `features` names the terms in order
(`"1"` = intercept, `"fill/100"` = fill ratio /100, `"Ba"`, `"ln(Re)"`).

### `anchors.json`

Per-(cartridge×powder) **anchor coefficients** (derived means, not raw load tables).
When the selected combo is present, the tool refines from ~10 % (cold) to ~5 %.

```jsonc
{
  "anchors": {
    "308 Win.|RS52":   { "eeff": 1206044, "np": 0.4479, "n": 40, "mhr": 3.5 },
    "22 Hornet|RS30":  { "eeff": 757000,  "np": 0.1916, "n": 10, "mhr": 22.7, "mhflag": true }
    // key = "<caliberKey>|<powderKey>" ; eeff = mean effective energy (J/kg);
    // np = mean η_p ; n = number of reference loads. Built by scripts/build_anchors.js.
    //
    // Mayer–Hart consistency guard (only on combos whose powder has Qex):
    //   mhr    = group mean of the MH velocity residual (%) — MH predicts v0 from the
    //            measured Pmax + thermochemistry; it gauges whether the (v0,Pmax) pair is
    //            self-consistent. Cohort mean ≈ +5 % (systematic, not a defect).
    //   mhflag = true when |mhr − cohort mean| > 2σ — the manufacturer pair is atypical,
    //            so the anchored *pressure* is less trustworthy. The UI then shows
    //            "ancrée fabricant (à vérifier)" and a caution note. Velocity is unaffected.
    //   nosler = true when Nosler's load-data sheets contributed: velocity only, rifles only,
    //            and only where the other sources give fewer than three loads (gap filler).
  }
}
```

### `reference_loads.json`

Small cited fixture used by `energy_model.test.js` (regression test). Contains a
handful of joint `(v0, Pmax)` reference loads with their powder/caliber constants.

## Local (gitignored) files

These are produced by the calibration pipeline and must never be committed.

### `rs_loads.local.json` — raw parsed rows (`01_parse_guide.js`)

```jsonc
[{
  "cartridge": "308 Win.", "bullet_gr": 130, "powder": "RS52",
  "barrel_mm": 600, "coal_mm": 70.5,
  "min": { "C_gr": 38.6, "v0": 766, "Pmax": 2301, "fill": 84 },
  "max": { "C_gr": 47.5, "v0": 928, "Pmax": 3548, "fill": 104 }
}]
```

### `rs_dataset.local.json` — per-load efficiency records (`02_build_dataset.js`)

```jsonc
[{
  "cartridge": "308 Win.", "powder": "RS52", "level": "max",
  "m_gr": 130, "C_gr": 47.5, "v0": 928, "Pmax": 3548, "fill": 104,
  "barrel_mm": 600, "Qex": 3920, "Ba": 0.5163, "Re": 9.84,
  "eta_b": 0.337, "eta_p": 0.435
}]
```

### `sierra_<cartridge>.local.json` — Sierra legacy charge→velocity rows

Velocity-only anchor source (no pressure). `barrel_mm` is **Sierra's** test barrel and may differ
from the cartridge `test_barrel_mm`; `build_anchors.js` rescales each velocity to the reference
before computing `eeff` (see CONTRIBUTING → *Sierra legacy load data*). `v0_fps` in feet/second.

```jsonc
{ "rows": [
  { "cartridge": "7.5 x 55 Swiss", "bullet_gr": 165, "powder": "IMR 4064",
    "charge_gr": 42.0, "v0_fps": 2500, "barrel_mm": 780 }
]}
```

### `shooters_world.local.json` — Shooters World guide rows (`scripts/parse_shooters_world.py`)

Explosia/Lovex powders under their US names, SAAMI data: starting and maximum charge with
velocities, maximum pressure in **psi**, all in imperial units as printed. `poudre` is the
`powders.json` key; `cartouche`, `etui`, `balle` are the printed labels (map them with the `CLE`
table of `scripts/sw_remplissage.py`). `canon_in` is set only where the guide prints a barrel
length; `comprimee` marks a maximum printed with a « C ». Some rows copy the Lovex (C.I.P.) data,
pressure converted from bar: see `scripts/sw_lovex_comparaison.py`. Used by `sw_remplissage.py`
(case-volume check), `sw_lovex_comparaison.py` and `sw_crosscheck.js` (validation); never by the fit.

```jsonc
{ "rows": [
  { "poudre": "Shooters World Match Rifle", "cartouche": ".308 Winchester", "etui": "Winchester",
    "balle": "168 gr Nosler BT", "balle_gr": 168, "coal_in": 2.81, "start_gr": 42.0, "start_fps": 2590,
    "max_gr": 45.7, "max_fps": 2798, "max_psi": 60500, "canon_in": null, "comprimee": false, "page_pdf": 39 }
]}
```

### `nosler.local.json` — Nosler load-data sheets (`scripts/nosler_fiches.py`)

One PDF per cartridge and bullet, downloaded from nosler.com into `../guides/nosler/` (with
`--telecharger`; not redistributed). `fiches` holds each sheet's header: `eau_gr` is « CASE HOLDS:
x Gr. WATER », the water capacity of Nosler's case **with the bullet seated** at the tested length
(the estimator's usable volume, in grains of water). `rows` holds every load line: `ld_pct` is
Nosler's « LOAD DENSITY (VOLUME) », `comprimee` its « ** » (all above 100 %), `poudre` the
`powders.json` key (`POUDRES` table of the script). Implied bulk density = `charge_gr / (ld_pct/100 ×
eau_gr)` g/cm³. `canon_mm` is the test barrel of the sheet; `balle_plage` the bullet weights of a sheet
that covers several (« 165/168 grain »; `balle_gr` is then the midpoint). Used for checks, for densities
missing elsewhere, and as a velocity-only anchor source for rifles where the other sources give fewer
than three loads (`scripts/build_anchors.js`; `scripts/nosler_crosscheck.js` measures the agreement first).

```jsonc
{ "fiches": [ { "fiche": "300-Blk-110gr-version-9-0.pdf", "cle": "300 AAC BLK", "eau_gr": 19.2,
               "balle_gr": 110, "balle_plage": null, "oacl_essai": "2.025", "etui": "Nosler", "canon": "16\" Pac-Nor",
               "canon_mm": 406.4, "archivee": false } ],
  "rows": [ { "fiche": "300-Blk-110gr-version-9-0.pdf", "cle": "300 AAC BLK", "poudre": "Hodgdon H110",
              "poudre_nosler": "H110", "charge_gr": 19.0, "fps": 2365, "max": true, "comprimee": true, "ld_pct": 101 } ] }
```

### Lead bullets (`cast`)

The manufacturer rows of Lyman, Hodgdon, Western and LoadData carry `cast: true` when the bullet is lead
(Lyman: « Cast », « Lead » or a mould number; Hodgdon: cast makers and lead shapes, `PLOMB` in
`scripts/parse_hodgdon.js`; Western: a description starting with « (L) », « (P) » plated bullets kept;
LoadData: `PLOMB` in `scripts/parse_loaddata.js`). The coefficients are fitted on jacketed bullets, so
anchors, starting-charge windows and the fill diagnostic skip these rows (2026-10-13). Removing them
improved every independent check: Nosler handguns 9.6 → 8.9 % RMS, Lyman handguns 17.5 → 16.2 %,
ADI anchored pressure 15.5 → 12.2 %.

## Units summary

| Quantity | Unit |
|---|---|
| bullet/charge mass | grain (gr) |
| velocity v0 | m/s |
| pressure Pmax | bar |
| bore, case, barrel length | mm |
| case volume | cm³ |
| Qex | kJ/kg |
| bulk density pcd | kg/m³ |
| fill ratio | % |
