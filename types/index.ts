/* =============================================================
   VIXY ARENA — CANONICAL FRONTEND CONTRACTS
   -------------------------------------------------------------
   These types mirror docs/architecture/VIXY-ARENA-ARCHITECTURE-V1.
   Probabilities and edges are INTEGER BASIS POINTS (0..10000).
   No floats anywhere near probability. Liveness is a server-sent
   field — the client renders it, the client never computes it.
   ============================================================= */

/** Integer basis points. 6712 === 67.12%. */
export type Bps = number;

/** Where a value came from. The UI must never present DEMO as LIVE. */
export type DataOrigin = 'DEMO' | 'LIVE';

/** Server-computed liveness. §24 of the architecture. */
export type FeedStatus =
  | 'LIVE'
  | 'STALE'
  | 'DEGRADED'
  | 'RECONNECTING'
  | 'OFFLINE'
  | 'UNKNOWN';

export type Venue = 'KALSHI' | 'POLYMARKET';

/* The market universe. VIXY reads every category a venue lists —
   crypto is one of eleven, not the product. The order here is the
   order the interface offers them in, and SPORTS leads because the
   Arena's register is a sports broadcast. */
export type MarketCategory =
  | 'SPORTS'
  | 'POLITICS'
  | 'ECONOMICS'
  | 'FINANCE'
  | 'CRYPTO'
  | 'WEATHER'
  | 'CULTURE'
  | 'ENTERTAINMENT'
  | 'SCIENCE'
  | 'TECHNOLOGY'
  | 'WORLD'
  | 'OTHER';

/** Market lifecycle. Owned by the engine, never by the client. */
export type MarketState =
  | 'PRE_OPEN'
  | 'OPEN'
  | 'LOCKING'
  | 'LOCKED'
  | 'SETTLING'
  | 'SETTLED'
  | 'VOID';

/** VIXY analysis state, drives the holographic core. */
export type BrainState =
  /** Watching venues and event data. Nothing in flight. */
  | 'OBSERVING'
  /** Features rebuilt, the model evaluating candidates. */
  | 'ANALYZING'
  /** Weighing its own read against the venues and against itself. */
  | 'COMPARING'
  /** Second pass validating a candidate before it can be written. */
  | 'CONFIRMING'
  /** A call record has been written. Nothing can edit it. */
  | 'LOCKED'
  /** Resolving an outcome against a source of truth. */
  | 'SETTLING'
  /** Verified and recorded. */
  | 'SETTLED';

export type Direction = 'YES' | 'NO' | 'WAIT';

export type Regime = 'TRENDING' | 'RANGING' | 'VOLATILE' | 'ILLIQUID' | 'UNKNOWN';

/** Health envelope attached to every streamed payload. §3.4. */
export interface HealthEnvelope {
  /** Server clock, ISO-8601. Never the browser clock. */
  asOf: string;
  /** Age of the underlying source data, in ms, computed server-side. */
  dataAgeMs: number;
  status: FeedStatus;
  sourceHealth: Record<string, FeedStatus>;
  origin: DataOrigin;
}

export interface VenueRef {
  venue: Venue;
  venueMarketId: string;
  /** Last price the venue published, in bps of implied probability. */
  impliedBps: Bps | null;
  liquidityUsd: number | null;
  /** Best bid / best ask in bps, as the venue posts them. */
  bidBps: Bps | null;
  askBps: Bps | null;
  spreadBps: Bps | null;
  volume24hUsd: number | null;
  status: FeedStatus;
}

/** Structured resolution criteria. §6.6 — a market that cannot say how it
 *  settles is not tradeable intelligence. */
export interface ResolutionCriteria {
  statement: string;
  source: string;
  settlesAt: string;
  /** Conditions the engine will evaluate, in the engine's own words. */
  conditions: string[];
}

/* =============================================================
   BROADCAST LAYER
   -------------------------------------------------------------
   The Arena presents a market as a live event: two sides, a clock
   with phases, an advantage band and a form record. Every one of
   these is a SERVER field. The interface renders the band the
   engine chose; it never picks a band from a number itself,
   because "STRONG EDGE" is a claim about a market and claims are
   the engine's to make.
   ============================================================= */

