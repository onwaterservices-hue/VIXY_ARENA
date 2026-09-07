import React from 'react';
import { Icon } from './Icon';
import { usePrefs } from './prefs-context';

/* =============================================================
   ORIENTATION
   -------------------------------------------------------------
   A reader who has never seen this product should not have to
   infer what it is from a scoreboard.

   The Arena borrows the grammar of a live sports broadcast, and
   that grammar is only an advantage once you know what is being
   broadcast. This band says it in one line, then names the five
   words the rest of the interface uses, in the order they
   actually happen.

   It is a permanent part of the screen, not a modal: collapsed
   it is a single row the reader can reopen at any time. Nothing
   here is data — it is the product explaining its own vocabulary,
   which is why it is safe to write in this file.
   ============================================================= */

/* Exported so the landing page teaches exactly the same five words the
   Arena uses. Two explanations that drift apart are worse than one. */
export const CHAIN = [
  {
    step: 'What the crowd thinks',
    term: 'MARKET',
    plain: 'What everyone betting on a venue like Kalshi or Polymarket currently thinks the chance is.',
    icon: 'markets' as const,
  },
  {
    step: 'What our model thinks',
    term: 'VIXY',
    plain: 'What our model thinks the chance is, computed from its own evidence.',
    icon: 'brain' as const,
  },
  {
    step: 'Where they disagree',
    term: 'EDGE',
    plain: 'The gap between those two numbers. A big gap is the whole reason to look.',
    icon: 'spark' as const,
  },
  {
    step: 'Your move, in points',
    term: 'CALL',
    plain: 'You back a side with virtual points. No money is involved, ever.',
    icon: 'target' as const,
  },
  {
    step: 'The final score',
    term: 'SETTLED',
    plain: 'The event happens, the call is scored, and your record updates.',
    icon: 'leaderboard' as const,
  },
];

export function Orientation({ onNavigate }: { onNavigate?: (id: string) => void }) {
  const { prefs, setPref } = usePrefs();
  const open = prefs.orientation;

  if (!open) {
    return (
      <button
        className="orient-chip tap"
        onClick={() => setPref('orientation', true)}
        aria-expanded={false}
      >
        <Icon name="help" size={14} />
        <span>New here? What the Arena is, in five words</span>
        <Icon name="chevronD" size={13} />
      </button>
    );
  }

  return (
    <section className="orient glass-02" aria-label="What VIXY Arena is">
      <header className="orient-head">
        <div className="orient-title">
          <span className="orient-badge"><Icon name="arena" size={13} />What this is</span>
          <h2 className="t-h3">
            A prediction market is a market where people buy and sell the odds of a
            real event. <b>VIXY ARENA is the analyst sitting next to that market.</b>
          </h2>
          <p className="t-small">
            Every screen here follows the same five beats. Sports, politics, economics,
            weather — the vocabulary never changes, only the event does.
          </p>
        </div>
        <button
          className="orient-close tap"
          onClick={() => setPref('orientation', false)}
          aria-label="Collapse the explanation"
        >
          Got it<Icon name="close" size={13} />
        </button>
      </header>

      <ol className="orient-chain">
        {CHAIN.map((c, i) => (
          <li key={c.term} className="orient-beat">
            <span className="orient-beat-head">
              <i className="orient-n">{String(i + 1).padStart(2, '0')}</i>
              <Icon name={c.icon} size={14} />
              <b>{c.term}</b>
            </span>
            <span className="orient-step t-nano">{c.step}</span>
            <span className="orient-plain">{c.plain}</span>
          </li>
        ))}
      </ol>

      <footer className="orient-foot">
        <span className="t-nano">
          Points are virtual. There is no wagering, no payout and no cash value — the
          Arena scores how right you were, not how much you staked.
        </span>
        {onNavigate && (
          <button className="btn btn-sm btn-ghost tap" onClick={() => onNavigate('help')}>
            The full walkthrough<Icon name="chevronR" size={12} />
          </button>
        )}
      </footer>
    </section>
  );
}
