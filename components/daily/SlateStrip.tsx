import React from 'react';
import type { ArenaSnapshot } from '../../types';
import { Icon } from '../common/Icon';
import { untilTime } from '../../lib/format';

/* =============================================================
   SLATE STRIP
   -------------------------------------------------------------
   The daily loop, one line high, on the screen a reader opens
   first. It states where they are, what is left, and when it
   resets — and nothing else, because the Arena home is a
   broadcast running order and this is a bug, not a segment.
   ============================================================= */

export function SlateStrip({ snapshot, now, onOpen }: {
  snapshot: ArenaSnapshot; now: number; onOpen: () => void;
}) {
  const s = snapshot.slate;
  if (!s || s.total === 0) return null;

  const ratio = s.completed / s.total;
  const done = s.completed === s.total;

  return (
    <button className={`slate-strip tap ${done ? 'is-done' : ''}`} onClick={onOpen}>
      <span className="ss-badge">
        <Icon name="spark" size={13} />Daily slate
      </span>

      <span className="ss-progress">
        <span className="ss-dots" aria-hidden="true">
          {s.objectives.map((o) => (
            <i key={o.key} className={o.complete ? 'is-done' : ''} />
          ))}
        </span>
        <b className="t-num">{s.completed}<span className="t-nano">/{s.total}</span></b>
        <span className="t-micro">
          {done ? 'objectives complete' : 'objectives met today'}
        </span>
      </span>

      <span className="ss-bar" aria-hidden="true"><i style={{ width: `${ratio * 100}%` }} /></span>

      <span className="ss-streak">
        <Icon name="flame" size={13} />
        <b className="t-num">{s.streakDays}</b><span className="t-nano">day streak</span>
      </span>

      <span className="ss-reset t-nano">
        <Icon name="clock" size={12} />resets in {untilTime(s.closesAt, now)}
      </span>

      <span className="ss-go"><Icon name="chevronR" size={14} /></span>
    </button>
  );
}
