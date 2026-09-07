/* =============================================================
   CHRONOLOGICAL EVALUATION — did the model know anything?

   Scores what the model WROTE DOWN at the time (`model_reads`)
   against what the venue PUBLISHED later (`market_outcomes`).
   Nothing is recomputed, so nothing can peek. Decisions are
   ordered by time and split: the earlier part is TRAIN (nothing
   in this repository tunes on it — it is reported so the split is
   visible), the later part is OUT-OF-SAMPLE. Below the sample
   floors every number is null and the status says INSUFFICIENT.
   A model that does not beat the market's own price here does not
   demonstrate predictive information, and the report says so.
   ============================================================= */
import type { DatabaseSync } from 'node:sqlite';

export const EVAL = { MIN_DECISIONS: 30, MIN_OOS: 30, TRAIN_FRACTION: 0.8, MIN_BUCKET: 10 } as const;

interface ReadRow { at: number; market_id: string; category: string | null; venue: string | null; market_bps: number | null; vixy_bps: number | null; edge_bps: number | null; confidence_bps: number | null; reversal_risk_bps: number | null; side: 'YES' | 'NO' | 'NONE'; skipped: number; gate_allowed: number | null; outcome: 'YES' | 'NO'; resolved_at: string }

export interface Decision {
  marketId: string; at: number; kind: 'LOCK' | 'SKIP'; side: 'YES' | 'NO' | 'NONE';
  pSide: number | null; pMarketSide: number | null; hit: boolean | null;
  edgeBps: number | null; confidenceBps: number | null; reversalRiskBps: number | null; category: string | null; venue: string | null;
}

export interface Metrics { n: number; hitRateBps: number | null; brier: number | null; marketBrier: number | null; logLoss: number | null; calibrationErrorBps: number | null; skillVsMarket: number | null }

export interface Bucket { label: string; metrics: Metrics }

export interface EvaluationReport {
  status: 'INSUFFICIENT' | 'EVALUATED';
  modelVersions: string[];
  observations: number; reads: number; outcomes: number;
  decisions: { total: number; locks: number; skips: number; skipsWithSide: number };
  split: { trainUntil: string | null; train: number; oos: number };
  train: { locks: Metrics; skipsIfLocked: Metrics };
  oos: { locks: Metrics; skipsIfLocked: Metrics } | null;
  oosBuckets: { edge: Bucket[]; confidence: Bucket[]; reversal: Bucket[]; category: Bucket[]; venue: Bucket[] } | null;
  verdict: string;
  computedAt: string;
}

const clamp01 = (p: number) => Math.min(0.99, Math.max(0.01, p));

export function metrics(ds: Decision[]): Metrics {
  const g = ds.filter((d) => d.hit !== null && d.pSide !== null);
  if (!g.length) return { n: ds.length, hitRateBps: null, brier: null, marketBrier: null, logLoss: null, calibrationErrorBps: null, skillVsMarket: null };
  const n = g.length;
  const hits = g.filter((d) => d.hit).length;
  const brier = g.reduce((a, d) => a + (d.pSide! - (d.hit ? 1 : 0)) ** 2, 0) / n;
  const mk = g.filter((d) => d.pMarketSide !== null);
  const marketBrier = mk.length ? mk.reduce((a, d) => a + (d.pMarketSide! - (d.hit ? 1 : 0)) ** 2, 0) / mk.length : null;
  const logLoss = g.reduce((a, d) => a - Math.log(d.hit ? clamp01(d.pSide!) : 1 - clamp01(d.pSide!)), 0) / n;
  const meanP = g.reduce((a, d) => a + d.pSide!, 0) / n;
  const r4 = (x: number) => Math.round(x * 10000) / 10000;
  return {
    n, hitRateBps: Math.round((hits / n) * 10000), brier: r4(brier), marketBrier: marketBrier === null ? null : r4(marketBrier), logLoss: r4(logLoss),
    calibrationErrorBps: Math.round(Math.abs(meanP - hits / n) * 10000),
    /* Positive = the model's probability was closer to what happened than the venue's price. This is the only number that means "information". */
    skillVsMarket: marketBrier === null ? null : r4(marketBrier - brier),
  };
}

