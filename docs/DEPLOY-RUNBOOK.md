# VIXY ARENA — Deploy runbook (Oliver runs this; nothing here deploys by itself)

## 0. What ships
One Node ≥ 22.18 process (`node server/index.ts`) serving the static bundle and `/api/*` from the same
origin, with one SQLite file. No package install is needed for the server (zero dependencies). The client
bundle is built once (`vite build` when npm is reachable; the esbuild command in §2 otherwise).

Hosts that fit: any always-on Linux box or container (Railway, Render, Fly, a $5 VPS). **Not** Vercel
serverless: the engine polls venues on a timer, the settlement sweep and Discord re-check are loops, and
the SSE stream needs a long-lived process.

## 1. Secrets and config — `server/.env` (never committed)
```
NODE_ENV=production
PORT=8787                      HOST=0.0.0.0
SESSION_SECRET=<openssl rand -hex 32>        # required; the server refuses to start without it
COOKIE_SECURE=true
DATABASE_PATH=/var/lib/vixy-arena/arena.db   # persistent volume
STATIC_DIR=dist
ENGINE=live                    MODEL=consensus      # 0.1.0 is the default; `continuation` (0.2.0) failed its holdout — see docs/MODEL-RESEARCH.md      # demo in production is refused unless ALLOW_DEMO_ENGINE_IN_PRODUCTION=true
ENGINE_REFRESH_SECONDS=30      SETTLE_SWEEP_SECONDS=60
DISCORD_REQUIRED=true
DISCORD_CLIENT_ID=… DISCORD_CLIENT_SECRET=… DISCORD_GUILD_ID=… DISCORD_ROLE_ID=(optional)
DISCORD_REDIRECT_URL=https://<your-domain>/api/auth/discord/callback
STRIPE_WEBHOOK_SECRET=whsec_…  STRIPE_EMAIL_FALLBACK=false
MAIL_MODE=webhook              MAIL_WEBHOOK_URL=https://<your transactional mail hook>   MAIL_FROM="VIXY ARENA <no-reply@your-domain>"
```
Client build-time (`.env` for vite / `--define` for esbuild): `VITE_PAYMENT_LINK_URL=https://buy.stripe.com/…`,
`VITE_DISCORD_INVITE_URL=https://discord.gg/…`, `VITE_DEMO_MODE` unset (production build is demo-free; `verify:prod` proves it).

## 2. Build
```
npm run typecheck && npm run check && npm run test:server      # 81 tests
npm run build && DIST=dist npm run verify:prod                  # vite; or the esbuild fallback below
```
esbuild fallback (npm unreachable): `esbuild index.tsx --bundle --format=esm --jsx=automatic --target=es2022 --minify
--outfile=dist/bundle.js --define:__DEMO_MODE__=false --define:__ENGINE_BASE_URL__='""' … --define:process.env.NODE_ENV='"production"'`,
copy `styles/*.css` to `dist/styles/`, copy `index.html` with the script src pointed at `./bundle.js` and the
aistudiocdn import map removed.

## 3. Stripe (your side)
1. Create the Payment Link; the app appends `?client_reference_id=<userId>` automatically — that is the
   identity key. Email is not.
2. Add a webhook endpoint `https://<domain>/api/billing/webhook` for `checkout.session.completed`,
   `customer.subscription.created|updated|deleted`; paste its signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Smoke: `stripe trigger checkout.session.completed` with a real user id → `GET /api/auth/session` shows
   `paid:true`. Unmatched events park (`node server/cli.ts stripe:unmatched`), attach with `stripe:attach`.

## 4. Discord (your side)
Create the application, OAuth2 redirect = `DISCORD_REDIRECT_URL`, scopes `identify guilds.members.read`.
Guild id and optional role id into `.env`. Re-verification runs every `DISCORD_RECHECK_HOURS` (24) and a
verification older than `DISCORD_MAX_AGE_HOURS` (336) sends the member back to JOIN_DISCORD.

## 5. Start and prove
```
npm run preflight                               # REQUIRED: config + both venues + verify round-trip, from this host
node server/index.ts                            # logs: engine=live, model=vixy-arena-consensus-0.1.0, discord/stripe configured
curl https://<domain>/api/health                # ok, engine label, origin LIVE
curl https://<domain>/api/model                 # model version, validated:false, policy thresholds
curl https://<domain>/api/public/board          # redacted coverage; no probabilities except the featured one
```
Then the door, by hand: create account → UNLOCK → pay → JOIN_DISCORD → verify → OPEN → board shows real
venue markets with **no DEMO badge**. `GET /api/snapshot` unauthenticated must be 401.

**First-hour honesty check:** `system.sources` on the board must read LIVE for both venues within a minute.
If a venue reads DEGRADED, the host cannot reach it — the board says so; do not "fix" the label.

## 6. Operate
`node server/cli.ts users | calls | settle | evaluate | audit | stripe:unmatched | stripe:attach | grant <email> [days]` (grant is audited).
Back up `arena.db` (WAL) nightly — it holds the locks, the settlements AND the evaluation record.
`GET /api/model/calibration` (nulls until 30 settled) · `GET /api/model/evaluation` (out-of-sample verdict) · `npm run preflight` any time the host's network changes.

## 7. Known not-real at first deploy
No sub-minute spot feed (no BTC-15M style model); Vision has no pixel reader (scans return UNREADABLE and say
so); model constants unvalidated — the 6 197-market backtest (`npm run backtest`, `docs/BACKTEST.md`) measured them and the
out-of-sample interval contains zero, and the one research candidate built to fix that failed its sealed holdout
(`docs/MODEL-RESEARCH.md`). The ledger still has to validate the model forward, and `MODEL_INSUFFICIENT_DATA` shows on the
Brain screen until it does.