/** How decisive the modeled edge is, as the engine graded it. */
export type AdvantageBand =
  | 'NONE'      // no edge computed yet
  | 'LEVEL'     // inside the noise band
  | 'SLIGHT'
  | 'MODERATE'
  | 'STRONG'
  | 'DOMINANT';

/** Which side of the event the advantage sits on. */
export type AdvantageSide = 'UP' | 'DOWN' | 'NEUTRAL';

/** Where an event is in its own life, in broadcast language. */
export type EventPhase =
  | 'PREGAME'      // open, nothing modeled yet
  | 'CALIBRATION'  // first phase: features building
  | 'CONFIRMATION' // second phase: candidate under validation
  | 'LOCK_WINDOW'  // final phase: a call can be written
  | 'FINAL';       // settled, the score is on the board

/** One competitor in a matchup. Labels are server-issued. */
export interface MatchupSide {
  /** Short label: an asset ticker, a team code, a venue name. */
  code: string;
  /** Full label for the side. */
  label: string;
  /** The probability this side carries, bps. Null when unknown. */
  probabilityBps: Bps | null;
  /** Feed state for this side specifically. */
  status: FeedStatus;
}

/** A market presented as a two-sided event. */
export interface Matchup {
  /** Left side: usually the asset or the subject of the question. */
  home: MatchupSide;
  /** Right side: usually the venue consensus the model is arguing with. */
  away: MatchupSide;
  /** Short duration label the venue publishes, e.g. "15M". Null if none. */
  window: string | null;
}

/** The engine's read on where pressure sits, for the momentum meter. */
export interface Momentum {
  /** -10000 (all DOWN) .. +10000 (all UP). Null before a first read. */
  biasBps: Bps | null;
  side: AdvantageSide;
  band: AdvantageBand;
  /** How fast the bias is moving, bps per interval. Null when unknown. */
  driftBps: Bps | null;
}

/** Canonical market — venue-independent. §6. */
export interface CanonicalMarket {
  id: string;
  /** Short display ticker for chips and nodes. Presentation label. */
  symbol: string;
  title: string;
  subtitle: string | null;
  category: MarketCategory;
  state: MarketState;
  /** ISO-8601, server-issued. */
  closesAt: string;
  venueRefs: VenueRef[];
  /** Cross-venue consensus, integer bps. Null when no venue is fresh. */
  marketProbabilityBps: Bps | null;
  /** VIXY's modeled probability. Null until a model version has run. */
  vixyProbabilityBps: Bps | null;
  /** vixy - market. Signed. Null if either side is null. */
  edgeBps: Bps | null;
  /** Model confidence, bps. Provenance below is mandatory. */
  confidenceBps: Bps | null;
  /** Dispersion between venues, bps. A liquidity/uncertainty signal. */
  dispersionBps: Bps | null;
  regime: Regime;
  reversalRiskBps: Bps | null;
  signalQualityBps: Bps | null;
  /** Every probability must be attributable. §10.4. */
  provenance: Provenance | null;
  resolution: ResolutionCriteria | null;
  /* ---- broadcast layer, server-owned ---- */
  /** The event as two sides. Null until the engine can name them. */
  matchup: Matchup | null;
  /** Phase of this event's own clock. */
  phase: EventPhase;
  /** How decisive the edge is and which way it points. */
  momentum: Momentum | null;
  /** Trailing market-probability series, oldest first. Presentation only. */
  series: number[];
  /** Trailing VIXY-probability series, same length and cadence as `series`. */
  vixySeries: number[];
  health: HealthEnvelope;
}

export interface Provenance {
  modelVersion: string;
  featureSetVersion: string;
  inputs: string[];
  computedAt: string;
}

/** A ranked opportunity — the product's core object. */
export interface EdgeOpportunity {
  marketId: string;
  rank: number;
  edgeScore: number;
  direction: Direction;
  edgeBps: Bps;
  confidenceBps: Bps;
  /** Human-readable evidence lines. Engine-generated, never client-written. */
  evidence: string[];
}

