/* =============================================================
   ARENA VISION — the verification boundary, exercised with a STUB
   reader (this repository has no pixel reader). What is tested is
   everything after extraction: identification, venue verification,
   freshness, ambiguity, and that "VERIFIED" needs the venue's word.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LiveEngine } from '../engine/LiveEngine.ts';
import type { VisionReader } from '../engine/vision.ts';
import type { VixyModel } from '../engine/model.ts';
import { normalizeKalshiMarket, type KalshiMarketRaw } from '../engine/venues/kalshi.ts';
import type { VenueFetchResult, VenueMarket } from '../engine/venues/types.ts';
import type { ScanExtraction, ScanInput } from '../../types/index.ts';

const fx = (name: string) => JSON.parse(readFileSync(new URL(`../engine/venues/fixtures/${name}`, import.meta.url), 'utf8'));
const raw = (fx('kalshi-markets-nfl.json') as { markets: KalshiMarketRaw[] }).markets;
let clock = new Date('2026-09-06T02:05:00Z').getTime();
let venueUp = true; let venueLag = 0;
const at = (lag = 0) => new Date(clock - lag).toISOString();
const rows = (lag = 0) => raw.map((m) => normalizeKalshiMarket(m, { category: 'Sports', series_ticker: 'KXNFLGAME', title: 'game' }, at(lag)));
const venue = {
  venue: 'KALSHI' as const,
  async fetchOpen(): Promise<VenueFetchResult> { return { venue: 'KALSHI', fetchedAt: at(), latencyMs: 5, error: null, markets: rows() }; },
  async fetchMarket(id: string): Promise<VenueMarket | null> { if (!venueUp) throw new Error('venue unreachable'); return rows(venueLag).find((r) => r.venueMarketId === id) ?? null; },
};
const img: ScanInput = { fileName: 'shot.png', mimeType: 'image/png', bytes: 5000, dataUrl: 'data:image/png;base64,AAAA' };

/* The stub reader returns whatever the test says the image "shows". */
let shows: Partial<ScanExtraction> = {};
const reader: VisionReader = { version: 'stub-reader', async extract() { return { venue: null, title: null, outcome: null, printedProbabilityBps: null, closesAtText: null, category: null, legibilityBps: 9000, unreadable: [], ...shows }; } };
const model: VixyModel = {
  version: 'stub-model',
  read: (m, now) => (m.marketProbabilityBps === null ? null : { vixyBps: Math.min(9900, m.marketProbabilityBps + 900), confidenceBps: 7000, reversalRiskBps: 0, regime: 'TRENDING', evidence: ['stub'], rationale: 'stub', featureSetVersion: 'fs', dataAgeMs: 0, computedAt: now, inputs: {} }),
  reproduce: () => null,
};

test('no reader → UNREADABLE / NOT_VERIFIED, nothing invented', async () => {
  const e = new LiveEngine({ adapters: [venue], now: () => clock });
  const r = await e.scanMarket('u', img);
  assert.equal(r.status, 'UNREADABLE'); assert.equal(r.verdict, 'NOT_VERIFIED'); assert.equal(r.marketId, null); assert.match(r.rationale, /no image reader/);
});

test('weak extraction stops before identification; nothing market-shaped → NO_MARKET_DETECTED', async () => {
  const e = new LiveEngine({ adapters: [venue], now: () => clock, reader });
  shows = { title: 'Giants Rams', legibilityBps: 1000 };
  assert.equal((await e.scanMarket('u', img)).status, 'UNREADABLE');
  shows = { title: 'Will it rain in Lisbon on Tuesday' };
  const r = await e.scanMarket('u', img);
  assert.equal(r.status, 'NO_MARKET_DETECTED'); assert.equal(r.verdict, 'NOT_VERIFIED'); assert.match(r.rationale, /no market on the board scores/);
});

test('an identified market is VERIFIED only when the venue confirms it now; without a model the verdict is INSUFFICIENT_DATA', async () => {
  const e = new LiveEngine({ adapters: [venue], now: () => clock, reader });
  const board = (await e.load()).markets;
  const target = board.find((m) => m.matchup)!;
  shows = { title: `${target.matchup!.home.label} to beat ${target.matchup!.away.label}`, venue: 'KALSHI', printedProbabilityBps: target.marketProbabilityBps };
  const r = await e.scanMarket('u', img);
  assert.equal(r.status, 'VERIFIED'); assert.equal(r.marketId, target.id); assert.equal(r.verdict, 'INSUFFICIENT_DATA');
  assert.ok(r.matchBps! >= 5000); assert.equal(r.health.status, 'LIVE'); assert.equal(r.origin, 'LIVE');
  assert.ok(r.evidence.some((x) => x.label === 'Venue verification' && x.stance === 'SUPPORTS'));
  assert.ok(r.evidence.some((x) => x.label === 'VIXY read' && /no model/.test(x.detail)));
  assert.match(r.rationale, /FETCHING_MARKET — KALSHI confirms/);
});

test('venue down, or a stale venue read → UNVERIFIED / NOT_VERIFIED even though the market was identified', async () => {
  const e = new LiveEngine({ adapters: [venue], now: () => clock, reader });
  const target = (await e.load()).markets.find((m) => m.matchup)!;
  shows = { title: `${target.matchup!.home.label} to beat ${target.matchup!.away.label}`, venue: 'KALSHI' };
  venueUp = false;
  const down = await e.scanMarket('u', img);
  assert.equal(down.status, 'UNVERIFIED'); assert.equal(down.verdict, 'NOT_VERIFIED'); assert.equal(down.marketId, target.id);
  assert.ok(down.evidence.some((x) => x.stance === 'CAUTIONS' && /did not return/.test(x.detail)));
  venueUp = true; venueLag = 5 * 60_000;
  const stale = await e.scanMarket('u', img);
  assert.equal(stale.status, 'UNVERIFIED'); assert.match(stale.rationale, /not fresh enough/);
  venueLag = 0;
});

test('with a model the verdict comes from the same canonical edge; a printed price that disagrees with the venue is flagged', async () => {
  const e = new LiveEngine({ adapters: [venue], now: () => clock, reader, model });
  const target = (await e.load()).markets.find((m) => m.matchup && m.vixyProbabilityBps !== null)!;
  shows = { title: `${target.matchup!.home.label} to beat ${target.matchup!.away.label}`, venue: 'KALSHI', printedProbabilityBps: target.marketProbabilityBps! - 2500 };
  const r = await e.scanMarket('u', img);
  assert.equal(r.status, 'VERIFIED'); assert.equal(r.verdict, 'STRONG_EDGE');
  assert.ok(r.evidence.some((x) => x.label === 'Printed vs live price' && x.stance === 'CAUTIONS'));
});

test('ambiguity is returned, not resolved by guessing; choosing a candidate completes the scan', async () => {
  const e = new LiveEngine({ adapters: [venue], now: () => clock, reader });
  shows = { title: 'NFL game winner' }; /* matches every matchup subtitle about equally */
  const r = await e.scanMarket('u', img);
  if (r.status === 'AMBIGUOUS') {
    assert.ok(r.candidates.length >= 2); assert.equal(r.marketId, null); assert.equal(r.verdict, 'NOT_VERIFIED');
    const chosen = await e.scanMarket('u', { ...img, chooseMarketId: r.candidates[0].marketId });
    assert.equal(chosen.status, 'VERIFIED'); assert.equal(chosen.marketId, r.candidates[0].marketId); assert.match(chosen.rationale, /user chose/);
  } else {
    assert.equal(r.status, 'NO_MARKET_DETECTED', 'a generic title must not silently match one game');
  }
});
