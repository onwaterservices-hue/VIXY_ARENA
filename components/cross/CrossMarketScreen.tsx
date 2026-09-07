import React, { useMemo, useState } from 'react';
import type { ArenaSnapshot, NeuralEdge } from '../../types';
import { HoloPanel } from '../holographic/HoloPanel';
import { NeuralMap } from '../neural/NeuralMap';
import { SectionHeader, Empty, StatTile, CategoryChip, OriginBadge } from '../common/Primitives';
import { Icon, type IconName } from '../common/Icon';
import { useArenaUI } from '../common/ui-context';
import { sectorOf } from '../../lib/categories';
import { pct, signedPct } from '../../lib/format';

/* =============================================================
   CROSS-MARKET INTELLIGENCE
   -------------------------------------------------------------
   The thing a single-market terminal cannot do.

   Any product can tell you what one market is priced at. VIXY is
   watching every category at once, which means it can see when
   two markets in DIFFERENT worlds are moving on the same thing —
   an economic print and a crypto contract, a weather advisory and
   a game, a policy vote and an index.

   Every relationship on this screen is an edge the ENGINE
   published on its own graph, with the engine's own kind and
   strength. The screen groups them, names them in plain English
   and puts both markets' numbers side by side. It detects
   nothing itself: a correlation invented by an interface would
   be the most confident-sounding lie in the product.
   ============================================================= */

const KIND_COPY: Record<NeuralEdge['kind'], { label: string; icon: IconName; detail: string }> = {
  CORRELATION: { label: 'Correlation', icon: 'neural',
    detail: 'these two have moved together over the trailing window' },
  MOMENTUM:    { label: 'Momentum lead', icon: 'arrowUp',
    detail: 'one has been moving first, the other following' },
  LIQUIDITY:   { label: 'Shared liquidity', icon: 'layers',
    detail: 'book depth on both has shifted at the same time' },
  INFLUENCE:   { label: 'Influence', icon: 'spark',
    detail: 'the engine models one as an input to the other' },
};

type Filter = 'ALL' | 'CROSS' | 'WITHIN';

