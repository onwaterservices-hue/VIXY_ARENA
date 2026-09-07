/* =============================================================
   DEMO DATA PROVIDER — VISUAL DEVELOPMENT ONLY
   -------------------------------------------------------------
   This module simulates the SHAPE and CADENCE of the VIXY engine
   so the interface can be designed and reviewed before ingest is
   connected. Every value it emits is synthetic and is stamped
   origin: 'DEMO'. The UI reads that stamp and labels itself.

   It contains NO business logic. It does not model markets, it
   does not compute edges that mean anything, and it must never
   be imported by production code paths.
   ============================================================= */

import type {
  AdminOverview, AdvantageBand, ArenaEvent, ArenaEventStatus, ArenaSnapshot, Bps,
  DailySlate, SlateObjective, BrainState, BrainTelemetry, CalibrationBin,
  CallRecord, CallIntent, CanonicalMarket, Direction, EdgeOpportunity, EventPhase, FeedStatus,
  EvidenceState, EvidenceTrack, FormResult, HealthEnvelope, LeaderboardEntry,
  MarketCategory, NeuralEdge, NeuralGraph, NeuralNode,
  ScanCandidate, ScanEvidence, ScanExtraction, ScanInput, ScanProgress,
  ScanResult, ScanStage, ScanStatus, ScanVerdict,
  PortfolioSummary, Regime, SignalEvent, SignalKind, SourceMetric, SystemTelemetry, Venue,
} from '../../types';
import type { ArenaDataSource } from '../api/ArenaDataSource';
import { SEED_EVENTS, SEED_MARKETS, SEED_PLAYERS } from './seed.ts';

const TICK_MS = 1400;
const SERIES_LEN = 48;
const MODEL_VERSION = 'demo-sim-0.0.0';

/* ---- deterministic pseudo-randomness ------------------------ */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const bps = (v: number, lo = 0, hi = 10000): Bps => Math.round(clamp(v, lo, hi));

/* ---- broadcast grading, server side --------------------------
   The bands the interface renders are decided HERE, in the data
   layer, exactly as the real engine will decide them. The client
   is never given a number and asked to name it.               */
function advantageBand(edgeBps: number | null): AdvantageBand {
  if (edgeBps === null) return 'NONE';
  const a = Math.abs(edgeBps);
  if (a < 60) return 'LEVEL';
  if (a < 180) return 'SLIGHT';
  if (a < 400) return 'MODERATE';
  if (a < 800) return 'STRONG';
  return 'DOMINANT';
}

/* Stable hash of the image identity, so a screenshot re-uploaded gives
   the same read. In the live pipeline this determinism comes from the
   image content; here it comes from a hash of it. */
