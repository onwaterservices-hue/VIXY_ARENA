# Deployment architecture — the smallest reliable production shape

## Why not Vercel (for the backend)
`server/index.ts` is one long-lived Node process: it polls both venues every 30 s, keeps the model's
observation window in memory, runs the settlement sweep and the Discord re-check on timers, and holds
SSE connections open for `/api/stream`. Serverless functions freeze between requests and have no shared
memory; Vault's engine on Vercel dropped ticks for exactly this reason (its own `PROJECT_STATE.md`
records the migration decision). The Arena backend therefore needs an **always-on host**. The static
bundle can live anywhere, including on the same process.

## Recommended shape (one box, one process, one file)

```
                 ┌───────────────────────────────────────────────┐
  browser ──TLS──►  Railway / Render / Fly service  (Node ≥ 22.18) │
                 │   node server/index.ts                          │
                 │   ├─ serves dist/ (STATIC_DIR)                  │
                 │   ├─ /api/*  (auth, billing, discord, engine)   │
                 │   ├─ LiveEngine: Kalshi + Polymarket every 30 s │
                 │   ├─ settlement sweep every 60 s                 │
                 │   ├─ Discord re-check every 15 min               │
                 │   └─ SQLite  /data/arena.db  (persistent volume) │
                 └───────────────┬───────────────────────────────┘
        Stripe ──webhook──► /api/billing/webhook    Discord ──OAuth──► /api/auth/discord/callback
```

| Concern | Choice | Why |
|---|---|---|
| Frontend host | same process (`STATIC_DIR=dist`) | same origin → first-party cookie, no CORS, one deploy. A CDN in front is optional |
| Backend host | Railway or Render "web service", 512 MB, always-on (no sleep tier) | persistent process + persistent volume + TLS + logs for ~$5–7/mo |
| Database | SQLite (WAL) on the service's persistent volume, `DATABASE_PATH=/data/arena.db` | zero-dependency, one writer, tables are small; nightly copy of the file is the backup |
| Process manager | the platform's (auto-restart on crash, health-check restarts) | `restart: always` semantics; the engine rebuilds its window from live reads after a restart (fail-closed: SKIP until 6 fresh observations) |
| Health checks | `GET /api/health` → 200 `{ok:true, engine, origin}` for liveness; `GET /api/snapshot` needs auth so readiness is `/api/health` + `system.sources[].status` on the board | the platform restarts on non-200 |
| Cron / sweeps | in-process timers (`SETTLE_SWEEP_SECONDS`, `DISCORD_RECHECK_LOOP_MINUTES`) — no external cron | a second scheduler would double-run against one SQLite file |
| Logging | stdout → platform logs; the server logs settlement reports, Discord re-check summaries, unhandled errors. `audit` table holds every access-affecting write | grep-able; the audit table is the source of truth for "who did what" |
| Secrets | platform environment variables (never in the repo) | `SESSION_SECRET` must be stable across restarts or every session dies on deploy |

## Environment variables (see `server/.env.example` for comments)
`NODE_ENV=production` · `PORT` · `HOST=0.0.0.0` · `SESSION_SECRET` · `COOKIE_SECURE=true` · `DATABASE_PATH` · `STATIC_DIR=dist`
· `ENGINE=live` · `MODEL=consensus` · `ENGINE_REFRESH_SECONDS=30` · `SETTLE_SWEEP_SECONDS=60`
· `DISCORD_REQUIRED` `DISCORD_CLIENT_ID` `DISCORD_CLIENT_SECRET` `DISCORD_GUILD_ID` `DISCORD_ROLE_ID` `DISCORD_REDIRECT_URL` `DISCORD_RECHECK_HOURS` `DISCORD_MAX_AGE_HOURS`
· `STRIPE_WEBHOOK_SECRET` · `STRIPE_EMAIL_FALLBACK=false` · `MAIL_MODE=webhook` `MAIL_WEBHOOK_URL` `MAIL_FROM`
· client build: `VITE_PAYMENT_LINK_URL`, `VITE_DISCORD_INVITE_URL` (no `VITE_DEMO_MODE`).

## External URLs to register
- Stripe webhook: `https://<domain>/api/billing/webhook` — events `checkout.session.completed`, `customer.subscription.created|updated|deleted`.
- Discord OAuth2 redirect: `https://<domain>/api/auth/discord/callback` — scopes `identify guilds.members.read`.
- Venue APIs: outbound HTTPS to `api.elections.kalshi.com` and `gamma-api.polymarket.com` (no keys). The host must allow egress; the first smoke test proves it.

## Restart behaviour
- Sessions: cookie tokens are hashed in SQLite; a restart with the same `SESSION_SECRET` keeps everyone signed in (tested in `lifecycle.test.ts`).
- Locks and settlements: SQLite rows; a restart before or after settlement changes nothing (tested).
- Model window: in memory; after a restart every market SKIPs until it has 6 fresh observations (~3 min). The durable `observations` table is the evaluation record, not the live window.
- Discord/Stripe back-off state: in memory; a restart simply retries.

## What this is not
Not multi-region, not horizontally scaled (SQLite = one writer). That is correct for launch; the first
scaling step is a managed Postgres behind the same `db.ts` shim, and it is not needed until the audit
table shows real load.
