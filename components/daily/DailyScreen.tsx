import React from 'react';
import type { ArenaSnapshot, SlateObjective } from '../../types';
import { HoloPanel } from '../holographic/HoloPanel';
import { MarketCard } from '../markets/MarketCard';
import { SectionHeader, Empty, OriginBadge } from '../common/Primitives';
import { FormIndicator } from '../broadcast/BroadcastPrimitives';
import { Icon, type IconName } from '../common/Icon';
import { useArenaUI } from '../common/ui-context';
import { pct, untilTime } from '../../lib/format';

/* =============================================================
   THE DAILY SLATE
   -------------------------------------------------------------
   The reason to come back tomorrow, built on the right incentive.

   A casino solves retention with volume: wager more, spin a
   wheel. That would be the wrong product here and the spec says
   so — the Arena is not a sportsbook and must never read as one.

   So the slate rewards analysis. The card is markets that are
   actually closing today, spread across categories. The
   objectives can only be met by calling across the board,
   backing a disagreement, or going back to mark your own work.
   The streak is for turning up; the score is calibration.

   Every objective, its target and its progress are engine-issued.
   This screen renders a bar. It never decides that an objective
   has been met, because that is a business rule.
   ============================================================= */

const OBJECTIVE_ICON: Record<SlateObjective['kind'], IconName> = {
  CALL_COUNT: 'target',
  CATEGORY_SPREAD: 'layers',
  TAKE_AN_EDGE: 'spark',
  HIGH_CONVICTION: 'brain',
  REVIEW_SETTLED: 'history',
};

function ObjectiveRow({ o }: { o: SlateObjective }) {
  const ratio = o.target === 0 ? 0 : Math.min(1, o.progress / o.target);
  return (
    <li className={`ob-row ${o.complete ? 'is-done' : ''}`}>
      <span className="ob-icon">
        <Icon name={o.complete ? 'check' : OBJECTIVE_ICON[o.kind]} size={15} />
      </span>
      <div className="ob-body">
        <b className="t-body">{o.label}</b>
        <span className="t-micro">{o.detail}</span>
        <span className="ob-bar" aria-hidden="true">
          <i style={{ width: `${ratio * 100}%` }} />
        </span>
      </div>
      <div className="ob-meta">
        <b className="t-num">{o.progress}<span className="t-nano">/{o.target}</span></b>
        {o.rewardPoints !== null && (
          <span className="ob-reward">+{o.rewardPoints} pts</span>
        )}
      </div>
    </li>
  );
}

