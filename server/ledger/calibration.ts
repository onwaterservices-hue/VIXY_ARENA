/* =============================================================
   CALIBRATION — what the locked VIXY probabilities were worth.

   Computed only from settled locks in the ledger, on the probability
   that was FROZEN at lock time for the side that was taken. No
   fallback literals: below the sample floor every number is null and
   the status says why. Everything here is in-sample by definition
   (the ledger is the only sample); a chronological holdout is
   reported separately once there are enough rows to split.
   ============================================================= */
import type { DB } from '../db.ts';

export const CALIBRATION = { MIN_SETTLED: 30, HOLDOUT_MIN: 60, HOLDOUT_FRACTION: 0.2 } as const;

interface Graded { locked_at: number; direction: 'YES' | 'NO'; vixy_bps: number; entry_bps: number; edge_bps: number; confidence_bps: number | null; model_version: string; result: 'WON' | 'LOST' }

export interface Bucket { label: string; n: number; hitRateBps: number | null; meanPredictedBps: number | null; calibrationErrorBps: number | null }
export interface Metrics { n: number; hitRateBps: number | null; brier: number | null; logLoss: number | null; meanPredictedBps: number | null; calibrationErrorBps: number | null }
export interface CalibrationReport {
  status: 'INSUFFICIENT' | 'IN_SAMPLE' | 'IN_SAMPLE_WITH_HOLDOUT';
  minSettled: number;
  settled: number;
  /** Everything settled. In-sample: the same rows that would tune any constant. */
  inSample: Metrics;
  /** Chronologically last HOLDOUT_FRACTION of settled locks, never used for tuning. Null below HOLDOUT_MIN. */
  holdout: Metrics | null;
  byConfidence: Bucket[];
  byEdge: Bucket[];
  byModelVersion: { modelVersion: string; metrics: Metrics }[];
  /** Locks vs skips cannot be compared: the ledger records only locks. Stated, not estimated. */
  lockVsSkip: null;
  note: string;
  computedAt: string;
}

/** Probability the lock assigned to the side it took. */
const pSide = (g: Graded) => (g.direction === 'YES' ? g.vixy_bps : 10000 - g.vixy_bps) / 10000;

export function metrics(rows: Graded[]): Metrics {
  if (!rows.length) return { n: 0, hitRateBps: null, brier: null, logLoss: null, meanPredictedBps: null, calibrationErrorBps: null };
  const n = rows.length;
  const hits = rows.filter((r) => r.result === 'WON').length;
  const brier = rows.reduce((a, r) => a + (pSide(r) - (r.result === 'WON' ? 1 : 0)) ** 2, 0) / n;
  const logLoss = rows.reduce((a, r) => { const p = Math.min(0.99, Math.max(0.01, pSide(r))); return a - (r.result === 'WON' ? Math.log(p) : Math.log(1 - p)); }, 0) / n;
  const meanPredicted = rows.reduce((a, r) => a + pSide(r), 0) / n;
  return {
    n, hitRateBps: Math.round((hits / n) * 10000), brier: Math.round(brier * 10000) / 10000, logLoss: Math.round(logLoss * 10000) / 10000,
    meanPredictedBps: Math.round(meanPredicted * 10000), calibrationErrorBps: Math.round(Math.abs(meanPredicted - hits / n) * 10000),
  };
}

function bucketize(rows: Graded[], key: (g: Graded) => number, edges: number[], label: (lo: number, hi: number) => string): Bucket[] {
  const out: Bucket[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i]; const hi = edges[i + 1];
    const inb = rows.filter((r) => { const k = key(r); return k >= lo && (i === edges.length - 2 ? k <= hi : k < hi); });
    const m = metrics(inb);
    out.push({ label: label(lo, hi), n: m.n, hitRateBps: m.hitRateBps, meanPredictedBps: m.meanPredictedBps, calibrationErrorBps: m.calibrationErrorBps });
  }
  return out; /* disjoint by construction */
}

export function calibrationReport(db: DB, now = Date.now()): CalibrationReport {
  const rows = db.prepare(`SELECT c.locked_at, c.direction, c.vixy_bps, c.entry_bps, c.edge_bps, c.confidence_bps, c.model_version, s.result
    FROM calls c JOIN settlements s ON s.call_id = c.id WHERE s.result IN ('WON','LOST') AND c.direction IN ('YES','NO') ORDER BY c.locked_at ASC`).all() as Graded[];
  const settled = rows.length;
  const enough = settled >= CALIBRATION.MIN_SETTLED;
  const empty: Metrics = { n: settled, hitRateBps: null, brier: null, logLoss: null, meanPredictedBps: null, calibrationErrorBps: null };
  const holdoutN = settled >= CALIBRATION.HOLDOUT_MIN ? Math.floor(settled * CALIBRATION.HOLDOUT_FRACTION) : 0;
  const holdout = enough && holdoutN > 0 ? metrics(rows.slice(settled - holdoutN)) : null;
  const versions = [...new Set(rows.map((r) => r.model_version))];
  return {
    status: !enough ? 'INSUFFICIENT' : holdout ? 'IN_SAMPLE_WITH_HOLDOUT' : 'IN_SAMPLE',
    minSettled: CALIBRATION.MIN_SETTLED, settled,
    inSample: enough ? metrics(rows) : empty,
    holdout,
    byConfidence: enough ? bucketize(rows, (r) => r.confidence_bps ?? -1, [0, 6000, 7000, 8000, 9000, 10000], (lo, hi) => `${lo / 100}–${hi / 100}%`) : [],
    byEdge: enough ? bucketize(rows, (r) => Math.abs(r.edge_bps), [0, 150, 300, 600, 1000, 10000], (lo, hi) => `${lo}–${hi} bps`) : [],
    byModelVersion: enough ? versions.map((v) => ({ modelVersion: v, metrics: metrics(rows.filter((r) => r.model_version === v)) })) : [],
    lockVsSkip: null,
    note: !enough
      ? `${settled} settled directional lock(s); no metric is reported below ${CALIBRATION.MIN_SETTLED}. Nothing here is a substitute for data.`
      : holdout
        ? `In-sample over all ${settled} settled locks; the holdout is the chronologically last ${holdoutN} and has never been used to set a constant. Skips are not recorded, so lock-vs-skip is not measurable.`
        : `In-sample over all ${settled} settled locks. A chronological holdout is reported from ${CALIBRATION.HOLDOUT_MIN} settled. In-sample numbers are not evidence of predictive validity.`,
    computedAt: new Date(now).toISOString(),
  };
}
