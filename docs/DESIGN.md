# VIXY ARENA — design system

Locked tokens first, components second, screens third. Nothing improvises.

## Foundation

Near-black deep space (`--vx-void #04050b`) with three volumetric sources — ultraviolet
top-left, electric blue top-right, a cold cyan floor — and a vignette. The atmosphere is one
fixed canvas for the whole app; it never scrolls and never repaints on scroll.

## Colour is information

| Token | Meaning |
|---|---|
| `--vx-violet` / `--vx-violet-hi` | VIXY itself: the model, its probability, its state |
| `--vx-cyan` | Telemetry, freshness, momentum |
| `--vx-blue` | Liquidity and venue structure |
| `--vx-edge` | Positive edge, confirmed, settled correct |
| `--vx-risk` | Negative edge, offline, settled wrong |
| `--vx-warn` | Degraded, paused, caution |
| `--vx-neutral` | Wait, unknown, idle |

Purple is never wallpaper. If a surface glows, something is happening on it.

## Materials

- **Glass 01** — quiet surface: rows, chips, inputs.
- **Glass 02** — the standard panel.
- **Glass 03** — active or holographic panel; used sparingly, and always because the panel is
  doing something.

Every panel carries hairline corner brackets. Blur is controlled (10 / 16 / 22px) so the UI
stays sharp — the interface is a terminal, not frosted glass.

## Type

System display stack (SF Pro on the target machines) for everything a person reads;
monospace with tabular figures for every number, label and piece of metadata. Uppercase is
reserved for technical labels — never for prose. Five roles only: hero, h1, h2/h3, body,
micro/nano.

## Geometry

Radii are small and varied (2 / 4 / 8 / 14 / 20). Cards are not all the same shape: rank
cards, market cards, telemetry rows and the detail sheet each have their own silhouette, so
the interface reads as engineered rather than templated.

## Motion

Reserved for six things: probability movement, selection, state change, stream entry,
settlement reveal, and loading. Everything else is static. `prefers-reduced-motion` disables
all of it, and every canvas scene renders one static frame instead of animating. The
Settings panel exposes the same switch.

## Data-bearing shapes

Charts are polylines between observations. No smoothing, no interpolation the data does not
support, no glow on a line whose position means something. Gauges use a single arc and a
tick ring. Dot size on the reliability diagram encodes sample size, because a bin with four
observations should not look like a finding.

## Holographic layer

One canvas primitive family: prediction core, atmosphere, neural map. All 2D canvas, capped
at DPR 2, geometry precomputed once, paused when off-screen or when the tab is hidden. The
core's five states have distinct physics — that is how you can tell what the engine is doing
from across the room.

## Accessibility

Keyboard-complete navigation, visible focus rings drawn from tokens, ARIA labels on every
gauge, ladder and canvas, a live region on the signal stream and on toasts, and text
equivalents for every probability that is drawn rather than written.

## Comparison

Two to four canonical markets can be placed on one frame from the Markets screen, or on the
three highest-ranked opportunities with `⇧C`. Every column shares one vertical scale, so
adjacent series are read against each other rather than each against its own axis, and the
metric rows share one grid track, so a two-line label on the left never pushes a column's
values out of line with its neighbours. Below 900px the columns become labelled blocks — a
four-column table is not readable on a phone, and shrinking one is not a mobile design.

The only derived figure on the board is the spread between the widest and narrowest edge in
the selection. It is labelled a selection statistic, because it is a property of what the
user picked and not a property of any market.

## The mobile shell

Mobile is a different composition, not a narrowed one: a dock of five primary destinations
plus a sheet for the rest, section headers that split into two bands, the ladder legend and
brain hero re-proportioned to the viewport, and horizontal scrollers that fade their trailing
edge so a half-visible chip reads as "scroll", not as a clipped layout.


## What the client is not allowed to decide

Three rules that shaped specific components, recorded here because each one
was once broken and fixed:

- **Freshness is a judgement, not a threshold.** `FreshnessPulse` shows the data
  age and takes its visual state from the health envelope's `status`. It used to
  bucket the age itself, which meant the pulse could disagree with the status
  badge beside it the moment the engine's freshness budget differed from the
  numbers the component had invented.
- **The edge is a server field with an identity.** `ProbabilityChart` receives
  `edgeBps` and draws it. Subtracting the last two points of two series is not
  the same number, because the scalar and the series need not be sampled at the
  same instant.
- **The DEMO stamp is bound to the provider.** Every surface that carries it —
  including Broadcast mode, the Compare board and the CSV export, which are the
  three artefacts most likely to leave the session — reads `health.origin`
  rather than a literal, so the badge disappears the day a real engine is
  connected and never mislabels engine output as synthetic.

---

## The broadcast register

The Arena is a live event, not a dashboard. The market is the game, the two
sides are the competitors, VIXY is the analyst, a call is the play, the LOCK is
the official call and settlement is the final score. That framing is a
*register* laid over the existing system — the same tokens, the same glass, the
same spacing. Nothing was re-skinned to achieve it.

**What the register adds**

- **Main event** — a `LiveEventHeader`: two sides, a VS mark, the clock, the
  signal status, the analyst and the feed, in one card that reads identically
  wherever it appears.
- **Scoreboard** — a five-cell strip in fixed order, so the eye learns where
  each fact lives.
- **Arena clock** — a game clock over a server timestamp, with the five phases
  underneath: pre-event, calibration, confirmation, lock window, final.
- **Momentum meter** — a possession bar. The boundary between the two colours
  *is* the head, so the coloured area and the marker can never disagree, and
  particles run toward whichever side the engine says is loaded.
- **Play-by-play** — the signal stream read as a broadcast timeline: time, mark,
  what happened, how loud. Severity comes from the event *kind*, which the
  engine chose, not from the magnitude.
- **Lock callout** — a ring closes, the figures land, it clears in under three
  seconds. It states what was recorded. It does not celebrate: whether the call
  was right is settlement's business, later.
- **Standings and form** — rank, win rate, streak, locks, points, and the last
  five settled results as a form line. An empty record shows empty slots.

**What the register is not allowed to do**

Every band, phase, side and grade on these surfaces is a SERVER field:
`AdvantageBand`, `EventPhase`, `Momentum`, `EvidenceState`, `FormResult`. The
interface renders the word the engine chose. It never looks at a number and
decides that it deserves to be called "STRONG EDGE" — that is a claim about a
market, and claims belong to the engine.

A value that has not arrived renders as `--`. Never a zero, never a plausible
figure, never a word implying an opinion the engine does not hold. The
invariant suite enforces the sign agreement between the momentum bias and the
edge, and that a track still SCANNING reports no progress figure at all.

**Mobile is a score app.** The matchup leads, then the analyst, then the clock,
then the detail — the order a phone reader expects, not a shrunken broadcast.
