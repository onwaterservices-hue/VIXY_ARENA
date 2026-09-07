import React from 'react';
import type { CanonicalMarket } from '../../types';
import { HoloPanel } from '../holographic/HoloPanel';
import { Gauge } from '../holographic/Gauge';
import { EdgeLadder, FreshnessPulse, RegimeIndicator, SignalMeter } from '../holographic/Meters';
import { StatusPill, VenueChip } from '../common/Primitives';
import { ProbabilityChart } from '../holographic/ProbabilityChart';
import { pct, signedPct, untilTime } from '../../lib/format';

const TIMEFRAMES = ['5M', '1H', '6H', 'CLOSE'];

/* The single-market analysis surface. Every number here is a server
   value rendered as-is; the panel computes nothing. */
export function LivePrediction({
  market, markets, onSelectMarket, timeframe, onTimeframe, now,
}: {
  market: CanonicalMarket | undefined;
  markets: CanonicalMarket[];
  onSelectMarket: (id: string) => void;
  timeframe: string;
  onTimeframe: (t: string) => void;
  now: number;
}) {
  if (!market) return <HoloPanel title="Live prediction"><div className="skel" style={{ height: 260 }} /></HoloPanel>;

  const analysing = market.health.status === 'LIVE';

  return (
    <HoloPanel
      grade={2}
      eyebrow="Live prediction"
      scan={analysing}
      title={
        <div className="row g3 wrap">
          <h3 className="t-h3">{market.title}</h3>
          <span className="row g1">{market.venueRefs.map((v) => <VenueChip key={v.venue} venue={v.venue} />)}</span>
        </div>
      }
      actions={
        <>
          <div className="seg" role="group" aria-label="Timeframe">
            {TIMEFRAMES.map((t) => (
              <button key={t} aria-pressed={t === timeframe} onClick={() => onTimeframe(t)}>{t}</button>
            ))}
          </div>
          <StatusPill status={market.health.status} />
        </>
      }
    >
      <div className="lp-select vx-scroll-x">
        {markets.slice(0, 10).map((m) => (
          <button key={m.id} className={`lp-chip tap ${m.id === market.id ? 'is-active' : ''}`}
                  onClick={() => onSelectMarket(m.id)}>
            {m.symbol}
          </button>
        ))}
      </div>

      <div className="lp-grid">
        <div className="lp-main col g5">
          <EdgeLadder marketBps={market.marketProbabilityBps} vixyBps={market.vixyProbabilityBps}
                      edgeBps={market.edgeBps} size="lg" />
          <div className="lp-chart">
            <ProbabilityChart market={market.series} vixy={market.vixySeries} height={252} edgeBps={market.edgeBps}
                              windowLabel="trailing window · demo series" />
          </div>
          <div className="lp-meters">
            <SignalMeter label="Signal quality" valueBps={market.signalQualityBps} tone="cyan" />
            <SignalMeter label="Reversal risk" valueBps={market.reversalRiskBps} tone="warn" />
            <SignalMeter label="Cross-venue dispersion" valueBps={market.dispersionBps} tone="violet" segments={16} />
          </div>
        </div>

        <div className="lp-side col g4">
          <Gauge valueBps={market.confidenceBps} label="Confidence" sub={market.provenance?.modelVersion} size={148} />
          <div className="lp-side-grid">
            <RegimeIndicator regime={market.regime} />
            <FreshnessPulse ageMs={market.health.dataAgeMs} status={market.health.status} />
          </div>
          <ul className="lp-facts">
            <li><span className="t-label">Closes in</span><b className="t-num">{untilTime(market.closesAt, now)}</b></li>
            <li><span className="t-label">Market state</span><b>{market.state}</b></li>
            <li><span className="t-label">Edge</span>
              <b className={`t-num ${(market.edgeBps ?? 0) >= 0 ? 'edge-pos' : 'edge-neg'}`}>{signedPct(market.edgeBps)}</b>
            </li>
            {market.venueRefs.map((v) => (
              <li key={v.venue}>
                <span className="t-label">{v.venue} implied</span>
                <b className="t-num">{pct(v.impliedBps)}</b>
              </li>
            ))}
          </ul>
          {market.provenance && (
            <div className="provenance">
              <span className="t-label">Provenance</span>
              <span className="t-nano">{market.provenance.modelVersion} · {market.provenance.featureSetVersion}</span>
              <span className="t-nano">inputs: {market.provenance.inputs.join(', ')}</span>
            </div>
          )}
        </div>
      </div>
    </HoloPanel>
  );
}
