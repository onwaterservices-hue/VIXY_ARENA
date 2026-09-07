import React, { useState } from 'react';
import type { CalibrationBin } from '../../types';
import { useElementSize } from '../../hooks';
import { pct } from '../../lib/format';

/* =============================================================
   RELIABILITY DIAGRAM
   -------------------------------------------------------------
   What the model said against what actually happened. The
   diagonal is perfect calibration. Points below it mean the
   model was over-confident in that band; above, under-confident.
   Bin size is shown, because a bin with four observations is not
   evidence of anything.
   ============================================================= */

const PAD = { top: 14, right: 16, bottom: 30, left: 42 };

export function CalibrationCurve({ bins, height = 260 }: { bins: CalibrationBin[]; height?: number }) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const w = Math.max(260, size.width);
  const h = height;
  const plotW = w - PAD.left - PAD.right;
  const plotH = h - PAD.top - PAD.bottom;
  const X = (bps: number) => PAD.left + (bps / 10000) * plotW;
  const Y = (bps: number) => PAD.top + (1 - bps / 10000) * plotH;
  const maxCount = Math.max(1, ...bins.map((b) => b.count));

  return (
    <div ref={ref} className="calib">
      <svg width={w} height={h} role="img" aria-label="Model reliability diagram">
        {[0, 2500, 5000, 7500, 10000].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={w - PAD.right} y1={Y(v)} y2={Y(v)} stroke="var(--vx-hair)" shapeRendering="crispEdges" />
            <line y1={PAD.top} y2={h - PAD.bottom} x1={X(v)} x2={X(v)} stroke="var(--vx-hair)" shapeRendering="crispEdges" />
            <text x={PAD.left - 8} y={Y(v) + 3} textAnchor="end" className="pc-axis">{v / 100}%</text>
            <text x={X(v)} y={h - 10} textAnchor="middle" className="pc-axis">{v / 100}%</text>
          </g>
        ))}

        <line x1={X(0)} y1={Y(0)} x2={X(10000)} y2={Y(10000)}
              stroke="var(--vx-hair-str)" strokeDasharray="4 4" strokeWidth="1.2" />

        <path
          d={bins.map((b, i) => `${i === 0 ? 'M' : 'L'}${X(b.predictedBps)},${Y(b.realizedBps)}`).join('')}
          fill="none" stroke="var(--vx-violet-hi)" strokeWidth="1.8" strokeLinejoin="round" />

        {bins.map((b, i) => (
          <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <circle cx={X(b.predictedBps)} cy={Y(b.realizedBps)}
                    r={3 + (b.count / maxCount) * 5}
                    fill={hover === i ? 'var(--vx-cyan)' : 'var(--vx-violet-hi)'}
                    stroke="rgba(4,5,11,0.8)" strokeWidth="1.5" />
            <line x1={X(b.predictedBps)} x2={X(b.predictedBps)}
                  y1={Y(b.realizedBps)} y2={Y(b.predictedBps)}
                  stroke={b.realizedBps < b.predictedBps ? 'rgba(255,84,112,0.45)' : 'rgba(43,232,165,0.45)'}
                  strokeWidth="1.2" />
          </g>
        ))}

        <text x={w - PAD.right} y={PAD.top + 12} textAnchor="end" className="pc-axis">realized ↑ / predicted →</text>
      </svg>

      {/* the bins array is replaced on every snapshot, so a hovered index
          from a previous tick may no longer exist */}
      {hover !== null && bins[hover] && (
        <div className="calib-tip glass-03" style={{ left: Math.min(X(bins[hover]!.predictedBps) + 10, w - 170) }}>
          <div className="row between g4"><span className="t-label">Predicted</span><b className="t-num">{pct(bins[hover]!.predictedBps, 0)}</b></div>
          <div className="row between g4"><span className="t-label">Realized</span><b className="t-num vixy">{pct(bins[hover]!.realizedBps, 1)}</b></div>
          <div className="row between g4"><span className="t-label">Sample</span><b className="t-num">{bins[hover]!.count}</b></div>
        </div>
      )}
    </div>
  );
}
