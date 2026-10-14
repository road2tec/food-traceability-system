'use strict';
const crypto = require('crypto');
const axios = require('axios');
const config = require('../config');
const { Batch, Checkpoint, ImportJob, ProductType, FreshnessPrediction } = require('../models');
const { E } = require('../utils/AppError');
const { ok, pagination, meta } = require('../utils/http');
const { audit } = require('../services/audit');
const { accessibleBatchFilter, loadBatchForUser } = require('../services/access');
const cps = require('../services/checkpoints');
const { parseFile, validateRows } = require('../services/importer');
const { runPrediction } = require('../services/prediction');

/* ---------- checkpoints ---------- */
async function createCheckpoint(req, res) {
  const batch = await loadBatchForUser(req.params.batchId, req.user);
  const organisationId = cps.assertCanRecord(batch, req.user);
  const raw = { ...req.body, eventTimestamp: req.body.eventTimestamp || new Date().toISOString() };
  const pt = await ProductType.findById(batch.productType).lean();
  const { checkpoint, predictionResult } = await cps.createCheckpoint({ batch, user: req.user, organisationId, raw, sourceType: 'MANUAL', productType: pt, req });
  await audit(req, 'CHECKPOINT_CREATED', 'Checkpoint', checkpoint.checkpointId, { batchId: batch.batchId, eventType: checkpoint.eventType });
  ok(res, {
    checkpoint: cps.serializeCheckpoint(checkpoint),
    batchStatus: batch.status,
    prediction: predictionResult && predictionResult.ok ? predictionResult.prediction : null,
    predictionStatus: predictionResult ? (predictionResult.ok ? 'OK' : 'FAILED') : 'SKIPPED',
  }, null, 201);
}

async function listForBatch(req, res) {
  const batch = await loadBatchForUser(req.params.batchId, req.user);
  const p = pagination(req.query);
  const f = { batchId: batch.batchId };
  const [items, total] = await Promise.all([
    Checkpoint.find(f).sort({ eventTimestamp: 1 }).skip(p.skip).limit(p.limit).populate('organisation', 'name publicName type').populate('handler', 'name'),
    Checkpoint.countDocuments(f),
  ]);
  ok(res, items.map((c) => cps.serializeCheckpoint(c)), meta(p, total));
}

async function listAll(req, res) {
  const q = req.query;
  const p = pagination(q);
  const f = {};
  if (req.user.role !== 'ADMIN') {
    const ids = await Batch.distinct('batchId', await accessibleBatchFilter(req.user));
    f.batchId = { $in: ids };
  }
  if (typeof q.batchId === 'string') f.batchId = req.user.role === 'ADMIN' ? q.batchId : (f.batchId.$in.includes(q.batchId) ? q.batchId : { $in: [] });
  if (typeof q.eventType === 'string') f.eventType = q.eventType;
  const range = {};
  if (typeof q.from === 'string' && !Number.isNaN(Date.parse(q.from))) range.$gte = new Date(q.from);
  if (typeof q.to === 'string' && !Number.isNaN(Date.parse(q.to))) range.$lte = new Date(q.to);
  if (Object.keys(range).length) f.eventTimestamp = range;
  const [items, total] = await Promise.all([
    Checkpoint.find(f).sort({ eventTimestamp: -1 }).skip(p.skip).limit(p.limit).populate('organisation', 'name publicName type'),
    Checkpoint.countDocuments(f),
  ]);
  ok(res, items.map((c) => cps.serializeCheckpoint(c)), meta(p, total));
}

