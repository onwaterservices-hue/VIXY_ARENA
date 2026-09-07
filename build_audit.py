import json, html
IMG = json.load(open('thumbs/data.json'))

V = {
 'WOW':   ('🔥🔥', 'WOW — don’t touch', 'wow'),
 'KEEP':  ('🔥', 'KEEP', 'keep'),
 'SIG':   ('💎', 'SIGNATURE', 'sig'),
 'REB':   ('⚡', 'REBUILD (mobile stack only)', 'reb'),
 'CUT':   ('✂️', 'REMOVE', 'cut'),
}
# (shot key, title, [verdict codes], broken flag, note)
PAGES = [
 ('DOOR', [
  ('01-landing', 'Landing', ['WOW'], False,
   'Passes the five-second test: hero, how it works, live wall, four-step “Getting in”, straight answers. One watch item: the hero stat row (1122 tracked · 694 matched · 61.2% calibration) carries no origin badge — the DEMO label first appears at the market wall further down. In production, gate the calibration figure on a real settled sample before it is allowed on the front door.'),
  ('02-auth-create', 'Create account', ['KEEP'], True,
   'The screen is right and says exactly what it is (“PREVIEW ACCOUNT — this account lives in this browser only”). Behind it: <code>LocalPreviewAuthSource</code>, a localStorage record. No password reset exists anywhere (zero matches for forgot/reset across components, services, types). No session expiry concept exists either.'),
  ('03-auth-signin', 'Sign in', ['KEEP'], True,
   'Same verdict as Create account — one component, two modes. The password is SHA-256 hashed in the browser and never compared by a server, because there is no server.'),
  ('04-locked-unlock', 'Terminal locked · step 2 Unlock', ['KEEP'], True,
   'One step, one button, frosted skeleton. Leak check repeated at 390 and 1440: the only percentage on the locked screen is the engine’s own calibration (61.2%); every market price is hidden and the ticker reads “MARKET PRICES UNLOCK WITH THE TERMINAL”. “Simulate a confirmed payment · DEMO ONLY” must not exist in a production build — see gate item 10 for why that is not yet guaranteed. On the phone the ticker label wraps to three lines in the header; shorten the copy.'),
  ('06-locked-discord', 'Terminal locked · step 3 Discord', ['KEEP'], True,
   '“Unlocked. Join the room.” is the right voice. “I’ve joined” is a self-report and the screen says so; <code>discordVerified</code> is hard-coded <code>false</code> in the preview source. Production needs Discord OAuth membership (and role) verification on the server.'),
  ('05-access-unlock', 'Access', ['KEEP'], False,
   'Four steps, the account system’s own words (“Simulated · demo”, “Reported · unverified”), no price anywhere, billing “not connected” stated plainly. Correct — and correctly empty until the backend exists.'),
 ]),
 ('TERMINAL', [
  ('10-markets', 'All Markets (home)', ['KEEP','REB'], False,
   'Desktop is busy but legible. On a 390×844 phone the stack above the board — degraded-source banner, “New here?” strip, Daily Slate strip, the filter block — pushes the first market card below the fold. The home screen’s job is to show a market. Collapse that stack to one strip on phones; nothing else about the screen changes.'),
  ('11-arena', 'Arena', ['WOW'], False, 'The ball, the matchup, the ladder. This is the product’s identity at both widths.'),
  ('12-match', 'Match Center', ['KEEP'], False, 'Fine. Worth its tab only once a real sports feed is behind it.'),
  ('13-live', 'Live', ['KEEP'], True,
   'Good screen, one contradiction: the tiles say “DEGRADED FEEDS 0 · all sources fresh” while the banner above says “1 source degraded — Inference workers”. Two health truths on one screen. Health must come from one server-computed envelope and every surface must read the same one.'),
  ('14-vision', 'Arena Vision', ['SIG'], True,
   'The tab, the drop zone, the three-step explainer, the verdict card are the right shape, and this is the feature people will screenshot. The read is fake by construction: <code>demoProvider.scanMarket</code> hashes <code>fileName:bytes:dataUrl tail</code> and picks a seeded market — it never looks at a pixel. The SIMULATED READ label is the only thing that makes it honest; it stays until the real pipeline (image → market identification → live fetch → engine) exists.'),
  ('15-daily', 'Daily Slate', ['KEEP'], False, 'Objectives reward analysis over volume. Keep exactly this.'),
  ('16-upnext', 'Up Next', ['KEEP'], False, 'Clean schedule at both widths.'),
  ('17-sector-sports', 'Sector hubs (Sports, Crypto, Politics, Weather, Macro, Entertainment, News)', ['KEEP'], False,
   'One component, seven rows — Crypto looks exactly like Weather, which is the point. On phones the explainer paragraph plus four stat tiles sit above the first market; consider hiding the paragraph on small screens (copy only, no redesign).'),
  ('24-signals', 'Signals', ['KEEP'], False, 'A console that looks like one.'),
  ('25-watchlist', 'Watchlist', ['KEEP'], False, 'Honest, useful empty state; says the watchlist is a browser preference, not a position.'),
  ('26-alerts', 'Alerts', ['KEEP'], False, 'Fine. Could fold into Signals later; not now.'),
  ('27-portfolio', 'Portfolio', ['WOW'], False, 'The record card is the best player card in the app — on the phone it is the whole first screen.'),
  ('28-history', 'History', ['KEEP'], False, 'Audit trail, calibration curve, resolution criteria, CSV export. Dense on purpose.'),
  ('29-leaderboard', 'Leaderboard', ['KEEP'], False,
   'Fine. Demo figures contradict Portfolio (73.6% over 412 calls here vs 75.0% over 4 settled there) — harmless while labeled DEMO, but a reminder that every number must come from one engine record.'),
  ('30-brain', 'VIXY Brain', ['WOW'], False, 'Hexagon core, calibration ring, queue pressure, model card. Don’t touch. (Demo says 1,122 markets tracked while the board holds 33 — same single-source note as Leaderboard.)'),
  ('31-cross', 'Cross-Market', ['KEEP'], False, 'Good idea, thin until the relationship graph is the engine’s.'),
  ('32-neural', 'Neural Map', ['KEEP'], False, 'Beautiful, secondary, labeled “TOPOLOGY DEMO”.'),
  ('33-telemetry', 'Telemetry', ['KEEP'], True,
   'Operator screen, well laid out — but “Kalshi ingest · LIVE · 416 events/min · 99% success” and “Polymarket ingest · LIVE” are fabricated health rendered with the word LIVE. This is the exact false-LIVE failure class from Vault, one DEMO badge away from being believed. In demo builds source status must read SIMULATED, never LIVE; in production it must be the server’s health envelope.'),
  ('34-admin', 'Admin', ['KEEP'], False, 'Read-only by design and says so; guards 4/6 passing, flags 1/6.'),
  ('35-profile', 'Profile', ['KEEP'], False, 'Follows the preview session and labels it. Referral panel is a shape with nothing behind it (honest).'),
  ('37-settings', 'Settings', ['KEEP'], False, 'Session panel present; “Reset preview account” is demo-only and must vanish with the rest of the preview code.'),
  ('38-help', 'Help', ['KEEP'], False, 'Pipeline diagram reads job state from the engine table; updated for the door and Arena Vision.'),
  ('39-locked', '#/locked while OPEN (“You are in.”)', ['KEEP'], False, 'The success state of the door. Fine.'),
 ]),
]

