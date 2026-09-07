# Connecting the engine

The interface is finished against a contract, not against a server. This document is the
whole integration surface: implement it and the shell becomes the product, with no
component changes.

---

## 1. The switch (build-time, since 2026-09-05)

The switch is no longer a constant in source. It is decided when the bundle is
built — `vite.config.ts` reads `.env.production` (see `.env.example`) and
`define`s `__DEMO_MODE__`, `__ENGINE_BASE_URL__`, `__AUTH_BASE_URL__`,
`__BILLING_BASE_URL__`, `__ACCOUNT_BASE_URL__`, `__PAYMENT_LINK_URL__` and
`__DISCORD_INVITE_URL__` as literals. `services/config.ts` exposes them.

Safety property: `vite build` (mode=production) is demo-free unless
`VITE_DEMO_MODE=true` is set on purpose. The demo provider, the preview
account and every "Simulate …" control are dead code in that bundle and are
not emitted. `npm run verify:prod` reads `dist/` and fails if any of their
strings survive. `npm run gate` runs typecheck → invariants → build → verify.

`resolveDataSource()` then returns `LiveEngineDataSource`. Everything else follows.

### Fail closed

The terminal renders only when the auth source reports `status: READY` and
`access.stage: OPEN`. `LOADING`, `UNAVAILABLE` and `NOT_CONFIGURED` render the
"Your access can't be verified right now" state — never the board, never a
fake lock. Billing state is informational (Access page); it is not part of the
gate, because the server has already folded payment into `access.stage`.

### Auth endpoints the client expects (HttpAuthSource)

| Method | Path | Purpose |
|---|---|---|
| GET  | /api/auth/session | `{ session, access: { stage, paid, discordJoined, discordVerified } }` — the server computes `stage` |
| POST | /api/auth/signup · /signin · /signout | account + cookie session (httpOnly, secure, sameSite) |
| POST | /api/auth/password/forgot | emails a single-use expiring token; same response whether or not the address exists |
| POST | /api/auth/password/reset | `{ token, password }` |
| POST | /api/auth/discord | server-side OAuth membership (and role) check; `discordVerified` comes from this only |

Every data route (`/api/snapshot`, SSE, `/api/scan`, `/api/calls`) must refuse
(401/403) a session whose stage is not `OPEN`.

---

## 2. The interface to implement

`services/api/ArenaDataSource.ts`

```ts
interface ArenaDataSource {
  readonly label: string;                 // shown in Settings
  readonly origin: 'DEMO' | 'LIVE';       // drives the DEMO badge
  load(): Promise<ArenaSnapshot>;         // GET  /api/snapshot
  subscribe(cb): () => void;              // SSE  /api/stream
  placeCall(intent): Promise<CallRecord>; // POST /api/calls
}
```

### `GET /api/snapshot`

Returns one `ArenaSnapshot` (see `types/index.ts`). Everything the shell renders comes from
this object. Suggested cache: 2–5s, private.

### `GET /api/stream` (server-sent events)

Each message is a complete `ArenaSnapshot`, or — if you prefer deltas — a patch the route
handler merges before it reaches the client. The client must never merge authoritative
state itself.

Every message carries the health envelope:

```jsonc
{
  "asOf": "2026-09-04T05:12:31.004Z",   // server clock
  "dataAgeMs": 1840,                     // age of the underlying source data
  "status": "LIVE",                      // LIVE | STALE | DEGRADED | RECONNECTING | OFFLINE | UNKNOWN
  "sourceHealth": { "kalshi": "LIVE", "polymarket": "DEGRADED" },
  "origin": "LIVE"
}
```

The client renders `status` verbatim. If the stream drops it shows `RECONNECTING`; if no
message arrives inside the freshness budget it shows `UNKNOWN`. It never keeps a green dot
alive on its own.

### `POST /api/calls`

Body: `CallIntent` — `{ marketId, direction, stakePoints }`.
Response: the written `CallRecord`, including the entry price **the server assigned**. The
UI displays the difference between the price the person saw and the price that was written;
do not paper over it.

Reject with a 4xx and a plain message for: unknown market, closed market, insufficient
points, stake outside limits. The ticket surfaces the message as-is.

---

## 3. Field rules the UI already assumes

| Rule | Why it matters |
|---|---|
| Probabilities are **integer basis points** (0–10000) | No float drift anywhere near a probability |
| `edgeBps === vixyProbabilityBps − marketProbabilityBps` | The ladder draws the difference; it never recomputes it |
| `provenance` is present whenever `vixyProbabilityBps` is | A number without a model version is not displayed as a model output |
| `resolution` is present on every market | A market that cannot say how it settles is not tradeable intelligence |
| `opportunities` arrive **pre-ranked**, `rank` = 1..n | The client does not sort by edge and call it a ranking |
| `evidence` is engine-generated | The interface never writes an explanation |
| `leaderboard[].isYou` is set by the server | Identity is not inferred client-side |
| Timestamps are ISO-8601 from the **server clock** | Ages are computed against server time, not the browser's |

`tools/checks/invariants.ts` asserts every one of these. Point it at the live snapshot the
day the engine ships:

```bash
npm run check
```

---

## 4. What must not move into the client

- edge, edge score, ranking
- settlement, results, points, XP, streaks
- liveness / freshness classification
- entitlements or admin authorization

Each of these is a named failure class from the Vault post-mortem. The shell is built so
that adding them here would be conspicuous: no component fetches, and no component owns
state that outlives a render.
