# VIXY ARENA — Final art-direction audit and production gate

Screenshot-by-screenshot verdict on the build as it exists in AI Studio and
`Desktop/VIXY ARENA/app` on 2026-09-05. Written against the actual rendered
screens (30 routes × 2 widths, plus the door walked end to end), not against
the close-out report.

Legend: 🔥 KEEP · 🔥🔥 WOW, don't touch · ✂️ REMOVE · ⚡ REBUILD ·
🚨 BROKEN / FAKE / PLACEHOLDER · 💎 SIGNATURE

## The verdict, page by page

| Page | Verdict | Why |
|---|---|---|
| Landing | 🔥🔥 WOW | Passes the five-second test. Hero, "How it works", market wall, four-step "Getting in", straight answers. Crypto is one word in a list. Nothing to add. |
| Create account / Sign in (the door) | 🔥 KEEP + 🚨 | The screen is right. What's behind it is a **labeled browser preview**, not an account system. Ships only after the backend list below is real. |
| Locked terminal | 🔥 KEEP | One step, one button, frosted skeleton (bars, no numbers). Verified: the only percentage on any locked screen at 1440 and 1720 wide is the engine's own calibration. The "Simulate a confirmed payment · demo only" button is 🚨 by design and must not exist in a production build (it is unreachable when `DEMO_MODE=false`; verify that, don't trust it). |
| Access / Billing | 🔥 KEEP | Four steps, Unlock (Stripe slot), Join Discord (slot), then billing only as the provider reports it. No price anywhere. Correct — and correctly empty. |
| Discord gate | 🔥 KEEP + 🚨 | "I've joined" is a **self-report marked unverified**. Production needs Discord OAuth membership/role verification server-side. |
| All Markets (home) | 🔥 KEEP | Breadth-ordered universe, start-here card once, orientation collapsed. Busy but legible. Watch the filter block on mobile. |
| Arena (main event) | 🔥🔥 WOW | The ball, the matchup, the ladder. The identity of the product. |
| Match Center | 🔥 KEEP | Fine. Depends entirely on a real sports feed to be worth its tab. |
| Live | 🔥 KEEP | Good. Same feed dependency. |
| **Arena Vision** | 💎 SIGNATURE + 🚨 | The tab, the screenshot-vs-live strip, the verdict card and the evidence rows are the right shape. **The read is fake by construction**: the demo provider does not read pixels — it returned "Polymarket · Top seed reaches the final" for a Kalshi KC/BUF screenshot. It is labeled SIMULATED READ / DEMO DATA on screen, which is the only reason it's acceptable to show anyone. This is the one feature where a real backend changes everything. |
| Daily Slate | 🔥 KEEP | Objectives reward analysis, not volume. Keep it exactly this way. |
| Up Next | 🔥 KEEP | Clean schedule. |
| Signals | 🔥 KEEP | Fine; it is a console and looks like one. |
| Watchlist | 🔥 KEEP | Empty state is honest and useful. |
| Alerts | 🔥 KEEP | Fine. Could later merge into Signals; not now. |
| Portfolio | 🔥🔥 WOW | The record card is the best "player card" in the app. |
| History | 🔥 KEEP | Audit trail + calibration curve + resolution criteria. Dense on purpose. |
| Leaderboard | 🔥 KEEP | Fine. Values are demo until the engine exists. |
| Sector hubs (Sports, Politics, Crypto, Weather, Macro, Entertainment, News) | 🔥 KEEP | One component, eight rows. Crypto looks exactly like the others — that is the point. |
| VIXY Brain | 🔥🔥 WOW | Hexagon core, calibration, source health, evidence. Don't touch. |
| Cross-Market | 🔥 KEEP | Good idea, thin until the graph is real. |
| Neural Map | 🔥 KEEP | Beautiful; secondary. |
| Telemetry | 🔥 KEEP | Operator screen. Fine. |
| Admin | 🔥 KEEP | Read-only by design; says so. |
| Profile | 🔥 KEEP | Follows the preview session. Referral panel is a shape with nothing behind it (honest, labeled). |
| Settings | 🔥 KEEP | Session panel added; "Reset preview account" is demo-only. |
| Help | 🔥 KEEP | Updated for the door and Arena Vision. |
| Orientation band | ✂️ REMOVED from default | Now collapsed; landing + start-here card do that job. Leave it collapsed. |
| Tour | 🔥 KEEP | Seven steps. Fine. |
| Screen-intro strip | 🔥 KEEP on desktop, ✂️ on mobile | Already hidden on phones. |

