import React from 'react';
import type { ArenaSnapshot } from '../../types';
import { HoloPanel } from '../holographic/HoloPanel';
import { PredictionCore } from '../holographic/PredictionCore';
import { SignalStream } from '../signals/SignalStream';
import { EdgeLadder } from '../holographic/Meters';
import { Sparkline } from '../holographic/Sparkline';
import { useArenaUI } from '../common/ui-context';
import { StatusPill } from '../common/Primitives';
import { Icon } from '../common/Icon';
import { pct, signedPct, untilTime } from '../../lib/format';

/* Contextual intelligence rail. Always answers: what is the engine
   doing, what deserves attention, and how fresh is any of it. */
export function IntelPanel({
  snapshot, now, onNavigate,
}: { snapshot: ArenaSnapshot | null; now: number; onNavigate: (id: string) => void }) {
  /* Hooks run before any early return: this panel mounts while the first
     snapshot is still loading, and a conditional hook would change the
     hook count between those two renders. */
  const ui = useArenaUI();
  if (!snapshot) return <aside className="intel"><div className="skel" style={{ height: 220 }} /></aside>;

  const top = snapshot.opportunities[0];
  const market = snapshot.markets.find((m) => m.id === top?.marketId);
  const brain = snapshot.brain;

  return (
    <aside className="intel vx-scroll" aria-label="Intelligence panel">
      <HoloPanel grade={2} eyebrow="AI system" title="VIXY Brain" padded={false}
                 actions={<button className="btn btn-sm btn-ghost tap" onClick={() => onNavigate('brain')}>Open</button>}>
        <div className="intel-core">
          <PredictionCore state={brain.state} size={168} />
          <div className="intel-core-read col center">
            <span className={`brain-state state-${brain.state.toLowerCase()}`}>{brain.state}</span>
            <span className="t-nano">{brain.stage}</span>
          </div>
        </div>
        <div className="intel-brain-grid">
          <div><span className="t-label">Tracked</span><b className="t-num">{brain.marketsTracked}</b></div>
          <div><span className="t-label">Matched</span><b className="t-num">{brain.marketsMatched}</b></div>
          <div><span className="t-label">Queue</span><b className="t-num">{brain.queueDepth}</b></div>
        </div>
      </HoloPanel>

      {top && market && (
        <HoloPanel grade={2} eyebrow="Ranked #1" title="Highest modeled edge" active
                   actions={<span className="pill pill-violet">score {top.edgeScore}</span>}>
          <div className="col g3">
            <button className="col intel-top-head tap" onClick={() => ui.openMarket(market.id)}>
              <span className="t-h3">{market.title}</span>
              <span className="t-small">{market.subtitle}</span>
            </button>
            <Sparkline series={market.series} width={280} height={44}
                       tone={(market.edgeBps ?? 0) >= 0 ? 'edge' : 'risk'} />
            <EdgeLadder marketBps={market.marketProbabilityBps} vixyBps={market.vixyProbabilityBps}
                        edgeBps={market.edgeBps} size="sm" showScale={false} />
            <div className="row between t-small">
              <span>Market {pct(market.marketProbabilityBps)}</span>
              <span className="t-num" style={{ color: 'var(--vx-violet-hi)' }}>VIXY {pct(market.vixyProbabilityBps)}</span>
            </div>
            <ul className="evidence">
              {top.evidence.slice(0, 2).map((e, i) => (
                <li key={i}><Icon name="check" size={11} /><span>{e}</span></li>
              ))}
            </ul>
            <div className="row between">
              <span className="t-nano">closes in {untilTime(market.closesAt, now)}</span>
              <span className={`edge-tag ${(market.edgeBps ?? 0) >= 0 ? 'pos' : 'neg'}`}>
                {signedPct(market.edgeBps)} edge
              </span>
            </div>
            <button className="btn btn-sm btn-primary tap"
                    onClick={() => ui.openCall(market.id, (market.edgeBps ?? 0) >= 0 ? 'YES' : 'NO')}>
              <Icon name="target" size={13} />Call it
            </button>
          </div>
        </HoloPanel>
      )}

      <HoloPanel grade={1} eyebrow="Telemetry" title="Signal stream" padded={false}
                 actions={<button className="btn btn-sm btn-ghost tap" onClick={() => onNavigate('signals')}>All</button>}>
        <SignalStream events={snapshot.signals} dense limit={7} now={now} />
      </HoloPanel>

      <HoloPanel grade={1} eyebrow="Sources" title="Feed health">
        <ul className="src-list">
          {snapshot.system.sources.map((s) => (
            <li key={s.key} className="row between g3">
              <span className="t-small">{s.label}</span>
              <span className="row g3">
                <span className="t-nano">{s.latencyMs}ms</span>
                <StatusPill status={s.status} compact />
              </span>
            </li>
          ))}
        </ul>
      </HoloPanel>
    </aside>
  );
}
