import React, { useId } from 'react';

/* Sharp geometry — data-bearing shapes are never smoothed. */
export function Sparkline({
  series, width = 120, height = 34, tone = 'violet', fill = true, strokeWidth = 1.4,
}: {
  series: number[]; width?: number; height?: number;
  tone?: 'violet' | 'cyan' | 'edge' | 'risk' | 'muted'; fill?: boolean; strokeWidth?: number;
}) {
  const id = useId();
  if (series.length < 2) return <svg width={width} height={height} />;

  const min = Math.min(...series), max = Math.max(...series);
  const span = Math.max(1, max - min);
  const pad = 2;
  const pts = series.map((v, i) => {
    const x = (i / (series.length - 1)) * (width - pad * 2) + pad;
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const stroke = {
    violet: 'var(--vx-violet-hi)', cyan: 'var(--vx-cyan)', edge: 'var(--vx-edge)',
    risk: 'var(--vx-risk)', muted: 'var(--vx-t3)',
  }[tone];

  const last = pts[pts.length - 1].split(',');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="spark">
      <defs>
        <linearGradient id={`sf-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && (
        <polygon points={`${pad},${height - pad} ${pts.join(' ')} ${width - pad},${height - pad}`}
                 fill={`url(#sf-${id})`} />
      )}
      <polyline points={pts.join(' ')} fill="none" stroke={stroke} strokeWidth={strokeWidth}
                strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="1.9" fill={stroke} />
    </svg>
  );
}