/* ---------- imports ---------- */
async function importPreview(req, res) {
  const batch = await loadBatchForUser(req.params.batchId, req.user);
  const organisationId = cps.assertCanRecord(batch, req.user);
  if (!req.file) throw E.validation('A file field named "file" (csv or json) is required');
  const { sourceType, rows, firstRowNumber } = parseFile(req.file);
  const results = await validateRows({ batch, orgId: organisationId, rows, firstRowNumber });
  const valid = results.filter((r) => !r.errors.length).length;
  const job = await ImportJob.create({
    importId: crypto.randomUUID(), batchId: batch.batchId, organisation: organisationId, user: req.user._id, filename: req.file.originalname.slice(0, 120),
    sourceType, total: results.length, valid, rejected: results.length - valid, rows: results,
  });
  await audit(req, 'IMPORT_PREVIEWED', 'ImportJob', job.importId, { batchId: batch.batchId, total: job.total, valid, rejected: job.rejected });
  ok(res, { importId: job.importId, total: job.total, valid, rejected: job.rejected, rows: job.rows }, null, 201);
}

async function loadImport(req) {
  const job = await ImportJob.findOne({ importId: req.params.importId });
  if (!job || (req.user.role !== 'ADMIN' && String(job.organisation) !== String(req.user.organisation))) throw E.notFound('Import not found');
  return job;
}

async function importCommit(req, res) {
  const job = await loadImport(req);
  if (job.state === 'COMMITTED') throw E.conflict('Import already committed');
  const claimed = await ImportJob.findOneAndUpdate({ _id: job._id, state: 'PREVIEWED' }, { state: 'COMMITTED' }, { returnDocument: 'after' });
  if (!claimed) throw E.conflict('Import already committed');
  const batch = await loadBatchForUser(job.batchId, req.user);
  const organisationId = cps.assertCanRecord(batch, req.user); // custody re-checked at commit time
  const pt = await ProductType.findById(batch.productType).lean();

  const todo = job.rows.filter((r) => r.record).map((r) => ({ ...r.toObject ? r.toObject() : r })).sort((a, b) => new Date(a.record.eventTimestamp) - new Date(b.record.eventTimestamp));
  const outcome = job.rows.map((r) => ({ row: r.row, errors: [...r.errors], committed: false, checkpointId: undefined }));
  const byRow = new Map(outcome.map((o) => [o.row, o]));
  let committed = 0;
  for (const r of todo) {
    const o = byRow.get(r.row);
    try {
      const { checkpoint } = await cps.createCheckpoint({
        batch, user: req.user, organisationId, raw: r.record, sourceType: job.sourceType, importId: job.importId, skipPrediction: true, productType: pt, req,
      });
      o.committed = true; o.checkpointId = checkpoint.checkpointId; committed++;
    } catch (e) {
      if (!e.isAppError) throw e;
      o.errors.push(...(e.details ? e.details.map((d) => d.message) : [e.message])); // state changed since preview
    }
  }
  let predictionStatus = 'SKIPPED';
  if (committed) {
    const pr = await runPrediction(batch, { actor: req.user, req });
    predictionStatus = pr.ok ? 'OK' : 'FAILED';
  }
  const result = { total: job.total, committed, rejected: job.total - committed, predictionStatus, rows: outcome.filter((o) => !o.committed) };
  claimed.result = result;
  await claimed.save();
  await audit(req, 'IMPORT_COMMITTED', 'ImportJob', job.importId, { batchId: job.batchId, total: result.total, committed, rejected: result.rejected });
  ok(res, result);
}

async function getImport(req, res) {
  const job = await loadImport(req);
  ok(res, job);
}