GATE = [
 (1,'Account creation persisted server-side','bad','<code>LocalPreviewAuthSource</code> — a localStorage record (<code>vixy_arena_preview:auth</code>). <code>HttpAuthSource.signUp</code> throws “requires POST /api/auth/signup”.'),
 (2,'Secure authentication / session handling','bad','Every <code>HttpAuthSource</code> method throws. No cookie, token or session model exists in <code>types/</code>.'),
 (3,'Password reset','bad','Not built. Zero matches for <em>forgot</em> / <em>reset password</em> in components, services, hooks or types — no UI, no endpoint, no contract.'),
 (4,'Stripe payment confirmation / webhook','wait','Deferred by you until the app is complete. The client has the slot: <code>PAYMENT_LINK_URL</code> validated against buy.stripe.com / checkout.stripe.com, buttons inert while empty, no price written anywhere.'),
 (5,'Entitlement stored server-side','bad','<code>HttpBillingSource.load</code> throws. <code>UnconfiguredBillingSource</code> returns NOT_CONFIGURED — and App.tsx treats NOT_CONFIGURED and UNAVAILABLE as <em>entitled</em>.'),
 (6,'Discord membership / role verification','bad','<code>discordVerified: false</code> is hard-coded; <code>markDiscordJoined</code> records the reader’s word. No OAuth, no guild lookup.'),
 (7,'Terminal access determined server-side','warn','The client renders <code>access.stage</code> and never computes it — good. But it <strong>fails open</strong>: an unconfigured auth source reports <code>stage: OPEN</code>, and a failed <code>load()</code> becomes <code>UNAVAILABLE</code> with <code>stage: OPEN</code> (hooks/index.ts:134). In production, a blocked or failing auth request opens the terminal. The server must decide — and the client must refuse to render the terminal when it cannot verify.'),
 (8,'Logout / session expiration','warn','Sign-out works against the preview record. No expiry anywhere: zero matches for <em>expir</em> / <em>ttl</em> in services, hooks or types.'),
 (9,'Protected API routes','bad','No API exists. <code>LiveEngineDataSource</code>, <code>HttpAuthSource</code>, <code>HttpBillingSource</code>, <code>HttpAccountSource</code> are named stubs that throw.'),
 (10,'No client-side unlock that can be manipulated','warn','<code>previewUnlock</code> is gated by <code>DEMO_MODE</code> and the invariant suite asserts a preview source only resolves in DEMO (2596/2596 green). Two problems verified on a <code>DEMO_MODE=false</code> bundle: (a) the flag is a runtime constant, not a build define, so the minified production bundle still ships “Simulate a confirmed payment” ×2, the preview localStorage key, <code>DemoDataSource</code>, <code>simulatedPaid</code> ×7 and “Reset preview account”; (b) the build renders a <strong>blank black page</strong> on every route — <code>LiveEngineDataSource.subscribe</code> throws inside an effect and there is no error boundary. The production switch has never been exercised.'),
]

