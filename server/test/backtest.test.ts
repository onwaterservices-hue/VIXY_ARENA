/* =============================================================
   BACKTEST HARNESS — the replay must be incapable of look-ahead.

   These tests do not ask whether the model is good. They ask
   whether the replay could have cheated, and whether it reuses the
   production code path rather than a parallel one.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { barsToVenueMarkets, replay, type ArchiveRow } from '../tools/backtest.ts';
import { evaluate } from '../ledger/evaluation.ts';
import { CONSTANTS } from '../engine/model/consensusModel.ts';

const START = 1_780_000_000;           /* seconds */
const CLOSE = START + 5400;            /* the archive window ends 3600 s before close */

/** A market whose price walks up from 40c to 70c over 30 one-minute bars. */
function rising(ticker = 'KXTEST-A', result: 'yes' | 'no' = 'yes'): ArchiveRow {
  const bars: number[][] = [];
  for (let i = 0; i < 30; i++) bars.push([i * 60, (4000 + i * 100), (4000 + i * 100) + 100, 50_000, 1_000]);
  return [ticker, 'KXTEST', CLOSE, result, START, bars];
}

test('bars become venue rows with ascending stamps, OPEN state and no outcome', () => {
  const seq = barsToVenueMarkets(rising());
  assert.equal(seq.length, 30);
  for (let i = 1; i < seq.length; i++) assert.ok(seq[i].at > seq[i - 1].at, 'timestamps ascend');
  for (const { vm, at } of seq) {
    assert.equal(vm.status, 'OPEN', 'a replayed bar is never a settled row');
    assert.equal(vm.result, null, 'the outcome never travels with an observation');
    assert.equal(new Date(vm.fetchedAt).getTime(), at);
    assert.equal(vm.venue, 'KALSHI');
    /* mid of the book, in bps, exactly as the venue layer computes it live */
    assert.equal(vm.impliedBps, Math.round(((vm.bidBps ?? 0) + (vm.askBps ?? 0)) / 2));
  }
});

test('every recorded outcome is stamped after every read of that market', () => {
  const db = new DatabaseSync(':memory:');
  replay(db, [rising('KXTEST-A', 'yes'), rising('KXTEST-B', 'no')]);
  const rows = db.prepare(`SELECT r.at AS read_at, o.resolved_at_ms AS out_at FROM model_reads r JOIN market_outcomes o ON o.market_id = r.market_id`).all() as { read_at: number; out_at: number }[];
  assert.ok(rows.length > 0);
  for (const r of rows) assert.ok(r.out_at > r.read_at, 'no read may be contemporaneous with or later than its outcome');
});

test('observations stop before the outcome and carry only what the venue said', () => {
  const db = new DatabaseSync(':memory:');
  replay(db, [rising()]);
  const obs = db.prepare('SELECT at, implied_bps, status FROM observations ORDER BY at').all() as { at: number; implied_bps: number; status: string }[];
  assert.equal(obs.length, 30);
  assert.equal(obs.at(-1)!.at, (START + 29 * 60) * 1000);
  assert.ok(obs.at(-1)!.at < CLOSE * 1000, 'the last observation precedes the close');
  for (const o of obs) assert.equal(o.status, 'OPEN');
});

test('the replay is deterministic and version-stamped', () => {
  const a = new DatabaseSync(':memory:'); const b = new DatabaseSync(':memory:');
  const archive = [rising('KXTEST-A', 'yes'), rising('KXTEST-B', 'no')];
  replay(a, archive); replay(b, archive);
  const q = 'SELECT at, market_id, model_version, market_bps, vixy_bps, edge_bps, confidence_bps, side, skipped, gate_allowed FROM model_reads ORDER BY at, market_id';
  assert.deepEqual(JSON.stringify(a.prepare(q).all()), JSON.stringify(b.prepare(q).all()));
  const versions = (a.prepare('SELECT DISTINCT model_version AS v FROM model_reads').all() as { v: string }[]).map((r) => r.v);
  assert.deepEqual(versions, [CONSTANTS.version]);
});

test('a market with fewer bars than the model needs is skipped, not invented', () => {
  const short: ArchiveRow = ['KXTEST-SHORT', 'KXTEST', CLOSE, 'yes', START, [[0, 4000, 4100, 1000, 10], [60, 4100, 4200, 1000, 10]]];
  const db = new DatabaseSync(':memory:');
  const s = replay(db, [short]);
  assert.equal(s.replayed, 0);
  assert.equal(s.noBars, 1);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM model_reads').get() as { n: number }).n, 0);
});

test('evaluate refuses to report on a sample below its floors', () => {
  const db = new DatabaseSync(':memory:');
  replay(db, [rising('KXTEST-A', 'yes'), rising('KXTEST-B', 'no')]);
  const r = evaluate(db, Date.now());
  assert.equal(r.status, 'INSUFFICIENT');
  assert.equal(r.oos, null);
  assert.match(r.verdict, /No predictive information is claimed/);
});

