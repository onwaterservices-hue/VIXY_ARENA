import React, { useMemo, useState } from 'react';
import type { ArenaEvent, ArenaEventStatus, ArenaSnapshot, MarketCategory } from '../../types';
import { SectionHeader, Empty, CategoryChip } from '../common/Primitives';
import { Icon } from '../common/Icon';
import { HoloPanel } from '../holographic/HoloPanel';
import { useArenaUI } from '../common/ui-context';
import { CATEGORY_KEYS, CATEGORY_MAP } from '../../lib/categories';
import { pct, signedPct, untilTime } from '../../lib/format';

/* =============================================================
   UP NEXT — THE SCHEDULE
   -------------------------------------------------------------
   Most prediction interfaces can only show what is moving. That
   answers "what changed" and never answers "what is on tonight",
   which is the question anyone who follows sport, politics or the
   economic calendar asks first.

   This screen is the calendar of the prediction-market world. It
   groups the engine's events by day in chronological order, and
   each row opens the market written about that event.

   The status word on every row is the engine's. The client groups
   and sorts; it never decides that something is live.
   ============================================================= */

const STATUS_COPY: Record<ArenaEventStatus, { label: string; cls: string }> = {
  LIVE:         { label: 'Live now',     cls: 'live' },
  CLOSING_SOON: { label: 'Closing soon', cls: 'closing' },
  UPCOMING:     { label: 'Upcoming',     cls: 'upcoming' },
  CLOSED:       { label: 'Closed',       cls: 'closed' },
  SETTLED:      { label: 'Settled',      cls: 'settled' },
};

