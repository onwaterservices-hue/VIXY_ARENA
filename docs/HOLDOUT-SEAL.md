# Holdout seal — sealed 2026-09-07, before any model research began

The backtest corpus (`server/test/fixtures/backtest-archive/`, 6 197 settled Kalshi markets) is cut
once, chronologically, by the market's close time. `server/research/corpus.ts` is the only thing that
draws the line, and it draws it the same way every time.

| | |
|---|---|
| DEV | **4 337** markets, 2026-07-01T00:58:34Z → 2026-08-25T13:24:34Z |
| Boundary | **2026-08-25T13:26:26Z** |
| HOLDOUT | **1 860** markets, 2026-08-25T13:26:26Z → 2026-09-07T03:09:48Z |
| DEV ticker-list sha256 | `5c7eb1db84847772cb1f5f1a769e4156d11ae110e580ecc6eb1090f3199dc743` |
| HOLDOUT ticker-list sha256 | `648e7fc70c141a594554058cd2c756852e3b2bc4d05277cbb5b44846494fdee4` |

## The rule
Every feature, every threshold, every model choice is made on DEV and only DEV. Model selection inside
DEV uses its own internal chronological split, so even DEV's own test half is not used for tuning.

**The holdout is scored once, by one final model, and the number that comes back is the number that
gets reported** — better or worse. Reading it requires calling `unseal(reason)`, which prints a loud
banner naming the reason, so no run that touched the holdout can be mistaken for one that did not.

If a holdout result is disappointing and a "fix" is then tried, that fix is a NEW model developed on
DEV, and it needs a new corpus to be scored honestly — not a second look at this one. Any such second
scoring must be recorded below with its reason, and the report must say how many times the holdout has
been read.

## Holdout reads
| # | Date | Model | Reason | Result |
|---|---|---|---|---|
| 1 | 2026-09-07 | `vixy-arena-consensus-0.2.0` | final scoring of the model selected on DEV (`docs/MODEL-RESEARCH.md`) | gain **−0.00021**, CI [−0.00176, +0.00134], p = 0.78 — did not beat the venue's price |

**The holdout has been read once and is spent for this line of research.** The next candidate needs a
fresh corpus (longer history, a second venue, or live ledger data), not a second look at these 1 860
markets.
