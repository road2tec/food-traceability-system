'use strict';
const fs = require('fs');
const QRCode = require('qrcode');
const config = require('../config');
const { Batch, ProductType, Certificate, CustodyTransfer, Organisation, Checkpoint } = require('../models');
const { E } = require('../utils/AppError');
const { ok, pagination, meta, parseSort, escapeRegex } = require('../utils/http');
const { batchId: genBatchId } = require('../utils/ids');
const { audit } = require('../services/audit');
const { accessibleBatchFilter, loadBatchForUser, orgId, isCustodian } = require('../services/access');
const quality = require('../services/quality');
const { verifyBatch } = require('../services/verify');
const { sanitizeName, magicOk } = require('../middleware/upload');

/** Private fields (internalNotes, price) are only visible to the producer organisation and admins. */
function serializeBatch(b, user) {
  const o = b.toObject ? b.toObject() : { ...b };
  delete o.__v;
  const privileged = user.role === 'ADMIN' || String(o.producerOrg && o.producerOrg._id ? o.producerOrg._id : o.producerOrg) === String(orgId(user));
  if (!privileged) { delete o.internalNotes; delete o.price; }
  return o;
}
const populateBatch = (q) => q.populate('producerOrg', 'name publicName type').populate('currentCustodianOrg', 'name publicName type').populate('latestPrediction').populate('certificates', 'filename mimeType approved createdAt');

async function createBatch(req, res) {
  const b = req.body;
  const pt = await ProductType.findById(b.productTypeId);
  if (!pt) throw E.validation('Unknown productTypeId');
  const org = orgId(req.user);
  let doc;
  for (let i = 0; i < 5 && !doc; i++) {
    try {
      doc = await Batch.create({
        batchId: genBatchId(), productName: b.productName, productType: pt._id, category: pt.category, quantity: b.quantity, unit: b.unit, origin: b.origin,
        producerOrg: org, currentCustodianOrg: org, harvestDate: new Date(b.harvestDate), expiryDate: b.expiryDate ? new Date(b.expiryDate) : undefined,
        referenceStorage: b.referenceStorage, internalNotes: b.internalNotes, price: b.price, status: 'PENDING_REVIEW', reviewReason: 'NO_DATA', lifecycle: 'REGISTERED',
      });
    } catch (e) { if (!(e && e.code === 11000 && e.keyPattern && e.keyPattern.batchId)) throw e; }
  }
  if (!doc) throw new Error('Could not allocate batch id');
  await audit(req, 'BATCH_CREATED', 'Batch', doc.batchId, { productName: doc.productName });
  ok(res, serializeBatch(doc, req.user), null, 201);
}

async function listBatches(req, res) {
  const q = req.query;
  const p = pagination(q);
  const access = await accessibleBatchFilter(req.user);
  const f = { ...access };
  const and = [];
  for (const k of ['status', 'lifecycle', 'category']) if (typeof q[k] === 'string') and.push({ [k]: q[k] });
  if (typeof q.q === 'string' && q.q) and.push({ $or: [{ batchId: new RegExp(escapeRegex(q.q), 'i') }, { productName: new RegExp(escapeRegex(q.q), 'i') }] });
  if (and.length) f.$and = and;
  const [items, total] = await Promise.all([
    populateBatch(Batch.find(f).sort(parseSort(q.sort, ['createdAt', 'batchId', 'productName', 'status'])).skip(p.skip).limit(p.limit)),
    Batch.countDocuments(f),
  ]);
  ok(res, items.map((b) => serializeBatch(b, req.user)), meta(p, total));
}

async function getBatch(req, res) {
  await loadBatchForUser(req.params.batchId, req.user);
  const b = await populateBatch(Batch.findOne({ batchId: req.params.batchId }));
  ok(res, serializeBatch(b, req.user));
}

async function getQr(req, res) {
  const b = await Batch.findOne({ batchId: req.params.batchId }).select('batchId');
  if (!b) throw E.notFound('Batch not found'); // QR encodes only the public URL; batch ids are not secret
  const png = await QRCode.toBuffer(`${config.publicBaseUrl}/verify/${b.batchId}`, { type: 'png', width: 400, margin: 2, errorCorrectionLevel: 'M' });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(png);
}

