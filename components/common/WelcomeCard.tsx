import React from 'react';
import type { ArenaSnapshot } from '../../types';
import { Icon } from './Icon';
import { useArenaUI } from './ui-context';
import { pct, signedPct } from '../../lib/format';

/* =============================================================
   START HERE
   -------------------------------------------------------------
   The first sixty seconds inside. Three things a new reader can
   do right now, each one a real action on real engine output,
   and a close button that makes it never come back.
   ============================================================= */

export function WelcomeCard({ snapshot, handle, onDismiss }: {
  snapshot: ArenaSnapshot; handle: string | null; onDismiss: () => void;
}) {
  const ui = useArenaUI();
  const top = snapshot.opportunities[0] ?? null;
  const topMarket = top ? snapshot.markets.find((m) => m.id === top.marketId) ?? null : null;
  const slate = snapshot.slate ?? null;

  return (
    <section className="welcome glass-03 brackets" aria-label="Start here">
      <i className="bk bk-tl" /><i className="bk bk-tr" /><i className="bk bk-bl" /><i className="bk bk-br" />
      <div className="welcome-head">
        <div className="col" style={{ gap: 3, minWidth: 0 }}>
          <span className="t-label">Start here</span>
          <h2 className="t-h3">{handle ? `Welcome in, ${handle}.` : 'Welcome in.'} Three ways to begin.</h2>
        </div>
        <button className="icon-btn tap" onClick={onDismiss} aria-label="Dismiss"><Icon name="close" size={14} /></button>
      </div>
      <div className="welcome-grid">
        <button className="welcome-item tap" onClick={() => ui.navigate('vision')}>
          <span className="welcome-ico"><Icon name="search" size={16} /></span>
          <b>Bring VIXY a market</b>
          <span>Screenshot any panel on Kalshi or Polymarket and drop it on Arena Vision.</span>
        </button>
        <button className="welcome-item tap" onClick={() => topMarket && ui.openMarket(topMarket.id)} disabled={!topMarket}>
          <span className="welcome-ico"><Icon name="target" size={16} /></span>
          <b>See the widest disagreement</b>
          <span>
            {topMarket
              ? <>{topMarket.title} — market {pct(topMarket.marketProbabilityBps)}, VIXY {pct(topMarket.vixyProbabilityBps)} ({signedPct(topMarket.edgeBps)})</>
              : 'The engine has not ranked an opportunity yet.'}
          </span>
        </button>
        <button className="welcome-item tap" onClick={() => ui.navigate('daily')}>
          <span className="welcome-ico"><Icon name="spark" size={16} /></span>
          <b>Work today’s slate</b>
          <span>{slate ? `${slate.total} objectives that reward analysis, not volume. ${slate.completed} met so far.` : 'A card of markets and objectives, published daily.'}</span>
        </button>
      </div>
    </section>
  );
}