function hashString(v: string): number {
  let h = 2166136261;
  for (let i = 0; i < v.length; i++) {
    h ^= v.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* =============================================================
   THE VERDICT
   -------------------------------------------------------------
   A controlled vocabulary derived from three canonical fields —
   edge, confidence and the advantage band the engine graded. The
   scanner has no opinion of its own to add, and there is no
   branch here that produces a word the Arena does not already
   use elsewhere for the same numbers.
   ============================================================= */
function scanVerdict(
  edgeBps: Bps | null, confidenceBps: Bps | null, band: AdvantageBand,
): ScanVerdict {
  if (edgeBps === null || confidenceBps === null) return 'INSUFFICIENT_DATA';
  /* A read the model does not hold firmly is a WATCH regardless of how
     wide the edge looks — a big number the engine is unsure of is the
     most misleading thing this screen could show confidently. */
  if (confidenceBps < 4000) return 'WATCH';
  if (band === 'NONE') return 'INSUFFICIENT_DATA';
  if (band === 'LEVEL') return 'NO_EDGE';
  if (edgeBps < 0) return 'NEGATIVE_EDGE';
  if (band === 'DOMINANT' || band === 'STRONG') return 'STRONG_EDGE';
  if (band === 'MODERATE') return 'POSITIVE_EDGE';
  return 'WATCH';
}

function scanRationale(verdict: ScanVerdict, title: string): string {
  switch (verdict) {
    case 'STRONG_EDGE':
      return `The model's probability for "${title}" sits well away from the venue consensus, and it holds that read firmly. This is a model-derived edge, not a guarantee of outcome.`;
    case 'POSITIVE_EDGE':
      return `The model reads "${title}" above the market by a margin the engine grades as moderate. Treat it as a lead to examine, not a conclusion.`;
    case 'NEGATIVE_EDGE':
      return `The model reads "${title}" BELOW the venue consensus. Any edge here runs against the printed price, not with it.`;
    case 'NO_EDGE':
      return `The model and the market agree on "${title}" inside the engine's noise band. There is nothing to act on in this disagreement because there is no disagreement.`;
    case 'WATCH':
      return `The engine has a read on "${title}" but does not hold it firmly enough to grade an edge. Worth watching; not worth acting on yet.`;
    case 'INSUFFICIENT_DATA':
      return 'The engine does not have enough to work with here. No probability, edge or confidence is being claimed.';
    default:
      return 'This market was not verified against a venue, so no model read is being presented as live.';
  }
}

const REGIMES: Regime[] = ['TRENDING', 'RANGING', 'VOLATILE', 'ILLIQUID'];
/* The engine's own life-cycle, in order. COMPARING and SETTLING are
   distinct states, not decoration: comparing is the moment the model has a
   read and is weighing it against the venues, and settling is the moment an
   outcome is being resolved but is not yet verified. Collapsing either into
   its neighbour would make the core lie about what the engine is doing. */
const BRAIN_CYCLE: BrainState[] = [
  'OBSERVING', 'ANALYZING', 'COMPARING', 'CONFIRMING', 'LOCKED', 'SETTLING', 'SETTLED',
];

const SIGNAL_COPY: Record<SignalKind, { subject: string; detail: string }> = {
  SYSTEM_ANALYZING:   { subject: 'System analyzing',    detail: 'feature set rebuilt · inference queued' },
  MARKET_SHIFT:       { subject: 'Market shift',        detail: 'venue consensus repriced' },
  MOMENTUM_BUILDING:  { subject: 'Momentum building',   detail: 'directional pressure sustained across window' },
  LIQUIDITY_CHANGE:   { subject: 'Liquidity change',    detail: 'book depth changed materially' },
  CORRELATION_SHIFT:  { subject: 'Correlation shift',   detail: 'cluster relationship re-estimated' },
  SIGNAL_CONFIRMING:  { subject: 'Signal confirming',   detail: 'second-pass validation running' },
  SIGNAL_LOCKED:      { subject: 'Signal locked',       detail: 'call record written · immutable' },
  SIGNAL_SETTLED:     { subject: 'Signal settled',      detail: 'outcome verified against source of truth' },
  SOURCE_DEGRADED:    { subject: 'Source degraded',     detail: 'freshness budget exceeded · status downgraded' },
};

const SIGNAL_POOL: SignalKind[] = [
  'SYSTEM_ANALYZING', 'MARKET_SHIFT', 'MOMENTUM_BUILDING', 'LIQUIDITY_CHANGE',
  'CORRELATION_SHIFT', 'SIGNAL_CONFIRMING', 'SIGNAL_LOCKED', 'SIGNAL_SETTLED',
  'SOURCE_DEGRADED',
];

const RESOLUTION_COPY: Record<string, string> = {
  SPORTS: 'Resolves YES if the named team or player result stands in the official final box score.',
  CRYPTO: 'Resolves YES if the reference index close is above the contract threshold at the stated time.',
  ECONOMICS: 'Resolves YES on the first official release from the issuing agency, revisions excluded.',
  POLITICS: 'Resolves YES on certified results published by the responsible authority.',
  CULTURE: 'Resolves YES on the announcement made by the awarding body during the broadcast.',
  WEATHER: 'Resolves YES if the designated meteorological agency records the event in the window.',
};

const RESOLUTION_SOURCE: Record<string, string> = {
  SPORTS: 'official league box score',
  CRYPTO: 'reference index close',
  ECONOMICS: 'issuing agency first release',
  POLITICS: 'certified official results',
  CULTURE: 'awarding body announcement',
  WEATHER: 'designated meteorological agency',
};

const EVIDENCE_POOL = [
  'cross-venue dispersion outside its trailing band',
  'model inputs refreshed inside the freshness budget',
  'directional flow persistent over the last three windows',
  'liquidity concentrated on one side of the book',
  'historical base rate diverges from posted price',
  'correlated cluster moved first, this market has not',
  'no scheduled information event before close',
  'calibration slice for this regime is well populated',
];

interface MarketRuntime {
  marketBps: number;
  vixyBps: number;
  drift: number;
  vol: number;
  series: number[];
  vixySeries: number[];
  regime: Regime;
  status: FeedStatus;
}

function envelope(status: FeedStatus, ageMs: number): HealthEnvelope {
  return {
    asOf: new Date().toISOString(),
    dataAgeMs: ageMs,
    status,
    sourceHealth: {
      kalshi: 'LIVE',
      polymarket: status === 'DEGRADED' ? 'DEGRADED' : 'LIVE',
      events: 'LIVE',
      model: 'LIVE',
    },
    origin: 'DEMO',
  };
}

export class DemoDataSource implements ArenaDataSource {
  readonly label = 'DEMO SIMULATOR';
  readonly origin = 'DEMO' as const;

  private rnd = mulberry32(20260904);
  private runtime = new Map<string, MarketRuntime>();
  private signals: SignalEvent[] = [];
  private calls: CallRecord[] = [];
  private leaderboard: LeaderboardEntry[] = [];
  private graph!: NeuralGraph;
  private brainIndex = 0;
  private brainTicks = 0;
  private tickCount = 0;
  private callTick = new Map<string, number>();
  private pointsBalance = 12_480;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(s: ArenaSnapshot) => void>();

  constructor() {
    this.bootstrap();
  }

  /* ---- boot ------------------------------------------------ */
  private bootstrap() {
    for (const seed of SEED_MARKETS) {
      const base = 2200 + this.rnd() * 5600;
      const bias = (this.rnd() - 0.45) * 1900;
      const series: number[] = [];
      const vixySeries: number[] = [];
      let walk = base;
      let vwalk = clamp(base + bias, 700, 9300);
      for (let i = 0; i < SERIES_LEN; i++) {
        walk = clamp(walk + (this.rnd() - 0.5) * 190, 700, 9300);
        vwalk = clamp(vwalk + (this.rnd() - 0.5) * 150 + (walk - vwalk) * 0.06, 700, 9300);
        series.push(Math.round(walk));
        vixySeries.push(Math.round(vwalk));
      }
      this.runtime.set(seed.id, {
        marketBps: Math.round(walk),
        vixyBps: Math.round(vwalk),
        drift: (this.rnd() - 0.5) * 26,
        vol: 40 + this.rnd() * 130,
        series,
        vixySeries,
        regime: REGIMES[Math.floor(this.rnd() * REGIMES.length)],
        status: 'LIVE',
      });
    }

    this.graph = this.buildGraph();
    this.leaderboard = this.buildLeaderboard();
    this.calls = this.buildCalls();
    for (let i = 0; i < 14; i++) this.pushSignal(true);
    // the buffer is always newest-first, including the seeded backfill
    this.signals.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  }

  private buildGraph(): NeuralGraph {
    /* Layout only — concentric rings with angular jitter so the graph
       fills its frame instead of hugging the edges. Positions carry no
       meaning; the real layout will come from the engine. */
    const nodes: NeuralNode[] = SEED_MARKETS.map((seed, i) => {
      const golden = 2.399963;
      const t = i * golden + (this.rnd() - 0.5) * 0.34;
      const ring = i % 3;
      const r = (ring === 0 ? 0.13 : ring === 1 ? 0.27 : 0.40) + (this.rnd() - 0.5) * 0.05;
      return {
        id: seed.id,
        symbol: seed.symbol,
        label: seed.title,
        category: seed.category,
        x: clamp(0.5 + r * Math.cos(t) * 1.55, 0.08, 0.92),
        y: clamp(0.5 + r * Math.sin(t) * 1.30, 0.13, 0.87),
        weight: 0.32 + this.rnd() * 0.68,
        activityBps: bps(1500 + this.rnd() * 7800),
        state: 'LIVE',
      };
    });

    /* Separation pass — keeps labels legible. Presentation only. */
    for (let pass = 0; pass < 80; pass++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = (nodes[j].y - nodes[i].y) * 0.62;
          const d = Math.hypot(dx, dy) || 0.0001;
          const min = 0.115;
          if (d < min) {
            const push = ((min - d) / d) * 0.5;
            nodes[i].x -= dx * push; nodes[i].y -= (dy / 0.62) * push;
            nodes[j].x += dx * push; nodes[j].y += (dy / 0.62) * push;
          }
        }
      }
      for (const n of nodes) {
        n.x = clamp(n.x, 0.07, 0.93);
        n.y = clamp(n.y, 0.10, 0.88);
      }
    }

    const edges: NeuralEdge[] = [];
    const kinds: NeuralEdge['kind'][] = ['CORRELATION', 'MOMENTUM', 'LIQUIDITY', 'INFLUENCE'];
    for (let i = 0; i < nodes.length; i++) {
      const scored = nodes
        .map((n, j) => ({ j, d: Math.hypot(n.x - nodes[i].x, n.y - nodes[i].y) }))
        .filter((e) => e.j !== i)
        .sort((a, b) => a.d - b.d)
        .slice(0, 3);
      for (const { j } of scored) {
        if (edges.some((e) => (e.from === nodes[j].id && e.to === nodes[i].id))) continue;
        edges.push({
          from: nodes[i].id,
          to: nodes[j].id,
          strength: (this.rnd() * 1.7 - 0.7),
          kind: kinds[Math.floor(this.rnd() * kinds.length)],
        });
      }
    }
    return { nodes, edges, health: envelope('LIVE', 900) };
  }

  private buildLeaderboard(): LeaderboardEntry[] {
    const tiers: LeaderboardEntry['tier'][] = ['ORACLE', 'ANALYST', 'CHALLENGER', 'ROOKIE'];
    return SEED_PLAYERS.map((handle, i) => ({
      rank: i + 1,
      handle,
      accuracyBps: bps(7400 - i * 190 + this.rnd() * 220),
      predictions: Math.round(420 - i * 22 + this.rnd() * 60),
      streak: Math.max(0, Math.round(14 - i * 1.1 + this.rnd() * 4)),
      score: Math.round(19480 - i * 940 + this.rnd() * 300),
      delta: Math.round((this.rnd() - 0.45) * 6),
      tier: tiers[Math.min(tiers.length - 1, Math.floor(i / 3))],
      form: this.formLine(handle, 5),
      locks: Math.round(24 - i * 1.4 + this.rnd() * 6),
      isYou: handle === 'nightshade',
    }));
  }

  private buildCalls(): CallRecord[] {
    const states: CallRecord['state'][] = ['OPEN', 'LOCKED', 'SETTLED', 'SETTLED', 'OPEN'];
    return SEED_MARKETS.slice(0, 9).map((seed, i) => {
      const rt = this.runtime.get(seed.id)!;
      const state = states[i % states.length];
      const settled = state === 'SETTLED';
      return {
        id: `call_${1000 + i}`,
        marketId: seed.id,
        market: seed.title,
        direction: (rt.vixyBps > rt.marketBps ? 'YES' : 'NO') as Direction,
        entryBps: rt.marketBps,
        vixyBps: rt.vixyBps,
        edgeBps: rt.vixyBps - rt.marketBps,
        stakePoints: 100 + Math.round(this.rnd() * 400),
        state,
        result: settled ? (i % 3 === 0 ? 'LOST' : 'WON') : null,
        settledAt: settled ? new Date(Date.now() - (i + 1) * 5_400_000).toISOString() : null,
        openedAt: new Date(Date.now() - (i + 2) * 9_600_000).toISOString(),
      };
    });
  }

  /* ---- simulation ------------------------------------------ */
  private step() {
    this.tickCount++;
    for (const [, rt] of this.runtime) {
      if (this.rnd() < 0.06) rt.drift = (this.rnd() - 0.5) * 30;
      const move = rt.drift + (this.rnd() - 0.5) * rt.vol;
      rt.marketBps = bps(rt.marketBps + move);
      rt.vixyBps = bps(rt.vixyBps + move * 0.55 + (this.rnd() - 0.5) * rt.vol * 0.7);
      rt.series = [...rt.series.slice(1), rt.marketBps];
      rt.vixySeries = [...rt.vixySeries.slice(1), rt.vixyBps];
      if (this.rnd() < 0.012) rt.regime = REGIMES[Math.floor(this.rnd() * REGIMES.length)];
      if (this.rnd() < 0.006) rt.status = 'DEGRADED';
      else if (rt.status === 'DEGRADED' && this.rnd() < 0.25) rt.status = 'LIVE';
    }

    this.ageCalls();
    if (this.tickCount % 2 === 0) this.pushSignal(false);

    this.brainTicks++;
    if (this.brainTicks > 4 + Math.floor(this.rnd() * 5)) {
      this.brainTicks = 0;
      this.brainIndex = (this.brainIndex + 1) % BRAIN_CYCLE.length;
    }

    for (const n of this.graph.nodes) {
      n.activityBps = bps(n.activityBps + (this.rnd() - 0.5) * 900);
    }
    if (this.rnd() < 0.08) {
      const i = Math.floor(this.rnd() * this.leaderboard.length);
      const j = Math.max(0, i - 1);
      if (i !== j) {
        const arr = this.leaderboard;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        arr.forEach((e, k) => { e.delta = e.rank - (k + 1); e.rank = k + 1; });
      }
    }
  }

  /**
   * Demo lifecycle: OPEN → LOCKED → SETTLED, on a timer. In production this
   * is the lifecycle service and the settlement service, and the client is
   * told about transitions — it never performs them.
   */
  private ageCalls() {
    for (const c of this.calls) {
      const age = this.tickCount - (this.callTick.get(c.id) ?? 0);
      if (c.state === 'OPEN' && age > 8 && this.rnd() < 0.25) {
        c.state = 'LOCKED';
        this.callTick.set(c.id, this.tickCount);
        this.pushCallSignal('SIGNAL_LOCKED', c.market, 'call record written · immutable');
      } else if (c.state === 'LOCKED' && age > 10 && this.rnd() < 0.2) {
        const rt = this.runtime.get(c.marketId);
        const moved = rt ? rt.marketBps - c.entryBps : 0;
        const correct = c.direction === 'YES' ? moved > 0 : moved < 0;
        c.state = 'SETTLED';
        c.result = correct ? 'WON' : 'LOST';
        c.settledAt = new Date().toISOString();
        this.callTick.set(c.id, this.tickCount);
        this.pushCallSignal('SIGNAL_SETTLED', c.market, `outcome verified · ${c.result}`);
      }
    }
  }

  private pushCallSignal(kind: SignalKind, subject: string, detail: string) {
    this.signals = [{
      id: `sig_${Date.now().toString(36)}_${Math.floor(this.rnd() * 1e6).toString(36)}`,
      ts: new Date().toISOString(),
      kind,
      marketId: null,
      subject: SIGNAL_COPY[kind].subject,
      detail: `${subject} · ${detail}`,
      magnitudeBps: null,
      venue: null,
      origin: 'DEMO' as const,
    }, ...this.signals].slice(0, 60);
  }

  private pushSignal(seedPhase: boolean) {
    const kind = SIGNAL_POOL[Math.floor(this.rnd() * SIGNAL_POOL.length)];
    const seed = SEED_MARKETS[Math.floor(this.rnd() * SEED_MARKETS.length)];
    const copy = SIGNAL_COPY[kind];
    const ageMs = seedPhase ? Math.round(this.rnd() * 900_000) : 0;
    const event: SignalEvent = {
      id: `sig_${Date.now().toString(36)}_${Math.floor(this.rnd() * 1e6).toString(36)}`,
      ts: new Date(Date.now() - ageMs).toISOString(),
      kind,
      marketId: seed.id,
      subject: copy.subject,
      detail: `${seed.symbol} · ${copy.detail}`,
      magnitudeBps: kind === 'MARKET_SHIFT' || kind === 'MOMENTUM_BUILDING'
        ? bps(60 + this.rnd() * 700) : null,
      venue: (seed.venues[Math.floor(this.rnd() * seed.venues.length)] ?? null) as Venue | null,
      origin: 'DEMO',
    };
    this.signals = [event, ...this.signals].slice(0, 60);
  }

  /* ---- projection ------------------------------------------ */
  private markets(): CanonicalMarket[] {
    return SEED_MARKETS.map((seed) => {
      const rt = this.runtime.get(seed.id)!;
      const dispersion = Math.round(Math.abs(Math.sin(this.tickCount / 11 + seed.id.length)) * 260);
      const edge = rt.vixyBps - rt.marketBps;
      return {
        id: seed.id,
        symbol: seed.symbol,
        title: seed.title,
        subtitle: seed.subtitle,
        category: seed.category,
        state: 'OPEN',
        closesAt: new Date(Date.now() + seed.closesInMin * 60_000).toISOString(),
        venueRefs: seed.venues.map((venue, i) => {
          const implied = bps(rt.marketBps + (i === 0 ? -dispersion / 2 : dispersion / 2));
          const spread = Math.round(24 + this.rnd() * 90);
          return {
            venue,
            venueMarketId: `${venue.toLowerCase()}:${seed.id}`,
            impliedBps: implied,
            bidBps: bps(implied - spread / 2),
            askBps: bps(implied + spread / 2),
            spreadBps: spread,
            liquidityUsd: Math.round(18_000 + this.rnd() * 480_000),
            volume24hUsd: Math.round(40_000 + this.rnd() * 1_900_000),
            status: rt.status,
          };
        }),
        marketProbabilityBps: rt.marketBps,
        vixyProbabilityBps: rt.vixyBps,
        edgeBps: edge,
        confidenceBps: bps(5200 + Math.abs(edge) * 3 + Math.sin(this.tickCount / 7) * 400),
        dispersionBps: dispersion,
        regime: rt.regime,
        reversalRiskBps: bps(1800 + Math.abs(Math.cos(this.tickCount / 9 + seed.closesInMin)) * 4200),
        signalQualityBps: bps(4200 + Math.abs(edge) * 2.4),
        provenance: {
          modelVersion: MODEL_VERSION,
          featureSetVersion: 'fs-demo-0.0.0',
          inputs: ['venue_quotes', 'event_schedule', 'historical_base_rates'],
          computedAt: new Date().toISOString(),
        },
        resolution: {
          statement: RESOLUTION_COPY[seed.category] ?? RESOLUTION_COPY.SPORTS,
          source: RESOLUTION_SOURCE[seed.category] ?? 'venue-designated source of truth',
          settlesAt: new Date(Date.now() + (seed.closesInMin + 90) * 60_000).toISOString(),
          conditions: [
            'venue and canonical outcome must map one-to-one',
            'settlement source must publish inside the verification window',
            'a disputed or void venue outcome voids the canonical market',
          ],
        },
        matchup: {
          home: { code: seed.home, label: seed.homeLabel, probabilityBps: rt.vixyBps, status: rt.status },
          away: { code: seed.away, label: seed.awayLabel, probabilityBps: rt.marketBps, status: rt.status },
          window: seed.window,
        },
        phase: this.phaseFor(seed.id, edge),
        momentum: {
          /* zero is level; the sign follows the edge, so the meter and the
             edge figure can never point opposite ways */
          biasBps: bps(edge * 12, -10000, 10000),
          side: edge > 60 ? 'UP' : edge < -60 ? 'DOWN' : 'NEUTRAL',
          band: advantageBand(edge),
          driftBps: Math.round(Math.sin(this.tickCount / 5 + seed.closesInMin) * 180),
        },
        series: rt.series,
        vixySeries: rt.vixySeries,
        health: envelope(rt.status, 400 + Math.round(this.rnd() * 2600)),
      };
    });
  }

  private opportunities(markets: CanonicalMarket[]): EdgeOpportunity[] {
    return markets
      .map((m) => {
        const edge = m.edgeBps ?? 0;
        const conf = m.confidenceBps ?? 0;
        return {
          marketId: m.id,
          rank: 0,
          edgeScore: Math.round((Math.abs(edge) / 100) * (conf / 10000) * 12),
          direction: (Math.abs(edge) < 120 ? 'WAIT' : edge > 0 ? 'YES' : 'NO') as Direction,
          edgeBps: edge,
          confidenceBps: conf,
          evidence: [
            EVIDENCE_POOL[m.id.length % EVIDENCE_POOL.length],
            EVIDENCE_POOL[(m.id.length + 3) % EVIDENCE_POOL.length],
            EVIDENCE_POOL[(m.id.length + 6) % EVIDENCE_POOL.length],
          ],
        };
      })
      .sort((a, b) => b.edgeScore - a.edgeScore)
      .map((o, i) => ({ ...o, rank: i + 1 }));
  }

  private brain(markets: CanonicalMarket[]): BrainTelemetry {
    /* Wrap at the point of use, not only where the index advances: a reader
       that never wraps would hand the interface `undefined` as an engine
       state, and the core would render a state the contract does not have. */
    const state = BRAIN_CYCLE[this.brainIndex % BRAIN_CYCLE.length];
    const stages: Record<BrainState, string> = {
      OBSERVING: 'DISCOVER → VERIFY',
      ANALYZING: 'MODEL',
      COMPARING: 'COMPARE → DETECT EDGE',
      CONFIRMING: 'RANK → EXPLAIN',
      LOCKED: 'RECORD',
      SETTLING: 'SETTLE',
      SETTLED: 'MEASURE → LEARN',
    };
    return {
      state,
      stage: stages[state],
      modelVersion: MODEL_VERSION,
      marketsTracked: markets.length * 34,
      marketsMatched: Math.round(markets.length * 21 + Math.sin(this.tickCount / 5) * 6),
      inferencesPerMin: Math.round(880 + Math.sin(this.tickCount / 3) * 210),
      queueDepth: Math.max(0, Math.round(12 + Math.sin(this.tickCount / 4) * 11)),
      calibrationBps: bps(6100 + Math.sin(this.tickCount / 13) * 300),
      calibrationBins: this.calibrationBins(),
      evidence: this.evidence(state),
      health: envelope('LIVE', 620),
    };
  }

  /* The categories the analyst reads, each graded by the engine. The
     grades advance with the brain state so all five appear over a
     cycle — the interface renders whichever grade it is handed. */
  private evidence(state: BrainState): EvidenceTrack[] {
    const stage = BRAIN_CYCLE.indexOf(state);
    const tracks: { key: string; label: string }[] = [
      { key: 'momentum',   label: 'Market momentum' },
      { key: 'flow',       label: 'Order flow' },
      { key: 'volatility', label: 'Volatility' },
      { key: 'cross',      label: 'Cross-asset signal' },
      { key: 'liquidity',  label: 'Liquidity' },
      { key: 'timing',     label: 'Timing' },
    ];
    const ladder: EvidenceState[] = ['SCANNING', 'BUILDING', 'ALIGNED', 'CONFIRMED'];
    return tracks.map((t, i) => {
      const wobble = Math.sin(this.tickCount / 6 + i * 1.7);
      const step = Math.min(ladder.length - 1, Math.max(0, stage + 1 - (i % 3) + (wobble > 0.6 ? 1 : 0)));
      const conflicted = wobble < -0.86 && stage > 0;
      const evState: EvidenceState = conflicted ? 'CONFLICTED' : ladder[step];
      return {
        key: t.key,
        label: t.label,
        state: evState,
        progressBps: evState === 'SCANNING' ? null
          : bps(2600 + step * 2100 + wobble * 700),
      };
    });
  }

  /** Reliability diagram bins. Synthetic: a mildly over-confident model. */
  private calibrationBins(): CalibrationBin[] {
    return Array.from({ length: 10 }, (_, i) => {
      const predicted = i * 1000 + 500;
      const drift = Math.sin(this.tickCount / 17 + i) * 260;
      const shrink = (predicted - 5000) * 0.16;
      return {
        predictedBps: predicted,
        realizedBps: bps(predicted - shrink + drift),
        count: Math.round(40 + Math.abs(Math.cos(i * 1.7)) * 180),
      };
    });
  }

  private system(): SystemTelemetry {
    const src = (key: string, label: string, base: number): SourceMetric => ({
      key, label,
      status: this.rnd() < 0.05 ? 'DEGRADED' : 'LIVE',
      latencyMs: Math.round(base + this.rnd() * base * 0.6),
      successRateBps: bps(9860 + this.rnd() * 130),
      lastEventAt: new Date(Date.now() - Math.round(this.rnd() * 4000)).toISOString(),
      throughputPerMin: Math.round(240 + this.rnd() * 900),
    });
    return {
      sources: [
        src('kalshi', 'Kalshi ingest', 42),
        src('polymarket', 'Polymarket ingest', 68),
        src('events', 'Event data', 120),
        src('intel', 'Inference workers', 34),
        src('lifecycle', 'Lifecycle engine', 18),
        src('settle', 'Settlement', 26),
      ],
      ingestLagMs: Math.round(180 + this.rnd() * 420),
      matchQueue: Math.round(4 + this.rnd() * 26),
      settlementQueue: Math.round(this.rnd() * 9),
      uptimeBps: bps(9970 + this.rnd() * 25),
      health: envelope('LIVE', 500),
    };
  }

  private portfolio(): PortfolioSummary {
    const settled = this.calls.filter((c) => c.state === 'SETTLED');
    const won = settled.filter((c) => c.result === 'WON').length;
    return {
      openCalls: this.calls.filter((c) => c.state === 'OPEN').length,
      lockedCalls: this.calls.filter((c) => c.state === 'LOCKED').length,
      settledCalls: settled.length,
      accuracyBps: bps(settled.length ? (won / settled.length) * 10000 : 0),
      pointsBalance: this.pointsBalance,
      streak: 5,
      calibrationBps: 6180,
      /* The form line is the settled record, newest first — not a
         decorative sequence. Empty until something settles. */
      form: settled
        .slice()
        .sort((a, b) => +new Date(b.settledAt ?? 0) - +new Date(a.settledAt ?? 0))
        .slice(0, 5)
        .map((c): FormResult => (c.result === 'WON' ? 'W' : c.result === 'LOST' ? 'L' : 'P')),
    };
  }

  /* A deterministic form line for a competitor, so a handle keeps the
     same record between ticks. Fictional, like everything else here. */
  private formLine(handle: string, n: number): FormResult[] {
    let h = 0;
    for (let i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) >>> 0;
    const out: FormResult[] = [];
    for (let i = 0; i < n; i++) {
      h = (h * 1103515245 + 12345) >>> 0;
      const r = (h >>> 16) % 100;
      out.push(r < 8 ? 'P' : r < 62 ? 'W' : 'L');
    }
    return out;
  }

  /* The phase of an event's own clock. In the live system this is a
     lifecycle the engine advances; here it follows the brain cycle and
     the market's own edge so the interface has all five to render. */
  private phaseFor(marketId: string, edge: number | null): EventPhase {
    if (edge === null) return 'PREGAME';
    const brain = BRAIN_CYCLE[this.brainIndex % BRAIN_CYCLE.length];
    let h = 0;
    for (let i = 0; i < marketId.length; i++) h = (h * 31 + marketId.charCodeAt(i)) >>> 0;
    const offset = h % BRAIN_CYCLE.length;
    const state = BRAIN_CYCLE[(BRAIN_CYCLE.indexOf(brain) + offset) % BRAIN_CYCLE.length];
    switch (state) {
      case 'OBSERVING':  return 'PREGAME';
      case 'ANALYZING':  return 'CALIBRATION';
      case 'CONFIRMING': return 'CONFIRMATION';
      case 'LOCKED':     return 'LOCK_WINDOW';
      default:           return 'FINAL';
    }
  }

  private admin(): AdminOverview {
    return {
      environment: 'DEVELOPMENT',
      buildVersion: 'arena-shell-0.1.0',
      featureFlags: [
        { key: 'demo_data', label: 'Demo data provider', enabled: true, locked: true, note: 'Forced on until the engine is connected' },
        { key: 'venue_kalshi', label: 'Kalshi adapter', enabled: false, locked: true, note: 'Requires credentials + rate-limit budget' },
        { key: 'venue_polymarket', label: 'Polymarket adapter', enabled: false, locked: true, note: 'Requires ingest service' },
        { key: 'settlement', label: 'Automated settlement', enabled: false, locked: true, note: 'Blocked until outcome verification ships' },
        { key: 'payments', label: 'Payments / Stripe', enabled: false, locked: true, note: 'Out of scope for v1 by decision' },
        { key: 'discord', label: 'Discord identity', enabled: false, locked: true, note: 'Future only' },
      ],
      guards: [
        { key: 'no_client_liveness', label: 'Client never computes liveness', status: 'PASS', note: 'Status arrives in the health envelope' },
        { key: 'no_client_business_rules', label: 'No business rules in UI layer', status: 'PASS', note: 'Components are pure presentation' },
        { key: 'origin_labeling', label: 'Data origin is always labeled', status: 'PASS', note: 'DEMO badge bound to provider.origin' },
        { key: 'no_prod_credentials', label: 'No production credentials present', status: 'PASS', note: 'No venue keys in this build' },
        { key: 'engine_connected', label: 'Engine connected', status: 'BLOCKED', note: 'No ingest service running' },
        { key: 'settlement_verified', label: 'Settlement verified against source of truth', status: 'PENDING', note: 'Requires settle service' },
      ],
      jobs: [
        { key: 'ingest', label: 'Venue ingest loop', state: 'PAUSED', lastRunAt: '—', note: 'Adapter disabled' },
        { key: 'match', label: 'Cross-venue matching', state: 'PAUSED', lastRunAt: '—', note: 'No canonical markets to match' },
        { key: 'intel', label: 'Probability + edge', state: 'IDLE', lastRunAt: '—', note: 'Awaiting model registration' },
        { key: 'lifecycle', label: 'Lifecycle transitions', state: 'IDLE', lastRunAt: '—', note: 'No open markets' },
        { key: 'settle', label: 'Settlement sweep', state: 'PAUSED', lastRunAt: '—', note: 'Verification source unset' },
        { key: 'health', label: 'Freshness monitor', state: 'RUNNING', lastRunAt: 'continuous', note: 'Watching the demo provider only' },
      ],
      auditTrail: [
        { ts: new Date(Date.now() - 60_000).toISOString(), actor: 'system', action: 'PROVIDER_RESOLVED', target: 'DemoDataSource' },
        { ts: new Date(Date.now() - 240_000).toISOString(), actor: 'system', action: 'GUARD_EVALUATED', target: 'origin_labeling' },
        { ts: new Date(Date.now() - 900_000).toISOString(), actor: 'system', action: 'BUILD_LOADED', target: 'arena-shell-0.1.0' },
      ],
      health: envelope('LIVE', 300),
    };
  }

  /* ---- the schedule ---------------------------------------
     Events carry their own clock. Status is computed HERE, on the
     provider side, for the same reason liveness is: the interface
     renders a word the engine chose, and never decides for itself
     that something is live.                                      */
  private events(markets: CanonicalMarket[]): ArenaEvent[] {
    const byId = new Map(markets.map((m) => [m.id, m]));
    const now = Date.now();

    return SEED_EVENTS.map((e) => {
      const ids = e.marketIds.filter((id) => byId.has(id));
      const own = ids.map((id) => byId.get(id)!);
      const startsAt = new Date(now + e.startsInMin * 60_000).toISOString();

      /* Soonest close across the event's markets decides urgency. */
      const soonestClose = own.length === 0 ? Infinity
        : Math.min(...own.map((m) => +new Date(m.closesAt) - now));

      const allSettled = own.length > 0 && own.every((m) => m.state === 'SETTLED');
      const allClosed = own.length > 0
        && own.every((m) => m.state === 'SETTLED' || m.state === 'SETTLING' || m.state === 'LOCKED');

      const status: ArenaEventStatus =
        allSettled ? 'SETTLED'
        : allClosed ? 'CLOSED'
        : e.startsInMin <= 0 ? 'LIVE'
        : soonestClose <= 120 * 60_000 ? 'CLOSING_SOON'
        : 'UPCOMING';

      const venues = [...new Set(own.flatMap((m) => m.venueRefs.map((v) => v.venue)))];

      return {
        id: e.id,
        title: e.title,
        league: e.league,
        category: e.category,
        startsAt,
        status,
        venues,
        marketIds: ids,
        note: e.note,
        health: envelope(own.some((m) => m.health.status !== 'LIVE') ? 'DEGRADED' : 'LIVE', 800),
      };
    }).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  }

  /* ---- the daily slate -------------------------------------
     The card is chosen by the engine from what is actually on
     today: markets closing soonest, spread across categories so
     the card is never one sport or one asset class.

     Objective progress is computed HERE, from the call records,
     for the same reason liveness is computed here — deciding that
     an objective is met is a business rule, and the interface does
     not own business rules.                                       */
  private slate(markets: CanonicalMarket[]): DailySlate {
    const now = Date.now();
    const day = new Date(now);
    const id = day.toISOString().slice(0, 10);
    const opens = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
    const closes = opens + 86_400_000;

    /* One market per category, soonest close first, then fill to eight by
       close time. A card that is six crypto contracts is not a card. */
    const byClose = [...markets].sort(
      (a, b) => +new Date(a.closesAt) - +new Date(b.closesAt),
    );
    const card: CanonicalMarket[] = [];
    const seenCats = new Set<string>();
    for (const m of byClose) {
      if (seenCats.has(m.category)) continue;
      seenCats.add(m.category);
      card.push(m);
      if (card.length >= 6) break;
    }
    for (const m of byClose) {
      if (card.length >= 8) break;
      if (!card.some((x) => x.id === m.id)) card.push(m);
    }
    const cardIds = new Set(card.map((m) => m.id));

    /* Calls made inside today's window, against today's card. */
    const todays = this.calls.filter((c) => +new Date(c.openedAt) >= opens);
    const onCard = todays.filter((c) => cardIds.has(c.marketId));
    const cats = new Set(
      onCard.map((c) => markets.find((m) => m.id === c.marketId)?.category).filter(Boolean),
    );
    const edgeCalls = onCard.filter((c) => Math.abs(c.edgeBps) >= 200).length;
    const convictionCalls = onCard.filter((c) => {
      const m = markets.find((x) => x.id === c.marketId);
      return (m?.confidenceBps ?? 0) >= 7000;
    }).length;
    const settledSeen = this.calls.filter((c) => c.state === 'SETTLED').length;

    const mk = (
      key: string, kind: SlateObjective['kind'], label: string, detail: string,
      target: number, progress: number, rewardPoints: number | null,
    ): SlateObjective => ({
      key, kind, label, detail, target,
      progress: Math.min(target, progress),
      complete: progress >= target,
      rewardPoints,
    });

    const objectives: SlateObjective[] = [
      mk('call3', 'CALL_COUNT', 'Work the card',
         'Make three calls on markets from today’s slate.', 3, onCard.length, 60),
      mk('spread3', 'CATEGORY_SPREAD', 'Read across the board',
         'Call markets in three different categories. Breadth is the discipline.',
         3, cats.size, 80),
      mk('edge1', 'TAKE_AN_EDGE', 'Back a disagreement',
         'Take a position on a market where VIXY differs from the crowd by two points or more.',
         1, edgeCalls, 70),
      mk('conv1', 'HIGH_CONVICTION', 'Follow the conviction',
         'Call a market the engine grades at 70% confidence or better.',
         1, convictionCalls, 50),
      mk('review1', 'REVIEW_SETTLED', 'Mark your own work',
         'Look at a settled call and see whether the model was right at the rate it claimed.',
         1, Math.min(1, settledSeen), 40),
    ];

    const completed = objectives.filter((o) => o.complete).length;

    /* A streak is days with at least one call. This simulator has one
       running history, so it reports the streak it has been keeping. */
    const streakDays = Math.max(0, this.portfolio().streak);

    return {
      id,
      opensAt: new Date(opens).toISOString(),
      closesAt: new Date(closes).toISOString(),
      marketIds: card.map((m) => m.id),
      objectives,
      streakDays,
      bestStreakDays: Math.max(streakDays, 12),
      completed,
      total: objectives.length,
      health: envelope('LIVE', 500),
    };
  }

  private snapshot(): ArenaSnapshot {
    const markets = this.markets();
    return {
      markets,
      events: this.events(markets),
      slate: this.slate(markets),
      opportunities: this.opportunities(markets),
      signals: this.signals,
      graph: { ...this.graph, health: envelope('LIVE', 900) },
      leaderboard: this.leaderboard,
      calls: this.calls,
      portfolio: this.portfolio(),
      brain: this.brain(markets),
      system: this.system(),
      admin: this.admin(),
      health: envelope('LIVE', 700),
    };
  }

  /* ---- ArenaDataSource ------------------------------------- */
  async load(): Promise<ArenaSnapshot> {
    return this.snapshot();
  }

  /* =============================================================
     SCAN A MARKET — the demo implementation
     -------------------------------------------------------------
     The real engine owns this: OCR/VLM extraction, a venue search
     against Kalshi and Polymarket, canonical retrieval, then the
     model. This implementation stands in for that shape exactly,
     against the fictional universe in seed.ts, so the interface
     and the failure paths are the ones the live pipeline will use.

     What it does NOT do — deliberately:
     · it never invents a market that is not in the canonical set;
     · it never upgrades a weak match into a confident one;
     · it never produces a verdict from the screenshot's own
       printed number. The verdict comes from the canonical
       market's edge, confidence and advantage band — the same
       three fields the Arena renders everywhere else.
     ============================================================= */

  private static readonly SCAN_STAGES: ScanStage[] = [
    'READING_IMAGE', 'IDENTIFYING_MARKET', 'MATCHING_VENUE', 'FETCHING_MARKET',
    'BUILDING_FEATURES', 'RUNNING_BRAIN', 'CROSS_CHECKING', 'CALCULATING_EDGE',
    'CALIBRATING_CONFIDENCE', 'FINALIZING',
  ];

  async scanMarket(input: ScanInput, onProgress?: (p: ScanProgress) => void): Promise<ScanResult> {
    const stages = DemoDataSource.SCAN_STAGES;
    const emit = async (i: number, note: string | null = null) => {
      onProgress?.({ stage: stages[i], index: i, total: stages.length, note });
      /* A short pause per stage so the reader can follow the work. The real
         pipeline reports stages as they complete; if it finishes fast the
         interface simply receives them fast. Nothing here pads a wait. */
      await new Promise((r) => setTimeout(r, 90 + (i % 3) * 40));
    };

    const scannedAt = new Date().toISOString();
    const id = `scan_${Date.now().toString(36)}`;

    /* ---- 0. read the image ---------------------------------- */
    await emit(0);
    const readable = input.mimeType.startsWith('image/') && input.bytes > 512;
    if (!readable) {
      return this.scanFailure(id, scannedAt, 'UNREADABLE', {
        venue: null, title: null, outcome: null, printedProbabilityBps: null,
        closesAtText: null, category: null, legibilityBps: 0,
        unreadable: ['the file is not a readable image'],
      }, 'The upload could not be read as an image, so nothing was extracted from it.');
    }

    /* ---- 1. identify a market in the image ------------------ */
    await emit(1);
    /* Deterministic from the bytes, so the same screenshot always gives the
       same read — a scanner whose answer changes on re-upload is not a
       scanner. The live pipeline gets this determinism from the image
       content itself; here it comes from a hash of it. */
    const h = hashString(`${input.fileName}:${input.bytes}:${input.dataUrl.slice(-96)}`);
    const legibility = bps(3800 + (h % 5600));

    if (legibility < 4200) {
      return this.scanFailure(id, scannedAt, 'NO_MARKET_DETECTED', {
        venue: null, title: null, outcome: null, printedProbabilityBps: null,
        closesAtText: null, category: null, legibilityBps: legibility,
        unreadable: ['market title', 'outcome', 'printed probability'],
      }, 'The image was read, but no market question could be identified in it.');
    }

    /* The extraction picks a market from the canonical set the way a real
       reader would land on one: it does not know the id, only what it saw. */
    const chosen = input.chooseMarketId
      ? SEED_MARKETS.find((m) => m.id === input.chooseMarketId)
      : SEED_MARKETS[h % SEED_MARKETS.length];
    if (!chosen) {
      return this.scanFailure(id, scannedAt, 'NO_MARKET_DETECTED', {
        venue: null, title: null, outcome: null, printedProbabilityBps: null,
        closesAtText: null, category: null, legibilityBps: legibility,
        unreadable: ['market title'],
      }, 'No market in the connected venues corresponds to what was read.');
    }

    const rt = this.runtime.get(chosen.id);
    const venue: Venue = chosen.venues[h % chosen.venues.length];
    const extraction: ScanExtraction = {
      venue,
      title: chosen.title,
      outcome: chosen.homeLabel,
      /* The number ON the screenshot. It is recorded as what the image said,
         and it is never used as the market's current probability. */
      printedProbabilityBps: rt ? bps(rt.marketBps + ((h % 400) - 200)) : null,
      closesAtText: chosen.window,
      category: chosen.category as MarketCategory,
      legibilityBps: legibility,
      unreadable: legibility < 6000 ? ['displayed volume'] : [],
    };

    /* ---- 2. match it against a venue ------------------------ */
    await emit(2);
    const matchBps = bps(Math.min(9900, legibility + 900 + (h % 1200)));

    /* Below the threshold the engine offers candidates instead of guessing.
       Silently matching the wrong market is the worst thing this feature
       could do, so the ambiguous path is a first-class outcome. */
    if (matchBps < 7000) {
      const candidates: ScanCandidate[] = SEED_MARKETS
        .filter((m) => m.category === chosen.category)
        .slice(0, 4)
        .map((m, i) => ({
          marketId: m.id,
          title: m.title,
          venue: m.venues[0],
          category: m.category as MarketCategory,
          matchBps: bps(matchBps - i * 420),
          reasons: [
            `category read as ${String(m.category).toLowerCase()}`,
            i === 0 ? 'closest title overlap' : 'partial title overlap',
            `listed on ${m.venues.join(' and ').toLowerCase()}`,
          ],
        }));
      return {
        id, status: 'AMBIGUOUS', extraction, candidates,
        marketId: null, matchBps,
        verdict: 'NOT_VERIFIED', evidence: [],
        rationale: 'Several markets in the connected venues fit what was read. '
          + 'Pick the right one and the scan will run against it — the engine will '
          + 'not choose for you when it is not confident.',
        origin: 'DEMO', scannedAt, health: envelope('DEGRADED', 0),
      };
    }

    /* ---- 3. retrieve the CANONICAL market -------------------- */
    await emit(3);
    const markets = this.markets();
    const canonical = markets.find((m) => m.id === chosen.id);
    if (!canonical) {
      return {
        id, status: 'UNVERIFIED', extraction, candidates: [],
        marketId: null, matchBps,
        verdict: 'NOT_VERIFIED', evidence: [],
        rationale: 'Market identified from the screenshot, but live market '
          + 'verification is unavailable. Nothing below rests on a verified price.',
        origin: 'DEMO', scannedAt, health: envelope('OFFLINE', 0),
      };
    }

    /* ---- 4..8. the same engine every other screen reads ------ */
    await emit(4);
    await emit(5);
    await emit(6);
    await emit(7);
    await emit(8);

    const edge = canonical.edgeBps;
    const conf = canonical.confidenceBps;
    const band = canonical.momentum?.band ?? 'NONE';

    /* ---- 9. the verdict ------------------------------------- */
    await emit(9);
    const verdict = scanVerdict(edge, conf, band);
    const evidence = this.scanEvidence(canonical);

    return {
      id, status: 'VERIFIED', extraction, candidates: [],
      marketId: canonical.id, matchBps,
      verdict, evidence,
      rationale: scanRationale(verdict, canonical.title),
      origin: 'DEMO', scannedAt, health: canonical.health,
    };
  }

  private scanFailure(
    id: string, scannedAt: string, status: ScanStatus,
    extraction: ScanExtraction, rationale: string,
  ): ScanResult {
    return {
      id, status, extraction, candidates: [], marketId: null, matchBps: null,
      verdict: status === 'UNREADABLE' || status === 'NO_MARKET_DETECTED'
        ? 'INSUFFICIENT_DATA' : 'NOT_VERIFIED',
      evidence: [], rationale, origin: 'DEMO', scannedAt,
      health: envelope('UNKNOWN', 0),
    };
  }

  /* Evidence is read off the canonical market's own fields. Every line
     here corresponds to something the engine reported; none of it is
     written for the scanner. */
  private scanEvidence(m: CanonicalMarket): ScanEvidence[] {
    const out: ScanEvidence[] = [];
    const sig = m.signalQualityBps ?? 0;
    const rev = m.reversalRiskBps ?? 0;
    const disp = m.dispersionBps ?? 0;
    const conf = m.confidenceBps ?? 0;

    out.push({
      label: 'Signal quality',
      stance: sig >= 5500 ? 'SUPPORTS' : sig >= 3500 ? 'NEUTRAL' : 'CAUTIONS',
      detail: `engine reports ${(sig / 100).toFixed(1)}% signal quality on the inputs behind this read`,
    });
    out.push({
      label: 'Model confidence',
      stance: conf >= 6000 ? 'SUPPORTS' : conf >= 4000 ? 'NEUTRAL' : 'CAUTIONS',
      detail: `${(conf / 100).toFixed(1)}% confidence, attributable to ${m.provenance?.modelVersion ?? 'an unrecorded model'}`,
    });
    out.push({
      label: 'Reversal risk',
      stance: rev >= 5000 ? 'CAUTIONS' : rev >= 3000 ? 'NEUTRAL' : 'SUPPORTS',
      detail: `${(rev / 100).toFixed(1)}% chance the current read flips before close`,
    });
    out.push({
      label: 'Venue agreement',
      stance: disp <= 250 ? 'SUPPORTS' : disp <= 600 ? 'NEUTRAL' : 'CAUTIONS',
      detail: m.venueRefs.length > 1
        ? `${(disp / 100).toFixed(2)}% dispersion across ${m.venueRefs.length} venues`
        : 'single venue listing — no cross-venue check available',
    });
    out.push({
      label: 'Market regime',
      stance: m.regime === 'ILLIQUID' ? 'CAUTIONS' : m.regime === 'TRENDING' ? 'SUPPORTS' : 'NEUTRAL',
      detail: `engine classifies this market as ${m.regime.toLowerCase()}`,
    });
    const liq = m.venueRefs[0]?.liquidityUsd;
    out.push({
      label: 'Liquidity',
      stance: liq === null || liq === undefined ? 'NEUTRAL' : liq > 120_000 ? 'SUPPORTS' : 'CAUTIONS',
      detail: liq === null || liq === undefined
        ? 'the venue did not publish book depth'
        : `${Math.round(liq / 1000)}k reported at the top venue`,
    });
    return out;
  }

  async placeCall(intent: CallIntent): Promise<CallRecord> {
    const seed = SEED_MARKETS.find((m) => m.id === intent.marketId);
    const rt = this.runtime.get(intent.marketId);
    if (!seed || !rt) throw new Error(`Unknown market ${intent.marketId}`);
    if (intent.stakePoints <= 0) throw new Error('Stake must be positive');
    if (intent.stakePoints > this.pointsBalance) throw new Error('Insufficient points');

    // Entry is the server's price at acceptance, not the price the client saw.
    const record: CallRecord = {
      id: `call_${Date.now().toString(36)}`,
      marketId: seed.id,
      market: seed.title,
      direction: intent.direction,
      entryBps: rt.marketBps,
      vixyBps: rt.vixyBps,
      edgeBps: rt.vixyBps - rt.marketBps,
      stakePoints: intent.stakePoints,
      state: 'OPEN',
      result: null,
      settledAt: null,
      openedAt: new Date().toISOString(),
    };
    this.pointsBalance -= intent.stakePoints;
    this.calls = [record, ...this.calls];
    this.callTick.set(record.id, this.tickCount);
    this.pushCallSignal('SIGNAL_CONFIRMING', seed.title, `call submitted · ${intent.direction} · ${intent.stakePoints} pts`);
    const snap = this.snapshot();
    this.listeners.forEach((l) => l(snap));
    return record;
  }

  subscribe(onSnapshot: (s: ArenaSnapshot) => void): () => void {
    this.listeners.add(onSnapshot);
    if (!this.timer) {
      this.timer = setInterval(() => {
        this.step();
        const snap = this.snapshot();
        this.listeners.forEach((l) => l(snap));
      }, TICK_MS);
    }
    return () => {
      this.listeners.delete(onSnapshot);
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }
}
