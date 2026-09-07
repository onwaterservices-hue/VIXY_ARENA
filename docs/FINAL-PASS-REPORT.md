# VIXY ARENA — final productization pass

Report for the productization + WOW-feature brief. Written after verification, not before.

---

## A · What existed before this pass, and what I did about it

I audited the tree before changing anything. The source of truth was already
established and I did not create a competing one:

| Concern | Single source of truth | Status |
|---|---|---|
| All market/engine data | `services/api/ArenaDataSource.ts` | kept, extended with `scanMarket()` |
| Provider selection | `services/api/index.ts` (`DEMO_MODE`) | kept, untouched |
| Contracts | `types/index.ts` | kept, extended |
| Formatting | `lib/format.ts` | kept, extended with `money()` |
| Persisted UI state | `lib/preferences.ts` | kept, extended |
| Routes | `constants.ts` (`ROUTES`) | kept, extended |

Nothing was rewritten for the sake of rewriting. Every new capability was added
**on the existing contract** rather than beside it.

Two defects the audit surfaced and I fixed:

1. `IntelPanel` called `useArenaUI()` after an early `return`, a conditional hook
   that would have thrown "Rendered more hooks than during the previous render"
   the first time the snapshot went null.
2. The Motion switch was CSS-only — canvas render loops kept running with motion
   off. `useReducedMotion()` now ORs the OS media query with the in-product
   preference, and the loops actually stop (verified: 0 rAF callbacks in 1.5s).

---

## B · All-markets identity — VIXY ARENA is not a crypto app

`lib/categories.ts` is now the one place the interface learns the market
universe. Eleven categories: **Sports, Politics, Economics, Finance, Crypto,
Weather, Culture, Entertainment, Science, World, Other.** Crypto is one row.

Enforced structurally, not by intention:

- The pinned global ticker samples the universe (`KC/BUF, SENATE, CPI, INDEX,
  BTC, STORM`) instead of four crypto tickers.
- The landing page's category rail reads from `CATEGORIES` and shows a live
  count per category.
- Invariants assert crypto is present, is **not** first, and that sports leads.

## C · Landing page

New `components/landing/LandingScreen.tsx`, reachable at `#/landing` and shown
automatically on a first visit (`landing_seen` flag; an explicit hash always
wins, so a shared deep link is never hijacked).

- Hero statement: **See what the market thinks. See what VIXY thinks. See where
  they disagree.**
- "How it works" — the same five beats the Arena uses.
- The market universe — eleven categories with live counts.
- Live market intelligence — six cards straight from `snapshot.opportunities`,
  each carrying market / VIXY / edge, with the origin badge above them.
- The scanner pitch with its four honest steps.

## D · Comprehension layer (added after your note)

A new user now learns what the product is in three places, in the same words:

1. **Landing** — the plain-English definition of a prediction market, then the
   five beats.
2. **Arena home** — an orientation band above the broadcast: *"A prediction
   market is a market where people buy and sell the odds of a real event. VIXY
   ARENA is the analyst sitting next to that market."* Collapses to a one-line
   chip, remembered in preferences, reopenable at any time. On phones it becomes
   a snap rail so it stays one glance tall.
3. **Every other screen** — `ScreenIntro` renders the route's own purpose from
   the route table, so a screen cannot ship without one. All fifteen route
   descriptions were rewritten out of engine jargon into plain English, and an
   invariant fails the build if any of them regress.

The five beats are exported from one module so the landing and the Arena can
never drift apart.

## D2 · The event layer and UP NEXT  *(added in the second pass)*

The data model gained a concept it was missing: an **event**. A market closes;
an event *happens*. Conflating the two is why most prediction interfaces can
answer "what moved" and cannot answer "what is on tonight".

`ArenaEvent` carries a title, league, category, its own `startsAt`, a
server-computed `status` (`LIVE / CLOSING_SOON / UPCOMING / CLOSED / SETTLED`),
the venues listing it and the canonical markets written about it. The snapshot
now carries `events[]` alongside `markets[]`.

