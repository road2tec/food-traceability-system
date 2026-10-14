# Testing Guide

Prerequisites: Node 20+ (24 used here), Python 3.10, MongoDB on `127.0.0.1:27017`. Run `infrastructure/scripts/setup.ps1` (or `setup.sh`) once.
Blockchain is out of project scope; integrity is checked with local SHA-256 hashes only.

## 1. One command for everything

```powershell
# PowerShell (if blocked: powershell -ExecutionPolicy Bypass -File ...)
.\infrastructure\scripts\run-tests.ps1            # all unit suites + e2e if the stack is up
.\infrastructure\scripts\run-tests.ps1 -SkipE2E   # unit suites only
```
```bash
infrastructure/scripts/run-tests.sh [--skip-e2e] [--skip-python]
```
The script prints a PASS / FAIL / SKIPPED table and exits non-zero if any suite fails.

## 2. Per-component suites

| Component | Directory | Command | Needs |
|---|---|---|---|
| Server (Jest) | `server/` | `npm test` | MongoDB (or in-memory per server README) |
| Client (Vitest) | `client/` | `npm test` | nothing |
| AI service (pytest) | `ai-service/` | `.venv\Scripts\python -m pytest -q` | venv from setup |
| AI train / evaluate | `ai-service/` | `infrastructure\scripts\ai-train.ps1 [-Mode train\|evaluate\|both]` | venv |
| E2E + security | `tests-e2e/` | `npm test` | **running stack** + MongoDB |

## 3. End-to-end suite (`tests-e2e/`)

Drives the *running* system through the public HTTP API (plain `fetch`, no framework). Direct MongoDB access is used only by the tamper steps.

```powershell
.\infrastructure\scripts\setup.ps1
.\infrastructure\scripts\start-all.ps1 -Seed      # starts ai-service, server, client; seeds demo data
cd tests-e2e
npm test                                          # full run
npm run test:workflow                             # steps W*
npm run test:security                             # steps S* (dependencies on W* are SKIPPED if W* not run)
npm run selftest                                  # offline helper checks, no stack needed
```
Result is printed and written to `tests-e2e/report.json`.

Environment overrides: `API_URL` (default `http://127.0.0.1:4000/api/v1`), `AI_URL`, `MONGODB_URI`, `PUBLIC_BASE_URL` (read from root `.env` if unset), `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` (seeded admin from the server README; defaults are guesses), `E2E_RATE_LIMIT_ATTEMPTS` (default 60).

### Steps

| ID | Checks | Skip rule |
|---|---|---|
| W01 | health: server, mongo, AI | |
| W02-W05 | admin login; register producer/distributor/producer-B (PENDING); PENDING login refused; admin approves | |
| W06-W07 | register batch; QR PNG decodes to `${PUBLIC_BASE_URL}/verify/:batchId` | |
| W08 | checkpoint persisted (API + MongoDB, 64-hex hash) | |
| W11-W12 | freshness prediction present; quality-rule status matches thresholds | SKIPPED if ai-service down |
| W13 | CSV import with malformed rows -> per-row errors; commit only valid | |
| W14 | cold-chain break -> `TEMP_EXCURSION` alert, score drops | |
| W15-W16 | custody transfer producer->distributor; more checkpoints; recalculation | |
| W17 | server verify of untouched batch: every checkpoint `match=true` | |
| W18 | `/public/verify` whitelist: no emails, price, notes, user ids, extra keys | |
| W19-W22 | tamper: local recompute baseline; edit stored checkpoint in MongoDB; recompute detects; server verify reports mismatch (`match=false`) for that checkpoint only; `HASH_MISMATCH` alert; public integrity not clean | W20 skipped if W19 fails |
| W99 | restores tampered record | |
| S01-S07 | 401 without/with forged token; 403 wrong role; cross-org denied; old custodian denied; NoSQL-injection login; no user enumeration | |
| S99 | login rate limit returns 429 `RATE_LIMITED` (runs last; throttles this IP for the window) | |

Note: re-running within the login rate-limit window may yield 429 on login in W05; wait for the window or restart the server.

## 4. Expected results (fill in per run)

| Suite | Date | Host | Pass | Fail | Skipped | Notes |
|---|---|---|---|---|---|---|
| server | | | | | | |
| client | | | | | | |
| ai-service | | | | | | |

## 5. Docker (UNTESTED)

`docker-compose.yml` was validated only with a YAML parser; Docker is not installed on the authoring machine.
