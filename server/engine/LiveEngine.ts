/* =============================================================
   LIVE ENGINE — DISCOVER + VERIFY, honestly.
   Real markets from real venues, refreshed on a timer, served with
   origin LIVE. There is no model behind it yet, so every VIXY
   probability, edge, opportunity, signal and leaderboard entry is
   empty or null. The interface renders exactly that. The moment a
   model exists, it plugs in at `model()` below and nothing else moves.
   ============================================================= */
import type {
  ArenaSnapshot, FeedStatus, ScanInput, ScanProgress, ScanResult, SourceMetric,
} from '../../types/index.ts';
import type { EngineQuote, EngineResolution, EngineSource } from './EngineSource.ts';
import type { VenueFetchResult, VenueMarket } from './venues/types.ts';
import { KalshiAdapter } from './venues/kalshi.ts';
import { PolymarketAdapter } from './venues/polymarket.ts';
import { buildCanonical, envelope, feedStatus } from './canonical.ts';
import { applyModel, type VixyModel } from './model.ts';
import { runVision, type VisionReader } from './vision.ts';
import { ObservationHistory } from './model/observations.ts';
import { ConsensusModel } from './model/consensusModel.ts';
import { ContinuationModel } from './model/continuationModel.ts';
import { evaluateLockGate, sideOf, LOCK_POLICY, type PriorRead } from './model/lockPolicy.ts';
import type { Direction } from '../../types/index.ts';
import type { DatabaseSync } from 'node:sqlite';
import { recordObservations, recordReads, type ReadRecord } from '../ledger/observationStore.ts';
import { evaluate, EVAL, type EvaluationReport } from '../ledger/evaluation.ts';
import type { ModelStatus } from '../../types/index.ts';

export interface VenueAdapterLike {
  venue: 'KALSHI' | 'POLYMARKET';
  fetchOpen(limit?: number): Promise<VenueFetchResult>;
  /** One market by venue id — the VERIFY step, and the only source of an outcome. */
  fetchMarket?(venueMarketId: string): Promise<VenueMarket | null>;
}

export interface LiveEngineOptions {
  adapters?: VenueAdapterLike[];
  refreshMs?: number;
  buildVersion?: string;
  environment?: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
  now?: () => number;
  /** The VIXY model. `'consensus'` = vixy-arena-consensus (the Arena's own). null/absent → every VIXY probability is null and no lock is possible. */
  model?: VixyModel | null | 'consensus' | 'continuation';
  /** The Arena Vision image reader. Absent → every scan is UNREADABLE / NOT_VERIFIED. */
  reader?: VisionReader | null;
  /** Durable evaluation record (observations, model reads incl. skips, outcomes). Absent → in-memory only. */
  store?: DatabaseSync | null;
}

export class LiveEngine implements EngineSource {
  readonly label: string;
  readonly origin = 'LIVE' as const;
  private adapters: VenueAdapterLike[];
  private model: VixyModel | null;
  private reader: VisionReader | null;
  private store: DatabaseSync | null;
  /** Venue observations over time — the model's only memory. */
  readonly history = new ObservationHistory();
  /** The last few applied reads per market, for the stability check. */
  private priorReads = new Map<string, PriorRead[]>();
  private refreshMs: number;
  private last = new Map<string, VenueFetchResult>();
  private rows: VenueMarket[] = [];
  private listeners = new Set<(s: ArenaSnapshot) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private buildVersion: string;
  private environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
  private now: () => number;
  private startedAt: number;

  constructor(opts: LiveEngineOptions = {}) {
    this.adapters = opts.adapters ?? [new KalshiAdapter(), new PolymarketAdapter()];
    this.refreshMs = opts.refreshMs ?? 30_000;
    this.buildVersion = opts.buildVersion ?? 'arena-engine-0.1.0-discover';
    this.environment = opts.environment ?? 'DEVELOPMENT';
    this.now = opts.now ?? (() => Date.now());
    this.startedAt = this.now();
    this.model = opts.model === 'consensus' ? new ConsensusModel(this.history)
      : opts.model === 'continuation' ? new ContinuationModel(this.history)
      : (opts.model ?? null);
    this.reader = opts.reader ?? null;
    this.store = opts.store ?? null;
    this.label = this.model ? `VIXY ENGINE · model ${this.model.version}` : 'VIXY ENGINE · discover/verify (no model connected)';
  }

