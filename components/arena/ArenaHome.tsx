import React, { useState } from 'react';
import type { ArenaSnapshot, CanonicalMarket } from '../../types';
import { HoloPanel } from '../holographic/HoloPanel';
import { PredictionCore } from '../holographic/PredictionCore';
import { NeuralMap } from '../neural/NeuralMap';
import { Leaderboard } from '../leaderboard/Leaderboard';
import { LivePrediction } from './LivePrediction';
import { SectionHeader } from '../common/Primitives';
import { Icon } from '../common/Icon';

import { useArenaUI } from '../common/ui-context';
import { LiveEventHeader } from '../broadcast/LiveEventHeader';
import { LiveScoreboard } from '../broadcast/LiveScoreboard';
import { ArenaClock } from '../broadcast/ArenaClock';
import { MomentumMeter } from '../broadcast/MomentumMeter';
import { AnalystPanel } from '../broadcast/AnalystPanel';
import { PlayByPlay } from '../broadcast/PlayByPlay';
import { ArenaStandings } from '../broadcast/ArenaStandings';
import { MatchupCard } from '../broadcast/MatchupCard';
import { BroadcastTag } from '../broadcast/BroadcastPrimitives';
import { signedPct } from '../../lib/format';

const DIRECTIONS = [
  { key: 'UP',   label: 'Up',   hint: 'model above market', icon: 'arrowUp' as const,   cls: 'up' },
  { key: 'WAIT', label: 'Wait', hint: 'inside noise band',  icon: 'target' as const,    cls: 'wait' },
  { key: 'DOWN', label: 'Down', hint: 'model below market', icon: 'arrowDown' as const, cls: 'down' },
];

/* =============================================================
   THE ARENA
   -------------------------------------------------------------
   Read top to bottom this is a broadcast running order, not a
   dashboard: the ticker is already overhead, then the main event,
   the analyst, the clock and the momentum, the play-by-play, the
   rest of the card, the standings, the board.

   Everything on this screen is a value the engine sent. The
   screen decides the order and the emphasis; it decides nothing
   about the markets.
   ============================================================= */