FOUND = [
 ('DEMO_MODE=false renders nothing', 'Flipping the one switch the architecture is built around produces an empty black page at #/landing, #/auth, #/markets, #/access and #/locked (1440×900). The throw from <code>LiveEngineDataSource.subscribe</code> escapes a <code>useEffect</code> with no boundary. The “Data source unavailable” state that exists in <code>App.tsx</code> is never reached.', 'prod-blank'),
 ('Fail-open access gate', 'Three separate paths open the terminal without a server saying yes: <code>UnconfiguredAuthSource → OPEN</code>, auth <code>load()</code> failure → <code>UNAVAILABLE + OPEN</code>, billing <code>NOT_CONFIGURED | UNAVAILABLE → entitled</code>. Correct instinct (“never refuse on a check we couldn’t make”) applied to the wrong layer — the <em>server</em> must refuse to serve the snapshot, and the client must show “can’t verify your access right now”, not the board.', None),
 ('Preview code survives production bundling', 'Because <code>DEMO_MODE</code> is <code>export const DEMO_MODE = true</code> in a module, esbuild/Vite cannot dead-code-eliminate the branches that import <code>DemoDataSource</code> and <code>LocalPreviewAuthSource</code>. Make it a build-time define (<code>import.meta.env.VITE_DEMO_MODE</code>) and add a post-build check that fails if any preview string is present in <code>dist/</code>.', None),
 ('tsc --noEmit is not clean', '<code>services/mock/seed.ts:70</code> — <code>CATEGORY_LABEL: Record&lt;MarketCategory, string&gt;</code> is missing FINANCE, ENTERTAINMENT, SCIENCE, TECHNOLOGY and two more (dead export; delete it). <code>services/mock/demoProvider.ts:423</code> — a synthesized SignalEvent has <code>origin: string</code>, not <code>DataOrigin</code>. Both are independent of React types. (React typings could not be installed in this sandbox, so the React-side of tsc was not re-verified here — run it in the finishing pass.)', None),
 ('Two health truths on Live', '“1 source degraded” banner vs “DEGRADED FEEDS 0 · all sources fresh” tiles on the same screen. One health envelope, read everywhere.', None),
 ('False LIVE on Telemetry', 'Simulated Kalshi/Polymarket ingest rendered with the status word LIVE, success rates and event rates. Demo source status must say SIMULATED.', None),
 ('React from a third-party CDN', '<code>index.html</code> carries an import map that loads React from <code>aistudiocdn.com</code>. Fine inside AI Studio; a production deploy must bundle React (<code>vite build</code>) and drop the import map.', None),
 ('Mobile home stack', 'At 390×844 the first market card on All Markets is below the fold. Screenshot 10-markets (mobile).', None),
]

