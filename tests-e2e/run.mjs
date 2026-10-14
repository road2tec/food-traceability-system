// Entry point:  node run.mjs [--only=W]   (env: API_URL, AI_URL, MONGODB_URI, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, ...)
import fs from 'node:fs';
import { Harness } from './lib/harness.mjs';
import { config } from './lib/api.mjs';
import { registerMain, registerTamper } from './test/workflow.mjs';
import { registerSecurity } from './test/security.mjs';

const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7) || undefined;
console.log(`E2E target: ${config.apiUrl}  ai: ${config.aiUrl}  mongo: ${config.mongoUri.replace(/\/\/.*@/, '//***@')}`);

try {
  const r = await fetch(config.apiUrl + '/health', { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.error(`\nServer not reachable at ${config.apiUrl}/health (${e.message}).\nStart the stack first: infrastructure/scripts/start-all.ps1\n`);
  process.exit(2);
}

const h = new Harness();
registerMain(h);
// Workflow main steps, then security (rate-limit step S99 is last but must precede cleanup-less tamper), then tamper.
registerSecurity(h);
registerTamper(h);
// Ensure the rate-limit step (which throttles login) is the very last thing to run, after tamper tests.
const i = h.steps.findIndex((s) => s.id === 'S99');
h.steps.push(h.steps.splice(i, 1)[0]);

await h.run({ only });
const rep = h.report();
fs.writeFileSync(new URL('./report.json', import.meta.url), JSON.stringify({ at: new Date().toISOString(), target: config.apiUrl, ...rep }, null, 2));
process.exit(rep.counts.FAIL > 0 ? 1 : 0);
