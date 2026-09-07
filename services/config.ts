/* =============================================================
   RUNTIME VIEW OF BUILD-TIME CONFIGURATION
   -------------------------------------------------------------
   One place that turns the `define`d globals into values. Every
   resolver imports from here, so the switch that decides whether a
   demo provider, a preview account or a simulator can exist in the
   bundle is a build decision, never a runtime one.

   Defaults (no bundler, e.g. the invariant suite under tsx, or
   AI Studio's preview without our vite.config): DEMO_MODE = true
   and no backend URLs — the labeled walk-through.
   ============================================================= */

/**
 * Visual-development mode. In a `vite build` this is `false` unless
 * VITE_DEMO_MODE=true was set deliberately. The UI reads it to render
 * the DEMO badge and to refuse to describe values as live.
 */
export const DEMO_MODE: boolean =
  typeof __DEMO_MODE__ === 'boolean' ? __DEMO_MODE__ : true;
/* NOTE for dead-code elimination: a bundler folds `__DEMO_MODE__` inside the
   module that reads it, not across an import. Modules that must DROP demo
   code in production therefore read the global themselves (search for
   DEMO_BUILD). This export is for runtime display decisions (badges). */

export const ENGINE_BASE_URL: string =
  typeof __ENGINE_BASE_URL__ === 'string' ? __ENGINE_BASE_URL__ : '';

export const AUTH_BASE_URL: string =
  typeof __AUTH_BASE_URL__ === 'string' ? __AUTH_BASE_URL__ : '';

export const BILLING_BASE_URL: string =
  typeof __BILLING_BASE_URL__ === 'string' ? __BILLING_BASE_URL__ : '';

export const ACCOUNT_BASE_URL: string =
  typeof __ACCOUNT_BASE_URL__ === 'string' ? __ACCOUNT_BASE_URL__ : '';

/**
 * A Stripe Payment Link, when one exists (`https://buy.stripe.com/…`).
 * It starts a payment. It is NOT entitlement and it is NOT a price —
 * the backend confirms the purchase and reports it through the auth
 * source's access stage; the link carries the reader to the real price.
 */
export const PAYMENT_LINK_URL: string =
  typeof __PAYMENT_LINK_URL__ === 'string' ? __PAYMENT_LINK_URL__ : '';

/** The community invite (`https://discord.gg/…`). Joining is verified by the backend. */
export const DISCORD_INVITE_URL: string =
  typeof __DISCORD_INVITE_URL__ === 'string' ? __DISCORD_INVITE_URL__ : '';
