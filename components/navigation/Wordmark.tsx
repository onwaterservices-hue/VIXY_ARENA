import React from 'react';

/* The VIXY mark: an orbital node — one nucleus, two inclined orbits,
   one satellite. Abstract, geometric, never a logo cliché. */
export function VixyMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="vixy-mark" aria-hidden="true">
      <defs>
        <linearGradient id="vx-mark-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--vx-violet-hi)" />
          <stop offset="55%" stopColor="var(--vx-violet)" />
          <stop offset="100%" stopColor="var(--vx-blue)" />
        </linearGradient>
        <radialGradient id="vx-mark-core">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="60%" stopColor="var(--vx-violet-hi)" />
          <stop offset="100%" stopColor="var(--vx-violet)" />
        </radialGradient>
      </defs>
      <g fill="none" stroke="url(#vx-mark-g)" strokeWidth="1.6">
        <ellipse cx="20" cy="20" rx="16.5" ry="7" transform="rotate(-28 20 20)" opacity=".85" />
        <ellipse cx="20" cy="20" rx="16.5" ry="7" transform="rotate(46 20 20)" opacity=".5" />
      </g>
      <path d="M12 12.5 20 27l8-14.5" fill="none" stroke="url(#vx-mark-g)" strokeWidth="2.6"
            strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20" cy="20" r="2.9" fill="url(#vx-mark-core)" />
      <circle cx="33.2" cy="13.6" r="1.7" fill="var(--vx-cyan)" />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="wordmark row g3">
      <VixyMark />
      {!compact && (
        <div className="col" style={{ gap: 0 }}>
          <span className="wordmark-name">
            VIXY<span className="wordmark-accent">ARENA</span>
          </span>
          <span className="wordmark-sub t-nano">prediction market intelligence</span>
        </div>
      )}
    </div>
  );
}