export type SignalKind =
  | 'SYSTEM_ANALYZING'
  | 'MARKET_SHIFT'
  | 'MOMENTUM_BUILDING'
  | 'LIQUIDITY_CHANGE'
  | 'CORRELATION_SHIFT'
  | 'SIGNAL_CONFIRMING'
  | 'SIGNAL_LOCKED'
  | 'SIGNAL_SETTLED'
  | 'SOURCE_DEGRADED';

export interface SignalEvent {
  id: string;
  ts: string;
  kind: SignalKind;
  marketId: string | null;
  subject: string;
  detail: string;
  magnitudeBps: Bps | null;
  venue: Venue | null;
  origin: DataOrigin;
}

export interface NeuralNode {
  id: string;
  symbol: string;
  label: string;
  category: MarketCategory;
  /** Layout coordinates in a unit square. Presentation only. */
  x: number;
  y: number;
  /** Relative influence 0..1 — drives node radius. */
  weight: number;
  activityBps: Bps;
  state: FeedStatus;
}

export interface NeuralEdge {
  from: string;
  to: string;
  /** Signed relationship strength, -1..1. */
  strength: number;
  kind: 'CORRELATION' | 'MOMENTUM' | 'LIQUIDITY' | 'INFLUENCE';
}

export interface NeuralGraph {
  nodes: NeuralNode[];
  edges: NeuralEdge[];
  health: HealthEnvelope;
}

export interface LeaderboardEntry {
  rank: number;
  handle: string;
  accuracyBps: Bps;
  predictions: number;
  streak: number;
  score: number;
  delta: number;
  tier: 'ORACLE' | 'ANALYST' | 'CHALLENGER' | 'ROOKIE';
  /** Recent settled results, newest first. Empty when none are recorded. */
  form: FormResult[];
  /** Locked call records in the standings window. */
  locks: number;
  /** True for the signed-in competitor, as the server identifies them. */
  isYou: boolean;
}

/** What the UI submits when a person makes a call. The engine, not the
 *  client, decides whether it is accepted and at what entry price. */
export interface CallIntent {
  marketId: string;
  direction: Direction;
  stakePoints: number;
}

export interface CallRecord {
  id: string;
  marketId: string;
  market: string;
  direction: Direction;
  entryBps: Bps;
  vixyBps: Bps;
  edgeBps: Bps;
  stakePoints: number;
  state: 'OPEN' | 'LOCKED' | 'SETTLED' | 'VOID';
  result: 'WON' | 'LOST' | 'PUSH' | null;
  settledAt: string | null;
  openedAt: string;
}

/** One settled result in a form line, newest first. */
export type FormResult = 'W' | 'L' | 'P';

export interface PortfolioSummary {
  openCalls: number;
  lockedCalls: number;
  settledCalls: number;
  accuracyBps: Bps;
  pointsBalance: number;
  streak: number;
  /** Null until something has settled. */
  calibrationBps: Bps | null;
  /** Recent settled results, newest first. Empty until anything settles. */
  form: FormResult[];
}

/** One bin of a reliability diagram: what the model said, what happened. */
export interface CalibrationBin {
  predictedBps: Bps;
  realizedBps: Bps;
  count: number;
}

/** How far along one input category is, as the engine graded it. */
export type EvidenceState = 'SCANNING' | 'BUILDING' | 'ALIGNED' | 'CONFLICTED' | 'CONFIRMED';

/** One category of input the analyst is working through. */
export interface EvidenceTrack {
  key: string;
  label: string;
  state: EvidenceState;
  /** How much of this category is in, bps. Null while scanning. */
  progressBps: Bps | null;
}

/** The model's validation/health state, computed server-side and never by the interface.
    READY only when an out-of-sample evaluation showed the model beating the venue price. */
export type ModelStatus = 'MODEL_READY' | 'MODEL_CALIBRATING' | 'MODEL_INSUFFICIENT_DATA' | 'MODEL_DEGRADED' | 'MODEL_OFFLINE';

