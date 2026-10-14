'use strict';
const axios = require('axios');
const config = require('../config');
const { Batch, Checkpoint, FreshnessPrediction, ProductType } = require('../models');
const { raiseAlert } = require('./alerts');
const { getGlobalThresholds, effectiveThresholds } = require('./thresholds');
const quality = require('./quality');
const { audit } = require('./audit');

const aiClient = () => axios.create({ baseURL: config.ai.url, timeout: config.ai.timeoutMs });

async function aiHealth() {
  try {
    const r = await axios.get(`${config.ai.url}/health`, { timeout: 2000 });
    return r.status === 200 ? 'UP' : 'DOWN';
  } catch (_) { return 'DOWN'; }
}

function buildPayload(batch, pt, checkpoints) {
  return {
    batchId: batch.batchId,
    productCategory: batch.category,
    productName: batch.productName,
    params: {
      referenceTempC: pt.referenceTempC,
      referenceShelfLifeHours: pt.referenceShelfLifeHours,
      activationEnergyJPerMol: pt.activationEnergyJPerMol,
      source: pt.sourceNote,
    },
    initialQualityPct: 100,
    producedAt: batch.harvestDate.toISOString(),
    checkpoints: checkpoints.map((c) => ({
      timestamp: c.eventTimestamp.toISOString(), temperatureC: c.temperatureC, humidityPct: c.humidityPct, eventType: c.eventType,
    })),
  };
}

async function failure(batch, reasonMsg, ctx) {
  await raiseAlert({
    type: 'PREDICTION_FAILURE', severity: 'WARNING', batchId: batch.batchId,
    message: `Freshness prediction unavailable for ${batch.batchId}: ${reasonMsg}`, dedupeKey: `PRED_FAIL:${batch.batchId}`,
  });
  await quality.setStatus(batch, 'PENDING_REVIEW', { reviewReason: 'PREDICTION_FAILURE', reason: { code: 'PREDICTION_FAILURE' }, actor: ctx.actor, req: ctx.req });
  await audit(ctx.req || null, 'PREDICTION_FAILED', 'Batch', batch.batchId, { error: reasonMsg }, { actor: ctx.actor });
}

/**
 * Run a prediction for the batch via the AI service. On any failure: batch -> PENDING_REVIEW (unless QUARANTINED),
 * PREDICTION_FAILURE alert (deduped). Returns {ok, prediction?, error?, skipped?}.
 */
async function runPrediction(batch, ctx = {}) {
  const [pt, checkpoints] = await Promise.all([
    ProductType.findById(batch.productType).lean(),
    Checkpoint.find({ batchId: batch.batchId }).sort({ eventTimestamp: 1 }),
  ]);
  if (!pt) { await failure(batch, 'product type missing', ctx); return { ok: false, error: 'PRODUCT_TYPE_MISSING' }; }
  if (!checkpoints.length) return { ok: false, skipped: true, error: 'NO_CHECKPOINTS' };

  let d;
  try {
    const r = await aiClient().post('/predict', buildPayload(batch, pt, checkpoints));
    d = r.data;
    const num = (x) => typeof x === 'number' && Number.isFinite(x);
    if (!d || !num(d.freshnessScore) || !num(d.remainingShelfLifeHours)) throw new Error('Malformed prediction response');
  } catch (e) {
    const msg = e.response ? `AI service responded ${e.response.status}` : e.code === 'ECONNABORTED' ? 'AI service timed out' : `AI service unreachable (${e.code || e.message})`;
    await failure(batch, msg, ctx);
    return { ok: false, error: msg };
  }

  const pred = await FreshnessPrediction.create({
    batchId: batch.batchId, checkpointCount: checkpoints.length, score: d.freshnessScore, remainingShelfLifeHours: d.remainingShelfLifeHours,
    qualityLossPct: d.qualityLossPct, riskCategory: d.riskCategory, modelVersion: d.modelVersion, modelType: d.modelType,
    demonstrationMode: !!d.demonstrationMode, warnings: d.warnings || [], factors: d.factors || [], uncertainty: d.uncertainty || null,
    predictedAt: d.predictedAt ? new Date(d.predictedAt) : new Date(),
  });
  const latest = checkpoints[checkpoints.length - 1];
  await Checkpoint.collection.updateOne({ _id: latest._id }, { $set: { prediction: pred._id } });
  batch.latestPrediction = pred._id;

  const global = await getGlobalThresholds();
  const th = effectiveThresholds(pt, global);
  const checks = quality.runChecks({ latestCheckpoint: latest, productType: pt, batch });
  let decision = quality.decide(pred.score, th, checks.ok);
  const overridden = decision === 'QUARANTINED' && batch.quarantineRelease && batch.quarantineRelease.at;
  if (overridden) decision = 'FLAGGED'; // an ADMIN released this batch; do not re-quarantine automatically

  if (batch.status === 'PENDING_REVIEW' && batch.reviewReason === 'HASH_MISMATCH' && decision !== 'QUARANTINED') {
    await batch.save(); // stays under review until integrity verifies
  } else {
    await quality.setStatus(batch, decision, { reviewReason: null, reason: { code: checks.ok ? 'SCORE_THRESHOLD' : 'CHECK_FAILED:' + checks.failed.join(','), score: pred.score }, actor: ctx.actor, req: ctx.req });
  }

  if (decision === 'FLAGGED' || decision === 'QUARANTINED') {
    await raiseAlert({ type: 'LOW_FRESHNESS', severity: decision === 'QUARANTINED' ? 'CRITICAL' : 'WARNING', batchId: batch.batchId, message: `Freshness score ${pred.score.toFixed(1)} for ${batch.batchId} (${decision})`, dedupeKey: `LOWFRESH:${batch.batchId}` });
  }
  const nearExp = batch.expiryDate && (new Date(batch.expiryDate) - Date.now()) < th.nearExpiryHours * 3600e3;
  if (nearExp || pred.remainingShelfLifeHours < th.lowShelfLifeHours) {
    await raiseAlert({ type: 'NEAR_EXPIRY', severity: 'WARNING', batchId: batch.batchId, message: `Batch ${batch.batchId} is near the end of its estimated shelf life`, dedupeKey: `NEAREXP:${batch.batchId}` });
  }
  return { ok: true, prediction: pred, overridden: !!overridden };
}

module.exports = { runPrediction, aiHealth, aiClient };
