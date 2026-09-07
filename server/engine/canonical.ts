/* =============================================================
   THE CANONICAL MARKET LAYER — venue rows become Arena markets.
   Everything here is bookkeeping, not modeling: the market
   probability is the venue's, the VIXY probability is NULL until a
   model exists, and therefore the edge is null too. The health
   envelope is computed from the data's age, never asserted.
   ============================================================= */
import type {
  ArenaEvent, ArenaEventStatus, CanonicalMarket, FeedStatus, HealthEnvelope, MarketCategory, MarketState, Venue, VenueRef,
} from '../../types/index.ts';
import type { VenueMarket } from './venues/types.ts';

export const FRESH_MS = 60_000;      /* a venue read younger than this is LIVE */
export const STALE_MS = 5 * 60_000;  /* older than this is DEGRADED */

export function feedStatus(fetchedAt: string, now: number, errored: boolean): FeedStatus {
  if (errored) return 'DEGRADED';
  const age = now - new Date(fetchedAt).getTime();
  if (age <= FRESH_MS) return 'LIVE';
  if (age <= STALE_MS) return 'STALE';
  return 'DEGRADED';
}

export function envelope(now: number, dataAgeMs: number, status: FeedStatus, sourceHealth: Record<string, FeedStatus>): HealthEnvelope {
  return { asOf: new Date(now).toISOString(), dataAgeMs, status, sourceHealth, origin: 'LIVE' };
}

const worst = (a: FeedStatus, b: FeedStatus): FeedStatus => {
  const rank: FeedStatus[] = ['LIVE', 'STALE', 'RECONNECTING', 'DEGRADED', 'OFFLINE', 'UNKNOWN'];
  return rank.indexOf(a) >= rank.indexOf(b) ? a : b;
};

/** Short display symbol: team codes for a matchup, otherwise a compact slug of the outcome. */
export function symbolFor(vm: VenueMarket, matchup: { home: string; away: string } | null): string {
  if (matchup) return `${matchup.home}/${matchup.away}`;
  const s = vm.outcomeLabel.replace(/[^A-Za-z0-9 ]/g, '').trim().split(/\s+/).map((w) => w.slice(0, 4)).join('').toUpperCase();
  return (s || vm.venueMarketId.slice(0, 8)).slice(0, 10);
}

/* Kalshi encodes the side in the ticker suffix (KXNFLGAME-26SEP21NYGLAR-NYG → NYG); fall back to the label. */
const teamCode = (vm: VenueMarket) => {
  const suffix = vm.venue === 'KALSHI' ? vm.venueMarketId.split('-').pop() ?? '' : '';
  if (/^[A-Z0-9]{2,5}$/.test(suffix)) return suffix;
  return vm.outcomeLabel.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'TBD';
};

/* Kalshi abbreviates side labels ("New York G") while the event title carries the full names
   ("New York Giants vs Los Angeles Rams" / "NY Giants vs LA Rams"). When the event title splits on
   "vs" into two names that begin with the abbreviated labels, use the full names. Otherwise keep
   the venue's labels verbatim — nothing is invented. */
export function fullLabels(home: VenueMarket, away: VenueMarket): { home: string; away: string } {
  const parts = home.eventTitle.split(/\s+(?:vs\.?|v|at|@)\s+/i).map((x) => x.trim()).filter(Boolean);
  if (parts.length !== 2) return { home: home.outcomeLabel, away: away.outcomeLabel };
  const head = (s: string) => s.replace(/[^A-Za-z]/g, '').slice(0, 3).toLowerCase();
  const match = (label: string) => parts.find((p) => head(p) === head(label) || p.toLowerCase().startsWith(label.toLowerCase().slice(0, 4)));
  const h = match(home.outcomeLabel); const a = match(away.outcomeLabel);
  if (!h || !a || h === a) return { home: home.outcomeLabel, away: away.outcomeLabel };
  return { home: h.length >= home.outcomeLabel.length ? h : home.outcomeLabel, away: a.length >= away.outcomeLabel.length ? a : away.outcomeLabel };
}

export interface CanonicalBuild { markets: CanonicalMarket[]; events: ArenaEvent[]; matched: number }

/**
 * Build canonical markets from venue rows.
 *  - Kalshi two-sided events (Team A wins / Team B wins) collapse into ONE market with a matchup.
 *  - Rows that appear on both venues with the same normalized question are merged into one
 *    canonical market with two venue refs (the consensus is the liquidity-weighted mean).
 */
