import React, { useMemo, useState } from 'react';
import type { ArenaSnapshot, CanonicalMarket } from '../../types';
import { HoloPanel } from '../holographic/HoloPanel';
import { MarketCard } from '../markets/MarketCard';
import { SectionHeader, Empty, StatTile, CategoryChip, OriginBadge } from '../common/Primitives';
import { Icon } from '../common/Icon';
import { useArenaUI } from '../common/ui-context';
import { SECTOR_MAP, CATEGORY_MAP } from '../../lib/categories';
import { pct, signedPct, untilTime } from '../../lib/format';

/* =============================================================
   SECTOR HUB
   -------------------------------------------------------------
   One screen serves every sector — Sports, Macro, Politics,
   Crypto, Weather, Culture, Science & Tech — because they are
   the same product with a different slice of the same engine.

   Building seven bespoke screens would guarantee seven versions
   of the truth. One hub, driven by the sector table, means a new
   sector is a row in a table and nothing else. That is the whole
   claim of a category-agnostic architecture, made structural.

   Everything on it reads the snapshot. The hub decides order and
   emphasis; it decides nothing about a market.
   ============================================================= */

type RailKey = 'LIVE' | 'NEXT' | 'CLOSING' | 'EDGES';

const RAILS: { key: RailKey; label: string; blurb: string }[] = [
  { key: 'LIVE',    label: 'Live now',      blurb: 'under way' },
  { key: 'NEXT',    label: 'Up next',       blurb: 'scheduled' },
  { key: 'CLOSING', label: 'Closing soon',  blurb: 'by close time' },
  { key: 'EDGES',   label: 'Biggest edges', blurb: 'widest disagreement' },
];

