import React, { useEffect, useState } from 'react';
import type { ArenaSnapshot } from '../../types';
import { PredictionCore } from '../holographic/PredictionCore';
import { ProbabilityChart } from '../holographic/ProbabilityChart';
import { Icon } from '../common/Icon';
import { OriginBadge } from '../common/Primitives';
import { VixyMark } from '../navigation/Wordmark';
import { useFocusTrap, useMedia } from '../../hooks';
import { pct, signedPct, untilTime } from '../../lib/format';

/* =============================================================
   BROADCAST MODE
   -------------------------------------------------------------
   A full-bleed, camera-ready view of one market: built to be
   screen-recorded. 16:9 for landscape, 9:16 for a phone feed.
   It shows the same numbers as the rest of the product and keeps
   the DEMO stamp, because a clip is the easiest place for a
   synthetic value to escape as if it were real.
   ============================================================= */

export function BroadcastMode({ snapshot, now, onClose }: {
  snapshot: ArenaSnapshot; now: number; onClose: () => void;
}) {
  const ranked = snapshot.opportunities;
  const [index, setIndex] = useState(0);
  const [vertical, setVertical] = useState(false);
  const narrow = useMedia('(max-width: 900px)');
  const [auto, setAuto] = useState(true);
  const trapRef = useFocusTrap<HTMLDivElement>();
  /* A narrow viewport has no landscape option: the stage is vertical
     either way, so the layout class follows the frame that renders. */
  const isVertical = vertical || narrow;

  const opportunity = ranked[index % Math.max(1, ranked.length)];
  const market = snapshot.markets.find((m) => m.id === opportunity?.marketId) ?? snapshot.markets[0];

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % Math.max(1, ranked.length)), 9000);
    return () => clearInterval(id);
  }, [auto, ranked.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % Math.max(1, ranked.length));
      if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + ranked.length) % Math.max(1, ranked.length));
      if (e.key.toLowerCase() === 'v') setVertical((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, ranked.length]);

  if (!market) return null;
  const positive = (market.edgeBps ?? 0) >= 0;

  return (
    <div className="bcast" ref={trapRef} role="dialog" aria-modal="true" aria-label="Broadcast mode">
      <div className={`bcast-stage ${isVertical ? 'is-vertical' : ''}`}>
        <div className="bcast-bg"><PredictionCore state={snapshot.brain.state} size={isVertical ? 560 : 720} /></div>

        <header className="bcast-head row between">
          <div className="row g3">
            <VixyMark size={30} />
            <div className="col" style={{ gap: 0 }}>
              <b className="bcast-word">VIXY<em>ARENA</em></b>
              <span className="t-nano">call it. prove it.</span>
            </div>
          </div>
          <div className="row g3">
            <OriginBadge origin={snapshot.health.origin} label={snapshot.health.origin === 'DEMO' ? 'the demo provider' : 'the engine'} />
            <span className="pill pill-violet"><i className="dot pulse-dot" />{snapshot.brain.state}</span>
          </div>
        </header>

        <div className="bcast-body">
          <span className="bcast-rank t-mono">RANK {String(opportunity?.rank ?? 1).padStart(2, '0')} · EDGE SCORE {opportunity?.edgeScore ?? '—'}</span>
          <h1 className="bcast-title">{market.title}</h1>
          <span className="bcast-sub">
            {market.subtitle ? `${market.subtitle} · ` : ''}closes in {untilTime(market.closesAt, now)}
          </span>

          <div className="bcast-numbers">
            <div className="col">
              <span className="t-label">Market says</span>
              <b className="bcast-num">{pct(market.marketProbabilityBps)}</b>
            </div>
            <div className="col bcast-vs">
              <span className="t-label">VIXY says</span>
              <b className="bcast-num vixy">{pct(market.vixyProbabilityBps)}</b>
            </div>
            <div className="col">
              <span className="t-label">Edge</span>
              <b className={`bcast-num ${positive ? 'edge-pos' : 'edge-neg'}`}>{signedPct(market.edgeBps)}</b>
            </div>
          </div>

          <div className="bcast-ladder">
            <div className="ladder-track">
              <div className="ladder-rail" />
              <div className="ladder-ticks">
                {Array.from({ length: 11 }, (_, i) => (
                  <i key={i} className={i % 5 === 0 ? 'major' : ''} style={{ left: `${i * 10}%` }} />
                ))}
              </div>
              <div className={`ladder-band ${positive ? 'pos' : 'neg'}`}
                   style={{
                     left: `${Math.min((market.marketProbabilityBps ?? 0) / 100, (market.vixyProbabilityBps ?? 0) / 100)}%`,
                     width: `${Math.abs(((market.vixyProbabilityBps ?? 0) - (market.marketProbabilityBps ?? 0)) / 100)}%`,
                   }} />
              <span className="ladder-mark market" style={{ left: `${(market.marketProbabilityBps ?? 0) / 100}%` }} />
              <span className="ladder-mark vixy" style={{ left: `${(market.vixyProbabilityBps ?? 0) / 100}%` }} />
            </div>
          </div>

          {/* the proof chart carries the vertical frame too: a phone clip
              has more height to spend than a 16:9 stage, not less. */}
          <div className="bcast-chart">
            <ProbabilityChart market={market.series} vixy={market.vixySeries} edgeBps={market.edgeBps}
                              height={isVertical ? 300 : 190}
                              windowLabel="trailing window" showLegend={false} />
          </div>

          {opportunity && (
            <ul className="bcast-evidence">
              {opportunity.evidence.slice(0, isVertical ? 2 : 3).map((e, i) => (
                <li key={i}><Icon name="check" size={13} /><span>{e}</span></li>
              ))}
            </ul>
          )}
        </div>

        <footer className="bcast-foot row between">
          <span className="t-nano">
            {snapshot.health.origin === 'DEMO'
              ? 'demo provider · no venue, model or settlement service connected'
              : `engine feed · ${snapshot.health.status.toLowerCase()}`}
          </span>
          <span className="t-nano">{snapshot.brain.modelVersion}</span>
        </footer>
      </div>

      <div className="bcast-controls glass-02">
        <button className="icon-btn tap" disabled={ranked.length < 2}
                onClick={() => setIndex((i) => (i - 1 + ranked.length) % Math.max(1, ranked.length))}
                aria-label="Previous market"><Icon name="chevronL" size={15} /></button>
        <span className="t-nano bcast-count">{(index % Math.max(1, ranked.length)) + 1} / {ranked.length}</span>
        <button className="icon-btn tap" disabled={ranked.length < 2}
                onClick={() => setIndex((i) => (i + 1) % Math.max(1, ranked.length))}
                aria-label="Next market"><Icon name="chevronR" size={15} /></button>
        <span className="bcast-divider" />
        <button className={`btn btn-sm tap ${auto ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAuto((v) => !v)}>
          {auto ? 'Auto-rotating' : 'Manual'}
        </button>
        <button className={`btn btn-sm tap ${isVertical ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setVertical((v) => !v)} disabled={narrow}>
          {isVertical ? '9:16' : '16:9'}
        </button>
        <button className="btn btn-sm tap" onClick={onClose}><Icon name="close" size={13} />Exit</button>
      </div>
    </div>
  );
}
