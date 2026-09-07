/* =============================================================
   The whole chain with the REAL model: venue rows → observation
   history → vixy-arena-consensus → quote → lock policy → immutable
   ledger → venue-authoritative settlement → calibration report.
   The venue is a stub that ramps prices; the model, policy, ledger
   and settlement are the production code paths.
   ============================================================= */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, type RunningServer } from '../index.ts';
import { LiveEngine } from '../engine/LiveEngine.ts';
import { ConsensusModel, CONSTANTS } from '../engine/model/consensusModel.ts';
import type { VenueFetchResult, VenueMarket } from '../engine/venues/types.ts';
import type { Venue } from '../../types/index.ts';
import { grantEntitlement } from '../billing/entitlements.ts';
import { settlementSweep } from '../ledger/settlement.ts';
import { reproduceLock, type CallRow } from '../ledger/calls.ts';

let clock = new Date('2026-09-06T02:00:00Z').getTime();
const STEP = 30_000;
const CLOSE = new Date('2026-09-06T03:00:00Z').toISOString();
let kalshiBps = 5800; let polyBps = 5500; let published: 'yes' | 'no' | null = null;

function row(venue: Venue, implied: number): VenueMarket {
  return {
    venue, venueMarketId: venue === 'KALSHI' ? 'KXLIVE-A' : '0x' + 'b'.repeat(64), venueEventId: null,
    eventTitle: 'Will the live test resolve yes?', outcomeLabel: 'Yes', question: 'Will the live test resolve yes?', category: 'OTHER', series: null,
    impliedBps: implied, bidBps: implied - 50, askBps: implied + 50, spreadBps: 100, liquidityUsd: venue === 'KALSHI' ? 50_000 : 5_000, volume24hUsd: 1000, volumeUsd: 1000, openInterest: null,
    closesAt: CLOSE, occursAt: null, status: published ? 'SETTLED' : 'OPEN', result: published ? (published === 'yes' ? 'YES' : 'NO') : null, rules: null, url: 'https://x', fetchedAt: new Date(clock).toISOString(),
  };
}
const adapters = (['KALSHI', 'POLYMARKET'] as Venue[]).map((venue) => ({
  venue,
  async fetchOpen(): Promise<VenueFetchResult> { return { venue, fetchedAt: new Date(clock).toISOString(), latencyMs: 3, error: null, markets: [row(venue, venue === 'KALSHI' ? kalshiBps : polyBps)] }; },
  async fetchMarket(): Promise<VenueMarket | null> { return row(venue, venue === 'KALSHI' ? kalshiBps : polyBps); },
}));