async function patchBatch(req, res) {
  const batch = await loadBatchForUser(req.params.batchId, req.user);
  if (req.user.role !== 'PRODUCER' || String(batch.producerOrg) !== String(orgId(req.user))) throw E.forbidden('Only the producer organisation can edit a batch');
  if (await CustodyTransfer.exists({ batchId: batch.batchId })) throw E.conflict('Batch can no longer be edited after the first custody transfer');
  if ((await Checkpoint.countDocuments({ batchId: batch.batchId })) > 0 && req.body.quantity !== undefined) { /* quantity is not hashed; allowed */ }
  const b = req.body;
  for (const k of ['productName', 'quantity', 'unit', 'origin', 'referenceStorage', 'internalNotes', 'price']) if (b[k] !== undefined) batch[k] = b[k];
  if (b.expiryDate) batch.expiryDate = new Date(b.expiryDate);
  await batch.save();
  await audit(req, 'BATCH_UPDATED', 'Batch', batch.batchId, { fields: Object.keys(b) });
  ok(res, serializeBatch(batch, req.user));
}

async function uploadCertificate(req, res) {
  const batch = await loadBatchForUser(req.params.batchId, req.user);
  const cleanup = () => req.file && fs.unlink(req.file.path, () => {});
  try {
    if (!(req.user.role === 'ADMIN' || isCustodian(req.user, batch) || String(batch.producerOrg) === String(orgId(req.user)))) throw E.forbidden();
    if (!req.file) throw E.validation('A file field named "file" is required');
    if (!magicOk(req.file.path, req.file.mimetype)) throw E.validation('File content does not match its declared type');
  } catch (e) { cleanup(); throw e; }
  const cert = await Certificate.create({
    batchId: batch.batchId, filename: sanitizeName(req.file.originalname), storedPath: req.file.filename, mimeType: req.file.mimetype, size: req.file.size,
    approved: false, uploadedBy: req.user._id, uploadedByOrg: orgId(req.user),
  });
  batch.certificates.push(cert._id);
  await batch.save();
  await audit(req, 'CERTIFICATE_UPLOADED', 'Certificate', cert._id, { batchId: batch.batchId, mimeType: cert.mimeType, size: cert.size });
  ok(res, { _id: cert._id, batchId: cert.batchId, filename: cert.filename, mimeType: cert.mimeType, size: cert.size, approved: cert.approved }, null, 201);
}

async function approveCertificate(req, res) {
  const cert = await Certificate.findOne({ _id: req.params.certId, batchId: req.params.batchId });
  if (!cert) throw E.notFound('Certificate not found');
  cert.approved = req.body.approved;
  await cert.save();
  await audit(req, 'CERTIFICATE_APPROVAL_CHANGED', 'Certificate', cert._id, { approved: cert.approved });
  ok(res, { _id: cert._id, approved: cert.approved });
}

