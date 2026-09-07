import React from 'react';
import type { ArenaSnapshot, CanonicalMarket } from '../../types';
import { ProbabilityChart } from '../holographic/ProbabilityChart';
import { EdgeLadder, FreshnessPulse, RegimeIndicator, SignalMeter } from '../holographic/Meters';
import { Gauge } from '../holographic/Gauge';
import { CategoryChip, StatusPill, VenueChip } from '../common/Primitives';
import { Icon } from '../common/Icon';
import { useArenaUI } from '../common/ui-context';
import { useFocusTrap } from '../../hooks';
import { compact, pct, relTime, untilTime } from '../../lib/format';

/* =============================================================
   MARKET DETAIL
   -------------------------------------------------------------
   Everything the engine knows about one market, in the order a
   person actually needs it: what it is, where the disagreement
   is, what produced the number, and how it settles.
   ============================================================= */
export function MarketDetail({
  market, snapshot, now, onClose,
}: {
  market: CanonicalMarket; snapshot: ArenaSnapshot; now: number; onClose: () => void;
}) {
  const ui = useArenaUI();
  const trapRef = useFocusTrap<HTMLElement>();
  const opportunity = snapshot.opportunities.find((o) => o.marketId === market.id);
  const related = snapshot.graph.edges
    .filter((e) => e.from === market.id || e.to === market.id)
    .map((e) => {
      const otherId = e.from === market.id ? e.to : e.from;
      return { node: snapshot.graph.nodes.find((n) => n.id === otherId), kind: e.kind, strength: e.strength };
    })
    .filter((r) => r.node)
    .slice(0, 5);
  const signals = snapshot.signals.filter((s) => s.marketId === market.id).slice(0, 6);
  const positive = (market.edgeBps ?? 0) >= 0;

  return (
    <div className="sheet-scrim detail-scrim" onClick={onClose}>
      <aside ref={trapRef} className="detail glass-03 vx-scroll" onClick={(e) => e.stopPropagation()}
             role="dialog" aria-modal="true" aria-label={`${market.title} detail`}>
        <header className="detail-head">
          <div className="row between g3">
            <div className="row g2">
              <span className="mcard-sym">{market.symbol}</span>
              <CategoryChip category={market.category} />
              <StatusPill status={market.health.status} />
            </div>
            <button className="icon-btn tap" onClick={onClose} aria-label="Close detail">
              <Icon name="close" size={15} />
            </button>
          </div>
          <h2 className="t-h1" style={{ marginTop: 'var(--s-3)' }}>{market.title}</h2>
          <p className="t-small">{market.subtitle}</p>
          <div className="row g3 wrap" style={{ marginTop: 'var(--s-3)' }}>
            {market.venueRefs.map((v) => <VenueChip key={v.venue} venue={v.venue} />)}
            <span className="t-nano">closes in {untilTime(market.closesAt, now)}</span>
            <span className="t-nano">state {market.state}</span>
          </div>
        </header>

        <section className="detail-body col g6">
          <div className="detail-ladder">
            <EdgeLadder marketBps={market.marketProbabilityBps} vixyBps={market.vixyProbabilityBps}
                        edgeBps={market.edgeBps} size="lg" />
          </div>

          <div className="row g3">
            <button className={`btn btn-primary tap grow ${positive ? '' : 'btn-neg'}`}
                    onClick={() => ui.openCall(market.id, positive ? 'YES' : 'NO')}>
              <Icon name="target" size={15} />
              Call it {positive ? 'YES' : 'NO'}
            </button>
            <button className="btn tap" onClick={() => ui.openCall(market.id, 'WAIT')}>
              <Icon name="clock" size={14} />Watch
            </button>
          </div>

          <ProbabilityChart market={market.series} vixy={market.vixySeries} height={230} edgeBps={market.edgeBps}
                            windowLabel="trailing window · demo series" />

          <div className="detail-gauges">
            <Gauge valueBps={market.confidenceBps} label="Confidence" size={124} />
            <div className="col g4 grow">
              <SignalMeter label="Signal quality" valueBps={market.signalQualityBps} tone="cyan" />
              <SignalMeter label="Reversal risk" valueBps={market.reversalRiskBps} tone="warn" />
              <SignalMeter label="Cross-venue dispersion" valueBps={market.dispersionBps} tone="violet" segments={16} />
            </div>
          </div>

          <div className="detail-strip">
            <RegimeIndicator regime={market.regime} />
            <FreshnessPulse ageMs={market.health.dataAgeMs} status={market.health.status} />
            {opportunity && (
              <div className="col" style={{ gap: 0 }}>
                <span className="t-nano">Edge score</span>
                <b className="t-num" style={{ fontSize: 18 }}>{opportunity.edgeScore}</b>
              </div>
            )}
          </div>

          {/* Why VIXY thinks this. When the engine cited nothing, the screen
              says so — an explanation invented by the interface would be the
              single most dishonest thing on this page. */}
          <section className="col g3">
            <span className="t-label">Why VIXY thinks this</span>
            {opportunity && opportunity.evidence.length > 0 ? (
              <ul className="evidence lg">
                {opportunity.evidence.map((e, i) => (
                  <li key={i}><Icon name="check" size={12} /><span>{e}</span></li>
                ))}
              </ul>
            ) : (
              <div className="md-noev">
                <Icon name="alert" size={15} />
                <div className="col" style={{ gap: 2 }}>
                  <b className="t-body">Insufficient live evidence</b>
                  <span className="t-micro">
                    The engine has not cited evidence for this market in the current
                    snapshot. No explanation is shown rather than one being written here.
                  </span>
                </div>
              </div>
            )}
          </section>

          <section className="col g3">
            <span className="t-label">Venue comparison</span>
            <table className="mini-table">
              <thead>
                <tr><th>Venue</th><th>Implied</th><th>Bid / Ask</th><th>Spread</th><th>Liquidity</th><th>24h vol</th></tr>
              </thead>
              <tbody>
                {market.venueRefs.map((v) => (
                  <tr key={v.venue}>
                    <td><VenueChip venue={v.venue} /></td>
                    <td className="t-num">{pct(v.impliedBps)}</td>
                    <td className="t-num">{pct(v.bidBps, 1)} / {pct(v.askBps, 1)}</td>
                    <td className="t-num">{v.spreadBps === null ? '—' : `${(v.spreadBps / 100).toFixed(2)}%`}</td>
                    <td className="t-num">{v.liquidityUsd === null ? '—' : `$${compact(v.liquidityUsd)}`}</td>
                    <td className="t-num">{v.volume24hUsd === null ? '—' : `$${compact(v.volume24hUsd)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <span className="t-nano">
              dispersion {pct(market.dispersionBps, 2)} between venues · consensus is liquidity-weighted server-side
            </span>
          </section>

          {market.resolution && (
            <section className="col g3">
              <span className="t-label">How this settles</span>
              <div className="resolution glass-01">
                <p className="t-body">{market.resolution.statement}</p>
                <ul className="rule-list sm">
                  {market.resolution.conditions.map((c, i) => (
                    <li key={i}><Icon name="check" size={11} /><span>{c}</span></li>
                  ))}
                </ul>
                <div className="row between">
                  <span className="t-nano">source · {market.resolution.source}</span>
                  <span className="t-nano">settles {untilTime(market.resolution.settlesAt, now)} from now</span>
                </div>
              </div>
            </section>
          )}

          {market.provenance && (
            <section className="col g3">
              <span className="t-label">Provenance</span>
              <div className="provenance wide">
                <div className="row between"><span className="t-nano">model</span><b className="t-mono">{market.provenance.modelVersion}</b></div>
                <div className="row between"><span className="t-nano">feature set</span><b className="t-mono">{market.provenance.featureSetVersion}</b></div>
                <div className="row between"><span className="t-nano">computed</span><b className="t-mono">{relTime(market.provenance.computedAt, now)}</b></div>
                <div className="row between"><span className="t-nano">inputs</span><b className="t-mono">{market.provenance.inputs.join(' · ')}</b></div>
              </div>
            </section>
          )}

          {related.length > 0 && (
            <section className="col g3">
              <span className="t-label">Correlated cluster</span>
              <ul className="link-list">
                {related.map((r, i) => (
                  <li key={i} className="row between g3">
                    <button className="row g2 tap link-row" onClick={() => ui.openMarket(r.node!.id)}>
                      <b>{r.node!.symbol}</b>
                      <span className={`link-kind k-${r.kind.toLowerCase()}`}>{r.kind}</span>
                    </button>
                    <span className={`t-num ${r.strength >= 0 ? 'edge-pos' : 'edge-neg'}`}>{r.strength.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {signals.length > 0 && (
            <section className="col g3">
              <span className="t-label">Recent engine activity</span>
              <ul className="mini-signals">
                {signals.map((s) => (
                  <li key={s.id} className="row between g3">
                    <span className="t-small">{s.subject}</span>
                    <span className="t-nano">{relTime(s.ts, now)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="detail-foot">
            <span className="t-nano">
              every value on this panel is produced by the demo provider and carries origin DEMO
            </span>
          </div>
        </section>
      </aside>
    </div>
  );
}
