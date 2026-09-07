/* =============================================================
   VENUE LAYER — parsed against responses captured from the real
   Kalshi and Polymarket APIs on 2026-09-06 (through the operator's
   browser; the sandbox itself cannot reach either host).
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeKalshiMarket, kalshiCategory, type KalshiMarketRaw, type KalshiEventRaw } from '../engine/venues/kalshi.ts';
import { normalizePolymarketMarket, polymarketCategory, type GammaMarketRaw } from '../engine/venues/polymarket.ts';
import { buildCanonical, normalizeQuestion } from '../engine/canonical.ts';
import { LiveEngine } from '../engine/LiveEngine.ts';
import type { VenueFetchResult, VenueMarket } from '../engine/venues/types.ts';

const fx = (name: string) => JSON.parse(readFileSync(new URL(`../engine/venues/fixtures/${name}`, import.meta.url), 'utf8'));
const NOW = new Date('2026-09-06T02:05:00Z').getTime();
const AT = '2026-09-06T02:04:30Z';

test('Kalshi: dollar strings become integer bps; mid of the YES book is the implied price', () => {
  const k = fx('kalshi-markets-nfl.json') as { markets: KalshiMarketRaw[] };
  const kc = k.markets.find((m) => m.ticker === 'KXNFLGAME-26SEP20INDKC-KC')!;
  const vm = normalizeKalshiMarket(kc, { category: 'Sports', series_ticker: 'KXNFLGAME', title: 'IND Colts vs KC Chiefs' }, AT);
  assert.equal(vm.venue, 'KALSHI'); assert.equal(vm.category, 'SPORTS'); assert.equal(vm.series, 'KXNFLGAME');
  assert.equal(vm.bidBps, 7200); assert.equal(vm.askBps, 7600); assert.equal(vm.impliedBps, 7400); assert.equal(vm.spreadBps, 400);
  assert.equal(vm.volume24hUsd, 242.79); assert.equal(vm.openInterest, 670.64); assert.equal(vm.status, 'OPEN');
  assert.equal(vm.closesAt, '2026-09-23T00:20:00Z'); assert.equal(vm.occursAt, '2026-09-21T03:20:00Z');
  assert.match(vm.rules!, /Kansas City wins/);
});

test('Kalshi: a dead book (0/0) is no price, not 0%', () => {
  const dead: KalshiMarketRaw = { ticker: 'X', event_ticker: 'E', title: 't', status: 'active', close_time: '2026-09-20T00:00:00Z', last_price_dollars: '0.0000', yes_bid_dollars: '0.0000', yes_ask_dollars: '0.0000' };
  assert.equal(normalizeKalshiMarket(dead, undefined, AT).impliedBps, null);
});

test('Kalshi: categories map onto the Arena universe and never invent one', () => {
  const ev = fx('kalshi-events.json') as { categories: Record<string, number>; events: KalshiEventRaw[] };
  const seen = new Set(Object.keys(ev.categories).map((c) => kalshiCategory(c, 'KXFOO')));
  assert.deepEqual([...seen].sort(), ['ECONOMICS', 'FINANCE', 'POLITICS', 'SCIENCE', 'SPORTS', 'WEATHER', 'WORLD', 'CULTURE'].sort());
  assert.equal(kalshiCategory('Economics', 'KXBTCD'), 'CRYPTO');
  assert.equal(kalshiCategory('Something New', 'KXZZZ'), 'OTHER');
  const mars = normalizeKalshiMarket(ev.events[0].markets![0], ev.events[0], AT);
  assert.equal(mars.category, 'WORLD'); assert.equal(mars.impliedBps, 1100);
});

test('Polymarket: JSON-encoded outcome arrays parse; Yes/No and Team/Team both price the first listed side', () => {
  const rows = (fx('polymarket-gamma-markets.json') as { markets: GammaMarketRaw[] }).markets;
  const fed = normalizePolymarketMarket(rows[0], AT)!;
  assert.equal(fed.venue, 'POLYMARKET'); assert.equal(fed.impliedBps, 35); assert.equal(fed.bidBps, 30); assert.equal(fed.askBps, 40);
  assert.equal(fed.category, 'ECONOMICS'); assert.equal(fed.outcomeLabel, '25 bps decrease'); assert.equal(fed.closesAt, '2026-09-16T00:00:00Z');
  const tennis = normalizePolymarketMarket(rows[1], AT)!;
  assert.equal(tennis.category, 'SPORTS'); assert.equal(tennis.impliedBps, 1650); assert.notEqual(tennis.outcomeLabel, 'Yes');
  assert.ok(fed.volume24hUsd! > 1_000_000);
});

test('Polymarket: a non-binary market is skipped, not forced', () => {
  const multi: GammaMarketRaw = { id: '1', question: 'Who wins?', slug: 'x', outcomes: '["A","B","C"]', outcomePrices: '["0.2","0.3","0.5"]' };
  assert.equal(normalizePolymarketMarket(multi, AT), null);
  assert.equal(polymarketCategory({ id: '2', question: 'Will it snow in NYC on Christmas?', slug: 'y' }), 'WEATHER');
});

test('Canonical: a Kalshi two-sided game becomes ONE market with a matchup, one event, and NO VIXY number', () => {
  const k = fx('kalshi-markets-nfl.json') as { markets: KalshiMarketRaw[] };
  const rows = k.markets.map((m) => normalizeKalshiMarket(m, { category: 'Sports', series_ticker: 'KXNFLGAME', title: m.rules_primary!.match(/the (.*?) Pro Football/)![1] }, AT));
  const { markets, events } = buildCanonical(rows, NOW);
  assert.equal(markets.length, 6); assert.equal(events.length, 6);
  const kc = markets.find((m) => m.symbol === 'KC/IND')!;
  assert.ok(kc, 'KC/IND matchup exists');
  assert.equal(kc.matchup!.home.probabilityBps, 7400); assert.equal(kc.matchup!.away.probabilityBps, 2500);
  assert.equal(kc.marketProbabilityBps, 7400);
  assert.equal(kc.vixyProbabilityBps, null); assert.equal(kc.edgeBps, null); assert.equal(kc.confidenceBps, null); assert.equal(kc.provenance, null);
  assert.equal(kc.health.origin, 'LIVE'); assert.equal(kc.health.status, 'LIVE'); assert.equal(kc.venueRefs[0].venue, 'KALSHI');
  assert.equal(events[0].league, 'NFL'); assert.equal(events[0].category, 'SPORTS'); assert.equal(events.find((e) => e.marketIds[0] === kc.id)!.status, 'UPCOMING');
});

test('Canonical: the same question on both venues merges into one market with two refs and a consensus', () => {
  const a: VenueMarket = base('KALSHI', 'K1', 'Will the Fed cut rates in September?', 6000, 5000);
  const b: VenueMarket = base('POLYMARKET', 'P1', 'Will the Fed cut rates in September', 6400, 15000);
  const { markets, matched } = buildCanonical([a, b], NOW);
  assert.equal(markets.length, 1); assert.equal(matched, 1);
  assert.equal(markets[0].venueRefs.length, 2);
  assert.equal(markets[0].marketProbabilityBps, 6300); /* liquidity-weighted: (6000*5000 + 6400*15000)/20000 */
  assert.equal(markets[0].dispersionBps, 400);
  assert.equal(normalizeQuestion('Will the Fed cut rates in September?'), normalizeQuestion('Will the Fed cut rates in September'));
});

