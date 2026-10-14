# Shared Contract (authoritative for all agents)

Ports: client 5180 | server 4000 | ai-service 8001 | MongoDB 27017 (db `food_traceability`).
Base: `/api/v1`. JSON. Auth: `Authorization: Bearer <jwt>`. Dates ISO-8601 UTC. Temperature °C, humidity % RH.

## Enums
- Roles: `ADMIN, PRODUCER, DISTRIBUTOR, WAREHOUSE, RETAILER` (consumer = no account)
- Org types: `PRODUCER, DISTRIBUTOR, WAREHOUSE, RETAILER, ADMIN`
- User status: `PENDING, ACTIVE, REJECTED, SUSPENDED`
- Batch status: `SAFE, FLAGGED, QUARANTINED, PENDING_REVIEW`
- Batch lifecycle: `REGISTERED, IN_TRANSIT, IN_STORAGE, AT_RETAIL, SOLD, WITHDRAWN`
- Event types: `PRODUCTION, STORAGE, DISPATCH, TRANSIT, ARRIVAL, RECEIPT, INSPECTION, SALE`
- Source types: `MANUAL, CSV_IMPORT, JSON_IMPORT, SIMULATOR`
- Transfer state: `PROPOSED, ACCEPTED, REJECTED, CANCELLED`
- Alert types: `LOW_FRESHNESS, NEAR_EXPIRY, TEMP_EXCURSION, HUMIDITY_EXCURSION, HASH_MISMATCH, QUARANTINED, CHAIN_PENDING, PREDICTION_FAILURE, SUSPICIOUS_HISTORY`
- Alert severity: `INFO, WARNING, CRITICAL`
- Product categories: `FRUIT, VEGETABLE, DAIRY` (extensible via ProductType)
- Risk category: `LOW, MODERATE, HIGH, CRITICAL`

## Quality rules (demo defaults, configurable per ProductType / global threshold doc)
score > 60 and all checks pass -> SAFE; 40..60 -> FLAGGED; < 40 -> QUARANTINED;
failed hash verification / invalid required data / prediction service unavailable -> PENDING_REVIEW.
QUARANTINED is never auto-released: requires ADMIN + reason + audit log + chain event.
These are demonstration defaults, not food-safety standards; estimates never prove edibility.

## Response format
Success: `{ "success": true, "data": <any>, "meta"?: {"page","limit","total","totalPages"} }`
Error: `{ "success": false, "error": { "code": "VALIDATION_ERROR|UNAUTHENTICATED|FORBIDDEN|NOT_FOUND|CONFLICT|RATE_LIMITED|UPSTREAM_UNAVAILABLE|INTERNAL", "message": "...", "details"?: [...] } }`
List query params: `page` (1), `limit` (20, max 100), `sort` (e.g. `-createdAt`), `q`, plus filters.

## Endpoints (server) — role in []; "auth" = any ACTIVE user
Auth: POST /auth/register {name,email,password,role,organisation:{name,type,address?,country?}} (-> status PENDING);
 POST /auth/login {email,password} -> {token,user}; POST /auth/logout; GET /auth/me.
