/* =============================================================
   vixy-arena-consensus-0.1.0 — the first real VIXY model, and a
   deliberately weak one.

   The Arena's live data is the price of the same question on one or
   two venues, sampled every ~30 s, with spread and liquidity. The
   only information in that data beyond "the market's own price" is
   (a) disagreement between venues and (b) the recent path of the
   price. This model uses exactly those two things and nothing else.

   VIXY probability = consensus
                    + LIQUIDITY_PULL × (most-liquid venue − consensus)     [cross-venue term]
                    + DRIFT_CARRY   × long-window drift, only if |drift| > noise floor  [path term]
   Confidence      = product of measured data-quality factors. It does
                     not look at the edge.
   Reversal risk   = flips and short-vs-long drift disagreement.
   SKIP (null)     = stale, too few observations, or a single venue
                     with no drift above the noise floor: nothing to
                     say beyond the market's own price.

   Every constant lives in CONSTANTS with `validated: false`. None of
   them has been validated against settled outcomes — the Arena's
   ledger is empty and Vault's history is 59 cycles of a different
   instrument at 42.4%. Changing a constant is a new VERSION.
   ============================================================= */
import type { CanonicalMarket, Regime } from '../../../types/index.ts';
import type { ModelRead, VixyModel } from '../model.ts';
import type { ObservationHistory } from './observations.ts';
import { FEATURE_SET_VERSION, extractFeatures, type MarketFeatures } from './features.ts';

export const CONSTANTS = {
  version: 'vixy-arena-consensus-0.1.0',
  validated: false as const,
  /** Fewest observations per venue before any read. Vault used a 360 s floor on 3 s ticks; here ≈3 min at 30 s. */
  MIN_OBSERVATIONS: 6,
  /** Reads require every venue read younger than this. */
  MAX_AGE_MS: 60_000,
  /** Fraction of (most-liquid venue − consensus) added to the estimate. */
  LIQUIDITY_PULL: 0.5,
  /** Fraction of the long-window drift carried forward as expectation. */
  DRIFT_CARRY: 0.35,
  /** Hard cap on the drift adjustment, bps. */
  MAX_DRIFT_ADJ_BPS: 300,
  /** Drift must exceed max(spread, this) to count as information rather than noise, bps. */
  NOISE_FLOOR_BPS: 50,
  /** Probability bounds for any estimate. */
  P_MIN: 100, P_MAX: 9900,
  /** Confidence factors (each 0..1); confidence = 10000 × product. */
  CONF: { singleVenue: 0.7, obsSaturation: 20, spreadTight: 200, spreadWide: 600, spreadWideFactor: 0.8, spreadVeryWideFactor: 0.6, liqHigh: 10_000, liqLow: 1_000, liqMidFactor: 0.85, liqLowFactor: 0.7, liqUnknownFactor: 0.75, flipsOk: 2, flipsMany: 4, flipsManyFactor: 0.8, flipsChopFactor: 0.6 },
  /** Reversal risk terms, bps. */
  REV: { perFlip: 800, disagreement: 2500, spreadOverDrift: 1000 },
} as const;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
/* Round half away from zero so UP and DOWN mirror exactly (Math.round is asymmetric at .5). */
const round = (x: number) => Math.sign(x) * Math.round(Math.abs(x));
const sign = (x: number | null) => (x === null || x === 0 ? 0 : x > 0 ? 1 : -1);
const pct = (bps: number) => `${(bps / 100).toFixed(1)}%`;

