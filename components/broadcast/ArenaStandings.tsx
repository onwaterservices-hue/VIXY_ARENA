import React from 'react';
import type { ArenaSnapshot } from '../../types';
import { Icon } from '../common/Icon';
import { FormIndicator, NO_VALUE } from './BroadcastPrimitives';
import { pct } from '../../lib/format';

/* =============================================================
   ARENA STANDINGS
   -------------------------------------------------------------
   The competitor's own season line: where they sit, how often
   they are right, the current run, how many calls are on the
   board, and the points that come with it — plus recent form.

   Every figure is the settlement service's. The component reads
   the season; it does not keep score.
   ============================================================= */

export function ArenaStandings({ snapshot, onOpen }: {
  snapshot: ArenaSnapshot; onOpen?: (route: string) => void;
}) {
  const p = snapshot.portfolio;
  const you = snapshot.leaderboard.find((e) => e.isYou);
  const settled = p.settledCalls > 0;

  const cells = [
    { label: 'Rank',     value: you ? `#${you.rank}` : NO_VALUE, sub: you ? `of ${snapshot.leaderboard.length}` : 'unranked', tone: 'violet' },
    { label: 'Win rate', value: settled ? pct(p.accuracyBps, 1) : NO_VALUE, sub: settled ? `${p.settledCalls} settled` : 'nothing settled yet', tone: 'edge' },
    { label: 'Streak',   value: settled ? String(p.streak) : NO_VALUE, sub: 'consecutive correct', tone: 'warn' },
    { label: 'Locks',    value: String(p.lockedCalls), sub: 'immutable records', tone: 'cyan' },
    { label: 'Points',   value: p.pointsBalance.toLocaleString(), sub: 'virtual · no cash value', tone: 'default' },
  ];

  return (
    <section className="standings glass-02" aria-label="Your arena standings">
      {/* the grid sits one level in: an element cannot be laid out by a
          container query it is itself the container for */}
      <div className="standings-inner">
      <div className="standings-id">
        <span className="standings-crest" aria-hidden="true">
          <Icon name="leaderboard" size={17} />
        </span>
        <div className="col" style={{ gap: 1, minWidth: 0 }}>
          <span className="t-label">Arena standings</span>
          <b className="t-h3">{you?.handle ?? 'Your season'}</b>
          <span className="t-nano">{you?.tier ?? 'unranked'} · standings update as calls settle</span>
        </div>
      </div>

      <div className="standings-cells">
        {cells.map((c) => (
          <div key={c.label} className={`standings-cell tone-${c.tone}`}>
            <span className="t-label">{c.label}</span>
            <b className="standings-value t-num">{c.value}</b>
            <span className="t-nano">{c.sub}</span>
          </div>
        ))}
      </div>

      <div className="standings-form">
        <span className="t-label">Form · last 5</span>
        <FormIndicator form={p.form} />
        {!p.form.length && <span className="t-nano">no settled results yet</span>}
      </div>

      {onOpen && (
        <div className="standings-actions">
          <button className="btn btn-sm tap" onClick={() => onOpen('portfolio')}>Your calls</button>
          <button className="btn btn-sm btn-ghost tap" onClick={() => onOpen('leaderboard')}>
            Global arena<Icon name="chevronR" size={13} />
          </button>
        </div>
      )}
      </div>
    </section>
  );
}