`#/upnext` renders that as a calendar: chronological, grouped by Today /
Tomorrow / weekday / date, filterable by category and horizon, with the leading
market's three numbers on every row. Twenty-nine scheduled events across twelve
categories — NFL, NBA, NHL, Premier League, NCAAF, UFC, F1, ATP, esports, FOMC,
CPI, payrolls, an earnings call, a storm advisory, a launch window, a clinical
readout, a confirmation vote, election day, an awards ceremony, two crypto
settlements and two technology events.

Fifteen new invariants enforce the honesty of a schedule: chronological order,
every named market exists, a LIVE event has already started, an UPCOMING event
has not, the schedule spans six or more categories, and it is never majority
crypto.

Two more categories were added to reach the brief's list: **TECHNOLOGY** and the
World row was reworded to cover current events. Six new markets were seeded —
NHL, F1, tennis, esports and two technology contracts — so sports breadth and
the new category are real rather than nominal.

The landing page's single grid became a **live market wall** with four rails —
*Live now · Up next · Biggest edges · Closing soon* — each reading the same
snapshot, each showing venue and close time on the card. Membership of a rail is
decided by engine-issued fields, never by the client's own idea of what is live.

The scanner is now branded **ARENA VISION** throughout — command bar, landing
page and the overlay itself.

## D3 · LIVE, rebuilt as a score center

