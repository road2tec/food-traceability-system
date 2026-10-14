import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(here, '..', '..', '.env');

function readDotEnv() {
  const out = {};
  try {
    for (const line of fs.readFileSync(rootEnvPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch { /* no .env */ }
  return out;
}
const dot = readDotEnv();

export const config = {
  apiUrl: (process.env.API_URL || 'http://127.0.0.1:4000/api/v1').replace(/\/$/, ''),
  aiUrl: (process.env.AI_URL || 'http://127.0.0.1:8001').replace(/\/$/, ''),
  mongoUri: process.env.MONGODB_URI || dot.MONGODB_URI || 'mongodb://127.0.0.1:27017/food_traceability',
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || dot.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
  adminEmail: process.env.E2E_ADMIN_EMAIL || 'admin@foodtrace.local',
  adminPassword: process.env.E2E_ADMIN_PASSWORD || 'Admin@12345',
  password: 'E2eTest!2345pw',
  rateLimitAttempts: Number(process.env.E2E_RATE_LIMIT_ATTEMPTS || 60),
};

/** Perform an HTTP call. Returns {status, ok, json, text, buf, headers}. Never throws on HTTP errors. */
export async function call(method, urlPath, { token, body, form, raw = false, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const url = urlPath.startsWith('http') ? urlPath : config.apiUrl + urlPath;
  const res = await fetch(url, { method, headers: h, body: payload, signal: AbortSignal.timeout(30000) });
  const buf = Buffer.from(await res.arrayBuffer());
  let json = null; let text = '';
  if (!raw) {
    text = buf.toString('utf8');
    try { json = JSON.parse(text); } catch { /* not json */ }
  }
  return { status: res.status, ok: res.ok, json, text, buf, headers: res.headers };
}

export const data = (r) => (r.json && r.json.data !== undefined ? r.json.data : r.json);
export const errCode = (r) => r.json && r.json.error && r.json.error.code;
export const idOf = (x) => (x && typeof x === 'object' ? String(x._id || x.id || '') : x ? String(x) : '');
export const uniq = () => Date.now().toString(36) + crypto.randomBytes(2).toString('hex');
export const hoursAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString();

/** Contract hashing: canonical JSON (sorted keys, no whitespace) then SHA-256 hex. */
export function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}
export const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

/** Checkpoint hash per docs/API_CONTRACT.md from a stored Mongo document. Returns candidate hashes by remarks-null policy. */
export function checkpointHashCandidates(doc) {
  const base = {
    batchId: doc.batchId,
    checkpointId: doc.checkpointId,
    organisationId: String(doc.organisation),
    handlerId: String(doc.handler),
    eventType: doc.eventType,
    temperatureC: doc.temperatureC,
    humidityPct: doc.humidityPct,
    location: doc.location,
    eventTimestamp: new Date(doc.eventTimestamp).toISOString(),
    sourceType: doc.sourceType,
  };
  const variants = { 'remarks as stored': doc.remarks, 'remarks empty-string': doc.remarks ?? '', 'remarks null': doc.remarks ?? null };
  const out = {};
  for (const [k, v] of Object.entries(variants)) out[k] = sha256(canonical({ ...base, remarks: v }));
  return out;
}

export async function login(email, password) {
  return call('POST', '/auth/login', { body: { email, password } });
}
