import React from 'react';
import type { CanonicalMarket } from '../../types';
import { Sparkline } from '../holographic/Sparkline';
import { EdgeLadder } from '../holographic/Meters';
import { StatusPill, VenueChip, CategoryChip } from '../common/Primitives';
import { useSheen } from '../../hooks';
import { usePrefs } from '../common/prefs-context';
import { Icon } from '../common/Icon';
import { pct, signedPct, untilTime, edgeTone } from '../../lib/format';

export function MarketCard({
  market, now, onSelect, selected = false, variant = 'grid',
  picking = false, pickIndex = -1,
}: {
  market: CanonicalMarket; now: number; onSelect?: (m: CanonicalMarket) => void;
  selected?: boolean; variant?: 'grid' | 'row';
  /* Selection mode for the compare board: the card keeps its shape and
     gains an ordinal badge, so the picked order is the column order. */
  picking?: boolean; pickIndex?: number;
}) {
  const { ref, onPointerMove } = useSheen<HTMLElement>();
  const { prefs, setPref } = usePrefs();
  const watched = prefs.watchlist.includes(market.id);
  const tone = edgeTone(market.edgeBps);

  const toggleWatch = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPref('watchlist', watched
      ? prefs.watchlist.filter((id) => id !== market.id)
      : [...prefs.watchlist, market.id]);
  };

  if (variant === 'row') {
    return (
      <button ref={ref} onPointerMove={onPointerMove} onClick={() => onSelect?.(market)}
              aria-pressed={picking ? pickIndex >= 0 : undefined}
              className={`mrow glass-01 sheen tap ${selected ? 'is-selected' : ''} ${pickIndex >= 0 ? 'is-picked' : ''}`}>
        {picking && (
          <span className={`pick-badge ${pickIndex >= 0 ? 'is-on' : ''}`} aria-hidden="true">
            {pickIndex >= 0 ? pickIndex + 1 : ''}
          </span>
        )}
        <span className="mrow-sym">{market.symbol}</span>
        <span className="mrow-title">
          <span className="t-h3">{market.title}</span>
          <span className="t-nano">{market.subtitle}</span>
        </span>
        <Sparkline series={market.series.slice(-30)} width={92} height={26} tone={tone === 'edge' ? 'edge' : tone === 'risk' ? 'risk' : 'violet'} />
        <span className="mrow-num col">
          <span className="t-label">Market</span>
          <b className="t-num">{pct(market.marketProbabilityBps)}</b>
        </span>
        <span className="mrow-num col">
          <span className="t-label">VIXY</span>
          <b className="t-num vixy">{pct(market.vixyProbabilityBps)}</b>
        </span>
        <span className={`edge-tag ${(market.edgeBps ?? 0) >= 0 ? 'pos' : 'neg'}`}>{signedPct(market.edgeBps)}</span>
        <span className="mrow-close t-nano">{untilTime(market.closesAt, now)}</span>
        <StatusPill status={market.health.status} compact />
      </button>
    );
  }

  /* The card is a region, not a control: it holds two independent actions
     (open the market, toggle the watchlist) and nesting one button inside
     another is invalid markup that screen readers cannot resolve. The whole
     surface stays clickable through a single overlay button. */
  return (
    <article ref={ref as React.Ref<HTMLElement>} onPointerMove={onPointerMove}
             className={`mcard glass-02 sheen lift tap tone-${tone} ${selected ? 'is-selected' : ''} ${pickIndex >= 0 ? 'is-picked' : ''}`}>
      <button type="button" className="mcard-hit" onClick={() => onSelect?.(market)}
              aria-pressed={picking ? pickIndex >= 0 : undefined}
              aria-label={picking
                ? `${pickIndex >= 0 ? 'Remove from' : 'Add to'} comparison: ${market.title}`
                : `Open ${market.title}`} />
      <span className="mcard-accent" aria-hidden="true" />
      {picking && (
        <span className={`pick-badge ${pickIndex >= 0 ? 'is-on' : ''}`} aria-hidden="true">
          {pickIndex >= 0 ? pickIndex + 1 : ''}
        </span>
      )}
      <span className="mcard-head row between g2">
        <span className="row g2">
          <span className="mcard-sym">{market.symbol}</span>
          <CategoryChip category={market.category} />
        </span>
        <span className="row g2">
          <StatusPill status={market.health.status} compact />
          <button type="button" className={`watch-star tap ${watched ? 'is-on' : ''}`}
                  onClick={toggleWatch} aria-pressed={watched}
                  aria-label={watched ? `Remove ${market.symbol} from watchlist` : `Add ${market.symbol} to watchlist`}>
            <Icon name="spark" size={13} />
          </button>
        </span>
      </span>

      <span className="mcard-title t-h3">{market.title}</span>
      <span className="mcard-sub t-nano">{market.subtitle}</span>

      <span className="mcard-chart">
        <Sparkline series={market.series} width={260} height={46}
                   tone={tone === 'edge' ? 'edge' : tone === 'risk' ? 'risk' : 'violet'} />
      </span>

      <EdgeLadder marketBps={market.marketProbabilityBps} vixyBps={market.vixyProbabilityBps}
                  edgeBps={market.edgeBps} size="sm" showScale={false} />

      <span className="mcard-nums row between">
        <span className="col"><span className="t-label">Market</span><b className="t-num">{pct(market.marketProbabilityBps)}</b></span>
        <span className="col" style={{ alignItems: 'center' }}>
          <span className="t-label">Edge</span>
          <b className={`t-num ${(market.edgeBps ?? 0) >= 0 ? 'edge-pos' : 'edge-neg'}`}>{signedPct(market.edgeBps)}</b>
        </span>
        <span className="col" style={{ alignItems: 'flex-end' }}>
          <span className="t-label">VIXY</span><b className="t-num vixy">{pct(market.vixyProbabilityBps)}</b>
        </span>
      </span>

      <span className="mcard-foot row between">
        <span className="row g1">{market.venueRefs.map((v) => <VenueChip key={v.venue} venue={v.venue} />)}</span>
        <span className="t-nano">closes {untilTime(market.closesAt, now)}</span>
      </span>
    </article>
  );
}
