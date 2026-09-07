# VIXY ARENA — Backend Architecture (the door, made real)

Status: implemented 2026-09-06 alongside this document; extended the same day by the
backend production phase (ledger, Discord durability, Stripe identity, Vision boundary — see
`docs/PHASE0-AUDIT.md` for the audit that drove it). Everything below describes code that
exists in `server/` and is exercised by `npm run test:server` (36 tests).

## 0. Why it looks like this

Two constraints shaped every choice:

1. **No package registry.** npm was unreachable (HTTP 403) from both development
   machines. So the server uses **Node 22 built-ins only**: `node:http`,
   `node:sqlite`, `node:crypto` (scrypt, HMAC, random), `fetch`, `node:test`.
   Zero dependencies means zero install step: `node server/index.ts` runs on any
   Node ≥ 22.18 (type stripping is built in; the code uses erasable types only).
2. **The client was built fail-closed and server-authoritative first.** The server
   therefore does not "add" access logic — it *owns* it. The client renders
   `access.stage` and nothing else decides who gets in.

The failure classes Vault hit are each closed by construction:

| Vault failure | Arena rule |
|---|---|
| false LIVE states | origin travels with every payload; the demo engine says `DEMO`, the client shows the badge |
| client state pretending backend success | every mutation returns the state the server *wrote*; the client renders the response |
| volatile in-memory persistence | SQLite file with WAL; sessions, entitlements, events all durable |
| hardcoded entitlement overrides | entitlements are rows written only by the Stripe webhook (or an explicit operator CLI that logs an audit row) |
| fake settlement | not in scope of the door; the engine boundary is a typed interface with the demo labeled |
| unverified deploys | `npm run gate` + `test:server` are the deploy gate; nothing here deploys |

## 1. Shape

```
client (dist/)  ──same origin──►  server/index.ts (node:http)
                                   ├── static: serves dist/ (or a configured dir)
                                   ├── /api/auth/*        sessions, password, reset, Discord OAuth
                                   ├── /api/billing/*     entitlement read; Stripe webhook
                                   ├── /api/account       profile (from the users row)
                                   └── /api/snapshot, /api/stream, /api/scan, /api/calls
                                         └── EngineSource (DemoEngine today; real engine later)
                                   SQLite: server/data/arena.db (WAL)
```

Same-origin by default so the session cookie is first-party. If the API is hosted
elsewhere, set `APP_ORIGIN` and CORS is restricted to exactly that origin with
credentials.

## 2. Data model (SQLite)

- `users(id, email UNIQUE, handle UNIQUE, password_hash, created_at, discord_id, discord_verified_at, stripe_customer_id)`
- `sessions(id, user_id, created_at, last_seen_at, expires_at, ip, ua)` — id is a 256-bit random token, stored **hashed** (sha256) so a DB read does not yield live sessions
- `password_resets(token_hash, user_id, expires_at, used_at)`
- `entitlements(user_id PK, active, plan_id, stripe_subscription_id, current_period_end, source, updated_at)`
- `stripe_events(id PK, type, received_at, payload)` — idempotency
- `audit(id, ts, actor, action, target, detail)` — every access-affecting write
- `mail_outbox(id, to, subject, body, created_at, sent_at)` — the mailer's durable queue
- `discord_links(user_id PK, discord_id UNIQUE, username, refresh_token_enc, linked_at, updated_at)` — identity; refresh token sealed with AES-256-GCM under a key derived from `SESSION_SECRET`
- `discord_sync(user_id PK, member, has_role, result VERIFIED|NOT_MEMBER|NO_ROLE|ERROR, error, checked_at, last_definite_at)` — what Discord last said
- `calls(id, user_id, market_id, …, direction, entry_bps, vixy_bps, edge_bps, confidence_bps, stake_points, model_version, evidence, origin, market_closes_at, quoted_at, locked_at)` — **the LOCK**; triggers refuse UPDATE and DELETE
- `settlements(call_id PK → calls, outcome YES|NO|VOID, result WON|LOST|PUSH|VOID, source, resolved_at, points_delta, settled_at)` — immutable, references the lock, stores the venue outcome it was graded on
- `points(id, user_id, delta, reason STARTER|STAKE|SETTLEMENT, ref, ts)` — append-only; balance is the sum
- `stripe_events.reconciled / note` — an event that matched no account is parked (`reconciled=0`) and granted nothing

