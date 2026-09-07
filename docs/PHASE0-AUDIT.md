# VIXY ARENA — Phase 0 Audit (backend production kickoff)

Date: 2026-09-06. Read-only inspection of the repository before the production phase.
Nothing below was changed while this was written.

## A. Current architecture

```
Browser (React 19 / TS, dist/)          Node ≥22.18 server (server/, zero deps)
  services/auth/AuthSource ─────────►   /api/auth/*        sessions (SQLite, hashed tokens), reset, Discord OAuth
  services/billing/BillingSource ───►   /api/billing/*     entitlement read; Stripe webhook (HMAC, replay table)
  services/account/AccountSource ───►   /api/account
  services/api/ArenaDataSource ─────►   /api/snapshot|stream|calls|scan   ← requireOpen() gate
  usePublicBoard ───────────────────►   /api/public/board  (redacted, 15 s cache)
                                        EngineSource: DemoEngine (labeled) | LiveEngine (Kalshi + Polymarket, no model)
                                        SQLite arena.db (WAL)
```

Build-time switch: `vite.config.ts` defines `__DEMO_MODE__` etc. from `VITE_*`; production bundle is
demo-free unless `VITE_DEMO_MODE=true`; `tools/checks/verify-prod.mjs` fails the build if demo strings
survive. Client renders the terminal **only** on `auth.status==='READY' && stage==='OPEN'`.

Terminology check against the kickoff prompt: this repository has **no** `active15mCycle`, no Firestore,
no Firebase, and no "15M engine" module — those names belong to VIXY VAULT. The Arena's canonical
decision object is `CallRecord` (`types/index.ts`), lifecycle `OPEN → LOCKED → SETTLED | VOID`, and the
lock moment is rendered by `components/broadcast/LockCallout.tsx`. The kickoff's
WATCH → CONFIRMING → LOCKED → SETTLED maps onto: market on board → `SIGNAL_CONFIRMING` (call
submitted) → `CallRecord` written (immutable) → settlement.

## B. Existing API contract table

| Route | Auth | Stage | Request | Response | Failure |
|---|---|---|---|---|---|
| GET /api/health | none | — | — | `{ok, engine, origin, discord, stripe}` | — |
| GET /api/auth/session | cookie optional | — | — | `AuthState` (stage server-computed) | always 200 |
| POST /api/auth/signup | none | — | `{email, handle, password}` | 201 `AuthState` | 400 validation, 409 dup |
| POST /api/auth/signin | none | — | `{email, password}` | `AuthState` | 401, 429 rate |
| POST /api/auth/signout | cookie | — | — | `AuthState(session:null)` | — |
| POST /api/auth/password/forgot | none | — | `{email}` | 200 constant message | — |
| POST /api/auth/password/reset | none | — | `{token, password}` | `AuthState` | 400 bad token |
| GET /api/auth/discord/start | cookie | — | — | 302 Discord | 401/503 |
| GET /api/auth/discord/callback | cookie | — | `?code&state` | 302 app | 400 bad state, 502 |
| POST /api/auth/discord | cookie | — | — | `AuthState` | 409 not linked |
| GET /api/billing/entitlement | cookie | — | — | `BillingState` | 401 |
| GET /api/billing/catalogue | none | — | — | `{plans:[]}` | — |
| POST /api/billing/webhook | Stripe-Signature | — | raw event | `{received, result}` | 400 sig/json, 503 unset |
| GET /api/account | cookie | — | — | `AccountState` | 401 |
| GET /api/public/board | none | — | — | `PublicBoard` (redacted) | — |
| GET /api/snapshot | cookie | OPEN | — | `ArenaSnapshot` | 401 / 403 `stage_*` |
| POST /api/calls | cookie | OPEN | `CallIntent` | `CallRecord` | 400 / 422 `call_refused` |
| POST /api/scan | cookie | OPEN | `ScanInput` | `ScanResult` | 400 bad_image |
| GET /api/stream | cookie | OPEN | SSE | `ArenaSnapshot` frames | 401/403 |

Callers: `services/auth/AuthSource.ts`, `services/billing/BillingSource.ts`,
`services/account/AccountSource.ts`, `services/api/ArenaDataSource.ts`, `services/api/index.ts`
(`fetchPublicBoard`). All contracts are preserved by this phase; additions are additive.

## C. Existing data model (SQLite)

`users(id, email, handle, password_hash, created_at, discord_id, discord_username, discord_verified_at, stripe_customer_id)`
`sessions(id_hash PK, user_id, created_at, last_seen_at, absolute_expires_at, ip, ua, oauth_state)`
`password_resets`, `entitlements(user_id PK, active, plan_id, stripe_customer_id, stripe_subscription_id,
current_period_end, cancel_at_period_end, source, updated_at)`, `stripe_events(id PK …)`, `audit`,
`mail_outbox`, `rate_limits`.