test('Canonical: health is computed from data age — a 10-minute-old read is DEGRADED, an errored venue is DEGRADED', () => {
  const fresh = base('KALSHI', 'K1', 'q1', 5000, 1); const old = { ...base('KALSHI', 'K2', 'q2', 5000, 1), fetchedAt: '2026-09-06T01:50:00Z' };
  const { markets } = buildCanonical([fresh, old], NOW);
  assert.equal(markets.find((m) => m.title === 'q1')!.health.status, 'LIVE');
  assert.equal(markets.find((m) => m.title === 'q2')!.health.status, 'DEGRADED');
  const { markets: err } = buildCanonical([fresh], NOW, { KALSHI: true });
  assert.equal(err[0].health.status, 'DEGRADED');
});

test('LiveEngine: composes an honest snapshot — real markets, LIVE origin, null calibration, no calls, refuses to grade a call', async () => {
  const k = fx('kalshi-markets-nfl.json') as { markets: KalshiMarketRaw[] };
  const pm = (fx('polymarket-gamma-markets.json') as { markets: GammaMarketRaw[] }).markets;
  const kalshi = { venue: 'KALSHI' as const, async fetchOpen(): Promise<VenueFetchResult> { return { venue: 'KALSHI', fetchedAt: AT, latencyMs: 80, error: null, markets: k.markets.map((m) => normalizeKalshiMarket(m, { category: 'Sports', series_ticker: 'KXNFLGAME', title: 'game' }, AT)) }; } };
  const poly = { venue: 'POLYMARKET' as const, async fetchOpen(): Promise<VenueFetchResult> { return { venue: 'POLYMARKET', fetchedAt: AT, latencyMs: 120, error: null, markets: pm.map((m) => normalizePolymarketMarket(m, AT)!).filter(Boolean) }; } };
  const engine = new LiveEngine({ adapters: [kalshi, poly], now: () => NOW });
  const s = await engine.load();
  assert.equal(s.health.origin, 'LIVE'); assert.equal(s.health.status, 'LIVE');
  assert.equal(s.markets.length, 6 + 6); assert.equal(s.brain.marketsTracked, 12); assert.equal(s.brain.calibrationBps, null);
  assert.equal(s.brain.modelVersion, 'none — no model connected');
  assert.ok(s.markets.every((m) => m.vixyProbabilityBps === null && m.edgeBps === null));
  assert.deepEqual(s.calls, []); assert.deepEqual(s.leaderboard, []); assert.deepEqual(s.opportunities, []);
  assert.equal(s.system.sources.length, 2); assert.ok(s.system.sources.every((x) => x.status === 'LIVE'));
  /* No model → the quote carries no VIXY probability; the ledger refuses on that. */
  const q = await engine.quote(s.markets[0].id);
  assert.ok(q); assert.equal(q!.vixyBps, null); assert.equal(q!.origin, 'LIVE'); assert.ok(q!.marketBps !== null);
  assert.equal(await engine.quote('cm_nope'), null);
  /* No fetchMarket on these stub adapters → no outcome can ever be produced. */
  assert.equal(await engine.resolve(s.markets[0].id), null);
  const scan = await engine.scanMarket('u', { fileName: 'a.png', mimeType: 'image/png', bytes: 10, dataUrl: 'data:image/png;base64,AA' });
  assert.equal(scan.status, 'UNREADABLE'); assert.equal(scan.verdict, 'NOT_VERIFIED'); assert.equal(scan.marketId, null);
});

