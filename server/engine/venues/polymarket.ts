/* =============================================================
   POLYMARKET — Gamma API, public (no key). Shapes as observed live
   on 2026-09-06 (fixtures/polymarket-gamma-markets.json): `outcomes`
   and `outcomePrices` are JSON-encoded strings; prices are 0..1.
   ============================================================= */
import type { MarketCategory } from '../../../types/index.ts';
import type { VenueFetchResult, VenueMarket } from './types.ts';
import { depthUsd, toBps, toNum, venueFetch } from './types.ts';

export interface GammaMarketRaw {
  id: string; question: string; conditionId?: string; slug: string; endDate?: string; startDate?: string;
  active?: boolean; closed?: boolean; acceptingOrders?: boolean;
  outcomes?: string; outcomePrices?: string; volume?: string | number; volume24hr?: number; liquidity?: string | number;
  bestBid?: number; bestAsk?: number; lastTradePrice?: number; spread?: number; groupItemTitle?: string; description?: string;
  umaResolutionStatus?: string; updatedAt?: string; closedTime?: string;
  events?: { id?: string; title?: string; slug?: string; category?: string }[];
}

/** Gamma rarely fills `category`; the question text is the honest fallback, and OTHER when it says nothing. */
export function polymarketCategory(m: GammaMarketRaw): MarketCategory {
  const cat = (m.events?.[0]?.category ?? '').toLowerCase();
  if (cat) {
    if (/sport/.test(cat)) return 'SPORTS'; if (/politic|election/.test(cat)) return 'POLITICS'; if (/crypto/.test(cat)) return 'CRYPTO';
    if (/econom|fed|inflation/.test(cat)) return 'ECONOMICS'; if (/finance|stock|market/.test(cat)) return 'FINANCE';
    if (/weather|climate/.test(cat)) return 'WEATHER'; if (/science/.test(cat)) return 'SCIENCE'; if (/tech|ai/.test(cat)) return 'TECHNOLOGY';
    if (/entertain|movie|music|award/.test(cat)) return 'ENTERTAINMENT'; if (/culture|pop/.test(cat)) return 'CULTURE'; if (/world|geopolit/.test(cat)) return 'WORLD';
  }
  const q = `${m.events?.[0]?.title ?? ''} ${m.question}`.toLowerCase();
  if (/\b(fed|fomc|interest rate|cpi|inflation|gdp|jobs report|unemployment)\b/.test(q)) return 'ECONOMICS';
  if (/\b(bitcoin|btc|ethereum|eth|solana|sol|xrp|doge|crypto)\b/.test(q)) return 'CRYPTO';
  if (/\b(nfl|nba|mlb|nhl|ufc|atp|wta|us open|premier league|la liga|serie a|bundesliga|champions league|fc|win on \d{4}-\d{2}-\d{2}|vs\.?)\b/.test(q)) return 'SPORTS';
  if (/\b(election|president|senate|congress|governor|parliament|prime minister|nominee)\b/.test(q)) return 'POLITICS';
  if (/\b(s&p|nasdaq|dow|stock|earnings|ipo|market cap)\b/.test(q)) return 'FINANCE';
  if (/\b(hurricane|temperature|snow|rain|storm|heat)\b/.test(q)) return 'WEATHER';
  if (/\b(oscar|grammy|box office|album|billboard|emmy|movie)\b/.test(q)) return 'ENTERTAINMENT';
  if (/\b(openai|gpt|apple|tesla|spacex|launch|ai model)\b/.test(q)) return 'TECHNOLOGY';
  return 'OTHER';
}

