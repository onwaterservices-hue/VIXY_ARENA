# VIXY Model Mapping — what exists in Vault, what is real, what the Arena may inherit

Date: 2026-09-06. Read-only audit of `onwaterservices-hue/VIXYS-VAULT2` at `main` (public repo,
cloned to a scratch directory; nothing in Vault was modified, no Vault credentials were read).
Companion docs in Vault itself were used as evidence: `docs/ARCHITECTURE.md`, `docs/PROJECT_STATE.md`,
`docs/DECISION_LOG.md`. Line numbers refer to Vault's `server.ts` unless a file is named.

## 0. The one-paragraph verdict

Vault's production prediction engine is a single function, `evaluateBtc15mHighConvictionPipeline`
(`server.ts:1856–2597`), driven by `runMarketEngineTick` (`:2600`) and gated by
`canLockCurrentCycle` (`:3299`). It is a hand-tuned heuristic over **one spot price series** (Coinbase
BTC-USD) and **one Kalshi implied probability**. Every threshold, weight and score constant in it is a
literal with no derivation in the repository. Its own verified production record is **25W / 34L over 59
settled 15-minute cycles = 42.4%, mean Brier 0.403** (`PROJECT_STATE.md:106–108`) — worse than always
saying 50/50 (0.25). Two of the eleven "evidence families" it reports are not measured at all, and its
"order flow" input is synthesized from price-vs-strike. The only statistically sound modelling code in
Vault (`scripts/trainModel*.js`, chronological 80/20 split, Brier-gated promotion) is orphaned and
cannot execute. Therefore **nothing in Vault is proven**; what the Arena inherits is *methodology and
scaffolding*, not a model, and every numeric threshold carried over is marked NEEDS VALIDATION.

## 1. Inventory

Legend for column **Class**: PROVEN (validated against outcomes with evidence in repo) · SOUND
(statistically justified method, not yet validated on data) · EXPERIMENTAL (plausible heuristic, no
validation) · UI-ONLY · DEMO/FAKE (fabricated data or unconditional literal) · UNSUPPORTED (claim with
no evidence). **Arena destination** names the Arena file that will hold the mapped logic, or —.

