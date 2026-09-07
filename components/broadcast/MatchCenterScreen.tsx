import React, { useMemo, useState } from 'react';
import type { ArenaSnapshot, CanonicalMarket, EventPhase } from '../../types';
import { HoloPanel } from '../holographic/HoloPanel';
import { SectionHeader, StatTile, Empty } from '../common/Primitives';
import { Icon } from '../common/Icon';
import { useArenaUI } from '../common/ui-context';
import { MatchupCard } from './MatchupCard';
import { LiveScoreboard } from './LiveScoreboard';
import { BroadcastTag, NO_VALUE } from './BroadcastPrimitives';

/* =============================================================
   MATCH CENTER
   -------------------------------------------------------------
   Every prediction event as a fixture list, filtered the way a
   sports schedule is filtered: what is on now, what is coming,
   what has been called, what has finished.

   The filters read the phase the ENGINE assigned. A market is
   not "live" because the interface decided it looked live.
   ============================================================= */

type Filter = 'LIVE' | 'UPCOMING' | 'LOCKED' | 'SETTLED';

const FILTER_PHASES: Record<Filter, EventPhase[]> = {
  LIVE:     ['CALIBRATION', 'CONFIRMATION'],
  UPCOMING: ['PREGAME'],
  LOCKED:   ['LOCK_WINDOW'],
  SETTLED:  ['FINAL'],
};

const FILTER_COPY: Record<Filter, string> = {
  LIVE:     'events the analyst is working on right now',
  UPCOMING: 'open events with nothing modeled yet',
  LOCKED:   'events inside the window where a call can be written',
  SETTLED:  'events the settlement service has closed out',
};

export function MatchCenterScreen({ snapshot, now }: { snapshot: ArenaSnapshot; now: number }) {
  const counts = useMemo(() => {
    const out = { LIVE: 0, UPCOMING: 0, LOCKED: 0, SETTLED: 0 } as Record<Filter, number>;
    for (const m of snapshot.markets) {
      for (const f of Object.keys(FILTER_PHASES) as Filter[]) {
        if (FILTER_PHASES[f].includes(m.phase)) out[f] += 1;
      }
    }
    return out;
  }, [snapshot.markets]);
  /* Open on the first tab that has something in it: an empty LIVE tab on a quiet board reads as a broken screen. */
  const [filter, setFilter] = useState<Filter>(() => (['LIVE', 'UPCOMING', 'LOCKED', 'SETTLED'] as Filter[]).find((f) => counts[f] > 0) ?? 'LIVE');
  const [query, setQuery] = useState('');
  const ui = useArenaUI();

  const fixtures = useMemo(() => {
    const q = query.trim().toLowerCase();
    return snapshot.markets
      .filter((m) => FILTER_PHASES[filter].includes(m.phase))
      .filter((m) => !q || `${m.title} ${m.symbol} ${m.matchup?.home.code ?? ''} ${m.matchup?.away.code ?? ''}`
        .toLowerCase().includes(q))
      /* Soonest first, the way a schedule is read. */
      .sort((a, b) => +new Date(a.closesAt) - +new Date(b.closesAt));
  }, [snapshot.markets, filter, query]);

  const headline: CanonicalMarket | null =
    snapshot.markets.find((m) => m.id === snapshot.opportunities[0]?.marketId) ?? snapshot.markets[0] ?? null;

  return (
    <div className="screen col g5">
      <SectionHeader eyebrow="Fixtures" title="Match Center"
        action={
          <span className="row g2">
            <BroadcastTag tone="hot">{`${snapshot.markets.length} EVENTS`}</BroadcastTag>
            <button className="btn btn-sm tap" onClick={() => ui.navigate('live')}>
              <Icon name="live" size={13} />Live feed
            </button>
          </span>
        } />

      <LiveScoreboard snapshot={snapshot} market={headline} now={now} />

      <div className="stat-row">
        <StatTile label="Live now" value={counts.LIVE} sub="under analysis" icon="live" tone="edge" />
        <StatTile label="Upcoming" value={counts.UPCOMING} sub="open, not yet modeled" icon="clock" />
        <StatTile label="Lock window" value={counts.LOCKED} sub="a call can be written" icon="lock" tone="violet" />
        <StatTile label="Settled" value={counts.SETTLED} sub="closed out" icon="check" tone="cyan" />
      </div>

      <div className="filters glass-01">
        <div className="search row g2">
          <Icon name="search" size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
                 placeholder="Filter fixtures" aria-label="Filter fixtures" />
        </div>
        <div className="chipset vx-scroll-x">
          {(Object.keys(FILTER_PHASES) as Filter[]).map((f) => (
            <button key={f} className={`fchip tap ${filter === f ? 'is-active' : ''}`}
                    onClick={() => setFilter(f)} title={FILTER_COPY[f]}>
              {f} {counts[f] > 0 ? `(${counts[f]})` : ''}
            </button>
          ))}
        </div>
      </div>

      <HoloPanel grade={2} eyebrow={filter.toLowerCase()} title="Fixtures"
                 actions={<span className="t-nano">{FILTER_COPY[filter]}</span>}>
        {fixtures.length === 0 ? (
          <Empty title={`Nothing ${filter.toLowerCase()} right now`}
                 detail="Fixtures appear here as the engine advances each event through its phases. The list is never padded." />
        ) : (
          <div className="fixture-grid">
            {fixtures.map((m, i) => (
              <MatchupCard key={m.id} market={m} now={now} index={i}
                           variant="fixture" onOpen={(x) => ui.openMarket(x.id)} />
            ))}
          </div>
        )}
      </HoloPanel>

      <p className="t-nano">
        Match Center reads the phase the engine assigned to each event. A fixture with no
        matchup published shows {NO_VALUE} for its sides rather than inventing competitors.
      </p>
    </div>
  );
}