/** Calendar bucket for an ISO instant, relative to now. Presentation only. */
function dayBucket(iso: string, now: number): string {
  const d = new Date(iso);
  const start = (t: Date) => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const days = Math.round((start(d) - start(new Date(now))) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function EventRow({ event, snapshot, now }: {
  event: ArenaEvent; snapshot: ArenaSnapshot; now: number;
}) {
  const ui = useArenaUI();
  const markets = event.marketIds
    .map((id) => snapshot.markets.find((m) => m.id === id))
    .filter(Boolean) as ArenaSnapshot['markets'];

  /* The headline market is the one the engine disagrees with most.
     Choosing which to show is presentation; the numbers are not. */
  const lead = [...markets].sort(
    (a, b) => Math.abs(b.edgeBps ?? 0) - Math.abs(a.edgeBps ?? 0),
  )[0] ?? null;
  const st = STATUS_COPY[event.status];

  return (
    <li className={`ue-row status-${st.cls}`}>
      <div className="ue-time">
        <b className="t-num">{timeOf(event.startsAt)}</b>
        {/* A countdown only makes sense before the start. Once an event is
            under way the honest word is "under way", not a stale "closed". */}
        <span className="t-nano">
          {event.status === 'LIVE' ? 'under way'
            : event.status === 'SETTLED' ? 'final'
            : event.status === 'CLOSED' ? 'awaiting result'
            : untilTime(event.startsAt, now)}
        </span>
      </div>

      <div className="ue-body">
        <span className="ue-tags">
          <span className={`ue-status status-${st.cls}`}>
            {event.status === 'LIVE' && <i className="dot pulse-dot" />}{st.label}
          </span>
          <CategoryChip category={event.category} />
          {event.league && <span className="ue-league t-nano">{event.league}</span>}
        </span>
        <b className="ue-title">{event.title}</b>
        <span className="ue-meta t-nano">
          {event.marketIds.length} market{event.marketIds.length === 1 ? '' : 's'}
          {event.venues.length > 0 && <> · {event.venues.join(' · ').toLowerCase()}</>}
          {event.note && <> · {event.note}</>}
        </span>
      </div>

      {lead ? (
        <div className="ue-nums">
          <span className="col"><span className="t-label">Market</span>
            <b className="t-num">{pct(lead.marketProbabilityBps)}</b></span>
          <span className="col"><span className="t-label">VIXY</span>
            <b className="t-num vixy">{pct(lead.vixyProbabilityBps)}</b></span>
          <span className="col"><span className="t-label">Edge</span>
            <b className={`t-num ${(lead.edgeBps ?? 0) >= 0 ? 'edge-pos' : 'edge-neg'}`}>
              {signedPct(lead.edgeBps)}</b></span>
        </div>
      ) : (
        <div className="ue-nums ue-nums-empty">
          <span className="t-nano">No market priced yet</span>
        </div>
      )}

      <div className="ue-go">
        {lead && (
          <button className="btn btn-sm tap" onClick={() => ui.openMarket(lead.id)}>
            Open<Icon name="chevronR" size={12} />
          </button>
        )}
      </div>
    </li>
  );
}

export function UpNextScreen({ snapshot, now }: { snapshot: ArenaSnapshot; now: number }) {
  const [cat, setCat] = useState<MarketCategory | 'ALL'>('ALL');
  const [horizon, setHorizon] = useState<'ALL' | 'TODAY' | 'WEEK'>('ALL');

  const events = snapshot.events ?? [];

  const filtered = useMemo(() => {
    const weekOut = now + 7 * 86_400_000;
    const dayOut = now + 36 * 3_600_000;
    return events.filter((e) => {
      if (cat !== 'ALL' && e.category !== cat) return false;
      const t = +new Date(e.startsAt);
      if (horizon === 'TODAY' && t > dayOut) return false;
      if (horizon === 'WEEK' && t > weekOut) return false;
      return true;
    });
  }, [events, cat, horizon, now]);

  /* Chronological grouping. Order comes from the engine's own
     timestamps; the bucket label is the only thing computed here. */
  const groups = useMemo(() => {
    const out: { label: string; items: ArenaEvent[] }[] = [];
    for (const e of filtered) {
      const label = dayBucket(e.startsAt, now);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(e);
      else out.push({ label, items: [e] });
    }
    return out;
  }, [filtered, now]);

  const liveCount = events.filter((e) => e.status === 'LIVE').length;
  const soonCount = events.filter((e) => e.status === 'CLOSING_SOON').length;

  return (
    <div className="screen col g5 upnext">
      <SectionHeader
        eyebrow="The prediction calendar"
        title="Up next"
        action={
          <div className="seg" role="group" aria-label="Horizon">
            {(['ALL', 'TODAY', 'WEEK'] as const).map((h) => (
              <button key={h} aria-pressed={horizon === h} onClick={() => setHorizon(h)}>
                {h === 'ALL' ? 'Everything' : h === 'TODAY' ? 'Next 36h' : 'This week'}
              </button>
            ))}
          </div>
        } />

      <div className="ue-summary">
        <div className="ue-sum">
          <b className="t-num">{events.length}</b>
          <span className="t-nano">scheduled events</span>
        </div>
        <div className="ue-sum">
          <b className="t-num edge-pos">{liveCount}</b>
          <span className="t-nano">under way now</span>
        </div>
        <div className="ue-sum">
          <b className="t-num">{soonCount}</b>
          <span className="t-nano">closing soon</span>
        </div>
        <div className="ue-sum">
          <b className="t-num">{events.reduce((a, e) => a + e.marketIds.length, 0)}</b>
          <span className="t-nano">markets on the board</span>
        </div>
      </div>

      <div className="filters glass-01">
        <div className="chipset vx-scroll-x">
          {(['ALL', ...CATEGORY_KEYS] as (MarketCategory | 'ALL')[]).map((c) => {
            const n = c === 'ALL' ? events.length : events.filter((e) => e.category === c).length;
            return (
              <button key={c} className={`fchip tap ${cat === c ? 'is-active' : ''}`}
                      onClick={() => setCat(c)} disabled={n === 0}
                      title={c === 'ALL' ? 'Every category' : CATEGORY_MAP[c]?.blurb}>
                {c === 'ALL' ? 'ALL' : CATEGORY_MAP[c].label.toUpperCase()}
                <i className="fchip-n">{n}</i>
              </button>
            );
          })}
        </div>
      </div>

      {groups.length === 0 ? (
        <HoloPanel grade={1}>
          <Empty title="Nothing scheduled in this view"
                 detail="Widen the horizon or clear the category filter to see the rest of the calendar." />
        </HoloPanel>
      ) : (
        groups.map((g) => (
          <section key={g.label} className="ue-group">
            <header className="ue-group-head">
              <b className="t-label">{g.label}</b>
              <i className="ue-rule" />
              <span className="t-nano">{g.items.length} event{g.items.length === 1 ? '' : 's'}</span>
            </header>
            <ul className="ue-list">
              {g.items.map((e) => (
                <EventRow key={e.id} event={e} snapshot={snapshot} now={now} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
