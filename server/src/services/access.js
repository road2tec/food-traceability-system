'use strict';
const { Batch, CustodyTransfer } = require('../models');
const { E } = require('../utils/AppError');

const orgId = (user) => (user.organisation && user.organisation._id) || user.organisation;

/** Mongo filter of batches visible to the user. ADMIN sees all; others: producer/custodian/transfer party. */
async function accessibleBatchFilter(user) {
  if (user.role === 'ADMIN') return {};
  const org = orgId(user);
  const transferBatchIds = await CustodyTransfer.distinct('batchId', { $or: [{ fromOrg: org }, { toOrg: org }] });
  return { $or: [{ producerOrg: org }, { currentCustodianOrg: org }, { batchId: { $in: transferBatchIds } }] };
}

async function canAccessBatch(user, batch) {
  if (user.role === 'ADMIN') return true;
  const org = String(orgId(user));
  if (String(batch.producerOrg) === org || String(batch.currentCustodianOrg) === org) return true;
  return !!(await CustodyTransfer.exists({ batchId: batch.batchId, $or: [{ fromOrg: org }, { toOrg: org }] }));
}

/** Loads the batch or throws 404 (404, not 403, so existence is not leaked across organisations). */
async function loadBatchForUser(batchId, user) {
  const batch = await Batch.findOne({ batchId });
  if (!batch || !(await canAccessBatch(user, batch))) throw E.notFound('Batch not found');
  return batch;
}

const isCustodian = (user, batch) => String(orgId(user)) === String(batch.currentCustodianOrg);

module.exports = { accessibleBatchFilter, canAccessBatch, loadBatchForUser, isCustodian, orgId };