export interface BrainTelemetry {
  state: BrainState;
  /** Absent on the simulator. The LIVE engine always reports it. */
  modelStatus?: ModelStatus;
  /** The server's one-line reason for the status, in words a reader can check. */
  modelStatusNote?: string;
  /** Which stage of DISCOVER→…→LEARN the engine is in. */
  stage: string;
  modelVersion: string;
  marketsTracked: number;
  marketsMatched: number;
  inferencesPerMin: number;
  queueDepth: number;
  /** Trailing reliability. NULL until the engine has a settled sample to measure — never 0 as a stand-in. */
  calibrationBps: Bps | null;
  calibrationBins: CalibrationBin[];
  /** The categories the analyst is reading, with the engine's own
      grading of each. Empty until the engine reports any. */
  evidence: EvidenceTrack[];
  health: HealthEnvelope;
}

export interface SourceMetric {
  key: string;
  label: string;
  status: FeedStatus;
  latencyMs: number;
  successRateBps: Bps;
  lastEventAt: string;
  throughputPerMin: number;
  /** Provenance (LIVE engine): the request behind this source and what the venue answered. Absent on the simulator. */
  endpoint?: string;
  httpStatus?: number | null;
  /** The venue's own words when something is wrong (error, partial series, back-off). */
  note?: string | null;
}

export interface SystemTelemetry {
  sources: SourceMetric[];
  ingestLagMs: number;
  matchQueue: number;
  settlementQueue: number;
  uptimeBps: Bps;
  health: HealthEnvelope;
}

export interface AdminOverview {
  environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
  buildVersion: string;
  featureFlags: { key: string; label: string; enabled: boolean; locked: boolean; note: string }[];
  guards: { key: string; label: string; status: 'PASS' | 'BLOCKED' | 'PENDING'; note: string }[];
  jobs: { key: string; label: string; state: 'RUNNING' | 'IDLE' | 'PAUSED' | 'FAILED'; lastRunAt: string; note: string }[];
  auditTrail: { ts: string; actor: string; action: string; target: string }[];
  health: HealthEnvelope;
}

/** Everything the Arena shell renders in one snapshot. */
/* =============================================================
   THE EVENT LAYER
   -------------------------------------------------------------
   A market closes; an EVENT happens. They are not the same thing
   and conflating them is why most prediction interfaces cannot
   answer "what is on tonight".

   One event carries the markets written about it — a game has a
   winner market, a spread, a total, player props — and it has a
   start time of its own, which is what makes a schedule possible.

   Every field here is server-issued. The client sorts and groups
   these; it never decides that something is live.
   ============================================================= */

export type ArenaEventStatus =
  | 'LIVE'          // under way now
  | 'CLOSING_SOON'  // markets close shortly
  | 'UPCOMING'      // scheduled, not yet under way
  | 'CLOSED'        // markets closed, awaiting resolution
  | 'SETTLED';      // resolved

export interface ArenaEvent {
  id: string;
  title: string;
  /** The competition or series this sits in: NFL, FOMC, Atlantic season. */
  league: string | null;
  category: MarketCategory;
  /** ISO-8601, server-issued. When the EVENT begins, not when a market closes. */
  startsAt: string;
  /** Server-computed. The client renders this word; it never derives it. */
  status: ArenaEventStatus;
  /** Venues listing markets on this event. */
  venues: Venue[];
  /** Canonical markets written about this event. */
  marketIds: string[];
  /** The engine's own note on why this event matters, or null. */
  note: string | null;
  health: HealthEnvelope;
}

export interface ArenaSnapshot {
  markets: CanonicalMarket[];
  /** The schedule. Chronological order is the client's business; nothing else is. */
  events: ArenaEvent[];
  /** Today's card and its objectives. Engine-computed, like everything else. */
  slate: DailySlate;
  opportunities: EdgeOpportunity[];
  signals: SignalEvent[];
  graph: NeuralGraph;
  leaderboard: LeaderboardEntry[];
  calls: CallRecord[];
  portfolio: PortfolioSummary;
  brain: BrainTelemetry;
  system: SystemTelemetry;
  admin: AdminOverview;
  health: HealthEnvelope;
}

