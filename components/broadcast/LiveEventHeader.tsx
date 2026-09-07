import React from 'react';
import type { ArenaSnapshot, CanonicalMarket } from '../../types';
import { VenueChip } from '../common/Primitives';
import {
  BroadcastTag, LiveFlag, MatchupSideBlock, VersusMark, PHASE_COPY, NO_VALUE,
} from './BroadcastPrimitives';
import { untilTime } from '../../lib/format';

/* =============================================================
   LIVE EVENT HEADER
   -------------------------------------------------------------
   The card a broadcast puts up when it comes back from the
   break: what event this is, who is on each side, how long is
   left, and what the analyst is doing about it.

   Reusable across the Arena hero, the Match Center and any
   single-event surface, so the same event reads identically
   wherever it appears.
   ============================================================= */

export function LiveEventHeader({ snapshot, market, now, size = 'lg' }: {
  snapshot: ArenaSnapshot; market: CanonicalMarket | null; now: number; size?: 'md' | 'lg';
}) {
  const mu = market?.matchup ?? null;
  const phase = market?.phase ?? 'PREGAME';
  /* "LIVE" alone reads as "the game is on". Say what is live: the feed, unless the event has started. */
  const ev = market ? snapshot.events.find((e) => e.marketIds.includes(market.id)) : null;
  const eventLive = ev?.status === 'LIVE';

  return (
    <header className={`leh size-${size} phase-${phase.toLowerCase()}`}>
      <div className="leh-top row between g3">
        <span className="row g2">
          <LiveFlag status={market?.health.status ?? snapshot.health.status} label={eventLive ? 'LIVE' : 'LIVE FEED'} />
          <BroadcastTag tone="hot">MAIN EVENT</BroadcastTag>
          {mu?.window && <BroadcastTag>{mu.window}</BroadcastTag>}
        </span>
        <span className="row g2">
          {market?.venueRefs.map((v) => <VenueChip key={v.venue} venue={v.venue} />)}
        </span>
      </div>

      <div className="leh-matchup">
        <MatchupSideBlock side={mu?.home ?? null} tone="home" align="right" size={size} />
        <VersusMark size={size} />
        <MatchupSideBlock side={mu?.away ?? null} tone="away" align="left" size={size} />
      </div>

      <div className="leh-title">
        <h2 className="t-h2">{market?.title ?? 'Awaiting event data'}</h2>
        {market?.subtitle && <span className="t-nano">{market.subtitle}</span>}
      </div>

      <dl className="leh-facts">
        <div>
          <dt className="t-label">Event clock</dt>
          <dd className="t-num">{market ? untilTime(market.closesAt, now) : `${NO_VALUE}:${NO_VALUE}`}</dd>
        </div>
        <div>
          <dt className="t-label">Signal status</dt>
          <dd className={`leh-phase phase-${phase.toLowerCase()}`}>{PHASE_COPY[phase].sub}</dd>
        </div>
        <div>
          <dt className="t-label">AI analyst</dt>
          <dd className={`leh-brain state-${snapshot.brain.state.toLowerCase()}`}>{snapshot.brain.state}</dd>
        </div>
        <div>
          <dt className="t-label">Market feed</dt>
          <dd className={`leh-feed feed-${(market?.health.status ?? 'UNKNOWN').toLowerCase()}`}>
            {market?.health.status ?? NO_VALUE}
          </dd>
        </div>
      </dl>
    </header>
  );
}
