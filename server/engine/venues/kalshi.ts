/* =============================================================
   KALSHI — trade-api v2, public market data (no key needed).
   Shapes as observed live on 2026-09-06 (fixtures/kalshi-*.json):
   prices arrive as dollar strings ("0.7600"), sizes as *_fp strings.
   ============================================================= */
import type { MarketCategory } from '../../../types/index.ts';
import type { VenueFetchResult, VenueMarket } from './types.ts';
import { depthUsd, toBps, toNum, venueFetch } from './types.ts';

export interface KalshiMarketRaw {
  ticker: string; event_ticker: string; market_type?: string; title: string; yes_sub_title?: string; no_sub_title?: string;
  status: string; open_time?: string; close_time: string; expiration_time?: string; occurrence_datetime?: string;
  last_price_dollars?: string; yes_bid_dollars?: string; yes_ask_dollars?: string; no_bid_dollars?: string; no_ask_dollars?: string;
  volume_fp?: string; volume_24h_fp?: string; open_interest_fp?: string; liquidity_dollars?: string; result?: string; rules_primary?: string;
}
export interface KalshiEventRaw {
  event_ticker: string; series_ticker: string; title: string; sub_title?: string; category?: string; mutually_exclusive?: boolean; markets?: KalshiMarketRaw[];
}

/** Kalshi's category names → the Arena's universe. Unknown → OTHER, never guessed upward. */
export function kalshiCategory(cat: string | undefined, seriesTicker: string | undefined): MarketCategory {
  const s = (seriesTicker ?? '').toUpperCase();
  if (/^KX(BTC|ETH|SOL|XRP|DOGE|CRYPTO)/.test(s)) return 'CRYPTO';
  switch ((cat ?? '').toLowerCase()) {
    case 'sports': return 'SPORTS';
    case 'economics': return 'ECONOMICS';
    case 'financials': return 'FINANCE';
    case 'elections': case 'politics': return 'POLITICS';
    case 'climate and weather': return 'WEATHER';
    case 'science and technology': return /^KX(AI|APPLE|TESLA|OPENAI|GPT|SPACEX|LAUNCH)/.test(s) ? 'TECHNOLOGY' : 'SCIENCE';
    case 'entertainment': return 'ENTERTAINMENT';
    case 'social': case 'culture': return 'CULTURE';
    case 'world': return 'WORLD';
    case 'crypto': return 'CRYPTO';
    default: return 'OTHER';
  }
}

/* Kalshi publishes `result` as "yes" | "no" | "void" (or "" while open). Anything else is not an outcome. */
const resultOf = (m: KalshiMarketRaw): VenueMarket['result'] => {
  switch ((m.result ?? '').toLowerCase()) { case 'yes': return 'YES'; case 'no': return 'NO'; case 'void': return 'VOID'; default: return null; }
};

const statusOf = (m: KalshiMarketRaw): VenueMarket['status'] => {
  if (m.result && m.result !== '') return 'SETTLED';
  switch (m.status) { case 'active': case 'open': return 'OPEN'; case 'closed': return 'CLOSED'; case 'settled': case 'finalized': return 'SETTLED'; default: return 'UNKNOWN'; }
};

export function normalizeKalshiMarket(m: KalshiMarketRaw, ev: Partial<KalshiEventRaw> | undefined, fetchedAt: string): VenueMarket {
  const bid = toBps(m.yes_bid_dollars); const ask = toBps(m.yes_ask_dollars); const last = toBps(m.last_price_dollars);
  /* Implied = mid of the YES book when both sides exist; otherwise last trade; a 0-wide dead book is no price. */
  const mid = bid !== null && ask !== null && ask > 0 ? Math.round((bid + ask) / 2) : null;
  const implied = mid ?? (last !== null && last > 0 ? last : null);
  /* Nested markets under /events omit event_ticker; the parent carries it. Observed live. */
  const eventTicker = m.event_ticker ?? ev?.event_ticker ?? m.ticker.replace(/-[A-Z0-9]+$/, '');
  const series = ev?.series_ticker ?? eventTicker.split('-')[0];
  return {
    venue: 'KALSHI', venueMarketId: m.ticker, venueEventId: eventTicker,
    eventTitle: ev?.title ?? m.title, outcomeLabel: m.yes_sub_title ?? m.title, question: m.title,
    category: kalshiCategory(ev?.category, series), series,
    impliedBps: implied, bidBps: bid, askBps: ask, spreadBps: bid !== null && ask !== null ? ask - bid : null,
    /* Observed live 2026-09-06: `liquidity_dollars` is "0.0000" on every public read, so depth is open interest (real). */
    liquidityUsd: depthUsd(toNum(m.liquidity_dollars), toNum(m.open_interest_fp), toNum(m.volume_24h_fp)), volume24hUsd: toNum(m.volume_24h_fp), volumeUsd: toNum(m.volume_fp), openInterest: toNum(m.open_interest_fp),
    closesAt: m.close_time, occursAt: m.occurrence_datetime ?? null, status: statusOf(m), result: resultOf(m),
    rules: m.rules_primary ?? null, url: `https://kalshi.com/markets/${series.toLowerCase()}/${eventTicker.toLowerCase()}`,
    fetchedAt,
  };
}

