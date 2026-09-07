import React, { useState } from 'react';
import type { AccountState, ArenaSnapshot } from '../../types';
import { PredictionCore } from '../holographic/PredictionCore';
import { FormIndicator } from '../broadcast/BroadcastPrimitives';
import { OriginBadge, StatusPill, Empty } from '../common/Primitives';
import { Icon } from '../common/Icon';
import { useAccount, useAuth } from '../../hooks';
import { ReferralPanel } from './ReferralPanel';
import { usePrefs } from '../common/prefs-context';
import { useArenaUI } from '../common/ui-context';
import { pct, signedPct, relTime } from '../../lib/format';

/* =============================================================
   PROFILE
   -------------------------------------------------------------
   One page that answers "who am I in the Arena, and how am I
   doing" — and is honest about which half of that it can answer.

   Two sources, kept visually apart on purpose:

   ENGINE — the handle on the board, the record, the points, the
   form, the calls. These are real values in the snapshot and are
   shown as such.

   ACCOUNT — email, join date, linked services, the rule for
   changing a handle. No account system is connected, so these
   read `--` with the reason stated. A profile page that invents
   a person is the most quietly dishonest screen a product can
   ship, because every field on it looks like a fact.
   ============================================================= */

function initialsOf(handle: string): string {
  const parts = handle.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '··';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function AccountNote({ account, sourceLabel }: { account: AccountState; sourceLabel: string }) {
  const map = {
    NOT_CONFIGURED: { tone: 'warn' as const, icon: 'settings' as const,
                      title: 'No account system is connected' },
    LOADING:        { tone: 'info' as const, icon: 'refresh' as const,
                      title: `Reading your account from ${sourceLabel}` },
    UNAVAILABLE:    { tone: 'risk' as const, icon: 'alert' as const,
                      title: 'The account system did not answer' },
    READY:          { tone: 'good' as const, icon: 'check' as const,
                      title: `Account read from ${sourceLabel}` },
  }[account.status];

  return (
    <div className={`ac-note ac-note-${map.tone}`} role="status">
      <Icon name={map.icon} size={15} />
      <div className="col" style={{ gap: 3, minWidth: 0 }}>
        <b className="t-body">{map.title}</b>
        {account.message && <span className="t-micro">{account.message}</span>}
      </div>
    </div>
  );
}

export function ProfileScreen({ snapshot, now, origin, sourceLabel, onNavigate }: {
  snapshot: ArenaSnapshot;
  now: number;
  origin: 'DEMO' | 'LIVE';
  sourceLabel: string;
  onNavigate: (id: string) => void;
}) {
  const { account, sourceLabel: accountLabel } = useAccount();
  const { signOut } = useAuth();
  const { prefs, setPref } = usePrefs();
  const ui = useArenaUI();

  /* The competitor row the ENGINE flags as this reader. Everything on the
     identity card comes from here, not from the account system. */
  const me = snapshot.leaderboard.find((e) => e.isYou) ?? null;
  const pf = snapshot.portfolio;
  const handle = account.profile?.handle ?? me?.handle ?? null;

  /* A draft the reader can type into. It is never saved anywhere, because
     nothing here can save it — the field exists so the policy is visible. */
  const [draft, setDraft] = useState(handle ?? '');
  React.useEffect(() => { setDraft(handle ?? ''); }, [handle]);

  const recent = [...snapshot.calls]
    .sort((a, b) => +new Date(b.settledAt ?? b.openedAt) - +new Date(a.settledAt ?? a.openedAt))
    .slice(0, 5);

  const policy = account.profile?.handleChange ?? null;

  return (
    <div className="screen col g5 profile">
      {/* ---------- IDENTITY ---------- */}
      <section className="pf-hero glass-03 brackets">
        <i className="bk bk-tl" /><i className="bk bk-tr" /><i className="bk bk-bl" /><i className="bk bk-br" />

        <div className="pf-avatar">
          {/* The core is the product's signature and it is honest here too:
              it reports what the ENGINE is doing, not a mood for the reader. */}
          <PredictionCore state={snapshot.brain.state} size={190} />
          <span className="pf-initials">{handle ? initialsOf(handle) : '··'}</span>
        </div>

        <div className="pf-id">
          <span className="pf-tags">
            {me && <span className={`pf-tier tier-${me.tier.toLowerCase()}`}>{me.tier}</span>}
            <OriginBadge origin={origin} label={sourceLabel} />
          </span>
          <h1 className="pf-handle">{handle ?? '--'}</h1>
          <span className="pf-sub t-small">
            {me
              ? <>Ranked <b className="t-num">#{me.rank}</b> of {snapshot.leaderboard.length} in the current standings</>
              : 'Not present on the current standings board'}
          </span>
          <span className="pf-mail t-micro">
            {account.profile?.email ?? 'no email on file — no account system connected'}
          </span>

          <div className="pf-cta">
            <button className="btn btn-primary tap" onClick={() => onNavigate('portfolio')}>
              <Icon name="portfolio" size={15} />Your calls
            </button>
            <button className="btn tap" onClick={() => onNavigate('leaderboard')}>
              <Icon name="leaderboard" size={15} />Standings
            </button>
            <button className="scan-cta tap" onClick={() => ui.openScan()}>
              <Icon name="search" size={15} /><span>Arena Vision</span>
            </button>
          </div>
        </div>

        <div className="pf-points">
          <span className="t-label">Points balance</span>
          <b className="t-num">{pf.pointsBalance.toLocaleString()}</b>
          <span className="t-nano">virtual · no wagering · no cash value</span>
        </div>
      </section>

      {/* ---------- RECORD ---------- */}
      <section className="pf-record">
        <div className="pf-stat">
          <span className="t-label">Accuracy</span>
          <b className="t-num edge-pos">{pct(pf.accuracyBps, 1)}</b>
          <span className="t-nano">across settled calls</span>
        </div>
        <div className="pf-stat">
          <span className="t-label">Calibration</span>
          <b className="t-num">{pct(pf.calibrationBps, 1)}</b>
          <span className="t-nano">said vs happened</span>
        </div>
        <div className="pf-stat">
          <span className="t-label">Open</span>
          <b className="t-num">{pf.openCalls}</b>
          <span className="t-nano">not yet locked</span>
        </div>
        <div className="pf-stat">
          <span className="t-label">Locked</span>
          <b className="t-num">{pf.lockedCalls}</b>
          <span className="t-nano">on the record</span>
        </div>
        <div className="pf-stat">
          <span className="t-label">Settled</span>
          <b className="t-num">{pf.settledCalls}</b>
          <span className="t-nano">scored</span>
        </div>
        <div className="pf-stat">
          <span className="t-label">Streak</span>
          <b className="t-num warn">{pf.streak}</b>
          <span className="t-nano">consecutive correct</span>
        </div>
        <div className="pf-stat pf-form">
          <span className="t-label">Form · last 5</span>
          <FormIndicator form={pf.form} />
          <span className="t-nano">newest first</span>
        </div>
      </section>

      <div className="pf-split">
        {/* ---------- ACCOUNT ---------- */}
        <div className="col g4">
          <AccountNote account={account} sourceLabel={accountLabel} />

          <section className="pf-panel glass-02">
            <span className="t-label">Handle</span>
            <input
              className="pf-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!account.actions.changeHandle}
              aria-label="Your handle"
              placeholder="--"
            />
            <span className="t-micro pf-rule">
              {policy?.cooldownDays
                ? `A handle may be changed once every ${policy.cooldownDays} days, and must be unique.`
                : 'The rule governing how often a handle may be changed is published by the '
                  + 'account system. None is connected, so none is shown — and the field is '
                  + 'read-only rather than pretending a change would be saved.'}
            </span>
            {policy?.nextAllowedAt && (
              <span className="t-micro">
                Next change available {new Date(policy.nextAllowedAt).toISOString().slice(0, 10)}.
              </span>
            )}
            <button className="btn btn-primary tap" disabled={!account.actions.changeHandle}>
              <Icon name="check" size={14} />Save handle
            </button>
          </section>

          <section className="pf-panel glass-02">
            <span className="t-label">Linked services</span>
            {(account.profile?.connections.length ?? 0) === 0 ? (
              <div className="pf-conn is-empty">
                <span className="pf-conn-badge"><Icon name="external" size={15} /></span>
                <div className="col" style={{ gap: 2, minWidth: 0 }}>
                  <b className="t-body">Nothing linked</b>
                  <span className="t-micro">
                    Linked services are listed by the account system. None is connected, so the
                    list is empty rather than showing services you have not linked.
                  </span>
                </div>
                <button className="btn btn-sm tap" disabled>Connect</button>
              </div>
            ) : (
              <ul className="pf-conns">
                {account.profile!.connections.map((c) => (
                  <li key={c.key} className="pf-conn">
                    <span className="pf-conn-badge"><Icon name="external" size={15} /></span>
                    <div className="col" style={{ gap: 2, minWidth: 0 }}>
                      <b className="t-body">{c.label}</b>
                      <span className="t-micro">{c.connected ? (c.handle ?? 'connected') : 'not connected'}</span>
                    </div>
                    <button className="btn btn-sm tap" disabled={!account.actions.connect}>
                      {c.connected ? 'Manage' : 'Connect'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="pf-panel glass-02">
            <span className="t-label">Session</span>
            <ul className="pf-facts">
              <li><span className="t-nano">Member since</span>
                <b className="t-num">
                  {account.profile?.joinedAt
                    ? new Date(account.profile.joinedAt).toISOString().slice(0, 10)
                    : '--'}
                </b></li>
              <li><span className="t-nano">Data provider</span><b className="t-mono">{sourceLabel}</b></li>
              <li><span className="t-nano">Account system</span><b className="t-mono">{accountLabel}</b></li>
              <li><span className="t-nano">Engine state</span>
                <b className={`brain-state state-${snapshot.brain.state.toLowerCase()}`}>
                  {snapshot.brain.state}
                </b></li>
              <li><span className="t-nano">Feed</span>
                <StatusPill status={snapshot.health.status} label={snapshot.health.status} /></li>
            </ul>
            <div className="pf-session-actions">
              <button className="btn tap" onClick={() => onNavigate('access')}>
                <Icon name="lock" size={14} />Access and billing
              </button>
              <button className="btn tap" disabled={!account.actions.signOut}
                      onClick={() => { void signOut().then(() => onNavigate('auth')); }}>
                <Icon name="external" size={14} />Sign out
              </button>
            </div>
            <span className="t-micro pf-rule">
              Signing out ends the session the account system holds. With no session open the
              control is offered but inert rather than hidden.
            </span>
          </section>
        </div>

        {/* ---------- ACTIVITY AND PREFERENCES ---------- */}
        <div className="col g4">
          <section className="pf-panel glass-02">
            <div className="row between g3">
              <span className="t-label">Recent calls</span>
              <button className="btn btn-sm btn-ghost tap" onClick={() => onNavigate('history')}>
                Full history<Icon name="chevronR" size={12} />
              </button>
            </div>
            {recent.length === 0 ? (
              <Empty title="No calls yet"
                     detail="Calls you make appear here as the engine locks and settles them." />
            ) : (
              <ul className="pf-calls">
                {recent.map((c) => (
                  <li key={c.id}>
                    <button className="pf-call tap" onClick={() => ui.openMarket(c.marketId)}>
                      <span className={`lc-state ${c.state.toLowerCase()}`}>
                        <Icon name={c.state === 'SETTLED' ? 'check' : 'lock'} size={11} />
                        {c.result ?? c.state}
                      </span>
                      <span className="pf-call-market">{c.market}</span>
                      <span className="t-nano">{c.direction}</span>
                      <span className={`t-num ${c.edgeBps >= 0 ? 'edge-pos' : 'edge-neg'}`}>
                        {signedPct(c.edgeBps)}
                      </span>
                      <span className="t-nano">{relTime(c.settledAt ?? c.openedAt, now)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <ReferralPanel account={account} />

          <section className="pf-panel glass-02">
            <div className="row between g3">
              <span className="t-label">Interface</span>
              <button className="btn btn-sm btn-ghost tap" onClick={() => onNavigate('settings')}>
                All settings<Icon name="chevronR" size={12} />
              </button>
            </div>
            <span className="t-micro pf-rule">
              These are stored in this browser only. Nothing here reaches the engine, and
              nothing here changes a number you are shown.
            </span>
            <ul className="pf-toggles">
              {([
                ['holograms', 'Holographic surfaces', 'Cores, meshes and glow'],
                ['motion', 'Motion', 'Overridden when your system asks for reduced motion'],
                ['telemetryBar', 'Telemetry strip', 'The metadata bar along the bottom'],
                ['intelRail', 'Intelligence rail', 'The right-hand column on wide screens'],
              ] as const).map(([key, label, note]) => (
                <li key={key}>
                  <div className="col" style={{ gap: 1, minWidth: 0 }}>
                    <b className="t-body">{label}</b>
                    <span className="t-nano">{note}</span>
                  </div>
                  <button
                    className="pf-sw tap"
                    role="switch"
                    aria-checked={prefs[key]}
                    aria-label={label}
                    onClick={() => setPref(key, !prefs[key])}
                  >
                    <span className={`switch ${prefs[key] ? 'on' : ''}`}><i /></span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