/* =============================================================
   SCAN A MARKET
   -------------------------------------------------------------
   A screenshot is an INPUT, never a source of truth. The pipeline
   is: read the image → identify the market → match it against a
   venue → retrieve the CANONICAL market → run the same engine
   that powers every other screen → return the same fields.

   Two rules the contract enforces:

   1. If the market cannot be matched with confidence, the result
      says so. It never presents an unverified read as a verified
      one, and it never silently matches the wrong market — where
      several candidates are plausible it returns them and asks.

   2. The verdict is derived from the canonical market's own
      edge, confidence and advantage band. There is no second
      model behind this feature. The scanner is a doorway into
      the same brain, which is why it lives on ArenaDataSource
      and not in a component.
   ============================================================= */

/** What the reader is looking at, end to end. */
export type ScanStatus =
  | 'UNREADABLE'          // the image could not be read at all
  | 'NO_MARKET_DETECTED'  // read fine, but nothing market-shaped in it
  | 'AMBIGUOUS'           // several plausible markets — the user must choose
  | 'UNVERIFIED'          // a market was identified but no venue confirmed it
  | 'VERIFIED';           // matched to a canonical market and verified live

/** The stages the engine reports as it works. */
export type ScanStage =
  | 'READING_IMAGE'
  | 'IDENTIFYING_MARKET'
  | 'MATCHING_VENUE'
  | 'FETCHING_MARKET'
  | 'BUILDING_FEATURES'
  | 'RUNNING_BRAIN'
  | 'CROSS_CHECKING'
  | 'CALCULATING_EDGE'
  | 'CALIBRATING_CONFIDENCE'
  | 'FINALIZING';

export interface ScanProgress {
  stage: ScanStage;
  /** Stage index and total, so the interface can pace itself honestly. */
  index: number;
  total: number;
  /** Set when a stage ends without doing what it set out to do. */
  note: string | null;
}

/** What was read off the image. Extraction only — no judgement. */
export interface ScanExtraction {
  /** The venue the screenshot appears to come from. Null when unclear. */
  venue: Venue | null;
  /** The market question as printed in the image. */
  title: string | null;
  /** The outcome the screenshot is showing, when one is legible. */
  outcome: string | null;
  /** The probability printed on the screenshot, bps. NOT market truth. */
  printedProbabilityBps: Bps | null;
  /** A close time if the screenshot shows one. */
  closesAtText: string | null;
  category: MarketCategory | null;
  /** How legible the extraction was, bps. Low values gate matching. */
  legibilityBps: Bps;
  /** Fields the engine could see but could not parse. */
  unreadable: string[];
}

/** One possible canonical market for an extraction. */
export interface ScanCandidate {
  marketId: string;
  title: string;
  venue: Venue;
  category: MarketCategory;
  /** How well the extraction matches this market, bps. */
  matchBps: Bps;
  /** Why the engine thinks it matches, in its own words. */
  reasons: string[];
}

/** The controlled vocabulary of scan outcomes. Nothing else may appear. */
export type ScanVerdict =
  | 'STRONG_EDGE'
  | 'POSITIVE_EDGE'
  | 'WATCH'
  | 'NO_EDGE'
  | 'NEGATIVE_EDGE'
  | 'INSUFFICIENT_DATA'
  | 'NOT_VERIFIED';

/** One line of engine evidence, with the direction it points. */
export interface ScanEvidence {
  label: string;
  /** SUPPORTS the read, CAUTIONS against it, or is NEUTRAL. */
  stance: 'SUPPORTS' | 'CAUTIONS' | 'NEUTRAL';
  detail: string;
}

