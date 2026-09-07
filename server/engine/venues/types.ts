/* =============================================================
   VENUE LAYER — the DISCOVER and VERIFY stages of the pipeline.
   One normalized shape for a market as a venue publishes it. No
   modeling happens here: implied probability is what the venue's
   order book says, in integer basis points, with the fetch time
   attached so the health envelope can be computed honestly.
   ============================================================= */
import type { MarketCategory, Venue } from '../../../types/index.ts';

export interface VenueMarket {
  venue: Venue;
  /** The venue's own id (Kalshi ticker, Polymarket condition id). */
  venueMarketId: string;
  /** The venue's grouping (Kalshi event ticker, Polymarket event id). */
  venueEventId: string | null;
  /** Human title of the event/question and the specific outcome this row prices. */
  eventTitle: string;
  outcomeLabel: string;
  question: string;
  category: MarketCategory;
  /** League/series when the venue publishes one (KXNFLGAME, "US Open ATP"). */
  series: string | null;
  /** Implied probability of the YES side, bps. Null when the venue has no price. */
  impliedBps: number | null;
  bidBps: number | null;
  askBps: number | null;
  spreadBps: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  volumeUsd: number | null;
  openInterest: number | null;
  /** ISO-8601, venue-issued. */
  closesAt: string;
  /** When the underlying event happens, if the venue distinguishes it. */
  occursAt: string | null;
  status: 'OPEN' | 'CLOSED' | 'SETTLED' | 'UNKNOWN';
  /** The venue's published outcome. Null until the venue says so; never inferred from a price. */
  result: 'YES' | 'NO' | 'VOID' | null;
  rules: string | null;
  url: string;
  /** When this row was read from the venue. Server clock. */
  fetchedAt: string;
}

export interface VenueFetchResult {
  venue: Venue;
  markets: VenueMarket[];
  fetchedAt: string;
  latencyMs: number;
  /** Non-null when the fetch failed; the previous rows, if any, are then STALE. */
  error: string | null;
  /** Provenance: what was asked and what the venue answered, so a LIVE badge can be traced to a request. */
  endpoint?: string;
  httpStatus?: number | null;
  /** 429 / Retry-After honoured by the engine before the next call. */
  retryAfterMs?: number | null;
  /** Some sub-requests failed while others succeeded (per-series discovery). Reported, never hidden. */
  partial?: string;
}

/** fetch with a hard timeout; a hung venue must not hang the engine. */
export async function venueFetch(url: string, timeoutMs = 8000): Promise<Response> {
  return fetch(url, { headers: { accept: 'application/json', 'user-agent': 'vixy-arena/0.1 (+market data reader)' }, signal: AbortSignal.timeout(timeoutMs) });
}

/** The engine's own depth figure: exchange-reported liquidity when it is real, else open interest, else 24h volume. */
export const depthUsd = (liquidity: number | null, openInterest: number | null, volume24h: number | null): number | null =>
  (liquidity !== null && liquidity > 0) ? liquidity : (openInterest !== null && openInterest > 0) ? openInterest : (volume24h !== null && volume24h > 0) ? volume24h : null;

export const toBps = (p: number | string | null | undefined): number | null => {
  if (p === null || p === undefined || p === '') return null;
  const n = typeof p === 'string' ? Number(p) : p;
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10000);
};

export const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
