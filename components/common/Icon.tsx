import React from 'react';

/* Minimal 24px stroke icon set. No icon library, no cartoon glyphs —
   every path is drawn on the same 1.6px optical weight. */

const P: Record<string, React.ReactNode> = {
  arena: <><path d="M12 3 4.6 7.2v9.6L12 21l7.4-4.2V7.2z" /><path d="M12 8.4 8.3 10.5v4.2L12 16.8l3.7-2.1v-4.2z" /></>,
  live: <><circle cx="12" cy="12" r="2.4" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 16.2a6 6 0 0 0 0-8.4" /><path d="M5 5a10 10 0 0 0 0 14M19 19a10 10 0 0 0 0-14" /></>,
  markets: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.2" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.2" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.2" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.2" /></>,
  signals: <><path d="M2.5 12h3l2-6 3.5 13 3-9 2 4h5.5" /></>,
  portfolio: <><path d="M12 3.2 20.5 8 12 12.8 3.5 8z" /><path d="m3.5 12 8.5 4.8 8.5-4.8" /><path d="m3.5 16 8.5 4.8 8.5-4.8" /></>,
  history: <><circle cx="12" cy="12" r="8.6" /><path d="M12 7v5.3l3.4 2" /></>,
  leaderboard: <><path d="M8.5 21h7" /><path d="M12 17.4V21" /><path d="M7 4h10v4.6a5 5 0 0 1-10 0z" /><path d="M7 5.4H4.4v1.4a3.4 3.4 0 0 0 3 3.3M17 5.4h2.6v1.4a3.4 3.4 0 0 1-3 3.3" /></>,
  brain: <><circle cx="12" cy="12" r="3.1" /><circle cx="12" cy="4.4" r="1.5" /><circle cx="19" cy="16" r="1.5" /><circle cx="5" cy="16" r="1.5" /><path d="M12 5.9v3M14.6 13.6l3.1 1.6M9.4 13.6l-3.1 1.6" /></>,
  neural: <><circle cx="5.5" cy="7" r="2" /><circle cx="18.5" cy="6" r="2" /><circle cx="12" cy="13" r="2.3" /><circle cx="6.5" cy="18.5" r="2" /><circle cx="18" cy="17.5" r="2" /><path d="m7.3 8.2 3 3.2M16.8 7.3 13.6 11.4M10.6 14.8 8 16.9M13.9 14.6l2.6 1.7" /></>,
  telemetry: <><path d="M3 17.5h3.2l2.4-9 3 12.5L14.2 12l1.6 3.4h5.2" /><path d="M3 6.5h18" opacity=".45" /></>,
  admin: <><path d="M12 3 5 6v6.2c0 4 2.9 7.4 7 8.8 4.1-1.4 7-4.8 7-8.8V6z" /><path d="m9.2 12.2 2 2 3.6-3.9" /></>,
  settings: <><path d="M4 7.5h10M18 7.5h2M4 16.5h4M12 16.5h8" /><circle cx="16" cy="7.5" r="2.2" /><circle cx="10" cy="16.5" r="2.2" /></>,
  help: <><circle cx="12" cy="12" r="8.6" /><path d="M9.7 9.6a2.4 2.4 0 1 1 3.2 2.3c-.6.3-.9.8-.9 1.5v.5" /><circle cx="12" cy="16.8" r=".7" fill="currentColor" stroke="none" /></>,
  bell: <><path d="M6.8 9.6a5.2 5.2 0 1 1 10.4 0v3.1l1.5 3H5.3l1.5-3z" /><path d="M10.2 18.6a2 2 0 0 0 3.6 0" /></>,
  user: <><circle cx="12" cy="8.6" r="3.4" /><path d="M5.4 19.6a6.9 6.9 0 0 1 13.2 0" /></>,
  search: <><circle cx="11" cy="11" r="6.4" /><path d="m16 16 4 4" /></>,
  lock: <><rect x="5.2" y="10.4" width="13.6" height="9.4" rx="2" /><path d="M8.6 10.4V7.8a3.4 3.4 0 0 1 6.8 0v2.6" /></>,
  check: <><path d="m5 12.6 4.6 4.4L19 7.2" /></>,
  close: <><path d="M6 6l12 12M18 6 6 18" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  chevronR: <><path d="m9.5 5.5 6.5 6.5-6.5 6.5" /></>,
  chevronL: <><path d="M14.5 5.5 8 12l6.5 6.5" /></>,
  chevronD: <><path d="m5.5 9.5 6.5 6.5 6.5-6.5" /></>,
  arrowUp: <><path d="M12 19V5M6 11l6-6 6 6" /></>,
  arrowDown: <><path d="M12 5v14M6 13l6 6 6-6" /></>,
  refresh: <><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20.5 4.5V10h-5.4" /></>,
  filter: <><path d="M4 6h16M7 12h10M10 18h4" /></>,
  external: <><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18.5 14.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V7A1.5 1.5 0 0 1 5 5.5h4.5" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  spark: <><path d="M12 3.5 13.8 9l5.7 1.6-4.5 3.7 1 5.7-4-2.9-4 2.9 1-5.7-4.5-3.7L10.2 9z" /></>,
  target: <><circle cx="12" cy="12" r="8.4" /><circle cx="12" cy="12" r="4.2" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></>,
  layers: <><path d="M12 3.4 20 8l-8 4.6L4 8z" /><path d="m4 12.4 8 4.6 8-4.6" /></>,
  clock: <><circle cx="12" cy="12" r="8.4" /><path d="M12 7.4V12l3 1.8" /></>,
  alert: <><path d="M12 4.2 21 19.4H3z" /><path d="M12 10v4" /><circle cx="12" cy="16.8" r=".75" fill="currentColor" stroke="none" /></>,
  flame: <><path d="M12 3.5s4.4 3.3 4.4 7.4a4.4 4.4 0 0 1-1.6 3.4c.1-1.6-.7-3-2-3.9.2 2.3-1 3-1.9 3.9a4.6 4.6 0 0 0-1.5 3.3 4.5 4.5 0 0 0 2.6 4.1" /><path d="M12 21.5a5.6 5.6 0 0 0 5.6-5.6c0-1.4-.5-2.4-1.2-3.4" /></>,
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 18, className, strokeWidth = 1.6 }: {
  name: IconName; size?: number; className?: string; strokeWidth?: number;
}) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
    >
      {P[name]}
    </svg>
  );
}