export function ArenaHome({
  snapshot, now, onNavigate,
}: { snapshot: ArenaSnapshot; now: number; onNavigate: (id: string) => void }) {
  const [selectedId, setSelectedId] = useState<string>(
    snapshot.opportunities[0]?.marketId ?? snapshot.markets[0]?.id ?? '');
  const [timeframe, setTimeframe] = useState('1H');
  const [focusNode, setFocusNode] = useState<string | null>(null);
  const ui = useArenaUI();

  const market: CanonicalMarket | undefined =
    snapshot.markets.find((m) => m.id === selectedId) ?? snapshot.markets[0];
  const brain = snapshot.brain;
  const ranked = snapshot.opportunities.slice(0, 6);
  const undercard = snapshot.markets.filter((m) => m.id !== market?.id).slice(0, 4);

  return (
    <div className="screen col g6">
      {/* ---------- 1 · MAIN EVENT ---------- */}
      <section className="main-event hero glass-02 brackets">
        <i className="bk bk-tl" /><i className="bk bk-tr" /><i className="bk bk-bl" /><i className="bk bk-br" />

        <div className="col g5" style={{ minWidth: 0 }}>
          <LiveEventHeader snapshot={snapshot} market={market ?? null} now={now} size="lg" />

          <div className="row g3 wrap">
            <button className="btn btn-primary tap" onClick={() => onNavigate('match')}>
              <Icon name="live" size={15} />Match Center
            </button>
            <button className="btn tap" onClick={() => onNavigate('live')}>
              <Icon name="signals" size={15} />Live feed
            </button>
            {market && (
              <button className="btn btn-ghost tap" onClick={() => ui.openMarket(market.id)}>
                Open this event<Icon name="chevronR" size={13} />
              </button>
            )}
          </div>
        </div>

        {/* The core keeps its place at the centre of the arena. It reports
            what the engine is doing and nothing else — the vectors around
            it name the three shapes an answer can take, not an answer. */}
        <div className="main-event-core hero-core">
          <PredictionCore state={brain.state} size={420} />
          <div className="main-event-core-read hero-core-center col center">
            <span className={`brain-state state-${brain.state.toLowerCase()}`}>{brain.state}</span>
            <span className="t-nano">{brain.stage}</span>
          </div>
          {/* The three shapes an answer can take. They name the vocabulary,
              they do not express a call — the core is state, not opinion. */}
          <div className="hero-vectors">
            {DIRECTIONS.map((d) => (
              <div key={d.key} className={`vector glass-01 v-${d.cls}`}>
                <span className="vector-ico"><Icon name={d.icon} size={13} /></span>
                <span className="col" style={{ gap: 0 }}>
                  <b>{d.label}</b>
                  <span className="t-nano">{d.hint}</span>
                </span>
              </div>
            ))}
          </div>
          <span className="hero-core-note t-nano">
            core reflects engine state only · no live call is expressed here
          </span>
        </div>
      </section>

      {/* ---------- 2 · SCOREBOARD ---------- */}
      <LiveScoreboard snapshot={snapshot} market={market ?? null} now={now} />

      {/* ---------- 3 · ANALYST ---------- */}
      <AnalystPanel snapshot={snapshot} market={market ?? null} coreSize={280} />

      {/* ---------- 4 · CLOCK + MOMENTUM ---------- */}
      <HoloPanel grade={2} eyebrow="Event timing" title="Clock and momentum"
                 actions={<BroadcastTag tone="hot">{market?.matchup?.window ?? 'EVENT'}</BroadcastTag>}>
        <div className="clock-momentum">
          <ArenaClock market={market ?? null} now={now} />
          <MomentumMeter momentum={market?.momentum ?? null} edgeBps={market?.edgeBps ?? null} height={92} />
        </div>
      </HoloPanel>

      {/* ---------- 5 · PLAY-BY-PLAY + STANDINGS ---------- */}
      <div className="arena-split">
        <HoloPanel grade={2} eyebrow="Live activity" title="Play-by-play"
          actions={<button className="btn btn-sm btn-ghost tap" onClick={() => onNavigate('signals')}>Full console</button>}>
          <PlayByPlay events={snapshot.signals} now={now} limit={8} announce />
        </HoloPanel>

        <div className="col g4">
          <ArenaStandings snapshot={snapshot} onOpen={onNavigate} />

          <HoloPanel grade={2} eyebrow="Opportunity ranking" title="Widest disagreement"
            actions={<button className="btn btn-sm btn-ghost tap" onClick={() => onNavigate('markets')}>All</button>}>
            <ol className="rank-list">
              {ranked.slice(0, 5).map((o) => {
                const m = snapshot.markets.find((x) => x.id === o.marketId);
                if (!m) return null;
                return (
                  <li key={o.marketId}>
                    <button className={`rank-row tap ${o.marketId === selectedId ? 'is-selected' : ''}`}
                            onClick={() => setSelectedId(o.marketId)}>
                      <span className="rank-index t-num">{String(o.rank).padStart(2, '0')}</span>
                      <span className="col grow" style={{ gap: 1, alignItems: 'flex-start', minWidth: 0 }}>
                        <b className="rank-sym">{m.matchup ? `${m.matchup.home.code} vs ${m.matchup.away.code}` : m.symbol}</b>
                        <span className="rank-title">{m.title}</span>
                      </span>
                      <b className={`t-num ${o.edgeBps >= 0 ? 'edge-pos' : 'edge-neg'}`}>{signedPct(o.edgeBps)}</b>
                    </button>
                  </li>
                );
              })}
            </ol>
          </HoloPanel>
        </div>
      </div>

      {/* ---------- 6 · THE REST OF THE CARD ---------- */}
      <section>
        <SectionHeader eyebrow="Also on the card" title="Active matchups"
          action={<button className="btn btn-sm btn-ghost tap" onClick={() => onNavigate('match')}>Match Center<Icon name="chevronR" size={13} /></button>} />
        <div className="fixture-grid">
          {undercard.map((m, i) => (
            <MatchupCard key={m.id} market={m} now={now} index={i} variant="fixture"
                         onOpen={(x) => ui.openMarket(x.id)} />
          ))}
        </div>
      </section>

      {/* ---------- 7 · THE EVENT IN DETAIL ---------- */}
      <LivePrediction market={market} markets={snapshot.markets} onSelectMarket={setSelectedId}
                      timeframe={timeframe} onTimeframe={setTimeframe} now={now} />

      {/* ---------- 8 · RELATIONSHIPS ---------- */}
      <HoloPanel grade={2} eyebrow="Modeled relationships" title="Neural market map" padded={false}
        actions={
          <>
            <div className="map-legend row g3">
              <span className="lg lg-corr">Correlation</span>
              <span className="lg lg-mom">Momentum</span>
              <span className="lg lg-liq">Liquidity</span>
            </div>
            <button className="btn btn-sm btn-ghost tap" onClick={() => onNavigate('neural')}>Expand</button>
          </>
        }>
        <NeuralMap graph={snapshot.graph} height={380} selectedId={focusNode}
                   onSelect={(n) => { setFocusNode(n.id); setSelectedId(n.id); }} />
        <div className="map-foot row between">
          <span className="t-nano">{snapshot.graph.nodes.length} nodes · {snapshot.graph.edges.length} modeled links · demo topology</span>
          <span className="t-nano">hover a node for its cluster</span>
        </div>
      </HoloPanel>

      {/* ---------- 9 · GLOBAL ARENA ---------- */}
      <HoloPanel grade={2} eyebrow="Global arena" title="Leaderboard"
        actions={<button className="btn btn-sm btn-ghost tap" onClick={() => onNavigate('leaderboard')}>Full board</button>}>
        <Leaderboard entries={snapshot.leaderboard} limit={8} podium={false} />
      </HoloPanel>
    </div>
  );
}
