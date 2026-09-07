import React, { useState } from 'react';
import type { AccountState } from '../../types';
import { Icon } from '../common/Icon';
import { pct } from '../../lib/format';

/* =============================================================
   REFER
   -------------------------------------------------------------
   The invite surface, built on the account contract.

   A referral code identifies a PERSON and credits them. Both are
   account-system concerns, so with no account system connected
   there is nobody to identify and nothing to credit — the panel
   shows the whole shape and says so, rather than minting a code
   that would attribute nothing.

   The share percentage is carried in basis points and rendered
   by the same formatter every other probability uses, so a tier
   can never be a number this file made up.
   ============================================================= */

export function ReferralPanel({ account }: { account: AccountState }) {
  const r = account.referral;
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);

  const canCreate = r?.actions.createCode ?? false;
  const canShare = (r?.actions.share ?? false) && !!r?.link;

  const copy = async () => {
    if (!r?.link) return;
    try {
      await navigator.clipboard.writeText(r.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable; the link stays selectable */ }
  };

  return (
    <section className="pf-panel glass-02 rf">
      <div className="row between g3">
        <span className="t-label">Refer analysts</span>
        {r?.tier && <span className="rf-tier">{r.tier.label}</span>}
      </div>

      <div className="rf-stats">
        <div className="col">
          <span className="t-nano">Points earned</span>
          <b className="t-num">{r?.totalEarnedPoints?.toLocaleString() ?? '--'}</b>
        </div>
        <div className="col">
          <span className="t-nano">Active referrals</span>
          <b className="t-num">{r?.activeReferrals ?? '--'}</b>
        </div>
        <div className="col">
          <span className="t-nano">Your share</span>
          <b className="t-num">{r?.tier ? pct(r.tier.shareBps, 1) : '--'}</b>
        </div>
      </div>

      {/* The code, or the honest absence of one. */}
      {r?.code ? (
        <div className="rf-code">
          <span className="rf-code-val t-mono">{r.code}</span>
          <button className="btn btn-sm tap" onClick={copy} disabled={!canShare}>
            <Icon name={copied ? 'check' : 'external'} size={12} />
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      ) : (
        <>
          <input
            className="pf-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!canCreate}
            placeholder="Choose your code"
            aria-label="Choose your referral code"
          />
          <button className="btn btn-primary tap" disabled={!canCreate || draft.trim().length < 4}>
            <Icon name="plus" size={14} />Create referral code
          </button>
        </>
      )}

      <ol className="rf-steps">
        <li>
          <b>Invite</b>
          <span className="t-nano">Share your code with someone who reads markets</span>
        </li>
        <li>
          <b>They call</b>
          <span className="t-nano">A referral counts once they start making calls of their own</span>
        </li>
        <li>
          <b>Tier up</b>
          <span className="t-nano">
            {r?.tier?.nextAtActive
              ? `${r.tier.nextAtActive} active referrals to the next tier`
              : 'Tiers and their thresholds are published by the account system'}
          </span>
        </li>
      </ol>

      <div className="rf-list-head row between g3">
        <span className="t-label">Your referrals</span>
        <span className="t-nano">{r?.referrals.length ?? 0}</span>
      </div>
      {(r?.referrals.length ?? 0) === 0 ? (
        <div className="rf-empty">
          <b className="t-body">
            {r ? 'No referrals yet' : 'Referrals are not available in this build'}
          </b>
          <span className="t-micro">
            {r
              ? 'Share your code to start earning. Referrals appear here once the account system confirms them.'
              : 'A referral code identifies a person and credits them, and no account system is '
                + 'connected. The panel shows the shape it will take rather than minting a code '
                + 'that would attribute nothing.'}
          </span>
        </div>
      ) : (
        <ul className="rf-list">
          {r!.referrals.map((x) => (
            <li key={x.handle}>
              <span className="rf-av">{x.handle.slice(0, 2).toUpperCase()}</span>
              <b className="t-micro">{x.handle}</b>
              <span className="t-nano">{new Date(x.joinedAt).toISOString().slice(0, 10)}</span>
              <span className={`rf-status st-${x.status.toLowerCase()}`}>{x.status}</span>
            </li>
          ))}
        </ul>
      )}

      <span className="t-micro pf-rule">
        {r?.policy
          ?? 'Rewards are virtual points with no cash value. Nothing about a referral is paid, '
             + 'and nobody earns from another person losing — there is nothing to lose.'}
      </span>
    </section>
  );
}