export function buildCanonical(rows: VenueMarket[], now: number, venueErrors: Partial<Record<Venue, boolean>> = {}): CanonicalBuild {
  const byEvent = new Map<string, VenueMarket[]>();
  const singles: VenueMarket[] = [];
  for (const r of rows) {
    if (r.status !== 'OPEN') continue;
    if (r.venue === 'KALSHI' && r.venueEventId && r.category === 'SPORTS') {
      const list = byEvent.get(r.venueEventId) ?? []; list.push(r); byEvent.set(r.venueEventId, list);
    } else singles.push(r);
  }

  const markets: CanonicalMarket[] = [];
  const events: ArenaEvent[] = [];

  /* Matchups: exactly two mutually exclusive sides. */
  for (const [eventId, sides] of byEvent) {
    if (sides.length !== 2) { singles.push(...sides); continue; }
    const [a, b] = sides;
    const home = a; const away = b;
    const st = feedStatus(home.fetchedAt, now, Boolean(venueErrors.KALSHI));
    const codes = { home: teamCode(home), away: teamCode(away) };
    const labels = fullLabels(home, away);
    const market = toCanonical(home, now, st, `${labels.home} to beat ${labels.away}`, `${home.eventTitle}`, symbolFor(home, codes), {
      home: { code: codes.home, label: labels.home, probabilityBps: home.impliedBps, status: st },
      away: { code: codes.away, label: labels.away, probabilityBps: away.impliedBps, status: st },
      window: home.series ? seriesWindow(home.series) : null,
    });
    markets.push(market);
    const startsAt = home.occursAt ?? home.closesAt;
    events.push({
      id: `ev_${eventId}`, title: home.eventTitle, league: leagueOf(home.series), category: 'SPORTS', startsAt,
      status: eventStatus(startsAt, home.closesAt, now), venues: ['KALSHI'], marketIds: [market.id], note: null,
      health: market.health,
    });
  }

  /* Cross-venue merge on the normalized question. */
  const groups = new Map<string, VenueMarket[]>();
  for (const s of singles) { const k = normalizeQuestion(s.question); const g = groups.get(k) ?? []; g.push(s); groups.set(k, g); }
  let matched = 0;
  for (const g of groups.values()) {
    const venues = new Set(g.map((x) => x.venue));
    const primary = g[0];
    const st = g.map((x) => feedStatus(x.fetchedAt, now, Boolean(venueErrors[x.venue]))).reduce(worst);
    const m = toCanonical(primary, now, st, primary.question, primary.eventTitle !== primary.question ? primary.eventTitle : null, symbolFor(primary, null), null);
    if (venues.size > 1) {
      matched++;
      m.venueRefs = g.map((x) => venueRef(x, feedStatus(x.fetchedAt, now, Boolean(venueErrors[x.venue]))));
      m.marketProbabilityBps = consensus(g);
      m.dispersionBps = dispersion(g);
      m.health = { ...m.health, sourceHealth: Object.fromEntries(g.map((x) => [x.venue.toLowerCase(), feedStatus(x.fetchedAt, now, Boolean(venueErrors[x.venue]))])) };
    }
    markets.push(m);
  }
  return { markets, events, matched };
}

function toCanonical(vm: VenueMarket, now: number, st: FeedStatus, title: string, subtitle: string | null, symbol: string, matchup: CanonicalMarket['matchup']): CanonicalMarket {
  const age = Math.max(0, now - new Date(vm.fetchedAt).getTime());
  return {
    id: `cm_${vm.venue.toLowerCase()}_${vm.venueMarketId.replace(/[^A-Za-z0-9_-]/g, '')}`,
    symbol, title, subtitle, category: vm.category as MarketCategory, state: marketState(vm, now),
    closesAt: vm.closesAt,
    venueRefs: [venueRef(vm, st)],
    marketProbabilityBps: vm.impliedBps,
    /* No model is connected. Saying null is the whole point. */
    vixyProbabilityBps: null, edgeBps: null, confidenceBps: null, dispersionBps: null,
    regime: 'UNKNOWN', reversalRiskBps: null, signalQualityBps: null, provenance: null,
    resolution: vm.rules ? { statement: vm.rules, source: vm.venue === 'KALSHI' ? 'Kalshi rules (primary)' : 'Polymarket resolution description' } : null,
    matchup, phase: 'PREGAME', momentum: null, series: [], vixySeries: [],
    health: envelope(now, age, st, { [vm.venue.toLowerCase()]: st }),
  };
}

function venueRef(vm: VenueMarket, st: FeedStatus): VenueRef {
  return { venue: vm.venue, venueMarketId: vm.venueMarketId, impliedBps: vm.impliedBps, liquidityUsd: vm.liquidityUsd, bidBps: vm.bidBps, askBps: vm.askBps, spreadBps: vm.spreadBps, volume24hUsd: vm.volume24hUsd, status: st };
}

function marketState(vm: VenueMarket, now: number): MarketState {
  if (vm.status === 'SETTLED') return 'SETTLED';
  if (vm.status === 'CLOSED') return 'LOCKED';
  const closeIn = new Date(vm.closesAt).getTime() - now;
  return closeIn < 15 * 60_000 ? 'LOCKING' : 'OPEN';
}

function eventStatus(startsAt: string, closesAt: string, now: number): ArenaEventStatus {
  const s = new Date(startsAt).getTime(); const c = new Date(closesAt).getTime();
  if (now >= c) return 'CLOSED';
  if (now >= s) return 'LIVE';
  if (s - now < 6 * 3_600_000) return 'CLOSING_SOON';
  return 'UPCOMING';
}

export function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\b(will|the|a|an|be|to|of|in|on|at|by|before|after)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

function consensus(g: VenueMarket[]): number | null {
  const priced = g.filter((x) => x.impliedBps !== null);
  if (!priced.length) return null;
  const w = priced.map((x) => Math.max(1, x.liquidityUsd ?? x.volume24hUsd ?? 1));
  const total = w.reduce((a, b) => a + b, 0);
  return Math.round(priced.reduce((acc, x, i) => acc + (x.impliedBps as number) * w[i], 0) / total);
}
function dispersion(g: VenueMarket[]): number | null {
  const p = g.map((x) => x.impliedBps).filter((x): x is number => x !== null);
  return p.length > 1 ? Math.max(...p) - Math.min(...p) : null;
}

const LEAGUES: Record<string, string> = { KXNFLGAME: 'NFL', KXNBAGAME: 'NBA', KXMLBGAME: 'MLB', KXNHLGAME: 'NHL', KXUFC: 'UFC', KXATPMATCH: 'ATP', KXWTAMATCH: 'WTA', KXEPLGAME: 'Premier League', KXNCAAFGAME: 'NCAAF' };
const leagueOf = (series: string | null) => (series ? LEAGUES[series] ?? series.replace(/^KX/, '') : null);
const seriesWindow = (series: string) => (/GAME|MATCH/.test(series) ? 'FULL GAME' : null);
