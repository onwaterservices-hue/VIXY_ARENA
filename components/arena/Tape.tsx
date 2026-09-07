import React from 'react';
import type { CanonicalMarket } from '../../types';
import { pct, signedPct } from '../../lib/format';
import { useArenaUI } from '../common/ui-context';

/* A running strip of the latest canonical prints. Presentation of
   values the snapshot already carries — no separate polling. */
export function Tape({ markets }: { markets: CanonicalMarket[] }) {
  const ui = useArenaUI();
  const items = markets.slice(0, 14);
  const row = (keySuffix: string, mirrored = false) =>
    items.map((m) => (
      <button key={`${m.id}-${keySuffix}`} className="tape-item tap" onClick={() => ui.openMarket(m.id)}
              tabIndex={mirrored ? -1 : 0} aria-hidden={mirrored || undefined}
              aria-label={`Open ${m.title}`}>
        <span className="tape-sym">{m.symbol}</span>
        <span className="t-num">{pct(m.marketProbabilityBps)}</span>
        <span className={`tape-edge ${(m.edgeBps ?? 0) >= 0 ? 'up' : 'down'}`}>{signedPct(m.edgeBps)}</span>
        <span className={`tape-dot ${m.health.status === 'LIVE' ? 'live' : 'off'}`} />
      </button>
    ));

  return (
    <div className="tape glass-01" aria-label="Latest canonical prints">
      <span className="tape-label t-nano">TAPE</span>
      <div className="tape-track">
        <div className="tape-run">{row('a')}</div>
        <div className="tape-run" aria-hidden="true">{row('b', true)}</div>
      </div>
    </div>
  );
}
