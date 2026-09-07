# Backtest — the model on 6 197 settled Kalshi markets (2026-09-07)

**Verdict: the model has NOT demonstrated predictive information, and the one positive signal
found in the pilot did not replicate on independent data.** Nothing here licenses calling the model
validated, accurate, or profitable. What it establishes is that the model is now *measurable* on
real settled outcomes — and that when measured properly, it prices like the market.

## Why this exists
`docs/PRODUCTION-READINESS.md` had MODEL VALIDATION as FAIL with the note "0 observations, 0 reads,
0 outcomes". That is a true statement about an empty ledger, not about the model. Kalshi publishes
1-minute candlesticks for settled markets without authentication, so the model's own history can be
reconstructed for markets whose outcome the venue has already published, and the existing evaluation
harness can be pointed at it.

## The data
| | |
|---|---|
| Source | Kalshi `trade-api/v2` — `/markets?status=settled&series_ticker=…` (paginated), then `/series/{s}/markets/{t}/candlesticks?period_interval=1` |
| Pilot corpus | 1 765 events from 11 hand-picked series (the engine's default discovery list) |
| Main corpus | **pre-registered before any of its candles were fetched**: universe = every settled market in the 324 Kalshi series whose ticker ends `GAME` or `MATCH` (35 454 events, 2026-07-01 → 09-07); one market per event (both sides of a game are one event); pilot events excluded; `mulberry32(20260907)` shuffle; first 6 000 drawn. 4 432 survived the data-availability rule below |
| Data-availability rule | a market needs ≥ 20 one-minute bars in the decision window; 1 568 of the 6 000 had fewer and were dropped, counted, and never looked at again |
| Combined | **6 197 markets · 178 667 minute-observations · 161 + 11 series · 2026-07-01 → 2026-09-06** |
| Per market | the 30 one-minute bars in `[close − 5400 s, close − 3600 s]`: YES bid, YES ask, open interest, volume |
| Outcome | the venue's published `result` (`yes`/`no`), never inferred from a price |
| Provenance | every chunk checksummed in the browser and re-checksummed on disk — 53/53 files byte-exact; three markets re-fetched from Kalshi afterwards and compared bar-for-bar, all three matched |

Both sandboxes are firewalled from Kalshi (HTTP 403), so the harvest ran through a browser on
Oliver's machine. The raw lines are in `server/test/fixtures/backtest-archive/` with their format
documented there. `npm run backtest` reproduces every number below.

## The method
`server/tools/backtest.ts` replays each market one minute at a time through the **production code
path**, not a parallel one: `normalizeKalshiMarket` → `buildCanonical` → `ConsensusModel` +
`applyModel` → `evaluateLockGate` → `recordObservations`/`recordReads`/`recordOutcome` → the same
`evaluate()` that serves `GET /api/model/evaluation`. The only thing replaced is the clock.

Look-ahead is structurally impossible, and `server/test/backtest.test.ts` asserts each part: `now` is
the bar's own timestamp; the observation window contains only bars at or before it; every row enters
as `status: OPEN` with `result: null`, so no post-resolution price can reach the model; the outcome is
written last, stamped at the market's close, and the evaluation joins only reads with
`resolved_at_ms > read.at`. One decision per market. The train/out-of-sample split is chronological
(80/20 by decision time). **No constant was changed at any point in this exercise** —
`vixy-arena-consensus-0.1.0` ran exactly as it ships, and there was nothing to overfit with.

## What happened (combined corpus)
178 667 minute-observations → 101 046 reads and 77 621 SKIPs → 6 169 scored decisions.
The lock policy allowed a lock on **342 of 6 169 markets (5.5 %)**.

| Arm | n | hit rate | Brier | market Brier | skill (market − model) |
|---|---|---|---|---|---|
| Train, locks | 278 | 80.6 % | 0.1029 | 0.1059 | +0.0029 |
| **Out-of-sample, locks** | **64** | **82.8 %** | **0.0788** | **0.0799** | **+0.0011** |
| Out-of-sample, sided but refused | 816 | 57.8 % | 0.1724 | 0.1716 | −0.0008 |

The 82.8 % hit rate is **not** a skill number. Locks land on lopsided markets whose own price already
implies ~80 %; the market's Brier of 0.0799 on those same decisions is the baseline that matters, and
the gap to it is 0.0011.

## Is that gap real? (paired bootstrap, 20 000 resamples, fixed seed)
| Arm | n | mean Brier gain | 95 % CI | p |
|---|---|---|---|---|
| Out-of-sample locks | 64 | +0.0011 | [−0.0029, +0.0048] | 0.56 |
| Out-of-sample sided-but-refused | 816 | −0.0008 | [−0.0022, +0.0007] | 0.30 |
| All locks (train + OOS) | 342 | +0.0026 | [+0.0007, +0.0045] | 0.007 |
| **Every sided read** | **4 940** | **+0.00002** | **[−0.0006, +0.0006]** | **0.95** |

## The replication test — and it failed
The pilot (1 765 markets, run first) found +0.0040 on all locks with p = 0.002 and a 24-lock
out-of-sample arm at +0.0025. The 4 432-market main corpus is drawn from a different, pre-registered
universe with the pilot's events removed, so it is an **independent test of exactly that finding**:

| Arm | pilot (n) | main corpus, independent (n) |
|---|---|---|
| All locks | **+0.0040, p = 0.002** (165) | **+0.0013, p = 0.35** (177) |
| Out-of-sample locks | +0.0025, p = 0.25 (24) | +0.0009, p = 0.76 (31) |
| Every sided read | −0.0003, p = 0.61 (1 442) | +0.0002, p = 0.69 (3 498) |

**It did not replicate.** The effect halved, its interval swallowed zero, and on the combined data the
un-gated model is +0.00002 with p = 0.95 — a price mirror to four decimal places. An effect that
shrinks toward zero as the sample grows is what noise looks like, not what signal looks like.

## Placebo control
`npm run backtest -- --placebo` re-runs everything with the model's adjustment reflected about the
market price (`vixy' = 2 × market − vixy`), nothing else changed. If the harness manufactured skill,
the placebo would show the same positive number. It does not:

| Arm | real | placebo |
|---|---|---|
| Every sided read | +0.00002 (p = 0.95) | **−0.0013 (p < 0.001)** |
| All locks | +0.0026 (p = 0.007) | −0.0041 (p < 0.001) |
| Out-of-sample locks | +0.0011 | −0.0026 |

The harness does not manufacture skill: reflecting the adjustment makes things measurably worse.
That asymmetry — zero for the real model, clearly negative for its mirror image — is the one piece of
evidence that the drift term points the *right way*. It is not evidence that it points far enough to
matter, and it is offered here as a hypothesis for the live ledger to test, not as a finding.

## Out-of-sample buckets (n = 64 locks; every bucket is below the reporting floor of 30)
Edge 150–300 bps: +0.0032 (n = 24) · edge 300–600 bps: −0.0001 (n = 40) · confidence 60–70 %: +0.0009
(n = 18) · confidence 70–80 %: +0.0012 (n = 46). Every category read as OTHER because these are
Kalshi series the category map does not know by name. None of these support a conclusion.

## What this does not cover
* **One venue.** The cross-venue term — half the model — is untested: a Kalshi-only replay has
  `crossAdj = 0` by construction, so this measures the drift term alone, at the 70 % single-venue
  confidence cap. See the next section: the Polymarket side has been verified as reachable.
* **Ten weeks.** Kalshi's settled-market retention is about 68 days, so the corpus cannot go further
  back through this endpoint.
* **One decision point** (60 minutes before close) at 1-minute cadence, against production's
  30-second polling. The rule's shape is the same; its timescale is not identical.
* **No costs.** Brier is a probability score. Nothing here says anything about money, and the product
  does not take money.
* **Locks are rare by design** — 5.5 % — so out-of-sample lock counts grow slowly.

## The next honest step, verified as feasible
Polymarket's public API can supply the second venue, and the shapes were checked tonight:
* `GET gamma-api.polymarket.com/events?closed=true&tag_slug=mlb&order=endDate` lists game events whose
  titles ("Athletics vs. Seattle Mariners") match Kalshi event titles closely enough for the canonical
  matcher; `clobTokenIds`, `outcomePrices` and `umaResolutionStatus` give identity and resolution.
* The usable time anchor is `closedTime` / `gameStartTime` — **not** `endDate`, which is a nominal
  far-future date and returns an empty history window.
* `GET clob.polymarket.com/prices-history?market={tokenId}&startTs&endTs&fidelity=1` returns ~60-second
  points over a narrow window (30 points over the same 30-minute window as the Kalshi bars). Over a
  long range `interval=max` silently coarsens to ~10-minute spacing.
* Caveat to record before building it: `prices-history` gives one price per point and **no bid/ask**,
  so Polymarket contributes no spread to the replay; the noise floor would come from Kalshi's spread
  alone, and that limitation has to be stated wherever the cross-venue result is.

## What changes because of this
Nothing in the product's language. `GET /api/model` still reports `validated: false`, the Brain screen
still shows `MODEL_INSUFFICIENT_DATA`, and `MODEL_READY` is still reachable only through the live
ledger's own out-of-sample evaluation. The backtest is evidence for the roadmap, not a claim to users.
If anything it argues for restraint: the drift term as it stands is worth roughly nothing against the
venue's own price, and the honest thing is to keep saying so until the live ledger says otherwise.
