# Archived Kalshi price history — the backtest corpus

6 197 settled Kalshi markets (one per event) in two corpora — a 1 765-market pilot (files 000–015) and a
pre-registered 4 432-market main corpus (files c000–c036) — harvested 2026-09-07 from the public
`trade-api/v2` candlestick endpoint through a browser on Oliver's machine (both sandboxes
are firewalled from the venue). Every line is one market:

```
TICKER_SUFFIX|SERIES|closeTs|y/n|startTs|openInterestUsd|volumeUsd|bid.spread,bid.spread,…
```

* `y`/`n` is the venue's own published `result`, never inferred from a price.
* Bars are Kalshi 1-minute candlesticks over `[close − 5400 s, close − 3600 s]`: the model's
  decision point is one hour before the market closed, and it never sees a bar after it.
* Prices are the close of the YES book in cents; `spread` is ask − bid in cents. `-` = no bar
  that minute (the venue published none).
* Open interest and volume are the last bar's, in venue units.

Each chunk was transferred with a length/line/digit-sum/rolling-hash checksum computed in the
page and re-computed on disk (`server/tools/ck.py`); all 53 files matched byte-exactly. Three
markets were re-fetched from Kalshi afterwards and compared bar-for-bar as a provenance check.

`node server/tools/parse-harvest.mjs <dir> archive.json` turns these into the archive the
backtest replays. See `docs/BACKTEST.md`.
