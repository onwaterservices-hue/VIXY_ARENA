import React from 'react';
import type { ArenaSnapshot, CanonicalMarket, EvidenceState } from '../../types';
import { PredictionCore } from '../holographic/PredictionCore';
import { Icon } from '../common/Icon';
import { NO_VALUE } from './BroadcastPrimitives';
import { pct } from '../../lib/format';

/* =============================================================
   VIXY — LIVE ANALYST
   -------------------------------------------------------------
   The holographic core keeps its job: it shows what the engine is
   doing. Around it, the categories the analyst is reading, each
   with the engine's own grade.

   The grades are words, not numbers dressed up as words. A track
   the engine is still scanning shows no progress figure at all,
   because "scanning" means it does not have one yet.

   Momentum lives one panel down, with the clock. The analyst panel
   answers "what is it reading"; the clock panel answers "where is
   the pressure" — repeating the meter in both would say neither.
   ============================================================= */

const EVIDENCE_COPY: Record<EvidenceState, { label: string; note: string }> = {
  SCANNING:   { label: 'scanning',   note: 'reading inputs, nothing formed' },
  BUILDING:   { label: 'building',   note: 'signal accumulating' },
  ALIGNED:    { label: 'aligned',    note: 'agrees with the current read' },
  CONFLICTED: { label: 'conflicted', note: 'disagrees with the current read' },
  CONFIRMED:  { label: 'confirmed',  note: 'validated on the second pass' },
};

export function AnalystPanel({ snapshot, market, coreSize = 300 }: {
  snapshot: ArenaSnapshot; market: CanonicalMarket | null; coreSize?: number;
}) {
  const brain = snapshot.brain;
  const evidence = brain.evidence ?? [];

  return (
    <section className="analyst glass-03 brackets" aria-label="VIXY live analyst">
      <i className="bk bk-tl" /><i className="bk bk-tr" /><i className="bk bk-bl" /><i className="bk bk-br" />

      <header className="analyst-head">
        <span className="analyst-badge">
          <Icon name="brain" size={13} />VIXY AI
        </span>
        <div className="col" style={{ gap: 1 }}>
          <b className="t-h3">Live analyst</b>
          <span className="t-nano">
            {market ? `analyzing ${market.symbol}` : 'awaiting an event to analyze'}
          </span>
        </div>
        <span className={`analyst-state state-${brain.state.toLowerCase()}`}>
          <i className="dot pulse-dot" />{brain.state}
        </span>
      </header>

      <div className="analyst-body">
        <div className="analyst-core">
          <PredictionCore state={brain.state} size={coreSize} />
          <div className="analyst-core-read col center">
            <span className={`brain-state state-${brain.state.toLowerCase()}`}>{brain.state}</span>
            <span className="t-label">{brain.stage}</span>
          </div>
        </div>

        <div className="analyst-tracks">
          <span className="t-label">What the analyst is reading</span>
          {evidence.length === 0 ? (
            <span className="t-nano">No evidence categories reported yet.</span>
          ) : (
            <ul className="ev-list">
              {evidence.map((e) => (
                <li key={e.key} className={`ev-row ev-${e.state.toLowerCase()}`}>
                  <span className="ev-label">{e.label}</span>
                  <span className="ev-bar" aria-hidden="true">
                    <i style={{ width: e.progressBps === null ? '0%' : `${e.progressBps / 100}%` }} />
                  </span>
                  <span className="ev-state t-nano" title={EVIDENCE_COPY[e.state].note}>
                    {EVIDENCE_COPY[e.state].label}
                  </span>
                  <span className="ev-num t-num">
                    {e.progressBps === null ? NO_VALUE : pct(e.progressBps, 0)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <footer className="analyst-foot row between">
        <span className="t-nano">{brain.modelVersion} · every read is attributable to a model version</span>
        <span className="t-nano">core reflects engine state only · no call is expressed here</span>
      </footer>
    </section>
  );
}
