# Live venue audit — Kalshi and Polymarket (2026-09-06)

**How this was verified.** Both sandboxes available to this session (the cloud container and the local
Cowork VM on Oliver's Mac) are firewalled from `api.elections.kalshi.com` and `gamma-api.polymarket.com`
(`CONNECT tunnel failed, 403` / `http=000`). Every finding below was obtained by driving Oliver's own
Chrome to the endpoints (real network, real responses, HTTP status read from the network log) and the
responses were captured into `server/engine/venues/fixtures/` (`kalshi-events-series-nfl.json`,
`kalshi-market-settled.json`, `polymarket-gamma-resolution.json`, plus the earlier NFL/Gamma captures).
**The production host itself has not made these calls yet** — that is the first smoke test in the runbook,
and until it passes the LIVE DATA line in `PRODUCTION-READINESS.md` stays FAIL.

## Kalshi — trade-api v2

| # | Question | Finding | Consequence in code |
|---|---|---|---|
| 1 | Endpoints used | `GET /events?series_ticker=<S>&status=open&with_nested_markets=true&limit=100` (discovery, one call per configured series) · `GET /markets/{ticker}` (verify + outcome) | `KalshiAdapter.fetchOpen/fetchMarket` |
| 2 | Works from production host | **Unverified** from any reachable host; verified from Oliver's browser (HTTP 200) | runbook §5 smoke test |
| 3 | Authentication | None required for market data (all calls above answered 200 with no key). Trading endpoints need signed headers — not used | no secrets in the engine |
| 4 | Rate limits | No `X-RateLimit-*` headers observed. Kalshi documents tiered limits (~10–20 read req/s for unauthenticated). One request per series per refresh (14 series / 30 s ≈ 0.5 req/s) | 429 + `Retry-After` honoured: engine backs off, keeps last rows, reports DEGRADED with the venue's words |
| 5 | Identification | `event_ticker` (game), `ticker` (side), `series_ticker` (league); nested markets omit `event_ticker` on some listings → parent fallback | `normalizeKalshiMarket` |
| 6 | Current price | `yes_bid_dollars` / `yes_ask_dollars` strings ("0.6200"); mid when both sides > 0, else `last_price_dollars`; a 0/1 book is not a price | `impliedBps`, `spreadBps` |
| 7 | Open/closed | `status`: `active` → OPEN, `closed` → CLOSED, `finalized`/`settled` → SETTLED | `statusOf` |
| 8 | Timestamps | `open_time`, `close_time` (order acceptance ends), `expiration_time`, `expected_expiration_time`, `updated_time` (venue-side freshness), `settlement_ts` on settled rows | `closesAt`, `occursAt` |
| 9 | Resolution | `result`: `"yes"` / `"no"` / `"void"` / `""` (open). Observed: `result:"no", status:"finalized", settlement_ts` present. Nothing else counts as an outcome | `resultOf`; `resolve()` refuses without it |
| 10 | Error behaviour | Unknown ticker → HTTP 404 `{"error":{"code":"not_found","message":"not found"}}`; malformed → 400 | `fetchMarket` → null; discovery per-series errors reported as `partial`, all-failed → error |
| 11 | Stale data | Rows carry the server's `fetchedAt`; health from age (LIVE ≤60 s, STALE ≤5 m, DEGRADED). A failed refresh keeps old rows and their age keeps growing — never presented as fresh | `feedStatus`, `envelope` |

**Defects found and fixed in this audit**
- The generic `/events?status=open` listing is sorted by close time **descending** — the first 200 events
  are 2050–2099 placeholders with zero book. `/markets?status=open` is dominated by `KXMVECROSSCATEGORY`
  shards with 0 bid / 0 ask. The old `fetchOpen` would have shown a dead board. Discovery is now by series
  (`DEFAULT_KALSHI_SERIES`, configurable), which returns the real, liquid markets.
- `liquidity_dollars` is `"0.0000"` on every public read. It fed the model's liquidity factor and the
  cross-venue weighting. Depth is now `open_interest_fp` (real: e.g. $274,315 on NE–SEA), falling back to
  24 h volume; the model's liquidity factor reads that.
- No request timeout existed. `venueFetch` aborts at 8 s.
- `retry-after` on 429 is honoured (tested).

## Polymarket — Gamma API

| # | Question | Finding | Consequence |
|---|---|---|---|
| 1 | Endpoints | `GET /markets?limit=200&active=true&closed=false&order=volume24hr&ascending=false` (discovery) · `GET /markets?condition_ids=<0x…>` or `?slug=` (verify + outcome) | `PolymarketAdapter` |
| 2 | Works from host | Unverified from any reachable host; HTTP 200 from Oliver's browser | runbook smoke test |
| 3 | Authentication | None for Gamma reads (CLOB trading needs keys — not used) | — |
| 4 | Rate limits | None advertised in headers; Cloudflare in front. One request per refresh | 429 handled |
| 5 | Identification | `id`, `conditionId` (0x… hex), `slug`, `events[0].title`; `outcomes` / `outcomePrices` are JSON strings; only two-outcome markets become rows | `normalizePolymarketMarket` |
| 6 | Price | `outcomePrices[idx]` (0..1) for the YES-like outcome, `bestBid`/`bestAsk`/`spread`, `lastTradePrice` | `impliedBps` |
| 7 | Open/closed | `closed:false` + `acceptingOrders:true` → OPEN. Note `active:true` persists on closed markets — never use `active` alone | `statusOf` |
| 8 | Timestamps | `startDate`, `endDate` (may be a far placeholder, e.g. 2029 for a market that closed 2026-08-08), `closedTime`, `updatedAt` (venue freshness) | `closesAt = endDate` |
| 9 | Resolution | Verified live: resolved → `closed:true`, `umaResolutionStatus:"resolved"`, `umaEndDate`, `outcomePrices ["0","1"]`. `"proposed"` = pending challenge window, **not** a result | `result` only when all three hold |
| 10 | Errors | Bad id → HTTP 4xx `{"type":"validation error","error":"id is invalid"}`; empty array for an unknown condition id | null |
| 11 | Stale | as Kalshi; additionally `updatedAt` is exposed to the model's inputs through `fetchedAt` only (venue clock not trusted for freshness) | — |

## What "LIVE" now proves, per market
`venueRefs[].venueMarketId` (identity), `venueRefs[].venue`, `venueRefs[].status` (per-venue freshness),
`health.asOf` + `health.dataAgeMs` (timestamp + age), `health.sourceHealth`, `state` (OPEN/LOCKING/LOCKED/SETTLED),
and `system.sources[].endpoint` / `httpStatus` / `note` (the request behind the badge). A market whose venue
read is older than 60 s is STALE, older than 5 min DEGRADED, and a venue error is DEGRADED with the venue's
message in `note`. Nothing in this path substitutes demo data; the DEMO engine is a different process
setting (`ENGINE=demo`) that is refused in production.
