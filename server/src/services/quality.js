'use strict';
/**
 * Quality status rules (demonstration defaults, configurable globally and per ProductType):
 *   score > safeAbove AND all checks pass -> SAFE
 *   flagAbove <= score <= safeAbove (or a check fails) -> FLAGGED
 *   score < flagAbove -> QUARANTINED
 * PENDING_REVIEW is set elsewhere (prediction failure / hash mismatch / invalid data).
 * QUARANTINED is never auto-released.
 */
const { Batch, Alert } = require('../models');
const { raiseAlert } = require('./alerts');
const { audit } = require('./audit');

function decide(score, th, checksOk) {
  if (score < th.flagAbove) return 'QUARANTINED';
  if (score > th.safeAbove && checksOk) return 'SAFE';
  return 'FLAGGED';
}

/** Basic checks against ProductType ranges, using the most recent checkpoint, and expiry. */
function runChecks({ latestCheckpoint, productType, batch, now = new Date() }) {
  const failed = [];
  const pt = productType || {};
  if (latestCheckpoint) {
    const t = latestCheckpoint.temperatureC;
    const h = latestCheckpoint.humidityPct;
    if (pt.tempRange && pt.tempRange.min != null && (t < pt.tempRange.min || t > pt.tempRange.max)) failed.push('TEMPERATURE_OUT_OF_RANGE');
    if (pt.humidityRange && pt.humidityRange.min != null && (h < pt.humidityRange.min || h > pt.humidityRange.max)) failed.push('HUMIDITY_OUT_OF_RANGE');
  }
  if (batch.expiryDate && new Date(batch.expiryDate) < now) failed.push('EXPIRED');
  return { ok: failed.length === 0, failed };
}

/**
 * Change batch status, recording an audit entry when it really changes.
 * Never moves a QUARANTINED batch anywhere except via releaseQuarantine().
 */
async function setStatus(batch, status, { reviewReason = null, reason, actor, req } = {}) {
  if (batch.status === 'QUARANTINED' && status !== 'QUARANTINED') { await batch.save(); return false; }
  const changed = batch.status !== status;
  batch.reviewReason = status === 'PENDING_REVIEW' ? reviewReason : null;
  if (!changed) { await batch.save(); return false; }
  const from = batch.status;
  batch.status = status;
  await batch.save();
  await audit(req || null, 'BATCH_STATUS_CHANGED', 'Batch', batch.batchId, { from, to: status, reviewReason, reason }, { actor });
  if (status === 'QUARANTINED') {
    await raiseAlert({ type: 'QUARANTINED', severity: 'CRITICAL', batchId: batch.batchId, message: `Batch ${batch.batchId} was quarantined (${(reason && reason.code) || 'quality'})`, dedupeKey: `QUARANTINED:${batch.batchId}` });
  }
  return true;
}

async function releaseQuarantine(batch, admin, reason, req) {
  const score = batch.latestPrediction && batch.populated('latestPrediction') ? batch.latestPrediction.score : undefined;
  batch.quarantineRelease = { by: admin._id, reason, at: new Date(), scoreAtRelease: score };
  batch.status = 'FLAGGED'; // released to FLAGGED, never straight to SAFE
  batch.reviewReason = null;
  await batch.save();
  await Alert.updateMany({ batchId: batch.batchId, type: 'QUARANTINED', acknowledged: false }, { acknowledged: true, acknowledgedBy: admin._id });
  await audit(req, 'QUARANTINE_RELEASED', 'Batch', batch.batchId, { reason, newStatus: 'FLAGGED' });
}

module.exports = { decide, runChecks, setStatus, releaseQuarantine };