/** Series the engine reads by default. Observed live 2026-09-06: the generic /events?status=open listing is
   sorted by close time DESCENDING (2099-dated placeholders first) and /markets?status=open is dominated by
   zero-liquidity MVE cross-category shards, so discovery is by series, which returns the real book. */
export const DEFAULT_KALSHI_SERIES = [
  'KXNFLGAME', 'KXNCAAFGAME', 'KXNBAGAME', 'KXMLBGAME', 'KXNHLGAME', 'KXEPLGAME', 'KXUFC', 'KXATPMATCH', 'KXWTAMATCH',
  'KXFED', 'KXCPI', 'KXBTC15M', 'KXBTCD', 'KXETHD',
];

export class KalshiAdapter {
  readonly venue = 'KALSHI' as const;
  private base: string;
  private series: string[];
  constructor(base = 'https://api.elections.kalshi.com/trade-api/v2', series = DEFAULT_KALSHI_SERIES) { this.base = base; this.series = series; }

  /** Open events (with nested markets) for each configured series. One request per series; a failing series is reported, not hidden. */
  async fetchOpen(limitPerSeries = 100): Promise<VenueFetchResult> {
    const t0 = Date.now();
    const endpoint = `${this.base}/events?series_ticker=<series>&status=open&with_nested_markets=true&limit=${Math.min(limitPerSeries, 200)}`;
    const errors: string[] = []; const markets: VenueMarket[] = []; let status: number | null = null; let retryAfterMs: number | null = null;
    for (const series of this.series) {
      try {
        const res = await venueFetch(`${this.base}/events?series_ticker=${encodeURIComponent(series)}&status=open&with_nested_markets=true&limit=${Math.min(limitPerSeries, 200)}`);
        status = res.status;
        if (res.status === 429) { retryAfterMs = Number(res.headers.get('retry-after') ?? 30) * 1000; errors.push(`${series}: 429 rate limited`); break; }
        if (!res.ok) { errors.push(`${series}: HTTP ${res.status}`); continue; }
        const ev = await res.json() as { events: KalshiEventRaw[] };
        const fetchedAt = new Date().toISOString();
        for (const e of ev.events) for (const m of e.markets ?? []) {
          if (/MVE|CROSSCATEGORY/.test(e.event_ticker) || m.market_type === 'combo') continue;
          markets.push(normalizeKalshiMarket(m, e, fetchedAt));
        }
      } catch (e) { errors.push(`${series}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    /* All series failed → an error result (previous rows go STALE). Some failed → rows plus a note. */
    const allFailed = errors.length === this.series.length || retryAfterMs !== null;
    return { venue: 'KALSHI', markets, fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0, endpoint, httpStatus: status, retryAfterMs,
      error: allFailed ? (errors.join('; ') || 'no series configured') : null, ...(errors.length && !allFailed ? { partial: errors.join('; ') } : {}) } as VenueFetchResult;
  }

  /** One market by ticker — the VERIFY step for Arena Vision and the only source of an outcome. */
  async fetchMarket(ticker: string): Promise<VenueMarket | null> {
    const r = await venueFetch(`${this.base}/markets/${encodeURIComponent(ticker)}`);
    if (!r.ok) return null;   /* observed: {"error":{"code":"not_found"}} with HTTP 404 */
    const j = await r.json() as { market: KalshiMarketRaw };
    return normalizeKalshiMarket(j.market, undefined, new Date().toISOString());
  }
}
