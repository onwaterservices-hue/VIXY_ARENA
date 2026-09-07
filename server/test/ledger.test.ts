/* =============================================================
   THE LEDGER — what VIXY locked, and what happened.
   A LiveEngine on the captured Kalshi fixture, a STUB model (this
   is a test of the ledger, not a model), and a stub venue that
   later publishes an outcome. Run: node --test server/test/
   ============================================================= */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startServer, type RunningServer } from '../index.ts';
import { LiveEngine } from '../engine/LiveEngine.ts';
import type { VixyModel } from '../engine/model.ts';
import { normalizeKalshiMarket, type KalshiMarketRaw } from '../engine/venues/kalshi.ts';
import type { VenueFetchResult, VenueMarket } from '../engine/venues/types.ts';
import { grantEntitlement } from '../billing/entitlements.ts';
import { settlementSweep } from '../ledger/settlement.ts';
import { payoutFor, reproduceLock, settleCall, type CallRow } from '../ledger/calls.ts';

const fx = (name: string) => JSON.parse(readFileSync(new URL(`../engine/venues/fixtures/${name}`, import.meta.url), 'utf8'));
const raw = (fx('kalshi-markets-nfl.json') as { markets: KalshiMarketRaw[] }).markets;

/* A venue we control: prices can move, and an outcome can be published later. */
let clock = new Date('2026-09-06T02:05:00Z').getTime();
const priceOverride = new Map<string, string>();
const published = new Map<string, 'yes' | 'no' | 'void'>();
const at = () => new Date(clock).toISOString();
function rows(): VenueMarket[] {
  return raw.map((m) => {
    const p = priceOverride.get(m.ticker);
    const r = published.get(m.ticker);
    const mm: KalshiMarketRaw = { ...m, ...(p ? { yes_bid_dollars: p, yes_ask_dollars: p } : {}), ...(r ? { result: r, status: 'finalized' } : {}) };
    return normalizeKalshiMarket(mm, { category: 'Sports', series_ticker: 'KXNFLGAME', title: 'game' }, at());
  });
}
const venue = {
  venue: 'KALSHI' as const,
  async fetchOpen(): Promise<VenueFetchResult> { return { venue: 'KALSHI', fetchedAt: at(), latencyMs: 5, error: null, markets: rows() }; },
  async fetchMarket(id: string): Promise<VenueMarket | null> { return rows().find((r) => r.venueMarketId === id) ?? null; },
};
/* A stub model: market + 800 bps, evidence says it is a stub. Exists only so a lock can be written;
   its read carries enough for the lock policy to evaluate (observations, confidence, reversal risk). */
const stubModel: VixyModel = {
  version: 'stub-test-model-0',
  read: (m, now) => (m.marketProbabilityBps === null ? null : {
    vixyBps: Math.min(9900, m.marketProbabilityBps + 800), confidenceBps: 7000, reversalRiskBps: 500, regime: 'TRENDING',
    evidence: ['STUB MODEL: market + 800 bps'], rationale: 'stub', featureSetVersion: 'fs-stub', dataAgeMs: 0, computedAt: now,
    inputs: { minObservations: 10, market: m.marketProbabilityBps },
  }),
  reproduce: (inputs) => { const i = inputs as { market: number }; return { vixyBps: Math.min(9900, i.market + 800), confidenceBps: 7000, reversalRiskBps: 500, regime: 'TRENDING', evidence: [], rationale: 'stub', featureSetVersion: 'fs-stub', dataAgeMs: 0, computedAt: 0, inputs }; },
};

