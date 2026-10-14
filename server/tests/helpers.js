'use strict';
require('./env');
require('./globals');
const http = require('http');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { connectDb, mongoose } = require('../src/config/db');
const { createApp } = require('../src/app');
const M = require('../src/models');

/** Local HTTP stub standing in for the Python AI service (tests only). */
function startAiStub() {
  const state = { score: 80, remaining: 100, fail: false, predictCalls: 0, lastPredict: null };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (state.fail) return send(500, { detail: 'boom' });
      if (req.url === '/health') return send(200, { status: 'ok' });
      if (req.url === '/models') return send(200, { models: [{ version: 'stub-1', type: 'ARRHENIUS_BASELINE' }] });
      if (req.url === '/predict') {
        state.predictCalls++; state.lastPredict = JSON.parse(body);
        return send(200, {
          batchId: state.lastPredict.batchId, freshnessScore: state.score, remainingShelfLifeHours: state.remaining, qualityLossPct: 100 - state.score,
          riskCategory: 'LOW', modelVersion: 'stub-1', modelType: 'ARRHENIUS_BASELINE', demonstrationMode: true, predictedAt: new Date().toISOString(),
          uncertainty: null, warnings: [], factors: [], effectiveAgeHours: 1, hoursAboveReferenceTemp: 0,
        });
      }
      if (req.url === '/simulate') {
        const b = JSON.parse(body);
        const t0 = new Date(b.startTime).getTime();
        const records = [];
        for (let i = 0; i < b.count; i++) {
          const r = { timestamp: new Date(t0 + i * 60000).toISOString(), temperatureC: 5, humidityPct: 90, location: 'Sim', eventType: 'TRANSIT', remarks: '', simulated: true };
          if (b.scenario === 'INVALID_READINGS' && i === 0) r.temperatureC = 999;
          if (b.scenario === 'MISSING_READINGS' && i === 1) r.temperatureC = null;
          records.push(r);
        }
        return send(200, { records });
      }
      return send(404, {});
    });
  });
  return new Promise((resolve) => server.listen(18001, '127.0.0.1', () => resolve({ server, state })));
}

async function setup() {
  await connectDb();
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(M).filter((m) => m && m.init).map((m) => m.init()));
  const ai = await startAiStub();
  const app = createApp();
  return { app, ai, agent: request(app) };
}
async function teardown(ctx) {
  await new Promise((r) => ctx.ai.server.close(r));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

let seq = 0;
async function makeUser(role, orgName, { status = 'ACTIVE', org } = {}) {
  seq++;
  const name = orgName || `${role} Org ${seq}`;
  const o = org || (await M.Organisation.create({ name, nameLower: name.toLowerCase(), type: role, publicName: name, status: 'ACTIVE' }));
  const password = `Passw0rdTest!${seq}`;
  const user = await M.User.create({ name: `${role} ${seq}`, email: `${role.toLowerCase()}${seq}@example.test`, role, organisation: o._id, status, passwordHash: await bcrypt.hash(password, 4) });
  return { user, org: o, password };
}
async function login(agent, u) {
  const r = await agent.post('/api/v1/auth/login').send({ email: u.user.email, password: u.password });
  if (r.status !== 200) throw new Error('login failed ' + JSON.stringify(r.body));
  return { ...u, token: r.body.data.token, auth: { Authorization: `Bearer ${r.body.data.token}` } };
}
const actor = async (agent, role, name) => login(agent, await makeUser(role, name));

async function productType(over = {}) {
  return M.ProductType.create({
    name: `Test Banana ${++seq}`, category: 'FRUIT', referenceTempC: 13, referenceShelfLifeHours: 240, activationEnergyJPerMol: 60000,
    tempRange: { min: 11, max: 16 }, humidityRange: { min: 80, max: 95 }, sourceNote: 'test', isDemonstration: true, ...over,
  });
}
async function newBatch(agent, producer, pt) {
  const r = await agent.post('/api/v1/batches').set(producer.auth).send({
    productTypeId: String(pt._id), productName: 'Bananas', quantity: 100, unit: 'kg', origin: 'Test Farm', harvestDate: new Date(Date.now() - 5 * 86400e3).toISOString(),
  });
  if (r.status !== 201) throw new Error('batch create failed ' + JSON.stringify(r.body));
  return r.body.data;
}
const cpBody = (over = {}) => ({ eventType: 'STORAGE', temperatureC: 13, humidityPct: 88, location: 'Warehouse A', eventTimestamp: new Date(Date.now() - 3600e3).toISOString(), remarks: 'ok', ...over });

module.exports = { setup, teardown, makeUser, login, actor, productType, newBatch, cpBody, M };
