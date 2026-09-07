/* =============================================================
   SETTLEMENT SWEEP — asks the engine for each unsettled lock's
   venue outcome and, when one exists, settles THAT lock against it.
   Nothing here looks at a current price. A lock whose market has
   not closed is not even asked about.
   ============================================================= */
import type { DB } from '../db.ts';
import type { EngineSource } from '../engine/EngineSource.ts';
import { settleCall, unsettledCalls } from './calls.ts';
import { marketsAwaitingOutcome, recordOutcome } from './observationStore.ts';

export interface SweepReport { checked: number; settled: number; pending: number; errors: string[]; outcomesRecorded: number }

export async function settlementSweep(db: DB, engine: EngineSource, now = Date.now()): Promise<SweepReport> {
  const due = unsettledCalls(db).filter((c) => new Date(c.market_closes_at).getTime() <= now);
  const report: SweepReport = { checked: 0, settled: 0, pending: 0, errors: [], outcomesRecorded: 0 };
  /* One venue lookup per market, not per call. */
  const byMarket = new Map<string, typeof due>();
  for (const c of due) { const l = byMarket.get(c.market_id) ?? []; l.push(c); byMarket.set(c.market_id, l); }
  for (const [marketId, calls] of byMarket) {
    report.checked += calls.length;
    try {
      const res = await engine.resolve(marketId);
      if (!res) { report.pending += calls.length; continue; }
      for (const c of calls) { if (settleCall(db, c.id, res, now)) report.settled++; }
    } catch (e) { report.pending += calls.length; report.errors.push(`${marketId}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  /* Outcomes for every observed market that has closed — locked or not — so skips can be scored too. */
  for (const m of marketsAwaitingOutcome(db, now)) {
    try {
      const res = await engine.resolve(m.market_id);
      if (res && recordOutcome(db, { marketId: m.market_id, venue: m.venue, venueMarketId: m.venue_market_id, outcome: res.outcome, source: res.source, resolvedAt: res.resolvedAt }, now)) report.outcomesRecorded++;
    } catch (e) { report.errors.push(`${m.market_id}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return report;
}

/** Run the sweep on an interval. Returns a stop function. */
export function startSettlementLoop(db: DB, engine: EngineSource, everyMs: number, log: (r: SweepReport) => void = () => {}): () => void {
  const t = setInterval(async () => { try { log(await settlementSweep(db, engine)); } catch (e) { console.error('[settlement]', e); } }, everyMs);
  return () => clearInterval(t);
}
