# VIXY ARENA — interface + door v0.2.0

The real-time prediction command center. This repository holds the **interface** (React,
every screen) and **the door** (`server/`: accounts, sessions, entitlement, Discord
verification, protected engine routes — zero dependencies, Node 22 built-ins only).
See `docs/BACKEND-ARCHITECTURE.md`. The engine behind the door is still the labeled
simulator, hosted server-side and stamped `origin: 'DEMO'`.

**Nothing in this build is market intelligence.** No venue adapter, model, or settlement
service is connected. Every probability, edge, signal, outcome and leaderboard entry is
synthetic, produced by `services/mock/demoProvider.ts`, and stamped `origin: 'DEMO'`.
The interface reads that stamp and labels itself with a persistent DEMO DATA badge.

---

## Run it

**The real door, locally (no install — Node ≥ 22.18)**

```bash
npm run build            # or the esbuild line below → dist/
npm start                # node server/index.ts → http://127.0.0.1:8787 (serves dist/ + /api)
npm run test:server      # node:test — the door end to end (11 suites)
npm run e2e              # Playwright walk of the production bundle through every stage
node server/cli.ts grant you@example.com 30   # audited operator grant, before Stripe is wired
```

Production: copy `server/.env.example` → `server/.env`, set `SESSION_SECRET`, Discord and
Stripe values, `NODE_ENV=production`. The server refuses to start in production without a
session secret. `npm run gate` is the deploy gate (typecheck → invariants → server tests →
build → verify:prod).

**Google AI Studio** — open the project; `index.html` loads `index.tsx` through the
import map. No install step.

**Locally with Vite**

```bash
npm install
npm run dev
```

**Check the invariants**

```bash
npm run check     # tsx tools/checks/invariants.ts
```

694 assertions over the snapshot contract: integer basis points, `edge = vixy − market`,
provenance present, ranking complete and ordered, settled calls carry results, no venue
adapter or payment flag enabled while the origin is DEMO. Point it at the live snapshot the
day the engine ships.

**Static bundle (no Vite)**

```bash
npx esbuild index.tsx --bundle --format=esm --jsx=automatic --outfile=build/bundle.js
# then serve the folder and open verify.html
```

---

## Architecture

```
index.html            import map + stylesheet links + #root
index.tsx             entry
App.tsx               persistent shell, hash router, screen switch
constants.ts          route table, pinned symbols, product strings

types/                canonical contracts — integer basis points, health envelope,
                      market/prediction/brain state unions

services/
  api/ArenaDataSource.ts   THE data contract every screen reads through
  api/index.ts             one switch: DEMO_MODE decides the provider
  mock/demoProvider.ts     labeled simulator — visual development only
  mock/seed.ts             fictional market shells

hooks/                useArena, useRoute, useMedia, useClock, useCanvasScene, useSheen
lib/format.ts         presentation-only formatting (pure functions of server values)

styles/
  tokens.css          colour, space, radius, type, motion, elevation — single source
  base.css            reset, type roles, scroll, focus
  materials.css       glass 01/02/03, brackets, scan sweep, pills, buttons, meters
  layout.css          shell grid: command bar, rail, workspace, intel rail, telemetry
  components.css      every component surface

components/
  navigation/   NavRail, MobileNav, MoreSheet, CommandBar, TelemetryBar, Wordmark
  holographic/  PredictionCore, Atmosphere, HoloPanel, Gauge, Sparkline, Meters
  arena/        ArenaHome, LiveScreen, LivePrediction, IntelPanel
  markets/      MarketCard, MarketsScreen
  signals/      SignalStream, SignalsScreen
  neural/       NeuralMap, NeuralScreen
  leaderboard/  Leaderboard, LeaderboardScreen
  portfolio/    PortfolioScreen
  history/      HistoryScreen
  brain/        BrainScreen
  telemetry/    TelemetryScreen
  admin/        AdminScreen
  settings/     SettingsScreen, HelpScreen
  common/       Icon, Primitives (status, chips, tiles, brackets)
```

### The rules this shell already obeys

Taken from `docs/architecture/VIXY-ARENA-ARCHITECTURE-V1`:

1. **No business rule lives in the UI.** Components receive data through props and
   render it. Edge, ranking, settlement, points and liveness are engine concerns.
2. **The client never computes liveness.** `status` arrives inside the health envelope
   and is rendered verbatim. If a value's origin is unknown, the UI says UNKNOWN.
