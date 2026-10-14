'use strict';
/**
 * THE checkpoint pipeline. Manual entries, CSV/JSON imports and the simulator all go through
 * validateRecord() + createCheckpoint() so rules, hashing and alerting are identical.
 */
const crypto = require('crypto');
const { Checkpoint, Batch, ProductType, Organisation } = require('../models');
const en = require('../utils/enums');
const { E } = require('../utils/AppError');
const { checkpointHash, sha256 } = require('../utils/hash');
const { raiseAlert } = require('./alerts');
const { runPrediction } = require('./prediction');
const { orgId, isCustodian } = require('./access');

const TEMP_MIN = -50;
const TEMP_MAX = 80;
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const BACKFILL_SUSPICIOUS_MS = 72 * 3600e3;

const toNum = (v) => {
  if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return NaN;
  return typeof v === 'number' ? v : Number(v);
};

const dupKeyOf = (batchId, org, eventType, ts) => sha256(`${batchId}|${org}|${eventType}|${ts.toISOString()}`);

/**
 * Pure validation + normalisation.
 * ctx: { batch, orgId, lastTs: Date|null, seenKeys?: Set, now?: Date }
 */
function validateRecord(raw, ctx) {
  const errors = [];
  const now = ctx.now || new Date();
  const rec = {};
  const r = raw || {};

  const et = typeof r.eventType === 'string' ? r.eventType.trim().toUpperCase() : r.eventType;
  if (!en.EVENT_TYPES.includes(et)) errors.push(`eventType must be one of ${en.EVENT_TYPES.join(', ')}`);
  else rec.eventType = et;

  const t = toNum(r.temperatureC);
  if (Number.isNaN(t)) errors.push('temperatureC is required and must be a number');
  else if (t < TEMP_MIN || t > TEMP_MAX) errors.push(`temperatureC ${t} outside plausible range ${TEMP_MIN}..${TEMP_MAX}`);
  else rec.temperatureC = t;

  const h = toNum(r.humidityPct);
  if (Number.isNaN(h)) errors.push('humidityPct is required and must be a number');
  else if (h < 0 || h > 100) errors.push(`humidityPct ${h} outside 0..100`);
  else rec.humidityPct = h;

  rec.location = r.location == null ? '' : String(r.location).trim();
  if (rec.location.length > 200) errors.push('location exceeds 200 characters');
  rec.remarks = r.remarks == null ? '' : String(r.remarks).trim();
  if (rec.remarks.length > 1000) errors.push('remarks exceeds 1000 characters');

  let ts = null;
  if (r.eventTimestamp === undefined || r.eventTimestamp === null || r.eventTimestamp === '') errors.push('timestamp is required');
  else {
    ts = new Date(r.eventTimestamp);
    if (Number.isNaN(ts.getTime())) { errors.push('timestamp is not a valid ISO-8601 date'); ts = null; }
  }
  if (ts) {
    if (ts.getTime() > now.getTime() + FUTURE_SKEW_MS) errors.push('timestamp is in the future');
    else if (ctx.batch && ctx.batch.harvestDate && ts < new Date(ctx.batch.harvestDate)) errors.push('timestamp precedes the batch harvest date');
    else if (ctx.lastTs && ts < ctx.lastTs) errors.push(`timestamp is earlier than the latest recorded checkpoint (${ctx.lastTs.toISOString()}); checkpoints must be chronological`);
    rec.eventTimestamp = ts;
    if (rec.eventType && ctx.batch) {
      const key = dupKeyOf(ctx.batch.batchId, ctx.orgId, rec.eventType, ts);
      rec.dupKey = key;
      if (ctx.seenKeys) {
        if (ctx.seenKeys.has(key)) errors.push('duplicate checkpoint (same organisation, event type and timestamp)');
        else if (!errors.length) ctx.seenKeys.add(key);
      }
    }
  }
  return { record: rec, errors };
}

async function latestTimestamp(batchId) {
  const c = await Checkpoint.findOne({ batchId }).sort({ eventTimestamp: -1 }).select('eventTimestamp').lean();
  return c ? c.eventTimestamp : null;
}

/** Custody check applied to EVERY checkpoint source. Returns the organisation id the checkpoint is attributed to. */
function assertCanRecord(batch, user, { allowAdminAsCustodian = false } = {}) {
  if (batch.lifecycle === 'WITHDRAWN') throw E.conflict('Batch has been withdrawn; no further checkpoints can be recorded');
  if (user.role === 'ADMIN') {
    if (!allowAdminAsCustodian) throw E.forbidden('Administrators cannot record checkpoints');
    return batch.currentCustodianOrg;
  }
  if (!isCustodian(user, batch)) throw E.forbidden('Only the current custodian organisation can record checkpoints for this batch');
  return orgId(user);
}

