import React, { useMemo, useState } from 'react';
import type { ArenaSnapshot, MarketCategory } from '../../types';
import { HoloPanel } from '../holographic/HoloPanel';
import { MarketCard } from './MarketCard';
import { SectionHeader, Empty } from '../common/Primitives';
import { Icon } from '../common/Icon';
import { useArenaUI } from '../common/ui-context';
import { usePrefs } from '../common/prefs-context';
import { useMedia } from '../../hooks';
import { CATEGORY_KEYS, CATEGORY_MAP, SECTORS } from '../../lib/categories';

/* The filter rail reads the universe from one place, so adding a
   category to the taxonomy adds it here without touching this screen. */
const FILTERS: (MarketCategory | 'ALL')[] = ['ALL', ...CATEGORY_KEYS];
type SortKey = 'EDGE' | 'CONFIDENCE' | 'CLOSING' | 'DISPERSION' | 'MOVEMENT' | 'LIQUIDITY' | 'VOLUME';

/* Trailing movement, from the series the engine sent. Presentation ordering
   only — no probability is computed here, just the distance between the
   first and last point of a series the engine already published. */
const movementOf = (m: { series: number[] }): number => {
  if (m.series.length < 2) return 0;
  return Math.abs(m.series[m.series.length - 1] - m.series[0]);
};
const liquidityOf = (m: { venueRefs: { liquidityUsd: number | null }[] }): number =>
  m.venueRefs.reduce((a, v) => a + (v.liquidityUsd ?? 0), 0);
const volumeOf = (m: { venueRefs: { volume24hUsd: number | null }[] }): number =>
  m.venueRefs.reduce((a, v) => a + (v.volume24hUsd ?? 0), 0);

/* Four columns is the point at which a side-by-side stops being
   readable, so the picker refuses the fifth rather than shrinking. */
const MAX_COMPARE = 4;

