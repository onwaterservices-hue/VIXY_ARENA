import React, { useMemo } from 'react';
import type { ArenaSnapshot, CanonicalMarket } from '../../types';
import { Icon } from '../common/Icon';
import { StatusPill, VenueChip, CategoryChip, OriginBadge } from '../common/Primitives';
import { ProbabilityChart } from '../holographic/ProbabilityChart';
import { EdgeLadder, RegimeIndicator } from '../holographic/Meters';
import { useFocusTrap, useMedia } from '../../hooks';
import { useArenaUI } from '../common/ui-context';
import { pct, signedPct, untilTime, edgeTone } from '../../lib/format';

/* =============================================================
   COMPARE BOARD
   -------------------------------------------------------------
   Two to four canonical markets on one shared frame. Every number
   is read straight off the snapshot — the board sorts and lays out,
   it never recomputes a probability or an edge. The one derived
   figure on screen is the SPREAD between the widest and narrowest
   edge in the selection, and it is labelled as a selection statistic
   rather than a market value.
   ============================================================= */

const ROWS: { key: string; label: string; hint: string }[] = [
  { key: 'market',     label: 'Market probability', hint: 'venue consensus as published' },
  { key: 'vixy',       label: 'VIXY probability',   hint: 'model output for the same question' },
  { key: 'edge',       label: 'Edge',               hint: 'VIXY minus market, in the same units' },
  { key: 'ladder',     label: 'Where they sit',     hint: 'both probabilities on one 0-100 rail' },
  { key: 'confidence', label: 'Confidence',         hint: 'how firmly the model holds this number' },
  { key: 'signal',     label: 'Signal quality',     hint: 'strength of the inputs behind it' },
  { key: 'reversal',   label: 'Reversal risk',      hint: 'chance the current read flips' },
  { key: 'dispersion', label: 'Cross-venue spread', hint: 'disagreement between venues' },
  { key: 'closes',     label: 'Closes in',          hint: 'time left before the market stops trading' },
  { key: 'state',      label: 'Market state',       hint: 'lifecycle stage of the question' },
  { key: 'feed',       label: 'Feed',               hint: 'how fresh the underlying data is' },
];

