/* =============================================================
   STRIPE WEBHOOK — signature verification, replay protection,
   and the mapping from events to `grantEntitlement`.
   No SDK: the signature scheme is HMAC-SHA256 over `${t}.${body}`.
   ============================================================= */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { DB } from '../db.ts';
import type { ServerConfig } from '../config.ts';
import { HttpError } from '../http.ts';
import { grantEntitlement } from './entitlements.ts';
import { audit } from '../db.ts';
import type { UserRow } from '../auth/sessions.ts';

export function verifyStripeSignature(header: string | undefined, payload: Buffer, secret: string, toleranceSec: number, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => { const i = kv.indexOf('='); return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()]; }));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${t}.`).update(payload).digest();
  const v1s = header.split(',').filter((kv) => kv.trim().startsWith('v1=')).map((kv) => kv.trim().slice(3));
  return v1s.some((sig) => { const b = Buffer.from(sig, 'hex'); return b.length === expected.length && timingSafeEqual(b, expected); });
}

/** Build a Stripe-Signature header (used by the test suite and by the operator CLI). */
export function signStripePayload(payload: Buffer | string, secret: string, tSec = Math.floor(Date.now() / 1000)): string {
  const sig = createHmac('sha256', secret).update(`${tSec}.`).update(payload).digest('hex');
  return `t=${tSec},v1=${sig}`;
}

interface StripeEvent { id: string; type: string; data: { object: Record<string, unknown> } }

/**
 * Who paid? Durable identifiers only:
 *   1. client_reference_id — the Arena user id we put on the Payment Link (authenticated association);
 *   2. customer            — a Stripe customer id already attached to an Arena account.
 * The checkout email is NOT an identity key (Apple/Google relay addresses, typos, shared inboxes).
 * With STRIPE_EMAIL_FALLBACK=true it is used as a last resort against an existing account only,
 * and the match is audited as such. Default off. An unresolved event is parked for reconciliation
 * — it never becomes access.
 */
export function resolveUser(db: DB, obj: Record<string, unknown>, emailFallback: boolean): { user: UserRow; via: 'client_reference_id' | 'customer' | 'email' } | null {
  const ref = typeof obj.client_reference_id === 'string' ? obj.client_reference_id : null;
  if (ref) { const u = db.prepare('SELECT * FROM users WHERE id = ?').get(ref) as UserRow | undefined; if (u) return { user: u, via: 'client_reference_id' }; }
  const customer = typeof obj.customer === 'string' ? obj.customer : null;
  if (customer) { const u = db.prepare('SELECT * FROM users WHERE stripe_customer_id = ?').get(customer) as UserRow | undefined; if (u) return { user: u, via: 'customer' }; }
  if (emailFallback) {
    const details = obj.customer_details as { email?: string } | undefined;
    const email = (details?.email ?? (typeof obj.customer_email === 'string' ? obj.customer_email : null))?.toLowerCase();
    if (email) { const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined; if (u) { audit(db, 'stripe', 'STRIPE_EMAIL_MATCH', u.id, { email }); return { user: u, via: 'email' }; } }
  }
  return null;
}

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

export interface HandleOutcome { result: string; matched: boolean; customer: string | null }

/** Handle a verified, not-yet-seen event. `matched:false` means it is parked, unreconciled, and granted nothing. */
export function handleStripeEvent(db: DB, cfg: ServerConfig, evt: StripeEvent): HandleOutcome {
  const obj = evt.data?.object ?? {};
  const customer = typeof obj.customer === 'string' ? obj.customer : null;
  const done = (result: string, matched = true): HandleOutcome => ({ result, matched, customer });
  switch (evt.type) {
    case 'checkout.session.completed': {
      if (obj.payment_status && obj.payment_status !== 'paid' && obj.payment_status !== 'no_payment_required') return done('checkout not paid; ignored');
      const hit = resolveUser(db, obj, cfg.stripe.emailFallback);
      if (!hit) return done('no matching user (client_reference_id / customer); parked for reconciliation — no access granted', false);
      const sub = typeof obj.subscription === 'string' ? obj.subscription : null;
      grantEntitlement(db, {
        userId: hit.user.id, planId: sub ? 'subscription' : 'one_time',
        stripeCustomerId: customer,
        stripeSubscriptionId: sub, currentPeriodEnd: null, source: `stripe:${evt.id}`, actor: 'stripe',
      });
      audit(db, 'stripe', 'STRIPE_RESOLVED', hit.user.id, { event: evt.id, via: hit.via });
      return done(`granted to ${hit.user.id} (via ${hit.via})`);
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const hit = resolveUser(db, obj, cfg.stripe.emailFallback);
      if (!hit) return done('no matching user for subscription; parked for reconciliation — no access granted', false);
      const user = hit.user;
      const status = String(obj.status ?? '');
      const active = evt.type !== 'customer.subscription.deleted' && ACTIVE_STATUSES.has(status);
      const periodEnd = typeof obj.current_period_end === 'number' ? obj.current_period_end * 1000 : null;
      const items = (obj.items as { data?: { price?: { id?: string } }[] } | undefined)?.data ?? [];
      grantEntitlement(db, {
        userId: user.id, planId: items[0]?.price?.id ?? 'subscription', active,
        stripeCustomerId: typeof obj.customer === 'string' ? obj.customer : null,
        stripeSubscriptionId: typeof obj.id === 'string' ? obj.id : null,
        currentPeriodEnd: periodEnd, cancelAtPeriodEnd: Boolean(obj.cancel_at_period_end),
        source: `stripe:${evt.id}`, actor: 'stripe',
      });
      return done(`${active ? 'active' : 'inactive'} for ${user.id}`);
    }
    default:
      return done('ignored');
  }
}

/**
 * Stripe does not guarantee event order: `customer.subscription.created` can land before the
 * `checkout.session.completed` that carries the client_reference_id. Once a customer is attached
 * to an account, replay that customer's parked events through the same handler.
 */
export function reconcilePending(db: DB, cfg: ServerConfig, customer: string): number {
  const rows = db.prepare('SELECT id, payload FROM stripe_events WHERE reconciled = 0 ORDER BY received_at ASC').all() as { id: string; payload: string }[];
  let n = 0;
  for (const r of rows) {
    let evt: StripeEvent; try { evt = JSON.parse(r.payload); } catch { continue; }
    if (evt.data?.object?.customer !== customer) continue;
    const out = handleStripeEvent(db, cfg, evt);
    if (out.matched) { db.prepare('UPDATE stripe_events SET reconciled = 1, note = ? WHERE id = ?').run(`reconciled: ${out.result}`, r.id); n++; }
  }
  return n;
}

/** Operator action: attach a Stripe customer to an account (audited), then replay its parked events. */
export function attachCustomer(db: DB, cfg: ServerConfig, userId: string, customer: string, actor: string): number {
  db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(customer, userId);
  audit(db, actor, 'STRIPE_CUSTOMER_ATTACHED', userId, { customer });
  return reconcilePending(db, cfg, customer);
}

export function unreconciledEvents(db: DB): { id: string; type: string; received_at: number; customer: string | null; email: string | null }[] {
  const rows = db.prepare('SELECT id, type, received_at, payload FROM stripe_events WHERE reconciled = 0 ORDER BY received_at DESC LIMIT 100').all() as { id: string; type: string; received_at: number; payload: string }[];
  return rows.map((r) => {
    let o: Record<string, unknown> = {}; try { o = JSON.parse(r.payload).data?.object ?? {}; } catch { /* keep empty */ }
    const details = o.customer_details as { email?: string } | undefined;
    return { id: r.id, type: r.type, received_at: r.received_at, customer: typeof o.customer === 'string' ? o.customer : null, email: details?.email ?? (typeof o.customer_email === 'string' ? o.customer_email : null) };
  });
}

export async function stripeWebhook(db: DB, cfg: ServerConfig, raw: Buffer, sigHeader: string | undefined): Promise<{ received: true; result: string }> {
  if (!cfg.stripe.webhookSecret) throw new HttpError(503, 'stripe_not_configured', 'STRIPE_WEBHOOK_SECRET is not set; webhooks are refused until it is.');
  if (!verifyStripeSignature(sigHeader, raw, cfg.stripe.webhookSecret, cfg.stripe.toleranceSec)) throw new HttpError(400, 'bad_signature', 'Stripe signature did not verify.');
  let evt: StripeEvent;
  try { evt = JSON.parse(raw.toString('utf8')); } catch { throw new HttpError(400, 'bad_json', 'Event body is not JSON.'); }
  if (!evt.id || !evt.type) throw new HttpError(400, 'bad_event', 'Event has no id/type.');
  const seen = db.prepare('SELECT 1 FROM stripe_events WHERE id = ?').get(evt.id);
  if (seen) return { received: true, result: 'duplicate; already processed' };
  db.prepare('INSERT INTO stripe_events (id, type, received_at, payload, reconciled) VALUES (?, ?, ?, ?, 0)').run(evt.id, evt.type, Date.now(), raw.toString('utf8'));
  const out = handleStripeEvent(db, cfg, evt);
  db.prepare('UPDATE stripe_events SET reconciled = ?, note = ? WHERE id = ?').run(out.matched ? 1 : 0, out.result, evt.id);
  /* A newly attached customer may unblock earlier, out-of-order events. */
  if (out.matched && out.customer) { const n = reconcilePending(db, cfg, out.customer); if (n) return { received: true, result: `${out.result}; reconciled ${n} earlier event(s)` }; }
  return { received: true, result: out.result };
}