/* ---------- simulator ---------- */
async function simulate(req, res) {
  const { batchId, scenario, count, seed } = req.body;
  const batch = await loadBatchForUser(batchId, req.user);
  const organisationId = cps.assertCanRecord(batch, req.user, { allowAdminAsCustodian: true });
  const now = Date.now();
  const last = await cps.latestTimestamp(batch.batchId);
  const startMs = last ? last.getTime() + 60e3 : Math.max(new Date(batch.harvestDate).getTime(), now - 72 * 3600e3);
  const room = (now - startMs) / 3600e3;
  if (room < 0.05) throw E.conflict('No room for simulated checkpoints between the latest recorded checkpoint and now');
  const durationHours = Math.min(req.body.durationHours || 24, room);
  let records;
  try {
    const r = await axios.post(`${config.ai.url}/simulate`, {
      category: batch.category, scenario, durationHours, count, seed: seed === undefined ? 0 : seed, startTime: new Date(startMs).toISOString(),
    }, { timeout: config.ai.timeoutMs });
    records = r.data && r.data.records;
    if (!Array.isArray(records)) throw new Error('malformed');
  } catch (_) { throw E.upstream('AI service simulator is unavailable'); }

  const pt = await ProductType.findById(batch.productType).lean();
  const sorted = records.map((r, i) => ({ r, i })).sort((a, b) => new Date(a.r.timestamp) - new Date(b.r.timestamp) || a.i - b.i);
  const outcome = [];
  let committed = 0;
  for (const { r, i } of sorted) {
    try {
      const { checkpoint } = await cps.createCheckpoint({
        batch, user: req.user, organisationId, sourceType: 'SIMULATOR', skipPrediction: true, productType: pt, req,
        raw: { eventType: r.eventType || 'TRANSIT', temperatureC: r.temperatureC, humidityPct: r.humidityPct, location: r.location, eventTimestamp: r.timestamp, remarks: r.remarks },
      });
      committed++;
      outcome.push({ index: i, committed: true, checkpointId: checkpoint.checkpointId });
    } catch (e) {
      if (!e.isAppError) throw e;
      outcome.push({ index: i, committed: false, errors: e.details ? e.details.map((d) => d.message) : [e.message] });
    }
  }
  let predictionStatus = 'SKIPPED';
  if (committed) predictionStatus = (await runPrediction(batch, { actor: req.user, req })).ok ? 'OK' : 'FAILED';
  await audit(req, 'SIMULATION_RUN', 'Batch', batch.batchId, { scenario, requested: records.length, committed, rejected: records.length - committed });
  ok(res, { batchId: batch.batchId, scenario, requested: records.length, committed, rejected: records.length - committed, predictionStatus, batchStatus: batch.status, rejectedRows: outcome.filter((o) => !o.committed) }, null, 201);
}

/* ---------- predictions ---------- */
async function latestPrediction(req, res) {
  const batch = await loadBatchForUser(req.params.batchId, req.user);
  const pred = batch.latestPrediction ? await FreshnessPrediction.findById(batch.latestPrediction) : null;
  if (!pred) throw E.notFound('No prediction available for this batch yet');
  ok(res, pred);
}
async function predictionHistory(req, res) {
  const batch = await loadBatchForUser(req.params.batchId, req.user);
  const p = pagination(req.query);
  const [items, total] = await Promise.all([FreshnessPrediction.find({ batchId: batch.batchId }).sort({ predictedAt: -1 }).skip(p.skip).limit(p.limit), FreshnessPrediction.countDocuments({ batchId: batch.batchId })]);
  ok(res, items, meta(p, total));
}
async function recalculate(req, res) {
  const batch = await loadBatchForUser(req.params.batchId, req.user);
  if (!(req.user.role === 'ADMIN' || String(batch.currentCustodianOrg) === String(req.user.organisation) || String(batch.producerOrg) === String(req.user.organisation))) throw E.forbidden();
  const r = await runPrediction(batch, { actor: req.user, req });
  if (r.skipped) throw E.conflict('Batch has no checkpoints to predict from');
  if (!r.ok) throw E.upstream('Prediction service unavailable; batch moved to PENDING_REVIEW', [{ message: r.error }]);
  await audit(req, 'PREDICTION_RECALCULATED', 'Batch', batch.batchId, { score: r.prediction.score });
  ok(res, { prediction: r.prediction, batchStatus: batch.status });
}

module.exports = { createCheckpoint, listForBatch, listAll, importPreview, importCommit, getImport, simulate, latestPrediction, predictionHistory, recalculate };
