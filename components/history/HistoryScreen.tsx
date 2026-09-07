import React, { useMemo, useState } from 'react';
import type { ArenaSnapshot } from '../../types';
import { HoloPanel } from '../holographic/HoloPanel';
import { CalibrationCurve } from '../brain/CalibrationCurve';
import { SectionHeader, StatTile, Empty } from '../common/Primitives';
import { pct, signedPct, relTime } from '../../lib/format';
import { Icon } from '../common/Icon';

/* WON / LOST / PUSH / not-yet-resolved each get their own treatment: a
   push folded into the loss styling would read as an incorrect call. */
const resultTone = (result: string | null | undefined) =>
  result === 'WON' ? 'won' : result === 'LOST' ? 'lost' : 'push';

export function HistoryScreen({ snapshot, now }: { snapshot: ArenaSnapshot; now: number }) {
  const [filter, setFilter] = useState<'ALL' | 'WON' | 'LOST' | 'PUSH'>('ALL');
  const settled = useMemo(
    () => snapshot.calls.filter((c) => c.state === 'SETTLED' && (filter === 'ALL' || c.result === filter)),
    [snapshot.calls, filter],
  );
  /* Export is presentation: it writes out exactly what settlement recorded. */
  const exportCsv = () => {
    const header = ['id', 'market_id', 'market', 'direction', 'entry_bps', 'vixy_bps', 'edge_bps',
                    'stake_points', 'state', 'result', 'opened_at', 'settled_at', 'origin'];
    const rows = settled.map((c) => [
      c.id, c.marketId, `"${c.market.replace(/"/g, '""')}"`, c.direction, c.entryBps, c.vixyBps,
      c.edgeBps, c.stakePoints, c.state, c.result ?? '', c.openedAt, c.settledAt ?? '',
      snapshot.health.origin,
    ].join(','));
    const csv = [header.join(','), ...rows].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `vixy-arena-history-${new Date().toISOString().slice(0, 10)}.csv`;
    /* the anchor has to be in the document and the URL has to outlive the
       click, or the download races the revoke in some browsers */
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 0);
  };

  /* The resolution text belongs to the market the call was written against;
     this only pairs the two records, it does not derive anything. */
  const resolutions = useMemo(
    () => settled.map((c) => {
      const market = snapshot.markets.find((m) => m.id === c.marketId);
      if (!market?.resolution) return null;
      return { id: c.id, market: c.market, result: c.result,
               statement: market.resolution.statement, source: market.resolution.source };
    }).filter(Boolean) as { id: string; market: string; result: string | null; statement: string; source: string }[],
    [settled, snapshot.markets],
  );

  /* Counts for display only. The authoritative settled total is the one
     settlement wrote into the portfolio summary — deriving it here would
     disagree with the Portfolio screen the moment a call settles PUSH. */
  const won = snapshot.calls.filter((c) => c.result === 'WON').length;
  const lost = snapshot.calls.filter((c) => c.result === 'LOST').length;

  return (
    <div className="screen col g5">
      <SectionHeader eyebrow="Permanent record" title="History"
        action={
          <div className="row g3">
            <button className="btn btn-sm btn-ghost tap" onClick={exportCsv} disabled={settled.length === 0}>
              <Icon name="arrowDown" size={13} />Export CSV
            </button>
            <div className="seg" role="group" aria-label="Result filter">
              {(['ALL', 'WON', 'LOST', 'PUSH'] as const).map((f) => (
                <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>
              ))}
            </div>
          </div>
        } />

      <div className="stat-row">
        <StatTile label="Settled" value={snapshot.portfolio.settledCalls} sub="verified outcomes" icon="check" />
        <StatTile label="Correct" value={won} sub="model and call agreed with reality" tone="edge" icon="target" />
        <StatTile label="Incorrect" value={lost} sub="recorded, never hidden" tone="risk" icon="close" />
        <StatTile label="Accuracy" value={pct(snapshot.portfolio.accuracyBps, 1)} sub="settled sample" tone="violet" icon="brain" />
      </div>

      <HoloPanel grade={2} padded={false} eyebrow="Audit trail" title="Every call, permanently">
        {settled.length === 0 ? (
          <div className="panel-body"><Empty title="Nothing settled yet" detail="Settled calls are written here by the settlement service and can never be edited." /></div>
        ) : (
          <div className="table-scroll"><table className="data-table dt-history">
            <thead>
              <tr><th>Market</th><th style={{ width: 84 }}>Call</th><th style={{ width: 104 }}>Entry</th>
                  <th style={{ width: 104 }}>VIXY</th><th style={{ width: 96 }}>Edge</th>
                  <th style={{ width: 96 }}>Result</th><th style={{ width: 110, textAlign: 'right' }}>Settled</th></tr>
            </thead>
            <tbody>
              {settled.map((c) => (
                <tr key={c.id}>
                  <td><span className="col" style={{ gap: 0 }}><b>{c.market}</b><span className="t-nano">{c.id}</span></span></td>
                  <td><span className={`dir-tag dir-${c.direction.toLowerCase()}`}>{c.direction}</span></td>
                  <td className="t-num">{pct(c.entryBps)}</td>
                  <td className="t-num vixy">{pct(c.vixyBps)}</td>
                  <td><b className={`t-num ${c.edgeBps >= 0 ? 'edge-pos' : 'edge-neg'}`}>{signedPct(c.edgeBps)}</b></td>
                  <td><span className={`result-tag ${resultTone(c.result)}`}>{c.result ?? '—'}</span></td>
                  <td className="t-nano" style={{ textAlign: 'right' }}>{c.settledAt ? relTime(c.settledAt, now) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </HoloPanel>

      {/* An audit trail is only worth the name if the reader can also see
          what the record was measured against and how well the model has
          been calibrated over the settled sample. Both come from the
          snapshot; neither is recomputed here. */}
      <div className="split-2">
        <HoloPanel grade={2} eyebrow="Reliability" title="Predicted against realized"
                   actions={<span className="pill pill-violet"><i className="dot" />
                     {snapshot.brain.calibrationBins.reduce((a, x) => a + x.count, 0)} settled</span>}>
          <CalibrationCurve bins={snapshot.brain.calibrationBins} />
          <p className="t-small" style={{ marginTop: 'var(--s-3)' }}>
            Each point is a confidence band. On the diagonal, the model's stated confidence
            matched what actually happened in that band. Dot size is how many settled
            observations fall in it, because a bin with four observations is not a finding.
          </p>
        </HoloPanel>

        <HoloPanel grade={2} eyebrow="Resolution" title="What each call was settled against">
          {resolutions.length === 0 ? (
            <Empty title="No resolution criteria yet"
                   detail="A settled call carries the statement and source its outcome was verified against." />
          ) : (
            <ul className="res-list">
              {resolutions.map((r) => (
                <li key={r.id}>
                  <div className="row between g3">
                    <b className="t-small">{r.market}</b>
                    <span className={`result-tag ${resultTone(r.result)}`}>{r.result ?? '—'}</span>
                  </div>
                  <span className="t-nano">{r.statement}</span>
                  <span className="t-nano res-src"><Icon name="admin" size={11} />source of truth · {r.source}</span>
                </li>
              ))}
            </ul>
          )}
        </HoloPanel>
      </div>
    </div>
  );
}
