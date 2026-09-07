/* =============================================================
   THE LEDGER — what VIXY actually locked, and what actually happened.

   Two immutable tables and one append-only points ledger:

     calls        one row per accepted call. Written once, at the
                  engine's quote, with the evidence the quote cited.
                  SQLite triggers refuse UPDATE and DELETE.
     settlements  one row per settled call, referencing the lock,
                  written ONLY from an EngineResolution — the venue's
                  reported outcome — never from a price.
     points       append-only deltas; the balance is their sum.

   The record answers "what did VIXY lock?" because the row cannot
   change after it is written, and settlement answers "what
   happened?" because it stores the resolution it was graded on.
   ============================================================= */
import type { DB } from '../db.ts';
export { ensureLedgerSchema } from './schema.ts';
import { audit, newId } from '../db.ts';
import type { Bps, CallIntent, CallRecord, FormResult, PortfolioSummary } from '../../types/index.ts';
import type { EngineQuote, EngineResolution } from '../engine/EngineSource.ts';

export const STARTER_POINTS = 1000;

export interface CallRow {
  id: string; user_id: string; market_id: string; market_title: string; venue: string | null; venue_market_id: string | null;
  direction: 'YES' | 'NO' | 'WAIT'; entry_bps: number; vixy_bps: number; edge_bps: number; confidence_bps: number | null;
  stake_points: number; model_version: string; evidence: string; origin: 'DEMO' | 'LIVE'; market_closes_at: string; quoted_at: string; locked_at: number;
  /** JSON of the model's frozen inputs (model phase); null for older rows and demo locks. */
  inputs: string | null; policy_version: string | null; rationale: string | null; reversal_risk_bps: number | null;
}
export interface SettlementRow { call_id: string; outcome: 'YES' | 'NO' | 'VOID'; result: 'WON' | 'LOST' | 'PUSH' | 'VOID'; source: string; resolved_at: string; points_delta: number; settled_at: number }

export class LockRefused extends Error { code: string; constructor(code: string, message: string) { super(message); this.code = code; } }

export function pointsBalance(db: DB, userId: string): number {
  const r = db.prepare('SELECT COALESCE(SUM(delta), 0) AS bal FROM points WHERE user_id = ?').get(userId) as { bal: number };
  return r.bal;
}

/** Every competitor starts with the same virtual stake, granted once. */
export function ensureStarterPoints(db: DB, userId: string, now = Date.now()): void {
  const has = db.prepare("SELECT 1 FROM points WHERE user_id = ? AND reason = 'STARTER'").get(userId);
  if (!has) db.prepare('INSERT INTO points (user_id, delta, reason, ref, ts) VALUES (?, ?, ?, NULL, ?)').run(userId, STARTER_POINTS, 'STARTER', now);
}

/**
 * Write the LOCK. The quote is the engine's; the stake is the user's; the row is
 * the server's and cannot be edited afterwards. Refuses when there is nothing
 * honest to record: no market price, no model probability, closed market,
 * insufficient points.
 */
