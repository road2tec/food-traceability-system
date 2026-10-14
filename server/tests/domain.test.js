'use strict';
const H = require('./helpers');
const { checkpointHash, canonicalize, sha256 } = require('../src/utils/hash');

let ctx; let pt; let producer; let dist; let other; let admin; let batch;
const api = (p) => `/api/v1${p}`;

beforeAll(async () => {
  ctx = await H.setup();
  pt = await H.productType();
  producer = await H.actor(ctx.agent, 'PRODUCER', 'Farm One');
  dist = await H.actor(ctx.agent, 'DISTRIBUTOR', 'Dist One');
  other = await H.actor(ctx.agent, 'PRODUCER', 'Farm Two');
  admin = await H.actor(ctx.agent, 'ADMIN', 'Admin Org');
  batch = await H.newBatch(ctx.agent, producer, pt);
});
afterAll(() => H.teardown(ctx));

const post = (u, path, body) => ctx.agent.post(api(path)).set(u.auth).send(body);
const get = (u, path) => ctx.agent.get(api(path)).set(u.auth);
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();

describe('batches', () => {
  test('creation: id format, server-controlled org/status, QR PNG encodes public URL', async () => {
    expect(batch.batchId).toMatch(/^FT-\d{8}-[A-Z0-9]{6}$/);
    expect(batch.status).toBe('PENDING_REVIEW');
    expect(String(batch.producerOrg)).toBe(String(producer.org._id));
    const r = await post(producer, '/batches', { productTypeId: String(pt._id), productName: 'x', quantity: 1, unit: 'kg', origin: 'o', harvestDate: ago(10), producerOrg: String(other.org._id), status: 'SAFE' });
    expect(r.status).toBe(400); // unknown fields rejected
    const qr = await ctx.agent.get(api(`/batches/${batch.batchId}/qr`)).buffer(true).parse((res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(qr.status).toBe(200);
    expect(qr.headers['content-type']).toBe('image/png');
    expect(qr.body.subarray(1, 4).toString()).toBe('PNG');
  });
  test('ids are unique across many creations', async () => {
    const ids = new Set();
    for (let i = 0; i < 5; i++) ids.add((await H.newBatch(ctx.agent, producer, pt)).batchId);
    expect(ids.size).toBe(5);
  });
});

describe('organisation isolation', () => {
  test('other organisation cannot see, list, read checkpoints, predictions, series or alerts of the batch', async () => {
    expect((await get(other, `/batches/${batch.batchId}`)).status).toBe(404);
    expect((await get(other, `/batches/${batch.batchId}/checkpoints`)).status).toBe(404);
    expect((await get(other, `/batches/${batch.batchId}/prediction`)).status).toBe(404);
    expect((await get(other, `/analytics/batch/${batch.batchId}/series`)).status).toBe(404);
    expect((await post(other, `/batches/${batch.batchId}/verify`, {})).status).toBe(404);
    const list = await get(other, '/batches');
    expect(list.body.data.find((b) => b.batchId === batch.batchId)).toBeUndefined();
    const adminList = await get(admin, '/batches');
    expect(adminList.body.data.find((b) => b.batchId === batch.batchId)).toBeDefined();
    const sum = await get(other, '/analytics/summary');
    expect(sum.body.data.batches).toBe(0);
  });
  test('private fields (price, internalNotes) hidden from non-producer parties', async () => {
    const b = await H.newBatch(ctx.agent, producer, pt);
    await ctx.agent.patch(api(`/batches/${b.batchId}`)).set(producer.auth).send({ price: 9.5, internalNotes: 'secret' });
    const mine = await get(producer, `/batches/${b.batchId}`);
    expect(mine.body.data.internalNotes).toBe('secret');
    await post(producer, `/batches/${b.batchId}/transfers`, { toOrganisationId: String(dist.org._id) });
    const theirs = await get(dist, `/batches/${b.batchId}`);
    expect(theirs.status).toBe(200);
    expect(theirs.body.data.internalNotes).toBeUndefined();
    expect(theirs.body.data.price).toBeUndefined();
  });
});

describe('checkpoints', () => {
  test('valid checkpoint: stores eventTimestamp and receivedAt separately, SHA-256 per contract, runs prediction', async () => {
    const r = await post(producer, `/batches/${batch.batchId}/checkpoints`, H.cpBody({ eventTimestamp: ago(5) }));
    expect(r.status).toBe(201);
    const cp = r.body.data.checkpoint;
    expect(cp.eventTimestamp).not.toBe(cp.receivedAt);
    expect(cp.sourceType).toBe('MANUAL');
    const doc = await H.M.Checkpoint.findOne({ checkpointId: cp.checkpointId });
    expect(cp.hash).toBe(checkpointHash(doc));
    expect(cp.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(r.body.data.predictionStatus).toBe('OK');
    expect(ctx.ai.state.lastPredict.params.referenceShelfLifeHours).toBe(240); // ProductType params passed to AI
    expect(r.body.data.batchStatus).toBe('SAFE');
  });
  test('canonical hashing is key-order independent and deterministic', () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } })).toBe('{"a":{"c":[3,{"y":2,"z":1}],"d":2},"b":1}');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  test('rejects future timestamp, out-of-range values, bad event type, missing readings, and client-supplied sourceType', async () => {
    const url = `/batches/${batch.batchId}/checkpoints`;
    const cases = [
      H.cpBody({ eventTimestamp: new Date(Date.now() + 3600e3).toISOString() }),
      H.cpBody({ temperatureC: 500 }), H.cpBody({ humidityPct: 150 }), H.cpBody({ humidityPct: -1 }),
      H.cpBody({ eventType: 'NOPE' }), H.cpBody({ temperatureC: undefined }), H.cpBody({ temperatureC: 'abc' }), H.cpBody({ eventTimestamp: 'garbage' }),
    ];
    for (const c of cases) {
      const r = await post(producer, url, c);
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect((await post(producer, url, { ...H.cpBody(), sourceType: 'SIMULATOR' })).status).toBe(400);
  });
  test('rejects non-chronological and duplicate checkpoints', async () => {
    const url = `/batches/${batch.batchId}/checkpoints`;
    const ts = ago(2);
    expect((await post(producer, url, H.cpBody({ eventTimestamp: ts }))).status).toBe(201);
    const early = await post(producer, url, H.cpBody({ eventTimestamp: ago(4) }));
    expect(early.status).toBe(400);
    expect(JSON.stringify(early.body.error.details)).toMatch(/chronological/);
    const dup = await post(producer, url, H.cpBody({ eventTimestamp: ts }));
    expect([400, 409]).toContain(dup.status);
  });
  test('only the current custodian may record; distributor and admin cannot', async () => {
    expect((await post(dist, `/batches/${batch.batchId}/checkpoints`, H.cpBody())).status).toBe(404); // no access at all
    expect((await post(other, `/batches/${batch.batchId}/checkpoints`, H.cpBody())).status).toBe(404);
    expect((await post(admin, `/batches/${batch.batchId}/checkpoints`, H.cpBody())).status).toBe(403);
  });
  test('verify: untouched data VERIFIED; tampering in MongoDB is detected -> MISMATCH, alert, PENDING_REVIEW', async () => {
    const b = await H.newBatch(ctx.agent, producer, pt);
    await post(producer, `/batches/${b.batchId}/checkpoints`, H.cpBody({ eventTimestamp: ago(3) }));
    const ok = await post(producer, `/batches/${b.batchId}/verify`, {});
    expect(ok.body.data.overall).toBe('VERIFIED');
    expect(ok.body.data.checkpoints[0].match).toBe(true);
    await H.M.Checkpoint.collection.updateOne({ batchId: b.batchId }, { $set: { temperatureC: 2 } }); // tamper, bypassing mongoose immutability
    const bad = await post(producer, `/batches/${b.batchId}/verify`, {});
    expect(bad.body.data.overall).toBe('MISMATCH');
    expect(bad.body.data.checkpoints[0].match).toBe(false);
    const alerts = await get(producer, `/alerts?batchId=${b.batchId}&type=HASH_MISMATCH`);
    expect(alerts.body.data.length).toBe(1);
    expect((await get(producer, `/batches/${b.batchId}`)).body.data.status).toBe('PENDING_REVIEW');
    await post(producer, `/batches/${b.batchId}/verify`, {}); // repeat: no alert storm
    expect((await get(producer, `/alerts?batchId=${b.batchId}&type=HASH_MISMATCH`)).body.data.length).toBe(1);
    const audit = await get(admin, '/admin/audit-logs?action=BATCH_VERIFIED');
    expect(audit.body.data.length).toBeGreaterThanOrEqual(3);
  });
});

describe('predictions, quality rules, alerts', () => {
  test('AI failure -> PENDING_REVIEW + single deduped PREDICTION_FAILURE alert; checkpoint still stored', async () => {
    const b = await H.newBatch(ctx.agent, producer, pt);
    ctx.ai.state.fail = true;
    try {
      const r1 = await post(producer, `/batches/${b.batchId}/checkpoints`, H.cpBody({ eventTimestamp: ago(3) }));
      expect(r1.status).toBe(201);
      expect(r1.body.data.predictionStatus).toBe('FAILED');
      expect(r1.body.data.batchStatus).toBe('PENDING_REVIEW');
      await post(producer, `/batches/${b.batchId}/checkpoints`, H.cpBody({ eventTimestamp: ago(2) }));
      const rc = await post(producer, `/batches/${b.batchId}/prediction/recalculate`, {});
      expect(rc.status).toBe(503);
      expect(rc.body.error.code).toBe('UPSTREAM_UNAVAILABLE');
      const al = await get(producer, `/alerts?batchId=${b.batchId}&type=PREDICTION_FAILURE`);
      expect(al.body.data.length).toBe(1);
      expect(al.body.data[0].occurrences).toBeGreaterThanOrEqual(3);
    } finally { ctx.ai.state.fail = false; }
    const ok = await post(producer, `/batches/${b.batchId}/prediction/recalculate`, {});
    expect(ok.status).toBe(200);
    expect((await get(producer, `/batches/${b.batchId}`)).body.data.status).toBe('SAFE');
  });
  test('score thresholds: >60 SAFE, 40..60 FLAGGED, <40 QUARANTINED; excursion check forces FLAGGED', async () => {
    const run = async (score, cpOver = {}) => {
      ctx.ai.state.score = score;
      const b = await H.newBatch(ctx.agent, producer, pt);
      const r = await post(producer, `/batches/${b.batchId}/checkpoints`, H.cpBody({ eventTimestamp: ago(3), ...cpOver }));
      return r.body.data.batchStatus;
    };
    expect(await run(61)).toBe('SAFE');
    expect(await run(60)).toBe('FLAGGED');
    expect(await run(40)).toBe('FLAGGED');
    expect(await run(39.9)).toBe('QUARANTINED');
    expect(await run(90, { temperatureC: 30 })).toBe('FLAGGED'); // outside ProductType tempRange
    ctx.ai.state.score = 80;
  });
  test('thresholds are configurable (admin) and per ProductType overrides', async () => {
    const bad = await ctx.agent.put(api('/admin/thresholds')).set(admin.auth).send({ safeAbove: 30, flagAbove: 50 });
    expect(bad.status).toBe(400);
    expect((await ctx.agent.put(api('/admin/thresholds')).set(admin.auth).send({ safeAbove: 90, flagAbove: 70 })).status).toBe(200);
    ctx.ai.state.score = 80;
    const b = await H.newBatch(ctx.agent, producer, pt);
    expect((await post(producer, `/batches/${b.batchId}/checkpoints`, H.cpBody({ eventTimestamp: ago(3) }))).body.data.batchStatus).toBe('FLAGGED');
    const pt2 = await H.productType({ qualityThresholds: { safeAbove: 50, flagAbove: 20 } });
    const b2 = await H.newBatch(ctx.agent, producer, pt2);
    expect((await post(producer, `/batches/${b2.batchId}/checkpoints`, H.cpBody({ eventTimestamp: ago(3) }))).body.data.batchStatus).toBe('SAFE');
    await ctx.agent.put(api('/admin/thresholds')).set(admin.auth).send({ safeAbove: 60, flagAbove: 40 });
  });
  test('alert dedupe: repeated excursions -> one open alert; acknowledging allows a new one', async () => {
    ctx.ai.state.score = 80;
    const b = await H.newBatch(ctx.agent, producer, pt);
    for (let i = 4; i >= 1; i--) await post(producer, `/batches/${b.batchId}/checkpoints`, H.cpBody({ eventTimestamp: ago(i), temperatureC: 25 }));
    let al = await get(producer, `/alerts?batchId=${b.batchId}&type=TEMP_EXCURSION`);
    expect(al.body.data.length).toBe(1);
    expect(al.body.data[0].occurrences).toBe(4);
    expect((await ctx.agent.patch(api(`/alerts/${al.body.data[0]._id}`)).set(producer.auth).send({ acknowledged: true })).status).toBe(200);
    expect((await ctx.agent.patch(api(`/alerts/${al.body.data[0]._id}`)).set(other.auth).send({ acknowledged: true })).status).toBe(404);
    await post(producer, `/batches/${b.batchId}/checkpoints`, H.cpBody({ eventTimestamp: ago(0.5), temperatureC: 25 }));
    al = await get(producer, `/alerts?batchId=${b.batchId}&type=TEMP_EXCURSION`);
    expect(al.body.data.length).toBe(2);
    expect((await get(other, `/alerts?batchId=${b.batchId}`)).body.data.length).toBe(0);
  });
});

describe('quarantine release', () => {
  let qb;
  beforeAll(async () => {
    ctx.ai.state.score = 10;
    qb = await H.newBatch(ctx.agent, producer, pt);
    await post(producer, `/batches/${qb.batchId}/checkpoints`, H.cpBody({ eventTimestamp: ago(6) }));
    ctx.ai.state.score = 80;
  });
  test('batch is quarantined, and later good predictions do NOT auto-release', async () => {
    expect((await get(producer, `/batches/${qb.batchId}`)).body.data.status).toBe('QUARANTINED');
    await post(producer, `/batches/${qb.batchId}/checkpoints`, H.cpBody({ eventTimestamp: ago(5) }));
    await post(producer, `/batches/${qb.batchId}/prediction/recalculate`, {});
    expect((await get(producer, `/batches/${qb.batchId}`)).body.data.status).toBe('QUARANTINED');
  });
  test('only ADMIN may release; reason required; non-quarantined batch refused; audit written', async () => {
    const url = `/batches/${qb.batchId}/quarantine-release`;
    expect((await post(producer, url, { reason: 'I own this batch, release please' })).status).toBe(403);
    expect((await post(admin, url, {})).status).toBe(400);
    expect((await post(admin, url, { reason: 'short' })).status).toBe(400);
    const r = await post(admin, url, { reason: 'Re-inspected on site, lab result acceptable' });
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('FLAGGED');
    expect(r.body.data.quarantineRelease.reason).toMatch(/Re-inspected/);
    expect((await post(admin, url, { reason: 'Second attempt after release' })).status).toBe(409);
    const logs = await get(admin, `/admin/audit-logs?action=QUARANTINE_RELEASED&entityId=${qb.batchId}`);
    expect(logs.body.data.length).toBe(1);
    expect(logs.body.data[0].details.reason).toMatch(/Re-inspected/);
  });
  test('after an admin release, a low score does not silently re-quarantine', async () => {
    ctx.ai.state.score = 5;
    await post(producer, `/batches/${qb.batchId}/checkpoints`, H.cpBody({ eventTimestamp: ago(1) }));
    ctx.ai.state.score = 80;
    expect((await get(producer, `/batches/${qb.batchId}`)).body.data.status).toBe('FLAGGED');
  });
});

describe('custody transfers', () => {
  let tb; let wh; let tid;
  beforeAll(async () => {
    tb = await H.newBatch(ctx.agent, producer, pt);
    wh = await H.actor(ctx.agent, 'WAREHOUSE', 'Cold Store');
  });
  test('only the current custodian proposes; strangers and the target before proposal cannot', async () => {
    const body = { toOrganisationId: String(dist.org._id) };
    expect((await post(other, `/batches/${tb.batchId}/transfers`, body)).status).toBe(404);
    expect((await post(dist, `/batches/${tb.batchId}/transfers`, body)).status).toBe(404);
    expect((await post(admin, `/batches/${tb.batchId}/transfers`, body)).status).toBe(403);
    expect((await post(producer, `/batches/${tb.batchId}/transfers`, { toOrganisationId: String(producer.org._id) })).status).toBe(400);
    const r = await post(producer, `/batches/${tb.batchId}/transfers`, body);
    expect(r.status).toBe(201);
    tid = r.body.data._id;
    expect((await post(producer, `/batches/${tb.batchId}/transfers`, { toOrganisationId: String(wh.org._id) })).status).toBe(409); // already pending
  });
  test('only the target organisation can accept/reject; proposer cannot self-accept; third parties get 404', async () => {
    expect((await post(producer, `/transfers/${tid}/accept`, {})).status).toBe(403);
    expect((await post(wh, `/transfers/${tid}/accept`, {})).status).toBe(404);
    expect((await post(other, `/transfers/${tid}/reject`, { reason: 'not mine' })).status).toBe(404);
    expect((await post(producer, `/transfers/${tid}/reject`, { reason: 'self reject' })).status).toBe(403);
    expect((await post(dist, `/transfers/${tid}/reject`, {})).status).toBe(400); // reason required
    expect((await get(dist, '/transfers?state=PROPOSED')).body.data.some((t) => t._id === tid)).toBe(true);
  });
  test('custody is enforced on checkpoints before/after acceptance; batch is frozen for editing', async () => {
    expect((await post(dist, `/batches/${tb.batchId}/checkpoints`, H.cpBody())).status).toBe(403); // can see (party) but not custodian yet
    const acc = await post(dist, `/transfers/${tid}/accept`, {});
    expect(acc.status).toBe(200);
    expect(acc.body.data.state).toBe('ACCEPTED');
    expect((await post(dist, `/transfers/${tid}/accept`, {})).status).toBe(409);
    expect((await post(producer, `/batches/${tb.batchId}/checkpoints`, H.cpBody({ eventTimestamp: ago(3) }))).status).toBe(403);
    const ok = await post(dist, `/batches/${tb.batchId}/checkpoints`, H.cpBody({ eventType: 'RECEIPT', eventTimestamp: ago(2) }));
    expect(ok.status).toBe(201);
    expect(String(ok.body.data.checkpoint.organisation)).toBe(String(dist.org._id));
    expect((await ctx.agent.patch(api(`/batches/${tb.batchId}`)).set(producer.auth).send({ quantity: 1 })).status).toBe(409);
    expect((await post(producer, `/batches/${tb.batchId}/transfers`, { toOrganisationId: String(wh.org._id) })).status).toBe(403);
  });
  test('rejection records reason and keeps custody', async () => {
    const b = await H.newBatch(ctx.agent, producer, pt);
    const t = await post(producer, `/batches/${b.batchId}/transfers`, { toOrganisationId: String(wh.org._id) });
    const rej = await post(wh, `/transfers/${t.body.data._id}/reject`, { reason: 'No capacity' });
    expect(rej.body.data.state).toBe('REJECTED');
    expect(rej.body.data.reason).toBe('No capacity');
    expect(String((await get(producer, `/batches/${b.batchId}`)).body.data.currentCustodianOrg._id)).toBe(String(producer.org._id));
  });
});

describe('imports', () => {
  let ib;
  const upload = (u, path, content, name) => ctx.agent.post(api(path)).set(u.auth).attach('file', Buffer.from(content), name);
  beforeAll(async () => { ib = await H.newBatch(ctx.agent, producer, pt); });

  test('CSV preview reports per-row errors and honest counts; commit stores only valid rows', async () => {
    const csv = [
      'timestamp,temperature_c,humidity_pct,location,event_type,remarks',
      `${ago(10)},12.5,85,Farm,PRODUCTION,ok`,
      `${ago(9)},13,86,Truck,TRANSIT,ok`,
      `${ago(8)},999,86,Truck,TRANSIT,bad temp`,
      `${ago(7)},13,86,Truck,BOGUS,bad type`,
      `${new Date(Date.now() + 86400e3).toISOString()},13,86,Truck,TRANSIT,future`,
      `${ago(9)},13,86,Truck,TRANSIT,duplicate of row 3`,
      `${ago(6)},,86,Truck,TRANSIT,missing temp`,
      `${ago(5)},4,90,Store,STORAGE,=cmd|' /C calc'!A0`,
    ].join('\n');
    const pv = await upload(producer, `/batches/${ib.batchId}/imports/preview`, csv, 'data.csv');
    expect(pv.status).toBe(201);
    const d = pv.body.data;
    expect(d.total).toBe(8);
    expect(d.valid).toBe(3);
    expect(d.rejected).toBe(5);
    expect(d.rows.length).toBe(8); // nothing silently dropped
    expect(d.rows.filter((r) => r.errors.length).every((r) => r.row >= 4)).toBe(true);
    expect(await H.M.Checkpoint.countDocuments({ batchId: ib.batchId })).toBe(0); // preview stores nothing
    const cm = await ctx.agent.post(api(`/imports/${d.importId}/commit`)).set(producer.auth);
    expect(cm.status).toBe(200);
    expect(cm.body.data).toMatchObject({ total: 8, committed: 3, rejected: 5 });
    const stored = await H.M.Checkpoint.find({ batchId: ib.batchId });
    expect(stored.length).toBe(3);
    expect(stored.every((c) => c.sourceType === 'CSV_IMPORT' && c.importId === d.importId)).toBe(true);
    expect((await ctx.agent.post(api(`/imports/${d.importId}/commit`)).set(producer.auth)).status).toBe(409); // not twice
    expect((await post((await H.actor(ctx.agent, 'PRODUCER')), `/imports/${d.importId}/commit`, {})).status).toBe(404); // other org
    expect((await get(producer, `/imports/${d.importId}`)).body.data.state).toBe('COMMITTED');
    expect((await get(producer, `/batches/${ib.batchId}`)).body.data.latestPrediction).toBeTruthy();
  });
  test('JSON import accepts camelCase and snake_case, rejects non-array and non-object rows', async () => {
    const b = await H.newBatch(ctx.agent, producer, pt);
    const rows = [{ timestamp: ago(4), temperatureC: 5, humidityPct: 90, eventType: 'STORAGE' }, { timestamp: ago(3), temperature_c: 6, humidity_pct: 91, event_type: 'STORAGE' }, 'junk'];
    const pv = await upload(producer, `/batches/${b.batchId}/imports/preview`, JSON.stringify(rows), 'd.json');
    expect(pv.body.data).toMatchObject({ total: 3, valid: 2, rejected: 1 });
    expect((await upload(producer, `/batches/${b.batchId}/imports/preview`, '{"a":1}', 'd.json')).status).toBe(400);
    expect((await upload(producer, `/batches/${b.batchId}/imports/preview`, 'not,csv\n', 'd.txt')).status).toBe(400);
  });
  test('non-custodian cannot import', async () => {
    expect((await upload(other, `/batches/${ib.batchId}/imports/preview`, 'timestamp\n', 'd.csv')).status).toBe(404);
    expect((await upload(dist, `/batches/${ib.batchId}/imports/preview`, 'timestamp\n', 'd.csv')).status).toBe(404);
  });
});

describe('simulator', () => {
  test('simulated readings flow through the same pipeline with sourceType SIMULATOR; bad ones reported not dropped', async () => {
    const b = await H.newBatch(ctx.agent, producer, pt);
    const r = await post(producer, '/simulate', { batchId: b.batchId, scenario: 'INVALID_READINGS', count: 5, seed: 1 });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ requested: 5, committed: 4, rejected: 1 });
    expect(r.body.data.rejectedRows[0].errors.join()).toMatch(/temperatureC/);
    const cps = await H.M.Checkpoint.find({ batchId: b.batchId });
    expect(cps.length).toBe(4);
    expect(cps.every((c) => c.sourceType === 'SIMULATOR' && checkpointHash(c) === c.hash)).toBe(true);
    expect((await post(dist, '/simulate', { batchId: b.batchId, scenario: 'NORMAL', count: 2 })).status).toBe(404);
    const ret = await H.actor(ctx.agent, 'RETAILER');
    expect((await post(ret, '/simulate', { batchId: b.batchId, scenario: 'NORMAL', count: 2 })).status).toBe(403);
  });
});

