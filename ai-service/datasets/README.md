# Datasets

## Status: no real labelled dataset is included
A search for a public, openly licensed dataset pairing per-batch temperature/humidity histories with measured
remaining shelf life found no suitable, verified download. Candidates seen but NOT adopted (unverified licence,
wrong modality, or hosted behind a portal): FreshLab-Tomato (IEEE DataPort, images + 5-point spoilage labels, no
shelf-life hours), Zenodo e-nose freshness record 17285312 (gas sensor series at room temperature), Mendeley
"Multi-Parameter Dataset ... Fruit Spoilage ... IoT Cold Storage" (czz68d9fwj; not evaluated/downloaded here),
a strawberry cold-chain temperature dataset (arXiv 2103.12895; licence unconfirmed). Nothing was fabricated;
no accuracy claim exists for real food. Anyone adopting one must record source + licence in model metadata.

Training on synthetic data is available only in `--demonstration-only` mode (see docs/AI_MODEL.md).

## Required schema for real data (two CSV files in one directory)
`readings.csv`: `batch_id, timestamp (ISO-8601 UTC), temperature_c, humidity_pct` (blank = missing).
`labels.csv` (one row per batch evaluation): `batch_id, category (FRUIT|VEGETABLE|DAIRY), produced_at,
ref_temp_c, ref_shelf_life_h, ea_j_mol, evaluated_at, observed_remaining_shelf_life_h`.

`observed_remaining_shelf_life_h` must come from a measured end-point (sensory/microbial/instrumental failure
criterion, stated in the dataset documentation), and `ref_*`/`ea_j_mol` from cited literature or fitted on the
training split only. Hold out whole batches (and ideally whole storage trials/suppliers) for the final test.
Place real data under `datasets/real/` (not committed unless the licence permits redistribution).