let srv: RunningServer; let engine: LiveEngine;
class Client {
  cookie = ''; base: string;
  constructor(base: string) { this.base = base; }
  async call(method: string, path: string, body?: unknown) {
    const r = await fetch(this.base + path, { method, headers: { 'content-type': 'application/json', origin: this.base, cookie: this.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of r.headers.getSetCookie?.() ?? []) { const [kv] = c.split(';'); this.cookie = kv.endsWith('=') ? '' : kv; }
    const text = await r.text(); let json: any = null; try { json = JSON.parse(text); } catch { /* */ }
    return { status: r.status, json };
  }
}

before(async () => {
  engine = new LiveEngine({ adapters: [venue], now: () => clock, model: stubModel });
  /* Three refreshes so the policy's stability window (3 prior reads on the same side) can be satisfied. */
  for (let i = 0; i < 3; i++) { await engine.refresh(); clock += 30_000; }
  srv = await startServer({ port: 0, databasePath: ':memory:', staticDir: null, production: false, cookieSecure: false, settleSweepMs: 0, rateLimitScale: 100,
    discord: { required: false, clientId: '', clientSecret: '', guildId: '', roleId: '', redirectUrl: '', apiBase: '', oauthBase: '', recheckMs: 3_600_000, maxAgeMs: 14 * 86_400_000, recheckLoopMs: 0 } }, { engine, now: () => clock });
});
after(async () => { await srv.close(); });
const base = () => `http://127.0.0.1:${srv.port}`;

let c: Client; let userId: string; let marketId: string; let ticker: string; let lockId: string; let entryAtLock: number;

test('a lock is written from the engine quote with the model evidence frozen in, origin LIVE', async () => {
  c = new Client(base());
  const su = await c.call('POST', '/api/auth/signup', { email: 'l@example.com', handle: 'locker', password: 'password123' });
  userId = su.json.session.userId;
  grantEntitlement(srv.db, { userId, planId: 'test', stripeCustomerId: null, stripeSubscriptionId: null, currentPeriodEnd: null, source: 'test', actor: 'test' });
  assert.equal((await c.call('GET', '/api/auth/session')).json.access.stage, 'OPEN');

  const snap = await c.call('GET', '/api/snapshot');
  assert.equal(snap.json.health.origin, 'LIVE'); assert.equal(snap.json.brain.modelVersion, 'stub-test-model-0');
  const m = snap.json.markets.find((x: any) => x.vixyProbabilityBps !== null && x.marketProbabilityBps !== null);
  marketId = m.id; ticker = m.venueRefs[0].venueMarketId; entryAtLock = m.marketProbabilityBps;
  assert.equal(m.provenance.modelVersion, 'stub-test-model-0');

  /* The policy refuses the wrong side and explains itself. */
  const wrong = await c.call('POST', '/api/calls', { marketId, direction: 'NO', stakePoints: 100 });
  assert.equal(wrong.status, 422); assert.equal(wrong.json.error, 'lock_gate'); assert.match(wrong.json.message, /DIRECTIONAL_CONSISTENCY/);
  const r = await c.call('POST', '/api/calls', { marketId, direction: 'YES', stakePoints: 100 });
  assert.equal(r.status, 201, JSON.stringify(r.json)); lockId = r.json.id;
  assert.equal(r.json.entryBps, entryAtLock); assert.equal(r.json.vixyBps, m.vixyProbabilityBps); assert.equal(r.json.state, 'OPEN');
  const row = srv.db.prepare('SELECT * FROM calls WHERE id = ?').get(lockId) as CallRow;
  assert.equal(row.origin, 'LIVE'); assert.equal(row.model_version, 'stub-test-model-0'); assert.deepEqual(JSON.parse(row.evidence), ['STUB MODEL: market + 800 bps']);
  assert.equal(row.venue_market_id, ticker); assert.equal(row.policy_version, 'arena-lock-policy-0.1.0'); assert.ok(row.inputs);
  /* The lock reproduces from its frozen inputs under the recorded model version. */
  const rep = reproduceLock(row, stubModel); assert.equal(rep.ok, true, rep.reason);
  assert.equal((await c.call('GET', '/api/calls')).json.portfolio.pointsBalance, 900);
});

test('the lock survives a "restart": a fresh engine instance sees the same row from the database', async () => {
  const again = srv.db.prepare('SELECT id, entry_bps, direction FROM calls WHERE user_id = ?').all(userId) as any[];
  assert.equal(again.length, 1); assert.equal(again[0].id, lockId); assert.equal(again[0].entry_bps, entryAtLock);
});

test('while the venue is silent the sweep settles nothing — even after the market closes and the price moves', async () => {
  priceOverride.set(ticker, '0.9900'); await engine.refresh();
  clock += 30 * 24 * 3_600_000; /* past every fixture close */
  const rep = await settlementSweep(srv.db, engine, clock);
  assert.equal(rep.settled, 0); assert.ok(rep.pending >= 1);
  const mine = await c.call('GET', '/api/calls');
  assert.equal(mine.json.calls[0].state, 'LOCKED'); assert.equal(mine.json.calls[0].result, null);
});

test('when the venue publishes the outcome, settlement references the lock and pays on the LOCKED entry, not the moved price', async () => {
  published.set(ticker, 'yes');
  const rep = await settlementSweep(srv.db, engine, clock);
  assert.equal(rep.settled, 1);
  const s = srv.db.prepare('SELECT * FROM settlements WHERE call_id = ?').get(lockId) as any;
  assert.equal(s.outcome, 'YES'); assert.equal(s.result, 'WON'); assert.match(s.source, /Kalshi published result "YES"/);
  /* Fair odds on the entry recorded at lock time (not 0.99): 100 × 10000 / entry. */
  assert.equal(s.points_delta, Math.round(100 * 10000 / entryAtLock));
  const mine = await c.call('GET', '/api/calls');
  assert.equal(mine.json.calls[0].state, 'SETTLED'); assert.equal(mine.json.calls[0].result, 'WON');
  assert.equal(mine.json.portfolio.pointsBalance, 900 + s.points_delta);
  assert.equal(mine.json.portfolio.settledCalls, 1); assert.equal(mine.json.portfolio.calibrationBps, null, 'one settled call is not a calibration sample');
  /* Idempotent and immutable. */
  assert.equal((await settlementSweep(srv.db, engine, clock)).settled, 0);
  assert.throws(() => srv.db.prepare('UPDATE settlements SET result = ? WHERE call_id = ?').run('LOST', lockId), /immutable/);
});

test('a resolution for a different market cannot settle a lock; a lock against a closed market is refused', async () => {
  assert.throws(() => settleCall(srv.db, lockId, { marketId: 'cm_other', outcome: 'NO', source: 't', resolvedAt: at() }), /does not reference lock/);
  const r = await c.call('POST', '/api/calls', { marketId, direction: 'NO', stakePoints: 10 });
  assert.equal(r.status, 422); assert.equal(r.json.error, 'lock_gate'); assert.match(r.json.message, /MARKET_OPEN|ENTRY_WINDOW/);
});

test('payout table: NO side priced from 1-entry, WAIT pushes, VOID refunds, loss pays nothing', () => {
  const row = { direction: 'NO', entry_bps: 7000, stake_points: 100 } as CallRow;
  assert.deepEqual(payoutFor(row, 'NO'), { result: 'WON', delta: Math.round(100 * 10000 / 3000) });
  assert.deepEqual(payoutFor(row, 'YES'), { result: 'LOST', delta: 0 });
  assert.deepEqual(payoutFor({ ...row, direction: 'WAIT' }, 'YES'), { result: 'PUSH', delta: 100 });
  assert.deepEqual(payoutFor(row, 'VOID'), { result: 'VOID', delta: 100 });
});

test('without a model the same route refuses with no_model and writes nothing', async () => {
  const bare = new LiveEngine({ adapters: [venue], now: () => clock });
  const other = (await bare.load()).markets.find((m) => m.marketProbabilityBps !== null)!;
  const q = await bare.quote(other.id, 'YES');
  assert.ok(q && q.vixyBps === null);
  const { lockCall, LockRefused } = await import('../ledger/calls.ts');
  assert.throws(() => lockCall(srv.db, userId, { marketId: other.id, direction: 'YES', stakePoints: 1 }, { ...q!, closesAt: new Date(clock + 60_000).toISOString() }), (e: any) => e instanceof LockRefused && e.code === 'no_model');
  assert.equal((srv.db.prepare('SELECT COUNT(*) AS n FROM calls').get() as any).n, 1);
});
