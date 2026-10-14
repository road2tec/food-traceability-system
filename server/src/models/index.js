'use strict';
const mongoose = require('mongoose');
const crypto = require('crypto');
const en = require('../utils/enums');

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;
const opts = { timestamps: true };

const Organisation = mongoose.model('Organisation', new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  nameLower: { type: String, index: true },
  type: { type: String, enum: en.ORG_TYPES, required: true },
  address: { type: String, trim: true, maxlength: 300 },
  country: { type: String, trim: true, maxlength: 80 },
  publicName: { type: String, trim: true, maxlength: 120 },
  status: { type: String, enum: ['PENDING', 'ACTIVE', 'SUSPENDED'], default: 'PENDING' },
  mspId: { type: String, trim: true, maxlength: 60 },
}, opts));

const User = mongoose.model('User', new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: en.ROLES, required: true },
  organisation: { type: ObjectId, ref: 'Organisation', required: true },
  status: { type: String, enum: en.USER_STATUS, default: 'PENDING' },
  lastLoginAt: Date,
}, opts));

const RevokedToken = mongoose.model('RevokedToken', new Schema({
  jti: { type: String, unique: true, required: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
}));

const rangeSchema = { min: Number, max: Number };
const ProductType = mongoose.model('ProductType', new Schema({
  name: { type: String, required: true, unique: true, trim: true, maxlength: 100 },
  category: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  referenceTempC: { type: Number, required: true },
  referenceShelfLifeHours: { type: Number, required: true, min: 1 },
  activationEnergyJPerMol: { type: Number, required: true, min: 1000 },
  qualityThresholds: { safeAbove: Number, flagAbove: Number },
  humidityRange: rangeSchema,
  tempRange: rangeSchema,
  sourceNote: { type: String, required: true, maxlength: 1000 },
  isDemonstration: { type: Boolean, default: true },
}, opts));

const Certificate = mongoose.model('Certificate', new Schema({
  batchId: { type: String, required: true, index: true },
  filename: { type: String, required: true }, // sanitised original name (display only)
  storedPath: { type: String, required: true, select: false },
  mimeType: String,
  size: Number,
  approved: { type: Boolean, default: false },
  uploadedBy: { type: ObjectId, ref: 'User' },
  uploadedByOrg: { type: ObjectId, ref: 'Organisation' },
}, opts));

const Batch = mongoose.model('Batch', new Schema({
  batchId: { type: String, required: true, unique: true, match: /^FT-\d{8}-[A-Z0-9]{6}$/ },
  productName: { type: String, required: true, trim: true, maxlength: 120 },
  productType: { type: ObjectId, ref: 'ProductType', required: true },
  category: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0 },
  unit: { type: String, required: true, trim: true, maxlength: 20 },
  origin: { type: String, required: true, trim: true, maxlength: 200 },
  producerOrg: { type: ObjectId, ref: 'Organisation', required: true, index: true },
  currentCustodianOrg: { type: ObjectId, ref: 'Organisation', required: true, index: true },
  harvestDate: { type: Date, required: true },
  expiryDate: Date,
  referenceStorage: { tempC: Number, humidityPct: Number },
  status: { type: String, enum: en.BATCH_STATUS, default: 'PENDING_REVIEW' },
  reviewReason: { type: String, enum: [null, 'NO_DATA', 'PREDICTION_FAILURE', 'HASH_MISMATCH', 'INVALID_DATA'], default: 'NO_DATA' },
  lifecycle: { type: String, enum: en.LIFECYCLE, default: 'REGISTERED' },
  latestPrediction: { type: ObjectId, ref: 'FreshnessPrediction' },
  certificates: [{ type: ObjectId, ref: 'Certificate' }],
  internalNotes: { type: String, maxlength: 2000 },
  price: Number,
  quarantineRelease: { by: { type: ObjectId, ref: 'User' }, reason: String, at: Date, scoreAtRelease: Number },
  integrity: { overall: String, checkedAt: Date, details: Schema.Types.Mixed },
  withdrawnReason: String,
}, opts));