/** One decision per market: the first read the policy would have allowed (LOCK), else the first sided read (SKIP with a side), else SKIP. */
export function decisionsFrom(rows: ReadRow[]): Decision[] {
  const byMarket = new Map<string, ReadRow[]>();
  for (const r of rows) { const l = byMarket.get(r.market_id) ?? []; l.push(r); byMarket.set(r.market_id, l); }
  const out: Decision[] = [];
  for (const [marketId, list] of byMarket) {
    list.sort((a, b) => a.at - b.at);
    const lock = list.find((r) => r.gate_allowed === 1 && r.side !== 'NONE');
    const sided = lock ?? list.find((r) => !r.skipped && r.side !== 'NONE');
    const r = sided ?? list[0];
    const kind: Decision['kind'] = lock ? 'LOCK' : 'SKIP';
    const side = sided ? sided.side : 'NONE';
    const p = (bps: number | null) => (bps === null || side === 'NONE' ? null : (side === 'YES' ? bps : 10000 - bps) / 10000);
    out.push({
      marketId, at: r.at, kind, side, pSide: p(r.vixy_bps), pMarketSide: p(r.market_bps),
      hit: side === 'NONE' ? null : side === r.outcome,
      edgeBps: r.edge_bps, confidenceBps: r.confidence_bps, reversalRiskBps: r.reversal_risk_bps, category: r.category, venue: r.venue,
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

function bucketize(ds: Decision[], key: (d: Decision) => number | null, edges: number[], label: (lo: number, hi: number) => string): Bucket[] {
  const out: Bucket[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i]; const hi = edges[i + 1];
    const inb = ds.filter((d) => { const k = key(d); return k !== null && k >= lo && (i === edges.length - 2 ? k <= hi : k < hi); });
    const m = metrics(inb);
    out.push({ label: label(lo, hi), metrics: m.n >= EVAL.MIN_BUCKET ? m : { ...m, hitRateBps: null, brier: null, marketBrier: null, logLoss: null, calibrationErrorBps: null, skillVsMarket: null } });
  }
  return out;
}
function groupBy(ds: Decision[], key: (d: Decision) => string | null): Bucket[] {
  const groups = new Map<string, Decision[]>();
  for (const d of ds) { const k = key(d) ?? '—'; const l = groups.get(k) ?? []; l.push(d); groups.set(k, l); }
  return [...groups.entries()].map(([label, list]) => { const m = metrics(list); return { label, metrics: m.n >= EVAL.MIN_BUCKET ? m : { ...m, hitRateBps: null, brier: null, marketBrier: null, logLoss: null, calibrationErrorBps: null, skillVsMarket: null } }; });
}

export function evaluate(db: DatabaseSync, now = Date.now()): EvaluationReport {
  const observations = (db.prepare('SELECT COUNT(*) AS n FROM observations').get() as { n: number }).n;
  const reads = (db.prepare('SELECT COUNT(*) AS n FROM model_reads').get() as { n: number }).n;
  const outcomes = (db.prepare('SELECT COUNT(*) AS n FROM market_outcomes').get() as { n: number }).n;
  const versions = (db.prepare('SELECT DISTINCT model_version FROM model_reads').all() as { model_version: string }[]).map((r) => r.model_version);
  /* A read is scored only against an outcome published AFTER it — chronology enforced in the join. */
  const rows = db.prepare(`SELECT r.at, r.market_id, r.category, r.venue, r.market_bps, r.vixy_bps, r.edge_bps, r.confidence_bps, r.reversal_risk_bps, r.side, r.skipped, r.gate_allowed, o.outcome, o.resolved_at
    FROM model_reads r JOIN market_outcomes o ON o.market_id = r.market_id
    WHERE o.outcome IN ('YES','NO') AND o.resolved_at_ms > r.at ORDER BY r.at ASC`).all() as ReadRow[];
  const ds = decisionsFrom(rows);
  const locks = ds.filter((d) => d.kind === 'LOCK'); const skips = ds.filter((d) => d.kind === 'SKIP'); const skipsSided = skips.filter((d) => d.side !== 'NONE');
  const enough = ds.length >= EVAL.MIN_DECISIONS;
  const cut = Math.floor(ds.length * EVAL.TRAIN_FRACTION);
  const train = ds.slice(0, cut); const oos = ds.slice(cut);
  const oosEnough = enough && oos.length >= EVAL.MIN_OOS;
  const oosLocks = oos.filter((d) => d.kind === 'LOCK'); const oosSkips = oos.filter((d) => d.kind === 'SKIP' && d.side !== 'NONE');
  const oosM = oosEnough ? metrics(oosLocks) : null;
  let verdict: string;
  if (!enough) verdict = `INSUFFICIENT: ${ds.length} scored decision(s) (${locks.length} locks, ${skips.length} skips) over ${outcomes} recorded outcome(s); ${EVAL.MIN_DECISIONS} are needed before anything is reported. No predictive information is claimed.`;
  else if (!oosEnough) verdict = `IN-SAMPLE ONLY: ${ds.length} decisions but only ${oos.length} out-of-sample (need ${EVAL.MIN_OOS}). In-sample numbers are not evidence of predictive validity.`;
  else if (oosM!.n === 0) verdict = 'OUT-OF-SAMPLE: the policy allowed no locks in the holdout; there is nothing to score. The model has not demonstrated predictive information.';
  else if (oosM!.skillVsMarket === null || oosM!.skillVsMarket <= 0) verdict = `OUT-OF-SAMPLE: ${oosM!.n} locks, hit rate ${(oosM!.hitRateBps! / 100).toFixed(1)}%, Brier ${oosM!.brier} vs the market's own price ${oosM!.marketBrier}. The model did NOT beat the venue's price; it has not demonstrated useful predictive information.`;
  else verdict = `OUT-OF-SAMPLE: ${oosM!.n} locks, hit rate ${(oosM!.hitRateBps! / 100).toFixed(1)}%, Brier ${oosM!.brier} vs market ${oosM!.marketBrier} (skill ${oosM!.skillVsMarket}). Positive skill on this sample; not a guarantee, not profitability, and the sample is small unless n is in the hundreds.`;
  return {
    status: enough ? 'EVALUATED' : 'INSUFFICIENT', modelVersions: versions, observations, reads, outcomes,
    decisions: { total: ds.length, locks: locks.length, skips: skips.length, skipsWithSide: skipsSided.length },
    split: { trainUntil: cut > 0 ? new Date(ds[cut - 1].at).toISOString() : null, train: train.length, oos: oos.length },
    train: enough ? { locks: metrics(train.filter((d) => d.kind === 'LOCK')), skipsIfLocked: metrics(train.filter((d) => d.kind === 'SKIP' && d.side !== 'NONE')) } : { locks: metrics([]), skipsIfLocked: metrics([]) },
    oos: oosEnough ? { locks: metrics(oosLocks), skipsIfLocked: metrics(oosSkips) } : null,
    oosBuckets: oosEnough ? {
      edge: bucketize(oosLocks, (d) => (d.edgeBps === null ? null : Math.abs(d.edgeBps)), [0, 150, 300, 600, 1000, 10000], (lo, hi) => `${lo}–${hi} bps`),
      confidence: bucketize(oosLocks, (d) => d.confidenceBps, [0, 6000, 7000, 8000, 9000, 10000], (lo, hi) => `${lo / 100}–${hi / 100}%`),
      reversal: bucketize(oosLocks, (d) => d.reversalRiskBps, [0, 1000, 2000, 3000, 10000], (lo, hi) => `${lo / 100}–${hi / 100}%`),
      category: groupBy(oosLocks, (d) => d.category), venue: groupBy(oosLocks, (d) => d.venue),
    } : null,
    verdict, computedAt: new Date(now).toISOString(),
  };
}