Users/orgs: GET /users [ADMIN]; PATCH /users/:id/status {status} [ADMIN]; GET /organisations [auth; non-admin gets public fields only]; PATCH /organisations/:id [ADMIN].
Product types: GET /product-types [auth]; POST /product-types [ADMIN]; PUT /product-types/:id [ADMIN] — fields: name, category, referenceTempC, referenceShelfLifeHours, activationEnergyJPerMol, qualityThresholds{safeAbove,flagAbove}, humidityRange{min,max}, tempRange{min,max}, sourceNote, isDemonstration.
Batches: POST /batches [PRODUCER]; GET /batches [auth, org-scoped: custodian/producer/transfer party; ADMIN all]; GET /batches/:batchId; GET /batches/:batchId/qr (PNG, encodes `${PUBLIC_BASE_URL}/verify/:batchId`); PATCH /batches/:batchId [producer org, before first transfer]; POST /batches/:batchId/certificates (multipart); POST /batches/:batchId/quarantine-release {reason} [ADMIN]; POST /batches/:batchId/withdraw.
Checkpoints: POST /batches/:batchId/checkpoints [custodian org]; GET /batches/:batchId/checkpoints; GET /checkpoints?batchId&eventType&from&to.
Imports: POST /batches/:batchId/imports/preview (multipart `file` csv|json) -> {importId,total,valid,rejected,rows:[{row,errors[],record?}]}; POST /imports/:importId/commit -> {total,committed,rejected,chain:{confirmed,pending,failed}}; GET /imports/:importId.
 CSV columns: `timestamp,temperature_c,humidity_pct,location,event_type,remarks`; JSON: array of same keys (camelCase `temperatureC`,`humidityPct`,`eventType` also accepted).
Custody: POST /batches/:batchId/transfers {toOrganisationId,remarks}; GET /transfers?state; POST /transfers/:id/accept; POST /transfers/:id/reject {reason}.
Predictions: GET /batches/:batchId/prediction (latest); POST /batches/:batchId/prediction/recalculate; GET /batches/:batchId/predictions (history).
Alerts: GET /alerts?acknowledged&severity&batchId; PATCH /alerts/:id {acknowledged:true}.
Integrity: POST /batches/:batchId/verify -> {overall, checkpoints:[{checkpointId,storedHash,localHash,match}]} (local SHA-256 recompute; blockchain is OUT OF SCOPE).
Admin: GET/PUT /admin/thresholds [ADMIN]; GET /admin/audit-logs [ADMIN]; GET /admin/reports/export?type=batches|checkpoints|audit [ADMIN, CSV]; GET /admin/models [ADMIN].
Analytics (org-scoped, real data only): GET /analytics/summary; /analytics/status-distribution; /analytics/freshness-distribution; /analytics/shelf-life-distribution; /analytics/checkpoint-activity; /analytics/org-batch-counts; /analytics/excursions; /analytics/batch/:batchId/series.
Simulator: POST /simulate [ADMIN, PRODUCER, DISTRIBUTOR, WAREHOUSE] {batchId, scenario, count, seed} -> runs through the normal checkpoint pipeline with sourceType=SIMULATOR.
Public (no auth): GET /public/verify/:batchId -> `{batch:{batchId,productName,category,origin,producedAt,quantity,unit,status,lifecycle,lastUpdated}, timeline:[{eventType,organisation(public name),location,timestamp,temperatureC,humidityPct,chainState,txId}], freshness:{score,remainingShelfLifeHours,riskCategory,modelVersion,predictedAt,demonstrationMode,disclaimer}, certificates:[approved only], integrity:{overall,checkedAt,details}, disclaimer}`. NEVER expose emails, phones, prices, internal notes, user ids.
Health: GET /health -> {server, mongo, ai}. Docs: GET /api-docs (Swagger UI).

