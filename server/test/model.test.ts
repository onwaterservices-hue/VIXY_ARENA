/* =============================================================
   vixy-arena-consensus-0.1.0 — deterministic tests over synthetic
   observation series. These prove the model's CONTRACT (bounds,
   nulls, chronology, reproducibility, gate behaviour); they do not
   and cannot prove predictive validity — see docs/VIXY-MODEL-MAPPING.md.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { VenueMarket } from '../engine/venues/types.ts';
import type { CanonicalMarket, Venue } from '../../types/index.ts';
import { buildCanonical } from '../engine/canonical.ts';
import { LookAheadError, ObservationHistory } from '../engine/model/observations.ts';
import { extractFeatures, type MarketFeatures } from '../engine/model/features.ts';
import { CONSTANTS, ConsensusModel, compute } from '../engine/model/consensusModel.ts';
import { applyModel } from '../engine/model.ts';
import { evaluateLockGate, LOCK_POLICY, sideOf, type PriorRead } from '../engine/model/lockPolicy.ts';

const T0 = new Date('2026-09-06T02:00:00Z').getTime();
const STEP = 30_000;
const CLOSE = new Date('2026-09-08T00:00:00Z').toISOString();

function vm(venue: Venue, implied: number, at: number, o: { liq?: number; spread?: number; question?: string } = {}): VenueMarket {
  const spread = o.spread ?? 100;
  return {
    venue, venueMarketId: venue === 'KALSHI' ? 'KXTEST-A' : '0x' + 'a'.repeat(64), venueEventId: null,
    eventTitle: o.question ?? 'Will the test resolve yes?', outcomeLabel: 'Yes', question: o.question ?? 'Will the test resolve yes?',
    category: 'OTHER', series: null, impliedBps: implied, bidBps: implied - spread / 2, askBps: implied + spread / 2, spreadBps: spread,
    liquidityUsd: o.liq ?? 20_000, volume24hUsd: 1000, volumeUsd: 5000, openInterest: null,
    closesAt: CLOSE, occursAt: null, status: 'OPEN', result: null, rules: null, url: 'https://x', fetchedAt: new Date(at).toISOString(),
  };
}

/** Feed a series of (kalshi, polymarket|null) prices into a history; returns the market as of the last step. */
function series(points: { k: number; p?: number | null; liq?: { k?: number; p?: number }; spread?: number }[], start = T0) {
  const history = new ObservationHistory();
  let rows: VenueMarket[] = []; let now = start;
  points.forEach((pt, i) => {
    now = start + i * STEP;
    rows = [vm('KALSHI', pt.k, now, { liq: pt.liq?.k, spread: pt.spread })];
    if (pt.p !== null && pt.p !== undefined) rows.push(vm('POLYMARKET', pt.p, now, { liq: pt.liq?.p, spread: pt.spread }));
    history.recordAll(rows, now);
  });
  const market = buildCanonical(rows, now).markets[0];
  return { history, market, now, model: new ConsensusModel(history) };
}
const ramp = (n: number, from: number, to: number) => Array.from({ length: n }, (_, i) => Math.round(from + ((to - from) * i) / (n - 1)));

/* ---------- fixtures ---------- */
const FIX = {
  strongUp: () => series(ramp(20, 5800, 6400).map((k) => ({ k, p: k - 300, liq: { k: 50_000, p: 5_000 } }))),
  strongDown: () => series(ramp(20, 6400, 5800).map((k) => ({ k, p: k + 300, liq: { k: 50_000, p: 5_000 } }))),
  conflicting: () => series(ramp(20, 5800, 6300).map((k, i) => ({ k: i >= 17 ? k - 250 : k, p: k - 500, liq: { k: 50_000, p: 5_000 } }))),
  stale: () => { const s = series(ramp(20, 5800, 6400).map((k) => ({ k, p: k - 300 }))); return { ...s, now: s.now + 5 * 60_000 }; },
  chop: () => series(Array.from({ length: 20 }, (_, i) => ({ k: 6000 + (i % 2 ? 130 : -130), p: 6000 + (i % 2 ? -130 : 130) }))),
  insufficient: () => series(ramp(3, 5800, 6400).map((k) => ({ k, p: k - 300 }))),
  flatSingle: () => series(Array.from({ length: 20 }, () => ({ k: 6000, p: null }))),
};

