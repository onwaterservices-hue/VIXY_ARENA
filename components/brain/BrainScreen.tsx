import React from 'react';
import type { ArenaSnapshot, BrainState } from '../../types';
import { HoloPanel } from '../holographic/HoloPanel';
import { PredictionCore } from '../holographic/PredictionCore';
import { Gauge } from '../holographic/Gauge';
import { SignalMeter } from '../holographic/Meters';
import { CalibrationCurve } from './CalibrationCurve';
import { SectionHeader, StatTile, StatusPill, Empty } from '../common/Primitives';
import { SignalStream } from '../signals/SignalStream';
import { Icon } from '../common/Icon';
import { pct, signedPct, relTime } from '../../lib/format';
import { SECTORS } from '../../lib/categories';
import { useArenaUI } from '../common/ui-context';

const STATES: { key: BrainState; blurb: string }[] = [
  { key: 'OBSERVING',  blurb: 'Watching venues and event data. No inference in flight.' },
  { key: 'ANALYZING',  blurb: 'Features rebuilt, model evaluating candidate markets.' },
  { key: 'COMPARING',  blurb: 'Weighing its own read against the venues and its own history.' },
  { key: 'CONFIRMING', blurb: 'Second pass validating a candidate before it can be written.' },
  { key: 'LOCKED',     blurb: 'Call record written and immutable. Nothing can edit it.' },
  { key: 'SETTLING',   blurb: 'Resolving the outcome. Not yet verified, so not yet a result.' },
  { key: 'SETTLED',    blurb: 'Outcome verified against a source of truth, result recorded.' },
];

const PIPELINE = ['DISCOVER', 'VERIFY', 'MODEL', 'COMPARE', 'DETECT EDGE', 'RANK', 'EXPLAIN', 'RECORD', 'SETTLE', 'MEASURE', 'LEARN'];

const EVIDENCE_GRADE: Record<string, { label: string; cls: string }> = {
  SCANNING:   { label: 'scanning',   cls: 'scan' },
  BUILDING:   { label: 'building',   cls: 'build' },
  ALIGNED:    { label: 'aligned',    cls: 'align' },
  CONFLICTED: { label: 'conflicted', cls: 'conflict' },
  CONFIRMED:  { label: 'confirmed',  cls: 'confirm' },
};