test('LiveEngine: a failing venue keeps its last rows and reports DEGRADED instead of pretending', async () => {
  let fail = false;
  const k = fx('kalshi-markets-nfl.json') as { markets: KalshiMarketRaw[] };
  const kalshi = { venue: 'KALSHI' as const, async fetchOpen(): Promise<VenueFetchResult> {
    if (fail) return { venue: 'KALSHI', fetchedAt: AT, latencyMs: 5000, error: 'Kalshi events 503', markets: [] };
    return { venue: 'KALSHI', fetchedAt: AT, latencyMs: 80, error: null, markets: k.markets.map((m) => normalizeKalshiMarket(m, { category: 'Sports', series_ticker: 'KXNFLGAME', title: 'game' }, AT)) };
  } };
  const engine = new LiveEngine({ adapters: [kalshi], now: () => NOW });
  const first = await engine.load(); assert.equal(first.markets.length, 6);
  fail = true; await engine.refresh(); const second = await engine.load();
  assert.equal(second.markets.length, 6, 'rows retained'); assert.equal(second.system.sources[0].status, 'DEGRADED'); assert.equal(second.system.sources[0].successRateBps, 0);
  assert.ok(second.markets.every((m) => m.health.status === 'DEGRADED'));
});

function base(venue: 'KALSHI' | 'POLYMARKET', id: string, q: string, bps: number, liq: number): VenueMarket {
  return { venue, venueMarketId: id, venueEventId: null, eventTitle: q, outcomeLabel: 'Yes', question: q, category: 'ECONOMICS', series: null,
    impliedBps: bps, bidBps: bps - 100, askBps: bps + 100, spreadBps: 200, liquidityUsd: liq, volume24hUsd: null, volumeUsd: null, openInterest: null,
    closesAt: '2026-09-16T00:00:00Z', occursAt: null, status: 'OPEN', rules: null, url: 'https://x', fetchedAt: AT };
}