  /** Canonical markets with the model applied (when there is one). */
  private board(now: number) {
    const errors = Object.fromEntries([...this.last.values()].map((r) => [r.venue, r.error !== null]));
    const built = buildCanonical(this.rows, now, errors);
    const model = this.model;
    const markets = model ? built.markets.map((m) => applyModel(m, model, now)) : built.markets;
    return { ...built, markets };
  }

  /** Pull every venue once. Failures are recorded, never hidden; old rows stay and go STALE. */
  private backoffUntil = new Map<string, number>();
  async refresh(): Promise<void> {
    const t = this.now();
    const results = await Promise.all(this.adapters.map(async (a) => {
      /* A venue that asked us to back off is not asked again until it said we may. */
      const until = this.backoffUntil.get(a.venue) ?? 0;
      if (until > t) { const prev = this.last.get(a.venue); return prev ? { ...prev, error: `backing off until ${new Date(until).toISOString()}` } : null; }
      /* An adapter that throws is a venue that failed: the engine records it and keeps going. It never crashes the loop. */
      let r: VenueFetchResult;
      try { r = await a.fetchOpen(); }
      catch (e) { r = { venue: a.venue, markets: [], fetchedAt: new Date(t).toISOString(), latencyMs: 0, error: e instanceof Error ? e.message : String(e), endpoint: undefined, httpStatus: null, retryAfterMs: null }; }
      if (r.retryAfterMs) this.backoffUntil.set(a.venue, t + r.retryAfterMs);
      return r;
    }));
    for (const r of results) {
      if (!r) continue;
      const prev = this.last.get(r.venue);
      /* On error keep the previous rows (they will read STALE/DEGRADED by age); never the error's empty list. */
      this.last.set(r.venue, r.error && prev ? { ...prev, error: r.error, latencyMs: r.latencyMs, httpStatus: r.httpStatus, endpoint: r.endpoint } : r);
    }
    this.rows = [...this.last.values()].flatMap((r) => r.markets);
    const now = this.now();
    this.history.recordAll(this.rows, now);
    if (this.store) { try { recordObservations(this.store, this.rows, now); } catch (e) { console.error('[engine] observation store', e); } }
    /* One applied read per market per refresh, remembered for the stability window — and written down,
       skips included, so the model can be evaluated on what it said at the time. */
    if (this.model) {
      const records: ReadRecord[] = [];
      for (const m of this.board(now).markets) {
        const spread = Math.max(...m.venueRefs.map((v) => v.spreadBps ?? 0), 0);
        const side = sideOf(m.edgeBps, Math.max(LOCK_POLICY.MIN_EDGE_BPS, spread));
        const list = this.priorReads.get(m.id) ?? [];
        list.push({ at: now, side, edgeBps: m.edgeBps, spreadBps: spread });
        if (list.length > 10) list.splice(0, list.length - 10);
        this.priorReads.set(m.id, list);
        if (this.store) {
          const read = this.model.read(m, now);
          const gate = read ? evaluateLockGate({ market: m, read, direction: side === 'NONE' ? 'YES' : side, priorReads: list.slice(0, -1), now, refreshMs: this.refreshMs }) : null;
          const ref = m.venueRefs[0] ?? null;
          records.push({
            at: now, marketId: m.id, category: m.category, venue: ref?.venue ?? null, venueMarketId: ref?.venueMarketId ?? null, modelVersion: this.model.version,
            marketBps: m.marketProbabilityBps, vixyBps: m.vixyProbabilityBps, edgeBps: m.edgeBps, confidenceBps: m.confidenceBps, reversalRiskBps: m.reversalRiskBps,
            side, skipped: read === null, skipReason: read === null ? this.skipReason(m, now) : null,
            gateAllowed: gate ? gate.allowed : null, gateReasons: gate ? gate.reasons.join(' · ') : null, closesAt: m.closesAt,
          });
        }
      }
      if (this.store && records.length) { try { recordReads(this.store, records); } catch (e) { console.error('[engine] read store', e); } }
    }
  }

