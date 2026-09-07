import React, { useState } from 'react';
import type { Bps } from '../../types';
import { useElementSize } from '../../hooks';
import { pct, signedPct } from '../../lib/format';

/* =============================================================
   PROBABILITY CHART
   -------------------------------------------------------------
   Market probability against VIXY probability, with the edge
   drawn as the area between them. Sharp geometry only: straight
   segments between observations, no smoothing of data-bearing
   shapes, no interpolation the data does not support.
   ============================================================= */

interface Props {
  market: number[];
  vixy: number[];
  height?: number;
  windowLabel?: string;
  showLegend?: boolean;
  /* The server's edge for this market. Supplied so the legend and the
     tooltip show the same number the rest of the product shows, rather
     than a difference this component subtracted for itself. */
  edgeBps?: Bps | null;
  /* An explicit vertical window, in bps. Supplied when several charts
     have to be read against each other rather than each on its own
     axis; omitted, the chart fits its own series. */
  domain?: { min: number; max: number };
}

const PAD = { top: 16, right: 58, bottom: 24, left: 46 };

export function ProbabilityChart({
  market, vixy, height = 260, windowLabel = 'trailing window', showLegend = true, domain, edgeBps,
}: Props) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const w = Math.max(280, size.width);
  const h = height;

  const n = Math.min(market.length, vixy.length);
  if (n < 2) return <div ref={ref} style={{ height, width: "100%" }} className="skel" />;

  const all = [...market.slice(-n), ...vixy.slice(-n)];
  const rawMin = Math.min(...all);
  const rawMax = Math.max(...all);
  const pad = Math.max(220, (rawMax - rawMin) * 0.22);
  const lo = domain ? domain.min : Math.max(0, rawMin - pad);
  const hi = domain ? domain.max : Math.min(10000, rawMax + pad);
  const span = Math.max(1, hi - lo);

  const plotW = w - PAD.left - PAD.right;
  const plotH = h - PAD.top - PAD.bottom;
  const X = (i: number) => PAD.left + (i / (n - 1)) * plotW;
  const Y = (v: number) => PAD.top + (1 - (v - lo) / span) * plotH;

  const mPts = market.slice(-n).map((v, i) => [X(i), Y(v)] as const);
  const vPts = vixy.slice(-n).map((v, i) => [X(i), Y(v)] as const);
  const line = (pts: readonly (readonly [number, number])[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const band = `${line(mPts)}L${vPts[vPts.length - 1][0].toFixed(1)},${vPts[vPts.length - 1][1].toFixed(1)}${vPts
    .slice()
    .reverse()
    .map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join('')}Z`;

  const ticks = 4;
  const gridVals = Array.from({ length: ticks + 1 }, (_, i) => lo + (span * i) / ticks);

  const lastM = market[market.length - 1];
  const lastV = vixy[vixy.length - 1];
  const positive = lastV >= lastM;

  const idx = hover === null ? null : Math.max(0, Math.min(n - 1, Math.round(((hover - PAD.left) / plotW) * (n - 1))));
  const hm = idx === null ? null : market.slice(-n)[idx];
  const hv = idx === null ? null : vixy.slice(-n)[idx];

  return (
    <div ref={ref} className="pchart">
      <svg
        width={w} height={h} role="img"
        aria-label={`Market probability ${pct(lastM as Bps)}, VIXY probability ${pct(lastV as Bps)}`}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          setHover(e.clientX - r.left);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="pc-band-pos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--vx-edge)" stopOpacity="0.26" />
            <stop offset="100%" stopColor="var(--vx-edge)" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="pc-band-neg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--vx-risk)" stopOpacity="0.24" />
            <stop offset="100%" stopColor="var(--vx-risk)" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* gridlines */}
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={w - PAD.right} y1={Y(v)} y2={Y(v)}
                  stroke="var(--vx-hair)" strokeWidth="1" shapeRendering="crispEdges" />
            <text x={PAD.left - 8} y={Y(v) + 3} textAnchor="end" className="pc-axis">
              {(v / 100).toFixed(0)}%
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={h - PAD.bottom}
              stroke="var(--vx-hair-str)" strokeWidth="1" shapeRendering="crispEdges" />

        {/* edge band */}
        <path d={band} fill={`url(#pc-band-${positive ? 'pos' : 'neg'})`} />

        {/* series */}
        <path d={line(mPts)} fill="none" stroke="var(--vx-t1)" strokeWidth="1.5"
              strokeLinejoin="round" strokeLinecap="round" />
        <path d={line(vPts)} fill="none" stroke="var(--vx-violet-hi)" strokeWidth="1.8"
              strokeLinejoin="round" strokeLinecap="round" />

        {/* right-edge readouts */}
        <g>
          <circle cx={mPts[n - 1][0]} cy={mPts[n - 1][1]} r="3" fill="var(--vx-t1)" />
          <text x={mPts[n - 1][0] + 8} y={mPts[n - 1][1] + 3} className="pc-tag pc-tag-market">
            {pct(lastM as Bps)}
          </text>
          <circle cx={vPts[n - 1][0]} cy={vPts[n - 1][1]} r="3.4" fill="var(--vx-violet-hi)" />
          <text x={vPts[n - 1][0] + 8} y={vPts[n - 1][1] + 3} className="pc-tag pc-tag-vixy">
            {pct(lastV as Bps)}
          </text>
        </g>

        {/* crosshair */}
        {idx !== null && hm !== undefined && hv !== undefined && hm !== null && hv !== null && (
          <g className="pc-cross">
            <line x1={X(idx)} x2={X(idx)} y1={PAD.top} y2={h - PAD.bottom}
                  stroke="var(--vx-hair-hot)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={X(idx)} cy={Y(hm)} r="3.2" fill="var(--vx-t1)" />
            <circle cx={X(idx)} cy={Y(hv)} r="3.6" fill="var(--vx-violet-hi)" />
          </g>
        )}

        <text x={PAD.left} y={h - 6} className="pc-axis">oldest</text>
        <text x={(PAD.left + w - PAD.right) / 2} y={h - 6} textAnchor="middle" className="pc-axis">
          {windowLabel}
        </text>
        <text x={w - PAD.right} y={h - 6} textAnchor="end" className="pc-axis">now</text>
      </svg>

      {idx !== null && hm != null && hv != null && (
        <div className="pc-tip glass-03" style={{ left: Math.min(Math.max(X(idx) + 12, 8), Math.max(8, w - 190)) }}>
          <div className="row between g4"><span className="t-label">Market</span><b className="t-num">{pct(hm)}</b></div>
          <div className="row between g4"><span className="t-label">VIXY</span><b className="t-num vixy">{pct(hv)}</b></div>
          {edgeBps != null && idx === n - 1 && (
            <div className="row between g4">
              <span className="t-label">Edge</span>
              <b className={`t-num ${edgeBps >= 0 ? 'edge-pos' : 'edge-neg'}`}>{signedPct(edgeBps)}</b>
            </div>
          )}
        </div>
      )}

      {showLegend && (
        <div className="pc-legend row g4">
          <span className="pc-key pc-key-market">Market probability</span>
          <span className="pc-key pc-key-vixy">VIXY probability</span>
          {edgeBps != null && (
            <span className={`pc-key ${edgeBps >= 0 ? 'pc-key-pos' : 'pc-key-neg'}`}>
              Edge {signedPct(edgeBps)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
