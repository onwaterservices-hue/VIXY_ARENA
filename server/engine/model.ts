/* =============================================================
   THE MODEL SEAM — the one place a VIXY probability can enter.

   `VixyModel` is the only model interface in the Arena. LiveEngine
   runs without one and says so on every payload. With one, its
   reads are attached to canonical markets with provenance, quotes
   carry them into locks, and nothing else in the server changes.

   A model that returns null for a market is saying "I have no read"
   (SKIP) — the market then shows "—" and cannot be locked. That is
   the contract: silence over invention.

   Four quantities the read keeps apart, on purpose:
     market probability  what the venue prices (not in the read; on the market)
     vixyBps             what the model estimates
     edge                vixy − market, computed by applyModel, never by the model
     confidenceBps       how much the model trusts its estimate — NOT the edge size
   ============================================================= */
import type { Bps, CanonicalMarket, Regime } from '../../types/index.ts';

export interface ModelRead {
  /** The model's YES probability, bps. */
  vixyBps: Bps;
  /** Confidence in that estimate, bps. Independent of edge size by construction. */
  confidenceBps: Bps;
  /** Risk that the current direction reverses before close, bps. */
  reversalRiskBps: Bps;
  regime: Regime;
  /** Human-checkable inputs the read rests on, each with a measured value; frozen into any lock. */
  evidence: string[];
  /** One paragraph in the model's own words. */
  rationale: string;
  featureSetVersion: string;
  /** Age of the oldest input the read used, ms. */
  dataAgeMs: number;
  /** When the read was computed (server clock, ms). */
  computedAt: number;
  /** The exact inputs, so the read can be reproduced later from a lock row. */
  inputs: unknown;
}

export interface VixyModel {
  /** Immutable identifier. A material change to behaviour or constants is a NEW version string. */
  readonly version: string;
  /** Null when the model has no honest read for this market (SKIP). */
  read(market: CanonicalMarket, now: number): ModelRead | null;
  /** Re-run the model on frozen inputs. Must return the same vixyBps for the same inputs, forever. */
  reproduce(inputs: unknown): ModelRead | null;
}

/** Attach a model read to a canonical market, with provenance. Pure. */
export function applyModel(m: CanonicalMarket, model: VixyModel, now: number): CanonicalMarket {
  const r = model.read(m, now);
  if (!r || m.marketProbabilityBps === null) return m;
  return {
    ...m,
    vixyProbabilityBps: r.vixyBps,
    edgeBps: r.vixyBps - m.marketProbabilityBps,
    confidenceBps: r.confidenceBps,
    reversalRiskBps: r.reversalRiskBps,
    regime: r.regime,
    provenance: { modelVersion: model.version, featureSetVersion: r.featureSetVersion, inputs: r.evidence, computedAt: new Date(r.computedAt).toISOString() },
  };
}
