/* =============================================================
   BACKTEST — the model, replayed on real settled venue history.

   This is NOT a new evaluation. It reuses, unmodified:
     normalizeKalshiMarket  (venue layer)      buildCanonical (canonical layer)
     ConsensusModel + applyModel (the model)   evaluateLockGate (the lock policy)
     recordObservations / recordReads / recordOutcome + evaluate() (the ledger)

   The only thing that differs from production is the clock: instead of a
   30 s poll of open markets, it steps one minute at a time through
   archived 1-minute Kalshi candlesticks for markets that have SINCE
   SETTLED, and writes what the model said at each step. The outcome is
   inserted only with resolved_at = the market's close, which is after
   every read, so the evaluation's chronological join is the same join it
   runs in production.

   Look-ahead is structurally impossible here: `now` is the bar's own
   timestamp, the observation window contains only bars at or before it,
   the model never receives the outcome, and the outcome row is written
   after the whole replay of that market.

   Archive format (JSON array, one entry per market):
     [ticker, series, closeTs(s), 'yes'|'no', startTs(s), [[tsOffsetS, bidBps, askBps, oiUsd, volUsd], ...]]
   ============================================================= */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CanonicalMarket } from '../../types/index.ts';
import { normalizeKalshiMarket } from '../engine/venues/kalshi.ts';
import { buildCanonical } from '../engine/canonical.ts';
import { applyModel, type ModelRead, type VixyModel } from '../engine/model.ts';
import { ConsensusModel } from '../engine/model/consensusModel.ts';
import { ContinuationModel } from '../engine/model/continuationModel.ts';
import { ObservationHistory } from '../engine/model/observations.ts';
import { evaluateLockGate, sideOf, LOCK_POLICY, type PriorRead } from '../engine/model/lockPolicy.ts';
import { ensureObservationSchema, recordObservations, recordReads, recordOutcome, type ReadRecord } from '../ledger/observationStore.ts';
import { evaluate, decisionsFrom, EVAL, type Decision } from '../ledger/evaluation.ts';

export type ArchiveRow = [string, string, number, string, number, number[][]];

/** One archived market → the VenueMarket the venue layer would have produced at each bar. */
export function barsToVenueMarkets(row: ArchiveRow) {
  const [ticker, series, closeTs, , startTs, bars] = row;
  const eventTicker = ticker.slice(0, ticker.lastIndexOf('-')) || ticker;
  const closeIso = new Date(closeTs * 1000).toISOString();
  return bars.map(([off, bid, ask, oi, vol]) => {
    const at = (startTs + off) * 1000;
    const raw = {
      ticker, event_ticker: eventTicker, title: ticker, status: 'active',
      yes_bid_dollars: (bid / 10000).toFixed(4), yes_ask_dollars: (ask / 10000).toFixed(4),
      open_interest_fp: String(oi), volume_fp: String(vol), volume_24h_fp: String(vol),
      close_time: closeIso,
    } as never;
    return { at, vm: normalizeKalshiMarket(raw, { series_ticker: series, event_ticker: eventTicker, title: ticker }, new Date(at).toISOString()) };
  });
}

/* -------------------------------------------------------------
   PLACEBO — the same run with the model's adjustment reflected about
   the market's own price (vixy' = 2 × market − vixy). Every other
   number in the pipeline is identical. If the harness manufactures
   skill, the placebo shows the same positive skill; if the measured
   skill comes from the drift term itself, the placebo's skill is
   the negative of it. This is the control, not a variant model.
   ------------------------------------------------------------- */
class ReflectedModel implements VixyModel {
  readonly version: string;
  private inner: VixyModel;
  constructor(inner: VixyModel) { this.inner = inner; this.version = `${inner.version}+reflected-placebo`; }
  private flip(r: ModelRead | null): ModelRead | null {
    if (!r) return null;
    const f = r.inputs as { consensusBps: number };
    const v = Math.min(9900, Math.max(100, 2 * f.consensusBps - r.vixyBps));
    return { ...r, vixyBps: v, rationale: `PLACEBO (adjustment reflected about the market price). ${r.rationale}` };
  }
  read(m: CanonicalMarket, now: number) { return this.flip(this.inner.read(m, now)); }
  reproduce(i: unknown) { return this.flip(this.inner.reproduce(i)); }
}

export interface ReplayStats { markets: number; replayed: number; steps: number; reads: number; skips: number; gateAllowed: number; noBars: number }

/** Replay every archived market into `db`. Returns counters only — all judgement comes from evaluate(). */
export type ModelChoice = 'consensus' | 'continuation';

