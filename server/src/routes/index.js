'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticate, requireRole } = require('../middleware/auth');
const { certUpload, importUpload } = require('../middleware/upload');
const { validate, asyncHandler: h, z } = require('../utils/http');
const V = require('../validators');
const en = require('../utils/enums');
const A = require('../controllers/auth');
const Ad = require('../controllers/admin');
const B = require('../controllers/batches');
const C = require('../controllers/checkpoints');
const I = require('../controllers/insights');

const ADMIN = requireRole('ADMIN');
const ORG_ROLES = requireRole('PRODUCER', 'DISTRIBUTOR', 'WAREHOUSE', 'RETAILER');

module.exports = function buildRouter(opts = {}) {
  const r = express.Router();
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: opts.authMax, standardHeaders: true, legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts, please try again later' } }),
  });
  const upload = (mw) => (req, res, next) => mw(req, res, next);

  r.get('/health', h(I.health));
  r.get('/public/verify/:batchId', validate({ params: V.batchIdP }), h(I.publicVerify));

  r.get('/batches/:batchId/qr', validate({ params: V.batchIdP }), h(B.getQr)); // public: encodes only the public verify URL

  // auth
  r.post('/auth/register', authLimiter, validate({ body: V.register }), h(A.register));
  r.post('/auth/login', authLimiter, validate({ body: V.login }), h(A.login));
  r.post('/auth/logout', authenticate, h(A.logout));
  r.get('/auth/me', authenticate, h(A.me));

  // everything below requires authentication
  r.use(authenticate);

  r.get('/users', ADMIN, h(A.listUsers));
  r.patch('/users/:id/status', ADMIN, validate({ params: V.idP, body: z.object({ status: z.enum(en.USER_STATUS) }).strict() }), h(A.setUserStatus));
  r.get('/organisations', h(A.listOrganisations));
  r.patch('/organisations/:id', ADMIN, validate({
    params: V.idP,
    body: z.object({ name: z.string().trim().min(1).max(120), publicName: z.string().trim().max(120), address: z.string().max(300), country: z.string().max(80), status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED']), mspId: z.string().max(60) }).partial().strict(),
  }), h(A.updateOrganisation));

  r.get('/product-types', h(Ad.listProductTypes));
  r.post('/product-types', ADMIN, validate({ body: V.productType }), h(Ad.createProductType));
  r.put('/product-types/:id', ADMIN, validate({ params: V.idP, body: V.productType }), h(Ad.updateProductType));

  // batches
  r.post('/batches', requireRole('PRODUCER'), validate({ body: V.batchCreate }), h(B.createBatch));
  r.get('/batches', h(B.listBatches));
  r.get('/batches/:batchId', validate({ params: V.batchIdP }), h(B.getBatch));
  r.patch('/batches/:batchId', validate({ params: V.batchIdP, body: V.batchPatch }), h(B.patchBatch));
  r.post('/batches/:batchId/certificates', validate({ params: V.batchIdP }), upload(certUpload), h(B.uploadCertificate));
  r.patch('/batches/:batchId/certificates/:certId', ADMIN, validate({ params: V.batchIdP.extend({ certId: V.objectId }), body: z.object({ approved: z.boolean() }).strict() }), h(B.approveCertificate));
  r.get('/batches/:batchId/certificates/:certId/file', validate({ params: V.batchIdP.extend({ certId: V.objectId }) }), h(B.downloadCertificate));
  r.post('/batches/:batchId/quarantine-release', ADMIN, validate({ params: V.batchIdP, body: V.quarantineRelease }), h(B.quarantineRelease));
  r.post('/batches/:batchId/withdraw', validate({ params: V.batchIdP, body: z.object({ reason: z.string().max(500).optional() }).strict() }), h(B.withdraw));
  r.post('/batches/:batchId/verify', validate({ params: V.batchIdP }), h(B.verify));

  // checkpoints
  r.post('/batches/:batchId/checkpoints', ORG_ROLES, validate({ params: V.batchIdP, body: V.checkpointCreate }), h(C.createCheckpoint));
  r.get('/batches/:batchId/checkpoints', validate({ params: V.batchIdP }), h(C.listForBatch));
  r.get('/checkpoints', h(C.listAll));

  // imports
  r.post('/batches/:batchId/imports/preview', ORG_ROLES, validate({ params: V.batchIdP }), upload(importUpload), h(C.importPreview));
  r.post('/imports/:importId/commit', ORG_ROLES, h(C.importCommit));
  r.get('/imports/:importId', h(C.getImport));

  // custody
  r.post('/batches/:batchId/transfers', ORG_ROLES, validate({ params: V.batchIdP, body: V.transferCreate }), h(B.proposeTransfer));
  r.get('/transfers', h(B.listTransfers));
  r.post('/transfers/:id/accept', ORG_ROLES, validate({ params: V.idP }), h(B.acceptTransfer));
  r.post('/transfers/:id/reject', ORG_ROLES, validate({ params: V.idP, body: V.reasonBody }), h(B.rejectTransfer));
  r.post('/transfers/:id/cancel', ORG_ROLES, validate({ params: V.idP }), h(B.cancelTransfer));

  // predictions
  r.get('/batches/:batchId/prediction', validate({ params: V.batchIdP }), h(C.latestPrediction));
  r.post('/batches/:batchId/prediction/recalculate', validate({ params: V.batchIdP }), h(C.recalculate));
  r.get('/batches/:batchId/predictions', validate({ params: V.batchIdP }), h(C.predictionHistory));

  // alerts
  r.get('/alerts', h(I.listAlerts));
  r.patch('/alerts/:id', validate({ params: V.idP, body: z.object({ acknowledged: z.literal(true) }).strict() }), h(I.ackAlert));

  // admin
  r.get('/admin/thresholds', ADMIN, h(Ad.getThresholds));
  r.put('/admin/thresholds', ADMIN, validate({ body: V.thresholds }), h(Ad.putThresholds));
  r.get('/admin/audit-logs', ADMIN, h(Ad.listAuditLogs));
  r.get('/admin/reports/export', ADMIN, h(Ad.exportReport));
  r.get('/admin/models', ADMIN, h(Ad.listModels));

  // analytics
  r.get('/analytics/summary', h(I.summary));
  r.get('/analytics/status-distribution', h(I.statusDistribution));
  r.get('/analytics/freshness-distribution', h(I.freshnessDistribution));
  r.get('/analytics/shelf-life-distribution', h(I.shelfLifeDistribution));
  r.get('/analytics/checkpoint-activity', h(I.checkpointActivity));
  r.get('/analytics/org-batch-counts', h(I.orgBatchCounts));
  r.get('/analytics/excursions', h(I.excursions));
  r.get('/analytics/batch/:batchId/series', validate({ params: V.batchIdP }), h(I.batchSeries));

  // simulator
  r.post('/simulate', requireRole('ADMIN', 'PRODUCER', 'DISTRIBUTOR', 'WAREHOUSE'), validate({ body: V.simulate }), h(C.simulate));

  return r;
};