export interface ScanResult {
  id: string;
  status: ScanStatus;
  /** Always present: what the image gave us, whatever happened next. */
  extraction: ScanExtraction;
  /** Populated when status is AMBIGUOUS — the user picks one. */
  candidates: ScanCandidate[];
  /** The canonical market id, only when the match was confident. */
  marketId: string | null;
  /** How confident the match itself was, bps. Null when nothing matched. */
  matchBps: Bps | null;
  verdict: ScanVerdict;
  evidence: ScanEvidence[];
  /** The engine's own words for why this verdict, not the interface's. */
  rationale: string;
  /** Origin of the values behind the verdict. */
  origin: DataOrigin;
  scannedAt: string;
  /** The health of the data the verdict rests on. */
  health: HealthEnvelope;
}

/** What the client hands the engine. The image never leaves this object. */
export interface ScanInput {
  /** The raw image, as the browser read it. */
  fileName: string;
  mimeType: string;
  bytes: number;
  /** A data URL for preview and for the engine to read. */
  dataUrl: string;
  /** Optional: the user narrowed it to one candidate from a prior scan. */
  chooseMarketId?: string;
}

/* =============================================================
   BILLING
   -------------------------------------------------------------
   Access to VIXY ARENA is a backend concern. The interface is
   allowed to RENDER a plan; it is never allowed to KNOW one.

   That is why there is no plan list, no price and no currency
   anywhere in this file — only the shape a backend would fill.
   A price that lives in a component is a price that will be
   wrong the first time someone changes it in Stripe, and a plan
   invented by the UI is a promise the product never made.

   Until a billing backend is configured the provider reports
   NOT_CONFIGURED and the Access screen says exactly that.
   ============================================================= */

export type BillingStatus =
  /** No billing backend is configured in this build. */
  | 'NOT_CONFIGURED'
  /** A backend is configured and the catalogue is being fetched. */
  | 'LOADING'
  /** The catalogue resolved. */
  | 'READY'
  /** A backend is configured but did not answer. */
  | 'UNAVAILABLE';

export type BillingInterval = 'MONTH' | 'YEAR' | 'ONE_TIME';

/**
 * One purchasable plan, exactly as the backend describes it.
 *
 * `priceMinor` is an integer in the currency's minor unit (cents), because
 * money in floating point is a defect waiting for a rounding error.
 * `currency` is an ISO 4217 code. Both come from the payment provider;
 * neither is ever written into a component.
 */
export interface BillingPlan {
  id: string;
  name: string;
  /** One line from the backend. The UI does not write marketing copy for a plan it has never seen. */
  blurb: string;
  priceMinor: number;
  currency: string;
  interval: BillingInterval;
  /** Entitlements as the backend lists them. */
  features: string[];
  /** The backend decides which plan is highlighted, if any. */
  featured?: boolean;
}

/** What the signed-in reader currently has. */
export interface BillingEntitlement {
  planId: string | null;
  /** Server-computed. The client never infers access from a date. */
  active: boolean;
  renewsAt: number | null;
  cancelAtPeriodEnd: boolean;
}

/** A card or bank instrument, as the payment provider describes it. */
export interface BillingPaymentMethod {
  /** 'card', 'bank', whatever the provider calls it. */
  kind: string;
  /** Display brand, e.g. 'visa'. Never inferred from a number. */
  brand: string | null;
  /** Last four digits only. A full number is never sent to the client. */
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
}

/** One issued invoice. Amounts follow the same minor-unit rule as plans. */
export interface BillingInvoice {
  id: string;
  number: string | null;
  /** Epoch millis, provider-issued. */
  issuedAt: number;
  amountMinor: number;
  currency: string;
  /** The provider's own word: 'paid', 'open', 'void', 'uncollectible'. */
  status: string;
  /** Hosted invoice URL from the provider. Null when it does not offer one. */
  url: string | null;
}

export interface BillingState {
  status: BillingStatus;
  /** Empty unless status is READY. Never seeded with examples. */
  plans: BillingPlan[];
  entitlement: BillingEntitlement | null;
  /** Present when the provider needs to explain itself. */
  message: string | null;
  /** The instrument on file, or null. Never a placeholder card. */
  paymentMethod: BillingPaymentMethod | null;
  /** Issued invoices, newest first. Empty until a backend supplies them. */
  invoices: BillingInvoice[];
  /** Which management actions the backend actually supports. */
  actions: {
    upgrade: boolean;
    downgrade: boolean;
    cancel: boolean;
    portal: boolean;
  };
  /** Where this state came from, for the same reason every other panel says so. */
  origin: 'NONE' | 'LIVE';
}

