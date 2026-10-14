// Drops ONLY the local food_traceability database. Invoked by infrastructure/scripts/reset-dev.*
import { MongoClient } from 'mongodb';
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/food_traceability';
const dbName = new URL(uri).pathname.replace(/^\//, '') || 'food_traceability';
if (dbName !== 'food_traceability') { console.error(`Refusing to drop "${dbName}"`); process.exit(2); }
if (!/127\.0\.0\.1|localhost/.test(uri)) { console.error('Refusing: non-local URI'); process.exit(2); }
const c = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
try { await c.connect(); await c.db(dbName).dropDatabase(); console.log(`dropped ${dbName}`); }
catch (e) { console.error(e.message); process.exit(1); }
finally { await c.close(); }
