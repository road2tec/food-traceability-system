# ai-service (FastAPI, port 8001)

Physical Arrhenius freshness engine + optional ML residual correction + synthetic data simulator.
Model details: `../docs/AI_MODEL.md`. Estimates are not proof of food safety.

## Setup (PowerShell)
```powershell
cd ai-service
& "C:\Program Files\Python310\python.exe" -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## Run
```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8001
curl.exe http://localhost:8001/health
```
Interactive docs: http://localhost:8001/docs

## Tests
```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

## CLI
```powershell
.\.venv\Scripts\python.exe -m app.cli train --demonstration-only            # synthetic only, labelled as such
.\.venv\Scripts\python.exe -m app.cli evaluate                              # fresh-seed synthetic self-consistency
.\.venv\Scripts\python.exe -m app.cli simulate --category FRUIT --scenario COOLING_FAILURE --duration-hours 72 --count 24 --seed 1
# real data (see datasets/README.md):
.\.venv\Scripts\python.exe -m app.cli train --data-dir datasets\real --dataset-source "<citation>" --dataset-licence "<licence>"
.\.venv\Scripts\python.exe -m app.cli evaluate --data-dir datasets\holdout
```
Artifacts are written to `artifacts/<version>/{model.joblib,metadata.json}` and loaded at startup.

## Model selection
`/predict` uses the pure Arrhenius baseline (`ARRHENIUS_BASELINE`) unless a model that is `validated` and not
`demonstrationOnly` exists (`train ... --mark-validated` on real data). To try a synthetic demo model set
`$env:AI_ALLOW_DEMO_MODEL="1"`; responses then carry `demonstrationMode:true` and a SYNTHETIC warning.

## Endpoints
`GET /health`, `GET /models`, `POST /predict`, `POST /simulate` (schemas: `../docs/API_CONTRACT.md`).
Errors: 422 schema validation; 400 `{detail:{code:"INVALID_INPUT",message}}` when no valid reading can be evaluated.
