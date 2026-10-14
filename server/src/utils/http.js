'use strict';
const { z } = require('zod');
const { E } = require('./AppError');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const ok = (res, data, meta, status = 200) => res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });

// Validation with zod; replaces body/params with parsed (stripped, typed) values.
// Parsed query lands on req.vq (express 5 req.query is read-only).
const validate = (schemas) => (req, _res, next) => {
  try {
    for (const k of ['params', 'query', 'body']) {
      if (!schemas[k]) continue;
      const r = schemas[k].safeParse(req[k] === undefined ? {} : req[k]);
      if (!r.success) {
        throw E.validation('Request validation failed', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
      }
      if (k === 'query') req.vq = r.data;
      else req[k] = r.data;
    }
    if (!req.vq) req.vq = {};
    next();
  } catch (e) { next(e); }
};

const pagination = (q) => {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
};
const parseSort = (s, allowed, dflt = { createdAt: -1 }) => {
  if (!s || typeof s !== 'string') return dflt;
  const out = {};
  for (const part of s.split(',')) {
    const dir = part.startsWith('-') ? -1 : 1;
    const f = part.replace(/^-/, '');
    if (allowed.includes(f)) out[f] = dir;
  }
  return Object.keys(out).length ? out : dflt;
};
const meta = (p, total) => ({ page: p.page, limit: p.limit, total, totalPages: Math.ceil(total / p.limit) });
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const listQuery = z.object({
  page: z.string().max(10).optional(), limit: z.string().max(10).optional(), sort: z.string().max(100).optional(), q: z.string().max(100).optional(),
}).passthrough();

module.exports = { asyncHandler, ok, validate, pagination, parseSort, meta, escapeRegex, listQuery, z };
