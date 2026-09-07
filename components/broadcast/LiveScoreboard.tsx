import React from 'react';
import type { ArenaSnapshot, CanonicalMarket } from '../../types';
import { LiveFlag, BroadcastTag, NO_VALUE, PHASE_COPY } from './BroadcastPrimitives';
import { untilTime } from '../../lib/format';

/* =============================================================
   LIVE SCOREBOARD
   -------------------------------------------------------------
   The persistent broadcast strip: what event is on, how long is
   left, what the analyst is doing, and whether the feed is up.
   Four cells, fixed order, so the eye learns where each fact
   lives and never has to hunt for it.

   Every cell falls back to "--" rather than to a plausible
   number. A scoreboard that guesses is worse than one that says
   it does not know.
   ============================================================= */

export function LiveScoreboard({ snapshot, market, now, compact = false }: {
  snapshot: ArenaSnapshot; market: CanonicalMarket | null; now: number; compact?: boolean;
}) {
  const brain = snapshot.brain;
  const feed = snapshot.health;
  const phase = market?.phase ?? 'PREGAME';
  const mu = market?.matchup ?? null;

  return (
    <section className={`scoreboard glass-02 ${compact ? 'is-compact' : ''}`}
             aria-label="Live event scoreboard">
      <div className="sb-cell sb-event">
        <span className="row g2">
          <LiveFlag status={feed.status} label="FEED" compact />
          {mu?.window && <BroadcastTag>{mu.window}</BroadcastTag>}
        </span>
        <b className="sb-value">{mu ? `${mu.home.code} · ${mu.away.code}` : (market?.symbol ?? NO_VALUE)}</b>
        <span className="t-nano">{market?.title ?? 'no event selected'}</span>
      </div>

      <span className="sb-rule" aria-hidden="true" />

      <div className="sb-cell">
        <span className="t-label">Event status</span>
        <b className={`sb-value sb-phase phase-${phase.toLowerCase()}`}>{PHASE_COPY[phase].sub}</b>
        <span className="t-nano">{PHASE_COPY[phase].label}</span>
      </div>

      <span className="sb-rule" aria-hidden="true" />

      <div className="sb-cell">
        <span className="t-label">Time remaining</span>
        <b className="sb-value t-num">{market ? untilTime(market.closesAt, now) : `${NO_VALUE}:${NO_VALUE}`}</b>
        <span className="t-nano">until close</span>
      </div>

      <span className="sb-rule" aria-hidden="true" />

      <div className="sb-cell">
        <span className="t-label">VIXY state</span>
        <b className={`sb-value sb-brain state-${brain.state.toLowerCase()}`}>{brain.state}</b>
        <span className="t-nano">{brain.stage}</span>
      </div>

      <span className="sb-rule" aria-hidden="true" />

      <div className="sb-cell">
        <span className="t-label">Market feed</span>
        <b className={`sb-value sb-feed feed-${feed.status.toLowerCase()}`}>
          {feed.status === 'LIVE' ? 'CONNECTED' : feed.status}
        </b>
        <span className="t-nano">{snapshot.system.sources.length} sources</span>
      </div>
    </section>
  );
}
