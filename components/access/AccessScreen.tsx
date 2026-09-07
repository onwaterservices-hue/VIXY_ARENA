import React, { useState } from 'react';
import type { BillingInvoice, BillingPlan, BillingState } from '../../types';
import { Icon } from '../common/Icon';
import { SimulatePaymentButton } from '../gate/PreviewControls';
import { useAuth, useBilling } from '../../hooks';
import { money } from '../../lib/format';
import { hasPaymentLink, paymentLinkFor } from '../../services/billing';
import { DISCORD_INVITE_URL, hasDiscordInvite } from '../../services/auth';
import { AccessSteps } from './AccessSteps';

/* DEMO-ONLY BRANCHES below test `__DEMO_MODE__` inline (types/build-env.d.ts)
   rather than through a shared constant: bundlers fold the literal only at
   the site that reads it, and the fold is what makes the demo import dead
   code that is not emitted in a production build. */

/* =============================================================
   ACCESS — the billing page
   -------------------------------------------------------------
   Four steps, and where the reader is on them. Then the two
   things a reader can do here: unlock on Stripe and join the
   Discord. Then, only when a billing backend is connected, the
   plan, the card and the invoices it reports.

   There is no plan array in this file. No price, no currency, no
   interval, no "most popular" badge. Every one of those is a
   value the payment provider owns, and a value the provider owns
   is a value that will be wrong the moment someone changes it
   there and forgets this file exists.
   ============================================================= */

const INTERVAL_COPY: Record<BillingPlan['interval'], string> = {
  MONTH: 'per month', YEAR: 'per year', ONE_TIME: 'one time',
};

function PlanCard({ plan, userId }: { plan: BillingPlan; userId: string | null }) {
  return (
    <li className={`ac-plan glass-02 ${plan.featured ? 'is-featured' : ''}`}>
      {plan.featured && <span className="ac-plan-flag">Highlighted by the backend</span>}
      <b className="t-h3">{plan.name}</b>
      <span className="t-small">{plan.blurb}</span>
      <span className="ac-price">
        <b className="t-num">{money(plan.priceMinor, plan.currency)}</b>
        <span className="t-nano">{INTERVAL_COPY[plan.interval]}</span>
      </span>
      {plan.features.length > 0 && (
        <ul className="ac-feats">{plan.features.map((f) => <li key={f}><Icon name="check" size={12} />{f}</li>)}</ul>
      )}
      {hasPaymentLink()
        ? <a className="btn btn-primary tap" href={paymentLinkFor(userId)} target="_blank" rel="noreferrer noopener">Unlock on Stripe<Icon name="external" size={12} /></a>
        : <button className="btn btn-primary tap" disabled>Checkout unavailable</button>}
    </li>
  );
}

function BillingLine({ billing, sourceLabel }: { billing: BillingState; sourceLabel: string }) {
  const map = {
    NOT_CONFIGURED: { tone: 'warn', icon: 'settings', text: 'No billing backend is connected in this build. Plans, prices and invoices appear here once one is.' },
    LOADING:        { tone: 'info', icon: 'refresh',  text: `Reading the catalogue from ${sourceLabel}` },
    UNAVAILABLE:    { tone: 'risk', icon: 'alert',    text: billing.message ?? 'The billing backend did not answer.' },
    READY:          { tone: 'good', icon: 'check',    text: `Catalogue read from ${sourceLabel}` },
  }[billing.status] as { tone: 'warn' | 'info' | 'risk' | 'good'; icon: 'settings' | 'refresh' | 'alert' | 'check'; text: string };
  return (
    <div className={`ac-note ac-note-${map.tone}`} role="status">
      <Icon name={map.icon} size={15} />
      <span className="t-small">{map.text}</span>
    </div>
  );
}

