import React, { useState } from 'react';
import type { ArenaSnapshot } from '../../types';
import { HoloPanel } from '../holographic/HoloPanel';
import { Leaderboard } from './Leaderboard';
import { SectionHeader, StatTile, OriginBadge } from '../common/Primitives';
import { FormIndicator } from '../broadcast/BroadcastPrimitives';
import { Icon } from '../common/Icon';
import { pct, signedNum } from '../../lib/format';

export function LeaderboardScreen({ snapshot, origin, sourceLabel }: {
  snapshot: ArenaSnapshot; origin: 'DEMO' | 'LIVE'; sourceLabel: string;
}) {
  const [rankWindow, setRankWindow] = useState<'DAY' | 'WEEK' | 'SEASON'>('WEEK');
  const top = snapshot.leaderboard[0];
  const you = snapshot.leaderboard.find((e) => e.isYou) ?? null;

  return (
    <div className="screen col g5">
      <SectionHeader eyebrow="Standings" title="Arena leaderboard"
        action={
          <div className="row g3">
            <OriginBadge origin={origin} label={sourceLabel} />
            {/* The standings window is a server query. This provider serves
                one window, so the other two are disabled rather than being
                offered as controls that quietly change nothing. */}
            <div className="seg" role="group" aria-label="Standings window">
              {(['DAY', 'WEEK', 'SEASON'] as const).map((w) => (
                <button key={w} aria-pressed={rankWindow === w} disabled={w !== 'WEEK'}
                        title={w === 'WEEK' ? undefined : 'The connected provider serves a single standings window'}
                        onClick={() => setRankWindow(w)}>{w}</button>
              ))}
            </div>
          </div>
        } />

      <div className="stat-row">
        <StatTile label="Competitors" value={snapshot.leaderboard.length} sub="ranked this window" icon="user" />
        <StatTile label="Leader accuracy" value={top ? pct(top.accuracyBps, 1) : '—'} sub={top?.handle} tone="edge" icon="target" />
        <StatTile label="Longest streak" value={Math.max(0, ...snapshot.leaderboard.map((e) => e.streak))} sub="consecutive correct" tone="warn" icon="flame" />
        <StatTile label="Calls scored" value={snapshot.leaderboard.reduce((a, e) => a + e.predictions, 0)} sub="settled and counted" icon="check" />
      </div>

      {/* PERSONAL, kept visually distinct from SYSTEM. A reader must never
          have to work out which row is theirs. */}
      {you && (
        <section className="lb-you glass-02">
          <span className="lb-you-tag"><Icon name="user" size={12} />Your standing</span>
          <div className="lb-you-grid">
            <div className="col"><span className="t-nano">Rank</span>
              <b className="t-num">#{you.rank}<span className="t-nano"> of {snapshot.leaderboard.length}</span></b></div>
            <div className="col"><span className="t-nano">Accuracy</span>
              <b className="t-num edge-pos">{pct(you.accuracyBps, 1)}</b></div>
            <div className="col"><span className="t-nano">Calls scored</span>
              <b className="t-num">{you.predictions}</b></div>
            <div className="col"><span className="t-nano">Locked</span>
              <b className="t-num">{you.locks}</b></div>
            <div className="col"><span className="t-nano">Streak</span>
              <b className="t-num">{you.streak}</b></div>
            <div className="col"><span className="t-nano">Movement</span>
              <b className={`t-num ${you.delta > 0 ? 'edge-pos' : you.delta < 0 ? 'edge-neg' : ''}`}>
                {you.delta === 0 ? '—' : signedNum(you.delta)}</b></div>
            <div className="col lb-you-form"><span className="t-nano">Form · last 5</span>
              <FormIndicator form={you.form} /></div>
          </div>
        </section>
      )}

      <HoloPanel grade={2} eyebrow={`${rankWindow} window`} title="Championship board">
        <Leaderboard entries={snapshot.leaderboard} limit={snapshot.leaderboard.length} podium />
      </HoloPanel>

      {/* What the board does NOT claim. A standings table that quietly omits
          this invites the reader to assume a return figure exists. */}
      <p className="lb-note">
        <Icon name="alert" size={13} />
        Scores are computed from settled calls in virtual points. This provider reports no
        return-on-investment figure, so none is shown — a percentage return would require a
        stake denominated in money, and no money is involved anywhere in the Arena.
      </p>
    </div>
  );
}