export function lockCall(db: DB, userId: string, intent: CallIntent, quote: EngineQuote, now = Date.now()): CallRecord {
  /* The engine's lock policy has the last word on whether this is a lock worth recording. */
  if (quote.lockGate && !quote.lockGate.allowed) throw new LockRefused('lock_gate', `The lock policy (${quote.lockGate.policyVersion}) refused: ${quote.lockGate.reasons.join(' · ')}`);
  if (quote.marketBps === null) throw new LockRefused('no_price', 'The venue has no price for this market right now; nothing to lock against.');
  if (quote.vixyBps === null) throw new LockRefused('no_model', 'Calls are not accepted until a VIXY model is connected — there is no VIXY probability to record the call against.');
  if (new Date(quote.closesAt).getTime() <= now) throw new LockRefused('market_closed', 'This market has closed; a lock now would be graded on the past.');
  if (!Number.isInteger(intent.stakePoints) || intent.stakePoints <= 0) throw new LockRefused('bad_stake', 'Stake must be a positive whole number of points.');
  /* One open lock per market per person: a second one would be a hedge or a double-count, not a call. */
  const openDup = db.prepare('SELECT c.id FROM calls c LEFT JOIN settlements s ON s.call_id = c.id WHERE c.user_id = ? AND c.market_id = ? AND s.call_id IS NULL').get(userId, quote.marketId) as { id: string } | undefined;
  if (openDup) throw new LockRefused('already_locked', `You already have an open lock on this market (${openDup.id}). One lock per market until it settles.`);
  ensureStarterPoints(db, userId, now);
  const bal = pointsBalance(db, userId);
  if (intent.stakePoints > bal) throw new LockRefused('insufficient_points', `Stake ${intent.stakePoints} exceeds your balance of ${bal} points.`);

  const id = `call_${newId(8)}`;
  const tx = db.prepare('BEGIN'); const commit = db.prepare('COMMIT'); const rollback = db.prepare('ROLLBACK');
  tx.run();
  try {
    db.prepare(`INSERT INTO calls (id, user_id, market_id, market_title, venue, venue_market_id, direction, entry_bps, vixy_bps, edge_bps, confidence_bps,
      stake_points, model_version, evidence, origin, market_closes_at, quoted_at, locked_at, inputs, policy_version, rationale, reversal_risk_bps) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, userId, quote.marketId, quote.marketTitle, quote.venue, quote.venueMarketId, intent.direction, quote.marketBps, quote.vixyBps,
        quote.vixyBps - quote.marketBps, quote.confidenceBps, intent.stakePoints, quote.modelVersion ?? 'unknown', JSON.stringify(quote.evidence), quote.origin, quote.closesAt, quote.quotedAt, now,
        quote.inputs === null || quote.inputs === undefined ? null : JSON.stringify(quote.inputs), quote.lockGate?.policyVersion ?? null, quote.rationale, quote.reversalRiskBps);
    db.prepare('INSERT INTO points (user_id, delta, reason, ref, ts) VALUES (?, ?, ?, ?, ?)').run(userId, -intent.stakePoints, 'STAKE', id, now);
    audit(db, userId, 'CALL_LOCKED', id, { marketId: quote.marketId, direction: intent.direction, stake: intent.stakePoints, entry: quote.marketBps, vixy: quote.vixyBps, origin: quote.origin, modelVersion: quote.modelVersion, policyVersion: quote.lockGate?.policyVersion ?? null });
    commit.run();
  } catch (e) { rollback.run(); throw e; }
  return toRecord(db.prepare('SELECT * FROM calls WHERE id = ?').get(id) as CallRow, null, now);
}

/** Fair-odds payout on the locked entry: a YES at 40% that wins returns stake × (10000/4000). */
export function payoutFor(row: CallRow, outcome: 'YES' | 'NO' | 'VOID'): { result: SettlementRow['result']; delta: number } {
  if (outcome === 'VOID') return { result: 'VOID', delta: row.stake_points };
  if (row.direction === 'WAIT') return { result: 'PUSH', delta: row.stake_points };
  const won = row.direction === outcome;
  if (!won) return { result: 'LOST', delta: 0 };
  const entry = row.direction === 'YES' ? row.entry_bps : 10000 - row.entry_bps;
  const price = Math.min(9999, Math.max(1, entry));
  return { result: 'WON', delta: Math.round(row.stake_points * 10000 / price) };
}

/**
 * Settle one lock against a resolution. The resolution's marketId must match the
 * lock's; the row's own entry/direction are used — nothing is recomputed from
 * present-day data. Idempotent: a second call for a settled lock is a no-op.
 */
export function settleCall(db: DB, callId: string, res: EngineResolution, now = Date.now()): SettlementRow | null {
  const row = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as CallRow | undefined;
  if (!row) throw new Error(`no such call ${callId}`);
  if (row.market_id !== res.marketId) throw new Error(`resolution for ${res.marketId} does not reference lock ${callId} (${row.market_id})`);
  if (db.prepare('SELECT 1 FROM settlements WHERE call_id = ?').get(callId)) return null;
  const { result, delta } = payoutFor(row, res.outcome);
  db.prepare('BEGIN').run();
  try {
    db.prepare('INSERT INTO settlements (call_id, outcome, result, source, resolved_at, points_delta, settled_at) VALUES (?,?,?,?,?,?,?)')
      .run(callId, res.outcome, result, res.source, res.resolvedAt, delta, now);
    if (delta !== 0) db.prepare('INSERT INTO points (user_id, delta, reason, ref, ts) VALUES (?, ?, ?, ?, ?)').run(row.user_id, delta, 'SETTLEMENT', callId, now);
    audit(db, 'settlement', 'CALL_SETTLED', callId, { outcome: res.outcome, result, delta, source: res.source });
    db.prepare('COMMIT').run();
  } catch (e) { db.prepare('ROLLBACK').run(); throw e; }
  return db.prepare('SELECT * FROM settlements WHERE call_id = ?').get(callId) as SettlementRow;
}

/** Locks with no settlement yet, oldest first. */
export function unsettledCalls(db: DB): CallRow[] {
  return db.prepare('SELECT c.* FROM calls c LEFT JOIN settlements s ON s.call_id = c.id WHERE s.call_id IS NULL ORDER BY c.locked_at ASC').all() as CallRow[];
}

export function toRecord(row: CallRow, s: SettlementRow | null, now = Date.now()): CallRecord {
  const closed = new Date(row.market_closes_at).getTime() <= now;
  const state: CallRecord['state'] = s ? (s.result === 'VOID' ? 'VOID' : 'SETTLED') : closed ? 'LOCKED' : 'OPEN';
  return {
    id: row.id, marketId: row.market_id, market: row.market_title, direction: row.direction,
    entryBps: row.entry_bps, vixyBps: row.vixy_bps, edgeBps: row.edge_bps, stakePoints: row.stake_points,
    state, result: s && s.result !== 'VOID' ? s.result : null,
    settledAt: s ? new Date(s.settled_at).toISOString() : null, openedAt: new Date(row.locked_at).toISOString(),
  };
}

export function userCalls(db: DB, userId: string, now = Date.now()): CallRecord[] {
  const rows = db.prepare('SELECT c.*, s.outcome, s.result, s.source, s.resolved_at, s.points_delta, s.settled_at FROM calls c LEFT JOIN settlements s ON s.call_id = c.id WHERE c.user_id = ? ORDER BY c.locked_at DESC LIMIT 200')
    .all(userId) as (CallRow & Partial<SettlementRow>)[];
  return rows.map((r) => toRecord(r, r.result ? { call_id: r.id, outcome: r.outcome!, result: r.result!, source: r.source!, resolved_at: r.resolved_at!, points_delta: r.points_delta!, settled_at: r.settled_at! } : null, now));
}

/** Portfolio derived from the ledger; calibration null until something has settled. */
export function userPortfolio(db: DB, userId: string, now = Date.now()): PortfolioSummary {
  const calls = userCalls(db, userId, now);
  const settled = calls.filter((c) => c.state === 'SETTLED');
  const won = settled.filter((c) => c.result === 'WON').length;
  const graded = settled.filter((c) => c.result === 'WON' || c.result === 'LOST');
  /* Calibration: how far the locked VIXY probability was from the realized frequency, bps. */
  /* Calibration needs a sample; one settled call says nothing about "said vs happened". */
  let calibrationBps: Bps | null = null;
  if (graded.length >= 10) {
    const predicted = graded.reduce((a, c) => a + (c.direction === 'YES' ? c.vixyBps : 10000 - c.vixyBps), 0) / graded.length;
    const realized = (graded.filter((c) => c.result === 'WON').length / graded.length) * 10000;
    calibrationBps = Math.round(10000 - Math.abs(predicted - realized));
  }
  let streak = 0;
  for (const c of settled) { if (c.result === 'WON') streak++; else if (c.result === 'LOST') break; }
  ensureStarterPoints(db, userId, now);
  return {
    openCalls: calls.filter((c) => c.state === 'OPEN').length,
    lockedCalls: calls.filter((c) => c.state === 'LOCKED').length,
    settledCalls: settled.length,
    accuracyBps: graded.length ? Math.round((won / graded.length) * 10000) : 0,
    pointsBalance: pointsBalance(db, userId),
    streak, calibrationBps,
    form: settled.slice(0, 12).map((c): FormResult => (c.result === 'WON' ? 'W' : c.result === 'LOST' ? 'L' : 'P')),
  };
}

/**
 * Reproduce a lock: re-run the model on the inputs frozen in the row and compare.
 * A model version must return the same estimate for the same inputs, forever.
 */
export function reproduceLock(row: CallRow, model: { version: string; reproduce(inputs: unknown): { vixyBps: number } | null }): { ok: boolean; expected: number; got: number | null; reason: string } {
  if (row.model_version !== model.version) return { ok: false, expected: row.vixy_bps, got: null, reason: `lock was made by ${row.model_version}; this is ${model.version} — reproduce with the recorded version` };
  if (!row.inputs) return { ok: false, expected: row.vixy_bps, got: null, reason: 'no frozen inputs on this row' };
  let inputs: unknown; try { inputs = JSON.parse(row.inputs); } catch { return { ok: false, expected: row.vixy_bps, got: null, reason: 'frozen inputs are not JSON' }; }
  const r = model.reproduce(inputs);
  if (!r) return { ok: false, expected: row.vixy_bps, got: null, reason: 'the model returns no read for the frozen inputs' };
  return { ok: r.vixyBps === row.vixy_bps, expected: row.vixy_bps, got: r.vixyBps, reason: r.vixyBps === row.vixy_bps ? 'reproduced' : 'estimate differs — the model changed without a version bump' };
}