const read = (f: ReturnType<typeof series>) => f.model.read(f.market, f.now);

test('output schema: every field present, typed and bounded', () => {
  const f = FIX.strongUp(); const r = read(f);
  assert.ok(r, 'strong UP must produce a read');
  for (const k of ['vixyBps', 'confidenceBps', 'reversalRiskBps'] as const) { assert.equal(typeof r![k], 'number'); assert.ok(r![k] >= 0 && r![k] <= 10000, k); }
  assert.ok(r!.vixyBps >= CONSTANTS.P_MIN && r!.vixyBps <= CONSTANTS.P_MAX);
  assert.ok(['TRENDING', 'RANGING', 'VOLATILE', 'ILLIQUID', 'UNKNOWN'].includes(r!.regime));
  assert.ok(Array.isArray(r!.evidence) && r!.evidence.length >= 4 && r!.evidence.every((e) => /\d/.test(e)), 'every evidence line carries a number');
  assert.equal(typeof r!.rationale, 'string'); assert.match(r!.rationale, /validated=false/);
  assert.equal(r!.computedAt, f.now); assert.ok(r!.dataAgeMs >= 0); assert.ok(r!.inputs);
});

test('market probability, VIXY probability, edge and confidence are distinct quantities', () => {
  const f = FIX.strongUp(); const m = applyModel(f.market, f.model, f.now);
  assert.ok(m.marketProbabilityBps !== null && m.vixyProbabilityBps !== null && m.edgeBps !== null && m.confidenceBps !== null);
  assert.notEqual(m.vixyProbabilityBps, m.marketProbabilityBps);
  assert.equal(m.edgeBps, m.vixyProbabilityBps! - m.marketProbabilityBps!);
  assert.equal(m.provenance!.modelVersion, CONSTANTS.version);
  /* Confidence does not move with edge: same data quality, opposite drift → same confidence, opposite edge. */
  const g = FIX.strongDown(); const mg = applyModel(g.market, g.model, g.now);
  assert.equal(mg.confidenceBps, m.confidenceBps);
  assert.ok(mg.edgeBps! < 0 && m.edgeBps! > 0);
});

test('fixtures: strong UP reads up, strong DOWN reads down (mirrored), conflicting evidence raises reversal risk', () => {
  const up = read(FIX.strongUp())!; const down = read(FIX.strongDown())!;
  assert.ok(up.vixyBps > FIX.strongUp().market.marketProbabilityBps!); assert.ok(down.vixyBps < FIX.strongDown().market.marketProbabilityBps!);
  const eUp = up.vixyBps - FIX.strongUp().market.marketProbabilityBps!; const eDown = down.vixyBps - FIX.strongDown().market.marketProbabilityBps!;
  assert.ok(Math.abs(eUp + eDown) <= 1, `mirror symmetric within rounding of the canonical consensus (${eUp} vs ${eDown})`);
  assert.ok(up.reversalRiskBps < LOCK_POLICY.MAX_REVERSAL_BPS);
  const c = read(FIX.conflicting())!;
  assert.ok(c.reversalRiskBps >= 2500, `conflicting short-vs-long drift must raise reversal risk (${c.reversalRiskBps})`);
  assert.ok(c.evidence.some((e) => /opposes/.test(e)));
});

test('SKIP is first-class: stale, insufficient, malformed and flat single-venue data all return null', () => {
  assert.equal(read(FIX.stale()), null, 'stale');
  assert.equal(read(FIX.insufficient()), null, 'insufficient observations');
  assert.equal(read(FIX.flatSingle()), null, 'single venue, no drift → nothing beyond the market price');
  const f = FIX.strongUp(); const feats = extractFeatures(f.market, f.history, f.now)!;
  const bad: MarketFeatures = { ...feats, venues: feats.venues.map((v) => ({ ...v, impliedBps: NaN })) };
  assert.equal(compute(bad), null, 'malformed');
  const over: MarketFeatures = { ...feats, venues: feats.venues.map((v) => ({ ...v, impliedBps: 12000 })) };
  assert.equal(compute(over), null, 'out-of-range');
  assert.equal(f.model.reproduce({ nonsense: true }), null); assert.equal(f.model.reproduce(null), null);
});

