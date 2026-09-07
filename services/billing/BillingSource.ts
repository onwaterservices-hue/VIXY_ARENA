/* =============================================================
   THE BILLING CONTRACT
   -------------------------------------------------------------
   The same rule as the data contract, applied to money: the
   interface reads one object and knows nothing else.

   No plan, price, currency, interval or entitlement is written
   anywhere in the client. If a backend has not been configured,
   the honest state is NOT_CONFIGURED — not a placeholder price
   list that looks real enough to be quoted back at us.
   ============================================================= */

import type { BillingState } from '../../types';
import { apiFetch } from '../httpClient';

export interface BillingSource {
  readonly label: string;
  load(): Promise<BillingState>;
  /**
   * Begin checkout for a plan. Returns the URL the payment provider
   * hands back; the client only navigates to it.
   *
   * Deliberately not implemented anywhere in this build: starting a
   * real checkout requires real credentials, and this tree has none.
   */
  startCheckout(planId: string): Promise<{ url: string }>;
  /** Open the provider's own portal. Same reasoning as above. */
  openPortal(): Promise<{ url: string }>;
}

/**
 * The state of this build. It reports the truth and refuses to
 * invent a catalogue.
 */
export class UnconfiguredBillingSource implements BillingSource {
  readonly label = 'NOT CONFIGURED';
  async load(): Promise<BillingState> {
    return {
      status: 'NOT_CONFIGURED',
      plans: [],
      entitlement: null,
      paymentMethod: null,
      invoices: [],
      actions: { upgrade: false, downgrade: false, cancel: false, portal: false },
      message:
        'No billing backend is configured in this build. Plans, prices and '
        + 'entitlements are owned by the payment provider and read at runtime; '
        + 'none are written into the interface.',
      origin: 'NONE',
    };
  }
  async startCheckout(): Promise<never> {
    throw new Error('Checkout requires a configured billing backend.');
  }
  async openPortal(): Promise<never> {
    throw new Error('The billing portal requires a configured billing backend.');
  }
}

/** The real implementation. Entitlement is read from the server, which wrote it
    from a verified Stripe event. Checkout itself happens on the Payment Link, so
    `startCheckout` is not used by this build and says so. */
export class HttpBillingSource implements BillingSource {
  readonly label = 'BILLING API';
  private readonly baseUrl: string;
  constructor(baseUrl: string) { this.baseUrl = baseUrl; }
  load(): Promise<BillingState> { return apiFetch<BillingState>(this.baseUrl, '/api/billing/entitlement'); }
  async startCheckout(): Promise<never> { throw new Error('Checkout runs on the Stripe Payment Link; the backend confirms it through the webhook.'); }
  async openPortal(): Promise<never> { throw new Error('The billing portal is not enabled on this server.'); }
}