Nothing on the list needs a ⚡ REBUILD. The design is done. Stop designing.

## One bug found and fixed during this audit

The lock-callout graphic ("LOCKED · BTC above threshold") was landing on top
of a finished Arena Vision result. The Vision tab now counts as a busy
surface, so the callout is suppressed there (the toast still records it).

## Production gate — what is real vs what is not

| # | Requirement | Status today |
|---|---|---|
| 1 | Account creation persisted server-side | 🚨 Browser-only preview (`LocalPreviewAuthSource`, DEMO builds only) |
| 2 | Secure auth / session handling | 🚨 `HttpAuthSource` stubbed; endpoints named, none implemented |
| 3 | Password reset | 🚨 Not built (no UI, no endpoint) |
| 4 | Stripe payment confirmation / webhook | ⏳ Deliberately deferred — user will plug in after the app is complete. UI has the Payment Link slot only. |
| 5 | Entitlement stored server-side | 🚨 `BillingSource` contract exists; `HttpBillingSource` stubbed |
| 6 | Discord membership / role verification | 🚨 Self-report only; `markDiscordJoined` endpoint named, not built |
| 7 | Terminal access decided server-side | ✅ Client renders `access.stage` from the source and never computes it; the source is the thing that isn't real yet |
| 8 | Logout / session expiry | 🟡 Sign-out works against the preview; expiry needs the backend |
| 9 | Protected API routes | 🚨 No API exists yet |
| 10 | No client-side unlock that can be manipulated | 🟡 True for production (`previewUnlock` is unreachable when `DEMO_MODE=false`; the invariant suite asserts a preview source can only resolve in DEMO). Must be re-verified on the production build, not assumed. |

Also true and worth saying plainly: **a Stripe Payment Link is not
entitlement.** The link starts a payment; the backend has to receive the
Stripe event, verify it, write the entitlement, and `BillingSource.load()`
has to read it back. The UI is already built on exactly that assumption.

## The final Claude instruction (paste this next)

> **VIXY ARENA — FINAL PRODUCT FREEZE + PRODUCTION VERIFICATION.**
> Do not add screens, features or redesigns. The design is frozen as of the
> build in AI Studio / `Desktop/VIXY ARENA/app` dated 2026-09-05.
>
> Your job is to make the door real and prove it:
> 1. Stand up the account backend behind `HttpAuthSource` (sign-up, sign-in,
>    sign-out, session expiry, password reset, GET /api/auth/session
>    returning `{ session, access.stage }`). Server decides the stage.
> 2. Stand up `HttpBillingSource`: entitlement read from the server. Leave
>    the Stripe webhook for me to plug in, but write the handler skeleton
>    and the entitlement table so plugging it in is one function.
> 3. Discord OAuth: verify membership (and role if I give one) server-side;
>    `discordVerified` comes from that, never from the client.
> 4. Protect every API route; the terminal snapshot must not be served to a
>    session whose stage is not OPEN.
> 5. Build with `DEMO_MODE=false`, `AUTH_BASE_URL`, `BILLING_BASE_URL` set,
>    and prove: no preview account, no "simulate payment" button, no market
>    number reachable while locked (repeat the 1440/1720 leak check), the
>    invariant suite green, `tsc --noEmit` clean.
> 6. Arena Vision: replace the demo reader with the real pipeline (image →
>    market identification → live market fetch → engine). Until that
>    exists, the SIMULATED READ label stays. Never remove the label before
>    the reader is real.
>
> Do not deploy. Do not touch VIXY VAULT production. No fake secrets. Do not
> declare success until every line above has a verification artifact
> (screenshot, test output, or request log) attached.
