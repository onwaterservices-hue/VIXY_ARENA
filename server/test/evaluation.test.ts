/* =============================================================
   EVALUATION + LEAKAGE — the harness scores only what was written
   down before the outcome, counts skips, splits chronologically,
   and says INSUFFICIENT rather than inventing a number.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.ts';
import { recordObservations, recordReads, recordOutcome, marketsAwaitingOutcome } from '../ledger/observationStore.ts';
import { evaluate, decisionsFrom, metrics, EVAL } from '../ledger/evaluation.ts';
import { ObservationHistory } from '../engine/model/observations.ts';
import { LiveEngine } from '../engine/LiveEngine.ts';
import type { VenueFetchResult, VenueMarket } from '../engine/venues/types.ts';

const T0 = new Date('2026-09-01T00:00:00Z').getTime();
const vm = (id: string, implied: number, at: number, status: VenueMarket['status'] = 'OPEN'): VenueMarket => ({
  venue: 'KALSHI', venueMarketId: id, venueEventId: null, eventTitle: id, outcomeLabel: 'Yes', question: `Will ${id}?`, category: 'OTHER', series: null,
  impliedBps: implied, bidBps: implied - 50, askBps: implied + 50, spreadBps: 100, liquidityUsd: 20_000, volume24hUsd: 100, volumeUsd: 100, openInterest: null,
  closesAt: new Date(at + 3_600_000).toISOString(), occursAt: null, status, result: status === 'SETTLED' ? 'YES' : null, rules: null, url: 'x', fetchedAt: new Date(at).toISOString(),
});

test('leakage guards: post-resolution prices, duplicate timestamps and future stamps never enter the observation history', () => {
  const h = new ObservationHistory();
  assert.equal(h.record(vm('A', 6000, T0), T0), true);
  assert.equal(h.record(vm('A', 6000, T0), T0), false, 'duplicate timestamp ignored');
  assert.equal(h.record(vm('A', 10000, T0 + 60_000, 'SETTLED'), T0 + 60_000), false, 'a settled 0/1 print is not an observation');
  assert.equal(h.record(vm('A', 9900, T0 + 60_000, 'CLOSED'), T0 + 60_000), false, 'a closed market is not observed either');
  assert.equal(h.get('KALSHI', 'A', T0 + 120_000).length, 1);
  const db = openDb(':memory:');
  assert.equal(recordObservations(db, [vm('A', 6000, T0), vm('A', 6000, T0), vm('A', 6100, T0 + 30_000)], T0 + 30_000), 2, 'store de-duplicates on (venue, id, at)');
  assert.equal(recordObservations(db, [vm('A', 6200, T0 + 60_000)], T0 + 30_000), 0, 'a future-stamped row is refused by the store too');
  db.close();
});

test('the engine writes reads AND skips (with a reason) to the store on every refresh', async () => {
  const db = openDb(':memory:');
  let now = T0; let px = 5000;
  const adapter = { venue: 'KALSHI' as const, async fetchOpen(): Promise<VenueFetchResult> { return { venue: 'KALSHI', fetchedAt: new Date(now).toISOString(), latencyMs: 1, error: null, markets: [vm('A', px, now), vm('B', 4000, now)] }; } };
  const engine = new LiveEngine({ adapters: [adapter], now: () => now, model: 'consensus', store: db, refreshMs: 30_000 });
  for (let i = 0; i < 8; i++) { await engine.refresh(); now += 30_000; px += 80; }
  const reads = db.prepare('SELECT market_id, skipped, skip_reason, side, gate_allowed FROM model_reads ORDER BY at').all() as any[];
  assert.equal(reads.length, 16, 'two markets × eight refreshes');
  assert.ok(reads.slice(0, 2).every((r) => r.skipped === 1 && /insufficient_observations/.test(r.skip_reason)), 'early skips name the reason');
  const last = reads.slice(-2);
  const a = last.find((r) => r.market_id.endsWith('_A')); const b = last.find((r) => r.market_id.endsWith('_B'));
  assert.equal(a.skipped, 0, 'A drifted +560 bps above the noise floor → a read'); assert.equal(a.side, 'YES');
  assert.equal(b.skipped, 1); assert.equal(b.skip_reason, 'no_information_beyond_market', 'flat single venue → SKIP, written down');
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM observations').get() as any).n, 16);
  db.close();
});

test('evaluation: reads after the outcome are excluded; one decision per market; INSUFFICIENT below the floor', () => {
  const db = openDb(':memory:');
  const read = (at: number, market: string, vixy: number | null, side: 'YES' | 'NO' | 'NONE', allowed: boolean | null) => recordReads(db, [{ at, marketId: market, category: 'SPORTS', venue: 'KALSHI', venueMarketId: market, modelVersion: 'v', marketBps: 5000, vixyBps: vixy, edgeBps: vixy === null ? null : vixy - 5000, confidenceBps: 7000, reversalRiskBps: 500, side, skipped: vixy === null, skipReason: null, gateAllowed: allowed, gateReasons: null, closesAt: new Date(at + 60_000).toISOString() }]);
  read(T0, 'm1', 6000, 'YES', true);
  read(T0 + 10_000, 'm1', 6500, 'YES', true);           /* second allowed read: not a second decision */
  read(T0 + 200_000, 'm1', 9900, 'YES', true);          /* AFTER the outcome: must be excluded */
  recordOutcome(db, { marketId: 'm1', venue: 'KALSHI', venueMarketId: 'm1', outcome: 'YES', source: 't', resolvedAt: new Date(T0 + 100_000).toISOString() }, T0 + 100_000);
  const rows = db.prepare('SELECT r.at FROM model_reads r JOIN market_outcomes o ON o.market_id = r.market_id WHERE o.resolved_at_ms > r.at').all() as any[];
  assert.equal(rows.length, 2, 'the post-outcome read is not joinable');
  const rep = evaluate(db, T0 + 300_000);
  assert.equal(rep.status, 'INSUFFICIENT'); assert.equal(rep.decisions.total, 1); assert.equal(rep.decisions.locks, 1);
  assert.equal(rep.oos, null); assert.match(rep.verdict, /No predictive information is claimed/);
  db.close();
});

