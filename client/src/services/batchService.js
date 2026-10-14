import api, { get, post, patch, unwrap } from './api';

const enc = encodeURIComponent;

export const listBatches = (params) => get('/batches', params);
export const getBatch = async (batchId) => (await get(`/batches/${enc(batchId)}`)).data;
export const createBatch = async (payload) => (await post('/batches', payload)).data;
export const updateBatch = async (batchId, payload) => (await patch(`/batches/${enc(batchId)}`, payload)).data;
export const withdrawBatch = async (batchId) => (await post(`/batches/${enc(batchId)}/withdraw`)).data;
export const releaseQuarantine = async (batchId, reason) =>
  (await post(`/batches/${enc(batchId)}/quarantine-release`, { reason })).data;

export const uploadCertificate = async (batchId, file) => {
  const form = new FormData();
  form.append('file', file);
  return unwrap(
    await api.post(`/batches/${enc(batchId)}/certificates`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  ).data;
};

/** Fetches the QR PNG as a Blob (auth header required, so no plain <img src>). */
export const fetchQrBlob = async (batchId) =>
  (await api.get(`/batches/${enc(batchId)}/qr`, { responseType: 'blob' })).data;

export const listCheckpoints = async (batchId) => (await get(`/batches/${enc(batchId)}/checkpoints`)).data;
export const createCheckpoint = async (batchId, payload) =>
  (await post(`/batches/${enc(batchId)}/checkpoints`, payload)).data;

export const getPrediction = async (batchId) => (await get(`/batches/${enc(batchId)}/prediction`)).data;
export const recalculatePrediction = async (batchId) =>
  (await post(`/batches/${enc(batchId)}/prediction/recalculate`)).data;
export const getPredictionHistory = async (batchId) => (await get(`/batches/${enc(batchId)}/predictions`)).data;

export const verifyBatch = async (batchId) => (await post(`/batches/${enc(batchId)}/verify`)).data;

export const simulate = async (payload) => (await post('/simulate', payload)).data;

export const previewImport = async (batchId, file) => {
  const form = new FormData();
  form.append('file', file);
  return unwrap(
    await api.post(`/batches/${enc(batchId)}/imports/preview`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  ).data;
};
export const commitImport = async (importId) => (await post(`/imports/${enc(importId)}/commit`)).data;