test('chop: alternating prices → many flips, high reversal risk, low confidence, and the gate refuses', () => {
  const f = FIX.chop(); const r = read(f);
  if (r) {
    assert.ok(r.reversalRiskBps >= LOCK_POLICY.MAX_REVERSAL_BPS, `reversal ${r.reversalRiskBps}`);
    assert.ok(r.confidenceBps < 10000 * CONSTANTS.CONF.flipsChopFactor + 1);
  }
  const m = applyModel(f.market, f.model, f.now);
  const gate = evaluateLockGate({ market: m, read: r, direction: 'YES', priorReads: [], now: f.now, refreshMs: STEP });
  assert.equal(gate.allowed, false);
});

test('probability bounds hold at the extremes; the drift adjustment is capped', () => {
  const hi = series(ramp(20, 9000, 9950).map((k) => ({ k, p: 9900, liq: { k: 50_000, p: 5_000 } })));
  const r = read(hi); if (r) assert.ok(r.vixyBps <= CONSTANTS.P_MAX);
  const lo = series(ramp(20, 1000, 60).map((k) => ({ k, p: 100, liq: { k: 50_000, p: 5_000 } })));
  const r2 = read(lo); if (r2) assert.ok(r2.vixyBps >= CONSTANTS.P_MIN);
  const big = series(ramp(20, 3000, 8000).map((k) => ({ k, p: k, liq: { k: 50_000, p: 50_000 } })));
  const r3 = read(big)!; assert.ok(Math.abs(r3.vixyBps - big.market.marketProbabilityBps!) <= CONSTANTS.MAX_DRIFT_ADJ_BPS + 1, 'cap');
});

test('boundary: drift exactly at the noise floor is noise; one bps above is information', () => {
  const floor = Math.max(CONSTANTS.NOISE_FLOOR_BPS, 100); /* spread 100 in fixtures */
  const at = series(ramp(20, 6000, 6000 + floor).map((k) => ({ k, p: null })));
  assert.equal(read(at), null, 'single venue, drift == floor → no path term → SKIP');
  const above = series(ramp(20, 6000, 6000 + floor + 20).map((k) => ({ k, p: null })));
  const r = read(above); assert.ok(r, 'drift above floor → read'); assert.ok(r!.vixyBps > 6000 + floor);
  assert.equal(r!.confidenceBps <= 10000 * CONSTANTS.CONF.singleVenue, true, 'single venue caps confidence');
});

test('chronological integrity and no look-ahead', () => {
  const h = new ObservationHistory();
  h.record(vm('KALSHI', 6000, T0), T0);
  assert.throws(() => h.record(vm('KALSHI', 6100, T0 + 60_000), T0 + 30_000), LookAheadError, 'a future-stamped observation is refused at the door');
  h.record(vm('KALSHI', 6100, T0 + 60_000), T0 + 60_000);
  h.record(vm('KALSHI', 6200, T0 + 120_000), T0 + 120_000);
  /* Asking "as of" an earlier time must not see later observations. */
  assert.deepEqual(h.get('KALSHI', 'KXTEST-A', T0 + 60_000).map((o) => o.impliedBps), [6000, 6100]);
  assert.ok(h.get('KALSHI', 'KXTEST-A', T0 + 120_000).every((o, i, a) => i === 0 || o.at > a[i - 1].at), 'ascending');
  /* Out-of-order (older than the last) is ignored, never inserted behind. */
  assert.equal(h.record(vm('KALSHI', 5000, T0 + 90_000), T0 + 200_000), false);
  /* The model, asked as of step 10, must equal the model run on a history that stops at step 10. */
  const full = FIX.strongUp();
  const asOf = T0 + 9 * STEP;
  const partial = series(ramp(20, 5800, 6400).slice(0, 10).map((k) => ({ k, p: k - 300, liq: { k: 50_000, p: 5_000 } })));
  const rFull = full.model.read(partial.market, asOf); const rPart = partial.model.read(partial.market, asOf);
  assert.deepEqual(rFull && { v: rFull.vixyBps, c: rFull.confidenceBps }, rPart && { v: rPart.vixyBps, c: rPart.confidenceBps });
  const feats = extractFeatures(full.market, full.history, asOf)!;
  for (const w of Object.values(feats.windows)) assert.ok(w.every((o) => o.at <= asOf), 'no window contains the future');
});

