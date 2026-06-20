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
      "bore_mm": 7.82,        // groove/bullet diameter -> bore area A = πd²/4
      "case_mm": 51.18,       // case length -> bullet travel L = barrel − case
      "case_vol_cm3": 2.981   // effective chamber volume (see note)
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
product name).

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
