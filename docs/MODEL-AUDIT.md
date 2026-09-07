# Model audit — `vixy-arena-consensus-0.1.0` (2026-09-06)

Status words are deliberate: this model is **implemented, tested, unvalidated**. Nothing below is
evidence of predictive validity. `docs/VIXY-MODEL-MAPPING.md` explains why it is this weak on purpose.

## 1. Inputs (per market, from `server/engine/model/features.ts`, feature set `arena-features-0.1.0`)

| Feature | Source | Definition | Null when |
|---|---|---|---|
| `venues[i].impliedBps` | latest observation per venue | venue YES price, bps (Kalshi: mid of yes bid/ask, else last; Polymarket: `outcomePrices[yes]`) | no price |
| `spreadBps` (market) | latest observation | max over venues of `ask − bid` | no book |
| `liquidityUsd` → `totalLiquidityUsd` | `depthUsd()` | exchange liquidity if > 0, else open interest, else 24 h volume | none reported |
| `mostLiquid` | above | venue with the largest depth | no depth |
| `consensusBps` | `canonical.ts` | depth-weighted mean of venue prices (single venue → its price) | — |
| `dispersionBps` | `canonical.ts` | max − min venue price | one venue |
| `observations` | `ObservationHistory` | count of past OPEN observations for the venue market, ascending, ≤ now | — |
| `driftShortBps` | history | `last − obs[n−1−3]` | < 4 observations |
| `driftLongBps` | history | `last − first` within the last 20 observations | < 2 |
| `volatilityBps` | history | sample stdev of consecutive changes over the long window | < 6 |
| `flips` | history | sign changes between consecutive non-zero changes | — |
| `maxAgeMs` | history | age of the oldest "latest observation" across venues | — |
| `msToClose` | market | `closesAt − now` | — |

Every input is a past observation or a current venue field. There is **no** outcome, settlement price,
post-close print, or venue clock in the feature set; `ObservationHistory.record` refuses non-OPEN rows
and future timestamps, and `get(now)` never returns an observation after `now`.

## 2. Transformations and constants (`consensusModel.ts` `CONSTANTS`, all `validated:false`)

```
noiseFloor  = max(50, spreadBps)                                    (bps)
primary     = venue with the most depth (else the first)
crossAdj    = round( 0.5 × (primary.impliedBps − consensusBps) )     only with ≥ 2 venues
driftAdj    = round( clamp( 0.35 × driftLongBps, −300, +300 ) )      only if |driftLongBps| > noiseFloor
vixyBps     = clamp( consensusBps + crossAdj + driftAdj, 100, 9900 )
SKIP (null) if maxAgeMs > 60 000, or minObservations < 6, or any implied ∉ [0, 10000], or crossAdj = driftAdj = 0
```
Rounding is half-away-from-zero so YES and NO mirror exactly (tested).

**Edge** is not computed by the model: `applyModel` sets `edgeBps = vixyBps − marketProbabilityBps` (signed,
YES side). **Direction** for the lock policy is `sign(edgeBps)` on the YES side only, never the edge's size.

**Confidence** (`confidenceBps = 10000 × Π factors`, none of which looks at the edge):
venues (1 venue → 0.7) × observations (min(1, n/20)) × spread (≤200 → 1, ≤600 → 0.8, else 0.6; unknown 0.8)
× depth (≥10k → 1, ≥1k → 0.85, else 0.7; unknown 0.75) × flips (≤2 → 1, ≤4 → 0.8, else 0.6).
Consequence: a single-venue market can never exceed 70 % and needs 20 observations to reach the 60 % lock floor.

**Reversal risk** (`reversalRiskBps`, capped 10000) = 800 × flips + 2500 if short-window drift opposes
long-window drift + 1000 if spread > |driftLong|.

**Regime**: ILLIQUID (depth < 1k) · UNKNOWN (no volatility) · RANGING (flips > 4, or flat) · VOLATILE (stdev > 150) · TRENDING (|drift| > floor).

## 3. Lock policy (`lockPolicy.ts`, `arena-lock-policy-0.1.0`, all thresholds `validated:false`)
MODEL_READ · DATA_FRESH (market and every venue LIVE) · MARKET_OPEN · ENTRY_WINDOW (≥ 2 refresh intervals to
close) · OBSERVATION_FLOOR (≥ 6) · MODEL_QUALITY (confidence ≥ 60 %) · REVERSAL_RISK (< 30 %) · MINIMUM_EDGE
(|edge| ≥ max(150, spread)) · DIRECTIONAL_CONSISTENCY (requested side = model side) · EVIDENCE_ALIGNMENT (not
ILLIQUID; not RANGING with reversal ≥ 15 %) · TEMPORAL_STABILITY (last 3 prior reads same side, |edge| above the
floor each time). All must pass; a high confidence bypasses nothing (tested).

## 4. Leakage tests (all in `server/test/model.test.ts` and `evaluation.test.ts`, passing)
| Risk | Guard | Test |
|---|---|---|
| Look-ahead | `record()` throws on a future timestamp; `get(now)` filters; windows checked ≤ now | "chronological integrity and no look-ahead" |
| Timestamp leakage | read as-of t equals read on a history truncated at t | same |
| Duplicated observations | same timestamp ignored (memory) and `INSERT OR IGNORE` on (venue, id, at) (store) | "leakage guards…" |
| Post-resolution information | non-OPEN rows (SETTLED/CLOSED with 0/1 prints) never enter the history | same |
| Target leakage | the feature set contains no outcome field; evaluation joins only outcomes with `resolved_at_ms > read.at` | "reads after the outcome are excluded" |
| Venue-price leakage | the only venue price used is the one observed at or before `now`; settlement uses the venue's published result, never a price | ledger tests |
| Survivorship | skips are recorded (`model_reads.skipped`, reason) and outcomes are recorded for every observed market, locked or not | "the engine writes reads AND skips" |
| Calibration | Brier / log-loss / calibration error on the frozen side-probability; nulls below 30 settled | calibration test |
| Tuning on the test set | no code path reads the evaluation to change a constant; constants change only with a new version string | by construction |

## 5. Known weaknesses (honest)
- The drift term is a momentum assumption with no validation; on efficient markets it is at best zero-information.
- The cross-venue term assumes the deeper venue is "more right"; plausible, unvalidated.
- Confidence factors are hand-set; confidence is uncalibrated until the ledger has a sample.
- Observation history is in memory (the durable `observations` table is the record, not the model's input);
  a restart empties the model's window and it SKIPs until 6 fresh observations exist. That is fail-closed.
- No underlying-asset feed → no BTC-15M-style model; nothing pretends otherwise.
