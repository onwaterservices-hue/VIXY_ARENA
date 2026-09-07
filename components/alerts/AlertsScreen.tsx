import React, { useMemo, useState } from 'react';
import type { ArenaSnapshot, SignalKind } from '../../types';
import { HoloPanel } from '../holographic/HoloPanel';
import { SectionHeader, Empty, StatTile, CategoryChip, OriginBadge } from '../common/Primitives';
import { Icon, type IconName } from '../common/Icon';
import { useArenaUI } from '../common/ui-context';
import { usePrefs } from '../common/prefs-context';
import { pct, relTime } from '../../lib/format';

/* =============================================================
   ALERTS
   -------------------------------------------------------------
   Intelligence notifications, not a message inbox.

   Every alert on this screen is a SignalEvent the engine already
   published — the same stream the console renders, grouped and
   filtered so a reader can answer "what changed that I care
   about" rather than "what happened".

   The client filters and groups. It never invents an alert, and
   it never decides that something is significant: the kind and
   the magnitude on every row are the engine's.
   ============================================================= */

const KIND_COPY: Record<SignalKind, { label: string; icon: IconName; tone: string }> = {
  SYSTEM_ANALYZING:  { label: 'Engine working',      icon: 'brain',       tone: 'muted' },
  MARKET_SHIFT:      { label: 'Probability shift',   icon: 'signals',     tone: 'cyan' },
  MOMENTUM_BUILDING: { label: 'Momentum building',   icon: 'arrowUp',     tone: 'violet' },
  LIQUIDITY_CHANGE:  { label: 'Liquidity change',    icon: 'layers',      tone: 'blue' },
  CORRELATION_SHIFT: { label: 'Correlation shift',   icon: 'neural',      tone: 'violet' },
  SIGNAL_CONFIRMING: { label: 'Signal confirming',   icon: 'target',      tone: 'cyan' },
  SIGNAL_LOCKED:     { label: 'Call locked',         icon: 'lock',        tone: 'violet' },
  SIGNAL_SETTLED:    { label: 'Settled',             icon: 'check',       tone: 'edge' },
  SOURCE_DEGRADED:   { label: 'Source degraded',     icon: 'alert',       tone: 'warn' },
};

type Bucket = 'ALL' | 'MOVES' | 'CALLS' | 'SYSTEM' | 'WATCHED';

const BUCKETS: { key: Bucket; label: string; kinds: SignalKind[] | null }[] = [
  { key: 'ALL',     label: 'Everything', kinds: null },
  { key: 'MOVES',   label: 'Market moves',
    kinds: ['MARKET_SHIFT', 'MOMENTUM_BUILDING', 'LIQUIDITY_CHANGE', 'CORRELATION_SHIFT'] },
  { key: 'CALLS',   label: 'Calls',
    kinds: ['SIGNAL_CONFIRMING', 'SIGNAL_LOCKED', 'SIGNAL_SETTLED'] },
  { key: 'SYSTEM',  label: 'System',
    kinds: ['SYSTEM_ANALYZING', 'SOURCE_DEGRADED'] },
  { key: 'WATCHED', label: 'On my board', kinds: null },
];

