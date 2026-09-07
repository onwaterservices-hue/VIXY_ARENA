import React from 'react';
import type { CanonicalMarket } from '../../types';
import { Icon } from '../common/Icon';
import { VenueChip } from '../common/Primitives';
import { Sparkline } from '../holographic/Sparkline';
import { useSheen } from '../../hooks';
import {
  BroadcastTag, LiveFlag, MatchupSideBlock, VersusMark, AdvantageTag, NO_VALUE, PHASE_COPY,
} from './BroadcastPrimitives';
import { untilTime, edgeTone, signedPct } from '../../lib/format';

/* =============================================================
   MATCHUP CARD
   -------------------------------------------------------------
   A prediction event drawn as a fixture: two sides, a clock
   window, the phase it is in, and the engine's read on which way
   the advantage sits. This is not a betting slip — nothing here
   offers a stake, a payout or a price to take.

   A market with no matchup published renders the frame with "--"
   sides rather than inventing competitors.
   ============================================================= */

export function MatchupCard({ market, now, onOpen, variant = 'full', index }: {
  market: CanonicalMarket; now: number; onOpen?: (m: CanonicalMarket) => void;
  variant?: 'full' | 'fixture'; index?: number;
}) {
  const { ref, onPointerMove } = useSheen<HTMLElement>();
  const mu = market.matchup;
  const tone = edgeTone(market.edgeBps);
  const phase = market.phase;

  return (
    <article ref={ref as React.Ref<HTMLElement>} onPointerMove={onPointerMove}
             className={`mu-card glass-02 sheen lift tone-${tone} variant-${variant} phase-${phase.toLowerCase()}`}>
      <button type="button" className="mu-hit" onClick={() => onOpen?.(market)}
              aria-label={`Open ${market.title}`} />

      <header className="mu-head row between g2">
        <span className="row g2">
          <LiveFlag status={market.health.status} label={phase === 'FINAL' ? 'FINAL' : 'FEED'} compact />
          {typeof index === 'number' && <BroadcastTag>{`MATCH ${String(index + 1).padStart(3, '0')}`}</BroadcastTag>}
          {mu?.window && <BroadcastTag>{mu.window}</BroadcastTag>}
        </span>
        <span className="mu-clock t-num">{untilTime(market.closesAt, now)}</span>
      </header>

      <div className="mu-body">
        <MatchupSideBlock side={mu?.home ?? null} tone="home" align="left"
                          size={variant === 'full' ? 'md' : 'sm'} />
        <VersusMark size={variant === 'full' ? 'md' : 'sm'} />
        <MatchupSideBlock side={mu?.away ?? null} tone="away" align="right"
                          size={variant === 'full' ? 'md' : 'sm'} />
      </div>

      <div className="mu-title-row">
        <span className="mu-title t-h3">{market.title}</span>
        {market.subtitle && <span className="t-nano">{market.subtitle}</span>}
      </div>

      {variant === 'full' && (
        <div className="mu-trace">
          <Sparkline series={market.series} width={280} height={38}
                     tone={tone === 'edge' ? 'edge' : tone === 'risk' ? 'risk' : 'violet'} />
        </div>
      )}

      <footer className="mu-foot">
        <span className="mu-foot-left row g2">
          <AdvantageTag band={market.momentum?.band ?? 'NONE'}
                        side={market.momentum?.side ?? 'NEUTRAL'} compact />
          <span className={`t-num mu-edge ${(market.edgeBps ?? 0) >= 0 ? 'edge-pos' : 'edge-neg'}`}>
            {market.edgeBps == null ? NO_VALUE : signedPct(market.edgeBps)}
          </span>
        </span>
        <span className="mu-foot-right row g2">
          <span className="t-nano mu-phase">{PHASE_COPY[phase].sub}</span>
          <span className="row g1">{market.venueRefs.map((v) => <VenueChip key={v.venue} venue={v.venue} />)}</span>
          <Icon name="chevronR" size={13} />
        </span>
      </footer>
    </article>
  );
}
