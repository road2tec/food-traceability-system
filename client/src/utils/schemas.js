import { z } from 'zod';
import { EVENT_TYPES, REGISTRATION_ROLES, ORG_TYPES } from './constants';

/** Required numeric text input with range; stays a string so empty input is rejected (not coerced to 0). */
export const numberText = (label, min, max) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .refine((v) => !Number.isNaN(Number(v)), `${label} must be a number`)
    .refine((v) => Number(v) >= min, `${label} must be at least ${min}`)
    .refine((v) => Number(v) <= max, `${label} must be at most ${max}`);

const optionalNumberText = (label, min, max) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || !Number.isNaN(Number(v)), `${label} must be a number`)
    .refine((v) => v === '' || (Number(v) >= min && Number(v) <= max), `${label} must be between ${min} and ${max}`);

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters'),
    email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Za-z]/, 'Password must contain a letter')
      .regex(/[0-9]/, 'Password must contain a number'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    role: z.enum(REGISTRATION_ROLES, { error: 'Select a role' }),
    organisationName: z.string().trim().min(2, 'Organisation name is required'),
    organisationType: z.enum(ORG_TYPES, { error: 'Select an organisation type' }),
    address: z.string().trim().optional(),
    country: z.string().trim().optional(),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });

export const batchSchema = z
  .object({
    productName: z.string().trim().min(2, 'Product name is required'),
    productType: z.string().min(1, 'Select a product type'),
    quantity: numberText('Quantity', 0.0001, 100000000),
    unit: z.string().trim().min(1, 'Unit is required'),
    origin: z.string().trim().min(2, 'Origin is required'),
    harvestDate: z.string().min(1, 'Harvest / production date is required'),
    expiryDate: z.string().optional(),
    refTempC: optionalNumberText('Storage temperature', -40, 60),
    refHumidityPct: optionalNumberText('Storage humidity', 0, 100),
    internalNotes: z.string().trim().max(1000, 'Notes must be 1000 characters or fewer').optional(),
  })
  .refine((d) => !d.expiryDate || !d.harvestDate || new Date(d.expiryDate) >= new Date(d.harvestDate), {
    path: ['expiryDate'],
    message: 'Expiry date cannot be before the production date',
  });

export const checkpointSchema = z.object({
  batchId: z.string().trim().min(1, 'Select a batch'),
  eventType: z.enum(EVENT_TYPES, { error: 'Select an event type' }),
  temperatureC: numberText('Temperature', -50, 80),
  humidityPct: numberText('Humidity', 0, 100),
  location: z.string().trim().min(2, 'Location is required'),
  eventTimestamp: z
    .string()
    .min(1, 'Timestamp is required')
    .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Invalid date')
    .refine((v) => new Date(v).getTime() <= Date.now() + 5 * 60 * 1000, 'Timestamp cannot be in the future'),
  remarks: z.string().trim().max(500, 'Remarks must be 500 characters or fewer').optional(),
});

export const reasonSchema = z.object({
  reason: z.string().trim().min(10, 'A reason of at least 10 characters is required'),
});

export const transferSchema = z.object({
  toOrganisationId: z.string().min(1, 'Select the receiving organisation'),
  remarks: z.string().trim().max(500).optional(),
});

export const productTypeSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is required'),
    category: z.string().min(1, 'Select a category'),
    referenceTempC: numberText('Reference temperature', -40, 60),
    referenceShelfLifeHours: numberText('Reference shelf life (hours)', 1, 100000),
    activationEnergyJPerMol: numberText('Activation energy (J/mol)', 1000, 300000),
    safeAbove: numberText('SAFE above', 0, 100),
    flagAbove: numberText('FLAGGED above', 0, 100),
    humidityMin: numberText('Humidity min', 0, 100),
    humidityMax: numberText('Humidity max', 0, 100),
    tempMin: numberText('Temperature min', -50, 80),
    tempMax: numberText('Temperature max', -50, 80),
    sourceNote: z.string().trim().min(3, 'A source note / citation is required'),
    isDemonstration: z.boolean(),
  })
  .refine((d) => Number(d.flagAbove) < Number(d.safeAbove), { path: ['flagAbove'], message: 'FLAGGED threshold must be below SAFE threshold' })
  .refine((d) => Number(d.humidityMin) <= Number(d.humidityMax), { path: ['humidityMax'], message: 'Max must be at least min' })
  .refine((d) => Number(d.tempMin) <= Number(d.tempMax), { path: ['tempMax'], message: 'Max must be at least min' });