let srv: RunningServer; let engine: LiveEngine;
class Client {
  cookie = ''; base: string; constructor(base: string) { this.base = base; }
  async call(method: string, path: string, body?: unknown) {
    const r = await fetch(this.base + path, { method, headers: { 'content-type': 'application/json', origin: this.base, cookie: this.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of r.headers.getSetCookie?.() ?? []) { const [kv] = c.split(';'); this.cookie = kv.endsWith('=') ? '' : kv; }
    const t = await r.text(); let json: any = null; try { json = JSON.parse(t); } catch { /* */ } return { status: r.status, json };
  }
}
before(async () => {
  engine = new LiveEngine({ adapters, now: () => clock, model: 'consensus', refreshMs: STEP });
  srv = await startServer({ port: 0, databasePath: ':memory:', staticDir: null, production: false, cookieSecure: false, settleSweepMs: 0, rateLimitScale: 100,
    discord: { required: false, clientId: '', clientSecret: '', guildId: '', roleId: '', redirectUrl: '', apiBase: '', oauthBase: '', recheckMs: 1, maxAgeMs: 1, recheckLoopMs: 0 } }, { engine, now: () => clock });
});
after(async () => { await srv.close(); });
const base = () => `http://127.0.0.1:${srv.port}`;
const tick = async (n: number, dk = 0, dp = 0) => { for (let i = 0; i < n; i++) { clock += STEP; kalshiBps += dk; polyBps += dp; await engine.refresh(); } };

let c: Client; let userId: string; let marketId: string; let lockId: string;

test('/api/model names the model and says its constants are unvalidated; calibration is INSUFFICIENT with nulls, not numbers', async () => {
  c = new Client(base());
  const su = await c.call('POST', '/api/auth/signup', { email: 'm@example.com', handle: 'modeller', password: 'password123' }); userId = su.json.session.userId;
  grantEntitlement(srv.db, { userId, planId: 't', stripeCustomerId: null, stripeSubscriptionId: null, currentPeriodEnd: null, source: 't', actor: 't' });
  const m = await c.call('GET', '/api/model');
  assert.equal(m.json.model.version, CONSTANTS.version); assert.equal(m.json.model.validated, false); assert.equal(m.json.lockPolicy.validated, false);
  const cal = await c.call('GET', '/api/model/calibration');
  assert.equal(cal.json.status, 'INSUFFICIENT'); assert.equal(cal.json.inSample.brier, null); assert.equal(cal.json.inSample.hitRateBps, null); assert.equal(cal.json.holdout, null); assert.equal(cal.json.lockVsSkip, null);
});

test('before enough observations the model has no read and the lock is refused with named reasons', async () => {
  await tick(2, 20, 20);
  const snap = await c.call('GET', '/api/snapshot');
  marketId = snap.json.markets[0].id;
  assert.equal(snap.json.markets[0].vixyProbabilityBps, null, 'no read yet');
  assert.equal(snap.json.brain.modelVersion, CONSTANTS.version);
  const r = await c.call('POST', '/api/calls', { marketId, direction: 'YES', stakePoints: 50 });
  assert.equal(r.status, 422); assert.equal(r.json.error, 'lock_gate'); assert.match(r.json.message, /MODEL_READ/);
});

test('with a stable upward drift on the liquid venue the model reads UP, the gate opens for YES only, and the lock freezes version + inputs', async () => {
  await tick(12, 40, 40); /* 14 observations, +560 bps on Kalshi */
  const snap = await c.call('GET', '/api/snapshot'); const m = snap.json.markets[0];
  assert.ok(m.vixyProbabilityBps !== null && m.edgeBps > 0, JSON.stringify({ v: m.vixyProbabilityBps, e: m.edgeBps }));
  assert.equal(m.provenance.modelVersion, CONSTANTS.version); assert.ok(m.provenance.inputs.length >= 4);
  assert.equal(m.marketProbabilityBps !== m.vixyProbabilityBps, true);
  const no = await c.call('POST', '/api/calls', { marketId, direction: 'NO', stakePoints: 50 });
  assert.equal(no.status, 422); assert.match(no.json.message, /DIRECTIONAL_CONSISTENCY/);
  const yes = await c.call('POST', '/api/calls', { marketId, direction: 'YES', stakePoints: 50 });
  assert.equal(yes.status, 201, JSON.stringify(yes.json)); lockId = yes.json.id;
  assert.equal(yes.json.vixyBps, m.vixyProbabilityBps); assert.equal(yes.json.entryBps, m.marketProbabilityBps);
  const rowDb = srv.db.prepare('SELECT * FROM calls WHERE id = ?').get(lockId) as CallRow;
  assert.equal(rowDb.model_version, CONSTANTS.version); assert.equal(rowDb.policy_version, 'arena-lock-policy-0.1.0'); assert.ok(rowDb.inputs); assert.ok(rowDb.rationale);
  assert.ok(rowDb.reversal_risk_bps !== null);
  /* Reproducible from the frozen inputs, under the recorded version, even after the market moved on. */
  await tick(3, -80, -80);
  const rep = reproduceLock(rowDb, new ConsensusModel(engine.history)); assert.equal(rep.ok, true, rep.reason); assert.equal(rep.got, rowDb.vixy_bps);
  /* A different version string refuses to "reproduce" someone else's lock. */
  assert.equal(reproduceLock(rowDb, { version: 'vixy-arena-consensus-0.2.0', reproduce: () => null }).ok, false);
});

test('settlement is the venue\'s, never the model\'s; calibration stays INSUFFICIENT below the sample floor', async () => {
  clock = new Date(CLOSE).getTime() + 60_000; published = 'no'; await engine.refresh();
  const rep = await settlementSweep(srv.db, engine, clock);
  assert.equal(rep.settled, 1);
  const s = srv.db.prepare('SELECT * FROM settlements WHERE call_id = ?').get(lockId) as any;
  assert.equal(s.outcome, 'NO'); assert.equal(s.result, 'LOST'); assert.match(s.source, /Kalshi published result "NO"/);
  const cal = await c.call('GET', '/api/model/calibration');
  assert.equal(cal.json.status, 'INSUFFICIENT'); assert.equal(cal.json.settled, 1); assert.equal(cal.json.inSample.hitRateBps, null);
  assert.match(cal.json.note, /no metric is reported below 30/);
});
