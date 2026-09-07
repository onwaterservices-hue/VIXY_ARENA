import React, { useMemo, useState } from 'react';
import type { ArenaSnapshot } from '../../types';
import { HoloPanel } from '../holographic/HoloPanel';
import { MarketCard } from '../markets/MarketCard';
import { SectionHeader, Empty, StatTile, CategoryChip } from '../common/Primitives';
import { Icon } from '../common/Icon';
import { useArenaUI } from '../common/ui-context';
import { usePrefs } from '../common/prefs-context';
import { SECTORS } from '../../lib/categories';
import { pct, signedPct, untilTime } from '../../lib/format';

/* =============================================================
   WATCHLIST
   -------------------------------------------------------------
   A personal intelligence dashboard assembled from one thing the
   client legitimately owns: which markets this reader starred.

   That list is a VIEW PREFERENCE, not a position — it lives in
   this browser and is the only part of this screen the client
   decides. Every figure beside it comes from the snapshot, and
   the moment a starred market leaves the canonical set the row
   says so rather than showing the last number it remembers.
   ============================================================= */

export function WatchlistScreen({ snapshot, now, onNavigate }: {
  snapshot: ArenaSnapshot; now: number; onNavigate: (id: string) => void;
}) {
  const { prefs, setPref } = usePrefs();
  const ui = useArenaUI();
  const [sort, setSort] = useState<'EDGE' | 'CLOSING' | 'CONFIDENCE'>('EDGE');

  const { watched, missing } = useMemo(() => {
    const found = prefs.watchlist
      .map((id) => snapshot.markets.find((m) => m.id === id))
      .filter(Boolean) as ArenaSnapshot['markets'];
    const gone = prefs.watchlist.filter((id) => !snapshot.markets.some((m) => m.id === id));
    const by = {
      EDGE: (a: typeof found[0], b: typeof found[0]) =>
        Math.abs(b.edgeBps ?? 0) - Math.abs(a.edgeBps ?? 0),
      CLOSING: (a: typeof found[0], b: typeof found[0]) =>
        +new Date(a.closesAt) - +new Date(b.closesAt),
      CONFIDENCE: (a: typeof found[0], b: typeof found[0]) =>
        (b.confidenceBps ?? 0) - (a.confidenceBps ?? 0),
    };
    return { watched: [...found].sort(by[sort]), missing: gone };
  }, [prefs.watchlist, snapshot.markets, sort]);

  const clear = () => setPref('watchlist', []);
  const drop = (id: string) => setPref('watchlist', prefs.watchlist.filter((x) => x !== id));

  const sectors = SECTORS
    .map((s) => ({ s, n: watched.filter((m) => s.categories.includes(m.category)).length }))
    .filter((x) => x.n > 0);

  const closingSoon = watched.filter(
    (m) => +new Date(m.closesAt) - now < 6 * 3_600_000).length;

  return (
    <div className="screen col g5 watch">
      <SectionHeader
        eyebrow="Your board"
        title="Watchlist"
        action={
          watched.length > 0 ? (
            <div className="row g3">
              <div className="seg" role="group" aria-label="Sort">
                {(['EDGE', 'CLOSING', 'CONFIDENCE'] as const).map((k) => (
                  <button key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>{k}</button>
                ))}
              </div>
              <button className="btn btn-sm tap" onClick={clear}>
                <Icon name="close" size={12} />Clear
              </button>
            </div>
          ) : undefined
        } />

      {watched.length === 0 && missing.length === 0 ? (
        <HoloPanel grade={1}>
          <Empty
            title="Nothing on your board yet"
            detail="Star a market anywhere in the Arena and it appears here, with its live numbers beside it." />
          <div className="row g2 wrap" style={{ marginTop: 'var(--s-5)', justifyContent: 'center' }}>
            <button className="btn btn-primary tap" onClick={() => onNavigate('markets')}>
              <Icon name="markets" size={14} />Browse all markets
            </button>
            <button className="btn tap" onClick={() => onNavigate('daily')}>
              <Icon name="spark" size={14} />Today’s slate
            </button>
          </div>
        </HoloPanel>
      ) : (
        <>
          <div className="stat-row">
            <StatTile label="Watching" value={watched.length} sub="markets starred" icon="spark" />
            <StatTile label="Closing within 6h" value={closingSoon}
                      sub={closingSoon ? 'act before close' : 'nothing imminent'}
                      tone={closingSoon ? 'warn' : undefined} icon="clock" />
            <StatTile label="Sectors" value={sectors.length}
                      sub={sectors.map((x) => x.s.label).join(' · ') || 'none'} icon="layers" tone="cyan" />
            <StatTile label="Mean edge"
                      value={watched.length
                        ? signedPct(Math.round(watched.reduce((a, m) => a + (m.edgeBps ?? 0), 0) / watched.length))
                        : '--'}
                      sub="across your board" icon="signals" tone="violet" />
          </div>

          {missing.length > 0 && (
            <div className="ac-note ac-note-warn" role="status">
              <Icon name="alert" size={15} />
              <div className="col" style={{ gap: 3, minWidth: 0 }}>
                <b className="t-body">
                  {missing.length} starred market{missing.length === 1 ? ' is' : 's are'} no longer in the canonical set
                </b>
                <span className="t-micro">
                  They may have settled or been withdrawn by the venue. Their last known numbers
                  are not shown, because a remembered number is not a live one.
                </span>
              </div>
              <button className="btn btn-sm tap"
                      onClick={() => setPref('watchlist', prefs.watchlist.filter(
                        (id) => snapshot.markets.some((m) => m.id === id)))}>
                Remove
              </button>
            </div>
          )}

          {watched.length > 0 && (
            <>
              <div className="mgrid">
                {watched.map((m) => (
                  <MarketCard key={m.id} market={m} now={now} onSelect={(x) => ui.openMarket(x.id)} />
                ))}
              </div>

              <HoloPanel grade={2} eyebrow="At a glance" title="Your board, in one line each" padded={false}>
                <ul className="wl-list">
                  {watched.map((m) => (
                    <li key={m.id}>
                      <button className="wl-row tap" onClick={() => ui.openMarket(m.id)}>
                        <CategoryChip category={m.category} />
                        <span className="wl-title">{m.title}</span>
                        <span className="t-num">{pct(m.marketProbabilityBps)}</span>
                        <span className="t-num vixy">{pct(m.vixyProbabilityBps)}</span>
                        <span className={`t-num ${(m.edgeBps ?? 0) >= 0 ? 'edge-pos' : 'edge-neg'}`}>
                          {signedPct(m.edgeBps)}
                        </span>
                        <span className="t-nano">{untilTime(m.closesAt, now)}</span>
                      </button>
                      <button className="wl-drop tap" aria-label={`Remove ${m.symbol} from watchlist`}
                              onClick={() => drop(m.id)}>
                        <Icon name="close" size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              </HoloPanel>
            </>
          )}
        </>
      )}

      <p className="lb-note">
        <Icon name="alert" size={13} />
        Your watchlist is a view preference stored in this browser. It is not a position, it is
        not sent to the engine, and nothing here places or holds a call.
      </p>
    </div>
  );
}
