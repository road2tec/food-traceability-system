// Security steps S01..S08 (use the actors/batch created by the workflow steps).
import { assert } from '../lib/harness.mjs';
import { call, config, data, uniq } from '../lib/api.mjs';

const list = (r) => { const d = data(r); return Array.isArray(d) ? d : (d && (d.items || d.results || d.docs)) || []; };
const denied = (r, what) => assert(r.status === 403, `${what}: expected 403, got HTTP ${r.status} ${r.text.slice(0, 120)}`);

export function registerSecurity(h) {
  h.add('S01', 'no token -> 401 on protected endpoints', async (c) => {
    for (const [m, p] of [['GET', '/batches'], ['GET', '/auth/me'], ['GET', '/alerts'], ['GET', '/users'], ['POST', '/batches'], ['GET', `/batches/${c.batchId || 'FT-20000101-AAAAAA'}`], ['GET', '/admin/audit-logs']]) {
      const r = await call(m, p, { body: m === 'POST' ? {} : undefined });
      assert(r.status === 401, `${m} ${p} without token: expected 401, got ${r.status}`);
    }
  }, { requires: ['W01'] });

  h.add('S02', 'malformed / forged JWT -> 401', async (c) => {
    const bads = ['garbage', 'a.b.c', c.A && c.A.token ? c.A.token.slice(0, -4) + 'AAAA' : 'x.y.z'];
    for (const t of bads) { const r = await call('GET', '/auth/me', { token: t }); assert(r.status === 401, `token "${t.slice(0, 12)}...": expected 401, got ${r.status}`); }
  }, { requires: ['W01'] });

  h.add('S03', 'wrong role -> 403 (distributor creates batch; producer hits admin endpoints)', async (c) => {
    denied(await call('POST', '/batches', { token: c.D.token, body: { productName: 'x', quantity: 1, unit: 'kg' } }), 'DISTRIBUTOR POST /batches');
    denied(await call('GET', '/users', { token: c.A.token }), 'PRODUCER GET /users');
    denied(await call('PATCH', `/users/${c.B.id}/status`, { token: c.A.token, body: { status: 'SUSPENDED' } }), 'PRODUCER PATCH /users/:id/status');
    denied(await call('GET', '/admin/audit-logs', { token: c.D.token }), 'DISTRIBUTOR GET /admin/audit-logs');
    denied(await call('POST', `/batches/${c.batchId}/quarantine-release`, { token: c.A.token, body: { reason: 'nope' } }), 'PRODUCER quarantine-release');
    denied(await call('POST', '/product-types', { token: c.A.token, body: { name: 'x' } }), 'PRODUCER POST /product-types');
  }, { requires: ['W16'] });

  h.add('S04', 'cross-organisation access denied (unrelated producer B)', async (c) => {
    const g = await call('GET', `/batches/${c.batchId}`, { token: c.B.token });
    assert(g.status === 403 || g.status === 404, `B GET batch: expected 403/404, got ${g.status}`);
    const cps = await call('GET', `/batches/${c.batchId}/checkpoints`, { token: c.B.token });
    assert(cps.status === 403 || cps.status === 404, `B GET checkpoints: expected 403/404, got ${cps.status}`);
    const post = await call('POST', `/batches/${c.batchId}/checkpoints`, { token: c.B.token, body: { eventType: 'STORAGE', temperatureC: 4, humidityPct: 80, location: 'x', eventTimestamp: new Date().toISOString() } });
    assert(post.status === 403 || post.status === 404, `B POST checkpoint: expected 403/404, got ${post.status}`);
    const l = list(await call('GET', '/batches?limit=100', { token: c.B.token }));
    assert(!l.some((b) => b.batchId === c.batchId), 'B batch list leaks batch of another organisation');
    const tr = await call('POST', `/batches/${c.batchId}/transfers`, { token: c.B.token, body: { toOrganisationId: c.D.orgId, remarks: 'steal' } });
    assert(tr.status === 403 || tr.status === 404, `B propose transfer: expected 403/404, got ${tr.status}`);
  }, { requires: ['W16'] });

  h.add('S05', 'previous custodian (producer A) can no longer write checkpoints after handover', async (c) => {
    const r = await call('POST', `/batches/${c.batchId}/checkpoints`, { token: c.A.token, body: { eventType: 'STORAGE', temperatureC: 4, humidityPct: 80, location: 'x', eventTimestamp: new Date().toISOString() } });
    assert(r.status === 403, `expected 403 after custody transfer, got ${r.status}`);
  }, { requires: ['W16'] });

  h.add('S06', 'NoSQL-injection style login payload is rejected', async () => {
    const r = await call('POST', '/auth/login', { body: { email: { $gt: '' }, password: { $gt: '' } } });
    assert(r.status === 400 || r.status === 401 || r.status === 422, `expected 400/401/422, got ${r.status}`);
    assert(!(r.json && r.json.data && r.json.data.token), 'token issued for operator-injection payload');
  }, { requires: ['W01'] });

  h.add('S07', 'login errors do not reveal whether the email exists', async (c) => {
    const a = await call('POST', '/auth/login', { body: { email: c.A ? c.A.email : 'nobody@e2e.test', password: 'WrongPassword!1' } });
    const b = await call('POST', '/auth/login', { body: { email: `nobody.${uniq()}@e2e.test`, password: 'WrongPassword!1' } });
    assert(a.status === b.status, `status differs for known vs unknown email (${a.status} vs ${b.status}): user enumeration`);
    assert((a.json && a.json.error && a.json.error.message) === (b.json && b.json.error && b.json.error.message), 'error message differs for known vs unknown email');
  }, { requires: ['W05'] });

  // Must be last: it deliberately exhausts the login rate limiter for this client IP.
  h.add('S99', `rate limit on login (429 within ${config.rateLimitAttempts} bad attempts)`, async () => {
    let limited = null;
    for (let i = 1; i <= config.rateLimitAttempts; i++) {
      const r = await call('POST', '/auth/login', { body: { email: `ratelimit.${uniq()}@e2e.test`, password: 'WrongPassword!1' } });
      if (r.status === 429) { limited = i; assert(r.json && r.json.error && r.json.error.code === 'RATE_LIMITED', `429 but error.code=${r.json && r.json.error && r.json.error.code}`); break; }
    }
    assert(limited, `no 429 after ${config.rateLimitAttempts} failed logins (login endpoint is not rate limited, or limit is higher: set E2E_RATE_LIMIT_ATTEMPTS)`);
    return `429 after ${limited} attempts (note: login for this IP is throttled until the window resets)`;
  }, { requires: ['W01'] });
}
