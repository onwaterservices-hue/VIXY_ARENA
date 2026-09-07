import React from 'react';
import type { LeaderboardEntry } from '../../types';
import { pct } from '../../lib/format';
import { Icon } from '../common/Icon';

/* Championship board, not a payout table. Rank movement is the story. */
export function Leaderboard({ entries, limit = 10, podium = true }: {
  entries: LeaderboardEntry[]; limit?: number; podium?: boolean;
}) {
  const top3 = entries.slice(0, 3);
  const rest = entries.slice(podium ? 3 : 0, limit);

  return (
    <div className="col g5">
      {podium && (
        <div className="podium">
          {[1, 0, 2].map((i) => {
            const e = top3[i];
            if (!e) return null;
            return (
              <div key={e.handle} className={`podium-slot glass-02 rank-${e.rank} ${e.isYou ? 'is-you' : ''}`}>
                <span className="podium-glow" aria-hidden="true" />
                <span className="podium-rank t-num">{e.rank}</span>
                <span className="podium-handle">{e.handle}</span>
                <span className="podium-tier t-nano">{e.tier}</span>
                <span className="podium-acc t-num">{pct(e.accuracyBps, 1)}</span>
                <span className="t-label">accuracy</span>
                <span className="podium-meta row g3">
                  <span className="t-nano">{e.predictions} calls</span>
                  <span className="t-nano streak"><Icon name="flame" size={10} />{e.streak}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* A table is the right shape for standings and the wrong shape for a
          phone. Rather than restructure the data, the table keeps its columns
          and scrolls inside its own box — the page never scrolls sideways. */}
      <div className="lb-scroll vx-scroll-x">
      <table className="lb-table">
        <thead>
          <tr>
            <th style={{ width: 52 }}>Rank</th>
            <th>Player</th>
            <th style={{ width: 110 }}>Accuracy</th>
            <th style={{ width: 96 }}>Predictions</th>
            <th style={{ width: 80 }}>Streak</th>
            <th style={{ width: 92, textAlign: 'right' }}>Score</th>
          </tr>
        </thead>
        <tbody>
          {rest.map((e) => (
            <tr key={e.handle} className={e.isYou ? 'is-you' : ''}>
              <td>
                <span className="row g2">
                  <b className="t-num">{e.rank}</b>
                  {e.delta !== 0 && (
                    <span className={`lb-delta ${e.delta > 0 ? 'up' : 'down'}`}>
                      <Icon name={e.delta > 0 ? 'arrowUp' : 'arrowDown'} size={9} />{Math.abs(e.delta)}
                    </span>
                  )}
                </span>
              </td>
              <td>
                <span className="row g3">
                  {/* a monogram from the handle: identity without inventing
                      a face or fetching one */}
                  <span className="lb-avatar" aria-hidden="true"
                        data-seed={(e.handle.charCodeAt(0) + e.handle.length) % 6}>
                    {e.handle.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase()}
                  </span>
                  <span className="col" style={{ gap: 0 }}>
                    <b>{e.handle}{e.isYou && <span className="you-tag">you</span>}</b>
                    <span className="t-nano">{e.tier}</span>
                  </span>
                </span>
              </td>
              <td>
                <span className="col g1" style={{ minWidth: 0 }}>
                  <span className="t-num">{pct(e.accuracyBps, 1)}</span>
                  <span className="meter meter-edge"><i style={{ width: `${e.accuracyBps / 100}%` }} /></span>
                </span>
              </td>
              <td className="t-num">{e.predictions}</td>
              <td><span className="lb-streak row g1"><Icon name="flame" size={11} />{e.streak}</span></td>
              <td className="t-num" style={{ textAlign: 'right' }}>{e.score.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <span className="t-nano" style={{ textAlign: 'right' }}>
        rank movement shown against the previous snapshot
      </span>
    </div>
  );
}
