'use strict';
const { Batch, Threshold } = require('../models');
const { raiseAlert } = require('../services/alerts');
const { getGlobalThresholds } = require('../services/thresholds');

let timer = null;

/** Hourly scan: NEAR_EXPIRY alerts (deduplicated) for batches approaching their expiry date. */
async function expiryScan() {
  const th = await getGlobalThresholds();
  const horizon = new Date(Date.now() + th.nearExpiryHours * 3600e3);
  const batches = await Batch.find({ expiryDate: { $lte: horizon }, lifecycle: { $nin: ['SOLD', 'WITHDRAWN'] } }).select('batchId expiryDate').limit(1000).lean();
  for (const b of batches) {
    await raiseAlert({ type: 'NEAR_EXPIRY', severity: b.expiryDate < new Date() ? 'CRITICAL' : 'WARNING', batchId: b.batchId, message: `Batch ${b.batchId} ${b.expiryDate < new Date() ? 'has passed' : 'is approaching'} its expiry date`, dedupeKey: `NEAREXP:${b.batchId}` });
  }
  return batches.length;
}

function startJobs() {
  const run = () => expiryScan().catch((e) => console.error('[jobs] expiry scan failed:', e.message));
  timer = setInterval(run, 60 * 60 * 1000);
  timer.unref();
  run();
}
const stopJobs = () => { if (timer) clearInterval(timer); timer = null; };

module.exports = { startJobs, stopJobs, expiryScan, Threshold };