/* =============================================================
   ACCOUNT
   -------------------------------------------------------------
   Who the reader is, as the account system describes them.

   The Arena already knows some things about a competitor from the
   engine — their handle on the board, their record, their points.
   Those are ENGINE facts and they live in the snapshot.

   An email address, a join date, a connected Discord, and the
   policy governing how often a handle may be changed are ACCOUNT
   facts. No account system is connected to this build, so the
   provider reports NOT_CONFIGURED and the profile shows `--`
   rather than inventing an identity for whoever opens it.
   ============================================================= */

export type AccountStatus = 'NOT_CONFIGURED' | 'LOADING' | 'READY' | 'UNAVAILABLE';

export interface AccountConnection {
  key: string;
  label: string;
  connected: boolean;
  /** The handle on that service, when connected. Never guessed. */
  handle: string | null;
}

/** The server's own rule for renaming. The client renders it, never enforces it. */
export interface HandleChangePolicy {
  allowed: boolean;
  /** How often a change is permitted, in days. Null when no policy is published. */
  cooldownDays: number | null;
  /** Epoch millis the next change becomes available, or null. */
  nextAllowedAt: number | null;
}

export interface AccountProfile {
  handle: string | null;
  email: string | null;
  avatarUrl: string | null;
  joinedAt: number | null;
  handleChange: HandleChangePolicy;
  connections: AccountConnection[];
}

export interface AccountState {
  status: AccountStatus;
  /** Referral standing, or null when the account system reports none. */
  referral: ReferralState | null;
  /** Null unless status is READY. Never a placeholder person. */
  profile: AccountProfile | null;
  message: string | null;
  /** Which account actions the backend actually supports. */
  actions: { changeHandle: boolean; connect: boolean; signOut: boolean };
  origin: 'NONE' | 'LIVE';
}

/* =============================================================
   THE DAILY SLATE
   -------------------------------------------------------------
   The reason to come back tomorrow.

   Most products solve this with volume: wager more, spin a wheel.
   That is the wrong incentive for an intelligence terminal — it
   rewards how much someone plays instead of how right they are,
   and it would make the Arena read as the casino it is not.

   The slate rewards ANALYSIS instead. Each day the engine
   publishes a card of markets and a set of objectives that can
   only be met by calling across categories, disagreeing with a
   crowd, or reviewing something that already settled. The streak
   is for showing up and calling; the score is calibration.

   Every field here is engine-computed. The client renders
   progress; it never decides that an objective is met, because
   deciding that is a business rule and business rules live in
   the engine.
   ============================================================= */

export type ObjectiveKind =
  /** Make N calls from today's card. */
  | 'CALL_COUNT'
  /** Call markets in N different categories. */
  | 'CATEGORY_SPREAD'
  /** Take a position where the model disagrees with the market. */
  | 'TAKE_AN_EDGE'
  /** Call a market the engine grades high-confidence. */
  | 'HIGH_CONVICTION'
  /** Look at a call that has already settled. */
  | 'REVIEW_SETTLED';

export interface SlateObjective {
  key: string;
  kind: ObjectiveKind;
  label: string;
  /** One line of plain English. Written by the engine, not the screen. */
  detail: string;
  target: number;
  /** Server-computed. The client never counts this itself. */
  progress: number;
  complete: boolean;
  /** Virtual points. Null when the engine attaches no reward. */
  rewardPoints: number | null;
}

export interface DailySlate {
  /** Calendar id of the slate, e.g. 2026-09-04. */
  id: string;
  opensAt: string;
  closesAt: string;
  /** Today's card. Canonical market ids, chosen by the engine. */
  marketIds: string[];
  objectives: SlateObjective[];
  /** Consecutive days with at least one call. Server-computed. */
  streakDays: number;
  bestStreakDays: number;
  /** How many objectives are met, and how many there are. */
  completed: number;
  total: number;
  health: HealthEnvelope;
}

