import React from 'react';
import type { CanonicalMarket } from '../../types';
import { PhaseStrip, PHASE_COPY, NO_VALUE } from './BroadcastPrimitives';

/* =============================================================
   ARENA CLOCK
   -------------------------------------------------------------
   A broadcast clock over a server timestamp. It counts down to
   the close the venue published; it does not decide when an
   event ends, and it shows "--:--" rather than a zero when the
   market has not published a close.

   The phase underneath comes from the engine. The clock draws
   the position in the phase, never chooses it.
   ============================================================= */

function split(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return { d, h, m, s };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function ArenaClock({ market, now, size = 'lg', showPhases = true }: {
  market: CanonicalMarket | null; now: number; size?: 'md' | 'lg'; showPhases?: boolean;
}) {
  const closesAt = market?.closesAt ? +new Date(market.closesAt) : null;
  const remaining = closesAt === null ? null : closesAt - now;
  const t = remaining === null ? null : split(remaining);

  /* Long-dated events are read in days and hours; an event inside the
     hour is read like a game clock. Same value, different register. */
  const long = t !== null && t.d > 0;
  const primary = t === null
    ? `${NO_VALUE}:${NO_VALUE}`
    : long ? `${t.d}d ${pad(t.h)}h` : `${pad(t.h * 60 + t.m)}:${pad(t.s)}`;
  const secondary = t === null
    ? 'no close published'
    : long ? `${pad(t.m)}m remaining in the hour` : 'until the market closes';

  const phase = market?.phase ?? 'PREGAME';
  const expired = remaining !== null && remaining <= 0;

  return (
    <div className={`arena-clock size-${size} ${expired ? 'is-expired' : ''}`}>
      <div className="clock-head row between">
        <span className="t-label">Event clock</span>
        <span className="t-nano">{expired ? 'closed' : PHASE_COPY[phase].sub}</span>
      </div>

      <div className="clock-face" role="timer" aria-live="off"
           aria-label={t === null ? 'No close time published' : `${primary} until close`}>
        <b className="clock-time t-num">{expired ? 'CLOSED' : primary}</b>
        <span className="clock-sweep" aria-hidden="true" />
      </div>
      <span className="clock-sub t-nano">{expired ? 'awaiting settlement' : secondary}</span>

      {showPhases && <PhaseStrip phase={phase} />}
    </div>
  );
}