## ai-service (FastAPI, port 8001)
GET /health; GET /models (versions + metrics); POST /predict; POST /simulate.
POST /predict request:
```json
{ "batchId":"FT-...", "productCategory":"FRUIT", "productName":"Banana",
  "params": {"referenceTempC":13.0,"referenceShelfLifeHours":240,"activationEnergyJPerMol":60000,"source":"<citation>"},
  "initialQualityPct":100, "producedAt":"ISO",
  "checkpoints":[{"timestamp":"ISO","temperatureC":4.2,"humidityPct":88,"eventType":"STORAGE"}],
  "evaluateAt":"ISO (optional)" }
```
Response: `{batchId, freshnessScore (0-100), remainingShelfLifeHours, qualityLossPct, riskCategory, modelVersion, modelType:"ARRHENIUS_BASELINE|ARRHENIUS_ML_CORRECTED", demonstrationMode:bool, predictedAt, uncertainty:{supported:bool,...}|null, warnings:[str], factors:[{name,impact,detail}], effectiveAgeHours, hoursAboveReferenceTemp}`.
Errors: 422 pydantic validation. Activation energy and reference values come from the request (the server reads them from ProductType). Seed parameters must carry citations or be flagged `isDemonstration`.
Kinetics: k(T)=A·exp(-Ea/RT); acceleration factor vs reference AF(T)=exp(Ea/R·(1/Tref-1/T)) (kelvin). Effective age = Σ Δt·AF (piecewise-constant between checkpoints). Score = 100·max(0, 1 - effectiveAge/refShelfLife). Remaining = max(0, refShelfLife - effectiveAge)/AF(latest temp).
POST /simulate: `{category, scenario: NORMAL|TEMP_EXCURSION|COOLING_FAILURE|TRANSPORT_DELAY|VARIABLE_HUMIDITY|MULTI_HANDOVER|MISSING_READINGS|INVALID_READINGS, durationHours, count, seed, startTime}` -> `{records:[{timestamp,temperatureC,humidityPct,location,eventType,remarks,simulated:true}]}`.

## Hashing (deterministic; used by server and tests)
Canonical JSON: keys sorted lexicographically (recursive), no whitespace, UTF-8. Checkpoint fields hashed: `batchId, checkpointId, organisationId, handlerId, eventType, temperatureC, humidityPct, location, eventTimestamp (ISO with ms, UTC), remarks, sourceType`. `sha256 = hex(SHA256(canonical))`. Hash match shows data equals the anchored digest, not that the original reading was truthful.

## Data models (Mongoose) — fields
User{name,email(unique),passwordHash,role,organisation(ref),status,lastLoginAt}
Organisation{name,type,address,country,publicName,status,mspId}
ProductType{name,category,referenceTempC,referenceShelfLifeHours,activationEnergyJPerMol,qualityThresholds,humidityRange,tempRange,sourceNote,isDemonstration}
Batch{batchId(unique "FT-YYYYMMDD-XXXXXX"),productName,productType,category,quantity,unit,origin,producerOrg,currentCustodianOrg,harvestDate,expiryDate?,referenceStorage{tempC,humidityPct},status,lifecycle,latestPrediction(ref),certificates[],internalNotes,price?}
Checkpoint{batchId,checkpointId(uuid,unique),organisation,handler(ref User),eventType,temperatureC,humidityPct,location,eventTimestamp,receivedAt,remarks,sourceType,validation{ok,errors[]},hash,chainTx(ref),prediction(ref),importId?}
CustodyTransfer{batchId,fromOrg,toOrg,state,proposedBy,decidedBy,reason,chainTxIds[]}
FreshnessPrediction{batchId,checkpointCount,score,remainingShelfLifeHours,qualityLossPct,riskCategory,modelVersion,modelType,demonstrationMode,warnings,factors,uncertainty,predictedAt}
Alert{type,severity,batchId,message,dedupeKey,acknowledged,createdAt}
Certificate{batchId,filename,storedPath,mimeType,approved,uploadedBy}
ModelVersion{version,type,trainedAt,datasetSource,datasetLicence,metrics{mae,rmse,r2}|null,demonstrationOnly,artifactPath}
AuditLog{actor,action,entityType,entityId,orgId,details,ip,at}

## Ownership
client/ = Agent1; server/ = Agent2; ai-service/ = Agent3; infrastructure/, tests-e2e/, docs/TESTING.md, docs/TROUBLESHOOTING.md = Agent5; root files + other docs = lead.

> **Scope note (2026-10-14):** blockchain/Hyperledger Fabric was removed from scope by the user. Integrity = local SHA-256 per checkpoint; the server recomputes and compares on verify. Any 'chain' wording in older sections is obsolete.