  /** Why the model had no read — the same conditions the model checks, named. */
  private skipReason(m: import('../../types/index.ts').CanonicalMarket, now: number): string {
    if (m.marketProbabilityBps === null) return 'no_price';
    if (m.health.status !== 'LIVE') return 'stale';
    const ref = m.venueRefs[0];
    const obs = ref ? this.history.get(ref.venue, ref.venueMarketId, now).length : 0;
    if (obs < 6) return `insufficient_observations:${obs}`;
    return 'no_information_beyond_market';
  }

  private evalCache: { at: number; report: EvaluationReport | null } = { at: 0, report: null };
  /** MODEL_* status: validation state × feed health. Cached for a minute; the evaluation is a read of the ledger. */
  modelStatus(now: number, overall: FeedStatus, markets: number): { status: ModelStatus; note: string } {
    if (!this.model) return { status: 'MODEL_OFFLINE', note: 'No model connected. Every VIXY probability is null; no lock can be written.' };
    if (overall !== 'LIVE' || markets === 0) return { status: 'MODEL_DEGRADED', note: `Venue feed is ${overall}${markets === 0 ? ', no markets' : ''}; reads are withheld until the data is fresh.` };
    if (!this.store) return { status: 'MODEL_INSUFFICIENT_DATA', note: 'No evaluation record is attached to this engine; the model runs unvalidated.' };
    if (now - this.evalCache.at > 60_000) { try { this.evalCache = { at: now, report: evaluate(this.store, now) }; } catch { this.evalCache = { at: now, report: null }; } }
    const r = this.evalCache.report;
    if (!r || r.status === 'INSUFFICIENT') return { status: 'MODEL_INSUFFICIENT_DATA', note: r ? r.verdict : 'Evaluation unavailable.' };
    const oos = r.oos?.locks ?? null;
    if (oos && oos.n >= EVAL.MIN_OOS && oos.skillVsMarket !== null && oos.skillVsMarket > 0) return { status: 'MODEL_READY', note: r.verdict };
    return { status: 'MODEL_CALIBRATING', note: r.verdict };
  }