export function CrossMarketScreen({ snapshot, origin, sourceLabel, onNavigate }: {
  snapshot: ArenaSnapshot;
  origin: 'DEMO' | 'LIVE';
  sourceLabel: string;
  onNavigate: (id: string) => void;
}) {
  const ui = useArenaUI();
  const [filter, setFilter] = useState<Filter>('CROSS');
  const [focus, setFocus] = useState<string | null>(null);

  const nodeById = useMemo(
    () => new Map(snapshot.graph.nodes.map((n) => [n.id, n])),
    [snapshot.graph.nodes],
  );

  /* An edge is "cross-sector" when its two ends sit in different sectors —
     the engine's own categories decide that, not this screen. */
  const links = useMemo(() => {
    return snapshot.graph.edges
      .map((e) => {
        const a = nodeById.get(e.from);
        const b = nodeById.get(e.to);
        if (!a || !b) return null;
        const sa = sectorOf(a.category);
        const sb = sectorOf(b.category);
        const cross = sa?.key !== sb?.key;
        return { e, a, b, sa, sb, cross };
      })
      .filter(Boolean)
      .filter((l) => (filter === 'ALL' ? true : filter === 'CROSS' ? l!.cross : !l!.cross))
      .sort((x, y) => Math.abs(y!.e.strength) - Math.abs(x!.e.strength)) as NonNullable<
        ReturnType<typeof Array.prototype.map>[number]
      >[];
  }, [snapshot.graph.edges, nodeById, filter]);

  const crossCount = snapshot.graph.edges.filter((e) => {
    const a = nodeById.get(e.from); const b = nodeById.get(e.to);
    if (!a || !b) return false;
    return sectorOf(a.category)?.key !== sectorOf(b.category)?.key;
  }).length;

  const marketOf = (id: string) => snapshot.markets.find((m) => m.id === id) ?? null;

  return (
    <div className="screen col g5 xm">
      <SectionHeader
        eyebrow="What one market cannot tell you"
        title="Cross-market intelligence"
        action={
          <div className="row g3">
            <OriginBadge origin={origin} label={sourceLabel} />
            <button className="btn btn-sm tap" onClick={() => onNavigate('neural')}>
              <Icon name="neural" size={13} />Full map
            </button>
          </div>
        } />

      <p className="sc-blurb t-small">
        Any terminal can price one market. VIXY watches every category at once, so it can see
        when two markets in different worlds move on the same thing. Every relationship below is
        an edge the engine published on its own graph — the screen groups and names them, and
        detects nothing itself.
      </p>

      <div className="stat-row">
        <StatTile label="Modeled relationships" value={snapshot.graph.edges.length}
                  sub="on the engine graph" icon="neural" tone="violet" />
        <StatTile label="Cross-sector" value={crossCount}
                  sub="two different worlds" icon="layers" tone="cyan" />
        <StatTile label="Nodes" value={snapshot.graph.nodes.length}
                  sub="markets in the graph" icon="markets" />
        <StatTile label="Graph freshness"
                  value={`${Math.round(snapshot.graph.health.dataAgeMs / 1000)}s`}
                  sub={snapshot.graph.health.status.toLowerCase()} icon="refresh"
                  tone={snapshot.graph.health.status === 'LIVE' ? 'edge' : 'warn'} />
      </div>

      <div className="split-2">
        <HoloPanel grade={2} eyebrow="Modeled market relationships" title="Neural map" padded={false}>
          <NeuralMap graph={snapshot.graph} height={380}
                     selectedId={focus} onSelect={(n) => setFocus(n.id)} />
        </HoloPanel>

        <HoloPanel grade={2} eyebrow="Why this matters" title="The differentiator">
          <ul className="rule-list">
            <li><Icon name="neural" size={13} />
              <span>A weather advisory and a game can be the same trade. Only a terminal watching both can say so.</span></li>
            <li><Icon name="signals" size={13} />
              <span>An economic print moves crypto, indices and policy markets on one catalyst.</span></li>
            <li><Icon name="brain" size={13} />
              <span>Relationships are the engine’s, with its own kind and strength — never inferred here.</span></li>
            <li><Icon name="alert" size={13} />
              <span>A correlation is not causation, and a modeled link is not a promise about either market.</span></li>
          </ul>
        </HoloPanel>
      </div>

      <div className="filters glass-01">
        <div className="chipset vx-scroll-x">
          {([
            ['CROSS', 'Cross-sector'],
            ['WITHIN', 'Within a sector'],
            ['ALL', 'Every relationship'],
          ] as const).map(([k, label]) => (
            <button key={k} className={`fchip tap ${filter === k ? 'is-active' : ''}`}
                    onClick={() => setFilter(k)}>
              {label.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {links.length === 0 ? (
        <HoloPanel grade={1}>
          <Empty title="No relationships in this view"
                 detail="The engine has published no edges matching this filter. Nothing is inferred to fill the gap." />
        </HoloPanel>
      ) : (
        <ul className="xm-list">
          {links.slice(0, 14).map((l) => {
            const k = KIND_COPY[l.e.kind];
            const ma = marketOf(l.a.id);
            const mb = marketOf(l.b.id);
            return (
              <li key={`${l.e.from}-${l.e.to}-${l.e.kind}`}
                  className={`xm-row ${l.cross ? 'is-cross' : ''}`}>
                <span className="xm-kind">
                  <Icon name={k.icon} size={14} />
                  <b>{k.label}</b>
                  {l.cross && <span className="xm-cross">cross-sector</span>}
                </span>

                <button className="xm-side tap" onClick={() => ui.openMarket(l.a.id)}>
                  <CategoryChip category={l.a.category} />
                  <b className="xm-side-title">{ma?.title ?? l.a.label}</b>
                  <span className="xm-side-nums">
                    <span className="t-num">{pct(ma?.marketProbabilityBps ?? null)}</span>
                    <span className={`t-num ${(ma?.edgeBps ?? 0) >= 0 ? 'edge-pos' : 'edge-neg'}`}>
                      {signedPct(ma?.edgeBps ?? null)}
                    </span>
                  </span>
                </button>

                <span className={`xm-link ${l.e.strength >= 0 ? 'pos' : 'neg'}`}>
                  <i style={{ opacity: Math.min(1, 0.25 + Math.abs(l.e.strength)) }} />
                  <b className="t-num">{l.e.strength >= 0 ? '+' : '−'}{Math.abs(l.e.strength).toFixed(2)}</b>
                  <span className="t-nano">{l.e.strength >= 0 ? 'together' : 'opposed'}</span>
                </span>

                <button className="xm-side tap" onClick={() => ui.openMarket(l.b.id)}>
                  <CategoryChip category={l.b.category} />
                  <b className="xm-side-title">{mb?.title ?? l.b.label}</b>
                  <span className="xm-side-nums">
                    <span className="t-num">{pct(mb?.marketProbabilityBps ?? null)}</span>
                    <span className={`t-num ${(mb?.edgeBps ?? 0) >= 0 ? 'edge-pos' : 'edge-neg'}`}>
                      {signedPct(mb?.edgeBps ?? null)}
                    </span>
                  </span>
                </button>

                <span className="xm-detail t-nano">{k.detail}</span>
              </li>
            );
          })}
        </ul>
      )}

      <p className="lb-note">
        <Icon name="alert" size={13} />
        A modeled relationship describes how two markets have behaved, not why. Correlation is
        not causation, and a link the engine detected is not a claim about either outcome.
      </p>
    </div>
  );
}
