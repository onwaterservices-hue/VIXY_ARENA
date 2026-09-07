/* =============================================================
   vixy-arena-consensus-0.2.0 — the first VIXY estimate with a
   measured reason to exist.

   0.1.0 carried the price forward by a fraction of its recent
   drift. Replayed on 6 197 settled Kalshi markets it was worth
   +0.00002 Brier against the venue's own price (p = 0.95): a price
   mirror. Research on the sealed DEV half of that corpus
   (docs/MODEL-RESEARCH.md) found one thing that was not:

     WHERE the price sits in its own recent range — not how far it
     moved. A price at the top of its last-20-observation range
     resolves YES more often than it is priced; at the bottom, less.
     The effect survives conditioning on the price level, holds in
     every chronological block of DEV, and is strongest in the
     sports whose scoring is continuous.

   VIXY probability = logistic( logit(consensus) + W × (posInRange − ½) )
                      applied only when the range clears the book's
                      own noise, plus the unchanged cross-venue term.

   W was fitted on DEV-FIT alone. It beat the venue's price on DEV's
   held-out half (+0.00235 Brier, p = 0.02) — and then FAILED on the
   sealed holdout: −0.00021, 95 % CI [−0.0018, +0.0013], p = 0.78
   (docs/MODEL-RESEARCH.md). The DEV effect did not replicate, so
   this model is NOT the default and is not an improvement on 0.1.0.
   It is kept, selectable with MODEL=continuation, because it is a
   clean implementation of a specific hypothesis that a larger or
   longer corpus can re-test. `validated` is false, like everything
   else here.
   ============================================================= */
import type { CanonicalMarket, Regime } from '../../../types/index.ts';
import type { ModelRead, VixyModel } from '../model.ts';
import type { ObservationHistory } from './observations.ts';
import { FEATURE_SET_VERSION, extractFeatures, type MarketFeatures } from './features.ts';
import { CONSTANTS as C1 } from './consensusModel.ts';