  private snapshot(): ArenaSnapshot {
    const now = this.now();
    const { markets, events, matched } = this.board(now);
    const modelled = markets.filter((m) => m.vixyProbabilityBps !== null).length;
    const sources: SourceMetric[] = [...this.last.values()].map((r) => ({
      key: r.venue.toLowerCase(), label: `${r.venue === 'KALSHI' ? 'Kalshi' : 'Polymarket'} ingest${r.partial ? ' (partial)' : ''}`,
      status: r.partial && feedStatus(r.fetchedAt, now, r.error !== null) === 'LIVE' ? 'STALE' : feedStatus(r.fetchedAt, now, r.error !== null), latencyMs: r.latencyMs,
      successRateBps: r.error ? 0 : r.partial ? 5000 : 10000, lastEventAt: r.fetchedAt, throughputPerMin: r.markets.length,
      /* Provenance for the badge: which request, what the venue answered. */
      endpoint: r.endpoint, httpStatus: r.httpStatus, note: r.error ?? r.partial ?? null,
    }));
    const overall: FeedStatus = sources.length === 0 ? 'UNKNOWN' : sources.map((s) => s.status).reduce((a, b) => (a === 'LIVE' && b === 'LIVE' ? 'LIVE' : a === 'DEGRADED' || b === 'DEGRADED' ? 'DEGRADED' : 'STALE'));
    const age = sources.length ? Math.max(...sources.map((s) => now - new Date(s.lastEventAt).getTime())) : 0;
    const health = envelope(now, age, overall, Object.fromEntries(sources.map((s) => [s.key, s.status])));
    const day = new Date(now).toISOString().slice(0, 10);
    const ms = this.modelStatus(now, overall, markets.length);
    return {
      markets, events,
      slate: { id: day, opensAt: `${day}T00:00:00Z`, closesAt: `${day}T23:59:59Z`, marketIds: [], objectives: [], streakDays: 0, bestStreakDays: 0, completed: 0, total: 0, health },
      opportunities: [], signals: [],
      graph: { nodes: [], edges: [], health },
      leaderboard: [], calls: [],
      portfolio: { openCalls: 0, lockedCalls: 0, settledCalls: 0, accuracyBps: 0, pointsBalance: 0, streak: 0, calibrationBps: null, form: [] },
      brain: {
        state: 'OBSERVING', stage: this.model ? 'DISCOVER → VERIFY → MODEL' : 'DISCOVER → VERIFY', modelVersion: this.model?.version ?? 'none — no model connected',
        modelStatus: ms.status, modelStatusNote: ms.note,
        marketsTracked: markets.length, marketsMatched: matched, inferencesPerMin: this.model ? Math.round(modelled * (60_000 / this.refreshMs)) : 0, queueDepth: 0,
        calibrationBps: null, calibrationBins: [], evidence: [], health,
      },
      system: { sources, ingestLagMs: Math.round(age), matchQueue: 0, settlementQueue: 0, uptimeBps: 10000, health },
      admin: {
        environment: this.environment, buildVersion: this.buildVersion,
        featureFlags: [
          { key: 'model', label: 'VIXY model', enabled: Boolean(this.model), locked: !this.model, note: this.model ? `${this.model.version} · ${ms.status}: ${modelled}/${markets.length} markets have a read` : 'No model connected; VIXY probabilities are null.' },
          { key: 'reader', label: 'Arena Vision reader', enabled: Boolean(this.reader), locked: !this.reader, note: this.reader ? `${this.reader.version} connected` : 'No image reader connected; scans return UNREADABLE and say so.' },
          { key: 'lock_policy', label: 'Lock policy', enabled: Boolean(this.model), locked: true, note: this.model ? `${LOCK_POLICY.version}: every reason must pass; thresholds unvalidated` : 'No model → no locks.' },
        ],
        guards: [
          { key: 'origin', label: 'Origin travels with every payload', status: 'PASS', note: 'LIVE from venues; nothing simulated here' },
          { key: 'no_model_no_edge', label: 'No edge without a model', status: 'PASS', note: this.model ? `${markets.length - modelled} market(s) without a read show null` : 'vixyProbabilityBps and edgeBps are null on every market' },
          { key: 'settlement_from_venue', label: 'Settlement only from a venue-published outcome', status: 'PASS', note: 'resolve() returns null until the venue reports a result' },
        ],
        jobs: [
          { key: 'ingest', label: 'Venue ingest', state: this.timer ? 'RUNNING' : 'IDLE', lastRunAt: new Date(now).toISOString(), note: `${this.rows.length} rows from ${sources.length} venue(s)` },
          { key: 'canonical', label: 'Canonical layer', state: 'RUNNING', lastRunAt: new Date(now).toISOString(), note: `${matched} cross-venue matches` },
          { key: 'model', label: 'VIXY model', state: this.model ? 'RUNNING' : 'PAUSED', lastRunAt: new Date(this.model ? now : this.startedAt).toISOString(), note: this.model ? `${modelled} read(s)` : 'not connected' },
          { key: 'settlement', label: 'Settlement', state: 'RUNNING', lastRunAt: new Date(now).toISOString(), note: 'ledger sweep; outcomes from venues only' },
        ],
        auditTrail: [],
        health,
      },
      health,
    };
  }

  async load(): Promise<ArenaSnapshot> {
    if (this.last.size === 0) await this.refresh();
    return this.snapshot();
  }

