/* Ledger tables. Kept import-free so db.ts can create them without a cycle. */
import type { DatabaseSync } from 'node:sqlite';

export function ensureLedgerSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      market_id TEXT NOT NULL,
      market_title TEXT NOT NULL,
      venue TEXT,
      venue_market_id TEXT,
      direction TEXT NOT NULL CHECK (direction IN ('YES','NO','WAIT')),
      entry_bps INTEGER NOT NULL,
      vixy_bps INTEGER NOT NULL,
      edge_bps INTEGER NOT NULL,
      confidence_bps INTEGER,
      stake_points INTEGER NOT NULL CHECK (stake_points > 0),
      model_version TEXT NOT NULL,
      evidence TEXT NOT NULL,
      origin TEXT NOT NULL CHECK (origin IN ('DEMO','LIVE')),
      market_closes_at TEXT NOT NULL,
      quoted_at TEXT NOT NULL,
      locked_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS calls_user ON calls(user_id, locked_at DESC);
    CREATE TRIGGER IF NOT EXISTS calls_immutable BEFORE UPDATE ON calls
      BEGIN SELECT RAISE(ABORT, 'calls are immutable after lock'); END;
    CREATE TRIGGER IF NOT EXISTS calls_permanent BEFORE DELETE ON calls
      BEGIN SELECT RAISE(ABORT, 'calls are permanent'); END;

    CREATE TABLE IF NOT EXISTS settlements (
      call_id TEXT PRIMARY KEY REFERENCES calls(id) ON DELETE RESTRICT,
      outcome TEXT NOT NULL CHECK (outcome IN ('YES','NO','VOID')),
      result TEXT NOT NULL CHECK (result IN ('WON','LOST','PUSH','VOID')),
      source TEXT NOT NULL,
      resolved_at TEXT NOT NULL,
      points_delta INTEGER NOT NULL,
      settled_at INTEGER NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS settlements_immutable BEFORE UPDATE ON settlements
      BEGIN SELECT RAISE(ABORT, 'settlements are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS settlements_permanent BEFORE DELETE ON settlements
      BEGIN SELECT RAISE(ABORT, 'settlements are permanent'); END;

    CREATE TABLE IF NOT EXISTS points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      ref TEXT,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS points_user ON points(user_id);
  `);
  /* Additive columns for databases created before the model phase. */
  const cols = new Set((db.prepare('PRAGMA table_info(calls)').all() as { name: string }[]).map((c) => c.name));
  /* The immutability trigger blocks UPDATE, not ALTER TABLE; ADD COLUMN leaves existing rows' new column NULL. */
  if (!cols.has('inputs')) db.exec('ALTER TABLE calls ADD COLUMN inputs TEXT');
  if (!cols.has('policy_version')) db.exec('ALTER TABLE calls ADD COLUMN policy_version TEXT');
  if (!cols.has('rationale')) db.exec('ALTER TABLE calls ADD COLUMN rationale TEXT');
  if (!cols.has('reversal_risk_bps')) db.exec('ALTER TABLE calls ADD COLUMN reversal_risk_bps INTEGER');
}