/* =============================================================
   REFERRALS
   -------------------------------------------------------------
   A referral code identifies a PERSON and credits them. Both of
   those are account-system concerns, which is why this lives on
   the account contract and not the engine: with no account
   system connected, there is nobody to identify and nothing to
   credit, so the screen shows the shape and says so.
   ============================================================= */

export interface ReferralEntry {
  handle: string;
  joinedAt: number;
  /** The account system's own word: 'pending', 'active', 'lapsed'. */
  status: string;
}

export interface ReferralTier {
  label: string;
  /** Share in basis points, so no percentage is ever invented client-side. */
  shareBps: Bps;
  /** Active referrals needed for the next tier, or null at the top. */
  nextAtActive: number | null;
}

export interface ReferralState {
  /** The reader's code, or null when none has been created. */
  code: string | null;
  /** Full invite URL, issued by the backend. Never assembled by the client. */
  link: string | null;
  totalEarnedPoints: number | null;
  activeReferrals: number | null;
  tier: ReferralTier | null;
  referrals: ReferralEntry[];
  /** The published rules. Null when the backend publishes none. */
  policy: string | null;
  /** Which referral actions the backend supports. */
  actions: { createCode: boolean; share: boolean };
}

/* =============================================================
   AUTH — the door
   -------------------------------------------------------------
   The Arena is entered in a fixed sequence, and the stage of that
   sequence is reported by the auth source, never computed by the
   screen that renders it.

       CREATE_ACCOUNT → UNLOCK → JOIN_DISCORD → OPEN

   `paid` is an entitlement the backend confirmed (or, in a DEMO
   build, a labeled simulation of one). `discordJoined` is what
   the reader claimed; `discordVerified` is what Discord told the
   backend. The interface shows both words and never swaps one
   for the other.
   ============================================================= */

export type AuthStatus = 'NOT_CONFIGURED' | 'LOADING' | 'READY' | 'UNAVAILABLE';

export type AccessStage = 'CREATE_ACCOUNT' | 'UNLOCK' | 'JOIN_DISCORD' | 'OPEN';

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface AuthSession {
  userId: string;
  email: string;
  handle: string;
  createdAt: number;
}

export interface AuthAccess {
  stage: AccessStage;
  paid: boolean;
  discordJoined: boolean;
  discordVerified: boolean;
}

export interface AuthState {
  status: AuthStatus;
  /** Null when nobody is signed in. Never a placeholder person. */
  session: AuthSession | null;
  access: AuthAccess;
  /** Which actions the source actually supports right now. */
  actions: {
    signUp: boolean;
    signIn: boolean;
    signOut: boolean;
    markDiscordJoined: boolean;
    /** DEMO builds only: simulate the backend confirming a purchase. */
    previewUnlock: boolean;
  };
  message: string | null;
  /** PREVIEW = an account that lives in this browser; LIVE = the backend. */
  origin: 'NONE' | 'PREVIEW' | 'LIVE';
}

/* =============================================================
   THE PUBLIC BOARD
   -------------------------------------------------------------
   What the landing page may show to someone outside the door.
   Coverage is public: which markets exist, on which venues, when
   they close, what the engine is doing. Every probability, edge and
   confidence figure is null — redacted by the SERVER — except on the
   one market the engine publishes as today's worked example
   (`featuredId`). A demo build derives this from the demo snapshot;
   a production build reads GET /api/public/board.
   ============================================================= */
export interface PublicBoard {
  origin: DataOrigin;
  asOf: string;
  brain: Pick<BrainTelemetry, 'state' | 'stage' | 'marketsTracked' | 'marketsMatched' | 'calibrationBps'>;
  /** Redacted canonical markets: probabilities null, series empty, unless featured. */
  markets: CanonicalMarket[];
  events: ArenaEvent[];
  featuredId: string | null;
}
