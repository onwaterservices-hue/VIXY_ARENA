import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ArenaSnapshot } from '../../types';
import { ROUTES } from '../../constants';
import { Icon, type IconName } from './Icon';
import { useArenaUI } from './ui-context';
import { useFocusTrap } from '../../hooks';
import { pct, signedPct } from '../../lib/format';

/* =============================================================
   COMMAND PALETTE  (⌘K)
   -------------------------------------------------------------
   One input that reaches every screen and every market. A
   terminal should never make you hunt for a thing you can name.
   ============================================================= */

interface Item {
  id: string;
  kind: 'ROUTE' | 'MARKET' | 'ACTION';
  icon: IconName;
  label: string;
  hint?: string;
  trail?: React.ReactNode;
  run: () => void;
}

export function CommandPalette({ snapshot, onClose }: { snapshot: ArenaSnapshot; onClose: () => void }) {
  const ui = useArenaUI();
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const trapRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const items = useMemo<Item[]>(() => {
    const routes: Item[] = ROUTES.filter((r) => !r.hidden).map((r) => ({
      id: `route:${r.id}`, kind: 'ROUTE', icon: r.icon, label: r.label, hint: r.description,
      run: () => { ui.navigate(r.id); onClose(); },
    }));
    const markets: Item[] = snapshot.markets.map((m) => ({
      id: `market:${m.id}`, kind: 'MARKET', icon: 'markets', label: m.title,
      hint: `${m.symbol} · ${m.category.toLowerCase()}`,
      trail: (
        <span className="row g3">
          <span className="t-num">{pct(m.marketProbabilityBps)}</span>
          <span className={`t-num ${(m.edgeBps ?? 0) >= 0 ? 'edge-pos' : 'edge-neg'}`}>{signedPct(m.edgeBps)}</span>
        </span>
      ),
      run: () => { ui.openMarket(m.id); onClose(); },
    }));
    const top = snapshot.opportunities[0];
    const actions: Item[] = [
      {
        id: 'action:top-edge', kind: 'ACTION', icon: 'target', label: 'Open the highest modeled edge',
        hint: top ? `rank 1 · score ${top.edgeScore}` : undefined,
        run: () => { if (top) ui.openMarket(top.marketId); onClose(); },
      },
      {
        id: 'action:scan', kind: 'ACTION', icon: 'search', label: 'Arena Vision — scan a market from a screenshot',
        hint: 'bring VIXY any Kalshi or Polymarket market · ⇧S',
        run: () => { ui.navigate('vision'); onClose(); },
      },
      {
        id: 'action:compare', kind: 'ACTION', icon: 'layers', label: 'Compare the top three edges',
        hint: snapshot.opportunities.slice(0, 3)
          .map((o) => snapshot.markets.find((m) => m.id === o.marketId)?.symbol ?? o.marketId)
          .join(' · ') || undefined,
        run: () => { ui.openCompare(snapshot.opportunities.slice(0, 3).map((o) => o.marketId)); onClose(); },
      },
      {
        id: 'action:brain', kind: 'ACTION', icon: 'brain', label: 'Inspect engine state',
        hint: `${snapshot.brain.state} · ${snapshot.brain.stage}`,
        run: () => { ui.navigate('brain'); onClose(); },
      },
      {
        id: 'action:degraded', kind: 'ACTION', icon: 'refresh', label: 'Show degraded feeds',
        hint: `${snapshot.system.sources.filter((s) => s.status !== 'LIVE').length} not live`,
        run: () => { ui.navigate('telemetry'); onClose(); },
      },
    ];
    return [...actions, ...markets, ...routes];
  }, [snapshot, ui, onClose]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items.slice(0, 12);
    return items
      .filter((i) => `${i.label} ${i.hint ?? ''}`.toLowerCase().includes(needle))
      .slice(0, 14);
  }, [items, q]);

  useEffect(() => { setCursor(0); }, [q]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(filtered.length - 1, c + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    if (e.key === 'Enter') { e.preventDefault(); filtered[cursor]?.run(); }
  };

  useEffect(() => {
    const el = listRef.current?.children[cursor] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  return (
    <div className="sheet-scrim palette-scrim" onClick={onClose}>
      <div ref={trapRef} className="palette glass-03" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-input row g3">
          <Icon name="search" size={16} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
                 placeholder="Search markets, screens, actions…" aria-label="Command palette search" />
          <kbd>esc</kbd>
        </div>
        <ul className="palette-list vx-scroll" ref={listRef}>
          {filtered.length === 0 && <li className="palette-empty t-small">Nothing matches “{q}”.</li>}
          {filtered.map((item, i) => (
            <li key={item.id}>
              <button className={`palette-row tap ${i === cursor ? 'is-cursor' : ''}`}
                      onMouseEnter={() => setCursor(i)} onClick={item.run}>
                <span className="palette-ico"><Icon name={item.icon} size={14} /></span>
                <span className="col grow" style={{ gap: 0, alignItems: 'flex-start', minWidth: 0 }}>
                  <span className="palette-label">{item.label}</span>
                  {item.hint && <span className="t-nano">{item.hint}</span>}
                </span>
                {item.trail}
                <span className="palette-kind t-nano">{item.kind}</span>
              </button>
            </li>
          ))}
        </ul>
        <footer className="palette-foot row between">
          <span className="t-nano">↑↓ move · ⏎ open · esc close</span>
          <span className="t-nano">{filtered.length} results</span>
        </footer>
      </div>
    </div>
  );
}
