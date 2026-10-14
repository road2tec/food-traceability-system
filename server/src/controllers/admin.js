'use strict';
const { ProductType, Batch, Checkpoint, AuditLog, ModelVersion, Threshold, Organisation } = require('../models');
const { E } = require('../utils/AppError');
const { ok, pagination, meta, parseSort, escapeRegex } = require('../utils/http');
const { audit } = require('../services/audit');
const { getGlobalThresholds } = require('../services/thresholds');
const { aiClient } = require('../services/prediction');

/* ---------- product types ---------- */
async function listProductTypes(req, res) {
  const p = pagination(req.query);
  const f = {};
  if (typeof req.query.category === 'string') f.category = req.query.category.toUpperCase();
  if (typeof req.query.q === 'string' && req.query.q) f.name = new RegExp(escapeRegex(req.query.q), 'i');
  const [items, total] = await Promise.all([ProductType.find(f).sort(parseSort(req.query.sort, ['name', 'category', 'createdAt'], { name: 1 })).skip(p.skip).limit(p.limit), ProductType.countDocuments(f)]);
  ok(res, items, meta(p, total));
}
async function createProductType(req, res) {
  const b = { ...req.body };
  if (b.isDemonstration === undefined) b.isDemonstration = true;
  const pt = await ProductType.create(b);
  await audit(req, 'PRODUCT_TYPE_CREATED', 'ProductType', pt._id, { name: pt.name });
  ok(res, pt, null, 201);
}
async function updateProductType(req, res) {
  const pt = await ProductType.findById(req.params.id);
  if (!pt) throw E.notFound('Product type not found');
  pt.set({ qualityThresholds: undefined, humidityRange: undefined, tempRange: undefined, ...req.body });
  await pt.save();
  await audit(req, 'PRODUCT_TYPE_UPDATED', 'ProductType', pt._id, { name: pt.name });
  ok(res, pt);
}

/* ---------- thresholds ---------- */
async function getThresholds(_req, res) { ok(res, await getGlobalThresholds()); }
async function putThresholds(req, res) {
  const t = await Threshold.findOneAndUpdate({ key: 'global' }, { ...req.body, updatedBy: req.user._id }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
  await audit(req, 'THRESHOLDS_UPDATED', 'Threshold', 'global', req.body);
  ok(res, t);
}

/* ---------- models ---------- */
async function listModels(_req, res) {
  let live = null;
  try {
    const r = await aiClient().get('/models', { timeout: 4000 });
    live = r.data;
  } catch (_) { live = null; }
  const stored = await ModelVersion.find().sort({ createdAt: -1 }).lean();
  ok(res, { aiServiceAvailable: live !== null, live, stored });
}

/* ---------- audit logs ---------- */
async function listAuditLogs(req, res) {
  const p = pagination(req.query);
  const f = {};
  for (const k of ['action', 'entityType', 'entityId']) if (typeof req.query[k] === 'string') f[k] = req.query[k];
  const [items, total] = await Promise.all([AuditLog.find(f).sort({ at: -1 }).skip(p.skip).limit(p.limit).lean(), AuditLog.countDocuments(f)]);
  ok(res, items, meta(p, total));
}

/* ---------- CSV export ---------- */
const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (cols, rows) => [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\r\n');

async function exportReport(req, res) {
  const type = req.query.type;
  let cols; let rows;
  if (type === 'batches') {
    cols = ['batchId', 'productName', 'category', 'quantity', 'unit', 'origin', 'producerOrg', 'currentCustodianOrg', 'harvestDate', 'expiryDate', 'status', 'lifecycle', 'createdAt'];
    rows = await Batch.find().sort({ createdAt: -1 }).limit(20000).lean();
  } else if (type === 'checkpoints') {
    cols = ['batchId', 'checkpointId', 'organisation', 'eventType', 'temperatureC', 'humidityPct', 'location', 'eventTimestamp', 'receivedAt', 'remarks', 'sourceType', 'hash'];
    rows = await Checkpoint.find().sort({ eventTimestamp: -1 }).limit(50000).lean();
  } else if (type === 'audit') {
    cols = ['at', 'actorEmail', 'action', 'entityType', 'entityId', 'orgId', 'ip', 'details'];
    rows = await AuditLog.find().sort({ at: -1 }).limit(50000).lean();
  } else throw E.validation('type must be batches, checkpoints or audit');
  await audit(req, 'REPORT_EXPORTED', 'Report', type, { rows: rows.length });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(toCsv(cols, rows));
}

module.exports = { listProductTypes, createProductType, updateProductType, getThresholds, putThresholds, listModels, listAuditLogs, exportReport };
