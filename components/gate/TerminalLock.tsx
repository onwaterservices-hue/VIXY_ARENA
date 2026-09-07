import React, { useState } from 'react';
import type { ArenaSnapshot, AuthState, BillingState } from '../../types';
import { PredictionCore } from '../holographic/PredictionCore';
import { Icon } from '../common/Icon';
import { SimulatePaymentButton } from './PreviewControls';
import { SECTORS } from '../../lib/categories';
import { pct } from '../../lib/format';
import { hasPaymentLink, paymentLinkFor } from '../../services/billing';
import { DISCORD_INVITE_URL, hasDiscordInvite } from '../../services/auth';
import { AccessSteps } from '../access/AccessSteps';

/* DEMO-ONLY BRANCHES below test `__DEMO_MODE__` inline (types/build-env.d.ts)
   rather than through a shared constant: bundlers fold the literal only at
   the site that reads it, and the fold is what makes the demo import dead
   code that is not emitted in a production build. */

/* =============================================================
   TERMINAL LOCK
   -------------------------------------------------------------
   What a reader sees between creating an account and entering.

   Two rules. A locked product may show WHAT IT COVERS, never WHAT
   IT CONCLUDED: sectors, counts, the engine's state and its own
   calibration are facts about the terminal; every probability,
   edge and confidence figure is withheld outright. The frosted
   board behind this screen is a skeleton — bars, not numbers —
   because a number behind glass is still a number.

   And the screen has exactly one job at a time: the next step.
   The stage comes from the auth source; the button for it comes
   from the configured link, or says plainly that none is.
   ============================================================= */

/* A blurred terminal that contains nothing. Twelve bars per row, no
   text, so what the reader sees is a shape, not a leak. */
function Frost() {
  return (
    <div className="lock-frost" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="lock-frost-card">
          <i style={{ width: `${34 + ((i * 37) % 40)}%` }} />
          <i style={{ width: `${60 + ((i * 23) % 30)}%` }} />
          <i className="is-bar" />
          <i style={{ width: `${22 + ((i * 19) % 30)}%` }} />
        </div>
      ))}
    </div>
  );
}

