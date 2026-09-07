import React from 'react';
import type { ArenaSnapshot, CallRecord } from '../../types';
import { HoloPanel } from '../holographic/HoloPanel';
import { Gauge } from '../holographic/Gauge';
import { EdgeLadder } from '../holographic/Meters';
import { Empty } from '../common/Primitives';
import { FormIndicator } from '../broadcast/BroadcastPrimitives';
import { Icon } from '../common/Icon';
import { useArenaUI } from '../common/ui-context';
import { pct, signedPct, relTime, untilTime } from '../../lib/format';

/* =============================================================
   PORTFOLIO — the record card
   -------------------------------------------------------------
   One card that reads like a player card: points, accuracy,
   streak, calibration, form. Then the calls still in play.

   Every number is the engine's. Accuracy and calibration come
   from settlement; the streak and the form line are the
   portfolio summary's own fields; the slate streak is the daily
   slate's. Nothing is added up here.
   ============================================================= */

const STATE_TONE: Record<CallRecord['state'], string> = {
  OPEN: 'violet', LOCKED: 'cyan', SETTLED: 'edge', VOID: 'unknown',
};

export function PortfolioScreen({ snapshot, now }: { snapshot: ArenaSnapshot; now: number }) {
  const ui = useArenaUI();
  const p = snapshot.portfolio;
  const best = snapshot.opportunities[0];
  const open = snapshot.calls.filter((c) => c.state !== 'SETTLED' && c.state !== 'VOID');
  const me = snapshot.leaderboard.find((e) => e.isYou) ?? null;
  const slate = snapshot.slate ?? null;
  const nextLock = [...open]
    .map((c) => snapshot.markets.find((m) => m.id === c.marketId))
    .filter(Boolean)
    .sort((a, b) => +new Date(a!.closesAt) - +new Date(b!.closesAt))[0] ?? null;

  return (
    <div className="screen col g5 pfo">
      {/* ---------- THE RECORD CARD ---------- */}
      <section className="pfo-card glass-03 brackets">
        <i className="bk bk-tl" /><i className="bk bk-tr" /><i className="bk bk-bl" /><i className="bk bk-br" />

        <div className="pfo-gauge">
          <Gauge valueBps={p.accuracyBps} label="Accuracy" sub={`${p.settledCalls} settled`} size={168} tone="edge" />
        </div>

        <div className="pfo-main">
          <span className="t-label">Your record</span>
          <div className="pfo-points">
            <b className="t-num">{p.pointsBalance.toLocaleString()}</b>
            <span className="t-nano">points · virtual · no cash value</span>
          </div>
          <div className="pfo-row">
            {me && <span className="t-small">Ranked <b className="t-num">#{me.rank}</b> of {snapshot.leaderboard.length}</span>}
            <FormIndicator form={p.form} label="Form" />
          </div>
        </div>

        <ul className="pfo-stats">
          <li><span className="t-nano">Streak</span><b className="t-num tone-warn">{p.streak}</b><span className="t-nano">correct in a row</span></li>
          <li><span className="t-nano">Calibration</span><b className="t-num">{pct(p.calibrationBps, 1)}</b><span className="t-nano">said vs happened</span></li>
          <li><span className="t-nano">In play</span><b className="t-num tone-cyan">{p.openCalls + p.lockedCalls}</b><span className="t-nano">{p.openCalls} open · {p.lockedCalls} locked</span></li>
          <li><span className="t-nano">Slate streak</span><b className="t-num">{slate ? slate.streakDays : '--'}</b><span className="t-nano">{slate ? `best ${slate.bestStreakDays}` : 'no slate'}</span></li>
        </ul>

        <div className="pfo-cta">
          {best && (
            <button className="btn btn-primary tap"
                    onClick={() => ui.openCall(best.marketId, best.direction === 'NO' ? 'NO' : 'YES')}>
              <Icon name="target" size={14} />Call the top edge
            </button>
          )}
          <button className="btn tap" onClick={() => ui.navigate('history')}>
            <Icon name="history" size={14} />History
          </button>
        </div>
      </section>

      {/* ---------- WHAT LOCKS NEXT ---------- */}
      {nextLock && (
        <button className="pfo-next glass-01 lift tap" onClick={() => ui.openMarket(nextLock.id)}>
          <span className="t-label"><Icon name="clock" size={12} />Closes next among your calls</span>
          <b className="t-body">{nextLock.title}</b>
          <span className="t-num">{untilTime(nextLock.closesAt, now)}</span>
        </button>
      )}

      {/* ---------- IN PLAY ---------- */}
      <HoloPanel grade={2} eyebrow="In play" title="Open and locked calls" padded={false}>
        {open.length === 0 ? (
          <div className="panel-body col center g4">
            <Empty title="Nothing in play" detail="Calls you make in the Arena sit here until settlement writes the outcome." />
            <button className="btn btn-primary tap" onClick={() => ui.navigate('markets')}>
              <Icon name="markets" size={14} />Browse markets
            </button>
          </div>
        ) : (
          <div className="lb-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Market</th><th style={{ width: 84 }}>Call</th><th style={{ width: 200 }}>Entry vs VIXY</th>
                  <th style={{ width: 96 }}>Edge</th><th style={{ width: 92 }}>Stake</th>
                  <th style={{ width: 104 }}>State</th><th style={{ width: 96, textAlign: 'right' }}>Opened</th></tr>
            </thead>
            <tbody>
              {open.map((c) => (
                <tr key={c.id}>
                  <td>
                    <button className="link-row col" style={{ gap: 0, alignItems: 'flex-start' }}
                            onClick={() => ui.openMarket(c.marketId)}>
                      <b>{c.market}</b><span className="t-nano">{c.marketId}</span>
                    </button>
                  </td>
                  <td><span className={`dir-tag dir-${c.direction.toLowerCase()}`}>{c.direction}</span></td>
                  <td><EdgeLadder marketBps={c.entryBps} vixyBps={c.vixyBps} edgeBps={c.edgeBps} size="sm" showScale={false} /></td>
                  <td><b className={`t-num ${c.edgeBps >= 0 ? 'edge-pos' : 'edge-neg'}`}>{signedPct(c.edgeBps)}</b></td>
                  <td className="t-num">{c.stakePoints}</td>
                  <td><span className={`pill pill-${STATE_TONE[c.state] === 'edge' ? 'live' : STATE_TONE[c.state]}`}>
                    <i className="dot" />{c.state}</span></td>
                  <td className="t-nano" style={{ textAlign: 'right' }}>{relTime(c.openedAt, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </HoloPanel>

      <span className="t-nano pfo-foot">
        <Icon name="lock" size={11} /> A locked call is immutable. Outcomes are written by settlement against a verified source; this screen only displays them.
      </span>
    </div>
  );
}