export function AccessScreen() {
  const { billing, sourceLabel } = useBilling();
  const { auth, markDiscordJoined, previewUnlock, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (f: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await f(); } catch (x) { setErr(x instanceof Error ? x.message : String(x)); } finally { setBusy(false); }
  };

  const ent = billing.entitlement;
  const stage = auth.access.stage;
  const paidWord = ent ? (ent.active ? 'Active' : 'Inactive')
    : auth.access.paid ? (auth.origin === 'PREVIEW' ? 'Simulated · demo' : 'Confirmed') : 'Not yet';
  const discordWord = auth.access.discordVerified ? 'Verified' : auth.access.discordJoined ? 'Reported · unverified' : 'Not yet';

  return (
    <div className="screen col g6 access">
      <header className="col g2">
        <span className="t-label">Access</span>
        <h1 className="t-h1">Your access to VIXY ARENA</h1>
        <p className="t-small" style={{ maxWidth: '64ch' }}>
          Four steps in, and the terminal is yours. Everything below is read from the account
          system and the payment provider — nothing on this page is decided by the interface.
        </p>
      </header>

      {/* ---- where you are ---- */}
      <section className="ac-current glass-02">
        <AccessSteps auth={auth} />
        <div className="ac-current-grid">
          <div className="col"><span className="t-nano">Account</span>
            <b className="t-num">{auth.session ? auth.session.handle : '--'}</b></div>
          <div className="col"><span className="t-nano">Unlock</span>
            <b className="t-num">{paidWord}</b></div>
          <div className="col"><span className="t-nano">Discord</span>
            <b className="t-num">{discordWord}</b></div>
          <div className="col"><span className="t-nano">Terminal</span>
            <b className="t-num">{stage === 'OPEN' ? 'OPEN' : 'LOCKED'}</b></div>
        </div>
        {auth.message && <span className="t-nano">{auth.message}</span>}
      </section>

      {/* ---- unlock ---- */}
      <section className="ac-paylink glass-02">
        <div className="col" style={{ gap: 3, minWidth: 0 }}>
          <span className="t-label">2 · Unlock</span>
          <b className="t-body">
            {hasPaymentLink() ? 'Pay on Stripe. The backend confirms it; the terminal opens.'
                              : 'No Stripe Payment Link is configured in this build'}
          </b>
          <span className="t-micro pf-rule">
            {hasPaymentLink()
              ? 'The price is on the Stripe page, not this one. Paying there does not open the terminal by itself — access appears once the backend reports it.'
              : 'Paste the buy.stripe.com link into the billing configuration and this becomes the real checkout. No price is written into the interface either way.'}
          </span>
        </div>
        <div className="row g2 wrap">
          {hasPaymentLink() ? (
            <a className="btn btn-primary tap" href={paymentLinkFor(auth.session?.userId)} target="_blank" rel="noreferrer noopener">
              <Icon name="lock" size={14} />Unlock on Stripe<Icon name="external" size={12} />
            </a>
          ) : (
            <button className="btn btn-primary tap" disabled><Icon name="lock" size={14} />Unlock on Stripe</button>
          )}
          {(typeof __DEMO_MODE__ === 'boolean' ? __DEMO_MODE__ : true) && auth.actions.previewUnlock && (
            <SimulatePaymentButton busy={busy} onClick={() => run(previewUnlock)} />
          )}
        </div>
      </section>

      {/* ---- discord ---- */}
      <section className="ac-paylink glass-02">
        <div className="col" style={{ gap: 3, minWidth: 0 }}>
          <span className="t-label">3 · Join Discord</span>
          <b className="t-body">
            {hasDiscordInvite() ? (auth.origin === 'PREVIEW' ? 'Join the server, then tell the Arena you did.' : 'Join the server, then verify with Discord.')
                                : 'No Discord invite is configured in this build'}
          </b>
          <span className="t-micro pf-rule">
            {auth.origin === 'PREVIEW'
              ? 'Preview build: “I’ve joined” records your word and the page says so.'
              : 'Membership is verified through Discord’s own API. “Verify with Discord” records only what Discord answers.'}
          </span>
        </div>
        <div className="row g2 wrap">
          {hasDiscordInvite() ? (
            <a className="btn btn-primary tap" href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer noopener">
              <Icon name="signals" size={14} />Join the Discord<Icon name="external" size={12} />
            </a>
          ) : (
            <button className="btn btn-primary tap" disabled><Icon name="signals" size={14} />Join the Discord</button>
          )}
          <button className="btn tap" disabled={busy || !auth.actions.markDiscordJoined} onClick={() => run(markDiscordJoined)}>
            <Icon name="check" size={13} />{auth.origin === 'PREVIEW' ? 'I’ve joined' : 'Verify with Discord'}
          </button>
        </div>
      </section>

      {err && <div className="door-err" role="alert"><Icon name="alert" size={13} />{err}</div>}

      {/* ---- billing, as the provider reports it ---- */}
      <section className="col g4">
        <span className="t-label">Billing</span>
        <BillingLine billing={billing} sourceLabel={sourceLabel} />
        {billing.plans.length > 0 && (
          <ul className="ac-plans">{billing.plans.map((p) => <PlanCard key={p.id} plan={p} userId={auth.session?.userId ?? null} />)}</ul>
        )}
        {billing.status === 'READY' && (
          <div className="ac-split">
            <div className="ac-panel glass-02">
              <span className="t-label">Entitlement</span>
              <div className="ac-current-grid">
                <div className="col"><span className="t-nano">Plan</span><b className="t-num">{ent?.planId ?? '--'}</b></div>
                <div className="col"><span className="t-nano">Renews</span>
                  <b className="t-num">{ent?.renewsAt ? new Date(ent.renewsAt).toISOString().slice(0, 10) : '--'}</b></div>
              </div>
            </div>
            <div className="ac-panel glass-02">
              <span className="t-label">Payment method</span>
              {billing.paymentMethod ? (
                <div className="ac-pm">
                  <span className="ac-pm-brand">{billing.paymentMethod.brand ?? billing.paymentMethod.kind}</span>
                  <b className="t-num">{billing.paymentMethod.last4 ? `•••• ${billing.paymentMethod.last4}` : '--'}</b>
                </div>
              ) : <span className="t-micro">Nothing on file.</span>}
            </div>
            <div className="ac-panel glass-02">
              <span className="t-label">Invoices</span>
              {billing.invoices.length === 0 ? <span className="t-micro">None issued.</span> : (
                <ul className="ac-inv">
                  {billing.invoices.map((inv: BillingInvoice) => (
                    <li key={inv.id}>
                      <span className="t-nano">{new Date(inv.issuedAt).toISOString().slice(0, 10)}</span>
                      <span className="t-micro">{inv.number ?? inv.id}</span>
                      <b className="t-num">{money(inv.amountMinor, inv.currency)}</b>
                      <span className={`ac-inv-st st-${inv.status.toLowerCase()}`}>{inv.status}</span>
                      {inv.url ? <a className="btn btn-sm tap" href={inv.url} target="_blank" rel="noreferrer">View<Icon name="external" size={11} /></a> : <span className="t-nano">—</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        <div className="row g2 wrap">
          <button className="btn btn-sm tap" disabled={!billing.actions.upgrade}>Upgrade</button>
          <button className="btn btn-sm tap" disabled={!billing.actions.cancel}>Cancel</button>
          <button className="btn btn-sm tap" disabled={!billing.actions.portal}><Icon name="external" size={12} />Billing portal</button>
          <button className="btn btn-sm tap" disabled={!auth.actions.signOut} onClick={() => run(signOut)}>Sign out</button>
        </div>
      </section>

      {/* ---- what access is and is not ---- */}
      <section className="ac-terms">
        <span className="t-label">What access covers</span>
        <ul>
          <li><b>Analysis, not positions.</b> VIXY models probabilities and shows where they differ from a market's price. It never takes a position for you.</li>
          <li><b>Virtual points.</b> No wagering, no payout, no cash value, in either direction.</li>
          <li><b>No guarantees.</b> An edge is a disagreement with a market, not a promise about an outcome. Nothing here is financial advice.</li>
        </ul>
      </section>
    </div>
  );
}
