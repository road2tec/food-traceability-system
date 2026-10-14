# Food Traceability Server (Node.js / Express / MongoDB)

Implements `docs/API_CONTRACT.md` under `/api/v1` (CommonJS, Express 5, Mongoose 9, zod validation).

**Scope note:** blockchain/Fabric is out of scope for this build. Integrity is provided by a local
SHA-256 hash per checkpoint (canonical JSON, contract field list) that is recomputed and compared on
`POST /batches/:id/verify` and on the public verify endpoint. This detects later edits of stored
checkpoint data; it does **not** prove the original reading was truthful, and someone able to rewrite
both data and hash in MongoDB would not be detected (there is no external anchor).

## Run

```
cd server
cp .env.example .env        # optional; defaults work with local MongoDB on 27017
npm install
npm run seed                # admin + demo orgs/users + DEMONSTRATION product types
npm start                   # http://localhost:4000  (docs: /api-docs, health: /api/v1/health)
npm test                    # node:test + supertest; uses throwaway DB food_traceability_test
npm run openapi             # regenerate src/docs/openapi.json
```

### Seed credentials
Set `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_DEMO_PASSWORD` in `.env`, or leave the passwords empty:
random ones are generated and **printed once** on first seed. Accounts created (all ACTIVE):
`admin@example.test` (ADMIN), `producer@example.test`, `distributor@example.test`, `warehouse@example.test`,
`retailer@example.test` (demo organisations). Seed is idempotent and never overwrites existing accounts.
Product types are flagged `isDemonstration: true` with a `sourceNote` stating the values are illustrative,
not literature-derived and not food-safety guidance.

### Environment
See `.env.example`. `JWT_SECRET` is mandatory (>=32 chars) when `NODE_ENV=production`; in development a random
secret is generated per boot. `AI_SERVICE_URL` (default `http://127.0.0.1:8001`), `AI_TIMEOUT_MS`,
`CLIENT_ORIGIN` (CORS), `PUBLIC_BASE_URL` (QR target `${PUBLIC_BASE_URL}/verify/:batchId`), `UPLOAD_DIR`.

## Behaviour notes
- Role, organisation and account status are always loaded from the DB per request (never from the JWT/client). Logout revokes the token id.
- New accounts are `PENDING` until an ADMIN sets them `ACTIVE`. Registering with an existing organisation name+type attaches to it, still PENDING until admin approval.
- Cross-organisation access to a batch returns 404 (existence not leaked). Visible = producer, current custodian, or a party to a custody transfer; ADMIN sees all.
- Checkpoints: only the current custodian organisation (not ADMIN) may record; same pipeline for MANUAL, CSV/JSON import and SIMULATOR (`/simulate`; ADMIN simulations are attributed to the current custodian organisation). Rejected rows are always reported, never silently dropped.
- Prediction failures (AI service down/timeout/malformed) -> batch `PENDING_REVIEW` + deduplicated `PREDICTION_FAILURE` alert; the checkpoint is still stored.
- Quality: score > safeAbove (60) and checks pass -> SAFE; flagAbove (40)..safeAbove -> FLAGGED; < 40 -> QUARANTINED. Per-ProductType thresholds override the global `/admin/thresholds`. QUARANTINED is never auto-released; ADMIN release needs a reason (>=10 chars), moves the batch to FLAGGED, is audit-logged, and later low scores do not silently re-quarantine it. These are demonstration defaults, not food-safety standards.
- Alerts are deduplicated per `dedupeKey` while unacknowledged (occurrence counter instead of new rows).
- Integrity `overall` values: `VERIFIED`, `MISMATCH` (also sets `PENDING_REVIEW` + `HASH_MISMATCH` alert), `NO_CHECKPOINTS`.
- Certificates: pdf/png/jpeg, 5 MB, magic-byte check, random stored filename; shown publicly only after ADMIN approval (`PATCH /batches/:id/certificates/:certId`).
- Extra endpoints beyond the contract: `POST /transfers/:id/cancel`, certificate approve/download, `GET /api-docs.json`.
