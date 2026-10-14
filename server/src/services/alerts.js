'use strict';
const { Alert } = require('../models');

/**
 * Raise an alert with de-duplication: at most ONE unacknowledged alert per dedupeKey.
 * Repeats only increment `occurrences` / `lastSeenAt` (no alert storms).
 */
async function raiseAlert({ type, severity, batchId, message, dedupeKey }) {
  const key = dedupeKey || `${type}:${batchId || 'global'}`;
  const run = () => Alert.findOneAndUpdate(
    { dedupeKey: key, acknowledged: false },
    { $inc: { occurrences: 1 }, $set: { lastSeenAt: new Date() }, $setOnInsert: { type, severity, batchId, message } },
    { upsert: true, returnDocument: 'after', includeResultMetadata: true },
  );
  let r;
  try { r = await run(); } catch (e) {
    if (e && e.code === 11000) r = await run(); else throw e;
  }
  return { alert: r.value, created: !r.lastErrorObject.updatedExisting };
}

module.exports = { raiseAlert };