export function AlertsScreen({ snapshot, now, origin, sourceLabel, onNavigate }: {
  snapshot: ArenaSnapshot; now: number;
  origin: 'DEMO' | 'LIVE'; sourceLabel: string;
  onNavigate: (id: string) => void;
}) {
  const ui = useArenaUI();
  const { prefs } = usePrefs();
  const [bucket, setBucket] = useState<Bucket>('ALL');

  const counts = useMemo(() => {
    const out = {} as Record<Bucket, number>;
    for (const b of BUCKETS) {
      out[b.key] = snapshot.signals.filter((s) => {
        if (b.key === 'WATCHED') return s.marketId !== null && prefs.watchlist.includes(s.marketId);
        return b.kinds === null || b.kinds.includes(s.kind);
      }).length;
    }
    return out;
  }, [snapshot.signals, prefs.watchlist]);

  const rows = useMemo(() => {
    const b = BUCKETS.find((x) => x.key === bucket)!;
    return snapshot.signals.filter((s) => {
      if (b.key === 'WATCHED') return s.marketId !== null && prefs.watchlist.includes(s.marketId);
      return b.kinds === null || b.kinds.includes(s.kind);
    });
  }, [snapshot.signals, bucket, prefs.watchlist]);

  /* Grouped by how recent, because a reader scans an alert list by time. */
  const groups = useMemo(() => {
    const buckets: { label: string; items: typeof rows }[] = [
      { label: 'Last hour', items: [] },
      { label: 'Today', items: [] },
      { label: 'Earlier', items: [] },
    ];
    for (const s of rows) {
      const age = now - +new Date(s.ts);
      if (age < 3_600_000) buckets[0].items.push(s);
      else if (age < 86_400_000) buckets[1].items.push(s);
      else buckets[2].items.push(s);
    }
    return buckets.filter((b) => b.items.length > 0);
  }, [rows, now]);

  const degraded = snapshot.signals.filter((s) => s.kind === 'SOURCE_DEGRADED').length;

  return (
    <div className="screen col g5 alerts">
      <SectionHeader
        eyebrow="What changed"
        title="Alerts"
        action={<div className="row g3"><OriginBadge origin={origin} label={sourceLabel} /></div>} />

      <div className="stat-row">
        <StatTile label="In this window" value={snapshot.signals.length} sub="engine events" icon="bell" />
        <StatTile label="Market moves" value={counts.MOVES} sub="shifts and momentum" icon="signals" tone="cyan" />
        <StatTile label="Call events" value={counts.CALLS} sub="confirming, locked, settled" icon="lock" tone="violet" />
        <StatTile label="Source warnings" value={degraded}
                  sub={degraded ? 'a feed was downgraded' : 'all sources fresh'}
                  tone={degraded ? 'warn' : 'edge'} icon="alert" />
      </div>

      <div className="filters glass-01">
        <div className="chipset vx-scroll-x">
          {BUCKETS.map((b) => (
            <button key={b.key} className={`fchip tap ${bucket === b.key ? 'is-active' : ''}`}
                    onClick={() => setBucket(b.key)} disabled={counts[b.key] === 0 && b.key !== 'ALL'}>
              {b.label.toUpperCase()}<i className="fchip-n">{counts[b.key]}</i>
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <HoloPanel grade={1}>
          <Empty
            title={bucket === 'WATCHED' ? 'Nothing on your board has moved' : 'No alerts in this view'}
            detail={bucket === 'WATCHED'
              ? 'Star markets on the board and their engine events appear here.'
              : 'The engine has published nothing matching this filter in the current window.'} />
          {bucket === 'WATCHED' && (
            <div className="row" style={{ marginTop: 'var(--s-5)', justifyContent: 'center' }}>
              <button className="btn btn-primary tap" onClick={() => onNavigate('watchlist')}>
                <Icon name="spark" size={14} />Open your watchlist
              </button>
            </div>
          )}
        </HoloPanel>
      ) : (
        groups.map((g) => (
          <section key={g.label} className="al-group">
            <header className="ue-group-head">
              <b className="t-label">{g.label}</b>
              <i className="ue-rule" />
              <span className="t-nano">{g.items.length}</span>
            </header>
            <ul className="al-list">
              {g.items.map((s) => {
                const k = KIND_COPY[s.kind];
                const market = s.marketId
                  ? snapshot.markets.find((m) => m.id === s.marketId) ?? null
                  : null;
                const watched = s.marketId ? prefs.watchlist.includes(s.marketId) : false;
                return (
                  <li key={s.id}>
                    <button className={`al-row tap tone-${k.tone} ${watched ? 'is-watched' : ''}`}
                            onClick={() => (s.marketId ? ui.openMarket(s.marketId) : undefined)}>
                      <span className="al-ico"><Icon name={k.icon} size={15} /></span>
                      <span className="al-body">
                        <span className="al-top">
                          <b className="t-body">{k.label}</b>
                          {market && <CategoryChip category={market.category} />}
                          {watched && <span className="al-watch">on my board</span>}
                        </span>
                        <span className="t-micro">{s.subject} · {s.detail}</span>
                      </span>
                      <span className="al-mag t-num">
                        {s.magnitudeBps === null ? '--' : pct(s.magnitudeBps, 1)}
                      </span>
                      <span className="al-when t-nano">{relTime(s.ts, now)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <p className="lb-note">
        <Icon name="alert" size={13} />
        Every row here is an event the engine published. The interface groups and filters them;
        it never raises an alert of its own, and it never decides that a move is significant.
      </p>
    </div>
  );
}