describe('certificates and public verify', () => {
  let pb;
  beforeAll(async () => {
    pb = await H.newBatch(ctx.agent, producer, pt);
    await ctx.agent.patch(api(`/batches/${pb.batchId}`)).set(producer.auth).send({ price: 12, internalNotes: 'INTERNAL-SECRET' });
    await post(producer, `/batches/${pb.batchId}/checkpoints`, H.cpBody({ eventTimestamp: ago(3) }));
  });
  const pdf = Buffer.from('%PDF-1.4\n%test\n');
  test('certificate upload: whitelist by type and content, size limit, safe stored name', async () => {
    const up = (buf, name, type) => ctx.agent.post(api(`/batches/${pb.batchId}/certificates`)).set(producer.auth).attach('file', buf, { filename: name, contentType: type });
    expect((await up(Buffer.from('MZ evil'), 'x.exe', 'application/x-msdownload')).status).toBe(400);
    expect((await up(Buffer.from('<html>'), 'fake.pdf', 'application/pdf')).status).toBe(400); // magic bytes mismatch
    expect((await up(Buffer.alloc(6 * 1024 * 1024, 1), 'big.pdf', 'application/pdf')).status).toBe(400);
    const r = await up(pdf, '../../etc/passwd<>.pdf', 'application/pdf');
    expect(r.status).toBe(201);
    expect(r.body.data.filename).not.toMatch(/[\\/<>]/);
    const stored = await H.M.Certificate.findById(r.body.data._id).select('+storedPath');
    expect(stored.storedPath).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(r.body.data.approved).toBe(false);
    expect((await ctx.agent.post(api(`/batches/${pb.batchId}/certificates`)).set(other.auth).attach('file', pdf, { filename: 'a.pdf', contentType: 'application/pdf' })).status).toBe(404);
  });
  test('public verify exposes only whitelisted fields; unapproved certificates hidden; approved shown', async () => {
    let r = await ctx.agent.get(api(`/public/verify/${pb.batchId}`));
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(Object.keys(d).sort()).toEqual(['batch', 'certificates', 'disclaimer', 'freshness', 'integrity', 'timeline'].sort());
    expect(Object.keys(d.batch).sort()).toEqual(['batchId', 'productName', 'category', 'origin', 'producedAt', 'quantity', 'unit', 'status', 'lifecycle', 'lastUpdated'].sort());
    expect(Object.keys(d.timeline[0]).sort()).toEqual(['eventType', 'organisation', 'location', 'timestamp', 'temperatureC', 'humidityPct'].sort());
    expect(d.timeline[0].organisation).toBe('Farm One');
    expect(d.certificates).toEqual([]);
    expect(d.integrity.overall).toBe('VERIFIED');
    expect(d.freshness.disclaimer).toBeTruthy();
    const raw = JSON.stringify(r.body);
    for (const leak of ['INTERNAL-SECRET', '"price"', 'email', '@example.test', 'passwordHash', 'handler', 'storedPath', String(producer.user._id), 'internalNotes']) expect(raw).not.toContain(leak);
    const cert = await H.M.Certificate.findOne({ batchId: pb.batchId });
    expect((await ctx.agent.patch(api(`/batches/${pb.batchId}/certificates/${cert._id}`)).set(producer.auth).send({ approved: true })).status).toBe(403);
    expect((await ctx.agent.patch(api(`/batches/${pb.batchId}/certificates/${cert._id}`)).set(admin.auth).send({ approved: true })).status).toBe(200);
    r = await ctx.agent.get(api(`/public/verify/${pb.batchId}`));
    expect(r.body.data.certificates).toEqual([{ filename: expect.any(String), mimeType: 'application/pdf' }]);
  });
  test('public verify reports tampering and 404s unknown / malformed ids', async () => {
    await H.M.Checkpoint.collection.updateOne({ batchId: pb.batchId }, { $set: { humidityPct: 1 } });
    await H.M.Batch.updateOne({ batchId: pb.batchId }, { $unset: { integrity: 1 } });
    const r = await ctx.agent.get(api(`/public/verify/${pb.batchId}`));
    expect(r.body.data.integrity.overall).toBe('MISMATCH');
    expect((await ctx.agent.get(api('/public/verify/FT-20200101-AAAAAA'))).status).toBe(404);
    expect((await ctx.agent.get(api('/public/verify/bad'))).status).toBe(400);
  });
});

