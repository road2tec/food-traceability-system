'use strict';
const config = require('./config');
const { connectDb, mongoose } = require('./config/db');
const { createApp } = require('./app');
const { startJobs, stopJobs } = require('./jobs');

async function main() {
  await connectDb();
  console.log(`[server] MongoDB connected (${config.mongoUri.replace(/\/\/[^@]*@/, '//***@')})`);
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
