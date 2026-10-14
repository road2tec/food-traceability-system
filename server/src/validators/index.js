'use strict';
const { z } = require('zod');
const en = require('../utils/enums');
const { BATCH_ID_RE } = require('../utils/ids');

const str = (max = 200) => z.string().trim().min(1).max(max);
const optStr = (max = 500) => z.string().trim().max(max).optional();
const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'invalid id');
const batchIdP = z.object({ batchId: z.string().regex(BATCH_ID_RE, 'invalid batch id') });
const idP = z.object({ id: objectId });
const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'invalid date');
const num = z.number().finite();
const range = z.object({ min: num, max: num }).refine((r) => r.min < r.max, 'min must be < max');

const password = z.string().min(10).max(128).regex(/[A-Za-z]/, 'must contain a letter').regex(/\d/, 'must contain a digit');

const register = z.object({
  name: str(120),
  email: z.string().trim().toLowerCase().email().max(254),
  password,
  role: z.enum(en.ROLES.filter((r) => r !== 'ADMIN')),
  organisation: z.object({ name: str(120), type: z.enum(en.ORG_TYPES.filter((t) => t !== 'ADMIN')), address: optStr(300), country: optStr(80) }),
}).strict();
const login = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(128) }).strict();

const productType = z.object({
  name: str(100),
  category: str(40),
  referenceTempC: num.min(-50).max(60),
  referenceShelfLifeHours: num.positive().max(100000),
  activationEnergyJPerMol: num.min(1000).max(300000),
  qualityThresholds: z.object({ safeAbove: num.min(0).max(100), flagAbove: num.min(0).max(100) }).refine((q) => q.safeAbove > q.flagAbove, 'safeAbove must exceed flagAbove').optional(),
  humidityRange: range.optional(),
  tempRange: range.optional(),
  sourceNote: str(1000),
  isDemonstration: z.boolean().optional(),
}).strict();

const batchCreate = z.object({
  productTypeId: objectId,
  productName: str(120),
  quantity: num.min(0),
  unit: str(20),
  origin: str(200),
  harvestDate: isoDate,
  expiryDate: isoDate.optional(),
  referenceStorage: z.object({ tempC: num.optional(), humidityPct: num.min(0).max(100).optional() }).optional(),
  internalNotes: optStr(2000),
  price: num.min(0).optional(),
}).strict();
const batchPatch = z.object({
  productName: str(120).optional(), quantity: num.min(0).optional(), unit: str(20).optional(), origin: str(200).optional(),
  expiryDate: isoDate.optional(), referenceStorage: batchCreate.shape.referenceStorage, internalNotes: optStr(2000), price: num.min(0).optional(),
}).strict();

const checkpointCreate = z.object({
  eventType: z.string().max(30),
  temperatureC: z.union([z.number(), z.string().max(20)]).optional(),
  humidityPct: z.union([z.number(), z.string().max(20)]).optional(),
  location: z.string().max(400).optional(),
  eventTimestamp: z.string().max(40).optional(),
  remarks: z.string().max(2000).optional(),
}).strict();

const transferCreate = z.object({ toOrganisationId: objectId, remarks: optStr(500) }).strict();
const reasonBody = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
const quarantineRelease = z.object({ reason: z.string().trim().min(10, 'reason must be at least 10 characters').max(1000) }).strict();

const simulate = z.object({
  batchId: z.string().regex(BATCH_ID_RE),
  scenario: z.enum(en.SCENARIOS),
  count: z.number().int().min(1).max(500),
  seed: z.number().int().optional(),
  durationHours: z.number().positive().max(24 * 60).optional(),
}).strict();

const thresholds = z.object({
  safeAbove: num.min(0).max(100), flagAbove: num.min(0).max(100),
  nearExpiryHours: num.min(0).max(24 * 365).optional(), lowShelfLifeHours: num.min(0).max(24 * 365).optional(),
}).strict().refine((t) => t.safeAbove > t.flagAbove, 'safeAbove must exceed flagAbove');

module.exports = { z, objectId, batchIdP, idP, register, login, productType, batchCreate, batchPatch, checkpointCreate, transferCreate, reasonBody, quarantineRelease, simulate, thresholds, isoDate };
