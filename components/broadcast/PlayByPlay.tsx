import React from 'react';
import type { SignalEvent, SignalKind } from '../../types';
import { Icon, type IconName } from '../common/Icon';
import { Empty } from '../common/Primitives';
import { relTime, pct } from '../../lib/format';

/* =============================================================
   LIVE PLAY-BY-PLAY
   -------------------------------------------------------------
   The event feed read as a broadcast timeline: time on the left,
   a mark for what kind of play it was, what happened, and how
   loud it was. Each row is one engine event, verbatim — the
   component groups and paces them, it does not write them.

   Severity is derived from the event KIND, which the engine
   chose. It is not derived from the magnitude, because how much
   a move matters is a judgement and judgements are the engine's.
   ============================================================= */

type Severity = 'routine' | 'notable' | 'decisive';

const PLAY: Record<SignalKind, { mark: IconName; verb: string; severity: Severity }> = {
  SYSTEM_ANALYZING:  { mark: 'brain',     verb: 'Analyst working',   severity: 'routine' },
  MARKET_SHIFT:      { mark: 'spark',     verb: 'Price moved',       severity: 'notable' },
  MOMENTUM_BUILDING: { mark: 'arrowUp',   verb: 'Momentum building', severity: 'notable' },
  LIQUIDITY_CHANGE:  { mark: 'layers',    verb: 'Liquidity shift',   severity: 'routine' },
  CORRELATION_SHIFT: { mark: 'neural',    verb: 'Cluster moved',     severity: 'notable' },
  SIGNAL_CONFIRMING: { mark: 'target',    verb: 'Confirming',        severity: 'notable' },
  SIGNAL_LOCKED:     { mark: 'lock',      verb: 'Official call',     severity: 'decisive' },
  SIGNAL_SETTLED:    { mark: 'check',     verb: 'Final',             severity: 'decisive' },
  SOURCE_DEGRADED:   { mark: 'refresh',   verb: 'Feed degraded',     severity: 'decisive' },
};

function Play({ event, now }: { event: SignalEvent; now: number }) {
  const play = PLAY[event.kind] ?? PLAY.SYSTEM_ANALYZING;
  return (
    <li className={`pbp-row sev-${play.severity} kind-${event.kind.toLowerCase()}`}>
      <span className="pbp-time t-num">{relTime(event.ts, now)}</span>
      <span className="pbp-rail" aria-hidden="true"><i /></span>
      <span className="pbp-mark" aria-hidden="true"><Icon name={play.mark} size={13} /></span>
      <span className="pbp-body">
        <span className="pbp-verb">{play.verb}</span>
        <span className="pbp-subject">{event.subject}</span>
        <span className="pbp-detail t-nano">{event.detail}</span>
      </span>
      <span className="pbp-mag t-num">
        {event.magnitudeBps === null ? '' : pct(event.magnitudeBps, 1)}
      </span>
    </li>
  );
}

export function PlayByPlay({ events, now, limit = 10, loading = false, announce = false }: {
  events: SignalEvent[]; now: number; limit?: number; loading?: boolean;
  /* One play-by-play per screen announces new plays; the rest stay
     silent so a reader is not read three copies of the same event. */
  announce?: boolean;
}) {
  if (loading) {
    return (
      <div className="pbp is-loading" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="skel pbp-skel" />)}
      </div>
    );
  }

  if (!events.length) {
    return (
      <Empty title="No plays yet"
             detail="The timeline fills as the engine reports events. Nothing is written here that the engine did not send." />
    );
  }

  const newest = events[0];
  return (
    <div className="pbp">
      {announce && (
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {newest ? `${PLAY[newest.kind]?.verb ?? 'Event'}: ${newest.subject}` : ''}
        </span>
      )}
      <ol className="pbp-list">
        {events.slice(0, limit).map((e) => <Play key={e.id} event={e} now={now} />)}
      </ol>
    </div>
  );
}