export function replay(db: DatabaseSync, rows: ArchiveRow[], refreshMs = 60_000, placebo = false, choice: ModelChoice = 'consensus'): ReplayStats {
  ensureObservationSchema(db);
  const s: ReplayStats = { markets: rows.length, replayed: 0, steps: 0, reads: 0, skips: 0, gateAllowed: 0, noBars: 0 };
  for (const row of rows) {
    const [ticker, , closeTs, result] = row;
    const seq = barsToVenueMarkets(row);
    if (seq.length < 7) { s.noBars++; continue; }
    const history = new ObservationHistory(80);
    const base: VixyModel = choice === 'continuation' ? new ContinuationModel(history) : new ConsensusModel(history);
    const model: VixyModel = placebo ? new ReflectedModel(base) : base;
    const priorReads: PriorRead[] = [];
    const records: ReadRecord[] = [];
    for (const { at, vm } of seq) {
      /* MAX_AGE_MS is 60 s and the bars are 60 s apart: the read happens at the bar's own timestamp,
         which is what a live poll would have seen one refresh later. */
      const now = at;
      history.record(vm, now);
      recordObservations(db, [vm], now);
      const built = buildCanonical([vm], now);
      const m0 = built.markets[0];
      if (!m0) continue;
      const m = applyModel(m0, model, now);
      const spread = Math.max(...m.venueRefs.map((v) => v.spreadBps ?? 0), 0);
      const side = sideOf(m.edgeBps, Math.max(LOCK_POLICY.MIN_EDGE_BPS, spread));
      const read = model.read(m, now);
      const gate = read ? evaluateLockGate({ market: m, read, direction: side === 'NONE' ? 'YES' : side, priorReads: priorReads.slice(), now, refreshMs }) : null;
      priorReads.push({ at: now, side, edgeBps: m.edgeBps, spreadBps: spread });
      if (priorReads.length > 10) priorReads.splice(0, priorReads.length - 10);
      const ref = m.venueRefs[0] ?? null;
      records.push({
        at: now, marketId: m.id, category: m.category, venue: ref?.venue ?? null, venueMarketId: ref?.venueMarketId ?? null, modelVersion: model.version,
        marketBps: m.marketProbabilityBps, vixyBps: m.vixyProbabilityBps, edgeBps: m.edgeBps, confidenceBps: m.confidenceBps, reversalRiskBps: m.reversalRiskBps,
        side, skipped: read === null, skipReason: read === null ? 'replay: model returned no read' : null,
        gateAllowed: gate ? gate.allowed : null, gateReasons: gate ? gate.reasons.join(' · ') : null, closesAt: m.closesAt,
      });
      s.steps++; if (read) s.reads++; else s.skips++; if (gate?.allowed) s.gateAllowed++;
    }
    if (!records.length) { s.noBars++; continue; }
    recordReads(db, records);
    /* The outcome is written last, stamped at the market's close — after every read of it. */
    recordOutcome(db, {
      marketId: records[0].marketId, venue: 'KALSHI', venueMarketId: ticker,
      outcome: result === 'yes' ? 'YES' : 'NO', source: `kalshi settled market ${ticker}`,
      resolvedAt: new Date(closeTs * 1000).toISOString(),
    }, closeTs * 1000);
    s.replayed++;
  }
  return s;
}


/* -------------------------------------------------------------
   SIGNIFICANCE — is the skill number distinguishable from zero?

   evaluate() reports the Brier difference. It does not say whether a
   difference that small, on a sample that small, means anything. This
   does: a paired bootstrap over the per-decision Brier differences
   (model minus market, same decision, same outcome), 20 000 resamples,
   with a fixed seed so the interval is reproducible. If the 95 %
   interval contains zero, the model has NOT demonstrated information,
   whatever the point estimate says.
   ------------------------------------------------------------- */
export interface Significance { n: number; meanDiff: number | null; ci95: [number, number] | null; pTwoSided: number | null; note: string }