test('a mirrored archive gives mirrored reads (no directional bias in the replay)', () => {
  /* Same path, reflected about 50%: the model's edge must be equal and opposite. */
  const up = rising('KXTEST-UP', 'yes');
  const down: ArchiveRow = ['KXTEST-DOWN', 'KXTEST', CLOSE, 'no', START, up[5].map(([t, b, a, oi, v]) => [t, 10000 - a, 10000 - b, oi, v])];
  const db = new DatabaseSync(':memory:');
  replay(db, [up, down]);
  const rows = db.prepare('SELECT market_id, at, edge_bps FROM model_reads WHERE edge_bps IS NOT NULL ORDER BY at').all() as { market_id: string; at: number; edge_bps: number }[];
  const byAt = new Map<number, { u?: number; d?: number }>();
  for (const r of rows) { const e = byAt.get(r.at) ?? {}; if (r.market_id.includes('UP')) e.u = r.edge_bps; else e.d = r.edge_bps; byAt.set(r.at, e); }
  let compared = 0;
  for (const [, e] of byAt) if (e.u !== undefined && e.d !== undefined) { assert.equal(e.u, -e.d, 'mirrored paths must give mirrored edges'); compared++; }
  assert.ok(compared > 5, `expected mirrored reads to compare, got ${compared}`);
});

/* ---------- consensus-0.2.0: the continuation model ---------- */
import { CONSTANTS as C2, compute as compute2, ContinuationModel } from '../engine/model/continuationModel.ts';
import { ObservationHistory } from '../engine/model/observations.ts';
import { buildCanonical } from '../engine/canonical.ts';

function windowOf(prices: number[], spread = 100): ArchiveRow {
  const bars = prices.map((p, i) => [i * 60, p - spread / 2, p + spread / 2, 50_000, 1_000]);
  return ['KXTEST-C', 'KXTEST', CLOSE, 'yes', START, bars];
}
function readFor(row: ArchiveRow) {
  const history = new ObservationHistory(80);
  const model = new ContinuationModel(history);
  let last = null; let at = 0;
  for (const { at: t, vm } of barsToVenueMarkets(row)) { history.record(vm, t); at = t; last = vm; }
  const m = buildCanonical([last!], at).markets[0];
  return { read: model.read(m, at), market: m };
}

test('0.2.0 pushes the estimate toward the top of the range and away from the bottom', () => {
  const flatThenUp = Array.from({ length: 30 }, (_, i) => (i < 20 ? 4000 : 4000 + (i - 19) * 100));
  const flatThenDown = flatThenUp.map((p) => 10000 - p);
  const up = readFor(windowOf(flatThenUp)); const down = readFor(windowOf(flatThenDown));
  assert.ok(up.read, 'a moving market gets a read');
  assert.ok(down.read, 'the mirror gets a read too');
  assert.ok(up.read!.vixyBps > up.market.marketProbabilityBps!, 'top of range → above the market');
  assert.ok(down.read!.vixyBps < down.market.marketProbabilityBps!, 'bottom of range → below the market');
  /* mirrored paths must give mirrored estimates */
  assert.equal(up.read!.vixyBps, 10000 - down.read!.vixyBps);
});

test('0.2.0 SKIPs a single-venue market whose range is inside the book', () => {
  /* a 50-bps wiggle with a 100-bps spread: range never clears 2 × spread */
  const noise = Array.from({ length: 30 }, (_, i) => 5000 + (i % 2 ? 25 : -25));
  const { read } = readFor(windowOf(noise, 100));
  assert.equal(read, null, 'bid-ask bounce is not movement');
});

test('0.2.0 stays inside its probability bounds and is reproducible under its own version', () => {
  const steep = Array.from({ length: 30 }, (_, i) => Math.min(9500, 8000 + i * 60));
  const { read } = readFor(windowOf(steep));
  assert.ok(read);
  assert.ok(read!.vixyBps >= C2.P_MIN && read!.vixyBps <= C2.P_MAX);
  const again = compute2(read!.inputs as never);
  assert.equal(again!.vixyBps, read!.vixyBps, 'the frozen inputs reproduce the same estimate');
  assert.equal(C2.version, 'vixy-arena-consensus-0.2.0');
  assert.equal(C2.validated, false);
  assert.equal(C2.holdout.verdict, 'did not beat the venue price');
});

test('0.2.0 never claims to be validated in production', () => {
  const flatThenUp = Array.from({ length: 30 }, (_, i) => (i < 20 ? 4000 : 4000 + (i - 19) * 100));
  const { read } = readFor(windowOf(flatThenUp));
  assert.match(read!.rationale, /unvalidated/);
  assert.doesNotMatch(read!.rationale, /proven|profitable|accurate|guaranteed/i);
});

test('0.2.0 refuses to push past its own ceiling rather than inventing headroom', () => {
  /* A market already at the model's maximum has nowhere to be nudged: the term is zero and,
     with one venue, that is a SKIP — not a 99.9 % estimate. */
  const atCap = Array.from({ length: 30 }, (_, i) => Math.min(9900, 9000 + i * 40));
  const { read } = readFor(windowOf(atCap));
  assert.equal(read, null);
});