export function BrainScreen({ snapshot, now = Date.now() }:
  { snapshot: ArenaSnapshot; now?: number }) {
  const b = snapshot.brain;
  const sys = snapshot.system;
  const ui = useArenaUI();

  /* What the engine is watching, by sector. The counts are the canonical
     markets it actually carries — this is the panel that answers "is VIXY a
     crypto product", and it answers it with the engine's own numbers. */
  const coverage = SECTORS
    .map((sec) => ({
      sec,
      n: snapshot.markets.filter((m) => sec.categories.includes(m.category)).length,
    }))
    .filter((c) => c.n > 0)
    .sort((a, b2) => b2.n - a.n);
  const coverageTotal = coverage.reduce((a, c) => a + c.n, 0);

  /* Ranked by the engine, across every category — never within one. */
  const topSignals = snapshot.opportunities.slice(0, 6)
    .map((o) => ({ o, m: snapshot.markets.find((x) => x.id === o.marketId) }))
    .filter((x) => x.m);
  const activeStages = b.stage.split(' → ');

  return (
    <div className="screen col g6">
      <SectionHeader eyebrow="AI system" title="VIXY Brain" />

      <div className="brain-hero glass-03 brackets">
        <i className="bk bk-tl" /><i className="bk bk-tr" /><i className="bk bk-bl" /><i className="bk bk-br" />
        <div className="brain-hero-core">
          <PredictionCore state={b.state} size={420} />
          <div className="brain-hero-read col center">
            <span className={`brain-state xl state-${b.state.toLowerCase()}`}>{b.state}</span>
            <span className="t-label">{b.stage}</span>
          </div>
        </div>
        <div className="brain-hero-side col g4">
          <Gauge valueBps={b.calibrationBps} label="Calibration" sub="trailing reliability" size={158} tone="cyan" />
          <SignalMeter label="Queue pressure" valueBps={Math.min(10000, b.queueDepth * 260)} tone="violet" />
          <SignalMeter label="Inference throughput" valueBps={Math.min(10000, b.inferencesPerMin * 8)} tone="cyan" />
          <div className="model-card">
            <span className="t-label">Model</span>
            <b className="t-mono">{b.modelVersion}</b>
            {b.modelStatus
              ? <span className={`t-nano model-status status-${b.modelStatus.toLowerCase()}`} title={b.modelStatusNote}>{b.modelStatus.replace('MODEL_', '').replace('_', ' ')}{b.modelStatus !== 'MODEL_READY' ? ' · unvalidated' : ' · out-of-sample'}</span>
              : <span className="t-nano">every version is documented in a model card before it can serve</span>}
          </div>
        </div>
      </div>

      <div className="stat-row">
        <StatTile label="Markets tracked" value={b.marketsTracked} sub="across connected venues" icon="markets" />
        <StatTile label="Cross-venue matched" value={b.marketsMatched} sub="confirmed equivalence" icon="layers" tone="cyan" />
        <StatTile label="Inference rate" value={`${b.inferencesPerMin}/min`} sub="model evaluations" icon="brain" tone="violet" />
        <StatTile label="Queue depth" value={b.queueDepth} sub="pending evaluations" icon="telemetry" />
      </div>

      <div className="split-2">
        <HoloPanel grade={2} eyebrow="Reliability" title="Predicted against realized"
                   actions={<span className="pill pill-violet"><i className="dot" />{b.calibrationBins.reduce((a, x) => a + x.count, 0)} settled</span>}>
          <CalibrationCurve bins={b.calibrationBins} />
          <p className="t-small" style={{ marginTop: 'var(--s-3)' }}>
            Points on the diagonal mean the model's stated confidence matched what happened.
            Below it, the model was over-confident in that band. Dot size is the number of
            settled observations in the bin — a small dot is not evidence.
          </p>
        </HoloPanel>

        <HoloPanel grade={2} eyebrow="Model card" title="What is registered">
          <ul className="kv-list">
            <li><span className="t-label">Model version</span><b className="t-mono">{b.modelVersion}</b></li>
            <li><span className="t-label">State</span><b>{b.state}</b></li>
            {b.modelStatus && <li><span className="t-label">Validation</span><b className="t-mono">{b.modelStatus}</b></li>}
            <li><span className="t-label">Stage</span><b className="t-mono">{b.stage}</b></li>
            <li><span className="t-label">Markets tracked</span><b className="t-num">{b.marketsTracked}</b></li>
            <li><span className="t-label">Cross-venue matched</span><b className="t-num">{b.marketsMatched}</b></li>
            <li><span className="t-label">Inference rate</span><b className="t-num">{b.inferencesPerMin}/min</b></li>
            <li><span className="t-label">Queue depth</span><b className="t-num">{b.queueDepth}</b></li>
            <li><span className="t-label">Calibration</span><b className="t-num">{pct(b.calibrationBps, 1)}</b></li>
          </ul>
          <div className="notice" style={{ marginTop: 'var(--s-4)' }}>
            <Icon name="brain" size={14} />
            <span className="t-small">
              {b.modelStatusNote
                ? b.modelStatusNote
                : 'Every model version ships with a card recording its inputs, its training window and its known failure modes before it is allowed to serve a probability.'}
            </span>
          </div>
        </HoloPanel>
      </div>

      <HoloPanel grade={2} eyebrow="State machine" title="What the engine is doing">
        <div className="state-track">
          {STATES.map((s) => (
            <div key={s.key} className={`state-node ${s.key === b.state ? 'is-active' : ''}`}>
              <span className="state-orb"><i /></span>
              <b className="state-name">{s.key}</b>
              <span className="t-small">{s.blurb}</span>
            </div>
          ))}
        </div>
      </HoloPanel>

      {/* Coverage. The one panel that settles what this product is. */}
      <div className="split-2">
        <HoloPanel grade={2} eyebrow="What the engine is watching" title="Coverage by sector">
          <ul className="cov-list">
            {coverage.map(({ sec, n }) => (
              <li key={sec.key} className="cov-row"
                  style={{ ['--sector' as string]: `var(${sec.accent})` }}>
                <button className="cov-hit tap" onClick={() => ui.navigate(`sector/${sec.key}`)}>
                  <span className="cov-label">{sec.label}</span>
                  <span className="cov-bar" aria-hidden="true">
                    <i style={{ width: `${(n / coverageTotal) * 100}%` }} />
                  </span>
                  <b className="cov-n t-num">{n}</b>
                </button>
              </li>
            ))}
          </ul>
          <p className="t-small" style={{ marginTop: 'var(--s-4)' }}>
            {coverageTotal} canonical markets across {coverage.length} sectors. Crypto is one row
            in this list, and the engine treats every row the same way.
          </p>
        </HoloPanel>

        <HoloPanel grade={2} eyebrow="Ranked across every category" title="Top VIXY signals" padded={false}>
          {topSignals.length === 0 ? (
            <div style={{ padding: 'var(--s-5)' }}>
              <Empty title="No signals ranked"
                     detail="The engine has published no ranked opportunities in this snapshot." />
            </div>
          ) : (
            <ul className="tsig-list">
              {topSignals.map(({ o, m }, i) => (
                <li key={o.marketId}>
                  <button className="tsig tap" onClick={() => ui.openMarket(o.marketId)}>
                    <span className="tsig-rank t-num">{String(i + 1).padStart(2, '0')}</span>
                    <span className="col" style={{ gap: 1, minWidth: 0 }}>
                      <b className="tsig-title">{m!.title}</b>
                      <span className="t-nano">{m!.category.toLowerCase()} · confidence {pct(m!.confidenceBps, 0)}</span>
                    </span>
                    <b className={`t-num ${(m!.edgeBps ?? 0) >= 0 ? 'edge-pos' : 'edge-neg'}`}>
                      {signedPct(m!.edgeBps)}
                    </b>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </HoloPanel>
      </div>

      {/* What the analyst is reading, as a matrix. A track the engine is
          still scanning shows no figure at all — "scanning" means it does
          not have one yet, and a bar drawn to zero would imply it does. */}
      <HoloPanel grade={2} eyebrow="What the engine is reading" title="Evidence matrix">
        {b.evidence.length === 0 ? (
          <Empty title="No evidence reported"
                 detail="The engine has not published evidence tracks in this snapshot." />
        ) : (
          <ul className="ev-matrix">
            {b.evidence.map((e) => {
              const g = EVIDENCE_GRADE[e.state] ?? { label: e.state.toLowerCase(), cls: 'scan' };
              return (
                <li key={e.key} className={`evm ev-${g.cls}`}>
                  <span className="evm-label">{e.label}</span>
                  <span className="evm-bar" aria-hidden="true">
                    <i style={{ width: e.progressBps === null ? '0%' : `${e.progressBps / 100}%` }} />
                  </span>
                  <span className="evm-state">{g.label}</span>
                  <span className="evm-num t-num">
                    {e.progressBps === null ? '--' : pct(e.progressBps, 0)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </HoloPanel>

      {/* Where the numbers come from, and how fast. Status is the server's
          word; latency and success rate are the server's figures. */}
      <HoloPanel grade={2} eyebrow="Ingestion" title="Source health and latency" padded={false}>
        <div className="src-scroll vx-scroll-x">
          <table className="data-table src-table">
            <thead>
              <tr>
                <th>Source</th><th>Status</th><th>Latency</th>
                <th>Success</th><th>Throughput</th><th>Last event</th>
              </tr>
            </thead>
            <tbody>
              {sys.sources.map((sm) => (
                <tr key={sm.key}>
                  <td>{sm.label}</td>
                  <td><StatusPill status={sm.status} label={sm.status} /></td>
                  <td className="t-num">{sm.latencyMs}ms</td>
                  <td className="t-num">{pct(sm.successRateBps, 2)}</td>
                  <td className="t-num">{sm.throughputPerMin}/min</td>
                  <td className="t-nano">{relTime(sm.lastEventAt, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="src-foot">
          <span className="t-nano">ingest lag {sys.ingestLagMs}ms</span>
          <i className="tb-sep" />
          <span className="t-nano">match queue {sys.matchQueue}</span>
          <i className="tb-sep" />
          <span className="t-nano">settlement queue {sys.settlementQueue}</span>
          <i className="tb-sep" />
          <span className="t-nano">uptime {pct(sys.uptimeBps, 2)}</span>
        </div>
      </HoloPanel>

      <HoloPanel grade={2} eyebrow="Everything the engine reported" title="Signal stream"
                 padded={false} scan>
        <SignalStream events={snapshot.signals} limit={12} now={now} />
      </HoloPanel>

      <HoloPanel grade={2} eyebrow="Canonical pipeline" title="Discover → learn">
        <div className="pipeline">
          {PIPELINE.map((p) => (
            <span key={p} className={`pipe-step ${activeStages.includes(p) ? 'is-active' : ''}`}>
              {p}
            </span>
          ))}
        </div>
        <p className="t-small" style={{ marginTop: 'var(--s-4)' }}>
          Each stage is a separate service. A probability that cannot name the model version,
          the feature set and the inputs that produced it is never displayed.
        </p>
      </HoloPanel>

      <HoloPanel grade={1} eyebrow="Constraints" title="What this system will not do">
        <ul className="rule-list">
          <li><Icon name="lock" size={13} /><span>Never present a modeled probability without provenance.</span></li>
          <li><Icon name="refresh" size={13} /><span>Never show a stale value as live — status is computed server-side and rendered verbatim.</span></li>
          <li><Icon name="check" size={13} /><span>Never settle a market without verification against a source of truth.</span></li>
          <li><Icon name="brain" size={13} /><span>Never let the interface compute a business rule the engine owns.</span></li>
        </ul>
      </HoloPanel>
    </div>
  );
}