| # | Component (Vault location) | What it does | Class | Arena destination | Needs |
|---|---|---|---|---|---|
| 1 | Epoch alignment `get15mEpochBoundaries` (canonicalDecisionEngine.ts:35) / interval math (`:1864`) | 15-minute UTC-aligned cycle ids; elapsed / remaining seconds | SOUND | `server/engine/model/features.ts` (generalised: *time to close* from the venue's `closesAt`) | none |
| 2 | Data-quality state (`:1871–1902`) | freshness ms → OPTIMAL ≤5s / DEGRADED ≤15s / STALE ≤60s / OFFLINE; score 100/70/35/0 | SOUND (structure) / thresholds EXPERIMENTAL | Already exists as Arena `feedStatus` (LIVE ≤60s / STALE ≤5m / DEGRADED). Model reads `HealthEnvelope`; no second freshness system | thresholds are Arena's own (venue polling cadence), documented |
| 3 | Multi-timeframe momentum (`:1938–1966`) — returns over 15s/30s/1m/5m/15m from a rolling tick buffer, per-TF vote with thresholds 0.012/0.015/0.02/0.03/0.04 %, ≥3 votes → candidate direction | Directional evidence from price history | EXPERIMENTAL — thresholds unexplained; buffer is *ticks per 3-second poll*, so "15s ago" is "5 polls ago" | `features.ts` as **price drift of the venue-implied probability** over the Arena's own observation history (30s polls). Votes replaced by a signed drift in bps with its own noise floor (spread) | validation on the Arena ledger before it can move a lock |
| 4 | Candidate direction with strike fallbacks (`:1967–1985`) | UP if ≥3 bull votes and spot ≥ strike−8; else side of strike; **never NEUTRAL** on the last branch | EXPERIMENTAL; the final `else` forces a side ("SKIP is not first-class") | NOT carried. Arena returns `null` (no read) when evidence is flat | — |
| 5 | Momentum classification ACCELERATING/REVERSING/DECELERATING/STABLE (`:1992–2012`) | short vs medium return comparison | EXPERIMENTAL | folded into #3 as `driftBps` / `reversalBps` (sign flip between short and long window) | validation |
| 6 | Realized volatility (`:2013–2040`) — stdev of log returns over the tick buffer, clamped [0.4, 6.5]; **fallback `0.85` literal and a synthetic `|mom|·0.75+0.52`** | Vol estimate | SOUND (stdev of log returns) / fallbacks DEMO/FAKE | `features.ts` `volatilityBps`: stdev of implied-probability changes over observation history; **null when < 6 observations — never a literal** | none beyond null-handling tests |
| 7 | Expected move vs required move, coverage ratio, √time decay (`:2050–2073`) | `expected = spot·vol·√(remaining/900)`; feasible if coverage ≥1.05 | SOUND (√t scaling is standard); ITM shortcut `3.5` literal EXPERIMENTAL | `features.ts` `coverageRatio` = expected drift of implied prob to close vs distance to 50% (the venue's own "can this still flip" measure) | validation of the 1.05 cut |
| 8 | VWAP (`:1903–1923`) | cumulative PV / volume | **DEMO/FAKE** — volume per tick is `3.5 + Math.random()*2` | NOT carried | — |
| 9 | Order flow: `bullVolPct` (`:2815–2818`), taker ratio, net delta, bid/ask imbalance, absorption (`:1924–1931, 2098–2126`) | Claimed taker-flow analytics | **DEMO/FAKE** — `bullVolPct = 50 + moneyness·25 + momentum·15` is *derived from price vs strike*, then re-presented as "Taker: 62% Bull, +21 BTC delta". Circular | NOT carried. Arena's honest flow proxies are the venue's **bid/ask spread, liquidity USD, 24h volume** — real fields already in `VenueRef` | — |
| 10 | Price structure HH/LL, breakout, support/resistance (`:2074–2097`) | last-20-tick structure | EXPERIMENTAL; on 3-second polls this is ~1 minute of structure | NOT carried in v0 | — |
| 11 | Regime TRENDING/CHOP/HIGH_VOL/RANGING (`:2127–2145`) | composition of #6, #10, VWAP | EXPERIMENTAL (depends on #8 fake VWAP) | Arena `Regime` type exists; v0 sets `UNKNOWN` unless #6 classifies (COMPRESSED/EXPANDING) | validation |
| 12 | Chop score (`:2146–2178`) — flips·15 + tight-strike + MTF conflict + flat momentum + absorption, filtered ≥50 | Skip filter | EXPERIMENTAL; direction-flip count is a real, honest signal; the other terms rest on #9 | `features.ts` `flips` (sign changes of drift over history) → part of stability gate | validation |
| 13 | Reversal threat (`:2179–2210`) `15 + (5−aligned)·6 + absorption + chop·0.25 + crossAsset`, veto ≥30 or REVERSING | Reversal risk | EXPERIMENTAL; constant base 15 | Arena `reversalRiskBps` = f(short-window sign flip vs long window, flips, spread-to-move ratio). Constants marked NEEDS VALIDATION | validation |
| 14 | Evidence families ×11 (`:2211–2352`) with scores/weights | Explainability + agreement count | Mixed: PRICE_STRUCTURE / MOMENTUM / VOLATILITY / STRIKE / TIME / REVERSAL / DATA_QUALITY are computed from inputs (EXPERIMENTAL); **LIQUIDITY is hardcoded `"Kalshi & Coinbase top-of-book depth verified (spread < 0.03%)", score 90`** (DEMO/FAKE); **CROSS_MARKET `"Perp basis: Congruent"`** is a literal (UNSUPPORTED); ORDER_FLOW rests on #9 | Arena `EvidenceTrack`/`Provenance.inputs`: each line must be a *measured* value with units. No family may exist without a measured input | schema test: every evidence line names its source field |
| 15 | Probability: `0.5 + (agreement−6)·0.05 + moneyness ±0.04`, bounded [0.05, 0.96], shrunk `·0.85 + 0.075` (`:2353–2395`) | P(UP) | **UNSUPPORTED** as a probability — a count of heuristic agreements mapped linearly to probability, no calibration; the shrink is direction-neutral (a documented fix) but the 0.85 is arbitrary | NOT carried. Arena v0 probability = **venue consensus adjusted only by measured cross-venue disagreement**; see §3 | — |
| 16 | Edge `directionalProb − impliedProb(side)` in % (`:2398–2404`) | Edge definition | SOUND *definition* (matches Arena's `edgeBps = vixy − market`, signed, YES-side) | Already Arena's contract; keep integer bps | test |
| 17 | pUp/pDown/uncertainty (`:2405–2427`) `·0.94` split | 3-way view | EXPERIMENTAL cosmetic | NOT carried | — |
| 18 | Confidence (`:2428–2452`) — 42 if data not OPTIMAL; 68–96 if ≥8 families agree; 66–74 if ≥6; else 40–58 | Confidence | **UNSUPPORTED** — confidence is a re-labelled agreement count; `PROJECT_STATE` shows 66%+ locks hit 42% | NOT carried. Arena `confidenceBps` = data-sufficiency × freshness × venue count × stability; **explicitly not the size of the edge**; and **uncalibrated until the ledger has ≥50 settled** (label carried in evidence) | calibration test once data exists |
| 19 | Lock quality 0–99 and tiers HIGH_CONVICTION ≥90 / QUALIFIED ≥75 (`:2453–2482`) | Lock score | EXPERIMENTAL; weights arbitrary | NOT carried as a score. Arena lock gate is boolean conditions (§4) | — |
| 20 | Lock gate `canLockCurrentCycle` (`:3299–3520`): 360s observation floor, entry window 6:00–12:00, data fresh ≤10s, not choppy, persistence ≥6s, quality ≥75, ≥6 families, ≥3 TF, feasible strike, threat <30, confidence 66–99, edge ≥1.5% or |p−0.5|≥0.025, **3 consecutive observations same side & conf ≥65.5**, no protection veto, cycle match | Gate | SOUND *structure* (fail-closed, many independent reasons, stability window, one lock per cycle, commit-point re-check in `lock15mCycle`). Every numeric threshold EXPERIMENTAL / NEEDS VALIDATION. Note three gate inputs are hardcoded `true` (`algorithm`, `authoritativeState`, `vixyWebSocket`, `calibrationComplete`, `analysisComplete` `:3372–3385`) | `server/engine/model/lockPolicy.ts`: same shape — a list of named reasons, all must pass; the Arena ledger already refuses closed markets and enforces one row per lock | tests per reason |
| 21 | Direction from side, not edge sign (`:2836–2858`, fixed) + `tests/directional-bias.invariants.mjs` | Prevents the 28/32-UP bug | PROVEN as a *bug class* (measured in production) | Arena: `direction` is derived from `sign(edgeBps)` **on the YES side only**, tested with mirrored inputs | mirrored-input test |
| 22 | Settlement (`checkAndSettle15mCycle` `:3952`) | Compares **Coinbase spot at rollover** to the strike | EXPERIMENTAL — not the venue's published result; the Arena already does better (`resolve()` = venue outcome) | NOT carried | — |
| 23 | Brier in settlement (`:3982`) on `confidence/100` | Scores confidence as a probability | UNSUPPORTED (wrong quantity) | Arena scores **`vixy_bps/10000` on the locked side** | test |
| 24 | `serverLearningEngine` (`:13284–13309`): `modelVersion "v4.3-INCREMENTAL"`, `lifetimeObservations 18427`, `historicalAccuracy 71.8`, feature-weight table | Learning telemetry | **DEMO/FAKE** — all literals | NOT carried | — |
| 25 | `learningAndCalibrationStore.ts` (frontend) | 1,284 synthetic records (`i % 10 !== 3 && !== 7` → 78%), `computeCalibrationImpact` always +23.1%, `getCalibrationImprovementProof` literals, `verifyLookAheadBiasAndDataLeakage` always passes | **DEMO/FAKE** | NOT carried | — |
| 26 | `/api/signal/calibration-report`, `/confidence-buckets` (`:14994–15176`) | Brier, log-loss, 5-pt buckets, |avg p − hit rate| | SOUND formulas; **empty-ledger fallbacks 71.8 / 0.168 / 0.512 and imputed confidence 75** are DEMO/FAKE; tiers cumulative not disjoint | `server/ledger/calibration.ts`: same formulas over the Arena `settlements`; **no fallback literals — null when n < threshold**; disjoint buckets; in-sample only, labelled | tests incl. empty ledger → nulls |
| 27 | `/api/signal/backtest-replay` (`:15177`) | "new engine" copies old direction, skips `idx % 3` | **DEMO/FAKE** | NOT carried | — |
| 28 | `/api/admin/backtest/run` mean-reversion on Coinbase 900s candles (`:15819–15940`) | Real candles, explicit rule, refuses <100 candles, disclaimer | SOUND as a *tool*; in-sample; not the live engine | Concept only: a replay harness over the Arena's own observation history is the correct future step | — |
| 29 | `scripts/trainModel*.js`, `promoteModel.js`, `sql/*` | Logistic regression on [momentum5m, momentum15m, vol15m], **chronological** 80/20 split, out-of-sample Brier, promotion only if Brier improves ≥0.005 with n ≥40 and first model <0.25; one `is_active` per (asset, desk) | SOUND method; **not runnable** (CJS in ESM package, missing `node-fetch`, missing `schema.sql`, zero consumers) | Methodology adopted for `docs` + `server/ledger/calibration.ts` (chronological split, OOS reporting, promotion guard). The `VixyModel.version` string is the Arena's `is_active` | — |
| 30 | `canonicalDecisionEngine.ts`, `decisionEngine.ts` | Second and third 15m engines | **DEMO/FAKE / dead** — `$64,250` spot, bullish constant telemetry, settlement-time features written as lock features (look-ahead), `±$42.50` P&L | NOT carried | — |
| 31 | `evidenceVectors.ts`, `metrics.ts` | UI scoring | UI-ONLY; **`formatDataFreshness` renders a DISCONNECTED feed as green LIVE**; constant `7.6` volume score | NOT carried. Arena UI already renders the server's `HealthEnvelope` only | — |

## 2. Data the Vault model requires vs what the Arena has

| Input | Vault source | Arena today | Verdict |
|---|---|---|---|
| Spot price, sub-minute | Coinbase REST every 3 s (Kraken fallback) | **none** — the Arena ingests venue markets, not underlying assets | **Missing feed.** Required for any BTC-15M-style model. Exposed as a dependency (§6), not substituted |
| Strike | Kalshi `KXBTC15M` `floor_strike` | Kalshi market rows carry `yes_sub_title`/rules; no dedicated strike parse | Only relevant with the spot feed |
| Venue implied probability | Kalshi yes ask (else bid), one market | Kalshi **mid of bid/ask** (else last) and Polymarket price, per market, every 30 s, with bid/ask/spread/liquidity/volume | Arena has more, and cross-venue |
| Order flow / taker volume | **fabricated** from moneyness | not available | Nothing honest to carry |
| Cross-asset (ETH/SOL) | Coinbase spot | none | Not relevant to generic markets |
| Time to close | 15-minute epoch | `closesAt` per market | Available |
| Historical outcomes | Firestore `signal_logs`, 59 settled | Arena `settlements` — **empty** | Calibration impossible today; the ledger builds it forward, out-of-sample by construction |

## 3. What the Arena model v0 can honestly be

The Arena's live data is *prices of the same question on one or two venues, sampled every 30 s, with
spread and liquidity*. The only information in that data beyond "the market's own price" is
**(a)** cross-venue disagreement and **(b)** the recent path of the price. A model that claims more is
inventing it. So `vixy-arena-consensus-0.1.0`:

- **Market probability** (`marketProbabilityBps`) stays what the engine already computes: the
  liquidity-weighted cross-venue consensus, or the single venue's mid.
- **VIXY probability** = a shrinkage estimate: the liquidity-weighted consensus pulled toward the
  *more liquid* venue by the ratio of liquidities, plus a bounded fraction of recent drift (the
  path term) — **only when drift exceeds the spread noise floor**; otherwise the path term is zero.
  Every coefficient is a named constant in one table with `validated: false`.
- **Edge** = `vixy − market` in signed bps on the YES side (Arena's existing definition, Vault #16).
- **Confidence** = data sufficiency (observations ≥ 6), freshness (LIVE), venue count (2 > 1),
  spread (tight > wide), liquidity, and stability (few sign flips) — a 0–10000 product of measured
  factors, **never a function of the edge** (§ "Market probability vs direction").
- **Reversal risk** = drift sign disagreement between the short and the long window, plus flip
  count — Vault #13's honest core, without the fabricated inputs.
- **Evidence** lines each carry the measured value and its source field (`kalshi.bidBps`,
  `polymarket.liquidityUsd`, `history[n].impliedBps`…). No adjectives without numbers.
- **SKIP / null** is the default: single venue *and* flat drift → no read; stale → no read.

This is a deliberately weak model. Its purpose is to be *true*, to start the out-of-sample record,
and to expose the model seam and lock policy so a stronger model (with a spot feed) replaces it by
version, not by edit.

## 4. Lock policy (what the Arena keeps from Vault #20)

All conditions are boolean reasons; all must pass; the list is returned verbatim so a refusal is
auditable:

| Condition | Vault | Arena v0 | Status |
|---|---|---|---|
| Observation floor | 360 s of the cycle | ≥ 6 observations of this market (≈3 min at 30 s) | NEEDS VALIDATION |
| Entry window | 6:00–12:00 of 15:00 | ≥ 2 refresh intervals before `closesAt` | NEEDS VALIDATION |
| Data fresh | ≤ 10 s | market `health.status === 'LIVE'` (≤ 60 s) and every venue ref LIVE | Arena cadence |
| Model quality | confidence 66–99 | `confidenceBps ≥ 6000` **and** the model has a read | NEEDS VALIDATION (66 was never validated; kept as the placeholder floor) |
| Evidence alignment | ≥ 6 of 11 families | every evidence line marked SUPPORTS or NEUTRAL; none CAUTIONS on direction | NEEDS VALIDATION |
| Temporal stability | 3 consecutive same-side obs, persistence ≥ 6 s | last 3 model reads same side, |edge| above spread each time | NEEDS VALIDATION |
| Reversal risk | threat < 30 | `reversalRiskBps < 3000` | NEEDS VALIDATION |
| Directional consistency | side from candidate, not edge sign | side = sign(edgeBps) on YES; mirrored-input test | PROVEN bug class |
| Minimum edge | ≥ 1.5 % or |p−0.5| ≥ 0.025 | `|edgeBps| ≥ max(150, spreadBps)` | NEEDS VALIDATION |
| One lock per market per user | one per cycle | ledger: refuse a second open lock on the same market by the same user | policy |

The gate does **not** convert a high confidence into a lock (Vault's `isEarlyLockQualified` shortcut
was removed there too — `:3336–3351`).

## 5. Versioning and reproducibility

- `VixyModel.version = 'vixy-arena-consensus-0.1.0'`. The constant table is part of the version; any
  change to a constant is a new version string. The ledger already freezes `model_version` and the
  evidence in every lock row; a `reproduce(lock)` test re-runs the model on the frozen inputs and
  must return the frozen `vixy_bps`.
- Settlement stays venue-authoritative (`engine.resolve()`); the model is never consulted at settlement.

## 6. Exposed dependencies (not substituted)

1. **Underlying spot feed** (Coinbase/Kraken/Binance) — required for any Vault-style 15M BTC model.
   Not present in the Arena; no fabricated stand-in.
2. **Observation history** — the Arena polls every 30 s but kept no history. v0 adds an in-memory
   ring per market (last 40 observations, ≈20 min) and, for reproducibility, freezes the observations
   used into the lock's evidence. A durable `observations` table is the next step if history beyond a
   process lifetime is needed.
3. **Settled outcomes** — zero today. Calibration report returns nulls until `n ≥ 30` settled and is
   labelled in-sample until a chronological holdout exists.

## 7. Tests this mapping requires (implemented in `server/test/model.test.ts`)

schema · missing data → null · stale → null · malformed → null · probability bounds · edge = vixy −
market · confidence bounds and independence from edge · reversal risk · chronological integrity
(observations must be ≤ now, ascending) · no look-ahead (a future observation in the buffer is
rejected) · lock gate per reason · SKIP behaviour · model version persisted in the lock row · lock
reproduction from frozen evidence · fixtures: strong UP, strong DOWN, conflicting venues, stale
feed, chop/high reversal, insufficient evidence, boundary (exactly the thresholds).