**Not durable today:** call records / locks (in-memory inside `DemoDataSource`; refused by `LiveEngine`),
settlement, points balance, Discord OAuth tokens (none kept → re-verification requires a new OAuth
round-trip), Vision scan results.

## D. Security / authority problems found

1. **Discord verification is a one-time timestamp.** `discord_verified_at` never expires and is never
   re-checked; a member who leaves the guild or loses the role keeps OPEN. `POST /api/auth/discord`
   cannot re-verify because no token is stored. (Fail-closed *at verification time* is correct; the
   *lifetime* of the verification is unbounded.)
2. **Stripe email fallback.** `resolveUser()` falls back to `customer_details.email` when neither
   `client_reference_id` nor a known `stripe_customer_id` matches. With Apple/Google private-relay
   addresses this can attach a payment to the wrong account or none; the kickoff forbids email as the
   sole key.
3. **Unmatched Stripe events are stored but unreachable.** They land in `stripe_events` with a note in
   the response only; there is no reconciliation state or operator path, so a paid customer with a
   mismatched email is silently orphaned.
4. **Demo engine in production is not refused.** `ENGINE` defaults to `demo`; a production server can be
   started with the simulator behind a real door. The payloads *are* labeled DEMO, so this is not a
   false-LIVE bug, but it is a masquerade risk the kickoff names.
5. No client-side authority was found: `LocalPreviewAuthSource` is compiled out of production
   (`verify-prod` + invariants assert unconfigured auth is never OPEN); `lib/preferences.ts` stores UI
   preferences only.

## E. Persistence problems

1. A `CallRecord` accepted by the engine is not written anywhere durable. If the process restarts the
   lock is gone; the client would then show nothing, not a false lock — but the kickoff requires a
   durable, immutable, timestamped record with the evidence it was made on.
2. Settlement has no record type; the demo settles by timer and coin-flip against the *current* price,
   which is exactly the "what would the algorithm say now" failure the kickoff forbids.
3. Per-user calls and portfolio are served from a global snapshot (`/api/snapshot` returns the engine's
   view; the demo's `calls` are one shared list).
4. Vision returns a result object but keeps no record; verification conditions are not represented as
   stages that passed or failed.

## F. Production blockers (ordered)

1. Durable LOCK ledger + settlement referencing the lock (E1–E3).
2. Discord link durability and bounded verification lifetime (D1).
3. Stripe identity: no email-only grants; reconciliation path for unmatched events (D2, D3).
4. Vision verification boundary with explicit per-stage outcomes (E4).
5. Production refuses `ENGINE=demo` unless explicitly allowed (D4).
6. Unchanged from the previous round: no VIXY model (all VIXY probabilities null by design), real
   `vite build` unverified (npm 403), live venue fetch unverified from a networked host, no deploy.

## G. Proposed minimal migration path

All additive; no rewrite; every existing test keeps passing.

1. `server/ledger/`: tables `calls` (immutable lock rows), `settlements` (1:1 to a call, references it,
   stores the venue resolution used), `points` (per-user balance, ledger-derived). `EngineSource`
   gains `quote(marketId)` (the engine's price/model read at acceptance) and `resolve(marketId)` (the
   venue's settled outcome, or null). `POST /api/calls` writes the lock from `quote()`; a settlement
   sweep writes settlements from `resolve()` **only** — never from current prices. `/api/snapshot` and
   `/api/stream` overlay the signed-in user's calls and portfolio from the ledger.
2. `discord_links(user_id PK, discord_id, username, refresh_token_enc, linked_at)` and
   `discord_sync(user_id PK, member, has_role, checked_at, result, error)`; `computeAccess` treats a
   verification older than `DISCORD_RECHECK_HOURS` as due, re-checks with the refreshed token, and
   downgrades on a definite "not member / no role". A Discord outage keeps the last definite answer
   and records the error — it never elevates.
3. `stripe.ts`: email fallback removed; unmatched events get `stripe_events.reconciled = 0` and a CLI
   `stripe:unmatched` / `stripe:attach <event_id> <email>` that re-runs the same `handleStripeEvent`
   path with an explicit, audited association.
4. `LiveEngine.scanMarket` becomes a staged pipeline with an injectable `reader`; each stage records
   PASS/FAIL; `VERIFIED` is set only after the venue re-fetch succeeds and is fresh.
5. `config.ts`: `production && engine==='demo' && !ALLOW_DEMO_ENGINE_IN_PRODUCTION` → refuse to start.
