# What Oliver has to do (nothing here can be done from this session)

Everything in the repo that could be built, tested and proved without your accounts is done: 69/69 server
tests green here and on your Mac, `verify:prod` clean, invariants 2597/2597, frozen zones byte-identical.
Four lines in `docs/PRODUCTION-READINESS.md` are FAIL, and every one of them is a thing only you can close,
because it needs a host, a card, or time. In order:

## 1. Pick the host (30 min) — closes DEPLOYMENT
Railway or Render, "web service", 512 MB, **always-on** (no sleep tier), one persistent volume mounted at
`/data`. Not Vercel: the engine polls venues on a 30 s timer, the settlement sweep and Discord re-check are
loops, and `/api/stream` is SSE — serverless freezes between requests and drops all four.
Repo settings: Node ≥ 22.18, build = the §2 commands in `docs/DEPLOY-RUNBOOK.md`, start = `node server/index.ts`,
health check = `GET /api/health`.

## 2. Environment variables (10 min)
Copy the block from `DEPLOY-RUNBOOK.md` §1 into the platform's env editor. Two that matter most:
- `SESSION_SECRET` = `openssl rand -hex 32`, **and never change it** — changing it signs every user out.
- `ENGINE=live` `MODEL=consensus`. A demo engine in production is refused by the server, deliberately.
`DATABASE_PATH=/data/arena.db` must sit on the persistent volume or you lose the locks on every deploy.

## 3. Stripe (20 min) — closes STRIPE (unverified)
Create the Payment Link → put it in `VITE_PAYMENT_LINK_URL` at build time. The app appends
`?client_reference_id=<userId>`; **that** is the identity key — the checkout email is not, which is what makes
Apple/Google private relay addresses harmless. Add the webhook `https://<domain>/api/billing/webhook` for
`checkout.session.completed` and `customer.subscription.created|updated|deleted`, paste the signing secret into
`STRIPE_WEBHOOK_SECRET`. Then one `stripe trigger checkout.session.completed` with a real user id and check
`GET /api/auth/session` shows `paid:true`. Anything unmatched parks — `node server/cli.ts stripe:unmatched`.

## 4. Discord (20 min) — closes DISCORD (unverified)
Create the application, OAuth2 redirect `https://<domain>/api/auth/discord/callback`, scopes
`identify guilds.members.read`. Guild id, and role id if you want role-gated Elite. Then do one real OAuth
round-trip yourself against your guild — that is the only step the tests could not do.

## 5. `npm run preflight` on the host — closes LIVE DATA
Run it there before you open the door. It checks the config, a writable DB, the Stripe/Discord config shape
(no secret is printed), **both venues reachable from that host**, the board priced and reading LIVE, depth
reported, and one `GET /markets/{ticker}` verify round-trip. It exits 1 with a list if anything fails.
It fails in this container and on your Mac by design — both are firewalled from the venues (HTTP 403), which
is the proof the check is real. A clean run on the host is the artifact that closes LIVE DATA and DEPLOYMENT.
Then walk the door by hand once: create account → UNLOCK → pay → JOIN_DISCORD → verify → OPEN, and confirm the
board shows real venue markets with **no DEMO badge**.

## 6. Then wait — this is the one that takes weeks, not minutes
MODEL VALIDATION cannot be closed by writing code. The engine has to run, record observations and reads, and
the venues have to resolve those markets. `GET /api/model/evaluation` reports the out-of-sample verdict; when
it has ≥ 30 out-of-sample locks and `skillVsMarket > 0`, the status flips to MODEL_READY **by itself**. Until
then every screen says MODEL_INSUFFICIENT_DATA and `GET /api/model` says `validated:false`, and that is correct.
If it never beats the venue price, the model is a price mirror and the product has to keep saying so.

## Two things that are honestly still not real
- **Vision has no reader.** The pipeline, the verification and the fail-closed paths are built and tested, but
  `VisionReader` has no implementation, so every real scan returns UNREADABLE and says so on screen. Ship it
  that way or connect an OCR/vision service behind the interface.
- **The model is implemented and tested, not validated.** No document, screen or API response in this repo
  calls it proven, accurate or profitable, and none should until §6 says otherwise.

## Backups
`arena.db` (WAL) nightly. It holds the locks, the settlements and the evaluation record — the three things
that cannot be rebuilt.
