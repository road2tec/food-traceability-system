'use strict';
const mongoose = require('mongoose');
const { Batch, Checkpoint, Alert, FreshnessPrediction, Organisation, ProductType, User } = require('../models');
const { E } = require('../utils/AppError');
const { ok, pagination, meta } = require('../utils/http');
const { audit } = require('../services/audit');
const { accessibleBatchFilter, loadBatchForUser } = require('../services/access');
const { verifyBatch, NOTE } = require('../services/verify');
const { aiHealth } = require('../services/prediction');
const { DISCLAIMER } = require('../utils/enums');

/* ---------- alerts ---------- */
async function listAlerts(req, res) {
  const q = req.query;
  const p = pagination(q);
  const f = {};
  if (q.acknowledged === 'true' || q.acknowledged === 'false') f.acknowledged = q.acknowledged === 'true';
  if (typeof q.severity === 'string') f.severity = q.severity;
  if (typeof q.type === 'string') f.type = q.type;
  if (req.user.role !== 'ADMIN') {
    const ids = await Batch.distinct('batchId', await accessibleBatchFilter(req.user));
    f.batchId = { $in: ids };
  }
  if (typeof q.batchId === 'string') {
    if (f.batchId && !f.batchId.$in.includes(q.batchId)) f.batchId = { $in: [] }; else f.batchId = q.batchId;
  }
  const [items, total] = await Promise.all([Alert.find(f).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit), Alert.countDocuments(f)]);
  ok(res, items, meta(p, total));
}
async function ackAlert(req, res) {
  const a = await Alert.findById(req.params.id);
  if (!a) throw E.notFound('Alert not found');
  if (req.user.role !== 'ADMIN') await loadBatchForUser(a.batchId, req.user);
  a.acknowledged = true;
  a.acknowledgedBy = req.user._id;
  await a.save();
  await audit(req, 'ALERT_ACKNOWLEDGED', 'Alert', a._id, { type: a.type, batchId: a.batchId });
  ok(res, a);
}

/* ---------- analytics (org-scoped via accessible batches) ---------- */
async function scope(req) {
  const filter = await accessibleBatchFilter(req.user);
  const batchIds = await Batch.distinct('batchId', filter);
  return { filter, batchIds };
}

