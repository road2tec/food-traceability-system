import { get } from './api';

export const summary = async () => (await get('/analytics/summary')).data;
export const statusDistribution = async () => (await get('/analytics/status-distribution')).data;
export const freshnessDistribution = async () => (await get('/analytics/freshness-distribution')).data;
export const shelfLifeDistribution = async () => (await get('/analytics/shelf-life-distribution')).data;
export const checkpointActivity = async () => (await get('/analytics/checkpoint-activity')).data;
export const orgBatchCounts = async () => (await get('/analytics/org-batch-counts')).data;
export const excursions = async () => (await get('/analytics/excursions')).data;
export const batchSeries = async (batchId) => (await get(`/analytics/batch/${encodeURIComponent(batchId)}/series`)).data;
