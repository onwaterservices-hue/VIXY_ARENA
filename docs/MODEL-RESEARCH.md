# Model research — one honest attempt, and what it found (2026-09-07)

**Result: no shipped change. The one candidate that beat the market on development data failed on
the sealed holdout, so `vixy-arena-consensus-0.1.0` remains the default and nothing about the
model's status has improved.** This document exists so the attempt is on the record — including the
part where it did not work.

## The setup
The backtest corpus (6 197 settled Kalshi markets) was cut once, chronologically, **before any
research began** — `docs/HOLDOUT-SEAL.md`, DEV 4 337 markets to 2026-08-25, HOLDOUT 1 860 after it,
both ticker lists hashed. DEV was itself split: FIT (first 70 %) fitted everything; CHECK (last 30 %)
was looked at once at the end of the DEV phase. Model selection used 5-block chronological
cross-validation **inside FIT**, so even CHECK was not used for tuning.

## What was tried, on DEV
Eighteen features computable at the decision point from what the venue published before it: the price
itself, its distance from even, drift at three horizons, acceleration, realised volatility, the 20-bar
range and where the price sits in it, sign flips, spread level and mean, open interest, volume.

| Idea | FIT-internal CV gain vs the venue's price | Verdict |
|---|---|---|
| Isotonic recalibration of the price | +0.00058 (p = 0.53 on CHECK) | no |
| Sharpen the price (logit slope ≠ 1) | +0.00103, t = 2.86 | real on DEV — but see below |
| Price + momentum (drift 5/10/20, accel) | +0.00147, t = 2.78 | weaker than the range term |
| Price + **position in range** | **+0.00202, t = 3.06** | the best single idea |
| Price + everything (17 features, L2) | +0.00122, t = 1.35 | worse — noise |

Two things were worth writing down:

**1. The price is under-confident in DEV — but not everywhere.** Pooled, the fitted slope on
`logit(p)` is 1.164, and the calibration table shows favourites winning about 4–7 pp more often than
priced between 50 % and 95 %, longshots 3–5 pp less. That is a textbook favourite–longshot bias. But
fitting *within* each sport shows it is not general: in tennis (n = 1 834, the bulk of DEV) the effect
is exactly zero (t = −0.10), in e-sports it is large (+0.0115, t = 3.55), and in baseball applying it
**hurts** (−0.0033, t = −2.27). A "bias" that reverses by sport is a composition effect, not a law, so
no sharpening term was built.

**2. Where the price sits in its own recent range beat how far it moved.** After conditioning on the
price level, the residual runs monotonically from −3.8 pp in the bottom sextile of `posInRange` to
+3.9 pp in the fifth, and it is positive in every one of DEV's five chronological blocks and inside
tennis on its own (+0.0026, t = 2.51). It is negative in baseball and in the small "other" bucket.

## The candidate: vixy-arena-consensus-0.2.0
One parameter, one mechanism:

```
posInRange = (p − low20) / (high20 − low20)
apply only when   high20 − low20  >  max(100 bps, 2 × spread)      ← a range under two spreads is bid-ask bounce
vixy = logistic( logit(consensus + crossAdj) + W × (posInRange − ½) ),   W = 0.6591 fitted on DEV-FIT
```

The cross-venue term, the confidence score, the reversal risk and the whole lock policy are inherited
from 0.1.0 unchanged. The gate multiplier (2 × spread) was chosen from the middle of a sweep whose
values all landed between +0.0014 and +0.0020, deliberately not at the sweep's best point.

**On CHECK — DEV's held-out half, one look:** gain **+0.00235**, 95 % CI [+0.00039, +0.00433],
**p = 0.020**, against the shipped 0.1.0 rule's +0.00118 on the same rows. Twice the shipped rule, and
its interval excluded zero.

## The holdout — one read, 2026-09-07
Scored on the **shipped implementation**, not the research prototype, on the 1 860 markets sealed
before any of this began.

| Model | n | Brier | market Brier | gain | 95 % CI | p |
|---|---|---|---|---|---|---|
| **consensus-0.2.0 (the candidate)** | 1 834 | 0.13179 | 0.13158 | **−0.00021** | **[−0.00176, +0.00134]** | **0.78** |
| consensus-0.1.0 (shipped, for reference) | 1 834 | 0.13104 | 0.13158 | +0.00054 | [−0.00019, +0.00128] | 0.15 |

**It did not replicate.** A +0.0024 gain with p = 0.02 on DEV's held-out half became −0.0002 with
p = 0.78 on data the research never saw. The lock-gated arm agrees: 24 out-of-sample locks, skill
+0.0009, which is noise at that n.

For completeness, 0.1.0 is also not distinguishable from the market on the holdout (+0.00054,
p = 0.15). Neither model has demonstrated predictive information. The honest summary of the whole
exercise is that **the venue's price at 60 minutes to close is hard to beat with the venue's own price
history**, which is what an efficient market looks like.

## What was done about it
* `consensus-0.1.0` stays the default. `MODEL=continuation` selects 0.2.0 for anyone who wants to
  re-test it on a bigger corpus; its `CONSTANTS.validated` is `false` and it carries its own holdout
  result in `CONSTANTS.holdout`, so the failure travels with the code.
* Nothing in the product's language changed. `GET /api/model` still reports `validated: false`, the
  Brain screen still shows `MODEL_INSUFFICIENT_DATA`, `MODEL_READY` is still only reachable from the
  live ledger.
* The holdout has now been read **once**. It is spent for this line of research. Anything developed
  next needs a fresh corpus — a longer history, a second venue, or live ledger data — not a second
  look at these 1 860 markets.

## What would actually be worth trying next
Ranked by the prior this exercise leaves behind, not by enthusiasm:

1. **Data the venue's own price does not already contain.** Every feature here was a function of the
   Kalshi book. Beating a market with its own output is the hardest possible version of the problem.
   Live scores, lineups, weather, or the second venue's disagreement are the kinds of input that could
   carry information the price has not absorbed yet.
2. **The cross-venue term**, which is still completely unmeasured — a Kalshi-only replay has
   `crossAdj = 0`. `docs/BACKTEST.md` has the verified Polymarket recipe.
3. **Longer horizons.** 60 minutes before close is where the price is sharpest. Hours or days out, the
   market has done less work.
4. **Per-sport models**, but only with far more per-sport data than 300–2 000 markets. The family
   splits here were suggestive and under-powered, which is how sports-specific overfitting starts.