export function CompareBoard({ snapshot, ids, now, onClose }: {
  snapshot: ArenaSnapshot; ids: string[]; now: number; onClose: () => void;
}) {
  const trapRef = useFocusTrap<HTMLDivElement>();
  const narrow = useMedia('(max-width: 900px)');
  const ui = useArenaUI();

  const markets = useMemo(
    () => ids.map((id) => snapshot.markets.find((m) => m.id === id)).filter(Boolean) as CanonicalMarket[],
    [ids, snapshot.markets],
  );

  /* One shared vertical scale, so two charts side by side can be read
     against each other instead of each against its own axis. */
  const domain = useMemo(() => {
    const all = markets.flatMap((m) => [...m.series, ...m.vixySeries]);
    if (!all.length) return undefined;
    const lo = Math.min(...all), hi = Math.max(...all);
    const pad = Math.max(120, Math.round((hi - lo) * 0.12));
    return { min: Math.max(0, lo - pad), max: Math.min(10000, hi + pad) };
  }, [markets]);

  /* A market whose edge the engine has not computed is excluded rather
     than counted as zero — absent is not the same statement as flat. */
  const edges = markets.map((m) => m.edgeBps).filter((e): e is number => e != null);
  const spreadBps = edges.length > 1 ? Math.max(...edges) - Math.min(...edges) : 0;

  /* The board does not rank. The best-placed market in the selection is
     the one the engine already ranked highest; if none of them is ranked,
     the tile says so instead of inventing an order. */
  const ranked = snapshot.opportunities
    .filter((o) => markets.some((m) => m.id === o.marketId))
    .sort((a, b) => a.rank - b.rank)[0];
  const strongest = ranked ? markets.find((m) => m.id === ranked.marketId) : undefined;

  if (!markets.length) return null;

  const cell = (m: CanonicalMarket, key: string): React.ReactNode => {
    switch (key) {
      case 'market':     return <b className="t-num cmp-num">{pct(m.marketProbabilityBps)}</b>;
      case 'vixy':       return <b className="t-num cmp-num vixy">{pct(m.vixyProbabilityBps)}</b>;
      case 'edge':       return (
        <b className={`t-num cmp-num ${(m.edgeBps ?? 0) >= 0 ? 'edge-pos' : 'edge-neg'}`}>{signedPct(m.edgeBps)}</b>
      );
      case 'confidence': return <span className="t-num">{pct(m.confidenceBps)}</span>;
      case 'signal':     return <span className="t-num">{pct(m.signalQualityBps)}</span>;
      case 'reversal':   return <span className="t-num">{pct(m.reversalRiskBps)}</span>;
      case 'dispersion': return <span className="t-num">{pct(m.dispersionBps)}</span>;
      case 'closes':     return <span className="t-num">{untilTime(m.closesAt, now)}</span>;
      case 'state':      return <span className="t-mono t-small">{m.state}</span>;
      case 'ladder':     return (
        <div className="cmp-ladder">
          <EdgeLadder marketBps={m.marketProbabilityBps} vixyBps={m.vixyProbabilityBps}
                      edgeBps={m.edgeBps} size="sm" />
        </div>
      );
      case 'feed':       return <StatusPill status={m.health.status} />;
      default:           return null;
    }
  };

  return (
    <div className="cmp-scrim" ref={trapRef} role="dialog" aria-modal="true" aria-label="Compare markets">
      <div className="cmp glass-03 brackets">
        <i className="bk bk-tl" /><i className="bk bk-tr" /><i className="bk bk-bl" /><i className="bk bk-br" />

        <header className="cmp-head">
          <div className="col" style={{ gap: 2, minWidth: 0 }}>
            <span className="t-label">Side by side</span>
            <h2 className="t-h2">Comparing {markets.length} markets</h2>
          </div>
          <div className="row g2">
            <OriginBadge origin={snapshot.health.origin} label={snapshot.health.origin === 'DEMO' ? 'the demo provider' : 'the engine'} />
            <button className="icon-btn tap" onClick={onClose} aria-label="Close compare">
              <Icon name="close" size={15} />
            </button>
          </div>
        </header>

        <div className="cmp-summary">
          <div className="cmp-stat">
            <span className="t-label">Highest ranked in selection</span>
            <b className="t-h3">{strongest?.symbol ?? '—'}</b>
            <span className="t-nano">
              {ranked ? `engine rank ${ranked.rank} · score ${ranked.edgeScore}` : 'none of these is ranked'}
            </span>
          </div>
          <div className="cmp-stat">
            <span className="t-label">Edge spread across selection</span>
            <b className="t-h3 t-num">{edges.length > 1 ? pct(spreadBps) : '—'}</b>
            <span className="t-nano">selection statistic, not a market value</span>
          </div>
          <div className="cmp-stat">
            <span className="t-label">Feeds</span>
            <b className="t-h3 t-num">
              {markets.filter((m) => m.health.status === 'LIVE').length}/{markets.length}
            </b>
            <span className="t-nano">reporting LIVE right now</span>
          </div>
        </div>

        <div className="cmp-scroll">
          <div className="cmp-grid" style={{ '--cmp-cols': markets.length } as React.CSSProperties}>
            <div className="cmp-col cmp-col-labels">
              <div className="cmp-card-head cmp-spacer" aria-hidden="true" />
              {ROWS.map((r) => (
                <div key={r.key} className="cmp-rowlabel">
                  <span className="t-label">{r.label}</span>
                  <span className="t-nano">{r.hint}</span>
                </div>
              ))}
              <div className="cmp-rowlabel">
                <span className="t-label">Trailing series</span>
                <span className="t-nano">shared vertical scale across all columns</span>
              </div>
              <div className="cmp-rowlabel">
                <span className="t-label">Evidence</span>
                <span className="t-nano">what the model says it is reading</span>
              </div>
            </div>

            {markets.map((m) => {
              const opportunity = snapshot.opportunities.find((o) => o.marketId === m.id);
              const tone = edgeTone(m.edgeBps);
              return (
                <div key={m.id} className={`cmp-col tone-${tone}`}>
                  <div className="cmp-card-head">
                    <div className="row g2 wrap">
                      <span className="cmp-sym t-mono">{m.symbol}</span>
                      <CategoryChip category={m.category} />
                    </div>
                    <button className="cmp-title tap" onClick={() => { onClose(); ui.openMarket(m.id); }}>
                      {m.title}
                    </button>
                    <div className="row g1 wrap">
                      {m.venueRefs.map((v) => <VenueChip key={v.venue} venue={v.venue} />)}
                    </div>
                  </div>

                  {ROWS.map((r) => (
                    <div key={r.key} className="cmp-cell">
                      {narrow && <span className="cmp-cell-label t-label">{r.label}</span>}
                      {cell(m, r.key)}
                    </div>
                  ))}

                  <div className="cmp-cell cmp-cell-chart">
                    {narrow && <span className="cmp-cell-label t-label">Trailing series</span>}
                    <ProbabilityChart market={m.series} vixy={m.vixySeries} height={150} edgeBps={m.edgeBps}
                                      domain={domain} windowLabel="trailing window" showLegend={false} />
                  </div>

                  <div className="cmp-cell cmp-cell-evidence">
                    {narrow && <span className="cmp-cell-label t-label">Evidence</span>}
                    {opportunity ? (
                      <ul className="cmp-evidence">
                        {opportunity.evidence.slice(0, 3).map((e, i) => (
                          <li key={i}><Icon name="check" size={12} /><span>{e}</span></li>
                        ))}
                      </ul>
                    ) : (
                      <span className="t-nano">not currently ranked as an opportunity</span>
                    )}
                    <div className="cmp-regime"><RegimeIndicator regime={m.regime} /></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <footer className="cmp-foot row between">
          <span className="t-nano">
            every figure is the snapshot value for that market · nothing here is recomputed on the client
          </span>
          <span className="t-nano">{snapshot.brain.modelVersion}</span>
        </footer>
      </div>
    </div>
  );
}
