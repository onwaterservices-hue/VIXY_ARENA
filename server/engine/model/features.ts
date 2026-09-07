/* =============================================================
   FEATURES — deterministic, pure, and only from the past.

   Everything here is arithmetic on observations that already
   happened. No feature is a literal default: when the data is not
   there, the feature is null and the caller decides what null means
   (for the model it means "no read").
   ============================================================= */
import type { CanonicalMarket, Venue } from '../../../types/index.ts';
import type { Observation, ObservationHistory } from './observations.ts';

export const FEATURE_SET_VERSION = 'arena-features-0.2.0';

export interface VenueFeatures {
  venue: Venue;
  venueMarketId: string;
  impliedBps: number;
  spreadBps: number | null;
  liquidityUsd: number | null;
  /** Age of the latest observation, ms. */
  ageMs: number;
  observations: number;
  /** Signed change over the short window (last vs `short` back), bps. Null without enough points. */
  driftShortBps: number | null;
  /** Signed change over the long window (last vs earliest within `long`), bps. */
  driftLongBps: number | null;
  /** Sample stdev of consecutive changes over the long window, bps. Null below 6 points. */
  volatilityBps: number | null;
  /** Sign changes of consecutive non-zero changes over the long window. */
  flips: number;
  /** High − low over the long window, bps. Null below 2 points. */
  rangeBps: number | null;
  /** Where the latest price sits in that range, 0..1 (0.5 when the range is flat). Null below 2 points. */
  posInRange: number | null;
}

export interface MarketFeatures {
  marketId: string;
  computedAt: number;
  venues: VenueFeatures[];
  /** Liquidity-weighted consensus as the canonical layer computed it. */
  consensusBps: number;
  dispersionBps: number | null;
  /** Widest spread among venues; the noise floor for any drift claim. */
  spreadBps: number | null;
  totalLiquidityUsd: number | null;
  /** The venue with the most reported liquidity (ties → first). */
  mostLiquid: Venue | null;
  /** Fewest observations across venues. */
  minObservations: number;
  /** Oldest latest-observation across venues, ms. */
  maxAgeMs: number;
  msToClose: number;
  /** The frozen observation windows, so the read can be reproduced. */
  windows: Record<string, Observation[]>;
}

export const WINDOW = { short: 3, long: 20 } as const;

const diffs = (obs: Observation[]) => obs.slice(1).map((o, i) => o.impliedBps - obs[i].impliedBps);

export function venueFeatures(venue: Venue, venueMarketId: string, obs: Observation[], now: number): VenueFeatures | null {
  const last = obs[obs.length - 1];
  if (!last) return null;
  const long = obs.slice(-WINDOW.long);
  const d = diffs(long);
  const nz = d.filter((x) => x !== 0);
  let flips = 0; for (let i = 1; i < nz.length; i++) if (Math.sign(nz[i]) !== Math.sign(nz[i - 1])) flips++;
  let volatilityBps: number | null = null;
  if (d.length >= 5) { const mean = d.reduce((a, b) => a + b, 0) / d.length; volatilityBps = Math.round(Math.sqrt(d.reduce((a, x) => a + (x - mean) ** 2, 0) / (d.length - 1))); }
  const hi = Math.max(...long.map((o) => o.impliedBps)); const lo = Math.min(...long.map((o) => o.impliedBps));
  const rangeBps = long.length >= 2 ? hi - lo : null;
  const posInRange = rangeBps === null ? null : rangeBps > 0 ? (last.impliedBps - lo) / rangeBps : 0.5;
  return {
    venue, venueMarketId, impliedBps: last.impliedBps, spreadBps: last.spreadBps, liquidityUsd: last.liquidityUsd,
    rangeBps, posInRange,
    ageMs: Math.max(0, now - last.at), observations: obs.length,
    driftShortBps: obs.length > WINDOW.short ? last.impliedBps - obs[obs.length - 1 - WINDOW.short].impliedBps : null,
    driftLongBps: long.length >= 2 ? last.impliedBps - long[0].impliedBps : null,
    volatilityBps, flips,
  };
}

/** Null when the market has no price or no venue refs. Pure given `history` and `now`. */
export function extractFeatures(m: CanonicalMarket, history: ObservationHistory, now: number): MarketFeatures | null {
  if (m.marketProbabilityBps === null || m.venueRefs.length === 0) return null;
  const venues: VenueFeatures[] = []; const windows: Record<string, Observation[]> = {};
  for (const ref of m.venueRefs) {
    const obs = history.get(ref.venue, ref.venueMarketId, now);
    const vf = venueFeatures(ref.venue, ref.venueMarketId, obs, now);
    if (!vf) continue;
    venues.push(vf); windows[`${ref.venue}:${ref.venueMarketId}`] = obs.slice(-WINDOW.long);
  }
  if (!venues.length) return null;
  const liq = venues.map((v) => v.liquidityUsd).filter((x): x is number => x !== null);
  const spreads = venues.map((v) => v.spreadBps).filter((x): x is number => x !== null);
  const mostLiquid = liq.length ? venues.reduce((a, b) => ((b.liquidityUsd ?? -1) > (a.liquidityUsd ?? -1) ? b : a)).venue : null;
  return {
    marketId: m.id, computedAt: now, venues,
    consensusBps: m.marketProbabilityBps, dispersionBps: m.dispersionBps,
    spreadBps: spreads.length ? Math.max(...spreads) : null,
    totalLiquidityUsd: liq.length ? liq.reduce((a, b) => a + b, 0) : null,
    mostLiquid,
    minObservations: Math.min(...venues.map((v) => v.observations)),
    maxAgeMs: Math.max(...venues.map((v) => v.ageMs)),
    msToClose: new Date(m.closesAt).getTime() - now,
    windows,
  };
}