export function TerminalLock({ snapshot, billing, auth, onManage, onLearnMore, onDiscordJoined, onPreviewUnlock, onEnter }: {
  snapshot: ArenaSnapshot | null;
  billing: BillingState;
  auth: AuthState;
  onManage: () => void;
  onLearnMore: () => void;
  onDiscordJoined: () => Promise<unknown>;
  onPreviewUnlock: () => Promise<unknown>;
  onEnter: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const markets = snapshot?.markets ?? [];
  const coverage = SECTORS
    .map((s) => ({ s, n: markets.filter((m) => s.categories.includes(m.category)).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);

  const stage = auth.access.stage;
  const run = async (f: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await f(); } catch (x) { setErr(x instanceof Error ? x.message : String(x)); } finally { setBusy(false); }
  };

  const copy = {
    CREATE_ACCOUNT: { title: <>Your terminal is waiting.</>, lede: 'Create an account and the door opens in three more steps.' },
    UNLOCK:         { title: <>One step from every market.</>, lede: 'Unlock the terminal on Stripe. Access appears here once the backend confirms the purchase — paying does not open it by itself.' },
    JOIN_DISCORD:   { title: <>Unlocked. Join the room.</>, lede: 'The Arena talks between events on Discord. Join, then come back and press the button.' },
    OPEN:           { title: <>You are in.</>, lede: 'Every market, every category, VIXY beside each one.' },
  }[stage];

  return (
    <div className="lock">
      <Frost />
      <div className="lock-core" aria-hidden="true">
        <PredictionCore state={snapshot?.brain.state ?? 'OBSERVING'} size={420} />
      </div>

      <div className="lock-inner">
        <span className="lock-badge"><Icon name="lock" size={13} />{stage === 'OPEN' ? 'Terminal open' : 'Terminal locked'}</span>

        <h1 className="lock-title">{copy.title}</h1>
        <p className="lock-lede">{copy.lede}</p>

        <AccessSteps auth={auth} />

        {/* ---- the one button that matters right now ---- */}
        <div className="lock-cta">
          {stage === 'CREATE_ACCOUNT' && (
            <button className="btn btn-primary btn-lg tap" onClick={onManage}>
              <Icon name="user" size={16} />Create account
            </button>
          )}

          {stage === 'UNLOCK' && (hasPaymentLink() ? (
            <a className="btn btn-primary btn-lg tap" href={paymentLinkFor(auth.session?.userId)} target="_blank" rel="noreferrer noopener">
              <Icon name="lock" size={16} />Unlock on Stripe<Icon name="external" size={13} />
            </a>
          ) : (
            <button className="btn btn-primary btn-lg tap" disabled title="No Stripe Payment Link is configured in this build">
              <Icon name="lock" size={16} />Unlock on Stripe
            </button>
          ))}
          {(typeof __DEMO_MODE__ === 'boolean' ? __DEMO_MODE__ : true) && stage === 'UNLOCK' && auth.actions.previewUnlock && (
            <SimulatePaymentButton large busy={busy} onClick={() => run(onPreviewUnlock)} />
          )}

          {stage === 'JOIN_DISCORD' && (hasDiscordInvite() ? (
            <a className="btn btn-primary btn-lg tap" href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer noopener">
              <Icon name="signals" size={16} />Join the Discord<Icon name="external" size={13} />
            </a>
          ) : (
            <button className="btn btn-primary btn-lg tap" disabled title="No Discord invite is configured in this build">
              <Icon name="signals" size={16} />Join the Discord
            </button>
          ))}
          {stage === 'JOIN_DISCORD' && (
            <button className="btn btn-lg tap" disabled={busy || !auth.actions.markDiscordJoined} onClick={() => run(onDiscordJoined)}>
              <Icon name="check" size={15} />{auth.origin === 'PREVIEW' ? 'I’ve joined' : 'Verify with Discord'}
            </button>
          )}

          {stage === 'OPEN' && (
            <button className="btn btn-primary btn-lg tap" onClick={onEnter}>
              <Icon name="arena" size={16} />Enter the Arena
            </button>
          )}

          {stage !== 'OPEN' && (
            <button className="btn btn-lg tap" onClick={onLearnMore}>How VIXY works</button>
          )}
        </div>

        {err && <div className="door-err" role="alert"><Icon name="alert" size={13} />{err}</div>}

        <span className="lock-note t-micro">
          {stage === 'UNLOCK' && !hasPaymentLink() && 'No Stripe Payment Link is configured in this build, so the Unlock button is inert. Add the link in the billing configuration and it opens the real checkout, with the real price — no amount is written into the interface.'}
          {stage === 'UNLOCK' && hasPaymentLink() && 'Payment opens on Stripe. The price is on that page, not this one.'}
          {stage === 'JOIN_DISCORD' && auth.origin === 'PREVIEW' && 'Preview build: “I’ve joined” records your word and the page says so. In production the button sends you through Discord and the server records what Discord answered.'}
          {stage === 'JOIN_DISCORD' && auth.origin !== 'PREVIEW' && !hasDiscordInvite() && 'No Discord invite is configured, so the Join button is inert. “Verify with Discord” asks Discord whether you are a member; nothing is recorded from your word.'}
          {stage === 'JOIN_DISCORD' && auth.origin !== 'PREVIEW' && hasDiscordInvite() && 'Join the server, then press “Verify with Discord”. The server asks Discord and records only its answer.'}
          {stage === 'CREATE_ACCOUNT' && 'Coverage is public. Market probabilities, edges and confidence are not shown at all rather than shown blurred.'}
          {stage === 'OPEN' && (billing.status === 'READY' ? 'Access as reported by the payment provider.' : 'Access as reported by the account system.')}
        </span>

        {/* Facts about the product, never conclusions from it. */}
        <ul className="lock-cov-list" aria-label="Currently on the board">
          {coverage.map(({ s, n }) => (
            <li key={s.key} style={{ ['--sector' as string]: `var(${s.accent})` }}>
              <i aria-hidden="true" />
              <b>{s.label}</b>
              <span className="t-num">{n}</span>
            </li>
          ))}
        </ul>

        {snapshot && (
          <div className="lock-engine">
            <span className={`brain-state state-${snapshot.brain.state.toLowerCase()}`}>{snapshot.brain.state}</span>
            <i className="tb-sep" />
            <span className="t-nano">{snapshot.markets.length} markets tracked</span>
            <i className="tb-sep" />
            <span className="t-nano">calibration {pct(snapshot.brain.calibrationBps, 1)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
