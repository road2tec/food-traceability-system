'use strict';
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const env = process.env;
const bool = (v, d = false) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));
const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const isProd = env.NODE_ENV === 'production';

let jwtSecret = env.JWT_SECRET;
if (!jwtSecret) {
  if (isProd) throw new Error('JWT_SECRET must be set in production');
  jwtSecret = crypto.randomBytes(48).toString('hex'); // dev only: tokens invalid after restart
}
if (isProd && jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');

module.exports = {
  env: env.NODE_ENV || 'development',
  isProd,
  isTest: env.NODE_ENV === 'test',
  port: num(env.PORT, 4000),
  mongoUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017/food_traceability',
  jwt: { secret: jwtSecret, expiresIn: env.JWT_EXPIRES_IN || '8h' },
  clientOrigin: (env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),
  publicBaseUrl: (env.PUBLIC_BASE_URL || 'http://localhost:5173').replace(/\/$/, ''),
  trustProxy: env.TRUST_PROXY || '0',
  bcryptRounds: num(env.BCRYPT_ROUNDS, 12),
  uploadDir: path.resolve(path.join(__dirname, '..', '..'), env.UPLOAD_DIR || 'uploads'),
  rateLimit: { max: num(env.RATE_LIMIT_MAX, 300), authMax: num(env.RATE_LIMIT_AUTH_MAX, 20) },
    ai: { url: (env.AI_SERVICE_URL || 'http://127.0.0.1:8001').replace(/\/$/, ''), timeoutMs: num(env.AI_TIMEOUT_MS, 8000) },
};
