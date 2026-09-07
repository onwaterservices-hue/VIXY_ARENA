/* =============================================================
   DURABLE OBSERVATIONS, READS AND OUTCOMES — the evaluation record.

   Three append-only tables written by the LIVE engine on every
   refresh and by the settlement sweep:

     observations     what each venue said about each market, when
     model_reads      what the model said (or that it SKIPPED, and why)
                      and what the lock policy would have allowed —
                      recorded at the time, never recomputed later
     market_outcomes  what the venue published for markets that were
                      observed, whether or not anyone locked

   Together they make the out-of-sample evaluation possible without
   look-ahead: a read is scored only against an outcome published
   after it, and skips are counted because they were written down.
   ============================================================= */
import type { DatabaseSync } from 'node:sqlite';
import type { VenueMarket } from '../engine/venues/types.ts';

export function ensureObservationSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS observations (
      venue TEXT NOT NULL, venue_market_id TEXT NOT NULL, at INTEGER NOT NULL,
      implied_bps INTEGER NOT NULL, bid_bps INTEGER, ask_bps INTEGER, spread_bps INTEGER, depth_usd REAL, status TEXT NOT NULL,
      PRIMARY KEY (venue, venue_market_id, at)
    );
    CREATE TABLE IF NOT EXISTS model_reads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL, market_id TEXT NOT NULL, category TEXT, venue TEXT, venue_market_id TEXT,
      model_version TEXT NOT NULL, market_bps INTEGER, vixy_bps INTEGER, edge_bps INTEGER, confidence_bps INTEGER, reversal_risk_bps INTEGER,
      side TEXT NOT NULL, skipped INTEGER NOT NULL, skip_reason TEXT, gate_allowed INTEGER, gate_reasons TEXT, closes_at TEXT
    );
    CREATE INDEX IF NOT EXISTS model_reads_market ON model_reads(market_id, at);
    CREATE TABLE IF NOT EXISTS market_outcomes (
      market_id TEXT PRIMARY KEY, venue TEXT NOT NULL, venue_market_id TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK (outcome IN ('YES','NO','VOID')), source TEXT NOT NULL, resolved_at TEXT NOT NULL, resolved_at_ms INTEGER NOT NULL, recorded_at INTEGER NOT NULL
    );
  `);
  /* Additive migration: databases created before the activation phase have market_outcomes without resolved_at_ms. */
  const cols = new Set((db.prepare('PRAGMA table_info(market_outcomes)').all() as { name: string }[]).map((c) => c.name));
  if (!cols.has('resolved_at_ms')) {
    db.exec('ALTER TABLE market_outcomes ADD COLUMN resolved_at_ms INTEGER NOT NULL DEFAULT 0');
    db.exec("UPDATE market_outcomes SET resolved_at_ms = CAST(strftime('%s', resolved_at) AS INTEGER) * 1000 WHERE resolved_at_ms = 0");
  }
}

export function recordObservations(db: DatabaseSync, rows: VenueMarket[], now: number): number {
  const ins = db.prepare('INSERT OR IGNORE INTO observations (venue, venue_market_id, at, implied_bps, bid_bps, ask_bps, spread_bps, depth_usd, status) VALUES (?,?,?,?,?,?,?,?,?)');
  let n = 0;
  for (const r of rows) {
    if (r.impliedBps === null) continue;
    const at = new Date(r.fetchedAt).getTime();
    if (!Number.isFinite(at) || at > now) continue;
    n += ins.run(r.venue, r.venueMarketId, at, r.impliedBps, r.bidBps, r.askBps, r.spreadBps, r.liquidityUsd, r.status).changes as number;
  }
  return n;
}

export interface ReadRecord {
  at: number; marketId: string; category: string | null; venue: string | null; venueMarketId: string | null; modelVersion: string;
  marketBps: number | null; vixyBps: number | null; edgeBps: number | null; confidenceBps: number | null; reversalRiskBps: number | null;
  side: 'YES' | 'NO' | 'NONE'; skipped: boolean; skipReason: string | null; gateAllowed: boolean | null; gateReasons: string | null; closesAt: string;
}

export function recordReads(db: DatabaseSync, reads: ReadRecord[]): number {
  const ins = db.prepare(`INSERT INTO model_reads (at, market_id, category, venue, venue_market_id, model_version, market_bps, vixy_bps, edge_bps, confidence_bps, reversal_risk_bps, side, skipped, skip_reason, gate_allowed, gate_reasons, closes_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of reads) ins.run(r.at, r.marketId, r.category, r.venue, r.venueMarketId, r.modelVersion, r.marketBps, r.vixyBps, r.edgeBps, r.confidenceBps, r.reversalRiskBps, r.side, r.skipped ? 1 : 0, r.skipReason, r.gateAllowed === null ? null : r.gateAllowed ? 1 : 0, r.gateReasons, r.closesAt);
  return reads.length;
}

export function recordOutcome(db: DatabaseSync, o: { marketId: string; venue: string; venueMarketId: string; outcome: 'YES' | 'NO' | 'VOID'; source: string; resolvedAt: string }, now: number): boolean {
  const ms = new Date(o.resolvedAt).getTime();
  const r = db.prepare('INSERT OR IGNORE INTO market_outcomes (market_id, venue, venue_market_id, outcome, source, resolved_at, resolved_at_ms, recorded_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(o.marketId, o.venue, o.venueMarketId, o.outcome, o.source, o.resolvedAt, Number.isFinite(ms) ? ms : now, now);
  return (r.changes as number) > 0;
}

/** Observed markets whose close has passed and whose outcome is not yet recorded. */
export function marketsAwaitingOutcome(db: DatabaseSync, now: number, limit = 200): { market_id: string; venue: string; venue_market_id: string; closes_at: string }[] {
  return db.prepare(`SELECT DISTINCT r.market_id, r.venue, r.venue_market_id, r.closes_at FROM model_reads r
    LEFT JOIN market_outcomes o ON o.market_id = r.market_id
    WHERE o.market_id IS NULL AND r.venue IS NOT NULL AND r.closes_at <= ? ORDER BY r.closes_at ASC LIMIT ?`).all(new Date(now).toISOString(), limit) as never;
}
