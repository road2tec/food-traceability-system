'use strict';
const H = require('./helpers');

let ctx;
beforeAll(async () => { ctx = await H.setup(); });
afterAll(() => H.teardown(ctx));

const reg = (over = {}) => ({ name: 'New Person', email: 'new@example.test', password: 'GoodPassw0rd1', role: 'PRODUCER', organisation: { name: 'New Farm', type: 'PRODUCER' }, ...over });

describe('auth', () => {
  test('register creates PENDING user and login is refused until approved', async () => {
    const r = await ctx.agent.post('/api/v1/auth/register').send(reg());
    expect(r.status).toBe(201);
    expect(r.body.data.status).toBe('PENDING');
    expect(JSON.stringify(r.body)).not.toMatch(/passwordHash/);
    const l = await ctx.agent.post('/api/v1/auth/login').send({ email: 'new@example.test', password: 'GoodPassw0rd1' });
    expect(l.status).toBe(403);
    expect(l.body.error.code).toBe('FORBIDDEN');
  });
  test('ADMIN approval lets the user log in; token carries expiry', async () => {
    const admin = await H.actor(ctx.agent, 'ADMIN', 'Admin Org');
    const users = await ctx.agent.get('/api/v1/users').set(admin.auth);
    const u = users.body.data.find((x) => x.email === 'new@example.test');
    const p = await ctx.agent.patch(`/api/v1/users/${u.id}/status`).set(admin.auth).send({ status: 'ACTIVE' });
    expect(p.status).toBe(200);
    const l = await ctx.agent.post('/api/v1/auth/login').send({ email: 'new@example.test', password: 'GoodPassw0rd1' });
    expect(l.status).toBe(200);
    const payload = JSON.parse(Buffer.from(l.body.data.token.split('.')[1], 'base64url').toString());
    expect(payload.exp).toBeGreaterThan(payload.iat);
    const me = await ctx.agent.get('/api/v1/auth/me').set('Authorization', `Bearer ${l.body.data.token}`);
    expect(me.body.data.email).toBe('new@example.test');
  });
  test('wrong password and unknown email give identical generic errors', async () => {
    const a = await ctx.agent.post('/api/v1/auth/login').send({ email: 'new@example.test', password: 'WrongPassw0rd1' });
    const b = await ctx.agent.post('/api/v1/auth/login').send({ email: 'nobody@example.test', password: 'WrongPassw0rd1' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });
  test('self-registering as ADMIN, weak password, role/org mismatch, extra fields are rejected', async () => {
    expect((await ctx.agent.post('/api/v1/auth/register').send(reg({ email: 'a@example.test', role: 'ADMIN' }))).status).toBe(400);
    expect((await ctx.agent.post('/api/v1/auth/register').send(reg({ email: 'b@example.test', password: 'short' }))).status).toBe(400);
    expect((await ctx.agent.post('/api/v1/auth/register').send(reg({ email: 'c@example.test', role: 'RETAILER' }))).status).toBe(400);
    expect((await ctx.agent.post('/api/v1/auth/register').send(reg({ email: 'd@example.test', status: 'ACTIVE' }))).status).toBe(400);
  });
  test('NoSQL operator injection in login is rejected by validation', async () => {
    const r = await ctx.agent.post('/api/v1/auth/login').send({ email: { $ne: '' }, password: { $ne: '' } });
    expect(r.status).toBe(400);
  });
  test('logout revokes the token', async () => {
    const u = await H.actor(ctx.agent, 'PRODUCER');
    expect((await ctx.agent.post('/api/v1/auth/logout').set(u.auth)).status).toBe(200);
    expect((await ctx.agent.get('/api/v1/auth/me').set(u.auth)).status).toBe(401);
  });
  test('suspended user token stops working immediately', async () => {
    const u = await H.actor(ctx.agent, 'PRODUCER');
    await H.M.User.updateOne({ _id: u.user._id }, { status: 'SUSPENDED' });
    expect((await ctx.agent.get('/api/v1/auth/me').set(u.auth)).status).toBe(401);
  });
  test('invalid / missing tokens -> 401 envelope', async () => {
    const r = await ctx.agent.get('/api/v1/batches').set('Authorization', 'Bearer garbage');
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ success: false, error: { code: 'UNAUTHENTICATED', message: expect.any(String) } });
    expect((await ctx.agent.get('/api/v1/batches')).status).toBe(401);
  });
});

describe('permissions and errors', () => {
  test('non-admin cannot reach admin endpoints', async () => {
    const u = await H.actor(ctx.agent, 'PRODUCER');
    for (const p of ['/users', '/admin/thresholds', '/admin/audit-logs', '/admin/models', '/admin/reports/export?type=batches']) {
      const r = await ctx.agent.get('/api/v1' + p).set(u.auth);
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('FORBIDDEN');
    }
    expect((await ctx.agent.post('/api/v1/product-types').set(u.auth).send({})).status).toBe(403);
  });
  test('only PRODUCER can create batches; organisation list shows public fields only', async () => {
    const d = await H.actor(ctx.agent, 'DISTRIBUTOR');
    const pt = await H.productType();
    const r = await ctx.agent.post('/api/v1/batches').set(d.auth).send({ productTypeId: String(pt._id), productName: 'x', quantity: 1, unit: 'kg', origin: 'o', harvestDate: new Date().toISOString() });
    expect(r.status).toBe(403);
    const orgs = await ctx.agent.get('/api/v1/organisations').set(d.auth);
    expect(orgs.status).toBe(200);
    for (const o of orgs.body.data) {
      expect(o.address).toBeUndefined();
      expect(o.mspId).toBeUndefined();
      expect(o.status).toBeUndefined();
    }
  });
  test('errors never leak internals; unknown route is JSON 404; malformed JSON is 400', async () => {
    const u0 = await H.actor(ctx.agent, 'PRODUCER');
    const a = await ctx.agent.get('/api/v1/nope').set(u0.auth);
    expect(a.status).toBe(404);
    expect(a.body.error.code).toBe('NOT_FOUND');
    const b = await ctx.agent.post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{bad');
    expect(b.status).toBe(400);
    expect(b.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(b.body)).not.toMatch(/stack|node_modules/);
    const u = await H.actor(ctx.agent, 'PRODUCER');
    expect((await ctx.agent.get('/api/v1/batches/not-an-id').set(u.auth)).status).toBe(400);
  });
  test('rate limiter on auth returns RATE_LIMITED', async () => {
    const { createApp } = require('../src/app');
    const request = require('supertest');
    const a = request(createApp({ rateLimit: { max: 1000, authMax: 3 } }));
    let last;
    for (let i = 0; i < 5; i++) last = await a.post('/api/v1/auth/login').send({ email: 'x@example.test', password: 'whatever12' });
    expect(last.status).toBe(429);
    expect(last.body.error.code).toBe('RATE_LIMITED');
  });
  test('health and api-docs respond; security headers present', async () => {
    const h = await ctx.agent.get('/api/v1/health');
    expect(h.status).toBe(200);
    expect(h.body.data).toMatchObject({ server: 'UP', mongo: 'UP', ai: 'UP', fabric: { status: 'NOT_CONFIGURED' } });
    expect(h.headers['x-content-type-options']).toBe('nosniff');
    expect((await ctx.agent.get('/api-docs/')).status).toBe(200);
  });
});