export function MarketsScreen({ snapshot, now }: { snapshot: ArenaSnapshot; now: number }) {
  const [cat, setCat] = useState<MarketCategory | 'ALL'>('ALL');
  const [sort, setSort] = useState<SortKey>('EDGE');
  /* The universe view is the default because it is the product's claim: VIXY
   watches everything. A reader who lands on a flat grid learns that VIXY has
   markets; a reader who lands on the universe learns what it covers. */
  const [view, setView] = useState<'UNIVERSE' | 'GRID' | 'ROWS' | 'EVENT'>('UNIVERSE');
  const [query, setQuery] = useState('');
  const ui = useArenaUI();
  const { prefs } = usePrefs();
  const [watchOnly, setWatchOnly] = useState(false);
  /* On a phone the home screen's first job is to show a market. The filter
     block is folded behind one button there, and opens on demand; it stays
     open whenever a filter is actually active so nothing is hidden. */
  const isPhone = useMedia('(max-width: 860px)');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterActive = cat !== 'ALL' || query !== '' || watchOnly || sort !== 'EDGE';
  const showFilters = !isPhone || filtersOpen || filterActive;
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const togglePick = (id: string) => setPicked((cur) => {
    if (cur.includes(id)) return cur.filter((x) => x !== id);
    if (cur.length >= MAX_COMPARE) {
      ui.notify(`Compare holds ${MAX_COMPARE} markets — deselect one first`, 'warn');
      return cur;
    }
    return [...cur, id];
  });
  const exitPicking = () => { setPicking(false); setPicked([]); };
  const onCardSelect = (id: string) => (picking ? togglePick(id) : ui.openMarket(id));

  const rows = useMemo(() => {
    const filtered = snapshot.markets.filter(
      (m) => (cat === 'ALL' || m.category === cat) &&
             (!watchOnly || prefs.watchlist.includes(m.id)) &&
             (query === '' || `${m.title} ${m.symbol}`.toLowerCase().includes(query.toLowerCase())),
    );
    const by: Record<SortKey, (a: typeof filtered[0], b: typeof filtered[0]) => number> = {
      EDGE: (a, b) => Math.abs(b.edgeBps ?? 0) - Math.abs(a.edgeBps ?? 0),
      CONFIDENCE: (a, b) => (b.confidenceBps ?? 0) - (a.confidenceBps ?? 0),
      CLOSING: (a, b) => +new Date(a.closesAt) - +new Date(b.closesAt),
      DISPERSION: (a, b) => (b.dispersionBps ?? 0) - (a.dispersionBps ?? 0),
      MOVEMENT: (a, b) => movementOf(b) - movementOf(a),
      LIQUIDITY: (a, b) => liquidityOf(b) - liquidityOf(a),
      VOLUME: (a, b) => volumeOf(b) - volumeOf(a),
    };
    return [...filtered].sort(by[sort]);
  }, [snapshot.markets, cat, sort, query, watchOnly, prefs.watchlist]);

  return (
    <div className="screen col g5">
      <SectionHeader eyebrow="One terminal · every market" title="All markets"
        action={
          <>
            <button className={`btn btn-sm tap ${picking ? 'btn-primary' : ''}`}
                    aria-pressed={picking}
                    onClick={() => (picking ? exitPicking() : setPicking(true))}>
              <Icon name="layers" size={13} />{picking ? 'Cancel compare' : 'Compare'}
            </button>
            <div className="seg" role="group" aria-label="View">
              <button aria-pressed={view === 'UNIVERSE'} onClick={() => setView('UNIVERSE')}>Universe</button>
              <button aria-pressed={view === 'GRID'} onClick={() => setView('GRID')}>Grid</button>
              <button aria-pressed={view === 'ROWS'} onClick={() => setView('ROWS')}>Rows</button>
              <button aria-pressed={view === 'EVENT'} onClick={() => setView('EVENT')}>Events</button>
            </div>
          </>
        } />

      {isPhone && !showFilters && (
        <button className="btn btn-sm tap filters-toggle" onClick={() => setFiltersOpen(true)} aria-expanded={false}>
          <Icon name="search" size={13} />Filter &amp; sort · {snapshot.markets.length} markets
        </button>
      )}
      {showFilters && <div className="filters glass-01">
        <div className="search row g2">
          <Icon name="search" size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
                 placeholder="Filter markets" aria-label="Filter markets" />
        </div>
        <div className="chipset vx-scroll-x">
          <button className={`fchip tap ${watchOnly ? 'is-active' : ''}`} onClick={() => setWatchOnly((v) => !v)}>
            ★ WATCHLIST {prefs.watchlist.length > 0 ? `(${prefs.watchlist.length})` : ''}
          </button>
          {FILTERS.map((c) => {
            const n = c === 'ALL' ? snapshot.markets.length
              : snapshot.markets.filter((m) => m.category === c).length;
            return (
              <button key={c} className={`fchip tap cat-${c.toLowerCase()} ${cat === c ? 'is-active' : ''}`}
                      onClick={() => setCat(c)} disabled={n === 0}
                      title={c === 'ALL' ? 'Every category' : CATEGORY_MAP[c]?.blurb}>
                {c === 'ALL' ? 'ALL' : CATEGORY_MAP[c].label.toUpperCase()}
                <i className="fchip-n">{n}</i>
              </button>
            );
          })}
        </div>
        <div className="seg" role="group" aria-label="Sort">
          {(['EDGE', 'CONFIDENCE', 'MOVEMENT', 'CLOSING', 'LIQUIDITY', 'VOLUME', 'DISPERSION'] as SortKey[]).map((s) => (
            <button key={s} aria-pressed={sort === s} onClick={() => setSort(s)}>{s}</button>
          ))}
        </div>
        {isPhone && !filterActive && (
          <button className="btn btn-sm btn-ghost tap" onClick={() => setFiltersOpen(false)}>Hide filters</button>
        )}
      </div>}

      {rows.length === 0 ? (
        <HoloPanel grade={1}><Empty title="No markets match" detail="Adjust the category filter or clear the search to see the full canonical set." /></HoloPanel>
      ) : view === 'UNIVERSE' ? (
        /* THE UNIVERSE — every category at once, in one board.
           Sectors come from the navigation table, so a category can never be
           quietly dropped from the master view by editing this screen. */
        <div className="col g6 uni">
          {/* Ordered by BREADTH, not by a hand-written list. Whichever sector
              the engine is actually carrying most of leads the board — so the
              master view can never quietly become "crypto and some others"
              because someone reordered a constant. */}
          {[...SECTORS]
            .map((sec) => ({
              sec,
              items: rows
                .filter((m) => sec.categories.includes(m.category))
                .sort((a, b) => Math.abs(b.edgeBps ?? 0) - Math.abs(a.edgeBps ?? 0)),
            }))
            .filter((g) => g.items.length > 0)
            .sort((a, b) => b.items.length - a.items.length)
            .map(({ sec, items }) => {
            return (
              <section key={sec.key} className="uni-sec"
                       style={{ ['--sector' as string]: `var(${sec.accent})` }}>
                <header className="uni-head">
                  <span className="uni-rule" aria-hidden="true" />
                  <button className="uni-title tap" onClick={() => ui.navigate(`sector/${sec.key}`)}>
                    <b>{sec.label}</b>
                    <span className="t-nano">{sec.blurb}</span>
                  </button>
                  <span className="uni-n t-num">{items.length}</span>
                  <button className="btn btn-sm btn-ghost tap"
                          onClick={() => ui.navigate(`sector/${sec.key}`)}>
                    Open<Icon name="chevronR" size={12} />
                  </button>
                </header>
                <div className="mgrid">
                  {items.slice(0, 3).map((m) => (
                    <MarketCard key={m.id} market={m} now={now}
                                picking={picking} pickIndex={picked.indexOf(m.id)}
                                onSelect={(x) => onCardSelect(x.id)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : view === 'EVENT' ? (
        /* Grouped by the event the markets belong to. The grouping comes
           from the engine's event layer, not from parsing titles. */
        <div className="col g4">
          {(() => {
            const shown = new Set(rows.map((m) => m.id));
            const groups = (snapshot.events ?? [])
              .map((e) => ({ event: e, items: e.marketIds
                .filter((id) => shown.has(id))
                .map((id) => rows.find((m) => m.id === id)!)
                .filter(Boolean) }))
              .filter((g) => g.items.length > 0);
            const grouped = new Set(groups.flatMap((g) => g.items.map((m) => m.id)));
            const loose = rows.filter((m) => !grouped.has(m.id));
            return (
              <>
                {groups.map(({ event, items }) => (
                  <section key={event.id} className="mev">
                    <header className="mev-head">
                      <span className={`ue-status status-${event.status === 'LIVE' ? 'live'
                        : event.status === 'CLOSING_SOON' ? 'closing'
                        : event.status === 'SETTLED' ? 'settled' : 'upcoming'}`}>
                        {event.status === 'LIVE' && <i className="dot pulse-dot" />}
                        {event.status.replace('_', ' ').toLowerCase()}
                      </span>
                      <b className="t-body">{event.title}</b>
                      {event.league && <span className="ue-league t-nano">{event.league}</span>}
                      <i className="ue-rule" />
                      <span className="t-nano">{items.length} market{items.length === 1 ? '' : 's'}</span>
                    </header>
                    <HoloPanel grade={2} padded={false}>
                      <div className="mrow-list">
                        {items.map((m) => (
                          <MarketCard key={m.id} market={m} now={now} variant="row"
                                      picking={picking} pickIndex={picked.indexOf(m.id)}
                                      onSelect={(x) => onCardSelect(x.id)} />
                        ))}
                      </div>
                    </HoloPanel>
                  </section>
                ))}
                {loose.length > 0 && (
                  <section className="mev">
                    <header className="mev-head">
                      <b className="t-body">Not attached to a scheduled event</b>
                      <i className="ue-rule" />
                      <span className="t-nano">{loose.length}</span>
                    </header>
                    <HoloPanel grade={2} padded={false}>
                      <div className="mrow-list">
                        {loose.map((m) => (
                          <MarketCard key={m.id} market={m} now={now} variant="row"
                                      picking={picking} pickIndex={picked.indexOf(m.id)}
                                      onSelect={(x) => onCardSelect(x.id)} />
                        ))}
                      </div>
                    </HoloPanel>
                  </section>
                )}
              </>
            );
          })()}
        </div>
      ) : view === 'GRID' ? (
        <div className="mgrid">
          {rows.map((m) => (
            <MarketCard key={m.id} market={m} now={now}
                        picking={picking} pickIndex={picked.indexOf(m.id)}
                        onSelect={(x) => onCardSelect(x.id)} />
          ))}
        </div>
      ) : (
        <HoloPanel grade={2} padded={false}>
          <div className="mrow-list">
            {rows.map((m) => (
              <MarketCard key={m.id} market={m} now={now} variant="row"
                          picking={picking} pickIndex={picked.indexOf(m.id)}
                          onSelect={(x) => onCardSelect(x.id)} />
            ))}
          </div>
        </HoloPanel>
      )}

      {picking && (
        <div className="pickbar glass-02" role="status">
          <span className="t-small pickbar-count">
            {picked.length === 0 ? 'Pick 2 to 4 markets' : `${picked.length} selected`}
          </span>
          <button className="btn btn-sm tap" onClick={() => setPicked([])} disabled={picked.length === 0}>
            Clear
          </button>
          <button className="btn btn-sm btn-primary tap" disabled={picked.length < 2}
                  onClick={() => { ui.openCompare(picked); exitPicking(); }}>
            <Icon name="layers" size={13} />Compare
          </button>
          <button className="icon-btn tap" onClick={exitPicking} aria-label="Exit compare selection">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
