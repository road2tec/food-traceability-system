import { get } from './api';

export const verifyPublic = async (batchId) => (await get(`/public/verify/${encodeURIComponent(batchId)}`)).data;
export const health = async () => (await get('/health')).data;
