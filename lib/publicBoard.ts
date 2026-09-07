import type { ArenaSnapshot, CanonicalMarket, PublicBoard } from '../types';

/** A market with every figure the door protects removed. Coverage stays. */
export function redactMarket(m: CanonicalMarket): CanonicalMarket {
  return {
    ...m,
    marketProbabilityBps: null, vixyProbabilityBps: null, edgeBps: null, confidenceBps: null,
    dispersionBps: null, reversalRiskBps: null, signalQualityBps: null, provenance: null,
    momentum: null, series: [], vixySeries: [],
    venueRefs: m.venueRefs.map((v) => ({ ...v, impliedBps: null, liquidityUsd: null, bidBps: null, askBps: null, spreadBps: null, volume24hUsd: null })),
  };
}

/**
 * The public view of a snapshot. `featured` keeps ONE market intact — the
 * widest disagreement on the board, as the engine ranks it — so the landing
 * page can show a real worked example. Used by the server for
 * GET /api/public/board and by demo builds locally.
 */
export function publicBoardFrom(snapshot: ArenaSnapshot, opts: { featured: boolean; redact: boolean }): PublicBoard {
  const ranked = [...snapshot.markets].sort((a, b) => Math.abs(b.edgeBps ?? 0) - Math.abs(a.edgeBps ?? 0));
  const featuredId = opts.featured && ranked[0] ? ranked[0].id : null;
  return {
    origin: snapshot.health.origin,
    asOf: snapshot.health.asOf,
    brain: {
      state: snapshot.brain.state, stage: snapshot.brain.stage, marketsTracked: snapshot.brain.marketsTracked,
      marketsMatched: snapshot.brain.marketsMatched, calibrationBps: snapshot.brain.calibrationBps,
    },
    markets: snapshot.markets.map((m) => (opts.redact && m.id !== featuredId ? redactMarket(m) : m)),
    events: snapshot.events ?? [],
    featuredId,
  };
}