PROMPT = r'''VIXY ARENA — FINAL FREEZE + PRODUCTION VERIFICATION. Read this whole prompt before touching a file.

THE RULE
The design is frozen as of the build in Desktop/VIXY ARENA/app (2026-09-05). Do not add screens, features, tabs, widgets or redesigns. Do not change any screen the audit marked WOW (Landing, Arena, Portfolio, VIXY Brain). Your job is to make the door real, make the production build real, and PROVE both. If you find yourself improving a layout, stop.

WHAT “PRODUCTION-READY” MEANS — do not declare it until every line is real and has a verification artifact:
 1. Account creation persisted server-side.
 2. Secure authentication and session handling (httpOnly, secure, sameSite cookie or equivalent; password hashing server-side with argon2id or bcrypt; rate-limited sign-in).
 3. Password reset (request → emailed single-use token with expiry → set new password). UI + endpoint + contract in types/.
 4. Stripe: leave the webhook for me to plug in. Write the handler skeleton (signature verification stub, idempotent event table, one function `grantEntitlement(userId, stripeCustomerId, subscriptionId, currentPeriodEnd)`) and the entitlement table so plugging in is one function. A Payment Link starts a payment; it is NOT entitlement. Entitlement is written by the backend when the verified Stripe event arrives and read back by BillingSource.load().
 5. Entitlement stored server-side and read via GET /api/billing/entitlement.
 6. Discord OAuth on the server: verify guild membership (and role if I give you one). `discordVerified` comes ONLY from that verification. The client’s “I’ve joined” button just re-checks.
 7. Terminal access decided server-side: GET /api/auth/session returns { session, access: { stage, paid, discordJoined, discordVerified } }. The server computes stage. The client renders it and never computes it (already true — keep it true).
 8. Logout (server invalidates the session) and session expiry (idle + absolute) with a client that re-checks and drops to the door.
 9. Every API route protected: auth required on everything except signup/signin/reset/session; the terminal snapshot, SSE stream, scan and calls endpoints refuse (401/403) any session whose stage is not OPEN. Verify with request logs.
10. No client-side unlock. previewUnlock, LocalPreviewAuthSource, PreviewAccountSource, DemoDataSource and every DEMO string must be absent from the production bundle.

FAIL CLOSED — this is a change in behaviour, make it deliberately:
 - Today UnconfiguredAuthSource reports stage OPEN, a failed auth load() becomes UNAVAILABLE + OPEN (hooks/index.ts:134), and billing NOT_CONFIGURED/UNAVAILABLE counts as entitled. In production every one of those must NOT render the board. Render a “Can’t verify your access right now” state with a retry — never the terminal, never a fake lock that pretends a decision was made.
 - The server is the layer that refuses; the client just doesn’t draw what it wasn’t given.

MAKE THE PRODUCTION BUILD EXIST — verified today, DEMO_MODE=false renders a blank black page on every route:
 - Turn DEMO_MODE, AUTH_BASE_URL, BILLING_BASE_URL, ACCOUNT_BASE_URL, ENGINE_BASE_URL, PAYMENT_LINK_URL, DISCORD_INVITE_URL into build-time env (import.meta.env.VITE_*). No secrets in the client, ever.
 - Add a top-level error boundary that renders the existing “Data source unavailable” state instead of a black screen. An exception in a data source must never blank the app.
 - LiveEngineDataSource.subscribe must not throw from an effect; unreachable engine → status OFFLINE/UNKNOWN in the health envelope, shown honestly.
 - Bundle React (vite build) and remove the aistudiocdn import map from the production index.html.
 - Add `npm run verify:prod`: builds with DEMO_MODE=false, then FAILS if dist/ contains any of: "Simulate a confirmed payment", "PREVIEW ACCOUNT", "vixy_arena_preview", "DemoDataSource", "demo-sim", "simulatedPaid", "Reset preview account", "SIMULATED READ" (the last one only once the real Vision reader exists — until then it must remain and be exempt).

FIX THESE BUGS (no redesign):
 - tsc --noEmit must be clean: services/mock/seed.ts:70 (delete the dead CATEGORY_LABEL export or complete the Record), services/mock/demoProvider.ts:423 (origin must be DataOrigin).
 - One health envelope: the Live screen shows “DEGRADED FEEDS 0 · all sources fresh” under a “1 source degraded” banner. Every surface reads the same server-computed health.
 - Telemetry: in DEMO builds a simulated source must read SIMULATED, never LIVE. In production the status is the server’s.
 - Landing hero: the tracked/matched/calibration stat row must carry the same origin badge as the market wall, and in production the calibration figure is hidden until the engine reports a settled sample ≥ the threshold you define in the engine, not the client.
 - Mobile All Markets (390×844): collapse the stack above the board (degraded banner, “New here?”, Daily Slate strip, filter block) to one strip so the first market card is visible without scrolling. Copy and stacking only.
 - Locked screen on mobile: “MARKET PRICES UNLOCK WITH THE TERMINAL” wraps to three lines in the header; shorten it.

ARENA VISION (the signature feature):
 - Replace the demo reader with the real pipeline behind POST /api/scan: image → market identification → live market fetch → engine read → verdict with provenance. Until that endpoint is real, the SIMULATED READ label stays on the result card. Never remove the label before the reader is real. Never fabricate a read.

PROOF — attach for every item; a claim without an artifact does not count:
 - Screenshots at 390×844 and 1440×900 of: fresh door, locked (unlock stage), locked (discord stage), access, board, and the “can’t verify” state with the auth API down — from the DEMO_MODE=false build.
 - Repeat the leak check on both locked stages at 1440 and 1720 wide: the only percentage allowed is the engine’s own calibration, and only if the badge says LIVE.
 - `npm run check` (invariant suite) green, `tsc --noEmit` clean, `npm run verify:prod` green — paste outputs.
 - Request logs showing 401/403 on /api/snapshot, /api/scan, /api/calls for: no session; session at stage UNLOCK; session at stage JOIN_DISCORD. And 200 for stage OPEN.
 - Log lines showing session expiry dropping a client to the door.
 - The Stripe handler skeleton and entitlement table, with the single plug-in function named.

DO NOT: deploy; touch VIXY VAULT production or share any of its credentials, Firebase projects or Stripe accounts; invent secrets; add a screen; remove a DEMO/SIMULATED label to make something look finished; describe anything as LIVE that a server did not report as LIVE. Save to AI Studio (Save, never Publish) only after the artifacts above exist.
'''

