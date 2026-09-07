import React from 'react';
import type { SignalEvent, SignalKind } from '../../types';
import { pct, relTime } from '../../lib/format';
import { Icon, type IconName } from '../common/Icon';

/* A professional telemetry console. Rows are engine EVENTS, not
   advice. Each row states what the system did, and when. */

const KIND_META: Record<SignalKind, { tone: string; icon: IconName; short: string }> = {
  SYSTEM_ANALYZING:  { tone: 'violet', icon: 'brain',      short: 'ANALYZE' },
  MARKET_SHIFT:      { tone: 'cyan',   icon: 'signals',    short: 'SHIFT' },
  MOMENTUM_BUILDING: { tone: 'cyan',   icon: 'arrowUp',    short: 'MOMENTUM' },
  LIQUIDITY_CHANGE:  { tone: 'blue',   icon: 'layers',     short: 'LIQUIDITY' },
  CORRELATION_SHIFT: { tone: 'violet', icon: 'neural',     short: 'CORREL' },
  SIGNAL_CONFIRMING: { tone: 'violet', icon: 'target',     short: 'CONFIRM' },
  SIGNAL_LOCKED:     { tone: 'edge',   icon: 'lock',       short: 'LOCKED' },
  SIGNAL_SETTLED:    { tone: 'edge',   icon: 'check',      short: 'SETTLED' },
  SOURCE_DEGRADED:   { tone: 'warn',   icon: 'refresh',    short: 'DEGRADED' },
};

export function SignalRow({ event, dense = false, now }: { event: SignalEvent; dense?: boolean; now: number }) {
  const meta = KIND_META[event.kind];
  return (
    <li className={`sig-row enter-row tone-${meta.tone} ${dense ? 'dense' : ''}`}>
      <span className="sig-ico"><Icon name={meta.icon} size={13} /></span>
      <span className="sig-kind t-nano">{meta.short}</span>
      <span className="sig-subject">{event.subject}</span>
      {!dense && <span className="sig-detail t-small">{event.detail}</span>}
      {dense && <span className="sig-detail t-small">{event.detail.split(' · ')[0]}</span>}
      <span className="grow" />
      {event.magnitudeBps !== null && (
        <span className="sig-mag t-num">{pct(event.magnitudeBps, 1)}</span>
      )}
      {event.venue && !dense && <span className="sig-venue t-nano">{event.venue}</span>}
      <span className="sig-time t-nano">{relTime(event.ts, now)}</span>
    </li>
  );
}

export function SignalStream({ events, dense = false, limit = 12, now, announce = false }: {
  events: SignalEvent[]; dense?: boolean; limit?: number; now: number;
  /* Exactly one stream on a screen announces. The list itself is never a
     live region: every row's relative time re-renders each second, so a
     live region around the list would read the whole scrollback aloud
     continuously, and three of these are mounted at once on Arena. */
  announce?: boolean;
}) {
  const newest = events[0];
  return (
    <>
      {announce && (
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {newest ? `${newest.subject}: ${newest.detail}` : ''}
        </span>
      )}
      <ul className={`sig-list ${dense ? 'dense' : ''}`}>
        {events.slice(0, limit).map((e) => <SignalRow key={e.id} event={e} dense={dense} now={now} />)}
      </ul>
    </>
  );
}
