import React, { useMemo, useState } from 'react';
import type { ArenaSnapshot, CallRecord } from '../../types';
import { HoloPanel } from '../holographic/HoloPanel';
import { MarketCard } from '../markets/MarketCard';
import { SignalStream } from '../signals/SignalStream';
import { LivePrediction } from './LivePrediction';
import { Tape } from './Tape';
import { SectionHeader, StatTile, StatusPill, CategoryChip, Empty } from '../common/Primitives';
import { Icon } from '../common/Icon';
import { useArenaUI } from '../common/ui-context';
import { pct, signedPct, relTime, untilTime } from '../../lib/format';

/* =============================================================
   LIVE — THE SCORE CENTER
   -------------------------------------------------------------
   A live-score page, not a dashboard. It answers, in order, the
   four questions someone opening it actually has:

     what is on right now
     what is moving
     what was just called
     what has finished

   Every section reads engine-issued fields. The client orders
   them; it never decides that something is live, locked or done.
   ============================================================= */

function LiveEventStrip({ snapshot, now }: { snapshot: ArenaSnapshot; now: number }) {
  const ui = useArenaUI();
  const live = (snapshot.events ?? []).filter((e) => e.status === 'LIVE');

  if (live.length === 0) {
    return (
      <HoloPanel grade={1} eyebrow="Under way now" title="Live events">
        <Empty title="Nothing under way"
               detail="No event on the schedule has started yet. Up Next has the full calendar." />
      </HoloPanel>
    );
  }

  return (
    <section className="col g3">
      <header className="row between g3">
        <span className="t-label">Under way now</span>
        <span className="t-nano">{live.length} event{live.length === 1 ? '' : 's'}</span>
      </header>
      <ul className="le-strip">
        {live.map((e) => {
          const markets = e.marketIds
            .map((id) => snapshot.markets.find((m) => m.id === id))
            .filter(Boolean) as ArenaSnapshot['markets'];
          const lead = [...markets].sort(
            (a, b) => Math.abs(b.edgeBps ?? 0) - Math.abs(a.edgeBps ?? 0))[0] ?? null;
          return (
            <li key={e.id}>
              <button className="le-card glass-02 lift tap"
                      onClick={() => lead && ui.openMarket(lead.id)}>
                <span className="le-top">
                  <span className="le-live"><i className="dot pulse-dot" />Live</span>
                  <CategoryChip category={e.category} />
                  {e.league && <span className="t-nano">{e.league}</span>}
                </span>
                <b className="le-title">{e.title}</b>
                {lead ? (
                  <span className="le-nums">
                    <span className="col"><span className="t-label">Market</span>
                      <b className="t-num">{pct(lead.marketProbabilityBps)}</b></span>
                    <span className="col"><span className="t-label">VIXY</span>
                      <b className="t-num vixy">{pct(lead.vixyProbabilityBps)}</b></span>
                    <span className="col"><span className="t-label">Edge</span>
                      <b className={`t-num ${(lead.edgeBps ?? 0) >= 0 ? 'edge-pos' : 'edge-neg'}`}>
                        {signedPct(lead.edgeBps)}</b></span>
                  </span>
                ) : <span className="t-nano">No market priced yet</span>}
                <span className="le-foot t-nano">
                  {e.marketIds.length} market{e.marketIds.length === 1 ? '' : 's'}
                  {lead && <> · closes {untilTime(lead.closesAt, now)}</>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CallRow({ call, now }: { call: CallRecord; now: number }) {
  const ui = useArenaUI();
  const tone = call.result === 'WON' ? 'won' : call.result === 'LOST' ? 'lost' : 'open';
  return (
    <li className={`lc-row tone-${tone}`}>
      <button className="lc-hit tap" onClick={() => ui.openMarket(call.marketId)}>
        <span className={`lc-state ${call.state.toLowerCase()}`}>
          <Icon name={call.state === 'SETTLED' ? 'check' : 'lock'} size={11} />
          {call.result ?? call.state}
        </span>
        <span className="lc-market">{call.market}</span>
        <span className="lc-dir">{call.direction}</span>
        <span className="lc-num t-num">{pct(call.entryBps)}</span>
        <span className={`lc-num t-num ${call.edgeBps >= 0 ? 'edge-pos' : 'edge-neg'}`}>
          {signedPct(call.edgeBps)}
        </span>
        <span className="lc-when t-nano">
          {relTime(call.settledAt ?? call.openedAt, now)}
        </span>
      </button>
    </li>
  );
}

export function LiveScreen({ snapshot, now }: { snapshot: ArenaSnapshot; now: number }) {
  const [selectedId, setSelectedId] = useState(snapshot.markets[0]?.id ?? '');
  const [timeframe, setTimeframe] = useState('5M');
  const market = snapshot.markets.find((m) => m.id === selectedId) ?? snapshot.markets[0];

  const movers = useMemo(
    () => [...snapshot.markets].sort((a, b) => Math.abs(b.edgeBps ?? 0) - Math.abs(a.edgeBps ?? 0)),
    [snapshot.markets],
  );
  /* One health envelope. This counts the same thing the SourceBanner
     counts — sources the server marked non-LIVE — so the banner and this
     tile can never disagree. Markets carrying the downgrade are the sub. */
  const degradedSources = snapshot.system.sources.filter((s) => s.status !== 'LIVE');
  const downgradedMarkets = snapshot.markets.filter((m) => m.health.status !== 'LIVE');
  const liveEvents = (snapshot.events ?? []).filter((e) => e.status === 'LIVE');

  /* Locked and settled are engine states on the call record. The screen
     reads them; it never infers one from a timestamp. */
  const justLocked = snapshot.calls.filter((c) => c.state === 'LOCKED').slice(0, 6);
  const settled = snapshot.calls
    .filter((c) => c.state === 'SETTLED')
    .sort((a, b) => +new Date(b.settledAt ?? 0) - +new Date(a.settledAt ?? 0))
    .slice(0, 6);

  return (
    <div className="screen col g6">
      <SectionHeader eyebrow="Everything happening right now" title="Live"
        action={
          <div className="row g3">
            <StatusPill status={snapshot.health.status} label="Stream live" />
            <button className="btn btn-sm tap" onClick={() => window.dispatchEvent(new CustomEvent('vixy:broadcast'))}>
              <Icon name="live" size={13} />Broadcast mode
            </button>
          </div>
        } />

      <Tape markets={movers} />

      <div className="stat-row">
        <StatTile label="Events under way" value={liveEvents.length} sub="from the schedule"
                  icon="live" tone={liveEvents.length ? 'risk' : undefined} />
        <StatTile label="Markets streaming" value={snapshot.markets.length} sub="canonical" icon="markets" />
        <StatTile label="Degraded sources" value={degradedSources.length}
                  sub={degradedSources.length
                    ? `${degradedSources.map((s) => s.label).join(', ')} · ${downgradedMarkets.length} market${downgradedMarkets.length === 1 ? '' : 's'} downgraded`
                    : 'all sources fresh'}
                  tone={degradedSources.length ? 'warn' : 'edge'} icon="refresh" />
        <StatTile label="Events / min"
                  value={snapshot.system.sources.reduce((a, s) => a + s.throughputPerMin, 0)}
                  sub="ingest throughput" icon="signals" tone="cyan" />
      </div>

      {/* 1 — what is on */}
      <LiveEventStrip snapshot={snapshot} now={now} />

      {/* 2 — what is moving */}
      <LivePrediction market={market} markets={snapshot.markets} onSelectMarket={setSelectedId}
                      timeframe={timeframe} onTimeframe={setTimeframe} now={now} />

      <div className="split-2">
        <HoloPanel grade={2} eyebrow="Ordered by absolute modeled edge" title="Biggest edge moves" padded={false}>
          <div className="mrow-list">
            {movers.slice(0, 8).map((m) => (
              <MarketCard key={m.id} market={m} now={now} variant="row"
                          selected={m.id === selectedId} onSelect={(x) => setSelectedId(x.id)} />
            ))}
          </div>
        </HoloPanel>
        <HoloPanel grade={2} eyebrow="Engine telemetry" title="New signals" padded={false} scan>
          <SignalStream events={snapshot.signals} limit={11} now={now} announce />
        </HoloPanel>
      </div>

      {/* 3 and 4 — what was called, what has finished */}
      <div className="split-2">
        <HoloPanel grade={2} eyebrow="Official calls on the record" title="Just locked" padded={false}>
          {justLocked.length === 0 ? (
            <div style={{ padding: 'var(--s-5)' }}>
              <Empty title="No calls locked" detail="A call locks when the engine writes it to the record." />
            </div>
          ) : (
            <ul className="lc-list">
              {justLocked.map((c) => <CallRow key={c.id} call={c} now={now} />)}
            </ul>
          )}
        </HoloPanel>
        <HoloPanel grade={2} eyebrow="Final scores" title="Settled" padded={false}>
          {settled.length === 0 ? (
            <div style={{ padding: 'var(--s-5)' }}>
              <Empty title="Nothing settled yet" detail="Results appear here as the engine resolves each event." />
            </div>
          ) : (
            <ul className="lc-list">
              {settled.map((c) => <CallRow key={c.id} call={c} now={now} />)}
            </ul>
          )}
        </HoloPanel>
      </div>
    </div>
  );
}