export const CONSTANTS = {
  version: 'vixy-arena-consensus-0.2.0',
  /** Fitted on DEV, scored once on the sealed holdout, and did not beat the venue's price there. */
  validated: false as const,
  /** The one holdout read this model has had. A second one would not mean the same thing. */
  holdout: { markets: 1834, gain: -0.00021, ci: [-0.00176, 0.00134] as const, p: 0.779, verdict: 'did not beat the venue price' } as const,
  MIN_OBSERVATIONS: C1.MIN_OBSERVATIONS,
  MAX_AGE_MS: C1.MAX_AGE_MS,
  LIQUIDITY_PULL: C1.LIQUIDITY_PULL,
  /** Weight on (posInRange − ½) in log-odds. Fitted on DEV-FIT (n = 2 613 gated markets). */
  CONTINUATION_W: 0.6591,
  /** The term applies only when the window's range clears the book: a range under two
      spreads is bid-ask bounce, not movement. 100 bps is the absolute floor. */
  MIN_RANGE_BPS: 100,
  RANGE_OVER_SPREAD: 2,
  P_MIN: C1.P_MIN, P_MAX: C1.P_MAX,
  CONF: C1.CONF, REV: C1.REV,
} as const;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round = (x: number) => Math.sign(x) * Math.round(Math.abs(x));
const sign = (x: number | null) => (x === null || x === 0 ? 0 : x > 0 ? 1 : -1);
const pct = (bps: number) => `${(bps / 100).toFixed(1)}%`;
const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Pure: features → read. */
export function compute(f: MarketFeatures): ModelRead | null {
  const C = CONSTANTS;
  const evidence: string[] = [];
  if (f.maxAgeMs > C.MAX_AGE_MS) return null;
  if (f.minObservations < C.MIN_OBSERVATIONS) return null;
  if (f.venues.some((v) => !Number.isFinite(v.impliedBps) || v.impliedBps < 0 || v.impliedBps > 10000)) return null;

  const primary = f.venues.find((v) => v.venue === f.mostLiquid) ?? f.venues[0];

  /* Cross-venue term — unchanged from 0.1.0, and still unmeasured: the backtest had one venue. */
  let crossAdj = 0;
  if (f.venues.length >= 2 && f.mostLiquid) {
    crossAdj = round(C.LIQUIDITY_PULL * (primary.impliedBps - f.consensusBps));
    evidence.push(`cross-venue: ${f.venues.map((v) => `${v.venue.toLowerCase()} ${pct(v.impliedBps)} (liq $${Math.round(v.liquidityUsd ?? 0)})`).join(' vs ')}; consensus ${pct(f.consensusBps)}; most liquid ${f.mostLiquid.toLowerCase()} → ${crossAdj >= 0 ? '+' : ''}${crossAdj} bps`);
  } else {
    evidence.push(`single venue: ${primary.venue.toLowerCase()} ${pct(primary.impliedBps)}; no cross-venue information`);
  }

  /* Continuation term, on the most-liquid venue's own window. */
  const base = clamp(f.consensusBps + crossAdj, C.P_MIN, C.P_MAX);
  const rangeFloor = Math.max(C.MIN_RANGE_BPS, C.RANGE_OVER_SPREAD * (primary.spreadBps ?? 0));
  const pos = primary.posInRange;
  const range = primary.rangeBps;
  let contAdj = 0;
  if (pos !== null && range !== null && range > rangeFloor) {
    const shifted = sigmoid(logit(base / 10000) + C.CONTINUATION_W * (pos - 0.5)) * 10000;
    contAdj = round(clamp(shifted, C.P_MIN, C.P_MAX) - base);
    evidence.push(`continuation: ${primary.venue.toLowerCase()} sits at ${(pos * 100).toFixed(0)}% of its ${range}-bps range over ${Math.min(primary.observations, 20)} observations (floor ${rangeFloor} bps) → ${contAdj >= 0 ? '+' : ''}${contAdj} bps`);
  } else {
    evidence.push(`continuation: ${range === null ? 'no range yet' : `range ${range} bps`} — inside the book's own noise (floor ${rangeFloor} bps); no path term`);
  }

  /* Nothing beyond the market's own price → SKIP. */
  if (crossAdj === 0 && contAdj === 0) return null;

  const vixyBps = Math.round(clamp(base + contAdj, C.P_MIN, C.P_MAX));

  /* Confidence, reversal and regime: inherited from 0.1.0 unchanged, and still unvalidated. */
  const K = C.CONF;
  const fVenues = f.venues.length >= 2 ? 1 : K.singleVenue;
  const fObs = Math.min(1, f.minObservations / K.obsSaturation);
  const fSpread = f.spreadBps === null ? K.spreadWideFactor : f.spreadBps <= K.spreadTight ? 1 : f.spreadBps <= K.spreadWide ? K.spreadWideFactor : K.spreadVeryWideFactor;
  const fLiq = f.totalLiquidityUsd === null ? K.liqUnknownFactor : f.totalLiquidityUsd >= K.liqHigh ? 1 : f.totalLiquidityUsd >= K.liqLow ? K.liqMidFactor : K.liqLowFactor;
  const flips = Math.max(...f.venues.map((v) => v.flips));
  const fStab = flips <= K.flipsOk ? 1 : flips <= K.flipsMany ? K.flipsManyFactor : K.flipsChopFactor;
  const confidenceBps = Math.round(clamp(10000 * fVenues * fObs * fSpread * fLiq * fStab, 0, 10000));
  evidence.push(`confidence factors: venues ${fVenues}, observations ${f.minObservations}/${K.obsSaturation} → ${fObs.toFixed(2)}, spread ${f.spreadBps ?? '—'} bps → ${fSpread}, liquidity $${f.totalLiquidityUsd === null ? '—' : Math.round(f.totalLiquidityUsd)} → ${fLiq}, flips ${flips} → ${fStab}`);

  const R = C.REV;
  const drift = primary.driftLongBps;
  const disagree = sign(primary.driftShortBps) !== 0 && sign(drift) !== 0 && sign(primary.driftShortBps) !== sign(drift);
  const spreadOverDrift = drift !== null && (f.spreadBps ?? 0) > Math.abs(drift);
  const reversalRiskBps = Math.round(clamp(flips * R.perFlip + (disagree ? R.disagreement : 0) + (spreadOverDrift ? R.spreadOverDrift : 0), 0, 10000));
  evidence.push(`reversal: ${flips} flips${disagree ? ', short-window drift opposes long-window drift' : ''}${spreadOverDrift ? ', spread wider than drift' : ''} → ${pct(reversalRiskBps)}`);

  const vol = primary.volatilityBps;
  const regime: Regime = f.totalLiquidityUsd !== null && f.totalLiquidityUsd < K.liqLow ? 'ILLIQUID'
    : vol === null ? 'UNKNOWN' : flips > K.flipsMany ? 'RANGING' : vol > 150 ? 'VOLATILE' : contAdj !== 0 ? 'TRENDING' : 'RANGING';

  const rationale = `${C.version}: estimate ${pct(vixyBps)} vs market ${pct(f.consensusBps)} from ${crossAdj !== 0 ? 'cross-venue disagreement' : ''}${crossAdj !== 0 && contAdj !== 0 ? ' and ' : ''}${contAdj !== 0 ? 'where the price sits in its own recent range' : ''}. Confidence ${pct(confidenceBps)} reflects data quality, not edge size. The continuation weight was fitted on settled history and did not beat the venue's price on the sealed holdout; the cross-venue term, the confidence and the reversal risk are unvalidated too.`;

  return {
    vixyBps, confidenceBps, reversalRiskBps, regime, evidence, rationale,
    featureSetVersion: FEATURE_SET_VERSION, dataAgeMs: f.maxAgeMs, computedAt: f.computedAt, inputs: f,
  };
}

export class ContinuationModel implements VixyModel {
  readonly version = CONSTANTS.version;
  private history: ObservationHistory;
  constructor(history: ObservationHistory) { this.history = history; }
  read(market: CanonicalMarket, now: number): ModelRead | null {
    const f = extractFeatures(market, this.history, now);
    return f ? compute(f) : null;
  }
  reproduce(inputs: unknown): ModelRead | null {
    return inputs && typeof inputs === 'object' && 'venues' in (inputs as object) ? compute(inputs as MarketFeatures) : null;
  }
}
