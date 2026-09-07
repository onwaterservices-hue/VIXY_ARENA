import React from 'react';
import type { Bps, FeedStatus, Regime } from '../../types';
import { pct, ratio, signedPct } from '../../lib/format';

/* =============================================================
   EDGE LADDER — the product's core object, drawn once.
   MARKET PROBABILITY → VIXY PROBABILITY → EDGE
   Both markers are server values. The band between them is the
   edge; it is measured, never styled into existence.
   ============================================================= */
export function EdgeLadder({
  marketBps, vixyBps, edgeBps, size = 'lg', showScale = true,
}: {
  marketBps: Bps | null; vixyBps: Bps | null; edgeBps: Bps | null;
  size?: 'sm' | 'lg'; showScale?: boolean;
}) {
  const m = ratio(marketBps) * 100;
  const v = ratio(vixyBps) * 100;
  const lo = Math.min(m, v), hi = Math.max(m, v);
  const positive = (edgeBps ?? 0) >= 0;
  const known = marketBps !== null && vixyBps !== null;

  return (
    <div className={`ladder ladder-${size}`}>
      {size === 'lg' && (
        <div className="ladder-legend row between">
          <div className="col">
            <span className="t-label">Market probability</span>
            <span className="ladder-num t-num market">{pct(marketBps)}</span>
          </div>
          <div className="col" style={{ alignItems: 'center' }}>
            <span className="t-label">Edge</span>
            <span className={`ladder-num t-num ${positive ? 'edge-pos' : 'edge-neg'}`}>{signedPct(edgeBps)}</span>
          </div>
          <div className="col" style={{ alignItems: 'flex-end' }}>
            <span className="t-label">VIXY probability</span>
            <span className="ladder-num t-num vixy">{pct(vixyBps)}</span>
          </div>
        </div>
      )}

      <div className="ladder-track" role="img"
           aria-label={`Market ${pct(marketBps)}, VIXY ${pct(vixyBps)}, edge ${signedPct(edgeBps)}`}>
        <div className="ladder-rail" />
        {showScale && (
          <div className="ladder-ticks">
            {Array.from({ length: 11 }, (_, i) => (
              <i key={i} className={i % 5 === 0 ? 'major' : ''} style={{ left: `${i * 10}%` }} />
            ))}
          </div>
        )}
        {known && (
          <div className={`ladder-band ${positive ? 'pos' : 'neg'}`}
               style={{ left: `${lo}%`, width: `${Math.max(0.4, hi - lo)}%` }} />
        )}
        {known && <span className="ladder-mark market" style={{ left: `${m}%` }} />}
        {known && <span className="ladder-mark vixy" style={{ left: `${v}%` }} />}
      </div>

      {showScale && (
        <div className="ladder-scale row between t-nano">
          <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
        </div>
      )}
    </div>
  );
}

/* ---- segmented signal strength ----------------------------- */
export function SignalMeter({
  valueBps, segments = 22, tone = 'violet', label,
}: {
  valueBps: Bps | null; segments?: number; tone?: 'violet' | 'cyan' | 'edge' | 'warn'; label?: string;
}) {
  /* The exact position is kept: whole segments light fully and the one
     the value lands inside carries the remainder as opacity, so a value
     smaller than one segment still reads as present without being
     rounded up to a full segment it has not earned. */
  const exact = ratio(valueBps) * segments;
  const filled = Math.floor(exact);
  const partial = exact - filled;
  return (
    <div className="col g2" style={{ minWidth: 0 }}>
      {label && (
        <div className="row between">
          <span className="t-label">{label}</span>
          <span className="t-num" style={{ fontSize: 'var(--t-small)' }}>{pct(valueBps, 0)}</span>
        </div>
      )}
      <div className={`segbar tone-${tone}`} aria-hidden="true">
        {Array.from({ length: segments }, (_, i) => (
          <i key={i}
             className={i < filled ? 'on' : i === filled && partial > 0.04 ? 'on is-partial' : ''}
             style={{ ['--i' as string]: i, ['--part' as string]: i === filled ? partial : 1 }} />
        ))}
      </div>
    </div>
  );
}

/* ---- data freshness ---------------------------------------- */
const FRESHNESS_BY_STATUS: Record<FeedStatus, 'fresh' | 'aging' | 'stale'> = {
  LIVE: 'fresh', DEGRADED: 'aging', RECONNECTING: 'aging',
  STALE: 'stale', OFFLINE: 'stale', UNKNOWN: 'stale',
};

export function FreshnessPulse({ ageMs, status }: { ageMs: number; status: FeedStatus }) {
  /* The age is displayed; the judgement about it is not made here. Which
     ages count as fresh is a freshness budget the health service owns, and
     a client that invented its own thresholds would eventually disagree
     with the status badge sitting next to it. */
  const health = FRESHNESS_BY_STATUS[status] ?? 'stale';
  return (
    <div className="fresh row g2" data-health={health} title={`Source data age ${ageMs} ms · ${status}`}>
      <span className="fresh-ring"><i /></span>
      <div className="col" style={{ gap: 0 }}>
        <span className="t-num" style={{ fontSize: 'var(--t-small)' }}>{(ageMs / 1000).toFixed(1)}s</span>
        <span className="t-nano">data age</span>
      </div>
    </div>
  );
}

/* ---- market regime ----------------------------------------- */
const REGIME_GLYPH: Record<Regime, number[]> = {
  TRENDING: [6, 9, 12, 14, 18, 21, 26],
  RANGING: [14, 10, 16, 11, 15, 12, 14],
  VOLATILE: [6, 22, 9, 26, 8, 24, 11],
  ILLIQUID: [10, 10, 11, 9, 10, 10, 9],
  UNKNOWN: [12, 12, 12, 12, 12, 12, 12],
};

export function RegimeIndicator({ regime }: { regime: Regime }) {
  const bars = REGIME_GLYPH[regime] ?? REGIME_GLYPH.UNKNOWN;
  return (
    <div className="regime row g3" data-regime={regime}>
      <span className="regime-glyph" aria-hidden="true">
        {bars.map((h, i) => <i key={i} style={{ height: h }} />)}
      </span>
      <div className="col" style={{ gap: 0 }}>
        <span className="t-nano">Market regime</span>
        <span className="regime-name">{regime}</span>
      </div>
    </div>
  );
}