/** Pure: features → read. This is the whole model. */
export function compute(f: MarketFeatures): ModelRead | null {
  const C = CONSTANTS;
  const evidence: string[] = [];
  if (f.maxAgeMs > C.MAX_AGE_MS) return null;                     /* stale → no read */
  if (f.minObservations < C.MIN_OBSERVATIONS) return null;        /* too little history → no read */
  if (f.venues.some((v) => !Number.isFinite(v.impliedBps) || v.impliedBps < 0 || v.impliedBps > 10000)) return null; /* malformed → no read */

  const noiseFloor = Math.max(C.NOISE_FLOOR_BPS, f.spreadBps ?? 0);
  const primary = f.venues.find((v) => v.venue === f.mostLiquid) ?? f.venues[0];

  /* Cross-venue term. */
  let crossAdj = 0;
  if (f.venues.length >= 2 && f.mostLiquid) {
    crossAdj = round(C.LIQUIDITY_PULL * (primary.impliedBps - f.consensusBps));
    evidence.push(`cross-venue: ${f.venues.map((v) => `${v.venue.toLowerCase()} ${pct(v.impliedBps)} (liq $${Math.round(v.liquidityUsd ?? 0)})`).join(' vs ')}; consensus ${pct(f.consensusBps)}; most liquid ${f.mostLiquid.toLowerCase()} → ${crossAdj >= 0 ? '+' : ''}${crossAdj} bps`);
  } else {
    evidence.push(`single venue: ${primary.venue.toLowerCase()} ${pct(primary.impliedBps)}; no cross-venue information`);
  }

  /* Path term: only above the noise floor. */
  const drift = primary.driftLongBps;
  let driftAdj = 0;
  if (drift !== null && Math.abs(drift) > noiseFloor) {
    driftAdj = round(clamp(C.DRIFT_CARRY * drift, -C.MAX_DRIFT_ADJ_BPS, C.MAX_DRIFT_ADJ_BPS));
    evidence.push(`drift: ${primary.venue.toLowerCase()} moved ${drift > 0 ? '+' : ''}${drift} bps over ${Math.min(primary.observations, 20)} observations (noise floor ${noiseFloor} bps) → ${driftAdj >= 0 ? '+' : ''}${driftAdj} bps`);
  } else {
    evidence.push(`drift: ${drift === null ? 'insufficient points' : `${drift > 0 ? '+' : ''}${drift} bps`} — inside the noise floor of ${noiseFloor} bps; no path term`);
  }

  /* Nothing beyond the market's own price → SKIP. */
  if (crossAdj === 0 && driftAdj === 0) return null;

  const vixyBps = Math.round(clamp(f.consensusBps + crossAdj + driftAdj, C.P_MIN, C.P_MAX));

  /* Confidence: data quality only. */
  const K = C.CONF;
  const fVenues = f.venues.length >= 2 ? 1 : K.singleVenue;
  const fObs = Math.min(1, f.minObservations / K.obsSaturation);
  const fSpread = f.spreadBps === null ? K.spreadWideFactor : f.spreadBps <= K.spreadTight ? 1 : f.spreadBps <= K.spreadWide ? K.spreadWideFactor : K.spreadVeryWideFactor;
  const fLiq = f.totalLiquidityUsd === null ? K.liqUnknownFactor : f.totalLiquidityUsd >= K.liqHigh ? 1 : f.totalLiquidityUsd >= K.liqLow ? K.liqMidFactor : K.liqLowFactor;
  const flips = Math.max(...f.venues.map((v) => v.flips));
  const fStab = flips <= K.flipsOk ? 1 : flips <= K.flipsMany ? K.flipsManyFactor : K.flipsChopFactor;
  const confidenceBps = Math.round(clamp(10000 * fVenues * fObs * fSpread * fLiq * fStab, 0, 10000));
  evidence.push(`confidence factors: venues ${fVenues}, observations ${f.minObservations}/${K.obsSaturation} → ${fObs.toFixed(2)}, spread ${f.spreadBps ?? '—'} bps → ${fSpread}, liquidity $${f.totalLiquidityUsd === null ? '—' : Math.round(f.totalLiquidityUsd)} → ${fLiq}, flips ${flips} → ${fStab}`);

  /* Reversal risk. */
  const R = C.REV;
  const disagree = sign(primary.driftShortBps) !== 0 && sign(drift) !== 0 && sign(primary.driftShortBps) !== sign(drift);
  const spreadOverDrift = drift !== null && (f.spreadBps ?? 0) > Math.abs(drift);
  const reversalRiskBps = Math.round(clamp(flips * R.perFlip + (disagree ? R.disagreement : 0) + (spreadOverDrift ? R.spreadOverDrift : 0), 0, 10000));
  evidence.push(`reversal: ${flips} flips${disagree ? ', short-window drift opposes long-window drift' : ''}${spreadOverDrift ? ', spread wider than drift' : ''} → ${pct(reversalRiskBps)}`);

  const vol = primary.volatilityBps;
  const regime: Regime = f.totalLiquidityUsd !== null && f.totalLiquidityUsd < K.liqLow ? 'ILLIQUID'
    : vol === null ? 'UNKNOWN' : flips > K.flipsMany ? 'RANGING' : vol > 150 ? 'VOLATILE' : Math.abs(drift ?? 0) > noiseFloor ? 'TRENDING' : 'RANGING';

  const rationale = `${C.version}: estimate ${pct(vixyBps)} vs market ${pct(f.consensusBps)} from ${crossAdj !== 0 ? 'cross-venue disagreement' : ''}${crossAdj !== 0 && driftAdj !== 0 ? ' and ' : ''}${driftAdj !== 0 ? 'price drift above the noise floor' : ''}. Confidence ${pct(confidenceBps)} reflects data quality, not edge size. Constants are unvalidated (validated=false).`;

  return {
    vixyBps, confidenceBps, reversalRiskBps, regime, evidence, rationale,
    featureSetVersion: FEATURE_SET_VERSION, dataAgeMs: f.maxAgeMs, computedAt: f.computedAt, inputs: f,
  };
}

export class ConsensusModel implements VixyModel {
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
