import { idOf } from './format';

/** UI gating is a convenience only; the server enforces every rule. */
export const userOrgId = (user) => idOf(user?.organisation);

export const canRegisterBatch = (role) => role === 'PRODUCER';
export const canSimulate = (role) => ['ADMIN', 'PRODUCER', 'DISTRIBUTOR', 'WAREHOUSE'].includes(role);

export function isCustodian(user, batch) {
  if (!user || !batch) return false;
  const mine = userOrgId(user);
  const custodian = idOf(batch.currentCustodianOrg);
  return Boolean(mine && custodian && mine === custodian);
}

export const canRecordCheckpoint = (user, batch) => user?.role !== 'ADMIN' && isCustodian(user, batch);
export const canTransfer = (user, batch) =>
  user?.role !== 'ADMIN' && isCustodian(user, batch) && !['SOLD', 'WITHDRAWN'].includes(batch?.lifecycle);

/** Retailers are never offered a sell action for QUARANTINED (or unreviewed) batches. */
export function canSell(user, batch) {
  if (user?.role !== 'RETAILER' || !batch) return false;
  if (batch.status === 'QUARANTINED' || batch.status === 'PENDING_REVIEW') return false;
  if (['SOLD', 'WITHDRAWN'].includes(batch.lifecycle)) return false;
  return isCustodian(user, batch);
}

export const canReleaseQuarantine = (user, batch) => user?.role === 'ADMIN' && batch?.status === 'QUARANTINED';
