import React, { useEffect, useState } from 'react';
import type { CallRecord } from '../../types';
import { Icon } from '../common/Icon';
import { useReducedMotion } from '../../hooks';
import { pct, signedPct } from '../../lib/format';

/* =============================================================
   LOCK CALLOUT
   -------------------------------------------------------------
   The official-call moment. When the engine writes a call record
   the arena stops for a beat: a ring closes around the decision,
   the figures land, and it clears.

   This is a broadcast graphic, not a celebration. It states what
   was recorded — direction, entry, model, edge — and then gets
   out of the way. Nothing about it implies the call was right;
   that is settlement's job, later.
   ============================================================= */

export function LockCallout({ record, onDone }: { record: CallRecord; onDone: () => void }) {
  const reduced = useReducedMotion();
  const [leaving, setLeaving] = useState(false);

  /* The parent hands in a fresh `onDone` on every render, and the arena
     re-renders every second. Reading it through a ref keeps the timers
     keyed on the record — not on the callback — so they actually fire. */
  const doneRef = React.useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    /* Short by design: a graphic that outstays its welcome stops
       reading as a live moment and starts reading as a modal. */
    const hold = reduced ? 1400 : 2600;
    const a = setTimeout(() => setLeaving(true), hold);
    const b = setTimeout(() => doneRef.current(), hold + 520);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') doneRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(a); clearTimeout(b); window.removeEventListener('keydown', onKey); };
  }, [reduced, record.id]);

  const up = record.direction === 'YES';
  const wait = record.direction === 'WAIT';

  return (
    <div className={`lockout ${leaving ? 'is-leaving' : ''} ${reduced ? 'is-still' : ''}`}
         role="status" aria-live="polite" onClick={() => doneRef.current()} title="Click to dismiss">
      <div className={`lockout-card ${wait ? 'is-wait' : up ? 'is-up' : 'is-down'}`}>
        <span className="lockout-ring" aria-hidden="true" />
        <span className="lockout-ring two" aria-hidden="true" />
        <span className="lockout-converge" aria-hidden="true" />

        <span className="lockout-eyebrow t-label">VIXY lock</span>
        <b className="lockout-word">LOCKED</b>

        <span className="lockout-dir">
          <Icon name={wait ? 'target' : up ? 'arrowUp' : 'arrowDown'} size={20} />
          {wait ? 'WAIT' : up ? 'UP' : 'DOWN'}
        </span>

        <span className="lockout-market">{record.market}</span>

        <div className="lockout-nums">
          <span className="col"><span className="t-label">Entry</span><b className="t-num">{pct(record.entryBps)}</b></span>
          <span className="col"><span className="t-label">VIXY</span><b className="t-num vixy">{pct(record.vixyBps)}</b></span>
          <span className="col"><span className="t-label">Edge</span>
            <b className={`t-num ${record.edgeBps >= 0 ? 'edge-pos' : 'edge-neg'}`}>{signedPct(record.edgeBps)}</b>
          </span>
        </div>

        <span className="lockout-foot t-nano">official call · recorded and immutable · {record.id}</span>
      </div>
    </div>
  );
}
