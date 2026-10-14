# AI Model Documentation

> **Disclaimer.** All outputs are model estimates built on caller-supplied parameters. They are NOT proof of food
> safety, edibility or regulatory compliance. Thresholds and risk bands are demonstration defaults.

## 1. Physical baseline (`ARRHENIUS_BASELINE`, version `arrhenius-baseline-1.0`)
- Acceleration factor: `AF(T) = exp( Ea/R * (1/Tref - 1/T) )`, T in kelvin (`T = C + 273.15`), `R = 8.314462618 J/(mol K)`.
- Effective age: `age = sum(dt_i * AF(T_i))`, piecewise-constant: each reading's temperature is held until the next
  reading (last reading held until `evaluateAt`, default = last checkpoint time). The interval from `producedAt`
  to the first valid reading uses the first reading's temperature (flagged by a warning).
- `shelfEff = refShelfLife * initialQualityPct/100`; `score = clamp(100*(shelfEff - age)/refShelfLife, 0, 100)`
  (identical to the contract formula when `initialQualityPct=100`).
- `remainingShelfLifeHours = max(0, shelfEff - age) / AF(latest valid temperature)`.
- `qualityLossPct = max(0, initialQualityPct - score)`; `hoursAboveReferenceTemp` = time with `T > Tref`.
- Risk mapping (defaults; `safeAbove`/`flagAbove` overridable via `params.qualityThresholds`):
  `LOW` score > safeAbove(60) and >= 80; `MODERATE` safeAbove < score < 80; `HIGH` flagAbove(40) <= score <= safeAbove; `CRITICAL` score < flagAbove.
  The 80 cut-off is a demonstration choice; 60/40 follow the contract's SAFE/FLAGGED/QUARANTINED rules.
- Humidity: no humidity constants are built in. Only if the request supplies `humidityRange`, `humidityOutOfRangeAf`
  (multiplier >= 1) and a `humiditySource` citation is AF multiplied while RH is out of range. With only a range,
  humidity is reported as a factor and a warning, with no effect on the estimate.
- Parameters (`Ea`, `Tref`, reference shelf life) are never defaulted; they come from the request (ProductType).
- Data-quality warnings: gaps (> `gapWarningHours`, default 6 h, a heuristic not a product parameter), missing /
  implausible readings (temperature outside -50..80 C, RH outside 0..100 are rejected and the prior valid value is held),
  non-chronological input (sorted), checkpoints before `producedAt` or after `evaluateAt` (ignored), extrapolation beyond
  the supplied `tempRange`, absent validity range, sub-zero temperatures, missing citation.
- Errors: schema problems 422; no valid reading / `evaluateAt` before production 400 `INVALID_INPUT`.
- `uncertainty` is `{supported:false}`: no validated interval method exists, so none is invented.
- `factors[].impact` units: hours of effective age for time/humidity factors, degrees C for `peak_temperature`.

## 2. ML residual correction (`ARRHENIUS_ML_CORRECTED`)
Target = `observed_remaining - baseline_remaining`. Features: baseline summary statistics (effective age, mean/max/min/
latest temperature, hours above reference, humidity summary, parameters, category). Candidates RandomForest and XGBoost,
selected by out-of-fold MAE, scored with `GroupKFold` (grouped by batch) so no batch leaks between train/test. The corrected
remaining life = `max(0, baseline + residual)`; score/effective age stay physical. Artifacts: `artifacts/<version>/model.joblib`
+ `metadata.json` (dataset source, licence, hash, metrics, features, library versions, `demonstrationOnly`, `validated`).
Models load at startup; the baseline is the fallback whenever no `validated`, non-demonstration model exists or correction fails.

## 3. Dataset provenance and metrics
No suitable public labelled dataset could be obtained and verified (see `ai-service/datasets/README.md`). The shipped model
was trained on **synthetic** data only (`--demonstration-only`) whose hidden "true" process (Ea x1.2, humidity-dependent
ageing, noise) differs from the baseline by construction. Reported metrics (remaining shelf life, hours; 5-fold GroupKFold,
300 synthetic batches, seed 42): baseline MAE 14.01 / RMSE 18.31 / R2 0.950; RandomForest-corrected MAE 6.13 / RMSE 9.96 /
R2 0.985. Fresh-seed synthetic check (200 batches): baseline MAE 14.30, corrected MAE 6.74. These show that the pipeline
recovers a known synthetic bias - **synthetic self-consistency only, not real-world validation**; they say nothing about
real food accuracy. Responses that use a demo model carry `demonstrationMode:true` plus a warning. `/predict` ignores demo
models unless `AI_ALLOW_DEMO_MODEL=1`.

## 4. Simulator
Seedable (`random.Random(seed|category|scenario)`), scenarios NORMAL, TEMP_EXCURSION, COOLING_FAILURE, TRANSPORT_DELAY,
VARIABLE_HUMIDITY, MULTI_HANDOVER, MISSING_READINGS, INVALID_READINGS; every record `simulated:true`. Set points
(FRUIT 12 C/90 %, VEGETABLE 5 C/92 %, DAIRY 4 C/85 %) are simulation settings, not storage recommendations.
INVALID_READINGS deliberately emits out-of-range values; MISSING_READINGS emits nulls.

## 5. Limitations
Single-mechanism Arrhenius kinetics; no microbial growth model, no freezing/chilling injury, no gas atmosphere, no
product variability; piecewise-constant temperature between readings; sensor truthfulness is assumed; humidity effect only
if parameterised; parameters in demos are placeholders unless cited.

## 6. How real validation must be done
1. Obtain measured shelf-life/quality end-points (sensory, microbial or instrumental with a stated failure criterion) for
   many independent batches under logged temperature histories, covering each category and the temperature range of use.
2. Take Ea/Tref/shelf life from cited literature, or fit them on a training split only.
3. Split by batch (and by trial/supplier/season) with a never-touched test set; report baseline vs corrected MAE, RMSE, R2
   and calibration; check performance in excursion scenarios and at the extremes.
4. Only then set `--mark-validated`; produce intervals via a validated method (e.g. conformal/quantile on held-out data)
   before enabling `uncertainty.supported`.
5. Re-validate on drift, new products or sensors; involve food-safety experts before any safety-relevant use.