3. **Probabilities are integer basis points.** No floats anywhere near probability.
4. **Every probability carries provenance** — model version, feature set version, inputs.
   A value without provenance is not displayed as a model output.
5. **Origin is always labeled.** While `DEMO_MODE` is true the badge cannot be removed.
6. **No production credentials, no venue calls, no payments, no Discord.** Out of scope.

### Connecting the real engine

`services/api/index.ts`:

```ts
export const DEMO_MODE = false;
export const ENGINE_BASE_URL = 'https://…';
```

Then implement `LiveEngineDataSource.load()` (GET the snapshot) and `.subscribe()`
(SSE stream). No component changes — the contract in `types/` is the seam.

---

## What is in the shell

**Screens** — Arena, Match Center, Live, Markets, Signals, Portfolio, History, Leaderboard,
VIXY Brain, Neural Map, Telemetry, Admin, Settings, Help.

**Broadcast layer** — the Arena reads as a live event rather than a dashboard: a main-event
header with two sides and a VS mark, a persistent scoreboard, a game clock with five named
phases, a possession-style momentum meter, a play-by-play timeline, an official-call lock
graphic, and season standings with a form line. Every band, phase, side and grade on these
surfaces is a server field (`AdvantageBand`, `EventPhase`, `Momentum`, `EvidenceState`,
`FormResult`); the interface renders the word the engine chose and never grades a number
itself. Anything not yet reported renders as `--`.

**Depth layer**
- **Market detail** — full-height sheet: edge ladder, dual-series probability chart, gauges,
  venue comparison (implied / bid / ask / spread / liquidity / 24h), the evidence the engine
  cited, structured resolution criteria, provenance, correlated cluster, recent engine activity.
- **Call ticket** — direction, stake, submission through the data source. The entry price shown
  afterwards is the one the *server* wrote, and any difference from the price on screen is
  displayed rather than hidden.
- **Receipt** — a 1080×1920 canvas record of a call ("CALL IT. PROVE IT."), exportable as PNG,
  stamped DEMO DATA for as long as the provider is the simulator.
- **Compare board** — two to four canonical markets on one frame, sharing a single vertical
  scale and a single set of metric rows, so adjacent series and edges are read against each
  other rather than each against its own axis. Opened from Markets, from the command palette,
  or with `⇧C` on the three highest-ranked opportunities.
- **Broadcast mode** (`⇧B`) — a full-bleed, camera-ready view of one market in 16:9 or 9:16,
  auto-rotating through the ranked opportunities and keeping the DEMO stamp, because a clip is
  the easiest place for a synthetic value to escape as if it were real.

**Shell**
- **Command palette** (⌘K) over markets, screens and actions.
- **Keyboard**: `?` shortcuts, `g` then `a l m s p b n t h` to jump, `Esc` closes the top overlay.
- **Notifications** — notable engine events, opening straight into the market they concern.
- **Boot sequence** — states what actually happened at startup (contracts, tokens, resolved
  provider, guards), skipped entirely under reduced motion.
- **Preferences** — density, motion, holograms, telemetry strip, intelligence rail; persisted
  under the single permitted `ui_prefs` key.
- **Mobile** is a re-composition, not a narrowing: a dock of five primary destinations plus a
  sheet for the rest, headers that split into two bands, tables that drop the columns a phone
  cannot carry, and horizontal scrollers that fade their trailing edge so a half-visible chip
  reads as "scroll" instead of as a clipped layout.

---

## Documents

- `docs/ENGINE-INTEGRATION.md` — the whole integration surface: three endpoints, the field
  rules the UI already assumes, and what must never move into the client.
- `docs/DESIGN.md` — the design system: colour as information, materials, motion budget,
  and the rules for data-bearing shapes.

---

## Design system

- **Foundation** near-black deep space; violet / ultraviolet / electric blue / cyan
  used as *information*, never as wallpaper.
- **Glass 01 / 02 / 03** — quiet surface, standard panel, active holographic panel.
  Nothing improvises its own background.
- **Motion is reserved** for probability movement, selection, state change, stream
  entry, settlement and loading. `prefers-reduced-motion` disables all of it, and the
  canvas scenes render a single static frame instead.
- **Sharp geometry for data.** Sparklines are polylines, never smoothed curves.
- **Accessibility** — keyboard-reachable controls, visible focus rings from tokens,
  ARIA labels on every gauge and ladder, live region on the signal stream.

### Performance

The holographic layer is 2D canvas, not WebGL. Every scene caps device pixel ratio at
2, precomputes geometry once, and pauses when the element leaves the viewport or the
tab is hidden.
