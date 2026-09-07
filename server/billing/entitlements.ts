/* =============================================================
   ENTITLEMENT — a row, written by a verified payment event.
   `grantEntitlement` is the one function the Stripe integration
   calls; everything else reads.
   ============================================================= */
import type { DB } from '../db.ts';
import { audit } from '../db.ts';

export interface EntitlementRow {
  user_id: string; active: number; plan_id: string | null; stripe_customer_id: string | null;
  stripe_subscription_id: string | null; current_period_end: number | null; cancel_at_period_end: number; source: string; updated_at: number;
}

export interface Entitlement { active: boolean; planId: string | null; renewsAt: number | null; cancelAtPeriodEnd: boolean; source: string | null }

/** Active means the row says active AND the period, if any, has not ended. Server-computed. */
export function readEntitlement(db: DB, userId: string, now = Date.now()): Entitlement {
  const r = db.prepare('SELECT * FROM entitlements WHERE user_id = ?').get(userId) as EntitlementRow | undefined;
  if (!r) return { active: false, planId: null, renewsAt: null, cancelAtPeriodEnd: false, source: null };
  const inPeriod = r.current_period_end === null || r.current_period_end > now;
  return { active: r.active === 1 && inPeriod, planId: r.plan_id, renewsAt: r.current_period_end, cancelAtPeriodEnd: r.cancel_at_period_end === 1, source: r.source };
}

export function grantEntitlement(db: DB, input: {
  userId: string; planId: string | null; stripeCustomerId: string | null; stripeSubscriptionId: string | null;
  currentPeriodEnd: number | null; cancelAtPeriodEnd?: boolean; active?: boolean; source: string; actor: string;
}): Entitlement {
  const now = Date.now();
  db.prepare(`
    INSERT INTO entitlements (user_id, active, plan_id, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end, source, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET active = excluded.active, plan_id = excluded.plan_id,
      stripe_customer_id = COALESCE(excluded.stripe_customer_id, entitlements.stripe_customer_id),
      stripe_subscription_id = COALESCE(excluded.stripe_subscription_id, entitlements.stripe_subscription_id),
      current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end,
      source = excluded.source, updated_at = excluded.updated_at
  `).run(input.userId, input.active === false ? 0 : 1, input.planId, input.stripeCustomerId, input.stripeSubscriptionId,
    input.currentPeriodEnd, input.cancelAtPeriodEnd ? 1 : 0, input.source, now);
  if (input.stripeCustomerId) db.prepare('UPDATE users SET stripe_customer_id = COALESCE(stripe_customer_id, ?) WHERE id = ?').run(input.stripeCustomerId, input.userId);
  audit(db, input.actor, input.active === false ? 'ENTITLEMENT_REVOKED' : 'ENTITLEMENT_GRANTED', input.userId, input);
  return readEntitlement(db, input.userId, now);
}

export function revokeEntitlement(db: DB, userId: string, source: string, actor: string): Entitlement {
  return grantEntitlement(db, { userId, planId: null, stripeCustomerId: null, stripeSubscriptionId: null, currentPeriodEnd: null, active: false, source, actor });
}

/** The client's BillingState. Plans are empty on purpose: the price lives on Stripe. */
export function billingState(db: DB, userId: string | null) {
  const ent = userId ? readEntitlement(db, userId) : null;
  return {
    status: 'READY' as const,
    plans: [],
    entitlement: ent ? { planId: ent.planId, active: ent.active, renewsAt: ent.renewsAt, cancelAtPeriodEnd: ent.cancelAtPeriodEnd } : null,
    paymentMethod: null,
    invoices: [],
    actions: { upgrade: false, downgrade: false, cancel: false, portal: false },
    message: ent?.active ? null : 'Unlock on the Stripe page; access appears here once the backend confirms the purchase.',
    origin: 'LIVE' as const,
  };
}
