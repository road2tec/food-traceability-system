'use strict';
const config = require('./config');
const { connectDb, mongoose } = require('./config/db');
const { createApp } = require('./app');
const { startJobs, stopJobs } = require('./jobs');

async function main() {
  await connectDb();
  console.log(`[server] MongoDB connected (${config.mongoUri.replace(/\/\/[^@]*@/, '//***@')})`);
  if (!config.isProd && !config.isTest && process.env.SEED_ON_START !== 'false') {
    try { await require('./seed').seedDemo({ resetPasswords: true, quiet: true }); } catch (e) { console.error('[server] demo seeding failed:', e.message); }
    console.log('[server] demo accounts ensured (development default; set SEED_ON_START=false to disable)');
  }
  const app = createApp();
  const server = app.listen(config.port, () => console.log(`[server] listening on :${config.port} (API /api/v1, docs /api-docs)`));
  startJobs();
  const shutdown = async () => {
    stopJobs();
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
main().catch((e) => { console.error('[server] fatal:', e.message); process.exit(1); });
