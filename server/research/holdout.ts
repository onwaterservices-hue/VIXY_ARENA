/* =============================================================
   THE HOLDOUT READ — run once.

   Scores the SHIPPED implementation (not the research prototype) of
   vixy-arena-consensus-0.2.0 on the 1 860 markets sealed on
   2026-09-07 before any research began. Two numbers, both decided
   before this file was ever run:

     PRIMARY   Brier of the model's estimate at the decision point
               against the venue's own price on the same markets,
               paired bootstrap. This is "is the estimate better".
     SECONDARY the lock-gated evaluation the product itself runs.

   Whatever comes back is what gets reported.
   ============================================================= */
import { DatabaseSync } from 'node:sqlite';
import { unseal, split } from './corpus.ts';
import { replay } from '../tools/backtest.ts';
import { evaluate } from '../ledger/evaluation.ts';

const mulberry = (seed: number) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function paired(d: number[], seed = 20260907, resamples = 20_000) {
  const n = d.length; if (!n) return null;
  const m = d.reduce((a, x) => a + x, 0) / n;
  const rnd = mulberry(seed); const means: number[] = [];
  for (let r = 0; r < resamples; r++) { let s = 0; for (let i = 0; i < n; i++) s += d[(rnd() * n) | 0]; means.push(s / n); }
  means.sort((a, b) => a - b);
  const centred = means.map((x) => x - m);
  const p = Math.min(1, 2 * Math.min(centred.filter((x) => x >= Math.abs(m)).length, centred.filter((x) => x <= -Math.abs(m)).length) / resamples + 1 / resamples);
  const r5 = (x: number) => Math.round(x * 1e5) / 1e5;
  return { n, gain: r5(m), ci: [r5(means[Math.floor(0.025 * resamples)]), r5(means[Math.floor(0.975 * resamples)])] as [number, number], p: Math.round(p * 1000) / 1000 };
}

function scoreOne(model: 'consensus' | 'continuation', rows: ReturnType<typeof split>['holdout']) {
  const db = new DatabaseSync(':memory:');
  const stats = replay(db, rows, 60_000, false, model);
  /* The decision point is the last read of each market. */
  const q = db.prepare(`SELECT r.market_id, r.market_bps, r.vixy_bps, o.outcome FROM model_reads r
    JOIN market_outcomes o ON o.market_id = r.market_id
    WHERE r.at = (SELECT MAX(at) FROM model_reads r2 WHERE r2.market_id = r.market_id)
      AND o.resolved_at_ms > r.at AND o.outcome IN ('YES','NO')`).all() as { market_bps: number | null; vixy_bps: number | null; outcome: string }[];
  const d: number[] = []; let brier = 0, mkt = 0, withRead = 0;
  for (const r of q) {
    if (r.market_bps === null) continue;
    const y = r.outcome === 'YES' ? 1 : 0;
    const pm = r.market_bps / 10000;
    const pv = r.vixy_bps === null ? pm : r.vixy_bps / 10000;   /* SKIP = the model says nothing = the market's price */
    if (r.vixy_bps !== null) withRead++;
    brier += (pv - y) ** 2; mkt += (pm - y) ** 2;
    d.push((pm - y) ** 2 - (pv - y) ** 2);
  }
  const r5 = (x: number) => Math.round(x * 1e5) / 1e5;
  return { model, stats, scored: d.length, withRead, brier: r5(brier / (d.length || 1)), marketBrier: r5(mkt / (d.length || 1)), primary: paired(d), locks: evaluate(db, Date.now()) };
}

const rows = unseal('final scoring of vixy-arena-consensus-0.2.0, the model selected on DEV — see docs/MODEL-RESEARCH.md');
const s = split();
const out = {
  sealedBoundary: new Date(s.boundaryTs * 1000).toISOString(), holdoutHash: s.holdoutHash, holdoutMarkets: rows.length,
  continuation: scoreOne('continuation', rows),
  consensus_0_1_0_for_reference: scoreOne('consensus', rows),
};
console.log(JSON.stringify({
  ...out,
  continuation: { ...out.continuation, locks: { decisions: out.continuation.locks.decisions, oos: out.continuation.locks.oos, verdict: out.continuation.locks.verdict } },
  consensus_0_1_0_for_reference: { ...out.consensus_0_1_0_for_reference, locks: { decisions: out.consensus_0_1_0_for_reference.locks.decisions, verdict: out.consensus_0_1_0_for_reference.locks.verdict } },
}, null, 2));