function lifecycleFor(eventType, orgType) {
  switch (eventType) {
    case 'DISPATCH': case 'TRANSIT': return 'IN_TRANSIT';
    case 'STORAGE': case 'ARRIVAL': case 'RECEIPT': return orgType === 'RETAILER' ? 'AT_RETAIL' : 'IN_STORAGE';
    case 'SALE': return 'SOLD';
    default: return null;
  }
}

/**
 * Persist one validated checkpoint: hash, lifecycle, excursion alerts.
 * Prediction is run unless opts.skipPrediction (bulk callers run it once at the end).
 */
async function createCheckpoint({ batch, user, organisationId, raw, sourceType, importId, skipPrediction = false, productType, req }) {
  const lastTs = await latestTimestamp(batch.batchId);
  const { record, errors } = validateRecord(raw, { batch, orgId: organisationId, lastTs });
  if (errors.length) throw E.validation('Checkpoint validation failed', errors.map((m) => ({ message: m })));

  const receivedAt = new Date();
  const doc = {
    batchId: batch.batchId,
    checkpointId: crypto.randomUUID(),
    organisation: organisationId,
    handler: user._id,
    eventType: record.eventType,
    temperatureC: record.temperatureC,
    humidityPct: record.humidityPct,
    location: record.location,
    eventTimestamp: record.eventTimestamp,
    receivedAt,
    remarks: record.remarks,
    sourceType,
    validation: { ok: true, errors: [] },
    dupKey: record.dupKey,
    importId,
  };
  doc.hash = checkpointHash(doc);
  let cp;
  try { cp = await Checkpoint.create(doc); } catch (e) {
    if (e && e.code === 11000) throw E.conflict('Duplicate checkpoint (same organisation, event type and timestamp already recorded)');
    throw e;
  }

  const org = await Organisation.findById(organisationId).select('type').lean();
  const lc = lifecycleFor(cp.eventType, org && org.type);
  if (lc && batch.lifecycle !== 'WITHDRAWN' && batch.lifecycle !== 'SOLD') batch.lifecycle = lc;
  if (lc === 'SOLD') batch.lifecycle = 'SOLD';
  await batch.save();

  await excursionAlerts(batch, cp, productType);

  let predictionResult = null;
  if (!skipPrediction) predictionResult = await runPrediction(batch, { actor: user, req });
  return { checkpoint: cp, predictionResult };
}

async function excursionAlerts(batch, cp, productType) {
  const pt = productType || (await ProductType.findById(batch.productType).lean()) || {};
  if (pt.tempRange && pt.tempRange.min != null && (cp.temperatureC < pt.tempRange.min || cp.temperatureC > pt.tempRange.max)) {
    await raiseAlert({ type: 'TEMP_EXCURSION', severity: 'WARNING', batchId: batch.batchId, message: `Temperature ${cp.temperatureC}C outside ${pt.tempRange.min}..${pt.tempRange.max}C for ${batch.batchId}`, dedupeKey: `TEMP:${batch.batchId}` });
  }
  if (pt.humidityRange && pt.humidityRange.min != null && (cp.humidityPct < pt.humidityRange.min || cp.humidityPct > pt.humidityRange.max)) {
    await raiseAlert({ type: 'HUMIDITY_EXCURSION', severity: 'WARNING', batchId: batch.batchId, message: `Humidity ${cp.humidityPct}% outside ${pt.humidityRange.min}..${pt.humidityRange.max}% for ${batch.batchId}`, dedupeKey: `HUM:${batch.batchId}` });
  }
  if (cp.receivedAt - cp.eventTimestamp > BACKFILL_SUSPICIOUS_MS) {
    await raiseAlert({ type: 'SUSPICIOUS_HISTORY', severity: 'INFO', batchId: batch.batchId, message: `Checkpoint for ${batch.batchId} was recorded more than 72h after the event time (backfilled)`, dedupeKey: `SUSP:${batch.batchId}` });
  }
}

const serializeCheckpoint = (cp) => {
  const o = cp.toObject ? cp.toObject() : { ...cp };
  delete o.dupKey; delete o.__v;
  return o;
};

module.exports = { validateRecord, createCheckpoint, assertCanRecord, latestTimestamp, serializeCheckpoint, dupKeyOf, TEMP_MIN, TEMP_MAX };