def badge(codes):
    return ''.join(f'<span class="v v-{V[c][2]}">{V[c][0]} {html.escape(V[c][1])}</span>' for c in codes)

def page_block(k, title, codes, broken, note):
    d = IMG.get(k + '-desktop'); m = IMG.get(k + '-mobile')
    b = '<span class="v v-bad">🚨 BROKEN / FAKE / PLACEHOLDER behind it</span>' if broken else ''
    return f'''
<article class="page" id="p-{k}">
  <div class="shots">
    <img class="desk" src="{d}" alt="{html.escape(title)} at 1440 wide" loading="lazy">
    <img class="mob" src="{m}" alt="{html.escape(title)} at 390 wide" loading="lazy">
  </div>
  <div class="verdict">
    <h3>{html.escape(title)}</h3>
    <div class="vs">{badge(codes)}{b}</div>
    <p>{note}</p>
  </div>
</article>'''

counts = {'wow':0,'keep':0,'sig':0,'reb':0,'bad':0}
for _, ps in PAGES:
    for k,t,c,b,n in ps:
        for cc in c: counts[V[cc][2]] += 1
        if b: counts['bad'] += 1
gate_bad = sum(1 for g in GATE if g[2]=='bad'); gate_warn = sum(1 for g in GATE if g[2]=='warn'); gate_wait = sum(1 for g in GATE if g[2]=='wait')

STATUS = {'bad':('🚨','Not real'), 'warn':('🟡','Half real'), 'wait':('⏳','Deferred by you'), 'ok':('✅','Real')}