  subscribe(onSnapshot: (s: ArenaSnapshot) => void): () => void {
    this.listeners.add(onSnapshot);
    if (!this.timer) {
      this.timer = setInterval(async () => {
        await this.refresh();
        const s = this.snapshot();
        this.listeners.forEach((l) => l(s));
      }, this.refreshMs);
    }
    return () => {
      this.listeners.delete(onSnapshot);
      if (this.listeners.size === 0 && this.timer) { clearInterval(this.timer); this.timer = null; }
    };
  }

  /** The engine's read at this instant. vixyBps is null without a model → the ledger refuses the lock. */
  async quote(marketId: string, direction: Direction = 'YES'): Promise<EngineQuote | null> {
    if (this.last.size === 0) await this.refresh();
    const now = this.now();
    const m = this.board(now).markets.find((x) => x.id === marketId);
    if (!m) return null;
    const ref = m.venueRefs[0] ?? null;
    /* The read itself (with frozen inputs), and the policy's verdict for this direction. */
    const read = this.model ? this.model.read(m, now) : null;
    const lockGate = this.model ? evaluateLockGate({ market: m, read, direction, priorReads: this.priorReads.get(m.id) ?? [], now, refreshMs: this.refreshMs }) : undefined;
    return {
      marketId: m.id, marketTitle: m.title, venue: ref?.venue ?? null, venueMarketId: ref?.venueMarketId ?? null,
      marketBps: m.marketProbabilityBps, vixyBps: m.vixyProbabilityBps, confidenceBps: m.confidenceBps, reversalRiskBps: m.reversalRiskBps,
      modelVersion: m.provenance?.modelVersion ?? null, evidence: m.provenance?.inputs ?? [],
      rationale: read?.rationale ?? null, inputs: read?.inputs ?? null, dataAgeMs: read?.dataAgeMs ?? null,
      closesAt: m.closesAt, origin: 'LIVE', quotedAt: new Date(now).toISOString(),
      ...(lockGate ? { lockGate } : {}),
    };
  }

  /**
   * The venue's published outcome for a market, fetched fresh — never read off a
   * price and never remembered from a stale row. Null until the venue says so.
   * The canonical id encodes the venue and the venue market id (cm_<venue>_<id>).
   */
  async resolve(marketId: string): Promise<EngineResolution | null> {
    const mm = /^cm_(kalshi|polymarket)_(.+)$/.exec(marketId);
    if (!mm) return null;
    const venue = mm[1].toUpperCase() as 'KALSHI' | 'POLYMARKET';
    const adapter = this.adapters.find((a) => a.venue === venue);
    if (!adapter?.fetchMarket) return null;
    /* The canonical id strips unsafe characters; look the original venue id up in the last rows first. */
    const row = this.rows.find((r) => r.venue === venue && r.venueMarketId.replace(/[^A-Za-z0-9_-]/g, '') === mm[2]);
    const vm = await adapter.fetchMarket(row?.venueMarketId ?? mm[2]);
    if (!vm || vm.status !== 'SETTLED' || vm.result === null) return null;
    return { marketId, outcome: vm.result, source: `${venue === 'KALSHI' ? 'Kalshi' : 'Polymarket'} published result "${vm.result}" for ${vm.venueMarketId} (${vm.url})`, resolvedAt: vm.fetchedAt };
  }

  /** Arena Vision: the staged verification pipeline in vision.ts. Without a reader it stops at stage 1. */
  async scanMarket(_userId: string, input: ScanInput, onProgress?: (p: ScanProgress) => void): Promise<ScanResult> {
    if (this.last.size === 0) await this.refresh();
    return runVision({
      reader: this.reader,
      board: () => this.board(this.now()).markets,
      fetchVenue: async (m) => {
        const ref = m.venueRefs[0]; if (!ref) return null;
        const adapter = this.adapters.find((a) => a.venue === ref.venue);
        return adapter?.fetchMarket ? adapter.fetchMarket(ref.venueMarketId) : null;
      },
      now: this.now,
    }, input, onProgress);
  }
}
