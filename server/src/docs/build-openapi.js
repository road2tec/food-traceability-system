'use strict';
// Generates src/docs/openapi.json:  node src/docs/build-openapi.js
const fs = require('fs');
const path = require('path');

// [method, path, tag, summary, roles ('' = any authenticated, 'PUBLIC' = none)]
const E = [
  ['get', '/health', 'System', 'Health of server, MongoDB and AI service (fabric is NOT_CONFIGURED: blockchain is out of scope)', 'PUBLIC'],
  ['post', '/auth/register', 'Auth', 'Register (account is PENDING until an ADMIN approves)', 'PUBLIC'],
  ['post', '/auth/login', 'Auth', 'Login, returns JWT', 'PUBLIC'],
  ['post', '/auth/logout', 'Auth', 'Revoke the current token', ''],
  ['get', '/auth/me', 'Auth', 'Current user', ''],
  ['get', '/users', 'Users', 'List users', 'ADMIN'],
  ['patch', '/users/{id}/status', 'Users', 'Approve/reject/suspend a user', 'ADMIN'],
  ['get', '/organisations', 'Users', 'List organisations (non-admin: public fields only)', ''],
  ['patch', '/organisations/{id}', 'Users', 'Update organisation', 'ADMIN'],
  ['get', '/product-types', 'ProductTypes', 'List product types', ''],
  ['post', '/product-types', 'ProductTypes', 'Create product type', 'ADMIN'],
  ['put', '/product-types/{id}', 'ProductTypes', 'Replace product type', 'ADMIN'],
  ['post', '/batches', 'Batches', 'Create batch (id FT-YYYYMMDD-XXXXXX)', 'PRODUCER'],
  ['get', '/batches', 'Batches', 'List batches (organisation-scoped)', ''],
  ['get', '/batches/{batchId}', 'Batches', 'Get batch', ''],
  ['patch', '/batches/{batchId}', 'Batches', 'Edit batch (producer, before first transfer)', 'PRODUCER'],
  ['get', '/batches/{batchId}/qr', 'Batches', 'QR PNG encoding the public verify URL', 'PUBLIC'],
  ['post', '/batches/{batchId}/certificates', 'Batches', 'Upload certificate (multipart, pdf/png/jpeg, 5MB)', ''],
  ['patch', '/batches/{batchId}/certificates/{certId}', 'Batches', 'Approve/unapprove certificate for public display', 'ADMIN'],
  ['get', '/batches/{batchId}/certificates/{certId}/file', 'Batches', 'Download certificate file', ''],
  ['post', '/batches/{batchId}/quarantine-release', 'Batches', 'Release quarantine (reason required, audited)', 'ADMIN'],
  ['post', '/batches/{batchId}/withdraw', 'Batches', 'Withdraw batch', ''],
  ['post', '/batches/{batchId}/verify', 'Integrity', 'Recompute checkpoint hashes and compare with stored hashes', ''],
  ['post', '/batches/{batchId}/checkpoints', 'Checkpoints', 'Record checkpoint (current custodian only)', 'ORG'],
  ['get', '/batches/{batchId}/checkpoints', 'Checkpoints', 'List checkpoints of a batch', ''],
  ['get', '/checkpoints', 'Checkpoints', 'Search checkpoints (batchId,eventType,from,to)', ''],
  ['post', '/batches/{batchId}/imports/preview', 'Imports', 'Preview CSV/JSON import (multipart file)', 'ORG'],
  ['post', '/imports/{importId}/commit', 'Imports', 'Commit a previewed import', 'ORG'],
  ['get', '/imports/{importId}', 'Imports', 'Get import job', ''],
  ['post', '/batches/{batchId}/transfers', 'Custody', 'Propose custody transfer (current custodian)', 'ORG'],
  ['get', '/transfers', 'Custody', 'List transfers involving my organisation', ''],
  ['post', '/transfers/{id}/accept', 'Custody', 'Accept (target organisation only)', 'ORG'],
  ['post', '/transfers/{id}/reject', 'Custody', 'Reject with reason (target organisation only)', 'ORG'],
  ['post', '/transfers/{id}/cancel', 'Custody', 'Cancel (proposing organisation only)', 'ORG'],
  ['get', '/batches/{batchId}/prediction', 'Predictions', 'Latest prediction', ''],
  ['post', '/batches/{batchId}/prediction/recalculate', 'Predictions', 'Recalculate via AI service', ''],
  ['get', '/batches/{batchId}/predictions', 'Predictions', 'Prediction history', ''],
  ['get', '/alerts', 'Alerts', 'List alerts', ''],
  ['patch', '/alerts/{id}', 'Alerts', 'Acknowledge alert', ''],
  ['get', '/admin/thresholds', 'Admin', 'Global quality thresholds', 'ADMIN'],
  ['put', '/admin/thresholds', 'Admin', 'Update global quality thresholds', 'ADMIN'],
  ['get', '/admin/audit-logs', 'Admin', 'Audit logs', 'ADMIN'],
  ['get', '/admin/reports/export', 'Admin', 'CSV export (type=batches|checkpoints|audit)', 'ADMIN'],
  ['get', '/admin/models', 'Admin', 'AI model versions', 'ADMIN'],
  ['get', '/analytics/summary', 'Analytics', 'Summary (org-scoped)', ''],
  ['get', '/analytics/status-distribution', 'Analytics', 'Batches by status', ''],
  ['get', '/analytics/freshness-distribution', 'Analytics', 'Freshness score buckets', ''],
  ['get', '/analytics/shelf-life-distribution', 'Analytics', 'Remaining shelf-life buckets', ''],
  ['get', '/analytics/checkpoint-activity', 'Analytics', 'Checkpoints per day', ''],
  ['get', '/analytics/org-batch-counts', 'Analytics', 'Batches in custody per organisation', ''],
  ['get', '/analytics/excursions', 'Analytics', 'Temperature/humidity excursions per batch', ''],
  ['get', '/analytics/batch/{batchId}/series', 'Analytics', 'Time series for one batch', ''],
  ['post', '/simulate', 'Simulator', 'Generate simulated readings and run them through the checkpoint pipeline', 'ADMIN/PRODUCER/DISTRIBUTOR/WAREHOUSE'],
  ['get', '/public/verify/{batchId}', 'Public', 'Public verification (strict field whitelist)', 'PUBLIC'],
];