out = []
out.append('''<title>Arena Production Gate</title>
<meta name="description" content="VIXY ARENA production verification — page-by-page verdicts, the ten-item gate, and the one finishing prompt.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500;600&display=swap">
<style>
:root{
  --bg:#f5f4fa; --bg2:#ffffff; --ink:#15132a; --ink2:#524f6b; --ink3:#8a87a3; --line:#dcd9ea;
  --acc:#6a3fe0; --acc-ink:#ffffff; --cyan:#0d8fa3;
  --good:#1a8f5b; --warn:#b8791a; --bad:#c9364a; --wait:#5d6b8a;
  --wow:#6a3fe0; --keep:#1a8f5b; --sig:#0d8fa3; --reb:#b8791a;
  --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
  --bg:#07080f; --bg2:#0f1020; --ink:#ecebf7; --ink2:#a8a5c4; --ink3:#6f6c8c; --line:#232440;
  --acc:#9a6cff; --acc-ink:#0a0714; --cyan:#37e4f5;
  --good:#3ad38f; --warn:#f0b24a; --bad:#ff5c72; --wait:#8d9bc0;
  --wow:#a985ff; --keep:#3ad38f; --sig:#37e4f5; --reb:#f0b24a;
}}
:root[data-theme="dark"]{
  --bg:#07080f; --bg2:#0f1020; --ink:#ecebf7; --ink2:#a8a5c4; --ink3:#6f6c8c; --line:#232440;
  --acc:#9a6cff; --acc-ink:#0a0714; --cyan:#37e4f5;
  --good:#3ad38f; --warn:#f0b24a; --bad:#ff5c72; --wait:#8d9bc0;
  --wow:#a985ff; --keep:#3ad38f; --sig:#37e4f5; --reb:#f0b24a;
}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:15px;line-height:1.55;margin:0}
a{color:var(--acc)}
code{font-family:var(--mono);font-size:.86em;background:color-mix(in srgb,var(--ink) 7%,transparent);padding:.05em .35em;border-radius:4px}
.wrap{max-width:1180px;margin:0 auto;padding:40px 28px 96px}
.eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink3)}
h1{font-size:clamp(30px,4.2vw,46px);line-height:1.05;letter-spacing:-.02em;margin:.25em 0 .35em;text-wrap:balance;font-weight:700}
h2{font-size:24px;letter-spacing:-.01em;margin:0 0 6px;text-wrap:balance}
h3{font-size:17px;margin:0 0 6px;letter-spacing:-.005em}
.lede{font-size:17px;color:var(--ink2);max-width:66ch;margin:0}
header{display:grid;grid-template-columns:1.2fr .8fr;gap:32px;align-items:end;border-bottom:1px solid var(--line);padding-bottom:28px}
.meta{font-family:var(--mono);font-size:12px;color:var(--ink3);display:grid;gap:5px;justify-items:end;text-align:right}
.meta b{color:var(--ink2);font-weight:500}
section{padding:40px 0 8px}
.sec-head{display:flex;justify-content:space-between;align-items:baseline;gap:20px;margin-bottom:18px;flex-wrap:wrap}
.sec-head p{margin:0;color:var(--ink2);max-width:62ch}
/* summary tiles */
.tiles{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-top:24px}
.tile{border:1px solid var(--line);background:var(--bg2);padding:14px 14px 12px;border-radius:8px}
.tile .n{font-family:var(--mono);font-size:28px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums}
.tile .l{font-size:12px;color:var(--ink2);margin-top:6px}
.tile.c-wow .n{color:var(--wow)} .tile.c-keep .n{color:var(--keep)} .tile.c-sig .n{color:var(--sig)} .tile.c-reb .n{color:var(--reb)} .tile.c-bad .n{color:var(--bad)} .tile.c-gate .n{color:var(--bad)}
/* verdict pills */
.v{display:inline-flex;align-items:center;gap:6px;font-family:var(--mono);font-size:11.5px;letter-spacing:.04em;padding:4px 9px;border-radius:999px;border:1px solid;white-space:nowrap}
.v-wow{color:var(--wow);border-color:color-mix(in srgb,var(--wow) 45%,transparent)}
.v-keep{color:var(--keep);border-color:color-mix(in srgb,var(--keep) 45%,transparent)}
.v-sig{color:var(--sig);border-color:color-mix(in srgb,var(--sig) 45%,transparent)}
.v-reb{color:var(--reb);border-color:color-mix(in srgb,var(--reb) 45%,transparent)}
.v-cut{color:var(--ink3);border-color:var(--line)}
.v-bad{color:var(--bad);border-color:color-mix(in srgb,var(--bad) 45%,transparent)}
.vs{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}
/* gate table */
.gate{display:grid;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:8px;overflow:hidden}
.g{display:grid;grid-template-columns:34px 260px 1fr;gap:18px;background:var(--bg2);padding:14px 18px;align-items:start}
.g .num{font-family:var(--mono);color:var(--ink3);font-size:13px;padding-top:2px}
.g .req{font-weight:600}
.g .st{font-family:var(--mono);font-size:11.5px;letter-spacing:.04em;margin-top:6px;display:inline-block}
.g .st.bad{color:var(--bad)} .g .st.warn{color:var(--warn)} .g .st.wait{color:var(--wait)} .g .st.ok{color:var(--good)}
.g .how{color:var(--ink2);font-size:14px;margin:0}
.g.bad{box-shadow:inset 3px 0 0 var(--bad)} .g.warn{box-shadow:inset 3px 0 0 var(--warn)} .g.wait{box-shadow:inset 3px 0 0 var(--wait)}
.callout{border:1px solid color-mix(in srgb,var(--bad) 40%,var(--line));background:color-mix(in srgb,var(--bad) 7%,var(--bg2));border-radius:8px;padding:16px 18px;margin:18px 0 0;display:grid;grid-template-columns:1fr 300px;gap:18px;align-items:center}
.callout p{margin:0;color:var(--ink)}
.callout img{width:100%;border:1px solid var(--line);border-radius:4px;display:block}
.callout .cap{font-family:var(--mono);font-size:11px;color:var(--ink3);margin-top:6px}
/* pages */
.group{margin-top:26px}
.group .eyebrow{margin-bottom:10px}
.page{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:22px;padding:22px 0;border-top:1px solid var(--line);align-items:start}
.shots{display:grid;grid-template-columns:1fr 132px;gap:10px;align-items:start}
.shots img{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:6px;background:#04050b}
.verdict p{margin:0;color:var(--ink2);font-size:14.5px}
/* found */
.found{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.f{border:1px solid var(--line);background:var(--bg2);border-radius:8px;padding:16px 18px}
.f h3{font-size:15px}
.f p{margin:0;color:var(--ink2);font-size:14px}
/* prompt */
.promptbox{position:relative;border:1px solid var(--line);border-radius:8px;background:var(--bg2);overflow:hidden}
.promptbox .bar{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--line);font-family:var(--mono);font-size:11.5px;color:var(--ink3);letter-spacing:.06em}
.promptbox button{font:inherit;font-family:var(--mono);background:var(--acc);color:var(--acc-ink);border:0;border-radius:6px;padding:6px 12px;cursor:pointer;letter-spacing:.04em}
.promptbox button:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}
pre{margin:0;padding:20px 22px;white-space:pre-wrap;font-family:var(--mono);font-size:12.6px;line-height:1.6;color:var(--ink);max-height:none;overflow-x:auto}
.method{color:var(--ink2);font-size:14px;max-width:72ch}
.method code{font-size:.85em}
@media (max-width:900px){
  header{grid-template-columns:1fr}.meta{justify-items:start;text-align:left}
  .tiles{grid-template-columns:repeat(3,1fr)}
  .g{grid-template-columns:28px 1fr}.g .how{grid-column:2}
  .page{grid-template-columns:1fr}
  .found{grid-template-columns:1fr}
  .callout{grid-template-columns:1fr}
}
@media (max-width:560px){.tiles{grid-template-columns:repeat(2,1fr)}.shots{grid-template-columns:1fr 96px}}
</style>
<div class="wrap">
<header>
  <div>
    <div class="eyebrow">VIXY ARENA · production verification · 2026-09-05</div>
    <h1>Stop designing. Make the door real.</h1>
    <p class="lede">Every route of the current build, rebuilt from source and screenshotted at 390×844 and 1440×900 in each door state, then the ten-item production gate checked against the code and against a <code>DEMO_MODE=false</code> bundle. The design holds. The backend does not exist yet, and the production switch has never been thrown.</p>
  </div>
  <div class="meta">
    <span><b>Source</b> Desktop/VIXY ARENA/app · arena-shell-0.1.0</span>
    <span><b>Screens</b> 37 states × 2 widths = 74 shots · 0 console errors (demo)</span>
    <span><b>Invariants</b> 2596 / 2596 pass</span>
    <span><b>tsc --noEmit</b> 2 real errors (see Found)</span>
    <span><b>DEMO_MODE=false</b> blank page on every route</span>
  </div>
</header>
''')