const Checkpoint = mongoose.model('Checkpoint', new Schema({
  batchId: { type: String, required: true, index: true, immutable: true },
  checkpointId: { type: String, required: true, unique: true, immutable: true, default: () => crypto.randomUUID() },
  organisation: { type: ObjectId, ref: 'Organisation', required: true, immutable: true },
  handler: { type: ObjectId, ref: 'User', required: true, immutable: true },
  eventType: { type: String, enum: en.EVENT_TYPES, required: true, immutable: true },
  temperatureC: { type: Number, required: true, immutable: true },
  humidityPct: { type: Number, required: true, immutable: true },
  location: { type: String, default: '', immutable: true },
  eventTimestamp: { type: Date, required: true, immutable: true },
  receivedAt: { type: Date, required: true, default: Date.now, immutable: true },
  remarks: { type: String, default: '', immutable: true },
  sourceType: { type: String, enum: en.SOURCE_TYPES, required: true, immutable: true },
  validation: { ok: Boolean, errors: [String], warnings: [String] },
  hash: { type: String, required: true, immutable: true },
  dupKey: { type: String, unique: true, immutable: true },
  prediction: { type: ObjectId, ref: 'FreshnessPrediction' },
  importId: String,
}, { ...opts, suppressReservedKeysWarning: true }));
Checkpoint.schema.index({ batchId: 1, eventTimestamp: 1 });

const CustodyTransfer = mongoose.model('CustodyTransfer', new Schema({
  batchId: { type: String, required: true, index: true },
  fromOrg: { type: ObjectId, ref: 'Organisation', required: true, index: true },
  toOrg: { type: ObjectId, ref: 'Organisation', required: true, index: true },
  state: { type: String, enum: en.TRANSFER_STATE, default: 'PROPOSED' },
  proposedBy: { type: ObjectId, ref: 'User' },
  decidedBy: { type: ObjectId, ref: 'User' },
  remarks: { type: String, maxlength: 500 },
  reason: { type: String, maxlength: 500 },
}, opts));

const FreshnessPrediction = mongoose.model('FreshnessPrediction', new Schema({
  batchId: { type: String, required: true, index: true },
  checkpointCount: Number,
  score: Number,
  remainingShelfLifeHours: Number,
  qualityLossPct: Number,
  riskCategory: { type: String, enum: en.RISK },
  modelVersion: String,
  modelType: String,
  demonstrationMode: Boolean,
  warnings: [String],
  factors: [Schema.Types.Mixed],
  uncertainty: Schema.Types.Mixed,
  predictedAt: Date,
}, opts));

const Alert = mongoose.model('Alert', new Schema({
  type: { type: String, enum: en.ALERT_TYPES, required: true },
  severity: { type: String, enum: en.SEVERITY, required: true },
  batchId: { type: String, index: true },
  message: { type: String, required: true },
  dedupeKey: { type: String, required: true },
  acknowledged: { type: Boolean, default: false },
  acknowledgedBy: { type: ObjectId, ref: 'User' },
  occurrences: { type: Number, default: 1 },
  lastSeenAt: Date,
}, opts));
Alert.schema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { acknowledged: false } });

const ModelVersion = mongoose.model('ModelVersion', new Schema({
  version: { type: String, required: true, unique: true },
  type: String,
  trainedAt: Date,
  datasetSource: String,
  datasetLicence: String,
  metrics: { mae: Number, rmse: Number, r2: Number },
  demonstrationOnly: { type: Boolean, default: true },
  artifactPath: String,
}, opts));

const AuditLog = mongoose.model('AuditLog', new Schema({
  actor: { type: ObjectId, ref: 'User' },
  actorEmail: String,
  action: { type: String, required: true, index: true },
  entityType: String,
  entityId: String,
  orgId: { type: ObjectId, ref: 'Organisation' },
  details: Schema.Types.Mixed,
  ip: String,
  at: { type: Date, default: Date.now, index: true },
}));

const Threshold = mongoose.model('Threshold', new Schema({
  key: { type: String, unique: true, default: 'global' },
  safeAbove: { type: Number, default: 60 },
  flagAbove: { type: Number, default: 40 },
  nearExpiryHours: { type: Number, default: 48 },
  lowShelfLifeHours: { type: Number, default: 24 },
  updatedBy: { type: ObjectId, ref: 'User' },
}, opts));

const ImportJob = mongoose.model('ImportJob', new Schema({
  importId: { type: String, required: true, unique: true },
  batchId: { type: String, required: true },
  organisation: { type: ObjectId, ref: 'Organisation', required: true },
  user: { type: ObjectId, ref: 'User', required: true },
  filename: String,
  sourceType: { type: String, enum: ['CSV_IMPORT', 'JSON_IMPORT'] },
  state: { type: String, enum: ['PREVIEWED', 'COMMITTED'], default: 'PREVIEWED' },
  total: Number,
  valid: Number,
  rejected: Number,
  rows: [{ _id: false, row: Number, errors: [String], record: Schema.Types.Mixed }],
  result: Schema.Types.Mixed,
}, { ...opts, suppressReservedKeysWarning: true }));

module.exports = {
  mongoose, Organisation, User, RevokedToken, ProductType, Certificate, Batch, Checkpoint, CustodyTransfer,
  FreshnessPrediction, Alert, ModelVersion, AuditLog, Threshold, ImportJob,
};
