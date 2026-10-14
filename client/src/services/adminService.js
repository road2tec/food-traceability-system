import api, { get, post, put } from './api';

export const getThresholds = async () => (await get('/admin/thresholds')).data;
export const updateThresholds = async (payload) => (await put('/admin/thresholds', payload)).data;
export const listAuditLogs = (params) => get('/admin/audit-logs', params);
export const listModels = async () => (await get('/admin/models')).data;
export const exportReport = async (type) =>
  (await api.get('/admin/reports/export', { params: { type }, responseType: 'blob' })).data;
