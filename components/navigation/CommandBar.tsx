import React from 'react';
import type { ArenaSnapshot, DataOrigin } from '../../types';
import { PINNED_SYMBOLS, PRODUCT, ROUTE_MAP } from '../../constants';
import { Icon } from '../common/Icon';
import { OriginBadge, StatusPill } from '../common/Primitives';
import { Sparkline } from '../holographic/Sparkline';
import { Wordmark } from './Wordmark';
import { useArenaUI } from '../common/ui-context';
import { pct, signedPct } from '../../lib/format';

/* Global command bar: identity, system status, pinned market chips,
   account actions. Values are read from the snapshot — the bar never
   fetches and never derives status. */
export function CommandBar({
  snapshot, origin, sourceLabel, route, onNavigate, compact, onOpenPalette, onOpenNotifications,
  onOpenScan, unread, hideMarkets = false,
}: {
  snapshot: ArenaSnapshot | null; origin: DataOrigin; sourceLabel: string;
  route: string; onNavigate: (id: string) => void; compact: boolean;
  onOpenPalette: () => void;
  onOpenNotifications: () => void;
  onOpenScan: () => void;
  unread: number;
  /** True while the access gate is engaged: coverage may show, prices may not. */
  hideMarkets?: boolean;
}) {
  const ui = useArenaUI();
  /* A locked terminal must not leak prices through its own chrome. */
  const all = snapshot?.markets ?? [];
  const pinned = all.filter((m) => PINNED_SYMBOLS.includes(m.symbol));
  const ranked = [...all].filter((m) => m.edgeBps !== null).sort((a, b) => Math.abs(b.edgeBps!) - Math.abs(a.edgeBps!));
  const chips = hideMarkets ? [] : (pinned.length ? pinned : ranked.length ? ranked : all).slice(0, 5);
  const systemStatus = snapshot?.health.status ?? 'UNKNOWN';
  const current = ROUTE_MAP[route];

  return (
    <header className="cmdbar">
      <div className="cmdbar-left row g4">
        <button className="wordmark-btn tap" onClick={() => onNavigate('arena')} aria-label="VIXY Arena home">
          <Wordmark compact={compact} />
        </button>
        {/* The origin badge is never dropped for space: a phone reader deserves
            the same DEMO warning as a desktop reader. Only the status pill folds. */}
        <div className="row g3 cmd-status">
          {!compact && <StatusPill status={systemStatus} label={systemStatus === 'LIVE' ? 'System online' : systemStatus} />}
          <OriginBadge origin={origin} label={sourceLabel} />
        </div>
      </div>

      <div className="cmdbar-center vx-scroll-x">
        {chips.length === 0
          ? compact ? null : <span className="t-nano">
              {hideMarkets ? 'prices unlock inside' : snapshot ? 'no markets on the board' : 'awaiting first snapshot'}
            </span>
          : chips.map((m) => {
            /* The state word is the engine's grade for this market, not a
               judgement the bar formed from the number beside it. */
            const side = m.momentum?.side ?? 'NEUTRAL';
            const band = m.momentum?.band ?? 'NONE';
            /* Without a momentum read, the edge sign is the engine's own word on the market. */
            const word = band === 'NONE' ? (m.edgeBps === null ? 'no read' : m.edgeBps > 0 ? 'model above' : m.edgeBps < 0 ? 'model below' : 'level')
              : band === 'LEVEL' ? 'level'
              : side === 'UP' ? 'momentum'
              : side === 'DOWN' ? 'pressure'
              : 'watch';
            return (
              <button key={m.id} className={`mchip glass-01 tap side-${side.toLowerCase()}`}
                      onClick={() => ui.openMarket(m.id)} title={m.title}>
                <i className={`mchip-flag status-${m.health.status.toLowerCase()}`} aria-hidden="true" />
                <span className="mchip-sym">{m.symbol}</span>
                <span className="mchip-val t-num">{pct(m.marketProbabilityBps, 1)}</span>
                <Sparkline series={m.series.slice(-22)} width={44} height={16} fill={false}
                           tone={(m.edgeBps ?? 0) >= 0 ? 'edge' : 'risk'} strokeWidth={1.2} />
                <span className={`mchip-state side-${side.toLowerCase()}`}>{word}</span>
                <span className={`mchip-edge ${(m.edgeBps ?? 0) >= 0 ? 'up' : 'down'}`}>
                  {signedPct(m.edgeBps, 1)}
                </span>
              </button>
            );
          })}
      </div>

      <div className="cmdbar-right row g2">
        {/* The flagship action sits in the global bar, on every screen.
            It is the shortest path from "I saw a market somewhere" to
            "what does VIXY think about it". */}
        <button className="scan-cta tap" onClick={onOpenScan}
                title="Arena Vision — drop a Kalshi or Polymarket screenshot and VIXY reads it (⇧S)">
          <Icon name="search" size={14} />
          <span className="scan-cta-label">Arena Vision</span>
        </button>
        {!compact && current && (
          <span className="cmd-route t-nano" title={current.description}>{current.label}</span>
        )}
        <button className="cmd-search tap" aria-label="Search markets and screens" onClick={onOpenPalette}>
          <Icon name="search" size={14} />
          {!compact && <><span>Search</span><kbd>⌘K</kbd></>}
        </button>
        <button className="icon-btn tap notif" aria-label={`Notifications (${unread})`}
                onClick={onOpenNotifications}>
          <Icon name="bell" size={16} />{unread > 0 && <i />}
        </button>
        <button className="icon-btn tap" aria-label="Settings" onClick={() => onNavigate('settings')}>
          <Icon name="settings" size={16} />
        </button>
        <button className="avatar tap" aria-label="Your profile"
                title="Your profile" onClick={() => onNavigate('profile')}>
          <span className="avatar-ring" />
          <Icon name="user" size={15} />
        </button>
      </div>
    </header>
  );
}

/* Bottom telemetry strip. Metadata only — never a control surface. */
export function TelemetryBar({ snapshot, clock }: { snapshot: ArenaSnapshot | null; clock: string }) {
  const s = snapshot?.system;
  const b = snapshot?.brain;
  return (
    <footer className="telebar" aria-label="System telemetry">
      <span className="t-nano">{PRODUCT.build}</span>
      <i className="tb-sep" />
      <span className="t-nano">model {b?.modelVersion ?? '—'}</span>
      <i className="tb-sep" />
      <span className="t-nano">ingest lag {s ? `${s.ingestLagMs}ms` : '—'}</span>
      <i className="tb-sep" />
      <span className="t-nano">match queue {s?.matchQueue ?? '—'}</span>
      <i className="tb-sep" />
      <span className="t-nano">settlement queue {s?.settlementQueue ?? '—'}</span>
      <span className="grow" />
      <span className="t-nano">inference {b ? `${b.inferencesPerMin}/min` : '—'}</span>
      <i className="tb-sep" />
      <span className="t-nano">{clock}</span>
    </footer>
  );
}
