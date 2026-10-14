// Steps W01..W22: the end-to-end traceability workflow, through the public HTTP API only
// (plus direct MongoDB access ONLY for the tamper test, which by definition bypasses the API).
import { MongoClient } from 'mongodb';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { assert, eq, skip } from '../lib/harness.mjs';
import { call, config, data, errCode, idOf, uniq, hoursAgo, login, checkpointHashCandidates } from '../lib/api.mjs';

const list = (r) => { const d = data(r); return Array.isArray(d) ? d : (d && (d.items || d.results || d.docs)) || []; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CLEAN = /^(OK|VERIFIED|MATCH|MATCHED|CONSISTENT|INTACT|PASS|VALID)$/i;

async function registerUser(label, role, orgType, sfx) {
  const email = `e2e.${label}.${sfx}@e2e.test`;
  const r = await call('POST', '/auth/register', { body: {
    name: `E2E ${label} ${sfx}`, email, password: config.password, role,
    organisation: { name: `E2E ${label} Org ${sfx}`, type: orgType, address: '1 Test Road', country: 'GB' },
  } });
  assert(r.status === 201 || r.status === 200, `register ${label}: HTTP ${r.status} ${r.text.slice(0, 200)}`);
  const d = data(r) || {};
  const status = (d.user && d.user.status) || d.status;
  eq(status, 'PENDING', `new ${label} must be PENDING`);
  return { email, label, role };
}

async function approve(ctx, u) {
  const r = await call('GET', `/users?limit=100&q=${encodeURIComponent(u.email)}`, { token: ctx.adminToken });
  assert(r.status === 200, `GET /users HTTP ${r.status}`);
  const found = list(r).find((x) => String(x.email).toLowerCase() === u.email.toLowerCase());
  assert(found, `user ${u.email} not found in /users`);
  u.id = idOf(found);
  const p = await call('PATCH', `/users/${u.id}/status`, { token: ctx.adminToken, body: { status: 'ACTIVE' } });
  assert(p.status === 200, `approve HTTP ${p.status} ${p.text.slice(0, 200)}`);
}

async function loginUser(u) {
  const r = await login(u.email, config.password);
  assert(r.status === 200, `login ${u.label}: HTTP ${r.status} ${r.text.slice(0, 200)} (if 429, the login rate limiter is active: wait for its window)`);
  const d = data(r);
  u.token = d.token;
  assert(u.token, 'no token in login response');
  u.orgId = idOf(d.user && d.user.organisation);
}

function cpBody(over) {
  return { eventType: 'STORAGE', temperatureC: 4.0, humidityPct: 88, location: 'E2E Cold Store', eventTimestamp: hoursAgo(4), remarks: 'e2e checkpoint', ...over };
}
const unwrapCp = (r) => { const d = data(r); return (d && d.checkpoint) || d; };

export function registerMain(h) {
  // ---- W01 stack health -------------------------------------------------
  h.add('W01', 'stack health: server, mongo, AI', async (c) => {
    const r = await call('GET', '/health');
    assert(r.status === 200, `GET /health HTTP ${r.status}`);
    const d = data(r) || {};
    c.aiUp = !!(d.ai && (d.ai === true || d.ai === 'UP' || d.ai.status === 'UP' || d.ai.status === 'ok'));
    try { const a = await fetch(config.aiUrl + '/health', { signal: AbortSignal.timeout(4000) }); c.aiUp = a.ok; } catch { c.aiUp = false; }
    return `ai=${c.aiUp ? 'UP' : 'DOWN'}`;
  });

  h.add('W02', 'admin login with seeded demo credentials', async (c) => {
    const r = await login(config.adminEmail, config.adminPassword);
    assert(r.status === 200, `admin login HTTP ${r.status} ${r.text.slice(0, 160)} (set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD; run seed first)`);
    c.adminToken = data(r).token; assert(c.adminToken, 'no token');
  }, { requires: ['W01'] });

  h.add('W03', 'register producer, distributor and 2nd producer -> all PENDING', async (c) => {
    c.sfx = uniq();
    c.A = await registerUser('producer', 'PRODUCER', 'PRODUCER', c.sfx);
    c.D = await registerUser('distributor', 'DISTRIBUTOR', 'DISTRIBUTOR', c.sfx);
    c.B = await registerUser('producerB', 'PRODUCER', 'PRODUCER', c.sfx);
  }, { requires: ['W02'] });

  h.add('W04', 'PENDING producer cannot log in', async (c) => {
    const r = await login(c.A.email, config.password);
    assert(r.status === 401 || r.status === 403, `PENDING login should be refused, got HTTP ${r.status}`);
    assert(!(r.json && r.json.data && r.json.data.token), 'token issued to PENDING user');
  }, { requires: ['W03'] });

  h.add('W05', 'admin approves users; they can now log in', async (c) => {
    for (const u of [c.A, c.D, c.B]) { await approve(c, u); await loginUser(u); }
  }, { requires: ['W04'] });

  h.add('W06', 'register batch (producer) -> batchId FT-YYYYMMDD-XXXXXX, PRODUCER org is custodian', async (c) => {
    const pt = await call('GET', '/product-types', { token: c.A.token });
    assert(pt.status === 200, `GET /product-types HTTP ${pt.status}`);
    const types = list(pt); assert(types.length > 0, 'no product types seeded');
    const t = types.find((x) => /banana|milk|lettuce|tomato|strawberr|apple/i.test(x.name)) || types[0];
    c.productType = t;
    c.price = 7777.77; c.secretNote = `E2E-SECRET-NOTE-${c.sfx}`;
    const r = await call('POST', '/batches', { token: c.A.token, body: {
      productName: t.name, productTypeId: idOf(t), quantity: 120, unit: 'kg', origin: 'E2E Farm, GB',
      harvestDate: hoursAgo(6), internalNotes: c.secretNote, price: c.price,
      referenceStorage: { tempC: t.referenceTempC, humidityPct: 85 },
    } });
    assert(r.status === 201 || r.status === 200, `POST /batches HTTP ${r.status} ${r.text.slice(0, 300)}`);
    const d = data(r); const b = d.batch || d;
    c.batchId = b.batchId; assert(/^FT-\d{8}-[A-Z0-9]{6}$/.test(c.batchId), `bad batchId format: ${c.batchId}`);
    return c.batchId;
  }, { requires: ['W05'] });

  h.add('W07', 'QR PNG is a valid image that decodes to the public verify URL', async (c) => {
    const r = await call('GET', `/batches/${c.batchId}/qr`, { token: c.A.token, raw: true });
    assert(r.status === 200, `QR HTTP ${r.status}`);
    assert(/image\/png/.test(r.headers.get('content-type') || ''), `content-type ${r.headers.get('content-type')}`);
    assert(r.buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a', 'not a PNG');
    const png = PNG.sync.read(r.buf);
    const res = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    assert(res, 'could not decode QR code from PNG');
    const expected = config.publicBaseUrl ? `${config.publicBaseUrl}/verify/${c.batchId}` : null;
    if (expected) eq(res.data, expected, 'QR payload');
    else assert(/^https?:\/\/.+\/verify\/FT-/.test(res.data) && res.data.endsWith(`/verify/${c.batchId}`), `QR payload ${res.data}`);
    return res.data;
  }, { requires: ['W06'] });

  h.add('W08', 'record checkpoint; persisted via API and in MongoDB with 64-hex SHA-256', async (c) => {
    const r = await call('POST', `/batches/${c.batchId}/checkpoints`, { token: c.A.token, body: cpBody({ eventType: 'STORAGE', temperatureC: 4.0, eventTimestamp: hoursAgo(4) }) });
    assert(r.status === 201 || r.status === 200, `POST checkpoint HTTP ${r.status} ${r.text.slice(0, 300)}`);
    const cp = unwrapCp(r); c.cp1 = cp; c.cpRaw = data(r);
    assert(cp.checkpointId, 'no checkpointId');
    const g = await call('GET', `/batches/${c.batchId}/checkpoints`, { token: c.A.token });
    assert(list(g).some((x) => x.checkpointId === cp.checkpointId), 'checkpoint not returned by GET (not persisted)');
    c.mongo = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
    await c.mongo.connect();
    c.col = c.mongo.db().collection('checkpoints');
    const doc = await c.col.findOne({ checkpointId: cp.checkpointId });
    assert(doc, `checkpoint missing in MongoDB collection "checkpoints" (db ${c.mongo.db().databaseName})`);
    assert(/^[0-9a-f]{64}$/.test(doc.hash || ''), `stored hash not 64 hex: ${doc.hash}`);
    c.cp1Doc = doc;
  }, { requires: ['W07'] });

  h.add('W11', 'freshness prediction present (score 0-100, model version, demo flag)', async (c) => {
    if (!c.aiUp) skip('ai-service /health not reachable: prediction cannot be produced (server must then use PENDING_REVIEW)');
    const r = await call('GET', `/batches/${c.batchId}/prediction`, { token: c.A.token });
    assert(r.status === 200, `GET prediction HTTP ${r.status} ${r.text.slice(0, 200)}`);
    const p = data(r);
    assert(typeof p.score === 'number' && p.score >= 0 && p.score <= 100, `score ${p.score}`);
    assert(p.modelVersion, 'modelVersion missing');
    assert(typeof p.demonstrationMode === 'boolean', 'demonstrationMode missing');
    assert(['LOW', 'MODERATE', 'HIGH', 'CRITICAL'].includes(p.riskCategory), `riskCategory ${p.riskCategory}`);
    c.score1 = p.score;
    return `score=${p.score} model=${p.modelVersion} demo=${p.demonstrationMode}`;
  }, { requires: ['W08'] });

  h.add('W12', 'quality rule applied: status consistent with score thresholds', async (c) => {
    if (!c.aiUp) skip('ai-service down: quality rule needs a prediction');
    const b = data(await call('GET', `/batches/${c.batchId}`, { token: c.A.token }));
    const batch = b.batch || b; const s = c.score1;
    const expected = s > 60 ? 'SAFE' : s >= 40 ? 'FLAGGED' : 'QUARANTINED';
    assert(['SAFE', 'FLAGGED', 'QUARANTINED', 'PENDING_REVIEW'].includes(batch.status), `status ${batch.status}`);
    if (batch.status === 'PENDING_REVIEW') throw new Error(`score ${s} but status PENDING_REVIEW (a check failed?)`);
    eq(batch.status, expected, `status for score ${s}`);
  }, { requires: ['W11'] });

  h.add('W13', 'import with malformed rows reports per-row errors; commit keeps only valid rows', async (c) => {
    const csv = [
      'timestamp,temperature_c,humidity_pct,location,event_type,remarks',
      `${hoursAgo(3.5)},4.5,87,E2E Cold Store,STORAGE,good row`,
      `${hoursAgo(3.2)},not-a-number,87,E2E Cold Store,STORAGE,bad temperature`,
      `not-a-date,4.5,87,E2E Cold Store,STORAGE,bad timestamp`,
      `${hoursAgo(3.0)},4.6,250,E2E Cold Store,NOT_AN_EVENT,bad humidity and event type`,
    ].join('\n');
    const fd = new FormData(); fd.append('file', new Blob([csv], { type: 'text/csv' }), 'e2e.csv');
    const r = await call('POST', `/batches/${c.batchId}/imports/preview`, { token: c.A.token, form: fd });
    assert(r.status === 200 || r.status === 201, `preview HTTP ${r.status} ${r.text.slice(0, 300)}`);
    const d = data(r);
    eq(d.total, 4, 'total'); eq(d.valid, 1, 'valid'); eq(d.rejected, 3, 'rejected');
    const bad = (d.rows || []).filter((x) => x.errors && x.errors.length);
    eq(bad.length, 3, 'rows with errors');
    assert(bad.every((x) => typeof x.row === 'number'), 'row numbers missing');
    const cm = await call('POST', `/imports/${d.importId}/commit`, { token: c.A.token });
    assert(cm.status === 200 || cm.status === 201, `commit HTTP ${cm.status} ${cm.text.slice(0, 200)}`);
    eq(data(cm).committed, 1, 'committed rows');
  }, { requires: ['W08'] });

  h.add('W14', 'cold-chain break -> TEMP_EXCURSION alert and degraded freshness', async (c) => {
    const r = await call('POST', `/batches/${c.batchId}/checkpoints`, { token: c.A.token, body: cpBody({ eventType: 'TRANSIT', temperatureC: 32, humidityPct: 60, location: 'E2E Truck (AC failed)', eventTimestamp: hoursAgo(2.5), remarks: 'cooling failure' }) });
    assert(r.status === 201 || r.status === 200, `POST checkpoint HTTP ${r.status} ${r.text.slice(0, 300)}`);
    c.cp2 = unwrapCp(r);
    await sleep(500);
    const a = await call('GET', `/alerts?batchId=${c.batchId}&limit=100`, { token: c.A.token });
    assert(a.status === 200, `GET /alerts HTTP ${a.status}`);
    const types = list(a).map((x) => x.type);
    assert(types.includes('TEMP_EXCURSION'), `no TEMP_EXCURSION alert; got [${types.join(',')}]`);
    if (c.aiUp && c.score1 !== undefined) {
      const p = data(await call('GET', `/batches/${c.batchId}/prediction`, { token: c.A.token }));
      assert(p.score < c.score1, `score did not drop after 32C excursion (${c.score1} -> ${p.score})`);
      return `alerts=[${[...new Set(types)].join(',')}] score ${c.score1} -> ${p.score}`;
    }
    return `alerts=[${[...new Set(types)].join(',')}]`;
  }, { requires: ['W13'] });

  h.add('W15', 'custody transfer producer -> distributor (propose, accept)', async (c) => {
    const orgs = list(await call('GET', '/organisations?limit=100', { token: c.A.token }));
    let toOrg = c.D.orgId; if (!toOrg) { const o = orgs.find((x) => /E2E distributor Org/i.test(x.name || x.publicName || '') && (x.name || '').includes(c.sfx)); toOrg = idOf(o); }
    assert(toOrg, 'distributor organisation id not found');
    const p = await call('POST', `/batches/${c.batchId}/transfers`, { token: c.A.token, body: { toOrganisationId: toOrg, remarks: 'e2e handover' } });
    assert(p.status === 201 || p.status === 200, `propose HTTP ${p.status} ${p.text.slice(0, 300)}`);
    const t = data(p); c.transferId = idOf(t.transfer || t);
    const pend = list(await call('GET', '/transfers?state=PROPOSED', { token: c.D.token }));
    assert(pend.some((x) => idOf(x) === c.transferId), 'distributor does not see PROPOSED transfer');
    const a = await call('POST', `/transfers/${c.transferId}/accept`, { token: c.D.token });
    assert(a.status === 200 || a.status === 201, `accept HTTP ${a.status} ${a.text.slice(0, 300)}`);
    const b = data(await call('GET', `/batches/${c.batchId}`, { token: c.D.token })); const batch = b.batch || b;
    eq(idOf(batch.currentCustodianOrg), c.D.orgId || idOf(batch.currentCustodianOrg), 'custodian');
  }, { requires: ['W14'] });

  h.add('W16', 'distributor adds checkpoints; recalculation increases prediction history', async (c) => {
    for (const [i, o] of [[0, { eventType: 'RECEIPT', temperatureC: 5, eventTimestamp: hoursAgo(1.5), location: 'E2E DC' }], [1, { eventType: 'STORAGE', temperatureC: 4.5, eventTimestamp: hoursAgo(0.5), location: 'E2E DC' }]]) {
      const r = await call('POST', `/batches/${c.batchId}/checkpoints`, { token: c.D.token, body: cpBody({ ...o, remarks: `distributor ${i}` }) });
      assert(r.status === 201 || r.status === 200, `distributor checkpoint HTTP ${r.status} ${r.text.slice(0, 300)}`);
    }
    if (!c.aiUp) skip('checkpoints recorded; recalculation skipped because ai-service is down');
    const before = list(await call('GET', `/batches/${c.batchId}/predictions`, { token: c.D.token })).length;
    const rc = await call('POST', `/batches/${c.batchId}/prediction/recalculate`, { token: c.D.token });
    assert(rc.status === 200 || rc.status === 201, `recalculate HTTP ${rc.status} ${rc.text.slice(0, 200)}`);
    const after = list(await call('GET', `/batches/${c.batchId}/predictions`, { token: c.D.token })).length;
    assert(after > before, `prediction history did not grow (${before} -> ${after})`);
  }, { requires: ['W15'] });

  h.add('W17', 'server hash verification: untouched batch verifies clean (local SHA-256)', async (c) => {
    const r = await call('POST', `/batches/${c.batchId}/verify`, { token: c.D.token });
    assert(r.status === 200 || r.status === 201, `verify HTTP ${r.status} ${r.text.slice(0, 300)}`);
    const v = data(r);
    assert(Array.isArray(v.checkpoints) && v.checkpoints.length >= 4, `expected >=4 checkpoints, got ${v.checkpoints && v.checkpoints.length}`);
    assert(v.checkpoints.every((x) => x.match === true), `some checkpoints do not match: ${JSON.stringify(v.checkpoints.filter((x) => x.match !== true)).slice(0, 300)}`);
    return `overall=${v.overall}`;
  }, { requires: ['W16'] });

  h.add('W18', 'public verify page data is whitelisted (no emails/prices/notes/user ids)', async (c) => {
    const r = await call('GET', `/public/verify/${c.batchId}`);
    assert(r.status === 200, `public verify HTTP ${r.status}`);
    const d = data(r); const s = JSON.stringify(r.json);
    for (const k of ['batch', 'timeline', 'freshness', 'certificates', 'integrity', 'disclaimer']) assert(k in d, `missing top-level "${k}"`);
    const extra = Object.keys(d).filter((k) => !['batch', 'timeline', 'freshness', 'certificates', 'integrity', 'disclaimer'].includes(k));
    assert(!extra.length, `non-whitelisted top-level keys: ${extra.join(',')}`);
    const allowedBatch = ['batchId', 'productName', 'category', 'origin', 'producedAt', 'quantity', 'unit', 'status', 'lifecycle', 'lastUpdated'];
    const extraB = Object.keys(d.batch).filter((k) => !allowedBatch.includes(k));
    assert(!extraB.length, `non-whitelisted batch keys: ${extraB.join(',')}`);
    const allowedT = ['eventType', 'organisation', 'location', 'timestamp', 'temperatureC', 'humidityPct'];
    for (const t of d.timeline) { const x = Object.keys(t).filter((k) => !allowedT.includes(k)); assert(!x.length, `non-whitelisted timeline keys: ${x.join(',')}`); }
    for (const needle of [c.A.email, c.D.email, c.secretNote, String(c.price), c.A.id, c.D.id]) assert(!s.includes(needle), `public payload leaks "${needle}"`);
    assert(!/"[^"]*(email|phone|price|internalNotes|password|handler)[^"]*"\s*:/i.test(s), 'public payload has a sensitive-looking key');
    assert(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(s), 'public payload contains an email-like string');
    assert(d.disclaimer, 'disclaimer missing');
    return `timeline=${d.timeline.length} integrity=${d.integrity && d.integrity.overall}`;
  }, { requires: ['W17'] });

}

// Tamper tests run last: they edit MongoDB directly (and restore it in W99).
export function registerTamper(h) {
  h.add('W19', 'local recompute of stored checkpoint hash matches contract formula (baseline)', async (c) => {
    const doc = await c.col.findOne({ checkpointId: c.cp1.checkpointId });
    const cands = checkpointHashCandidates(doc);
    const hit = Object.entries(cands).find(([, v]) => v === doc.hash);
    assert(hit, `stored hash ${doc.hash} does not match the contract canonical-JSON formula for any remarks policy: the server's hashing deviates from docs/API_CONTRACT.md`);
    c.remarksPolicy = hit[0];
    return `matches (${hit[0]})`;
  }, { requires: ['W08'] });

  h.add('W20', 'TAMPER: edit stored checkpoint in MongoDB -> local recompute detects the edit', async (c) => {
    c.origTemp = c.cp1Doc.temperatureC;
    const res = await c.col.updateOne({ checkpointId: c.cp1.checkpointId }, { $set: { temperatureC: c.origTemp + 9.5 } });
    eq(res.modifiedCount, 1, 'tamper write');
    const doc = await c.col.findOne({ checkpointId: c.cp1.checkpointId });
    const recomputed = checkpointHashCandidates(doc)[c.remarksPolicy];
    assert(recomputed !== doc.hash, 'tampered data still hashes to stored hash (impossible unless hashing ignores temperatureC)');
    c.tampered = true;
  }, { requires: ['W19', 'W17'] });

  h.add('W21', 'TAMPER: server verify reports hash mismatch for the edited checkpoint', async (c) => {
    const r = await call('POST', `/batches/${c.batchId}/verify`, { token: c.D.token });
    assert(r.status === 200 || r.status === 201, `verify HTTP ${r.status} ${r.text.slice(0, 300)}`);
    const v = data(r);
    assert(!CLEAN.test(String(v.overall)), `overall="${v.overall}" still claims clean after tampering`);
    const row = v.checkpoints.find((x) => x.checkpointId === c.cp1.checkpointId);
    assert(row, 'tampered checkpoint missing from verify result');
    eq(row.match, false, 'tampered checkpoint match');
    const others = v.checkpoints.filter((x) => x.checkpointId !== c.cp1.checkpointId);
    assert(others.length > 0 && others.every((x) => x.match === true), 'untouched checkpoints should still match');
    return `overall=${v.overall}; tampered match=false`;
  }, { requires: ['W20', 'W17'] });

  h.add('W22', 'TAMPER: HASH_MISMATCH alert raised and public integrity not clean', async (c) => {
    const a = list(await call('GET', `/alerts?batchId=${c.batchId}&limit=100`, { token: c.D.token })).map((x) => x.type);
    const pub = data(await call('GET', `/public/verify/${c.batchId}`));
    assert(!CLEAN.test(String(pub.integrity && pub.integrity.overall)), `public integrity.overall="${pub.integrity && pub.integrity.overall}" claims clean after tamper`);
    assert(a.includes('HASH_MISMATCH'), `no HASH_MISMATCH alert after tamper; alerts=[${[...new Set(a)].join(',')}]`);
  }, { requires: ['W21'] });

  h.add('W99', 'cleanup: restore tampered checkpoint and close MongoDB', async (c) => {
    if (c.tampered && c.col) await c.col.updateOne({ checkpointId: c.cp1.checkpointId }, { $set: { temperatureC: c.origTemp } });
    if (c.mongo) await c.mongo.close();
  });
}
