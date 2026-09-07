/* =============================================================
   BILLING PROVIDER RESOLUTION
   -------------------------------------------------------------
   One switch, same as the data provider. It is empty on purpose:
   configuring billing is a deployment decision made with real
   credentials, and no credential belongs in this repository.
   ============================================================= */

import type { BillingSource } from './BillingSource';
import { HttpBillingSource, UnconfiguredBillingSource } from './BillingSource';
import { BILLING_BASE_URL, PAYMENT_LINK_URL } from '../config';

/* Both come from the build (../config.ts). A payment link is NOT
   entitlement and NOT a price: it starts a payment; the backend confirms
   it and reports the result through the auth source's access stage. */
export { BILLING_BASE_URL, PAYMENT_LINK_URL };

/** True when a reader can be sent somewhere to pay. */
export const hasPaymentLink = (): boolean =>
  /^https:\/\/(buy\.stripe\.com|checkout\.stripe\.com)\//.test(PAYMENT_LINK_URL);

/**
 * The Payment Link for a specific reader. Stripe passes `client_reference_id`
 * through to the checkout.session.completed event, which is how the webhook
 * knows whose entitlement to write — the one link a payment is allowed to have
 * back to an account. Never the price, never an amount.
 */
export function paymentLinkFor(userId: string | null | undefined): string {
  if (!hasPaymentLink()) return PAYMENT_LINK_URL;
  try {
    const u = new URL(PAYMENT_LINK_URL);
    if (userId) u.searchParams.set('client_reference_id', userId);
    return u.toString();
  } catch { return PAYMENT_LINK_URL; }
}

export function resolveBillingSource(): BillingSource {
  /* Production builds read entitlement from the same-origin API. */
  if (BILLING_BASE_URL || !(typeof __DEMO_MODE__ === 'boolean' ? __DEMO_MODE__ : true)) return new HttpBillingSource(BILLING_BASE_URL);
  return new UnconfiguredBillingSource();
}

export type { BillingSource };