function parseList(s: string | undefined): string[] {
  if (!s) return [];
  try { const v = JSON.parse(s); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}

export function normalizePolymarketMarket(m: GammaMarketRaw, fetchedAt: string): VenueMarket | null {
  const outcomes = parseList(m.outcomes); const prices = parseList(m.outcomePrices);
  if (outcomes.length !== 2 || prices.length !== 2) return null; /* only binary markets become canonical rows today */
  const yesIdx = outcomes.findIndex((o) => o.toLowerCase() === 'yes');
  const idx = yesIdx >= 0 ? yesIdx : 0; /* "Team A / Team B": the first outcome is the priced side */
  const implied = toBps(prices[idx]);
  const bid = idx === 0 ? toBps(m.bestBid) : null; const ask = idx === 0 ? toBps(m.bestAsk) : null;
  /* Resolution: only a closed market whose UMA status says "resolved" AND whose priced side settled to exactly 1 or 0.
     Verified live 2026-09-06 (fixtures/polymarket-gamma-resolution.json): resolved → closed:true, umaResolutionStatus:"resolved",
     outcomePrices ["0","1"]. "proposed" is NOT a resolution and stays open/closed without a result. */
  let result: VenueMarket['result'] = null;
  if (m.closed && (m.umaResolutionStatus ?? '').toLowerCase() === 'resolved') {
    const p = Number(prices[idx]);
    result = p === 1 ? 'YES' : p === 0 ? 'NO' : null;
  }
  return {
    venue: 'POLYMARKET', venueMarketId: m.conditionId ?? m.id, venueEventId: m.events?.[0]?.id ?? null,
    eventTitle: m.events?.[0]?.title ?? m.question, outcomeLabel: yesIdx >= 0 ? (m.groupItemTitle || 'Yes') : outcomes[idx], question: m.question,
    category: polymarketCategory(m), series: null,
    impliedBps: implied, bidBps: bid, askBps: ask, spreadBps: bid !== null && ask !== null ? ask - bid : (toBps(m.spread) ?? null),
    liquidityUsd: depthUsd(toNum(m.liquidity), null, toNum(m.volume24hr)), volume24hUsd: toNum(m.volume24hr), volumeUsd: toNum(m.volume), openInterest: null,
    closesAt: m.endDate ?? new Date(0).toISOString(), occursAt: null,
    status: result ? 'SETTLED' : m.closed ? 'CLOSED' : m.active === false ? 'UNKNOWN' : 'OPEN', result,
    rules: m.description ? m.description.slice(0, 400) : null, url: `https://polymarket.com/market/${m.slug}`,
    fetchedAt,
  };
}

export class PolymarketAdapter {
  readonly venue = 'POLYMARKET' as const;
  private base: string;
  constructor(base = 'https://gamma-api.polymarket.com') { this.base = base; }

  /** Open, order-accepting markets by 24h volume. Observed live 2026-09-06: `order=volume24hr&ascending=false` is honoured. */
  async fetchOpen(limit = 200): Promise<VenueFetchResult> {
    const t0 = Date.now();
    const endpoint = `${this.base}/markets?limit=${Math.min(limit, 500)}&active=true&closed=false&order=volume24hr&ascending=false`;
    try {
      const r = await venueFetch(endpoint);
      if (r.status === 429) return { venue: 'POLYMARKET', markets: [], fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0, error: '429 rate limited', endpoint, httpStatus: 429, retryAfterMs: Number(r.headers.get('retry-after') ?? 30) * 1000 };
      if (!r.ok) throw new Error(`Polymarket gamma HTTP ${r.status}`);
      const rows = await r.json() as GammaMarketRaw[];
      const fetchedAt = new Date().toISOString();
      const markets = rows.map((m) => normalizePolymarketMarket(m, fetchedAt)).filter((x): x is VenueMarket => x !== null);
      return { venue: 'POLYMARKET', markets, fetchedAt, latencyMs: Date.now() - t0, error: null, endpoint, httpStatus: r.status, retryAfterMs: null };
    } catch (e) {
      return { venue: 'POLYMARKET', markets: [], fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0, error: e instanceof Error ? e.message : String(e), endpoint, httpStatus: null, retryAfterMs: null };
    }
  }

  /** One market by slug or condition id — the VERIFY step for Arena Vision. */
  async fetchMarket(slugOrId: string): Promise<VenueMarket | null> {
    const q = /^0x[0-9a-f]{64}$/i.test(slugOrId) ? `condition_ids=${slugOrId}` : `slug=${encodeURIComponent(slugOrId)}`;
    const r = await venueFetch(`${this.base}/markets?${q}`);
    if (!r.ok) return null;   /* observed: {"type":"validation error","error":"id is invalid"} for a bad id */
    const rows = await r.json() as GammaMarketRaw[];
    return rows[0] ? normalizePolymarketMarket(rows[0], new Date().toISOString()) : null;
  }
}
