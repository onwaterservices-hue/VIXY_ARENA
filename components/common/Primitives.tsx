import React from 'react';
import type { DataOrigin, FeedStatus, MarketCategory, Venue } from '../../types';
import { statusClass } from '../../lib/format';
import { Icon, type IconName } from './Icon';
import { useOrigin } from './ui-context';

/* ---- liveness ---------------------------------------------
   Renders the server's status field verbatim. Never derived — with
   one honesty rule on top: when the provider's origin is DEMO, a
   status of LIVE is displayed as SIMULATED. A simulator's health is
   not liveness, and the word LIVE is reserved for a server that
   reported it. (Vault shipped false LIVE states; the Arena does not.) */
export function StatusPill({ status, label, compact }: {
  status: FeedStatus; label?: string; compact?: boolean;
}) {
  const origin = useOrigin();
  const simulated = origin === 'DEMO' && status === 'LIVE';
  const text = simulated ? 'SIMULATED' : (label ?? status);
  const title = simulated ? 'Simulated feed — a labeled demo provider, not a live source' : `Feed status: ${status}`;
  return (
    <span className={`pill ${statusClass(status)} ${simulated ? 'is-simulated' : ''}`} title={title}>
      <i className={`dot ${status === 'LIVE' && !simulated ? 'pulse-dot' : ''}`} />
      {!compact && text}
    </span>
  );
}

export function VenueChip({ venue }: { venue: Venue }) {
  const short = venue === 'KALSHI' ? 'KAL' : 'POLY';
  return (
    <span className="venue-chip" data-venue={venue} title={venue}>
      <i />{short}
    </span>
  );
}

export function CategoryChip({ category }: { category: MarketCategory }) {
  return <span className="cat-chip" data-cat={category}>{category}</span>;
}

/* ---- origin honesty ---------------------------------------
   Bound to the provider's origin so the interface can never
   present synthetic values as live intelligence.              */
export function OriginBadge({ origin, label }: { origin: DataOrigin; label: string }) {
  if (origin === 'LIVE') return null;
  return (
    <span className="origin-badge" title={`All values are synthetic, produced by ${label}. Not market data.`}>
      <i />DEMO DATA
    </span>
  );
}

export function SectionHeader({ eyebrow, title, action }: {
  eyebrow?: string; title: string; action?: React.ReactNode;
}) {
  return (
    <div className="sec-head row between">
      <div className="col" style={{ gap: 2 }}>
        {eyebrow && <span className="t-label">{eyebrow}</span>}
        <h2 className="t-h2">{title}</h2>
      </div>
      {action && <div className="sec-head-actions row g3">{action}</div>}
    </div>
  );
}

export function StatTile({ label, value, sub, tone = 'default', icon }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode;
  tone?: 'default' | 'edge' | 'violet' | 'cyan' | 'risk' | 'warn'; icon?: IconName;
}) {
  return (
    <div className={`stat-tile glass-01 tone-${tone}`}>
      <div className="row between g2">
        <span className="t-label">{label}</span>
        {icon && <Icon name={icon} size={13} className="stat-ico" />}
      </div>
      {/* a long identifier gets the smaller size so it stays on one or
          two lines instead of stacking a word per line */}
      <div className={`stat-value t-num ${typeof value === 'string' && value.length > 12 ? 'is-long' : ''}`}>{value}</div>
      {sub && <div className="stat-sub t-small">{sub}</div>}
    </div>
  );
}

export function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state col center g2">
      <Icon name="target" size={22} />
      <div className="t-h3">{title}</div>
      <div className="t-small" style={{ maxWidth: 320, textAlign: 'center' }}>{detail}</div>
    </div>
  );
}

/* ---- corner brackets --------------------------------------- */
export function Brackets() {
  return (
    <>
      <i className="bk bk-tl" /><i className="bk bk-tr" />
      <i className="bk bk-bl" /><i className="bk bk-br" />
    </>
  );
}
