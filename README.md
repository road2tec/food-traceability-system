# AI-Based Food Traceability and Freshness Prediction System

Software-only platform that tracks food batches from producer to consumer, predicts freshness / remaining shelf life, applies quality rules, raises alerts, and lets consumers verify a batch via QR code.

> **Scope:** blockchain / Hyperledger Fabric is **out of scope** (removed on request). Data integrity is provided by a local SHA-256 hash per checkpoint, recomputed and compared on verification. This detects edits to stored data; it does not prove the original reading was truthful, and it would not catch someone who rewrites both data and hash in MongoDB.

## Components
| Dir | What | Port |
|---|---|---|
| `client/` | React + Vite + Tailwind UI | 5180 |
| `server/` | Express + MongoDB API (`/api/v1`, Swagger at `/api-docs`) | 4000 |
| `ai-service/` | FastAPI: Arrhenius freshness engine, ML correction, simulator | 8001 |
| `tests-e2e/` | End-to-end + security suite against the running stack | – |
| `infrastructure/` | PowerShell/Bash helper scripts, Docker files (Docker untested) | – |
| `docs/` | Contract, AI model, testing, troubleshooting, status | – |

## Prerequisites
Node 20+ (tested 24), Python 3.10+, MongoDB 7 running on `127.0.0.1:27017`.

## Setup (PowerShell, from repo root)
```powershell
# 1. Server
cd server; npm install; copy .env.example .env
#    edit .env: set JWT_SECRET, SEED_ADMIN_PASSWORD, SEED_DEMO_PASSWORD (min 10 chars, letter+digit)
npm run seed          # admin + demo users + DEMONSTRATION product types
# 2. AI service
cd ..\ai-service; py -3.10 -m venv .venv; .\.venv\Scripts\python.exe -m pip install -r requirements.txt
# 3. Client
cd ..\client; npm install
```

## Run (three terminals)
```powershell
cd ai-service; .\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8001
cd server;     npm start
cd client;     npm run dev        # http://localhost:5180
```
Demo logins (seeded, password = value you set in `server/.env`): `admin@example.test`, `producer@example.test`, `distributor@example.test`, `warehouse@example.test`, `retailer@example.test`.

## Tests
```powershell
cd server;     npm test                         # 44 tests (uses throwaway DB food_traceability_test)
cd ai-service; .\.venv\Scripts\python.exe -m pytest -q   # 61 tests
cd client;     npm test                         # 37 tests
cd tests-e2e;  npm install
$env:E2E_ADMIN_EMAIL='admin@example.test'; $env:E2E_ADMIN_PASSWORD='<your admin password>'
node run.mjs                                    # 29 steps vs live stack; restart the server between runs (login rate-limit test exhausts the limiter)
```

## Freshness model — limitations
Physical baseline: Arrhenius kinetics with parameters from the product type. Seeded parameters are **demonstration values, not validated**. No real labelled dataset was obtainable, so the ML correction is trained on synthetic data only and is disabled by default (`AI_ALLOW_DEMO_MODEL=1` enables it, flagged as demonstration). Reported metrics are synthetic self-consistency, not real-world accuracy. Estimates are never proof that food is safe to eat. See `docs/AI_MODEL.md`.

## Quality rules (demo defaults, admin-configurable)
Score > 60 → SAFE · 40–60 → FLAGGED · < 40 → QUARANTINED · prediction failure / integrity mismatch → PENDING_REVIEW. Quarantine is never auto-released (admin + reason + audit log).

## Status and known gaps
See `docs/IMPLEMENTATION_STATUS.md`. The UI has been tested only with mocked API calls and a build/smoke check, not clicked through in a browser against the live API; analytics response shapes are matched by tolerant normalizers. Docker files are untested (Docker not installed). Not production-ready.