async function summary(req, res) {
  const { filter, batchIds } = await scope(req);
  const [batches, checkpoints, openAlerts, quarantined, avg] = await Promise.all([
    Batch.countDocuments(filter),
    Checkpoint.countDocuments({ batchId: { $in: batchIds } }),
    Alert.countDocuments({ batchId: { $in: batchIds }, acknowledged: false }),
    Batch.countDocuments({ ...filter, status: 'QUARANTINED' }),
    Batch.aggregate([{ $match: filter }, { $lookup: { from: 'freshnesspredictions', localField: 'latestPrediction', foreignField: '_id', as: 'p' } }, { $unwind: '$p' }, { $group: { _id: null, avg: { $avg: '$p.score' } } }]),
  ]);
  const [byStatusRows, inTransit, excursions] = await Promise.all([
    Batch.aggregate([{ $match: filter }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Batch.countDocuments({ ...filter, lifecycle: "IN_TRANSIT" }),
    Alert.countDocuments({ batchId: { $in: batchIds }, type: { $in: ["TEMP_EXCURSION", "HUMIDITY_EXCURSION"] } }),
  ]);
  const byStatus = { SAFE: 0, FLAGGED: 0, QUARANTINED: 0, PENDING_REVIEW: 0 };
  byStatusRows.forEach((r) => { if (r._id in byStatus) byStatus[r._id] = r.count; });
  const out = { batches, checkpoints, openAlerts, quarantined, inTransit, excursions, byStatus, averageFreshnessScore: avg[0] ? Math.round(avg[0].avg * 10) / 10 : null };
  if (req.user.role === "ADMIN") {
    out.users = await User.countDocuments({});
    out.organisations = await Organisation.countDocuments({ status: "ACTIVE" });
  }
  ok(res, out);
}

async function statusDistribution(req, res) {
  const { filter } = await scope(req);
  const rows = await Batch.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
  ok(res, ['SAFE', 'FLAGGED', 'QUARANTINED', 'PENDING_REVIEW'].map((s) => ({ status: s, count: (rows.find((r) => r._id === s) || {}).count || 0 })));
}

async function bucketed(filter, field, boundaries, labels) {
  const rows = await Batch.aggregate([
    { $match: filter },
    { $lookup: { from: 'freshnesspredictions', localField: 'latestPrediction', foreignField: '_id', as: 'p' } },
    { $unwind: '$p' },
    { $bucket: { groupBy: `$p.${field}`, boundaries, default: 'other', output: { count: { $sum: 1 } } } },
  ]);
  return labels.map((label, i) => ({ bucket: label, count: (rows.find((r) => r._id === boundaries[i]) || {}).count || 0 }));
}
async function freshnessDistribution(req, res) {
  const { filter } = await scope(req);
  ok(res, await bucketed(filter, 'score', [0, 20, 40, 60, 80, 100.0001], ['0-20', '20-40', '40-60', '60-80', '80-100']));
}
async function shelfLifeDistribution(req, res) {
  const { filter } = await scope(req);
  ok(res, await bucketed(filter, 'remainingShelfLifeHours', [0, 24, 72, 168, 336, 1e9], ['<24h', '24-72h', '72-168h', '168-336h', '>336h']));
}

async function checkpointActivity(req, res) {
  const { batchIds } = await scope(req);
  const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
  const since = new Date(Date.now() - days * 86400e3);
  const rows = await Checkpoint.aggregate([
    { $match: { batchId: { $in: batchIds }, eventTimestamp: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$eventTimestamp' } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  ok(res, rows.map((r) => ({ date: r._id, count: r.count })));
}

async function orgBatchCounts(req, res) {
  const { filter } = await scope(req);
  const rows = await Batch.aggregate([{ $match: filter }, { $group: { _id: '$currentCustodianOrg', count: { $sum: 1 } } }]);
  const orgs = await Organisation.find({ _id: { $in: rows.map((r) => r._id) } }).select('publicName name type').lean();
  ok(res, rows.map((r) => { const o = orgs.find((x) => String(x._id) === String(r._id)) || {}; return { organisationId: r._id, name: o.publicName || o.name, type: o.type, custodyBatches: r.count }; }));
}

async function excursions(req, res) {
  const { batchIds } = await scope(req);
  const rows = await Checkpoint.aggregate([
    { $match: { batchId: { $in: batchIds } } },
    { $lookup: { from: 'batches', localField: 'batchId', foreignField: 'batchId', as: 'b' } }, { $unwind: '$b' },
    { $lookup: { from: 'producttypes', localField: 'b.productType', foreignField: '_id', as: 'pt' } }, { $unwind: '$pt' },
    { $match: { $expr: { $or: [
      { $and: [{ $ne: [{ $type: '$pt.tempRange.min' }, 'missing'] }, { $or: [{ $lt: ['$temperatureC', '$pt.tempRange.min'] }, { $gt: ['$temperatureC', '$pt.tempRange.max'] }] }] },
      { $and: [{ $ne: [{ $type: '$pt.humidityRange.min' }, 'missing'] }, { $or: [{ $lt: ['$humidityPct', '$pt.humidityRange.min'] }, { $gt: ['$humidityPct', '$pt.humidityRange.max'] }] }] },
    ] } } },
    { $group: { _id: '$batchId', excursions: { $sum: 1 }, lastAt: { $max: '$eventTimestamp' } } },
    { $sort: { excursions: -1 } }, { $limit: 100 },
  ]);
  ok(res, rows.map((r) => ({ batchId: r._id, excursions: r.excursions, lastAt: r.lastAt })));
}

async function batchSeries(req, res) {
  const batch = await loadBatchForUser(req.params.batchId, req.user);
  const [cps, preds] = await Promise.all([
    Checkpoint.find({ batchId: batch.batchId }).sort({ eventTimestamp: 1 }).select('eventTimestamp temperatureC humidityPct eventType sourceType').lean(),
    FreshnessPrediction.find({ batchId: batch.batchId }).sort({ predictedAt: 1 }).select('predictedAt score remainingShelfLifeHours checkpointCount').lean(),
  ]);
  ok(res, { batchId: batch.batchId, checkpoints: cps, predictions: preds });
}

/* ---------- public verify (strict whitelist) ---------- */
const PUBLIC_CACHE_MS = 60 * 1000;
async function publicVerify(req, res) {
  const b = await Batch.findOne({ batchId: req.params.batchId }).populate('certificates', 'filename mimeType approved').populate('latestPrediction').populate('producerOrg', 'publicName name');
  if (!b) throw E.notFound('Batch not found');
  let integ = b.integrity;
  if (!integ || !integ.checkedAt || Date.now() - integ.checkedAt.getTime() > PUBLIC_CACHE_MS) {
    const v = await verifyBatch(b, { req, auditResult: false });
    integ = { overall: v.overall, checkedAt: v.checkedAt, details: { checkpoints: v.checkpoints.length, mismatches: v.checkpoints.filter((c) => !c.match).length } };
  }
  const cps = await Checkpoint.find({ batchId: b.batchId }).sort({ eventTimestamp: 1 }).populate('organisation', 'publicName name').lean();
  const pr = b.latestPrediction;
  const org = (o) => (o && (o.publicName || o.name)) || 'Unknown organisation';
  ok(res, {
    batch: {
      batchId: b.batchId, productName: b.productName, category: b.category, origin: b.origin, producedAt: b.harvestDate, quantity: b.quantity, unit: b.unit,
      status: b.status, lifecycle: b.lifecycle, lastUpdated: b.updatedAt,
    },
    timeline: cps.map((c) => ({ eventType: c.eventType, organisation: org(c.organisation), location: c.location, timestamp: c.eventTimestamp, temperatureC: c.temperatureC, humidityPct: c.humidityPct })),
    freshness: pr ? {
      score: pr.score, remainingShelfLifeHours: pr.remainingShelfLifeHours, riskCategory: pr.riskCategory, modelVersion: pr.modelVersion,
      predictedAt: pr.predictedAt, demonstrationMode: pr.demonstrationMode, disclaimer: DISCLAIMER,
    } : null,
    certificates: (b.certificates || []).filter((c) => c.approved).map((c) => ({ filename: c.filename, mimeType: c.mimeType })),
    integrity: { overall: integ.overall, checkedAt: integ.checkedAt, details: { method: 'LOCAL_SHA256_RECOMPUTE', checkpoints: integ.details && integ.details.checkpoints, mismatches: integ.details && integ.details.mismatches, note: NOTE } },
    disclaimer: DISCLAIMER,
  });
}

/* ---------- health ---------- */
async function health(_req, res) {
  const mongoUp = mongoose.connection.readyState === 1;
  const ai = await aiHealth();
  res.json({ success: true, data: { server: 'UP', mongo: mongoUp ? 'UP' : 'DOWN', ai, fabric: { status: 'NOT_CONFIGURED' } } });
}

module.exports = { listAlerts, ackAlert, summary, statusDistribution, freshnessDistribution, shelfLifeDistribution, checkpointActivity, orgBatchCounts, excursions, batchSeries, publicVerify, health };
