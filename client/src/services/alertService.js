import { get, patch } from './api';

export const listAlerts = (params) => get('/alerts', params);
export const acknowledgeAlert = async (id) => (await patch(`/alerts/${id}`, { acknowledged: true })).data;