test('evaluation: chronological split, skill vs market, lock vs skip, buckets — on a synthetic record where the model is right 70% of the time', () => {
  const db = openDb(':memory:');
  let at = T0;
  for (let i = 0; i < 100; i++) {
    at += 60_000;
    const m = `m${i}`;
    const lock = i % 4 !== 3;                       /* 75 locks, 25 sided skips */
    const side: 'YES' | 'NO' = i % 2 ? 'YES' : 'NO';
    const vixy = side === 'YES' ? 7000 : 3000;      /* 70% on the taken side; market at 50% */
    recordReads(db, [{ at, marketId: m, category: i % 3 ? 'SPORTS' : 'POLITICS', venue: i % 5 ? 'KALSHI' : 'POLYMARKET', venueMarketId: m, modelVersion: 'v', marketBps: 5000, vixyBps: vixy, edgeBps: vixy - 5000, confidenceBps: 6500 + (i % 4) * 1000, reversalRiskBps: (i % 3) * 900, side, skipped: false, skipReason: null, gateAllowed: lock, gateReasons: lock ? null : 'TEMPORAL_STABILITY', closesAt: new Date(at + 30_000).toISOString() }]);
    const correct = i % 10 < 7;                     /* 70% right, deterministic */
    recordOutcome(db, { marketId: m, venue: 'KALSHI', venueMarketId: m, outcome: correct ? side : side === 'YES' ? 'NO' : 'YES', source: 't', resolvedAt: new Date(at + 45_000).toISOString() }, at + 45_000);
  }
  const rep = evaluate(db, at + 100_000);
  assert.equal(rep.status, 'EVALUATED'); assert.equal(rep.decisions.total, 100); assert.equal(rep.decisions.locks, 75); assert.equal(rep.decisions.skips, 25);
  assert.equal(rep.split.train, 80); assert.equal(rep.split.oos, 20);
  /* 20 OOS < MIN_OOS → in-sample only, and the verdict says so. */
  assert.equal(rep.oos, null); assert.match(rep.verdict, /IN-SAMPLE ONLY/);
  const tr = rep.train.locks;
  assert.ok(tr.n >= 55); assert.ok(tr.hitRateBps! >= 6500 && tr.hitRateBps! <= 7500);
  assert.ok(tr.skillVsMarket! > 0, 'a 70%-right model at 0.7 beats a 50% price (Brier 0.21 vs 0.25)');
  assert.ok(Math.abs(tr.brier! - 0.21) < 0.02); assert.equal(tr.marketBrier, 0.25);
  assert.ok(rep.train.skipsIfLocked.n >= 15, 'skips are scored as if locked, separately');
  /* Metrics sanity: a model that says 0.9 and is right 50% is worse than the market. */
  const bad = metrics(Array.from({ length: 40 }, (_, i) => ({ marketId: `b${i}`, at: i, kind: 'LOCK' as const, side: 'YES' as const, pSide: 0.9, pMarketSide: 0.5, hit: i % 2 === 0, edgeBps: 4000, confidenceBps: 9000, reversalRiskBps: 0, category: null, venue: null })));
  assert.ok(bad.skillVsMarket! < 0); assert.equal(bad.calibrationErrorBps, 4000);
  /* Bucket edges: below MIN_BUCKET a bucket reports nulls, never a number from 3 samples. */
  assert.equal(decisionsFrom([]).length, 0); assert.equal(EVAL.MIN_BUCKET, 10);
  db.close();
});

test('evaluation with enough out-of-sample decisions reports OOS separately with buckets', () => {
  const db = openDb(':memory:');
  let at = T0;
  for (let i = 0; i < 200; i++) {
    at += 60_000; const m = `m${i}`; const side: 'YES' | 'NO' = i % 2 ? 'YES' : 'NO';
    recordReads(db, [{ at, marketId: m, category: 'SPORTS', venue: 'KALSHI', venueMarketId: m, modelVersion: 'v', marketBps: 5000, vixyBps: side === 'YES' ? 6000 : 4000, edgeBps: side === 'YES' ? 1000 : -1000, confidenceBps: 7500, reversalRiskBps: 500, side, skipped: false, skipReason: null, gateAllowed: true, gateReasons: null, closesAt: new Date(at + 30_000).toISOString() }]);
    /* The model is right exactly half the time: it knows nothing. */
    recordOutcome(db, { marketId: m, venue: 'KALSHI', venueMarketId: m, outcome: i % 2 === 0 ? side : side === 'YES' ? 'NO' : 'YES', source: 't', resolvedAt: new Date(at + 45_000).toISOString() }, at + 45_000);
  }
  const rep = evaluate(db, at + 100_000);
  assert.equal(rep.split.oos, 40); assert.ok(rep.oos); assert.equal(rep.oos!.locks.n, 40);
  assert.equal(rep.oos!.locks.hitRateBps, 5000); assert.ok(rep.oos!.locks.skillVsMarket! < 0, 'saying 60% and being right 50% is worse than the market');
  assert.match(rep.verdict, /did NOT beat the venue's price/);
  assert.ok(rep.oosBuckets && rep.oosBuckets.edge.length === 5 && rep.oosBuckets.category[0].label === 'SPORTS');
  assert.equal(marketsAwaitingOutcome(db, at + 100_000).length, 0);
  db.close();
});