export function DailyScreen({ snapshot, now, origin, sourceLabel, onNavigate }: {
  snapshot: ArenaSnapshot;
  now: number;
  origin: 'DEMO' | 'LIVE';
  sourceLabel: string;
  onNavigate: (id: string) => void;
}) {
  const ui = useArenaUI();
  const slate = snapshot.slate;
  const card = (slate?.marketIds ?? [])
    .map((id) => snapshot.markets.find((m) => m.id === id))
    .filter(Boolean) as ArenaSnapshot['markets'];

  if (!slate) {
    return (
      <div className="screen col g5">
        <SectionHeader eyebrow="Today" title="Daily slate" />
        <HoloPanel grade={1}>
          <Empty title="No slate published"
                 detail="The engine has not published a card for today. Nothing is shown rather than a card assembled by the interface." />
        </HoloPanel>
      </div>
    );
  }

  const ratio = slate.total === 0 ? 0 : slate.completed / slate.total;
  const allDone = slate.completed === slate.total && slate.total > 0;

  return (
    <div className="screen col g5 daily">
      <SectionHeader
        eyebrow="Today on the board"
        title="Daily slate"
        action={
          <div className="row g3">
            <OriginBadge origin={origin} label={sourceLabel} />
            <span className="dy-reset">
              <Icon name="clock" size={13} />
              resets in {untilTime(slate.closesAt, now)}
            </span>
          </div>
        } />

      {/* ---------- THE HEADLINE ---------- */}
      <section className="dy-hero glass-03 brackets">
        <i className="bk bk-tl" /><i className="bk bk-tr" /><i className="bk bk-bl" /><i className="bk bk-br" />

        <div className="dy-ring" aria-hidden="true">
          <svg viewBox="0 0 120 120">
            <circle className="dy-ring-bg" cx="60" cy="60" r="52" />
            <circle
              className={`dy-ring-fg ${allDone ? 'is-done' : ''}`}
              cx="60" cy="60" r="52"
              strokeDasharray={`${ratio * 326.7} 326.7`}
            />
          </svg>
          <span className="dy-ring-read">
            <b className="t-num">{slate.completed}<span className="t-nano">/{slate.total}</span></b>
            <span className="t-nano">objectives</span>
          </span>
        </div>

        <div className="dy-copy">
          <h2 className="t-h2">
            {allDone
              ? 'Slate complete. Come back tomorrow for a new card.'
              : 'Read today’s card, and back what you actually believe.'}
          </h2>
          <p className="t-small">
            The Arena does not reward how much you stake. It rewards being right, and being
            right at the rate you said you would be. Today’s objectives are met by calling
            across the board and by disagreeing with a crowd when the model does — never by
            volume.
          </p>
          <div className="dy-streaks">
            <div className="col">
              <span className="t-nano">Streak</span>
              <b className="t-num warn">{slate.streakDays}<span className="t-nano"> days</span></b>
            </div>
            <i className="dy-sep" />
            <div className="col">
              <span className="t-nano">Best</span>
              <b className="t-num">{slate.bestStreakDays}<span className="t-nano"> days</span></b>
            </div>
            <i className="dy-sep" />
            <div className="col">
              <span className="t-nano">Calibration</span>
              <b className="t-num">{pct(snapshot.portfolio.calibrationBps, 1)}</b>
            </div>
            <i className="dy-sep" />
            <div className="col dy-form">
              <span className="t-nano">Form</span>
              <FormIndicator form={snapshot.portfolio.form} />
            </div>
          </div>
        </div>
      </section>

      {/* ---------- OBJECTIVES ---------- */}
      <div className="dy-split">
        <HoloPanel grade={2} eyebrow="Met by analysis, never by volume" title="Today’s objectives" padded={false}>
          {slate.objectives.length === 0 ? (
            <div style={{ padding: 'var(--s-5)' }}>
              <Empty title="No objectives published"
                     detail="The engine publishes the objectives. None are written into this screen." />
            </div>
          ) : (
            <ul className="ob-list">
              {slate.objectives.map((o) => <ObjectiveRow key={o.key} o={o} />)}
            </ul>
          )}
          <div className="dy-foot">
            <span className="t-nano">
              Progress is computed by the engine from your call record. Points are virtual and
              have no cash value.
            </span>
          </div>
        </HoloPanel>

        <HoloPanel grade={2} eyebrow="Why it is built this way" title="The house rule">
          <ul className="rule-list">
            <li><Icon name="target" size={13} />
              <span>Objectives reward breadth and conviction, never stake size.</span></li>
            <li><Icon name="brain" size={13} />
              <span>The score you are chasing is calibration — right at the rate you claimed.</span></li>
            <li><Icon name="lock" size={13} />
              <span>Points are virtual. There is no wagering, no payout and no cash value.</span></li>
            <li><Icon name="check" size={13} />
              <span>Nothing here is a guarantee. A probability is a statement about uncertainty.</span></li>
          </ul>
          <button className="btn btn-primary tap dy-go" onClick={() => onNavigate('upnext')}>
            <Icon name="clock" size={14} />See what else is scheduled
          </button>
        </HoloPanel>
      </div>

      {/* ---------- THE CARD ---------- */}
      <section className="col g4">
        <div className="row between g3">
          <div className="col" style={{ gap: 2, minWidth: 0 }}>
            <span className="t-label">Chosen by the engine · closing soonest, spread across categories</span>
            <h2 className="t-h2">Today’s card</h2>
          </div>
          <button className="btn btn-sm tap" onClick={() => onNavigate('markets')}>
            All markets<Icon name="chevronR" size={12} />
          </button>
        </div>
        {card.length === 0 ? (
          <HoloPanel grade={1}>
            <Empty title="No markets on today’s card"
                   detail="The engine published a slate with no markets attached to it." />
          </HoloPanel>
        ) : (
          <div className="mgrid">
            {card.map((m) => (
              <MarketCard key={m.id} market={m} now={now} onSelect={(x) => ui.openMarket(x.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
