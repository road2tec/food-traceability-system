// Minimal sequential step runner with PASS / FAIL / SKIPPED + reasons. No dependencies.
export class Skip extends Error {
  constructor(reason) { super(reason); this.skip = true; }
}
export const skip = (reason) => { throw new Skip(reason); };

export function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
export function eq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg || 'expected equal'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

export class Harness {
  constructor() { this.steps = []; this.results = new Map(); this.ctx = {}; }

  /** add(id, name, fn, {requires:[ids]}) - a step is SKIPPED if a required step did not PASS. */
  add(id, name, fn, opts = {}) { this.steps.push({ id, name, fn, requires: opts.requires || [] }); }

  async run({ only } = {}) {
    for (const s of this.steps) {
      if (only && !s.id.startsWith(only)) continue;
      const t0 = Date.now();
      const bad = s.requires.find((r) => (this.results.get(r) || {}).status !== 'PASS');
      let res;
      if (bad) {
        res = { status: 'SKIPPED', reason: `dependency ${bad} did not pass (${(this.results.get(bad) || {}).status || 'not run'})` };
      } else {
        try {
          const note = await s.fn(this.ctx);
          res = { status: 'PASS', reason: typeof note === 'string' ? note : '' };
        } catch (e) {
          if (e && e.skip) res = { status: 'SKIPPED', reason: e.message };
          else res = { status: 'FAIL', reason: (e && e.message) || String(e) };
        }
      }
      res.ms = Date.now() - t0;
      this.results.set(s.id, res);
      const tag = res.status === 'PASS' ? 'PASS   ' : res.status === 'FAIL' ? 'FAIL   ' : 'SKIPPED';
      console.log(`[${tag}] ${s.id}  ${s.name}${res.reason ? '  -- ' + res.reason : ''}`);
    }
  }

  report() {
    const rows = this.steps.filter((s) => this.results.has(s.id)).map((s) => ({ id: s.id, name: s.name, ...this.results.get(s.id) }));
    const c = { PASS: 0, FAIL: 0, SKIPPED: 0 };
    rows.forEach((r) => { c[r.status]++; });
    console.log('\n================ E2E SUMMARY ================');
    console.log(`PASS: ${c.PASS}   FAIL: ${c.FAIL}   SKIPPED: ${c.SKIPPED}   TOTAL: ${rows.length}`);
    for (const r of rows.filter((x) => x.status !== 'PASS')) console.log(` ${r.status.padEnd(7)} ${r.id} ${r.name}\n          reason: ${r.reason}`);
    console.log('=============================================');
    return { counts: c, rows };
  }
}