`#/live` now answers, in order, the four questions someone opening it actually
has: **what is on right now** (live event cards drawn from the event layer, each
with its leading market's three numbers), **what is moving** (the prediction
panel and the biggest edge moves), **what was just called** (Just locked, from
`CallRecord.state === 'LOCKED'`), and **what has finished** (Settled, newest
first, with the engine's own result word). Locked and settled are engine states
read off the record — the screen never infers either from a timestamp.

Fixed while building it: in a narrow panel the market row's flexible column
could shrink to zero, which wrapped the subtitle to four lines and collapsed the
title to a single character and an ellipsis. The column now has a floor and the
subtitle truncates like the title.

## D4 · Markets explorer and the detail page

The Markets screen gained a third view — **Events** — which groups markets under
the event they belong to, using the engine's event layer rather than parsing
titles, with the event's status word and league on each header. Sorting expanded
to seven keys: edge, confidence, **movement**, closing time, **liquidity**,
**volume**, dispersion. Movement is computed from the series the engine already
published; liquidity and volume are summed from the venue refs. No probability is
computed on this screen.

The market detail page's evidence section is now titled **"Why VIXY thinks
this"** and has an honest empty state: when the engine cited nothing, the page
says *Insufficient live evidence* rather than writing an explanation of its own.
The venue comparison table already carried implied price, bid/ask, spread,
liquidity and 24h volume per venue, alongside the freshness pulse and the full
model provenance block.

## D5 · The engine's own states, VIXY Brain, and the standings

**Two engine states the contract was missing.** `BrainState` was five words;
the engine actually passes through seven. **COMPARING** — the model has a read
and is weighing it against the venues and against its own history — and
**SETTLING** — an outcome resolving but not yet verified — are now first-class
states with their own stage labels, their own colour, and their own geometry on
the holographic core: converging arcs for comparing, a closing ring that stops
short of the surface for settling, because settling is not settled. An invariant
now drives the provider through a full cycle and fails if any of the seven never
reaches the screen, or if a state outside the contract ever does.

That check immediately caught a real fragility: the provider read
`BRAIN_CYCLE[brainIndex]` without wrapping, relying on the tick to keep the
index in range. One read out of range would have handed the interface
`undefined` as an engine state. It now wraps at the point of use.

**VIXY Brain** (§14) gained the three panels it was missing: an **evidence
matrix** (each track the engine is reading, with its grade — and no figure at
all for a track still scanning, because "scanning" means it does not have one),
**source health and latency** (per-source status, latency, success rate,
throughput, last event, with ingest lag and queue depths beneath), and the full
**signal stream**.

**Leaderboard** (§13) gained a **Your standing** panel — rank, accuracy, calls
scored, locks, streak, movement and form, kept visually distinct from the system
board so a reader never has to hunt for their own row — plus the origin badge on
the header. It also states what it does *not* claim: this provider reports no
ROI figure, so none is shown, because a percentage return needs a stake
denominated in money and no money is involved anywhere in the Arena.

## D6 · Profile — the page that says who you are

`#/profile`, reachable from the avatar in the command bar and from the SYSTEM
group in the rail. It is built on the same rule as billing, with a new
`AccountSource` contract (`services/account/`), and the whole design turns on
one distinction the page makes visible rather than hiding:

**ENGINE facts** — the handle on the standings board, rank, tier, accuracy,
calibration, open / locked / settled counts, streak, form, points balance and
the five most recent calls. All real values in the snapshot, shown as such.

**ACCOUNT facts** — email, join date, linked services, and the policy governing
how often a handle may be changed. No account system is connected, so these read
`--` with the reason stated, the handle field is read-only rather than pretending
a change would save, and Connect / Sign out are offered but inert rather than
hidden. `ACCOUNT_BASE_URL` is an empty string; `UnconfiguredAccountSource`
reports `NOT_CONFIGURED` and every action refuses.

The identity card puts the holographic core behind the reader's initials — the
product's signature doing the same job it does everywhere, reporting the engine's
state rather than decorating a person. Interface preferences (holograms, motion,
telemetry strip, intelligence rail) are on the page as real toggles, with a line
saying plainly that they live in this browser only and change no number you are
shown.

Settings lost its duplicate identity panel and now points at Profile: two places
showing the same handle is two places to get it wrong.

Twelve invariants cover it — no invented person, no live origin claimed, no
action offered, and handle change / connect / sign out all refused.

## D7 · Retention, done the right way — the Daily Slate

The obvious move was to copy what casinos do: *wager 500 coins*, spin a wheel.
I did not build that, and the reason is the product. Volume objectives reward
**how much someone plays** rather than **how right they are**, and they would
make the Arena read as the sportsbook the brief says it must never be.

**THE DAILY SLATE** (`#/daily`) keeps the daily-return loop and inverts the
incentive. The engine publishes a card each day — markets actually closing
soonest, deliberately spread so the card is never one sport or one asset class —
and five objectives that can only be met by analysis:

- *Work the card* — three calls from today's slate
- *Read across the board* — three different categories, because breadth is the discipline
- *Back a disagreement* — a position where VIXY differs from the crowd by two points or more
- *Follow the conviction* — a market the engine grades at 70% confidence or better
- *Mark your own work* — go back to a settled call and see whether the model was right at the rate it claimed

The streak is for turning up and calling. The score being chased is
**calibration**. There is deliberately no objective anyone can meet by staking
more, and an invariant enforces exactly that: every objective's label and detail
are matched against a word-bounded list of volume words (*wager, stake, bet,
spin, deposit, wheel*) and the suite fails if one appears.

Objective progress is computed **in the engine** from the call record, for the
same reason liveness is: deciding an objective is met is a business rule. The
screen renders a bar. Twenty-two more invariants cover the rest — the card
exists, spans four or more categories, carries no duplicates, and no objective
ever reports progress past its own target or disagrees with its own completion
flag.

A one-line **slate strip** sits on the Arena home under the orientation band —
dots for the five objectives, the streak, the reset countdown — so the loop is
present on the first screen without turning a broadcast running order into a
chore list.

## D8 · Referrals

Built on the **account** contract rather than the engine, and that placement is
the whole argument: a referral code identifies a *person* and credits them. With
no account system connected there is nobody to identify and nothing to credit,
so the panel shows the complete shape — points earned, active referrals, your
share, code creation, the three-step explanation, your referral list — with
every figure at `--`, the code field read-only, and the reason stated in the
empty state. It mints nothing that would attribute nothing.

The tier share is carried in **basis points** and rendered by the same formatter
every probability uses, so a percentage can never be a number a component made
up. `createReferralCode` refuses, and an invariant checks that it does.

## D9 · The product model, corrected — ALL MARKETS is the terminal

You were right that the build read as a crypto terminal with polls attached.
Three structural changes fix that, and they are structural on purpose — the
correction cannot be undone by someone reordering a constant.

**ALL MARKETS is the terminal's home.** `DEFAULT_ROUTE` is now `markets`, and
its default view is the **universe view**: every sector on one board, each with
its own accent and its top three by disagreement. An invariant asserts the
terminal opens on the whole universe and that no sector is ever the default.

**Sector order on the master board is computed, not written.** The board is
ordered by breadth — whichever sector the engine actually carries most of leads
it. On the current snapshot that is Sports (11), then Macro (5), News & Events
(5), and Crypto (4) fourth. Crypto cannot lead the board unless crypto is
genuinely the biggest thing on it.

**Every category belongs to exactly one sector, and every sector has a
destination.** Eight sectors — Crypto, Sports, Politics, Weather, Macro,
Entertainment, News & Events, Other — served by ONE hub screen driven by the
sector table. Building seven bespoke screens would have guaranteed seven
versions of the truth; a new sector is now a row in a table. Invariants fail the
build if a category has no sector, has two, or if a sector loses its route.

Routing became parameterised (`sector/sports` is a real destination), and the
nav rail gained a **UNIVERSE** group.

## D10 · Watchlist, Alerts, the locked terminal, cross-market

**Watchlist** — a personal board from the one thing the client legitimately
owns: which markets this reader starred. When a starred market leaves the
canonical set the row says so and offers to remove it, rather than showing the
last number it remembers.

**Alerts** — intelligence notifications, not an inbox. Every row is a
`SignalEvent` the engine published, grouped by recency and filterable by market
moves / calls / system / on-my-board. The client groups and filters; it never
raises an alert of its own and never decides a move is significant.

**The locked terminal** (`#/locked`) — the premium unpaid state, built on one
rule: *a locked product may show what it COVERS, never what it CONCLUDED about a
market.* Sector coverage, market counts, engine state and calibration are
visible — facts about the terminal and how well it has scored. Every market
probability, edge and confidence figure is withheld entirely rather than
blurred, because a number behind frosted glass is still a number. The gate
engages **only** on a server-issued entitlement: `NOT_CONFIGURED` and
`UNAVAILABLE` both leave the terminal open, because refusing someone on an
entitlement we could not check is the interface deciding a business rule with a
bill attached. When it does engage, the command bar stops showing market chips —
a locked terminal must not leak prices through its own chrome — and Access, Help,
Settings and Profile stay reachable so nobody trying to pay gets trapped.

**Cross-market intelligence** (`#/cross`) — the thing a single-market terminal
cannot do. Every relationship is an edge the engine published on its own graph,
with its own kind and strength; the screen groups them, flags the ones that span
two different sectors, and puts both markets' numbers side by side. It detects
nothing itself: a correlation invented by an interface would be the most
confident-sounding lie in the product.

**VIXY Brain** gained a **coverage by sector** panel — the one panel that
settles what this product is, answered with the engine's own counts — and a
**top signals** list ranked across every category rather than within one.

## D11 · The five-second test, the payment-link slot, and an honest Arena Vision

**The hero was rewritten for a stranger.** Eyebrow: *The intelligence terminal
for prediction markets.* Statement: *One terminal. Every prediction market.
Sports, politics, weather, crypto, macro, entertainment, world events — and an
AI that tells you where the crowd has it wrong.* Then four verbs a stranger can
check by clicking — **Watches** every market on Kalshi and Polymarket ·
**Models** its own probability with the evidence behind it · **Shows the gap**
between market and VIXY · **Reads screenshots** — and two buttons. The wordmark
subtitle everywhere is now *prediction market intelligence*. The glowing core,
the buttons and the materials are untouched; only the words changed.

**Stripe Payment Links have a slot.** `PAYMENT_LINK_URL` in
`services/billing/index.ts` is an empty string. Paste a `buy.stripe.com` URL
there and the Unlock buttons on the locked terminal and the Access screen open
it. Two things the slot is deliberately *not*: it is not entitlement (paying on
Stripe does not open the terminal — the backend must confirm the purchase and
report it through `BillingSource`), and it is not a price (no amount is written
anywhere in the client). Invariants assert the slot is empty in this build, that
a configured value would have to be a Stripe checkout URL, and that no price
ever rides in it.

**Arena Vision now puts the screenshot and the live engine side by side** —
*SCREENSHOT SAYS 52.5% · printed on the image, not live* against *LIVE ENGINE
SAYS 50.8% · market now, VIXY 52.3%* — with the delta between them in the
middle. The distinction the brief demanded is now the centrepiece of the result.

And one honesty gap closed while doing it: the demo provider cannot read pixels,
so its "extraction" is a repeatable reading derived from the file — which meant
the panel could say POLYMARKET under an image that plainly said KALSHI. The
result now carries a **DEMO DATA** badge beside its verification state, and the
extraction block is headed **Simulated read** with a warning that nothing below
was read from the image. When the real engine is wired, the same fields render
under **VIXY ENGINE** and the warning disappears on its own.

## E–F · Arena home and sports refinement

The broadcast running order is unchanged and intact: ticker → main event → VIXY
core → clock → momentum/advantage → play-by-play → active matchups → standings →
leaderboard. The orientation band sits above it as beat zero.

## G · Match Center

`components/broadcast/MatchCenterScreen.tsx` at `#/match`, in the primary nav.

## H–L · SCAN ANY MARKET

`scanMarket(input, onProgress)` lives on **`ArenaDataSource`** — the same
interface every other screen reads. That is the structural guarantee behind
"another doorway into the same brain": a component cannot reach a different
model because a component cannot reach anything but that object.

Ten reported stages, five honest terminal states:

| State | What the UI says |
|---|---|
| `UNREADABLE` | it could not read the image |
| `NO_MARKET_DETECTED` | no market found in the image |
| `AMBIGUOUS` | several markets fit — **you** choose, with match scores and reasons |
| `UNVERIFIED` | matched, not verified against the venue |
| `VERIFIED` | matched and verified, with the match percentage shown |

Verdicts: `STRONG_EDGE / POSITIVE_EDGE / WATCH / NO_EDGE / NEGATIVE_EDGE /
INSUFFICIENT_DATA / NOT_VERIFIED`. The verdict is derived only from the canonical
market's `edgeBps`, `confidenceBps` and momentum band — never from the picture.

The screenshot panel is labelled **"This is what the screenshot said. It is not
the market's price."** Invariants assert: the same image always reads the same
way; an unmatched scan never names a market; an ambiguous scan offers candidates
rather than guessing; a verified scan offers none; a negative edge never grades
as a positive verdict.

## M · Access / billing (expanded)

`#/access`, built on a new `BillingSource` contract
(`services/billing/`). `BILLING_BASE_URL` is empty, so the provider resolves to
`UnconfiguredBillingSource` and the screen reports **NOT_CONFIGURED**.

**There is no plan, price, currency, interval or feature list anywhere in the
client.** The catalogue renders empty with an explicit explanation, entitlement
fields render `--`, and checkout/portal both refuse. `money()` formats only from
an integer minor unit plus an ISO 4217 code, returns `—` when either is missing,
and reports an unknown currency rather than guessing a symbol. Ten invariants enforce all of this.

The page now carries the full shape a billing screen needs — current
entitlement, plan catalogue, **payment method**, **invoices**, and a **manage**
bar with upgrade / change plan / cancel / portal — every one of them rendered
from the contract and every one of them empty or disabled, because the backend
reports nothing. `BillingPaymentMethod` carries a brand and last four digits
only; a full card number is never a field the client can hold. `BillingInvoice`
amounts follow the same integer-minor-unit rule as plans. Management buttons are
gated on `state.actions`, so the interface can only ever offer what the backend
says it supports.

Fixed while building it: a disabled primary button kept its full gradient, which
reads as broken rather than unavailable — on a billing screen, the difference
between "not connected" and "your payment failed". Disabled buttons now look
disabled.

## N · Responsive, motion, accessibility

- Overflow swept across all seventeen routes at 390 / 768 / 1728: **zero
  horizontal overflow**. Two real defects fixed on the way — the standings table
  now scrolls inside its own box, and the signal console folds to two lines on a
  phone instead of forcing the page sideways.
- Motion off ⇒ 0 rAF callbacks in 1.5s; canvases render one static frame.
- Focus order, skip link, palette focus trap, `aria` labels verified.
- Density, holograms and motion switches verified across seven screens.

Also fixed while verifying: the LOCKED broadcast graphic could land on top of the
tour, the scanner or the compare board. It is now suppressed while any surface is
open, dropped rather than queued, and dismissed by `Escape` like everything else.

## O · Verification actually run

| Check | Result |
|---|---|
| Bundle build | ✅ clean |
| Invariant suite | ✅ **2552 / 2552** |
| All 28 routes × 3 widths | ✅ no errors, no overflow |
| Reduced motion | ✅ 0 animation frames |
| Density / holograms / motion modes | ✅ 7 screens |
| Accessibility pass | ✅ |
| Scanner end-to-end | ✅ 10 stages, all 5 terminal states reachable |
| Compare board, broadcast mode | ✅ |
| Landing first-visit → enter → revisit | ✅ |

---

## Confirmations you asked for, explicitly

- **No production data is hardcoded into UI components.** No market probability,
  VIXY probability, confidence, edge, market name, price, ranking, telemetry
  value, engine state, lock state, subscription state, billing price, user stat,
  leaderboard value or closing time is written into a component. Every one comes
  from the snapshot, the scan result or the billing state. Unavailable values
  render `--`.
- **ARENA is positioned as ALL MARKETS.** Twelve categories; crypto is one of
  them, is never allowed to lead, and can never be a majority of the schedule.
- **Scan Market uses the real pipeline.** It is a method on `ArenaDataSource`,
  served today by the labeled demo provider and tomorrow by `POST /api/scan`
  with no component change.
- **Demo vs live is never ambiguous.** The origin badge is on the command bar,
  the landing intelligence grid and the settings screen; the demo note on the
  landing page names the simulator by label.
- **Not deployed.** Nothing was published or shipped anywhere.
- **No production credentials were read, written or modified. No fake secrets
  were introduced.** `ENGINE_BASE_URL` and `BILLING_BASE_URL` are empty strings.
- **VIXY VAULT was not touched.**
- **Virtual points only** — stated on the landing footer, the Access screen and
  the orientation band.

## What is still open

1. `LiveEngineDataSource` and `HttpBillingSource` are deliberately unimplemented.
   Wiring them is a one-line provider switch plus the endpoints named in their
   error messages.
2. `tsc --noEmit` could not run: `@types/react` is not installed and the package
   registry is blocked from this environment. The invariant suite runs under
   `tsx` and covers the logic; the type check should be run where npm is
   reachable.

## P · The door (create account → unlock → Discord → enter)

The Arena now has exactly one way in, and it is a sequence the auth
source reports rather than the screen computes:

    CREATE_ACCOUNT → UNLOCK → JOIN_DISCORD → OPEN

- `services/auth/` — `AuthSource` contract; `HttpAuthSource` (throws
  naming `GET /api/auth/session` etc. until wired); `LocalPreviewAuthSource`
  (DEMO builds only — an account stored in this browser, labeled
  PREVIEW ACCOUNT on every screen; salted SHA-256 digest, never the
  password); `UnconfiguredAuthSource` (reports NOT_CONFIGURED, leaves
  the door open). `AUTH_BASE_URL = ''`, `DISCORD_INVITE_URL = ''`,
  `hasDiscordInvite()` accepts only discord.gg / discord.com/invite.
- `components/auth/AuthScreen.tsx` — the door: create account / sign in,
  rendered without terminal chrome; `#/auth/signin` opens on Sign in.
- `components/access/AccessSteps.tsx` — the four steps, one component,
  used on the door, the lock and the Access page.
- `components/gate/TerminalLock.tsx` — rewritten around the current step:
  one button that matters (Stripe link or inert with reason; Discord
  invite or inert with reason; "I've joined" = self-report, marked
  unverified; DEMO-only "Simulate a confirmed payment" carries a
  demo-only tag). Frosted board behind it is a skeleton — bars, no
  numbers.
- `components/access/AccessScreen.tsx` — billing page rebuilt: where you
  are, Unlock, Join Discord, then billing exactly as the provider reports
  it (plans/card/invoices only when READY). No price anywhere.
- `services/account/PreviewAccountSource.ts` — Profile follows the
  preview session (handle, email, joined, Discord as reported).
- App gate: `lockedByGate = !entitled || stage !== 'OPEN'`; no session →
  the door on every terminal route; landing stays public.
- Landing: primary CTA is "Create your account" (or "Enter the Arena"
  when signed in); "Sign in" beside it.

## Q · Arena Vision as a tab

`#/vision` is a primary tab (six primaries: All, Arena, Live, Vision,
Daily, Brain). `ScanMarket` gained `embedded` mode; the page is three
steps and the scanner. Command bar's Arena Vision button goes to the tab.

## R · Less is more

Orientation band defaults collapsed; screen intro strip hidden on
phones (the screen's own heading is right below it); toasts capped at
two, 4.2s; stat tiles no longer stretch to fill beside taller panels.

Invariants: 2596/2596. Playwright: 30 routes × 2 widths, no overflow,
no console errors; door walked end to end.

## S · Overnight additions

- Portfolio rebuilt as a record card (points, accuracy gauge, streak,
  calibration, in play, slate streak, form line, rank) + "closes next
  among your calls" + in-play table. Every figure is the engine's.
- Landing: "Getting in" four-step section and "Straight answers" (six
  plain questions: not a sportsbook, where odds come from, not only
  crypto, Arena Vision, how you pay — price lives on Stripe — not advice).
- Start-here card on first entry (three real actions; dismiss once,
  `welcome_dismissed` flag).
- Settings → Session: signed in as, email, account system, access stage,
  Sign out, Reset preview account (demo only).
- Help: two new steps (Arena Vision; four steps in). Tour: Arena Vision
  step. Command palette: Arena Vision opens the tab. Shortcuts: g v, g d.
- Nav rail: Discord item renders only when `DISCORD_INVITE_URL` is set.
- index.html / metadata.json: product description for the terminal.
- Gate hardening: while locked, the intel rail, command palette,
  notification center and the ⇧B / ⇧S / ⇧C overlays do not open; the
  command bar hides the ticker. Verified at 1440 and 1720 wide: the
  only percentage on any locked screen is the engine's own calibration.
- Toasts on account creation and sign-in.

## T · Conviction callouts (and the freeze bug)

The LOCKED graphic could freeze on screen: `App` passed a fresh `onDone`
every render, the arena re-renders every second, and the callout's timers
re-armed on each one, so they never fired. Timers are now keyed on the
record id and read the callback through a ref; click or Esc dismisses
early. Verified by script: appears, clears in ~3s, never stuck.

Settings → Broadcast → Conviction callouts: on/off; "only when VIXY's
confidence is at least" ANY/60/70/80/90% (the engine's confidence grade
for that market — the client grades nothing); "at most one every"
EVERY/5/15/60 min. Defaults: on, 70%, 15 min. The toast still records
every lock. Stored under `ui_prefs`.