export function SectorScreen({ sectorKey, snapshot, now, origin, sourceLabel, onNavigate }: {
  sectorKey: string;
  snapshot: ArenaSnapshot;
  now: number;
  origin: 'DEMO' | 'LIVE';
  sourceLabel: string;
  onNavigate: (id: string) => void;
}) {
  const ui = useArenaUI();
  const sector = SECTOR_MAP[sectorKey] ?? null;
  const [group, setGroup] = useState<string>('ALL');
  const [rail, setRail] = useState<RailKey>('EDGES');

  const inSector = useMemo(
    () => (sector ? snapshot.markets.filter((m) => sector.categories.includes(m.category)) : []),
    [snapshot.markets, sector],
  );

  /* Groups come from the engine's own event layer: a league for sport, a
     series or issuing body elsewhere. Nothing is parsed out of a title. */
  const groups = useMemo(() => {
    const out = new Map<string, number>();
    for (const e of snapshot.events ?? []) {
      if (!sector || !sector.categories.includes(e.category)) continue;
      if (!e.league) continue;
      out.set(e.league, (out.get(e.league) ?? 0) + e.marketIds.length);
    }
    return [...out.entries()].sort((a, b) => b[1] - a[1]);
  }, [snapshot.events, sector]);

  const groupMarketIds = useMemo(() => {
    if (group === 'ALL') return null;
    const ids = new Set<string>();
    for (const e of snapshot.events ?? []) {
      if (e.league === group) e.marketIds.forEach((id) => ids.add(id));
    }
    return ids;
  }, [snapshot.events, group]);

  const scoped = groupMarketIds
    ? inSector.filter((m) => groupMarketIds.has(m.id))
    : inSector;

  const wall = useMemo(() => {
    const events = (snapshot.events ?? []).filter(
      (e) => sector && sector.categories.includes(e.category),
    );
    const ids = new Set(scoped.map((m) => m.id));
    const pick = (list: string[]) =>
      list.filter((id) => ids.has(id))
        .map((id) => scoped.find((m) => m.id === id)!)
        .filter(Boolean);

    return {
      LIVE: pick(events.filter((e) => e.status === 'LIVE').flatMap((e) => e.marketIds)),
      NEXT: pick(
        events.filter((e) => e.status === 'UPCOMING' || e.status === 'CLOSING_SOON')
          .slice(0, 8).flatMap((e) => e.marketIds),
      ),
      CLOSING: [...scoped].sort((a, b) => +new Date(a.closesAt) - +new Date(b.closesAt)),
      EDGES: [...scoped].sort((a, b) => Math.abs(b.edgeBps ?? 0) - Math.abs(a.edgeBps ?? 0)),
    } as Record<RailKey, CanonicalMarket[]>;
  }, [snapshot.events, scoped, sector]);

  if (!sector) {
    return (
      <div className="screen col g5">
        <SectionHeader eyebrow="Market universe" title="Unknown sector" />
        <HoloPanel grade={1}>
          <Empty title="No such sector"
                 detail="That sector is not in the market universe. Open Markets to browse every category." />
        </HoloPanel>
      </div>
    );
  }

  /* Sector telemetry, derived only from engine-issued fields. */
  const priced = scoped.filter((m) => m.marketProbabilityBps !== null);
  const avgConfidence = priced.length
    ? Math.round(priced.reduce((a, m) => a + (m.confidenceBps ?? 0), 0) / priced.length)
    : null;
  const widest = [...scoped].sort(
    (a, b) => Math.abs(b.edgeBps ?? 0) - Math.abs(a.edgeBps ?? 0))[0] ?? null;
  const venues = new Set(scoped.flatMap((m) => m.venueRefs.map((v) => v.venue)));
  const liveEvents = (snapshot.events ?? []).filter(
    (e) => sector.categories.includes(e.category) && e.status === 'LIVE').length;

  return (
    <div
      className="screen col g5 sector"
      style={{ ['--sector' as string]: `var(${sector.accent})` }}
    >
      <SectionHeader
        eyebrow="Market universe"
        title={sector.label}
        action={
          <div className="row g3">
            <OriginBadge origin={origin} label={sourceLabel} />
            <button className="btn btn-sm tap" onClick={() => onNavigate('markets')}>
              <Icon name="markets" size={13} />All markets
            </button>
          </div>
        } />

      <p className="sc-blurb t-small">
        {sector.blurb}. Every figure below is the engine’s, read through the same contract as
        every other screen — this hub changes the slice, never the meaning.
      </p>

      <div className="stat-row">
        <StatTile label="Markets" value={scoped.length}
                  sub={sector.categories.map((c) => CATEGORY_MAP[c].label).join(' · ')} icon="markets" />
        <StatTile label="Events under way" value={liveEvents}
                  sub={liveEvents ? 'live right now' : 'nothing under way'} icon="live"
                  tone={liveEvents ? 'risk' : undefined} />
        <StatTile label="Mean confidence"
                  value={avgConfidence === null ? '--' : pct(avgConfidence, 1)}
                  sub="engine-graded" icon="brain" tone="violet" />
        <StatTile label="Venues" value={venues.size}
                  sub={[...venues].join(' · ').toLowerCase() || 'none listed'} icon="layers" tone="cyan" />
      </div>

      {/* ---- widest disagreement, given its own moment ---- */}
      {widest && (
        <button className="sc-lead glass-02 lift tap" onClick={() => ui.openMarket(widest.id)}>
          <span className="sc-lead-tag">Widest disagreement in {sector.label.toLowerCase()}</span>
          <b className="sc-lead-title">{widest.title}</b>
          <span className="sc-lead-nums">
            <span className="col"><span className="t-label">Market</span>
              <b className="t-num">{pct(widest.marketProbabilityBps)}</b></span>
            <span className="col"><span className="t-label">VIXY</span>
              <b className="t-num vixy">{pct(widest.vixyProbabilityBps)}</b></span>
            <span className="col"><span className="t-label">Edge</span>
              <b className={`t-num ${(widest.edgeBps ?? 0) >= 0 ? 'edge-pos' : 'edge-neg'}`}>
                {signedPct(widest.edgeBps)}</b></span>
            <span className="col"><span className="t-label">Closes</span>
              <b className="t-num">{untilTime(widest.closesAt, now)}</b></span>
          </span>
          <span className="sc-lead-go"><Icon name="chevronR" size={16} /></span>
        </button>
      )}

      {/* ---- groups: leagues, issuing bodies, series ---- */}
      {groups.length > 0 && (
        <div className="filters glass-01">
          <div className="chipset vx-scroll-x">
            <button className={`fchip tap ${group === 'ALL' ? 'is-active' : ''}`}
                    onClick={() => setGroup('ALL')}>
              ALL<i className="fchip-n">{inSector.length}</i>
            </button>
            {groups.map(([g, n]) => (
              <button key={g} className={`fchip tap ${group === g ? 'is-active' : ''}`}
                      onClick={() => setGroup(g)}>
                {g.toUpperCase()}<i className="fchip-n">{n}</i>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---- the wall ---- */}
      <div className="lp-rails" role="tablist" aria-label={`${sector.label} rails`}>
        {RAILS.map((r) => (
          <button key={r.key} role="tab" aria-selected={rail === r.key}
                  className={`lp-rail tap ${rail === r.key ? 'is-active' : ''}`}
                  onClick={() => setRail(r.key)}>
            <b>{r.label}</b>
            <span className="t-nano">{r.blurb}</span>
            <i className="lp-rail-n">{wall[r.key].length}</i>
          </button>
        ))}
      </div>

      {wall[rail].length === 0 ? (
        <HoloPanel grade={1}>
          <Empty title={`Nothing in ${RAILS.find((r) => r.key === rail)!.label.toLowerCase()}`}
                 detail="The engine reports nothing in this rail right now. The interface does not pad it out." />
        </HoloPanel>
      ) : (
        <div className="mgrid">
          {wall[rail].slice(0, 9).map((m) => (
            <MarketCard key={m.id} market={m} now={now} onSelect={(x) => ui.openMarket(x.id)} />
          ))}
        </div>
      )}

      {/* ---- what else this sector touches ---- */}
      <HoloPanel grade={1} eyebrow="Elsewhere in the universe" title="Related sectors">
        <div className="sc-cats">
          {sector.categories.map((c) => (
            <span key={c} className="sc-cat"><CategoryChip category={c} />
              <b className="t-num">{inSector.filter((m) => m.category === c).length}</b></span>
          ))}
        </div>
        <p className="t-small" style={{ marginTop: 'var(--s-4)' }}>
          A sector is how a reader navigates; a category is what the venue called the market.
          Nothing on this screen changes a market’s category — it only decides which of them
          appear together.
        </p>
      </HoloPanel>
    </div>
  );
}
