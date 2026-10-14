'use strict';
const crypto = require('crypto');

// Canonical JSON: recursively sorted keys, no whitespace, UTF-8.
function canonicalize(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(canonicalize).join(',') + ']';
  return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canonicalize(v[k])).join(',') + '}';
}
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

// Fields hashed per API contract.
function checkpointHashInput(cp) {
  const iso = (d) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());
  const idOf = (x) => String(x && x._id ? x._id : x);
  return {
    batchId: String(cp.batchId),
    checkpointId: String(cp.checkpointId),
    organisationId: idOf(cp.organisation),
    handlerId: idOf(cp.handler),
    eventType: cp.eventType,
    temperatureC: cp.temperatureC,
    humidityPct: cp.humidityPct,
    location: cp.location == null ? '' : cp.location,
    eventTimestamp: iso(cp.eventTimestamp),
    remarks: cp.remarks == null ? '' : cp.remarks,
    sourceType: cp.sourceType,
  };
}
const checkpointHash = (cp) => sha256(canonicalize(checkpointHashInput(cp)));

module.exports = { canonicalize, sha256, checkpointHashInput, checkpointHash };
