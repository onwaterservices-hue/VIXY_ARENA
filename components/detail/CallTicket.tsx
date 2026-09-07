import React, { useState } from 'react';
import type { CallRecord, CanonicalMarket, Direction } from '../../types';
import { EdgeLadder } from '../holographic/Meters';
import { Icon } from '../common/Icon';
import { useFocusTrap } from '../../hooks';
import { pct, signedPct, untilTime } from '../../lib/format';

const STAKES = [50, 100, 250, 500];

/* =============================================================
   CALL TICKET
   -------------------------------------------------------------
   The client proposes; the engine decides. The entry price shown
   after submission is the one the server wrote, which is not
   necessarily the price on screen when the button was pressed.
   That gap is displayed, not hidden.
   ============================================================= */
export function CallTicket({
  market, initialDirection, pointsBalance, now, onSubmit, onClose, onShare,
}: {
  market: CanonicalMarket;
  initialDirection: Direction;
  pointsBalance: number;
  now: number;
  onSubmit: (direction: Direction, stake: number) => Promise<CallRecord>;
  onClose: () => void;
  onShare: (record: CallRecord) => void;
}) {
  const [direction, setDirection] = useState<Direction>(initialDirection === 'WAIT' ? 'YES' : initialDirection);
  const [stake, setStake] = useState(100);
  const [state, setState] = useState<'IDLE' | 'SUBMITTING' | 'DONE' | 'ERROR'>('IDLE');
  const [record, setRecord] = useState<CallRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trapRef = useFocusTrap<HTMLDivElement>();

  const priceOnScreen = market.marketProbabilityBps;

  const submit = async () => {
    setState('SUBMITTING');
    setError(null);
    try {
      const r = await onSubmit(direction, stake);
      setRecord(r);
      setState('DONE');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState('ERROR');
    }
  };

  const slip = record && priceOnScreen !== null ? record.entryBps - priceOnScreen : 0;

  return (
    <div className="sheet-scrim modal-scrim" onClick={onClose}>
      <div ref={trapRef} className="ticket glass-03 brackets" onClick={(e) => e.stopPropagation()}
           role="dialog" aria-modal="true" aria-label="Make a call">
        <i className="bk bk-tl" /><i className="bk bk-tr" /><i className="bk bk-bl" /><i className="bk bk-br" />

        <header className="row between g3">
          <div className="col" style={{ gap: 2 }}>
            <span className="t-label">{state === 'DONE' ? 'Call recorded' : 'Make the call'}</span>
            <h3 className="t-h2">{market.symbol}</h3>
          </div>
          <button className="icon-btn tap" onClick={onClose} aria-label="Close"><Icon name="close" size={15} /></button>
        </header>

        <p className="ticket-title t-h3">{market.title}</p>

        {state !== 'DONE' && (
          <>
            <div className="ticket-dir">
              {(['YES', 'NO'] as Direction[]).map((d) => (
                <button key={d} className={`dir-btn tap dir-${d.toLowerCase()} ${direction === d ? 'is-active' : ''}`}
                        onClick={() => setDirection(d)} aria-pressed={direction === d}>
                  <Icon name={d === 'YES' ? 'arrowUp' : 'arrowDown'} size={16} />
                  <span>{d}</span>
                  <small>{d === 'YES' ? 'resolves true' : 'resolves false'}</small>
                </button>
              ))}
            </div>

            <EdgeLadder marketBps={market.marketProbabilityBps} vixyBps={market.vixyProbabilityBps}
                        edgeBps={market.edgeBps} size="sm" showScale={false} />

            <div className="ticket-facts">
              <div><span className="t-label">Market</span><b className="t-num">{pct(market.marketProbabilityBps)}</b></div>
              <div><span className="t-label">VIXY</span><b className="t-num vixy">{pct(market.vixyProbabilityBps)}</b></div>
              <div><span className="t-label">Edge</span>
                <b className={`t-num ${(market.edgeBps ?? 0) >= 0 ? 'edge-pos' : 'edge-neg'}`}>{signedPct(market.edgeBps)}</b></div>
              <div><span className="t-label">Closes</span><b className="t-num">{untilTime(market.closesAt, now)}</b></div>
            </div>

            <div className="col g3">
              <div className="row between">
                <span className="t-label">Stake · virtual points</span>
                <span className="t-nano">balance {pointsBalance.toLocaleString()}</span>
              </div>
              <div className="row g2 wrap">
                {STAKES.map((s) => (
                  <button key={s} className={`fchip tap ${stake === s ? 'is-active' : ''}`}
                          onClick={() => setStake(s)} disabled={s > pointsBalance}>{s}</button>
                ))}
                <input className="stake-range" type="range" min={10} max={Math.max(10, Math.min(1000, pointsBalance))}
                       step={10} value={stake} aria-label="Stake"
                       onChange={(e) => setStake(Number(e.target.value))} />
                <span className="t-num stake-value">{stake}</span>
              </div>
            </div>

            {error && <div className="notice notice-bad" role="alert"><Icon name="close" size={13} /><span className="t-small">{error}</span></div>}

            <button className={`btn btn-primary tap ticket-submit ${direction === 'NO' ? 'btn-neg' : ''}`}
                    onClick={submit} disabled={state === 'SUBMITTING'}>
              {state === 'SUBMITTING'
                ? <><span className="spin" />Submitting to engine…</>
                : <><Icon name="lock" size={15} />Submit {direction} · {stake} pts</>}
            </button>

            <p className="t-nano ticket-note">
              Virtual points only. No wagering, no payout, no cash value. The engine assigns the
              entry price at acceptance and settles against a verified source of truth.
            </p>
          </>
        )}

        {/* the outcome of the submission arrives after an await, so it has
            to be announced rather than only rendered */}
        {state === 'DONE' && record && (
          <div className="col g4 ticket-done" role="status" aria-live="polite">
            <div className="ticket-stamp">
              <Icon name="check" size={20} />
              <div className="col" style={{ gap: 0 }}>
                <b className="t-h3">Recorded and immutable</b>
                <span className="t-nano">{record.id}</span>
              </div>
            </div>

            <div className="ticket-facts">
              <div><span className="t-label">Call</span><b className={`dir-tag dir-${record.direction.toLowerCase()}`}>{record.direction}</b></div>
              <div><span className="t-label">Entry written</span><b className="t-num">{pct(record.entryBps)}</b></div>
              <div><span className="t-label">VIXY at entry</span><b className="t-num vixy">{pct(record.vixyBps)}</b></div>
              <div><span className="t-label">Stake</span><b className="t-num">{record.stakePoints}</b></div>
            </div>

            {Math.abs(slip) > 0 && (
              <div className="notice">
                <Icon name="refresh" size={13} />
                <span className="t-small">
                  You saw {pct(priceOnScreen)}; the engine wrote {pct(record.entryBps)} —
                  a {signedPct(slip)} difference. The server's price is the record.
                </span>
              </div>
            )}

            <div className="row g3">
              <button className="btn btn-primary tap grow" onClick={() => onShare(record)}>
                <Icon name="spark" size={15} />Make the receipt
              </button>
              <button className="btn tap" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
