# Acceptance Checklist

For the lead to complete. "Verified" = demonstrated by an executed test or manual run with evidence; leave "Unverified" items honest. Evidence column: test id (see TESTING.md), command, or screenshot/log path.

Legend: V = Verified, U = Unverified, N/A.

## A. Functional workflow

| # | Criterion | Automated check | V | U | Evidence / notes |
|---|---|---|---|---|---|
| A1 | Producer/distributor registration creates PENDING user | e2e W03 | | | |
| A2 | PENDING user cannot log in | e2e W04 | | | |
| A3 | Admin approves; user can log in | e2e W05 | | | |
| A4 | Producer registers batch with id `FT-YYYYMMDD-XXXXXX` | e2e W06 | | | |
| A5 | QR PNG encodes `PUBLIC_BASE_URL/verify/:batchId` | e2e W07 | | | |
| A6 | Checkpoint recorded and persisted | e2e W08 | | | |
| A7 | CSV/JSON import reports row errors, commits valid rows only | e2e W13 | | | |
| A8 | Custody transfer proposed/accepted; custodian changes | e2e W15 | | | |
| A9 | Multi-party checkpoints and prediction recalculation | e2e W16 | | | |
| A10 | Consumer public verify page (no login) | e2e W18, manual UI | | | |
| A11 | Simulator produces records through normal pipeline | manual / server tests | | | |
| A12 | Analytics are org-scoped and real-data only | server tests / manual | | | |
| A13 | Admin: thresholds, audit log, CSV export, model list | manual | | | |

## B. AI / freshness

| # | Criterion | Check | V | U | Evidence |
|---|---|---|---|---|---|
| B1 | Prediction has score 0-100, model version, demo flag, disclaimer | e2e W11 | | | |
| B2 | Temperature excursion lowers score | e2e W14 | | | |
| B3 | Arrhenius kinetics follow contract formulas | ai-service pytest | | | |
| B4 | Seed parameters cited or flagged `isDemonstration` | review | | | |
| B5 | Model trained/evaluated; metrics recorded, never invented | `ai-train.ps1` | | | |
| B6 | UI/API state estimates do not prove edibility | review | | | |

## C. Quality rules and alerts

| # | Criterion | Check | V | U | Evidence |
|---|---|---|---|---|---|
| C1 | score >60 SAFE, 40-60 FLAGGED, <40 QUARANTINED | e2e W12 | | | |
| C2 | AI unavailable -> PENDING_REVIEW | server tests | | | |
| C3 | TEMP_EXCURSION alert on cold-chain break | e2e W14 | | | |
| C4 | HASH_MISMATCH alert on tamper | e2e W22 | | | |
| C5 | QUARANTINED never auto-released; ADMIN + reason + audit log | server tests | | | |

## D. Integrity (local SHA-256; blockchain out of scope)

| # | Criterion | Check | V | U | Evidence |
|---|---|---|---|---|---|
| D1 | Stored hash follows the contract canonical-JSON formula | e2e W19 | | | |
| D2 | Untouched batch verifies (all checkpoints match) | e2e W17 | | | |
| D3 | Tampered record detected by local recompute | e2e W20 | | | |
| D4 | Server verify reports hash mismatch for the edited checkpoint | e2e W21 | | | |
| D5 | HASH_MISMATCH alert and public integrity not clean | e2e W22 | | | |

## E. Security

| # | Criterion | Check | V | U | Evidence |
|---|---|---|---|---|---|
| E1 | No token -> 401 | e2e S01 | | | |
| E2 | Forged token -> 401 | e2e S02 | | | |
| E3 | Wrong role -> 403 | e2e S03 | | | |
| E4 | Cross-organisation access denied | e2e S04, S05 | | | |
| E5 | Public endpoint whitelists fields | e2e W18 | | | |
| E6 | Login rate limit | e2e S99 | | | |
| E7 | Injection-style login rejected; no user enumeration | e2e S06, S07 | | | |
| E8 | Passwords hashed; secrets only in `.env` (gitignored) | review | | | |
| E9 | Upload type/size limits, certificates approved before public | review | | | |

## F. Delivery

| # | Criterion | Check | V | U | Evidence |
|---|---|---|---|---|---|
| F1 | Setup scripts work from clean checkout (PS + bash) | run setup | | | |
| F2 | start-all / stop-all / health-check | run | | | |
| F3 | reset-dev refuses without -Force; drops only dev DB | run | | | |
| F4 | All unit suites pass | `run-tests.ps1` | | | |
| F5 | docker-compose builds and runs | **UNTESTED** (no Docker here) | | | |
| F6 | Swagger at `/api-docs` | manual | | | |
| F7 | README / docs complete; limitations stated honestly | review | | | |
