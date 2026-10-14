// Offline self-test of helper logic (no stack needed).
import { canonical, sha256, checkpointHashCandidates } from './api.mjs';
import assert from 'node:assert/strict';
assert.equal(canonical({ b: 1, a: { d: [2, { z: 1, y: null }], c: 'x' } }), '{"a":{"c":"x","d":[2,{"y":null,"z":1}]},"b":1}');
assert.equal(sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
const doc = { batchId: 'FT-1', checkpointId: 'c1', organisation: 'o', handler: 'h', eventType: 'STORAGE', temperatureC: 4, humidityPct: 80, location: 'L', eventTimestamp: new Date('2026-01-01T00:00:00.000Z'), remarks: undefined, sourceType: 'MANUAL' };
const a = checkpointHashCandidates(doc); const before = a['remarks empty-string'];
const b = checkpointHashCandidates({ ...doc, temperatureC: 13.5 });
assert.notEqual(before, b['remarks empty-string']);
console.log('selftest OK');
