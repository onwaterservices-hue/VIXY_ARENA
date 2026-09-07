/* =============================================================
   THE ENGINE BOUNDARY, server side. Mirrors the client's
   ArenaDataSource for reads. For writes the split is deliberate:

     the ENGINE prices   — quote(): what the market and the model
                            say at this instant, with provenance;
     the ENGINE resolves — resolve(): what the venue reported as
                            the outcome, or null if it has not;
     the LEDGER records  — server/ledger: the immutable LOCK row
                            and the settlement that references it.

   No engine writes a call record and no ledger computes a price.
   ============================================================= */
import type { ArenaSnapshot, Bps, Direction, ScanInput, ScanProgress, ScanResult, Venue } from '../../types/index.ts';
import type { LockGate } from './model/lockPolicy.ts';

/** The engine's read on one market at the moment a call is accepted. */
export interface EngineQuote {
  marketId: string;
  marketTitle: string;
  venue: Venue | null;
  venueMarketId: string | null;
  /** Venue-implied YES probability, bps. Null → no price → no lock. */
  marketBps: Bps | null;
  /** The model's YES probability, bps. Null → no model → no lock. */
  vixyBps: Bps | null;
  confidenceBps: Bps | null;
  reversalRiskBps: Bps | null;
  modelVersion: string | null;
  /** The evidence the model cited, verbatim, frozen into the lock. */
  evidence: string[];
  /** The model's own words. Null without a model. */
  rationale: string | null;
  /** The exact model inputs, frozen so the read can be reproduced. Null without a model. */
  inputs: unknown | null;
  /** Age of the oldest input, ms. */
  dataAgeMs: number | null;
  closesAt: string;
  origin: 'DEMO' | 'LIVE';
  quotedAt: string;
  /** The lock policy's verdict for the requested direction. Absent → the engine has no policy (demo). */
  lockGate?: LockGate;
}

/** The venue's reported outcome. Never derived from a price. */
export interface EngineResolution {
  marketId: string;
  outcome: 'YES' | 'NO' | 'VOID';
  /** Where the outcome came from, in words a person can check. */
  source: string;
  resolvedAt: string;
}

export type { Direction };

export interface EngineSource {
  readonly label: string;
  readonly origin: 'DEMO' | 'LIVE';
  load(): Promise<ArenaSnapshot>;
  subscribe(onSnapshot: (s: ArenaSnapshot) => void): () => void;
  /** Null when the market is unknown to the engine. `direction` lets the engine's lock policy speak. */
  quote(marketId: string, direction?: Direction): Promise<EngineQuote | null>;
  /** Null until the venue has published an outcome. */
  resolve(marketId: string): Promise<EngineResolution | null>;
  scanMarket(userId: string, input: ScanInput, onProgress?: (p: ScanProgress) => void): Promise<ScanResult>;
}