/* ---- captured live 2026-09-06 through Oliver's browser: series discovery, settlement, resolution ---- */
test('Kalshi series discovery: real open interest becomes depth (liquidity_dollars is 0.0000 on public reads), full team names, two-sided events', () => {
  const j = fx('kalshi-events-series-nfl.json') as { events: KalshiEventRaw[] };
  const rows = j.events.flatMap((e) => (e.markets ?? []).map((m) => normalizeKalshiMarket(m, e, AT)));
  assert.equal(rows.length, 4);
  assert.ok(rows.every((r) => r.liquidityUsd !== null && r.liquidityUsd! > 100_000), 'depth from open_interest_fp');
  assert.equal(rows[0].outcomeLabel, 'Seattle'); assert.equal(rows[0].category, 'SPORTS'); assert.equal(rows[0].impliedBps, 6250);
  const b = buildCanonical(rows, NOW);
  assert.equal(b.markets.length, 2); assert.ok(b.markets.every((m) => m.matchup));
  assert.equal(b.markets[0].title, 'Seattle to beat New England');
});

test('Kalshi settled market: result "no" + status finalized → SETTLED / NO; never inferred from the 0/1 book', () => {
  const j = fx('kalshi-market-settled.json') as { market: KalshiMarketRaw };
  const vm = normalizeKalshiMarket(j.market, undefined, AT);
  assert.equal(vm.status, 'SETTLED'); assert.equal(vm.result, 'NO');
  const open = normalizeKalshiMarket({ ...j.market, result: '', status: 'active' }, undefined, AT);
  assert.equal(open.result, null, 'a 0/1 book without a published result is not a result');
});

test('Polymarket resolution: closed + umaResolutionStatus=resolved + 0/1 prices → SETTLED; "proposed" is still open', () => {
  const j = fx('polymarket-gamma-resolution.json') as { markets: GammaMarketRaw[] };
  const resolved = normalizePolymarketMarket(j.markets[0], AT)!;
  assert.equal(resolved.status, 'SETTLED'); assert.equal(resolved.result, 'NO');
  const proposed = normalizePolymarketMarket(j.markets[1], AT)!;
  assert.equal(proposed.status, 'OPEN'); assert.equal(proposed.result, null); assert.equal(proposed.impliedBps, 9995);
  assert.ok(proposed.liquidityUsd! > 700_000);
});

test('LiveEngine honours a venue back-off (429 + Retry-After) and keeps the last rows while backing off', async () => {
  let calls = 0; let mode: 'ok' | '429' = 'ok';
  const k = fx('kalshi-markets-nfl.json') as { markets: KalshiMarketRaw[] };
  const rows = () => k.markets.slice(0, 2).map((m) => normalizeKalshiMarket(m, { category: 'Sports', series_ticker: 'KXNFLGAME', title: 'g' }, AT));
  const kalshi = { venue: 'KALSHI' as const, async fetchOpen(): Promise<VenueFetchResult> { calls++; return mode === 'ok'
    ? { venue: 'KALSHI', fetchedAt: AT, latencyMs: 1, error: null, markets: rows(), endpoint: 'x', httpStatus: 200, retryAfterMs: null }
    : { venue: 'KALSHI', fetchedAt: AT, latencyMs: 1, error: '429 rate limited', markets: [], endpoint: 'x', httpStatus: 429, retryAfterMs: 60_000 }; } };
  let now = NOW;
  const engine = new LiveEngine({ adapters: [kalshi], now: () => now });
  await engine.refresh(); assert.equal((await engine.load()).markets.length, 1);
  mode = '429'; await engine.refresh();
  const s1 = await engine.load(); assert.equal(s1.markets.length, 1, 'last rows kept'); assert.equal(s1.system.sources[0].note, '429 rate limited'); assert.equal(s1.system.sources[0].status, 'DEGRADED');
  const before = calls; now += 30_000; await engine.refresh(); assert.equal(calls, before, 'no call inside the back-off window');
  now += 40_000; mode = 'ok'; await engine.refresh(); assert.equal(calls, before + 1, 'asks again once Retry-After has passed');
});