test('deterministic and reproducible: same inputs → same read, through a JSON round-trip, under the same version', () => {
  const f = FIX.strongUp(); const feats = extractFeatures(f.market, f.history, f.now)!;
  const a = compute(feats)!; const b = compute(feats)!;
  assert.equal(a.vixyBps, b.vixyBps); assert.equal(a.confidenceBps, b.confidenceBps); assert.equal(a.reversalRiskBps, b.reversalRiskBps);
  const frozen = JSON.parse(JSON.stringify(a.inputs));
  const c = f.model.reproduce(frozen)!;
  assert.equal(c.vixyBps, a.vixyBps); assert.equal(c.confidenceBps, a.confidenceBps);
  assert.equal(f.model.version, 'vixy-arena-consensus-0.1.0'); assert.equal(CONSTANTS.validated, false);
});

test('lock gate: every reason is named; a high confidence does not bypass stability or direction', () => {
  const f = FIX.strongUp(); const m = applyModel(f.market, f.model, f.now); const r = read(f)!;
  const side = sideOf(m.edgeBps, Math.max(LOCK_POLICY.MIN_EDGE_BPS, 100));
  assert.equal(side, 'YES');
  const noHistory = evaluateLockGate({ market: m, read: r, direction: 'YES', priorReads: [], now: f.now, refreshMs: STEP });
  assert.equal(noHistory.allowed, false); assert.ok(noHistory.reasons.some((x) => x.startsWith('TEMPORAL_STABILITY')));
  const prior: PriorRead[] = [1, 2, 3].map((i) => ({ at: f.now - i * STEP, side: 'YES', edgeBps: m.edgeBps, spreadBps: 100 }));
  const ok = evaluateLockGate({ market: m, read: r, direction: 'YES', priorReads: prior, now: f.now, refreshMs: STEP });
  assert.equal(ok.allowed, true, ok.reasons.join(' | '));
  assert.equal(ok.checks.length, 11); assert.ok(ok.checks.every((c) => c.pass));
  const wrongSide = evaluateLockGate({ market: m, read: r, direction: 'NO', priorReads: prior, now: f.now, refreshMs: STEP });
  assert.equal(wrongSide.allowed, false); assert.ok(wrongSide.reasons.some((x) => x.startsWith('DIRECTIONAL_CONSISTENCY')));
  const flipped: PriorRead[] = [...prior.slice(0, 2), { ...prior[2], side: 'NO', edgeBps: -m.edgeBps! }];
  assert.equal(evaluateLockGate({ market: m, read: r, direction: 'YES', priorReads: flipped, now: f.now, refreshMs: STEP }).allowed, false);
  /* Future prior reads are ignored. */
  const future: PriorRead[] = prior.map((p) => ({ ...p, at: f.now + STEP }));
  assert.equal(evaluateLockGate({ market: m, read: r, direction: 'YES', priorReads: future, now: f.now, refreshMs: STEP }).allowed, false);
  /* Stale market, closing market, no read: refused with the matching reason. */
  const stale: CanonicalMarket = { ...m, health: { ...m.health, status: 'STALE' } };
  assert.ok(evaluateLockGate({ market: stale, read: r, direction: 'YES', priorReads: prior, now: f.now, refreshMs: STEP }).reasons.some((x) => x.startsWith('DATA_FRESH')));
  const closing: CanonicalMarket = { ...m, closesAt: new Date(f.now + STEP).toISOString() };
  assert.ok(evaluateLockGate({ market: closing, read: r, direction: 'YES', priorReads: prior, now: f.now, refreshMs: STEP }).reasons.some((x) => x.startsWith('ENTRY_WINDOW')));
  const none = evaluateLockGate({ market: f.market, read: null, direction: 'YES', priorReads: prior, now: f.now, refreshMs: STEP });
  assert.equal(none.allowed, false); assert.ok(none.reasons.some((x) => x.startsWith('MODEL_READ')));
  /* Confidence alone: a read with 100% confidence and no stability history is still refused. */
  const confident = { ...r, confidenceBps: 10000 };
  assert.equal(evaluateLockGate({ market: m, read: confident, direction: 'YES', priorReads: [], now: f.now, refreshMs: STEP }).allowed, false);
  /* WAIT needs freshness and observations, not a side. */
  assert.equal(evaluateLockGate({ market: m, read: r, direction: 'WAIT', priorReads: [], now: f.now, refreshMs: STEP }).allowed, true);
});