## 3. The stage (server-computed, the only truth)

```
stage(user):
  no session                       → CREATE_ACCOUNT
  no active entitlement            → UNLOCK
  DISCORD_REQUIRED && !verified    → JOIN_DISCORD
  otherwise                        → OPEN
```

`GET /api/auth/session` → `{ status:'READY', session, access:{ stage, paid, discordJoined, discordVerified }, actions, origin:'LIVE' }`
— exactly the client's `AuthState`. The client never computes this.

**Fail closed, both sides.** The client draws nothing behind the door unless it
received `READY + OPEN`. The server refuses (`401` no session, `403` wrong stage)
on every engine route. An unreachable server therefore yields the "can't verify"
screen, never the board.

## 4. Sessions

- Cookie `vixy_session`: `HttpOnly; SameSite=Lax; Path=/; Secure` (Secure off only when `COOKIE_SECURE=false` for localhost).
- Idle expiry `SESSION_IDLE_MINUTES` (default 10080 = 7 days, sliding), absolute expiry `SESSION_ABSOLUTE_HOURS` (default 720 = 30 days).
- Expired sessions are rejected and deleted on touch; the client's next `GET /api/auth/session` returns `session:null` and the UI drops to the door.
- Sign-out deletes the row (server-side invalidation), not just the cookie.
- Passwords: `scrypt` (N=2^15, r=8, p=1), 16-byte salt, constant-time compare. Sign-in is rate-limited per IP+email (10 / 15 min).

## 5. Password reset

`POST /api/auth/password/forgot { email }` → always `200 { message }` with the same
wording whether or not the address exists. If it exists, a 32-byte token is created,
stored hashed, expires in 30 minutes, and a mail is queued. `POST /api/auth/password/reset { token, password }`
burns the token, sets the password and deletes every session for that user.

