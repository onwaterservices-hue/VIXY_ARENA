/* =============================================================
   STORAGE — node:sqlite, WAL, one file.
   Every access-affecting write also lands in `audit`.
   ============================================================= */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ensureLedgerSchema } from './ledger/schema.ts';
import { ensureObservationSchema } from './ledger/observationStore.ts';

export type DB = DatabaseSync;

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      handle TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      discord_id TEXT,
      discord_username TEXT,
      discord_verified_at INTEGER,
      stripe_customer_id TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      absolute_expires_at INTEGER NOT NULL,
      ip TEXT, ua TEXT,
      oauth_state TEXT
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS entitlements (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      active INTEGER NOT NULL DEFAULT 0,
      plan_id TEXT,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      current_period_end INTEGER,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stripe_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      detail TEXT
    );
    CREATE TABLE IF NOT EXISTS mail_outbox (
      id TEXT PRIMARY KEY,
      to_addr TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      sent_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      window_start INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS discord_links (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      discord_id TEXT NOT NULL UNIQUE,
      username TEXT,
      refresh_token_enc TEXT,
      linked_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS discord_sync (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      member INTEGER NOT NULL,
      has_role INTEGER NOT NULL,
      result TEXT NOT NULL CHECK (result IN ('VERIFIED','NOT_MEMBER','NO_ROLE','ERROR')),
      error TEXT,
      checked_at INTEGER NOT NULL,
      last_definite_at INTEGER
    );
  `);
  /* Additive migrations for databases created before a column existed. */
  const cols = (t: string) => new Set((db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name));
  const se = cols('stripe_events');
  if (!se.has('reconciled')) db.exec('ALTER TABLE stripe_events ADD COLUMN reconciled INTEGER NOT NULL DEFAULT 1');
  if (!se.has('note')) db.exec('ALTER TABLE stripe_events ADD COLUMN note TEXT');
  ensureLedgerSchema(db);
  ensureObservationSchema(db);
  return db;
}

export const newId = (bytes = 12): string => randomBytes(bytes).toString('hex');

export function audit(db: DB, actor: string, action: string, target: string | null, detail?: unknown): void {
  db.prepare('INSERT INTO audit (ts, actor, action, target, detail) VALUES (?, ?, ?, ?, ?)')
    .run(Date.now(), actor, action, target, detail === undefined ? null : JSON.stringify(detail));
}

/** Fixed-window rate limit. Returns true when the call is allowed. */
export function rateLimit(db: DB, key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const row = db.prepare('SELECT count, window_start FROM rate_limits WHERE key = ?').get(key) as { count: number; window_start: number } | undefined;
  if (!row || now - row.window_start > windowMs) {
    db.prepare('INSERT OR REPLACE INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)').run(key, now);
    return true;
  }
  if (row.count >= max) return false;
  db.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').run(key);
  return true;
}
