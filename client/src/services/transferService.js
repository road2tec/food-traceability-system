import { get, post } from './api';

export const listTransfers = (params) => get('/transfers', params);
export const proposeTransfer = async (batchId, payload) =>
  (await post(`/batches/${encodeURIComponent(batchId)}/transfers`, payload)).data;
export const acceptTransfer = async (id) => (await post(`/transfers/${id}/accept`)).data;
export const rejectTransfer = async (id, reason) => (await post(`/transfers/${id}/reject`, { reason })).data;