describe('analytics and admin export', () => {
  test('analytics are org-scoped and based on real data', async () => {
    const s = await get(producer, '/analytics/summary');
    expect(s.body.data.batches).toBeGreaterThan(5);
    const dist1 = await get(producer, '/analytics/status-distribution');
    expect(dist1.body.data.reduce((a, x) => a + x.count, 0)).toBe(s.body.data.batches);
    for (const p of ['freshness-distribution', 'shelf-life-distribution', 'checkpoint-activity', 'org-batch-counts', 'excursions']) {
      expect((await get(producer, `/analytics/${p}`)).status).toBe(200);
    }
    const idle = await H.actor(ctx.agent, 'RETAILER');
    expect((await get(idle, '/analytics/summary')).body.data).toMatchObject({ batches: 0, checkpoints: 0 });
    expect((await get(idle, '/analytics/excursions')).body.data).toEqual([]);
  });
  test('CSV export neutralises formula injection and is admin-only', async () => {
    const r = await ctx.agent.get(api('/admin/reports/export?type=checkpoints')).set(admin.auth);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/csv/);
    expect(r.text).not.toMatch(/(^|,)=cmd/);
    expect((await ctx.agent.get(api('/admin/reports/export?type=nope')).set(admin.auth)).status).toBe(400);
  });
  test('seeded-style product types: admin CRUD validates input', async () => {
    const bad = await post(admin, '/product-types', { name: 'X', category: 'FRUIT' });
    expect(bad.status).toBe(400);
    const good = await post(admin, '/product-types', { name: 'Pear (demo)', category: 'FRUIT', referenceTempC: 2, referenceShelfLifeHours: 500, activationEnergyJPerMol: 60000, sourceNote: 'demo values' });
    expect(good.status).toBe(201);
    expect(good.body.data.isDemonstration).toBe(true);
    expect((await post(admin, '/product-types', { name: 'Pear (demo)', category: 'FRUIT', referenceTempC: 2, referenceShelfLifeHours: 500, activationEnergyJPerMol: 60000, sourceNote: 'dup' })).status).toBe(409);
  });
});
