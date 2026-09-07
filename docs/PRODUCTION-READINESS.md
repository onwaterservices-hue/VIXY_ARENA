# Production readiness — VIXY ARENA (2026-09-07)

**Verdict: NOT production-ready.** Four lines are FAIL, three of them critical (LIVE DATA from the
production host, MODEL VALIDATION, DEPLOYMENT). Everything marked PASS has a test or an artifact behind it
listed in the Evidence column; nothing is marked PASS on the strength of code that "should" work.
Evidence key: `T:` test in `server/test/*` (81/81 passing, container + Oliver's Mac), `E:` Playwright walk,
`D:` document, `B:` verified through Oliver's browser against the real venue.

| Area | Status | Evidence | What FAIL means / what closes it |
|---|---|---|---|
| AUTH | **PASS** | T: door (scrypt, hashed session tokens, idle + absolute expiry, server-side sign-out, CSRF origin check, reset tokens); T: lifecycle (sessions survive restart with a stable `SESSION_SECRET`) | — |
| ENTITLEMENTS | **PASS** | T: door (`entitlements` row is the only source; stage computed server-side; 403 per stage on every engine route; operator grant audited); client never OPEN without `READY+OPEN` (invariants 2597/2597, `verify:prod`) | — |
| DISCORD | **PASS (code)** / **UNVERIFIED (real guild)** | T: door (OAuth against a stub with the real code path, sealed refresh token, bounded re-verification, downgrade on leave, outage never elevates, one Discord ↔ one account) | Needs one real OAuth round-trip against Oliver's guild after the Discord app is created. Not blocking the code; blocking the launch |
| STRIPE | **PASS (code)** / **UNVERIFIED (real account)** | T: door (HMAC signature, tolerance, replay table, identity by `client_reference_id`/customer only, parked + reconciled events, audited operator attach) | Needs `STRIPE_WEBHOOK_SECRET` + one `stripe trigger` against the deployed URL |
| KALSHI | **PASS (adapter)** | B: endpoints, auth-free reads, identity, prices, states, timestamps, resolution, 404 shape; T: venues (normalisation, series discovery, settled fixture, 429 back-off); D: VENUE-AUDIT | Reads from the production host itself: see LIVE DATA |
| POLYMARKET | **PASS (adapter)** | B: same, incl. a live resolved market and a "proposed" one; T: venues | same |
| LIVE DATA | **FAIL** | Both sandboxes are firewalled from the venues; every real response so far came through Oliver's browser. Freshness, provenance and degradation are tested (T: venues, lifecycle) but **no production host has yet fetched a live board** | Deploy to the always-on host, then `system.sources[].status === 'LIVE'` for both venues within a minute of start, and `/api/snapshot` showing real markets with no DEMO badge. Until then the board must not be shown to the public as live |
| MODEL | **PASS (contract)** | T: model (schema, bounds, SKIP, mirrored fixtures, chronology, reproducibility, gate); `GET /api/model` reports `validated:false`; MODEL_* status on every snapshot | The model runs and is honest about itself. That is all this line certifies |
| MODEL VALIDATION | **FAIL** | T: evaluation + backtest (chronological split, skill vs market, paired bootstrap, placebo control); **backtest on 6 197 settled Kalshi markets / 178 667 minute-observations** (D: BACKTEST): out-of-sample locks n=64, skill +0.0011, 95% CI [−0.0029, +0.0048], p=0.56; every sided read n=4 940, +0.00002, p=0.95. The pilot's positive lock signal (+0.0040, p=0.002) **did not replicate** on the independent pre-registered corpus (+0.0013, p=0.35). Live ledger today: 0 observations → INSUFFICIENT | The model has now been measured on real settled outcomes and prices like the market. The placebo control (adjustment reflected) is clearly worse, so the drift term points the right way — it does not point far enough to demonstrate information. A deliberate attempt to fix it (docs/MODEL-RESEARCH.md) found one candidate that beat the price on development data and **failed its sealed holdout** (−0.00021, p = 0.78); it is kept as `MODEL=continuation`, not as the default. Closing this line needs ≥ 30 out-of-sample locks with `skillVsMarket > 0` from the live ledger on the production host, and on this evidence that should not be assumed to be coming |
| LOCK LEDGER | **PASS** | T: ledger (immutable rows via triggers, frozen inputs/version, reproduction under the recorded version, refusals); T: lifecycle (survives feed death, staleness, venue outage, two restarts, refresh, second device) | — |
| SETTLEMENT | **PASS** | T: ledger + lifecycle (venue-published outcome only; pays on the locked entry; duplicate and wrong-market resolutions refused; outcomes recorded for skipped markets too) | Polymarket resolution shape verified live; Kalshi `result` verified live |
| VISION | **FAIL (no reader)** | T: vision (staged pipeline, VERIFIED only with the venue's fresh confirmation, AMBIGUOUS/UNVERIFIED paths) — but `VisionReader` has no implementation, so every real scan returns UNREADABLE and says so | Connect a reader (an OCR/vision service behind the interface). Ship without it only with the Vision screen stating "reader not connected", which it does via the admin flag and the scan result |
| DEPLOYMENT | **FAIL** | D: DEPLOY-RUNBOOK, DEPLOYMENT-ARCHITECTURE; `npm run test:server` + `verify:prod` + `invariants` green; real `vite build` still unverified (npm 403 in both sandboxes — esbuild fallback documented) | Not deployed (by instruction). Closing this line = following the runbook and passing its §5 smoke checks |
| SECURITY | **PASS** | T: door (401 on every engine route without a session, 403 per stage, CSRF, replay, sealed tokens, rate limits); no client-side authority (invariants); demo engine refused in production; `SESSION_SECRET` required; audit rows on every access-affecting write | Recommend a dependency-free review of `http.ts` header handling before public launch (out of this session's scope) |

## Fail-closed audit (Phase 8) — where each condition lands
| Condition | Behaviour | Test |
|---|---|---|
| model unavailable | `vixyProbabilityBps` null, `422 no_model` / `lock_gate: MODEL_READ`, status MODEL_OFFLINE | model, model-live |
| required data unavailable (venue error) | last rows kept, health DEGRADED, model DEGRADED, no reads, no locks | lifecycle "feed dies", venues "back-off" |
| market identity uncertain (Vision) | AMBIGUOUS with candidates, or NO_MARKET_DETECTED; never VERIFIED | vision |
| data stale | STALE/DEGRADED by age; model withholds reads; gate DATA_FRESH fails | lifecycle "stale", model "SKIP" |
| entitlement uncertain | no row / expired period → UNLOCK; engine routes 403 | door |
| Discord uncertain | outage → last definite answer kept, never elevated; stale verification → JOIN_DISCORD | door "durable and bounded" |
| Stripe event invalid | 400 bad signature / stale timestamp; replay → no-op; unmatched → parked, no access | door "webhook", "identity" |
| settlement outcome unavailable | no settlement row; call stays LOCKED; never WON/LOST | lifecycle "venue unavailable" |
| DEMO → LIVE substitution | separate engine chosen at boot; refused in production; `verify:prod` proves the bundle is demo-free; origin travels with every payload | config, verify-prod, e2e |
| UNKNOWN → YES/NO | Kalshi: only `result` ∈ {yes,no,void}; Polymarket: only resolved + 0/1; "proposed" stays open | venues |
| STALE → CURRENT | `feedStatus` from age only; `partial` series marks STALE; no timestamp is ever refreshed without a fetch | venues, lifecycle |

## The one command that closes the FAIL lines
On the production host, after the environment is set and before the door opens:

```
npm run preflight        # node server/preflight.ts
```
It checks, with the host's own network and the real config: NODE_ENV/SESSION_SECRET/COOKIE_SECURE/ENGINE/MODEL,
a writable database, Stripe and Discord configuration (shape only — no secret is ever printed), **both venues
reachable**, the canonical board priced, every market reading LIVE, depth reported, and one verify round-trip
(`GET /markets/{ticker}`) — the call Arena Vision and settlement both depend on. It ends with the model's own
validation verdict. Exit code 1 with a "do not open the door until these pass" list if any REQUIRED check fails.

Run from this container it fails as expected (HTTP 403 on both venues — the sandbox firewall), which is the
proof that the check is real. Attach its clean output to close **LIVE DATA** and **DEPLOYMENT**.

## What the backtest added (2026-09-07)
`docs/BACKTEST.md` — 6 197 settled Kalshi markets, 178 667 minute-observations, replayed through the
production code path, with a pre-registered second corpus, a paired bootstrap and a placebo control.
It does not close MODEL VALIDATION and it does not change one word of what the product says about
itself. It replaces "we have no evidence" with "here is the evidence, the one promising number failed
to replicate, and the model prices like the market" — a different and more useful kind of FAIL.

## Model research (2026-09-07)
`docs/HOLDOUT-SEAL.md` seals 1 860 of the 6 197 markets before any research; `docs/MODEL-RESEARCH.md`
records what was tried on the other 4 337 and what the one holdout read said. The candidate
(`vixy-arena-consensus-0.2.0`, a range-position term) gained +0.0024 with p = 0.02 on development
data and −0.0002 with p = 0.78 on the holdout. It is in the tree, off by default, carrying its own
failure in `CONSTANTS.holdout`. The default model is unchanged.

## Terminology guard
The model is **implemented and tested, not validated**. No document, screen or API response in this
repository describes it as proven, accurate, profitable or production-validated, and `MODEL_READY` can
only be set by the evaluation harness on out-of-sample data.
