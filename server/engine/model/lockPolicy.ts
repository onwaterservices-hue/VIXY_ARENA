/* =============================================================
   LOCK POLICY — a list of named reasons; every one must pass.

   Inherited from Vault's `canLockCurrentCycle` in SHAPE only: many
   independent, auditable conditions, fail closed, returned verbatim
   so a refusal explains itself. Every numeric threshold below is
   NEEDS VALIDATION (docs/VIXY-MODEL-MAPPING.md §4). A high
   confidence does not shortcut anything.
   ============================================================= */
import type { CanonicalMarket, Direction } from '../../../types/index.ts';
import type { ModelRead } from '../model.ts';

export const LOCK_POLICY = {
  version: 'arena-lock-policy-0.1.0',
  validated: false as const,
  MIN_OBSERVATIONS: 6,
  /** Locks are refused inside this many refresh intervals of close. */
  MIN_INTERVALS_TO_CLOSE: 2,
  MIN_CONFIDENCE_BPS: 6000,
  MAX_REVERSAL_BPS: 3000,
  /** |edge| must exceed max(this, spread). */
  MIN_EDGE_BPS: 150,
  /** Consecutive prior reads that must agree on side with |edge| above the floor. */
  STABILITY_READS: 3,
} as const;

export interface PriorRead { at: number; side: 'YES' | 'NO' | 'NONE'; edgeBps: number | null; spreadBps: number | null }

export interface LockCheck { key: string; pass: boolean; detail: string }
export interface LockGate { allowed: boolean; reasons: string[]; checks: LockCheck[]; policyVersion: string }

export const sideOf = (edgeBps: number | null, floor: number): 'YES' | 'NO' | 'NONE' => (edgeBps === null || Math.abs(edgeBps) < floor ? 'NONE' : edgeBps > 0 ? 'YES' : 'NO');

export function evaluateLockGate(input: {
  market: CanonicalMarket; read: ModelRead | null; direction: Direction; priorReads: PriorRead[]; now: number; refreshMs: number;
}): LockGate {
  const P = LOCK_POLICY; const { market: m, read, direction, now } = input;
  const checks: LockCheck[] = [];
  const check = (key: string, pass: boolean, detail: string) => { checks.push({ key, pass, detail }); };
  const spread = Math.max(...m.venueRefs.map((v) => v.spreadBps ?? 0), 0);
  const floor = Math.max(P.MIN_EDGE_BPS, spread);
  const f = read?.inputs as { minObservations?: number } | undefined;

  check('MODEL_READ', read !== null, read ? `model ${read.featureSetVersion} has a read` : 'the model has no read for this market (SKIP)');
  check('DATA_FRESH', m.health.status === 'LIVE' && m.venueRefs.every((v) => v.status === 'LIVE'), `market ${m.health.status}; venues ${m.venueRefs.map((v) => `${v.venue.toLowerCase()}=${v.status}`).join(', ')}`);
  check('MARKET_OPEN', m.state === 'OPEN', `market state ${m.state}`);
  const msToClose = new Date(m.closesAt).getTime() - now;
  check('ENTRY_WINDOW', msToClose >= P.MIN_INTERVALS_TO_CLOSE * input.refreshMs, `${Math.round(msToClose / 1000)} s to close (need ≥ ${Math.round(P.MIN_INTERVALS_TO_CLOSE * input.refreshMs / 1000)} s)`);
  check('OBSERVATION_FLOOR', (f?.minObservations ?? 0) >= P.MIN_OBSERVATIONS, `${f?.minObservations ?? 0} observations (need ≥ ${P.MIN_OBSERVATIONS})`);

  if (direction === 'WAIT') {
    /* A WAIT records "no edge here" and settles as a push; it needs a fresh, open, observed market and a read — nothing directional. */
    const reasons = checks.filter((c) => !c.pass).map((c) => `${c.key}: ${c.detail}`);
    return { allowed: reasons.length === 0, reasons, checks, policyVersion: P.version };
  }

  const edge = read && m.edgeBps !== null ? m.edgeBps : null;
  check('MODEL_QUALITY', (read?.confidenceBps ?? 0) >= P.MIN_CONFIDENCE_BPS, `confidence ${read ? (read.confidenceBps / 100).toFixed(1) : '—'}% (need ≥ ${P.MIN_CONFIDENCE_BPS / 100}%)`);
  check('REVERSAL_RISK', read !== null && read.reversalRiskBps < P.MAX_REVERSAL_BPS, `reversal risk ${read ? (read.reversalRiskBps / 100).toFixed(1) : '—'}% (need < ${P.MAX_REVERSAL_BPS / 100}%)`);
  check('MINIMUM_EDGE', edge !== null && Math.abs(edge) >= floor, `|edge| ${edge === null ? '—' : Math.abs(edge)} bps vs floor ${floor} bps (max of ${P.MIN_EDGE_BPS} and spread ${spread})`);
  const side = sideOf(edge, floor);
  check('DIRECTIONAL_CONSISTENCY', side !== 'NONE' && side === direction, `model side ${side}, requested ${direction}`);
  /* Evidence alignment: nothing in the read argues against the side. The read's evidence is measured; the
     only directional arguments in it are the cross-venue and drift terms, which by construction point the same
     way as the edge — so the check here is that the read is not ILLIQUID and the regime is not RANGING chop. */
  check('EVIDENCE_ALIGNMENT', read !== null && read.regime !== 'ILLIQUID' && !(read.regime === 'RANGING' && read.reversalRiskBps >= P.MAX_REVERSAL_BPS / 2), `regime ${read?.regime ?? '—'}`);
  const recent = input.priorReads.filter((r) => r.at <= now).slice(-P.STABILITY_READS);
  const stable = recent.length >= P.STABILITY_READS && recent.every((r) => r.side === side && r.edgeBps !== null && Math.abs(r.edgeBps) >= Math.max(P.MIN_EDGE_BPS, r.spreadBps ?? 0));
  check('TEMPORAL_STABILITY', stable, `${recent.filter((r) => r.side === side).length}/${P.STABILITY_READS} recent reads on side ${side} with edge above floor`);

  const reasons = checks.filter((c) => !c.pass).map((c) => `${c.key}: ${c.detail}`);
  return { allowed: reasons.length === 0, reasons, checks, policyVersion: P.version };
}
