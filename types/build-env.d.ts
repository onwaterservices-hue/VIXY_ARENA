/* =============================================================
   BUILD-TIME CONFIGURATION
   -------------------------------------------------------------
   These are replaced by literals at build time (vite.config.ts,
   `define`). They are read through `buildFlag()` / `buildString()`
   in services/config.ts so that the invariant suite, which runs
   under Node without a bundler, sees safe defaults instead of a
   ReferenceError.

   A production build (`vite build`, mode=production) defines
   __DEMO_MODE__ as false unless VITE_DEMO_MODE=true is passed on
   purpose. That is the whole safety property: forgetting to set
   anything yields a build with no demo provider and no preview
   account in it.
   ============================================================= */
declare const __DEMO_MODE__: boolean | undefined;
declare const __ENGINE_BASE_URL__: string | undefined;
declare const __AUTH_BASE_URL__: string | undefined;
declare const __BILLING_BASE_URL__: string | undefined;
declare const __ACCOUNT_BASE_URL__: string | undefined;
declare const __PAYMENT_LINK_URL__: string | undefined;
declare const __DISCORD_INVITE_URL__: string | undefined;