test('feature extraction is honest about missing data: no literals stand in for absent inputs', () => {
  const f = FIX.insufficient(); const feats = extractFeatures(f.market, f.history, f.now)!;
  for (const v of feats.venues) { assert.equal(v.volatilityBps, null); assert.equal(v.driftShortBps, null); }
  const single = FIX.flatSingle(); const sf = extractFeatures(single.market, single.history, single.now)!;
  assert.equal(sf.dispersionBps, null); assert.equal(sf.venues.length, 1); assert.equal(sf.venues[0].flips, 0);
  assert.equal(extractFeatures({ ...f.market, marketProbabilityBps: null }, f.history, f.now), null);
});

test('calibration report: nulls below the floor; correct Brier/log-loss/hit-rate; disjoint buckets; chronological holdout never overlaps the tuning set', async () => {
  const { openDb } = await import('../db.ts');
  const { calibrationReport, metrics, CALIBRATION } = await import('../ledger/calibration.ts');
  const db = openDb(':memory:');
  db.prepare("INSERT INTO users (id, email, handle, password_hash, created_at) VALUES ('u1','a@b.c','a','x',0)").run();
  const ins = db.prepare(`INSERT INTO calls (id, user_id, market_id, market_title, direction, entry_bps, vixy_bps, edge_bps, confidence_bps, stake_points, model_version, evidence, origin, market_closes_at, quoted_at, locked_at)
    VALUES (?, 'u1', ?, 't', ?, ?, ?, ?, ?, 10, ?, '[]', 'LIVE', '2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z', ?)`);
  const set = db.prepare("INSERT INTO settlements (call_id, outcome, result, source, resolved_at, points_delta, settled_at) VALUES (?, ?, ?, 'test', '2026-01-02T00:00:00Z', 0, ?)");
  /* 10 settled: below the floor → all nulls. */
  for (let i = 0; i < 10; i++) { ins.run(`c${i}`, `m${i}`, 'YES', 5000, 7000, 2000, 6500, 'v-a', 1000 + i); set.run(`c${i}`, i % 2 ? 'YES' : 'NO', i % 2 ? 'WON' : 'LOST', 2000 + i); }
  let rep = calibrationReport(db, 5000);
  assert.equal(rep.status, 'INSUFFICIENT'); assert.equal(rep.inSample.brier, null); assert.deepEqual(rep.byConfidence, []);
  /* 60 settled, all YES at 70% with a 50% hit rate: Brier = 0.5·0.09 + 0.5·0.49 = 0.29; calibration error 2000 bps. */
  for (let i = 10; i < 60; i++) { ins.run(`c${i}`, `m${i}`, 'YES', 5000, 7000, 2000, i < 30 ? 6500 : 8500, i < 45 ? 'v-a' : 'v-b', 1000 + i); set.run(`c${i}`, i % 2 ? 'YES' : 'NO', i % 2 ? 'WON' : 'LOST', 2000 + i); }
  rep = calibrationReport(db, 5000);
  assert.equal(rep.status, 'IN_SAMPLE_WITH_HOLDOUT'); assert.equal(rep.settled, 60);
  assert.equal(rep.inSample.hitRateBps, 5000); assert.equal(rep.inSample.brier, 0.29); assert.equal(rep.inSample.calibrationErrorBps, 2000);
  assert.equal(rep.inSample.logLoss, Math.round(((-Math.log(0.7) - Math.log(0.3)) / 2) * 10000) / 10000);
  assert.equal(rep.holdout!.n, Math.floor(60 * CALIBRATION.HOLDOUT_FRACTION));
  assert.equal(rep.byConfidence.reduce((a, b) => a + b.n, 0), 60, 'buckets are disjoint and exhaustive');
  assert.equal(rep.byEdge.reduce((a, b) => a + b.n, 0), 60);
  assert.deepEqual(rep.byModelVersion.map((v) => [v.modelVersion, v.metrics.n]), [['v-a', 45], ['v-b', 15]]);
  assert.equal(rep.lockVsSkip, null);
  assert.deepEqual(metrics([]), { n: 0, hitRateBps: null, brier: null, logLoss: null, meanPredictedBps: null, calibrationErrorBps: null });
  db.close();
});
