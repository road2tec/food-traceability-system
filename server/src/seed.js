'use strict';
/**
 * npm run seed  -  idempotent. Creates admin + demo organisations/users + DEMONSTRATION product types.
 * Passwords come from SEED_ADMIN_PASSWORD / SEED_DEMO_PASSWORD or are randomly generated and printed once.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('./config');
const { connectDb, mongoose } = require('./config/db');
const { User, Organisation, ProductType, Threshold } = require('./models');

const NOTE = 'DEMONSTRATION VALUES ONLY: chosen to illustrate the Arrhenius kinetics model. Not taken from a cited study or standard; not a food-safety guideline. Replace with cited values before any real use.';
const PT = (name, category, refT, shelfH, ea, tmin, tmax, hmin, hmax) => ({
  name, category, referenceTempC: refT, referenceShelfLifeHours: shelfH, activationEnergyJPerMol: ea,
  tempRange: { min: tmin, max: tmax }, humidityRange: { min: hmin, max: hmax }, sourceNote: NOTE, isDemonstration: true,
});
const PRODUCT_TYPES = [
  PT('Banana (demo)', 'FRUIT', 13, 240, 60000, 11, 16, 85, 95),
  PT('Strawberry (demo)', 'FRUIT', 2, 120, 70000, 0, 5, 88, 95),
  PT('Apple (demo)', 'FRUIT', 1, 1200, 55000, -1, 4, 85, 95),
  PT('Spinach (demo)', 'VEGETABLE', 2, 168, 65000, 0, 5, 90, 98),
  PT('Tomato (demo)', 'VEGETABLE', 12, 288, 58000, 10, 15, 85, 95),
  PT('Carrot (demo)', 'VEGETABLE', 2, 720, 50000, 0, 4, 90, 98),
  PT('Milk (demo)', 'DAIRY', 4, 168, 80000, 1, 6, 60, 90),
  PT('Yogurt (demo)', 'DAIRY', 4, 504, 75000, 1, 6, 60, 90),
];

async function main() {
  await connectDb();
  const printed = [];
  const pw = (envVal, label) => { const v = envVal || crypto.randomBytes(9).toString('base64url') + 'a1'; if (!envVal) printed.push(label); return v; };
  const adminPw = pw(process.env.SEED_ADMIN_PASSWORD, 'admin');
  const demoPw = pw(process.env.SEED_DEMO_PASSWORD, 'demo');

  const ensureOrg = async (name, type, country) => Organisation.findOneAndUpdate(
    { nameLower: name.toLowerCase(), type }, { $setOnInsert: { name, nameLower: name.toLowerCase(), type, country, publicName: name, status: 'ACTIVE' } }, { upsert: true, returnDocument: 'after' });
  const ensureUser = async (name, email, role, org, password) => {
    const ex = await User.findOne({ email });
    if (ex) return { user: ex, created: false };
    return { user: await User.create({ name, email, role, organisation: org._id, status: 'ACTIVE', passwordHash: await bcrypt.hash(password, config.bcryptRounds) }), created: true };
  };

  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@example.test';
  const adminOrg = await ensureOrg('Platform Administration', 'ADMIN', 'N/A');
  const created = [];
  const accounts = [[`Administrator`, adminEmail, 'ADMIN', adminOrg, adminPw]];
  const demo = [
    ['Demo Farm Ltd', 'PRODUCER', 'producer@example.test'], ['Demo Logistics Ltd', 'DISTRIBUTOR', 'distributor@example.test'],
    ['Demo Cold Storage Ltd', 'WAREHOUSE', 'warehouse@example.test'], ['Demo Fresh Mart', 'RETAILER', 'retailer@example.test'],
  ];
  for (const [n, t, e] of demo) accounts.push([`${n} user`, e, t, await ensureOrg(n, t, 'Demo'), demoPw]);
  for (const [n, e, r, o, p] of accounts) {
    const { created: c } = await ensureUser(n, e, r, o, p);
    if (c) created.push({ email: e, role: r, password: p, passwordSource: (e === adminEmail ? process.env.SEED_ADMIN_PASSWORD : process.env.SEED_DEMO_PASSWORD) ? 'from environment' : 'GENERATED' });
  }
  for (const pt of PRODUCT_TYPES) await ProductType.updateOne({ name: pt.name }, { $setOnInsert: pt }, { upsert: true });
  await Threshold.updateOne({ key: 'global' }, { $setOnInsert: { key: 'global' } }, { upsert: true });

  console.log(`Seeded ${PRODUCT_TYPES.length} demonstration product types, thresholds, and accounts.`);
  if (!created.length) console.log('Accounts already existed; no passwords changed.');
  for (const c of created) console.log(`  ${c.role.padEnd(11)} ${c.email}  password: ${c.passwordSource === 'GENERATED' ? c.password : '(from environment)'}`);
  if (created.some((c) => c.passwordSource === 'GENERATED')) console.log('Generated passwords are shown ONCE; store them now.');
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
