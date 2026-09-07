import React, { useId } from 'react';
import { ratio } from '../../lib/format';
import type { Bps } from '../../types';

/* Circular gauge. Data-bearing geometry stays sharp: a single arc,
   a tick ring, and one readout. No decorative rings. */
export function Gauge({
  valueBps, label, sub, size = 132, tone = 'violet', thickness = 6,
}: {
  valueBps: Bps | null; label: string; sub?: string; size?: number;
  tone?: 'violet' | 'cyan' | 'edge' | 'warn' | 'risk'; thickness?: number;
}) {
  const r = (size - thickness * 2 - 10) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const v = ratio(valueBps);
  const sweep = 0.75;                       // 270° dial
  const dash = circ * sweep * v;
  const gap = circ - dash;
  const id = `g-${useId().replace(/:/g, '')}-${tone}`;

  const stops: Record<string, [string, string]> = {
    violet: ['var(--vx-violet)', 'var(--vx-blue)'],
    cyan:   ['var(--vx-cyan)',   'var(--vx-blue)'],
    edge:   ['var(--vx-edge)',   'var(--vx-cyan)'],
    warn:   ['var(--vx-warn)',   'var(--vx-risk)'],
    risk:   ['var(--vx-risk)',   'var(--vx-warn)'],
  };

  const ticks = Array.from({ length: 25 }, (_, i) => i);

  return (
    <div className="gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
           aria-label={`${label}: ${valueBps === null ? 'unknown' : `${(valueBps / 100).toFixed(1)} percent`}`}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={stops[tone][0]} />
            <stop offset="100%" stopColor={stops[tone][1]} />
          </linearGradient>
        </defs>
        <g transform={`rotate(135 ${c} ${c})`}>
          <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(160,172,255,0.10)"
                  strokeWidth={thickness} strokeDasharray={`${circ * sweep} ${circ}`} strokeLinecap="round" />
          <circle cx={c} cy={c} r={r} fill="none" stroke={`url(#${id})`}
                  strokeWidth={thickness} strokeDasharray={`${dash} ${gap}`} strokeLinecap="round"
                  style={{ transition: 'stroke-dasharray var(--m-slow) var(--ease-out)' }} />
        </g>
        <g opacity="0.5">
          {ticks.map((i) => {
            const a = (135 + (270 / 24) * i) * (Math.PI / 180);
            const r1 = r + thickness / 2 + 3, r2 = r1 + (i % 6 === 0 ? 5 : 2.5);
            return (
              <line key={i}
                x1={c + Math.cos(a) * r1} y1={c + Math.sin(a) * r1}
                x2={c + Math.cos(a) * r2} y2={c + Math.sin(a) * r2}
                stroke="var(--vx-hair-str)" strokeWidth="1" />
            );
          })}
        </g>
      </svg>
      <div className="gauge-read col center">
        <span className="gauge-value t-num">
          {valueBps === null ? '—' : (valueBps / 100).toFixed(1)}
          {valueBps !== null && <em>%</em>}
        </span>
        <span className="t-label" style={{ letterSpacing: '0.18em' }}>{label}</span>
        {sub && <span className="t-nano" style={{ marginTop: 2 }}>{sub}</span>}
      </div>
    </div>
  );
}