const mulberry = (seed: number) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export function significance(ds: Decision[], resamples = 20_000, seed = 20260907): Significance {
  /* Paired per-decision-difference-: market Brier − model Brier. Positive = the model was closer. */
  const d = ds.filter((x) => x.hit !== null && x.pSide !== null && x.pMarketSide !== null)
    .map((x) => { const y = x.hit ? 1 : 0; return (x.pMarketSide! - y) ** 2 - (x.pSide! - y) ** 2; });
  if (d.length < 5) return { n: d.length, meanDiff: null, ci95: null, pTwoSided: null, note: 'too few paired decisions to say anything' };
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const m = mean(d);
  const rnd = mulberry(seed);
  const means: number[] = [];
  for (let r = 0; r < resamples; r++) { let s = 0; for (let i = 0; i < d.length; i++) s += d[(rnd() * d.length) | 0]; means.push(s / d.length); }
  means.sort((a, b) => a - b);
  const lo = means[Math.floor(0.025 * resamples)], hi = means[Math.floor(0.975 * resamples)];
  /* Two-sided bootstrap p: how often a resample of the centred distribution is at least as extreme. */
  const centred = means.map((x) => x - m);
  const p = Math.min(1, 2 * Math.min(centred.filter((x) => x >= Math.abs(m) - m + m).length, centred.filter((x) => x <= -Math.abs(m)).length) / resamples + 1 / resamples);
  const r4 = (x: number) => Math.round(x * 1e5) / 1e5;
  const crossesZero = lo <= 0 && hi >= 0;
  return {
    n: d.length, meanDiff: r4(m), ci95: [r4(lo), r4(hi)], pTwoSided: Math.round(p * 1000) / 1000,
    note: crossesZero
      ? 'The 95% interval contains zero: on this sample the model is NOT distinguishable from the venue price. No predictive information is demonstrated.'
      : m > 0 ? 'The 95% interval excludes zero on the positive side. That is evidence on THIS sample only — one venue, one period, one decision per market.'
              : 'The 95% interval excludes zero on the NEGATIVE side: the model was measurably worse than the venue price.',
  };
}

/** One harvest line → one archived market. See the fixture README for the format. */
export function parseHarvestLine(line: string): ArchiveRow | null {
  const parts = line.trim().split('|');
  if (parts.length !== 8) return null;
  const [suffix, series, closeTs, r, startTs, oi, vol, bars] = parts;
  const b: number[][] = [];
  bars.split(',').forEach((tok, i) => {
    if (tok === '-') return;
    const [bid, sp] = tok.split('.').map(Number);
    if (!Number.isFinite(bid) || !Number.isFinite(sp)) return;
    b.push([i * 60, bid * 100, (bid + sp) * 100, Number(oi) || 0, Number(vol) || 0]);
  });
  return [`${series}-${suffix}`, series, Number(closeTs), r === 'y' ? 'yes' : 'no', Number(startTs), b];
}

/** Reads a directory of harvest .txt files (and/or pre-parsed .json archives). */
export function loadArchive(dir: string): ArchiveRow[] {
  const out: ArchiveRow[] = []; const seen = new Set<string>();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    out.push(...(JSON.parse(readFileSync(join(dir, f), 'utf8')) as ArchiveRow[]));
  }
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.txt')).sort()) {
    for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
      const row = parseHarvestLine(line);
      if (row && !seen.has(row[0])) { seen.add(row[0]); out.push(row); }
    }
  }
  /* Chronological: the evaluation's train/out-of-sample split must be by real time. */
  return out.sort((a, b) => a[2] - b[2]);
}

if (process.argv[1] && process.argv[1].endsWith('backtest.ts')) {
  const dir = process.argv[2] ?? 'server/test/fixtures/backtest';
  const rows = loadArchive(dir);
  const db = new DatabaseSync(':memory:');
  const t0 = Date.now();
  const placebo = process.argv.includes('--placebo');
  const choice: ModelChoice = process.argv.includes('--model=continuation') ? 'continuation' : 'consensus';
  const stats = replay(db, rows, 60_000, placebo, choice);
  const report = evaluate(db, Date.now());
  const scored = db.prepare(`SELECT r.at, r.market_id, r.category, r.venue, r.market_bps, r.vixy_bps, r.edge_bps, r.confidence_bps, r.reversal_risk_bps, r.side, r.skipped, r.gate_allowed, o.outcome, o.resolved_at
    FROM model_reads r JOIN market_outcomes o ON o.market_id = r.market_id
    WHERE o.outcome IN ('YES','NO') AND o.resolved_at_ms > r.at ORDER BY r.at ASC`).all() as never[];
  const ds = decisionsFrom(scored);
  const cut = Math.floor(ds.length * EVAL.TRAIN_FRACTION);
  const oos = ds.slice(cut);
  const sig = {
    oosLocks: significance(oos.filter((d) => d.kind === 'LOCK')),
    oosSidedSkips: significance(oos.filter((d) => d.kind === 'SKIP' && d.side !== 'NONE')),
    allLocks: significance(ds.filter((d) => d.kind === 'LOCK')),
    allSided: significance(ds.filter((d) => d.side !== 'NONE')),
  };
  console.log(JSON.stringify({ archive: dir, model: choice, placebo, stats, elapsedMs: Date.now() - t0, significance: sig, report }, null, 2));
}
