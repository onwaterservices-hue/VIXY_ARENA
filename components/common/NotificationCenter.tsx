import React, { useMemo } from 'react';
import type { ArenaSnapshot, SignalKind } from '../../types';
import { Icon, type IconName } from './Icon';
import { useArenaUI } from './ui-context';
import { relTime } from '../../lib/format';

/* Notable engine events, newest first. This is a view of the same
   stream the console renders — never a second source of truth. */

const NOTABLE: Record<string, { icon: IconName; tone: string }> = {
  SIGNAL_LOCKED: { icon: 'lock', tone: 'violet' },
  SIGNAL_SETTLED: { icon: 'check', tone: 'edge' },
  SOURCE_DEGRADED: { icon: 'refresh', tone: 'warn' },
  SIGNAL_CONFIRMING: { icon: 'target', tone: 'cyan' },
};

export function NotificationCenter({ snapshot, now, onClose }: {
  snapshot: ArenaSnapshot; now: number; onClose: () => void;
}) {
  const ui = useArenaUI();
  const items = useMemo(
    () => snapshot.signals.filter((s) => NOTABLE[s.kind as SignalKind]).slice(0, 12),
    [snapshot.signals],
  );

  return (
    <>
      <div className="pop-scrim" onClick={onClose} />
      <div className="notif-panel glass-03" role="dialog" aria-label="Notifications">
        <header className="row between g3">
          <div className="col" style={{ gap: 0 }}>
            <span className="t-label">Engine events</span>
            <b className="t-h3">Notifications</b>
          </div>
          <button className="btn btn-sm btn-ghost tap" onClick={() => { ui.navigate('signals'); onClose(); }}>
            Console
          </button>
        </header>
        <ul className="notif-list vx-scroll">
          {items.length === 0 && <li className="t-small notif-empty">No notable events in the buffer.</li>}
          {items.map((s) => {
            const meta = NOTABLE[s.kind];
            return (
              <li key={s.id}>
                <button className="notif-row tap"
                        onClick={() => { if (s.marketId) ui.openMarket(s.marketId); onClose(); }}>
                  <span className={`notif-ico tone-${meta.tone}`}><Icon name={meta.icon} size={13} /></span>
                  <span className="col grow" style={{ gap: 1, alignItems: 'flex-start', minWidth: 0 }}>
                    <span className="notif-subject">{s.subject}</span>
                    <span className="t-nano notif-detail">{s.detail}</span>
                  </span>
                  <span className="t-nano">{relTime(s.ts, now)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <footer className="notif-foot t-nano">
          all events originate from the demo provider
        </footer>
      </div>
    </>
  );
}
