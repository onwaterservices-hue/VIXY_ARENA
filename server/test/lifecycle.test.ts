/* =============================================================
   THE LOCK SURVIVES EVERYTHING — full lifecycle on a real on-disk
   database through server restarts, plus every failure scenario
   the activation phase names. The venue is a stub we control; the
   engine, model, policy, ledger, settlement and API are production.
   ============================================================= */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer, type RunningServer } from '../index.ts';
import { LiveEngine } from '../engine/LiveEngine.ts';
import { openDb } from '../db.ts';
import type { VenueFetchResult, VenueMarket } from '../engine/venues/types.ts';
import { grantEntitlement } from '../billing/entitlements.ts';
import { settlementSweep } from '../ledger/settlement.ts';

const dir = mkdtempSync(join(tmpdir(), 'arena-lifecycle-')); const DB = join(dir, 'arena.db');
let clock = new Date('2026-09-06T12:00:00Z').getTime(); const STEP = 30_000;
const CLOSE = new Date('2026-09-06T13:00:00Z').toISOString();
let price = 5000; let feed: 'ok' | 'dead' | 'stale' | 'down' = 'ok'; let staleAt = 0; let published: 'yes' | 'no' | null = null; let resolveCalls = 0;

const row = (): VenueMarket => ({
  venue: 'KALSHI', venueMarketId: 'KXLIFE-A', venueEventId: null, eventTitle: 'Lifecycle', outcomeLabel: 'Yes', question: 'Will the lifecycle resolve yes?', category: 'OTHER', series: null,
  impliedBps: price, bidBps: price - 50, askBps: price + 50, spreadBps: 100, liquidityUsd: 40_000, volume24hUsd: 1000, volumeUsd: 1000, openInterest: null,
  closesAt: CLOSE, occursAt: null, status: published ? 'SETTLED' : 'OPEN', result: published ? (published === 'yes' ? 'YES' : 'NO') : null, rules: null, url: 'x', fetchedAt: new Date(feed === 'stale' ? staleAt : clock).toISOString(),
});
const venue = {
  venue: 'KALSHI' as const,
  async fetchOpen(): Promise<VenueFetchResult> {
    if (feed === 'dead') throw new Error('socket hang up');
    if (feed === 'down') return { venue: 'KALSHI', fetchedAt: new Date(clock).toISOString(), latencyMs: 8000, error: 'HTTP 503', markets: [] };
    return { venue: 'KALSHI', fetchedAt: new Date(feed === 'stale' ? staleAt : clock).toISOString(), latencyMs: 2, error: null, markets: [row()] };
  },
  async fetchMarket(): Promise<VenueMarket | null> { resolveCalls++; if (feed === 'down' || feed === 'dead') throw new Error('venue unavailable'); return row(); },
};
class Client {
  cookie = ''; base: string; constructor(base: string, cookie = '') { this.base = base; this.cookie = cookie; }
  async call(method: string, path: string, body?: unknown) {
    const r = await fetch(this.base + path, { method, headers: { 'content-type': 'application/json', origin: this.base, cookie: this.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of r.headers.getSetCookie?.() ?? []) { const [kv] = c.split(';'); this.cookie = kv.endsWith('=') ? '' : kv; }
    const t = await r.text(); let json: any = null; try { json = JSON.parse(t); } catch { /* */ } return { status: r.status, json };
  }
}
const cfg = () => ({ port: 0, databasePath: DB, staticDir: null as string | null, production: false, cookieSecure: false, settleSweepMs: 0, rateLimitScale: 100, sessionSecret: 'lifecycle-secret-'.padEnd(40, 'x'),
  discord: { required: false, clientId: '', clientSecret: '', guildId: '', roleId: '', redirectUrl: '', apiBase: '', oauthBase: '', recheckMs: 1, maxAgeMs: 1, recheckLoopMs: 0 } });
let srv: RunningServer; let engine: LiveEngine;
async function boot() {
  engine = new LiveEngine({ adapters: [venue], now: () => clock, model: 'consensus', refreshMs: STEP, store: openDb(DB) });
  srv = await startServer(cfg(), { engine, now: () => clock });
}
const tick = async (n: number, dp = 0) => { for (let i = 0; i < n; i++) { clock += STEP; price += dp; await engine.refresh(); } };
before(boot);
after(async () => { await srv.close(); rmSync(dir, { recursive: true, force: true }); });
const base = () => `http://127.0.0.1:${srv.port}`;

let c: Client; let cookie = ''; let marketId: string; let lockId: string; let lockRow: any;

test('lifecycle: identify → live price → quote → gate → LOCK persisted (model status honest throughout)', async () => {
  c = new Client(base());
  const su = await c.call('POST', '/api/auth/signup', { email: 'life@example.com', handle: 'lifer', password: 'password123' });
  grantEntitlement(srv.db, { userId: su.json.session.userId, planId: 't', stripeCustomerId: null, stripeSubscriptionId: null, currentPeriodEnd: null, source: 't', actor: 't' });
  cookie = c.cookie;
  await tick(3, 0);
  let snap = await c.call('GET', '/api/snapshot');
  assert.equal(snap.json.brain.modelStatus, 'MODEL_INSUFFICIENT_DATA', 'unvalidated, and says so');
  marketId = snap.json.markets[0].id;
  assert.equal(snap.json.markets[0].health.status, 'LIVE'); assert.equal(snap.json.system.sources[0].status, 'LIVE');
  await tick(22, 40);
  snap = await c.call('GET', '/api/snapshot');
  const m = snap.json.markets[0]; assert.ok(m.vixyProbabilityBps !== null && m.edgeBps > 0);
  const r = await c.call('POST', '/api/calls', { marketId, direction: 'YES', stakePoints: 100 });
  assert.equal(r.status, 201, JSON.stringify(r.json)); lockId = r.json.id;
  lockRow = srv.db.prepare('SELECT * FROM calls WHERE id = ?').get(lockId);
  assert.equal(lockRow.model_version, 'vixy-arena-consensus-0.1.0'); assert.ok(lockRow.inputs);
});

test('feed dies after the quote: the lock stands, the board reads DEGRADED, the model goes DEGRADED, no new lock is possible', async () => {
  feed = 'dead'; await tick(2, 0);
  const snap = await c.call('GET', '/api/snapshot');
  assert.equal(snap.json.system.sources[0].status, 'DEGRADED'); assert.match(snap.json.system.sources[0].note, /socket hang up/);
  assert.equal(snap.json.brain.modelStatus, 'MODEL_DEGRADED');
  assert.equal(snap.json.markets.length, 1, 'last rows kept'); assert.notEqual(snap.json.markets[0].health.status, 'LIVE');
  const again = await c.call('POST', '/api/calls', { marketId, direction: 'YES', stakePoints: 10 });
  assert.equal(again.status, 422); assert.match(again.json.message, /DATA_FRESH|already/);
  const still = srv.db.prepare('SELECT direction, entry_bps, vixy_bps FROM calls WHERE id = ?').get(lockId) as any;
  assert.equal(still.direction, lockRow.direction); assert.equal(still.entry_bps, lockRow.entry_bps); assert.equal(still.vixy_bps, lockRow.vixy_bps);
});

test('feed goes stale (venue answers with old timestamps): STALE not LIVE; model reads withheld', async () => {
  feed = 'stale'; staleAt = clock - 4 * 60_000; await tick(1, 0);
  const snap = await c.call('GET', '/api/snapshot');
  assert.equal(snap.json.markets[0].health.status, 'STALE'); assert.equal(snap.json.markets[0].vixyProbabilityBps, null, 'no read on stale data');
  assert.notEqual(snap.json.brain.modelStatus, 'MODEL_READY');
  feed = 'ok';
});

test('venue API unavailable at settlement time: nothing settles, nothing is guessed', async () => {
  clock = new Date(CLOSE).getTime() + 60_000; feed = 'down';
  const rep = await settlementSweep(srv.db, engine, clock);
  assert.equal(rep.settled, 0); assert.ok(rep.errors.length >= 1 || rep.pending >= 1);
  assert.equal(srv.db.prepare('SELECT COUNT(*) AS n FROM settlements').get()!.n, 0);
  const mine = await c.call('GET', '/api/calls'); assert.equal(mine.json.calls[0].state, 'LOCKED'); assert.equal(mine.json.calls[0].result, null);
  feed = 'ok';
});

test('server restarts BEFORE settlement: the lock is still there, still LOCKED, on the same account', async () => {
  await srv.close();
  await boot();
  const c2 = new Client(base(), cookie);
  const s = await c2.call('GET', '/api/auth/session'); assert.equal(s.json.access.stage, 'OPEN', 'the session survived the restart (SESSION_SECRET is stable)');
  const mine = await c2.call('GET', '/api/calls');
  assert.equal(mine.json.calls.length, 1); assert.equal(mine.json.calls[0].id, lockId); assert.equal(mine.json.calls[0].state, 'LOCKED');
  assert.equal(mine.json.portfolio.pointsBalance, 900);
  c = c2;
});

test('venue publishes the outcome (out of order: a resolution for the wrong market first) → exactly one settlement; duplicates are no-ops', async () => {
  published = 'yes';
  /* Out-of-order / wrong-market resolution cannot attach to this lock. */
  const { settleCall } = await import('../ledger/calls.ts');
  assert.throws(() => settleCall(srv.db, lockId, { marketId: 'cm_kalshi_OTHER', outcome: 'NO', source: 't', resolvedAt: new Date(clock).toISOString() }), /does not reference lock/);
  const rep1 = await settlementSweep(srv.db, engine, clock); assert.equal(rep1.settled, 1);
  const rep2 = await settlementSweep(srv.db, engine, clock); assert.equal(rep2.settled, 0, 'duplicate settlement is a no-op');
  assert.equal(srv.db.prepare('SELECT COUNT(*) AS n FROM settlements').get()!.n, 1);
  assert.throws(() => srv.db.prepare('UPDATE settlements SET result = ? WHERE call_id = ?').run('LOST', lockId), /immutable/);
  const outcome = srv.db.prepare('SELECT outcome FROM market_outcomes WHERE market_id = ?').get(marketId) as any;
  assert.equal(outcome?.outcome, 'YES', 'the outcome is recorded for the evaluation record too');
});

test('portfolio and history reflect the venue outcome; a browser refresh and a second device see the same record', async () => {
  const mine = await c.call('GET', '/api/calls');
  assert.equal(mine.json.calls[0].state, 'SETTLED'); assert.equal(mine.json.calls[0].result, 'WON');
  const expected = 900 + Math.round(100 * 10000 / lockRow.entry_bps);
  assert.equal(mine.json.portfolio.pointsBalance, expected);
  /* "Browser refresh": a fresh GET with the same cookie. "Another device": a new sign-in, new cookie. */
  const refresh = await new Client(base(), cookie).call('GET', '/api/snapshot'); assert.equal(refresh.json.calls[0].id, lockId);
  const other = new Client(base()); await other.call('POST', '/api/auth/signin', { email: 'life@example.com', password: 'password123' });
  const hist = await other.call('GET', '/api/calls'); assert.equal(hist.json.calls[0].id, lockId); assert.equal(hist.json.calls[0].result, 'WON');
});

test('server restarts AFTER settlement: the settled record, the outcome and the points are unchanged', async () => {
  await srv.close(); await boot();
  const c3 = new Client(base(), cookie);
  const mine = await c3.call('GET', '/api/calls');
  assert.equal(mine.json.calls[0].id, lockId); assert.equal(mine.json.calls[0].state, 'SETTLED'); assert.equal(mine.json.calls[0].result, 'WON');
  assert.equal(srv.db.prepare('SELECT COUNT(*) AS n FROM model_reads').get()!.n > 20, true, 'the evaluation record survived too');
});