Mailer: `MAIL_MODE=outbox` (default) writes to `mail_outbox` and logs the link;
`MAIL_MODE=webhook` POSTs `{to,subject,body}` to `MAIL_WEBHOOK_URL` (any transactional
provider's inbound hook). No SMTP library because there is no registry.

## 6. Entitlement and Stripe

A Payment Link is not entitlement. Entitlement is a row in `entitlements`, written by:

- `POST /api/billing/webhook` — verifies `Stripe-Signature` (HMAC-SHA256 over `t.payload`, 5-minute tolerance, constant-time compare), rejects replays via `stripe_events`, then routes:
  - `checkout.session.completed` → `grantEntitlement(user, customer, subscription, current_period_end)` — user resolved by `client_reference_id` (we put the user id in the Payment Link URL as `?client_reference_id=`) or by customer email.
  - `customer.subscription.updated|deleted` → active recomputed from `status` and `current_period_end`.
- **One function to plug in:** `grantEntitlement()` in `server/billing/entitlements.ts`. Everything else is done; Oliver supplies `STRIPE_WEBHOOK_SECRET` and the `VITE_PAYMENT_LINK_URL`.

**Identity.** `resolveUser()` accepts only durable keys: `client_reference_id` (the authenticated
Arena user id we place on the Payment Link) or a `customer` id already attached to an account.
The checkout email is not an identity key (Apple/Google relay addresses); `STRIPE_EMAIL_FALLBACK=true`
enables it as an audited last resort against an existing account only, default off. An event that
matches nothing is **parked** (`stripe_events.reconciled=0`) and grants nothing. Because Stripe
does not guarantee ordering, a matched event replays that customer's parked events
(`reconcilePending`). The operator path for a real mismatch is `node server/cli.ts stripe:unmatched`
then `stripe:attach <event_id> <email>` — an explicit, audited (`STRIPE_CUSTOMER_ATTACHED`) association.

`GET /api/billing/entitlement` → the client's `BillingState` (plans `[]` — the price lives on Stripe, never in the client).

## 7. Discord

- `GET /api/auth/discord/start` → 302 to Discord OAuth (`identify guilds.members.read`), state stored in the session row.
- `GET /api/auth/discord/callback` → exchanges the code, fetches `/users/@me` and `/users/@me/guilds/{GUILD}/member`, checks membership (and `DISCORD_ROLE_ID` if set), writes `discord_id`, `discord_verified_at`, then 302 back to the app.
- The OAuth exchange persists the identity in `discord_links` with the **refresh token sealed**; one Discord account links to one Arena account (a second attempt is `409 discord_taken`).
- `POST /api/auth/discord` (the client's "Verify with Discord") is a fresh check through Discord using the refreshed token — a "claim" is never stored; only what Discord answered is (`discord_sync`).
- **Bounded verification.** The stage counts Discord as verified only on a definite VERIFIED within `DISCORD_MAX_AGE_HOURS` (default 14 days). A background loop (`DISCORD_RECHECK_LOOP_MINUTES`) re-asks Discord for every link older than `DISCORD_RECHECK_HOURS` (default 24). A definite "not a member / no role" downgrades to JOIN_DISCORD at once and is audited. A Discord outage writes `result=ERROR` and keeps the last definite answer — it never elevates.
- `DISCORD_API_BASE` is configurable so the test suite runs the real code path against a local stub.

## 8. Engine boundary, the ledger, and Vision

Two engines exist behind the same interface, chosen by `ENGINE`:

- `demo` — the labeled simulator, hosted server-side (origin DEMO → badge). Refused in production
  unless `ALLOW_DEMO_ENGINE_IN_PRODUCTION=true`.
- `live` — **DISCOVER + VERIFY**: `server/engine/venues/{kalshi,polymarket}.ts` read the public
  Kalshi trade-api v2 and Polymarket Gamma APIs (shapes captured live on 2026-09-06 in
  `venues/fixtures/`), `canonical.ts` folds two-sided Kalshi games into one market with a matchup,
  merges the same question across venues (liquidity-weighted consensus, dispersion), and computes
  health from data age. Origin LIVE.

**The model seam** is `server/engine/model.ts: VixyModel` — `read(market, now)` returning a
probability, confidence, reversal risk, regime, evidence, rationale and frozen inputs, or null (SKIP);
`reproduce(inputs)` re-runs the same version on frozen inputs. One implementation exists,
`server/engine/model/consensusModel.ts` = **`vixy-arena-consensus-0.1.0`** (`MODEL=consensus`, the default
for `ENGINE=live`; `MODEL=none` disables it). It is deliberately weak and says so: VIXY probability =
venue consensus + a cross-venue term (pull toward the more liquid venue) + a drift term only when the
recent path exceeds the spread noise floor; confidence = measured data quality only (venues,
observations, spread, liquidity, flips) and never the edge size; reversal risk = flips and short-vs-long
drift disagreement. Its constants are one table with `validated: false` — none has been validated
against outcomes (the Arena ledger is empty; Vault's engine measured 42.4% over 59 cycles of a
different instrument, see `docs/VIXY-MODEL-MAPPING.md`). Changing a constant is a new version string.
Inputs come from `server/engine/model/observations.ts` (per-venue price history, in-memory, refuses a
future-stamped observation) and `features.ts` (pure, null where data is missing). Without a model
every `vixyProbabilityBps`, `edgeBps`, `confidenceBps` is null, `brain.calibrationBps` is null, locks
are refused (`422 no_model`), and the interface shows "—" where a number would be a lie.

**The lock policy** (`server/engine/model/lockPolicy.ts`, `arena-lock-policy-0.1.0`) is a list of
eleven named reasons that must all pass — model read, data fresh, market open, entry window,
observation floor, model quality, reversal risk, minimum edge above the spread, directional
consistency (side from the sign of the YES-side edge, never from the edge's size), evidence alignment,
temporal stability (three prior reads on the same side above the floor). A high confidence shortcuts
nothing. The verdict travels in `EngineQuote.lockGate`; the ledger refuses with `422 lock_gate` and
the reasons verbatim. Thresholds are unvalidated and say so on `GET /api/model`.

**Calibration** (`server/ledger/calibration.ts`, `GET /api/model/calibration`) scores the probability
frozen at lock time for the side taken: hit rate, Brier, log-loss, calibration error, disjoint buckets
by confidence and |edge|, per model version, and a chronological holdout (last 20 %) from 60 settled.
Below 30 settled every metric is null and the status is INSUFFICIENT — no fallback figure exists
anywhere. Locks vs skips is reported as null because skips are not recorded. All in-sample unless the
holdout says otherwise.

**Authority split.** The engine **prices** (`quote(marketId)`: venue price, model read, provenance,
at this instant) and **resolves** (`resolve(marketId)`: the venue's published outcome, fetched fresh,
or null). The **ledger** (`server/ledger/`) **records**:

```
WATCH        market on the board
CONFIRMING   POST /api/calls → engine.quote() → validation
LOCKED       lockCall(): one immutable row with entry, VIXY, edge, model version, evidence, stake
SETTLED      settlementSweep(): for closed markets only, engine.resolve() → settleCall() referencing the lock
```

Settlement pays on the **locked** entry (fair odds: `stake × 10000 / entry`, NO priced from
`10000 − entry`, WAIT pushes, VOID refunds) and stores the venue's own words for the outcome. It never
reads a current price. The demo engine's `resolve()` is always null: the simulator publishes no
outcomes, so demo locks never settle — a simulated WIN would be a lie. `/api/snapshot`, `/api/stream`
and `GET /api/calls` overlay the signed-in person's calls and portfolio from the ledger.

**Arena Vision** (`server/engine/vision.ts`) is the staged pipeline
`extraction → identification → venue verification → current market → model → verdict`. The reader
(`VisionReader`) is an interface with no implementation here: without one every scan is
UNREADABLE / NOT_VERIFIED. With one, a result is `VERIFIED` only when the venue, re-fetched now,
confirms the identified market with a fresh (≤60 s) open price; a venue miss or stale read is
`UNVERIFIED`; several plausible markets are returned as `AMBIGUOUS` for the person to choose; a
printed probability that disagrees with the venue is flagged. The verdict comes from the same
canonical edge — `INSUFFICIENT_DATA` without a model. Every stage writes a line into `rationale`.

## 9. Configuration (server/.env, never committed)

```
PORT=8787
STATIC_DIR=dist
DATABASE_PATH=server/data/arena.db
SESSION_SECRET=<32+ random bytes>        # required in production
COOKIE_SECURE=true
APP_ORIGIN=https://arena.example.com     # only when API is not same-origin
DISCORD_REQUIRED=true
DISCORD_CLIENT_ID= DISCORD_CLIENT_SECRET= DISCORD_GUILD_ID= DISCORD_ROLE_ID= DISCORD_REDIRECT_URL=
DISCORD_RECHECK_HOURS=24  DISCORD_MAX_AGE_HOURS=336  DISCORD_RECHECK_LOOP_MINUTES=15
STRIPE_WEBHOOK_SECRET=   STRIPE_EMAIL_FALLBACK=false
ENGINE=live | demo   ALLOW_DEMO_ENGINE_IN_PRODUCTION=false   SETTLE_SWEEP_SECONDS=60
MODEL=consensus | none                    # vixy-arena-consensus-0.1.0 (unvalidated) or no model / no locks
MAIL_MODE=outbox | webhook   MAIL_WEBHOOK_URL=
NODE_ENV=production
```

The server refuses to start in production without `SESSION_SECRET`.

## 10. Verification

- `npm run test:server` — node:test suites over a real server on an ephemeral port and a temp database: the door (signup/signin/signout, expiry, reset, 401/403 per stage on every engine route, webhook signature good/bad/replay/stale, Discord OAuth against a stub, Discord durability and bounded re-verification, Stripe identity and reconciliation, entitlement lifecycle), venues (normalizers, canonical layer, LiveEngine health), the ledger (lock from quote, restart survival, settlement only from a venue outcome on the locked entry, immutability, refusals) and Vision (no reader, weak extraction, verified only with the venue's word, stale/down venue, ambiguity).
- `npm run gate` — client typecheck → invariants → build → verify:prod.
- `npm run e2e` — Playwright walk of the real door on the `DEMO_MODE=false` build; `npm run e2e:live` — the LiveEngine on venue fixtures, every route.
- Blocked, documented: `tsc` for `server/` needs `@types/node` and npm is unreachable (403); Node's built-in type stripping plus the suites are the compile check. A real `vite build` is likewise unverified (esbuild bundles are used).
