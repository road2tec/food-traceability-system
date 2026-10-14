'use strict';
/**
 * Local integrity verification: recompute the canonical SHA-256 from the STORED checkpoint fields and
 * compare with the hash stored at creation time. Detects later modification of checkpoint data in MongoDB.
 * It does NOT prove the original sensor reading was truthful, and an attacker who rewrites both the data
 * and its hash would not be detected (no external anchor in this build).
 */
const { Checkpoint } = require('../models');
const { checkpointHash } = require('../utils/hash');
const { raiseAlert } = require('./alerts');
const quality = require('./quality');
const { audit } = require('./audit');
const { DISCLAIMER } = require('../utils/enums');

const NOTE = 'Integrity check compares a recomputed SHA-256 with the hash stored when the checkpoint was recorded. It detects later edits to stored data; it does not prove the original reading was truthful.';

async function verifyBatch(batch, { req, actor, auditResult = true } = {}) {
  const cps = await Checkpoint.find({ batchId: batch.batchId }).sort({ eventTimestamp: 1 });
  const results = cps.map((cp) => {
    const localHash = checkpointHash(cp);
    return { checkpointId: cp.checkpointId, localHash, storedHash: cp.hash, match: localHash === cp.hash };
  });
  const bad = results.filter((r) => !r.match);
  const overall = !results.length ? 'NO_CHECKPOINTS' : bad.length ? 'MISMATCH' : 'VERIFIED';

  if (overall === 'MISMATCH') {
    for (const r of bad) {
      await raiseAlert({
        type: 'HASH_MISMATCH', severity: 'CRITICAL', batchId: batch.batchId,
        message: `Hash mismatch for checkpoint ${r.checkpointId} of ${batch.batchId}: stored data differs from its recorded hash`,
        dedupeKey: `HASHMISMATCH:${batch.batchId}:${r.checkpointId}`,
      });
    }
    await quality.setStatus(batch, 'PENDING_REVIEW', { reviewReason: 'HASH_MISMATCH', reason: { code: 'HASH_MISMATCH' }, actor, req });
  }
  batch.integrity = { overall, checkedAt: new Date(), details: { checkpoints: results.length, mismatches: bad.length } };
  await batch.save();
  if (auditResult) await audit(req || null, 'BATCH_VERIFIED', 'Batch', batch.batchId, { overall, ...batch.integrity.details }, { actor });
  return { overall, checkedAt: batch.integrity.checkedAt, checkpoints: results, note: NOTE, disclaimer: DISCLAIMER };
}

module.exports = { verifyBatch, NOTE };