const paths = {};
for (const [method, p, tag, summary, roles] of E) {
  const params = [...p.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }));
  const op = {
    tags: [tag], summary,
    ...(roles === 'PUBLIC' ? { security: [] } : {}),
    ...(roles && roles !== 'PUBLIC' ? { description: `Roles: ${roles}` } : {}),
    ...(params.length ? { parameters: params } : {}),
    responses: {
      200: { description: 'Success envelope {success:true,data,meta?}' },
      400: { $ref: '#/components/responses/Error' }, 401: { $ref: '#/components/responses/Error' },
      403: { $ref: '#/components/responses/Error' }, 404: { $ref: '#/components/responses/Error' },
    },
  };
  (paths[p] = paths[p] || {})[method] = op;
}

const spec = {
  openapi: '3.0.3',
  info: { title: 'Food Traceability API', version: '1.0.0', description: 'AI-assisted food traceability with local SHA-256 integrity hashing. Freshness values are demonstration estimates, not food-safety standards.' },
  servers: [{ url: '/api/v1' }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    responses: { Error: { description: 'Error envelope', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: false }, error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, details: { type: 'array', items: { type: 'object' } } } } } } } } } },
  },
  paths,
};
fs.writeFileSync(path.join(__dirname, 'openapi.json'), JSON.stringify(spec, null, 2));
console.log(`openapi.json written (${E.length} operations)`);