async function downloadCertificate(req, res) {
  await loadBatchForUser(req.params.batchId, req.user);
  const cert = await Certificate.findOne({ _id: req.params.certId, batchId: req.params.batchId }).select('+storedPath');
  if (!cert) throw E.notFound('Certificate not found');
  const full = require('path').join(config.uploadDir, 'certificates', require('path').basename(cert.storedPath));
  res.setHeader('Content-Type', cert.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${cert.filename.replace(/"/g, '')}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(full);
}

async function quarantineRelease(req, res) {
  const batch = await loadBatchForUser(req.params.batchId, req.user);
  if (batch.status !== 'QUARANTINED') throw E.conflict('Batch is not quarantined');
  await quality.releaseQuarantine(batch, req.user, req.body.reason, req);
  ok(res, serializeBatch(batch, req.user));
}

async function withdraw(req, res) {
  const batch = await loadBatchForUser(req.params.batchId, req.user);
  const allowed = req.user.role === 'ADMIN' || isCustodian(req.user, batch) || String(batch.producerOrg) === String(orgId(req.user));
  if (!allowed) throw E.forbidden();
  if (batch.lifecycle === 'WITHDRAWN') throw E.conflict('Batch already withdrawn');
  batch.lifecycle = 'WITHDRAWN';
  batch.withdrawnReason = req.body && req.body.reason;
  await batch.save();
  await audit(req, 'BATCH_WITHDRAWN', 'Batch', batch.batchId, { reason: batch.withdrawnReason });
  ok(res, serializeBatch(batch, req.user));
}

async function verify(req, res) {
  const batch = await loadBatchForUser(req.params.batchId, req.user);
  ok(res, await verifyBatch(batch, { req, actor: req.user }));
}

/* ---------- custody transfers ---------- */
async function proposeTransfer(req, res) {
  const batch = await loadBatchForUser(req.params.batchId, req.user);
  if (req.user.role === 'ADMIN' || !isCustodian(req.user, batch)) throw E.forbidden('Only the current custodian can propose a transfer');
  if (batch.lifecycle === 'WITHDRAWN') throw E.conflict('Batch has been withdrawn');
  const to = await Organisation.findById(req.body.toOrganisationId);
  if (!to || to.status !== 'ACTIVE' || to.type === 'ADMIN') throw E.validation('Target organisation not found or not active');
  if (String(to._id) === String(batch.currentCustodianOrg)) throw E.validation('Target organisation is already the custodian');
  if (await CustodyTransfer.exists({ batchId: batch.batchId, state: 'PROPOSED' })) throw E.conflict('A transfer for this batch is already pending');
  const t = await CustodyTransfer.create({ batchId: batch.batchId, fromOrg: batch.currentCustodianOrg, toOrg: to._id, proposedBy: req.user._id, remarks: req.body.remarks });
  await audit(req, 'TRANSFER_PROPOSED', 'CustodyTransfer', t._id, { batchId: batch.batchId, toOrg: to._id });
  ok(res, t, null, 201);
}

async function listTransfers(req, res) {
  const p = pagination(req.query);
  const f = {};
  if (typeof req.query.state === 'string') f.state = req.query.state;
  if (req.user.role !== 'ADMIN') { const o = orgId(req.user); f.$or = [{ fromOrg: o }, { toOrg: o }]; }
  const [items, total] = await Promise.all([
    CustodyTransfer.find(f).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('fromOrg toOrg', 'name publicName type'),
    CustodyTransfer.countDocuments(f),
  ]);
  ok(res, items, meta(p, total));
}

async function loadTransfer(req) {
  const t = await CustodyTransfer.findById(req.params.id);
  const org = String(orgId(req.user));
  if (!t || (req.user.role !== 'ADMIN' && String(t.toOrg) !== org && String(t.fromOrg) !== org)) throw E.notFound('Transfer not found');
  return t;
}

async function acceptTransfer(req, res) {
  const t = await loadTransfer(req);
  if (req.user.role === 'ADMIN' || String(t.toOrg) !== String(orgId(req.user))) throw E.forbidden('Only the target organisation can accept a transfer');
  if (t.state !== 'PROPOSED') throw E.conflict(`Transfer is ${t.state}`);
  const batch = await Batch.findOne({ batchId: t.batchId });
  if (!batch || String(batch.currentCustodianOrg) !== String(t.fromOrg)) throw E.conflict('Custody has changed since this transfer was proposed');
  // atomic state flip prevents double-accept
  const upd = await CustodyTransfer.findOneAndUpdate({ _id: t._id, state: 'PROPOSED' }, { state: 'ACCEPTED', decidedBy: req.user._id }, { returnDocument: 'after' });
  if (!upd) throw E.conflict('Transfer already decided');
  batch.currentCustodianOrg = t.toOrg;
  await batch.save();
  await audit(req, 'TRANSFER_ACCEPTED', 'CustodyTransfer', t._id, { batchId: t.batchId, from: t.fromOrg, to: t.toOrg });
  ok(res, upd);
}

async function rejectTransfer(req, res) {
  const t = await loadTransfer(req);
  if (req.user.role === 'ADMIN' || String(t.toOrg) !== String(orgId(req.user))) throw E.forbidden('Only the target organisation can reject a transfer');
  const upd = await CustodyTransfer.findOneAndUpdate({ _id: t._id, state: 'PROPOSED' }, { state: 'REJECTED', decidedBy: req.user._id, reason: req.body.reason }, { returnDocument: 'after' });
  if (!upd) throw E.conflict(`Transfer is ${t.state}`);
  await audit(req, 'TRANSFER_REJECTED', 'CustodyTransfer', t._id, { batchId: t.batchId, reason: req.body.reason });
  ok(res, upd);
}

async function cancelTransfer(req, res) {
  const t = await loadTransfer(req);
  if (req.user.role === 'ADMIN' || String(t.fromOrg) !== String(orgId(req.user))) throw E.forbidden('Only the proposing organisation can cancel a transfer');
  const upd = await CustodyTransfer.findOneAndUpdate({ _id: t._id, state: 'PROPOSED' }, { state: 'CANCELLED', decidedBy: req.user._id }, { returnDocument: 'after' });
  if (!upd) throw E.conflict(`Transfer is ${t.state}`);
  await audit(req, 'TRANSFER_CANCELLED', 'CustodyTransfer', t._id, { batchId: t.batchId });
  ok(res, upd);
}

module.exports = { createBatch, listBatches, getBatch, getQr, patchBatch, uploadCertificate, approveCertificate, downloadCertificate, quarantineRelease, withdraw, verify, proposeTransfer, listTransfers, acceptTransfer, rejectTransfer, cancelTransfer, serializeBatch };