out.append(f'''
<div class="tiles">
  <div class="tile c-wow"><div class="n">{counts['wow']}</div><div class="l">🔥🔥 WOW — don’t touch</div></div>
  <div class="tile c-keep"><div class="n">{counts['keep']}</div><div class="l">🔥 KEEP as is</div></div>
  <div class="tile c-sig"><div class="n">{counts['sig']}</div><div class="l">💎 Signature feature</div></div>
  <div class="tile c-reb"><div class="n">{counts['reb']}</div><div class="l">⚡ Rebuild (mobile stack only)</div></div>
  <div class="tile c-bad"><div class="n">{counts['bad']}</div><div class="l">🚨 Fake / placeholder behind the screen</div></div>
  <div class="tile c-gate"><div class="n">{gate_bad}<span style="font-size:16px;color:var(--ink3)"> / 10</span></div><div class="l">Gate items not real ({gate_warn} half-real, {gate_wait} deferred)</div></div>
</div>
''')

out.append('''
<section id="gate">
  <div class="sec-head"><h2>The production gate</h2><p>Your ten conditions, checked against the code as it exists — not against the last report. Nothing here is a design problem.</p></div>
  <div class="gate">''')
for n, req, st, how in GATE:
    ic, lab = STATUS[st]
    out.append(f'<div class="g {st}"><div class="num">{n:02d}</div><div><div class="req">{html.escape(req)}</div><span class="st {st}">{ic} {lab.upper()}</span></div><p class="how">{how}</p></div>')
