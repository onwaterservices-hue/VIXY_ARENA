import React from 'react';
import type {
  AdvantageBand, AdvantageSide, EventPhase, FeedStatus, FormResult, MatchupSide,
} from '../../types';
import { Icon } from '../common/Icon';
import { pct } from '../../lib/format';

/* =============================================================
   BROADCAST PRIMITIVES
   -------------------------------------------------------------
   The vocabulary of a live event: the LIVE flag, the phase strip,
   the advantage word, the form line, one competitor's side of a
   matchup. Every one of these renders a value the engine graded.
   None of them decides what a number means.

   A value that has not arrived shows as "--". It never shows as a
   zero, a placeholder probability, or a word that implies the
   engine has an opinion it does not have.
   ============================================================= */

export const NO_VALUE = '--';

/* ---- LIVE flag ---------------------------------------------
   The one piece of the interface allowed to say "LIVE", and only
   when the feed says so.                                      */
export function LiveFlag({ status, label = 'LIVE', compact = false }: {
  status: FeedStatus; label?: string; compact?: boolean;
}) {
  const live = status === 'LIVE';
  return (
    <span className={`live-flag ${live ? 'is-live' : 'is-off'} ${compact ? 'is-compact' : ''}`}
          title={live ? 'Feed reporting live' : `Feed ${status.toLowerCase()}`}>
      <i aria-hidden="true" />
      {live ? label : status}
    </span>
  );
}

/* ---- broadcast tag ------------------------------------------
   MATCH 001 / EVENT 15M / PHASE 2 — the small typographic marks
   a broadcast uses to orient you. Never decorative: each one
   carries a value.                                             */
export function BroadcastTag({ children, tone = 'default' }: {
  children: React.ReactNode; tone?: 'default' | 'hot' | 'final';
}) {
  return <span className={`bcast-tag tone-${tone}`}>{children}</span>;
}

/* ---- event phase strip --------------------------------------
   Three named phases plus the final. The engine says which one
   the event is in; the strip only draws the position.         */
const PHASE_ORDER: EventPhase[] = ['PREGAME', 'CALIBRATION', 'CONFIRMATION', 'LOCK_WINDOW', 'FINAL'];
export const PHASE_COPY: Record<EventPhase, { label: string; sub: string }> = {
  PREGAME:      { label: 'Pre-event',   sub: 'watching' },
  CALIBRATION:  { label: '1st phase',   sub: 'calibration' },
  CONFIRMATION: { label: '2nd phase',   sub: 'confirmation' },
  LOCK_WINDOW:  { label: 'Final phase', sub: 'lock window' },
  FINAL:        { label: 'Final',       sub: 'settled' },
};

export function PhaseStrip({ phase, compact = false }: { phase: EventPhase; compact?: boolean }) {
  const at = PHASE_ORDER.indexOf(phase);
  return (
    <ol className={`phase-strip ${compact ? 'is-compact' : ''}`}
        aria-label={`Event phase: ${PHASE_COPY[phase].label}, ${PHASE_COPY[phase].sub}`}>
      {PHASE_ORDER.map((p, i) => (
        <li key={p} className={i < at ? 'is-done' : i === at ? 'is-now' : ''}>
          <span className="phase-dot" aria-hidden="true" />
          <span className="phase-label t-nano">{PHASE_COPY[p].label}</span>
          {!compact && <span className="phase-sub t-nano">{PHASE_COPY[p].sub}</span>}
        </li>
      ))}
    </ol>
  );
}

/* ---- advantage ----------------------------------------------
   Sports language for a graded quantity. The word and the side
   both arrive from the engine, and the underlying number is
   always shown beside the word so the word never replaces it. */
export const ADVANTAGE_COPY: Record<AdvantageBand, string> = {
  NONE:     'no read',
  LEVEL:    'level',
  SLIGHT:   'slight edge',
  MODERATE: 'moderate edge',
  STRONG:   'strong edge',
  DOMINANT: 'dominant edge',
};

export function AdvantageTag({ band, side, compact = false }: {
  band: AdvantageBand; side: AdvantageSide; compact?: boolean;
}) {
  return (
    <span className={`adv-tag band-${band.toLowerCase()} side-${side.toLowerCase()} ${compact ? 'is-compact' : ''}`}>
      {side !== 'NEUTRAL' && (
        <Icon name={side === 'UP' ? 'arrowUp' : 'arrowDown'} size={compact ? 10 : 12} />
      )}
      {ADVANTAGE_COPY[band]}
    </span>
  );
}

/* ---- form line ----------------------------------------------
   The last few settled results, newest first. A record, not a
   decoration: an empty record renders as empty slots.         */
export function FormIndicator({ form, slots = 5, label }: {
  form: FormResult[]; slots?: number; label?: string;
}) {
  const shown = form.slice(0, slots);
  const empty = Math.max(0, slots - shown.length);
  return (
    <div className="form-line" aria-label={
      shown.length
        ? `Form, newest first: ${shown.map((f) => (f === 'W' ? 'win' : f === 'L' ? 'loss' : 'push')).join(', ')}`
        : 'No settled results yet'
    }>
      {label && <span className="t-label">{label}</span>}
      <span className="form-pips" aria-hidden="true">
        {shown.map((f, i) => <i key={`f${i}`} className={`pip pip-${f.toLowerCase()}`}>{f}</i>)}
        {Array.from({ length: empty }, (_, i) => <i key={`e${i}`} className="pip pip-empty">·</i>)}
      </span>
    </div>
  );
}

/* ---- one side of a matchup ----------------------------------- */
export function MatchupSideBlock({ side, tone, align = 'left', size = 'md' }: {
  side: MatchupSide | null; tone: 'home' | 'away'; align?: 'left' | 'right'; size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <div className={`mu-side tone-${tone} align-${align} size-${size}`}>
      <span className="mu-code">{side?.code ?? NO_VALUE}</span>
      <span className="mu-label t-nano">{side?.label ?? 'awaiting event data'}</span>
      <span className="mu-prob t-num">{side ? pct(side.probabilityBps) : NO_VALUE}</span>
      {side && <LiveFlag status={side.status} label="FEED" compact />}
    </div>
  );
}

/* ---- versus mark --------------------------------------------- */
export function VersusMark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`vs-mark size-${size}`} aria-hidden="true">
      <i className="vs-rule" />
      <b>VS</b>
      <i className="vs-rule" />
    </span>
  );
}