out.append('</div>')
out.append(f'''
  <div class="callout">
    <p><strong>The finding that changes the plan.</strong> Setting <code>DEMO_MODE = false</code> — the single switch the whole architecture is built around — produces an empty black page on every route. <code>LiveEngineDataSource.subscribe()</code> throws inside an effect, nothing catches it, and the “Data source unavailable” state that exists in <code>App.tsx</code> is never reached. The preview code also survives in that bundle (“Simulate a confirmed payment” ×2, <code>simulatedPaid</code> ×7). Until this build renders and is clean, “unreachable when DEMO_MODE=false” is an assumption, not a fact.</p>
    <div><img src="{IMG['prod-blank']}" alt="Blank black page from the DEMO_MODE=false build"><div class="cap">#/markets · DEMO_MODE=false · 1440×900</div></div>
  </div>
</section>
''')

out.append('''
<section id="pages">
  <div class="sec-head"><h2>Every page, one verdict</h2><p>Left: 1440 wide. Right: 390 wide. Verdicts are on the screen as designed; the 🚨 pill means the thing behind the screen is a preview, a simulator or a placeholder. No screen needs a redesign.</p></div>''')
for grp, ps in PAGES:
    out.append(f'<div class="group"><div class="eyebrow">{grp}</div>')
    for k,t,c,b,n in ps: out.append(page_block(k,t,c,b,n))
    out.append('</div>')
out.append('</section>')

out.append('''
<section id="found">
  <div class="sec-head"><h2>Found during verification</h2><p>Bugs and contradictions, not opinions. Each one is in the finishing prompt below.</p></div>
  <div class="found">''')
for t, d, img in FOUND:
    out.append(f'<div class="f"><h3>{html.escape(t)}</h3><p>{d}</p></div>')
out.append('</div></section>')

out.append(f'''
<section id="prompt">
  <div class="sec-head"><h2>The one finishing prompt</h2><p>Paste this into Claude Code as-is. It freezes the design, names every gap above, and refuses “done” without artifacts.</p></div>
  <div class="promptbox">
    <div class="bar"><span>CLAUDE CODE · FINAL PROMPT · {len(PROMPT.split())} words</span><button id="copy" type="button">Copy prompt</button></div>
    <pre id="ptext">{html.escape(PROMPT)}</pre>
  </div>
</section>

<section id="method">
  <div class="sec-head"><h2>How this was verified</h2></div>
  <p class="method">The app tree was bundled from source with esbuild (npm registry was unreachable from both machines, so Vite could not be installed; React 19.2 came from a local install). 74 screenshots were taken headlessly with reduced motion, each state seeded through the same localStorage keys the app uses (<code>vixy_arena_preview:auth</code>, <code>vixy_arena:*</code>). The production check swapped <code>DEMO_MODE</code> to <code>false</code>, rebuilt minified, string-searched the bundle, and loaded five routes. <code>tools/checks/invariants.ts</code> ran unchanged. Limitation: <code>@types/react</code> could not be installed here, so only the two React-independent <code>tsc</code> errors are reported as certain.</p>
</section>
</div>
<script>
(function(){{
  var b=document.getElementById('copy'), t=document.getElementById('ptext');
  if(!b) return;
  b.addEventListener('click',function(){{
    var txt=t.textContent;
    function done(){{ b.textContent='Copied'; setTimeout(function(){{ b.textContent='Copy prompt'; }},1800); }}
    if(navigator.clipboard&&navigator.clipboard.writeText){{ navigator.clipboard.writeText(txt).then(done,fallback); }} else fallback();
    function fallback(){{ var r=document.createRange(); r.selectNodeContents(t); var s=window.getSelection(); s.removeAllRanges(); s.addRange(r); try{{document.execCommand('copy');}}catch(e){{}} done(); }}
  }});
}})();
</script>
''')

open('/home/claude/arena/arena-production-gate.html','w').write('\n'.join(out))
open('/home/claude/arena/FINAL-PROMPT.txt','w').write(PROMPT)
print('ok', sum(len(x) for x in out)//1000, 'KB')
