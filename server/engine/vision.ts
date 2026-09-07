/* =============================================================
   ARENA VISION — the verification boundary.

     screenshot → extraction → identification → venue verification
                → current market → model → verdict

   A screenshot is an INPUT. Nothing printed on it is market truth.
   The only reader in this file is an interface; without one the
   pipeline stops at stage 1 and says UNREADABLE. With one, a result
   is VERIFIED only when the venue itself, re-fetched now, confirms
   the identified market and the read is fresh. Every stage records
   what it did in the rationale so the answer can be audited.
   ============================================================= */
import type {
  CanonicalMarket, ScanCandidate, ScanEvidence, ScanExtraction, ScanInput, ScanProgress, ScanResult, ScanStage, ScanStatus, ScanVerdict,
} from '../../types/index.ts';
import type { VenueMarket } from './venues/types.ts';
import { envelope, feedStatus, normalizeQuestion } from './canonical.ts';

/** The one thing this repository does not contain: something that reads pixels. */
export interface VisionReader {
  readonly version: string;
  extract(input: ScanInput): Promise<ScanExtraction>;
}

export interface VisionDeps {
  reader: VisionReader | null;
  /** The current board (model applied if there is one). */
  board(): CanonicalMarket[];
  /** Fresh venue fetch for one canonical market, or null. */
  fetchVenue(m: CanonicalMarket): Promise<VenueMarket | null>;
  now(): number;
}

const STAGES: ScanStage[] = ['READING_IMAGE', 'IDENTIFYING_MARKET', 'MATCHING_VENUE', 'FETCHING_MARKET', 'BUILDING_FEATURES', 'RUNNING_BRAIN', 'CROSS_CHECKING', 'CALCULATING_EDGE', 'CALIBRATING_CONFIDENCE', 'FINALIZING'];
const MIN_LEGIBILITY_BPS = 4000;
const MIN_MATCH_BPS = 5000;
const AMBIGUITY_GAP_BPS = 1000;
const MAX_FRESH_MS = 60_000;

const emptyExtraction = (unreadable: string[]): ScanExtraction => ({ venue: null, title: null, outcome: null, printedProbabilityBps: null, closesAtText: null, category: null, legibilityBps: 0, unreadable });

/** Token-overlap score between the printed title and a market, bps. Deterministic and explainable. */
export function matchScore(title: string, m: CanonicalMarket, extractedVenue: ScanExtraction['venue']): { bps: number; reasons: string[] } {
  const a = new Set(normalizeQuestion(title).split(' ').filter((t) => t.length > 1));
  const text = `${m.title} ${m.subtitle ?? ''} ${m.matchup ? `${m.matchup.home.label} ${m.matchup.away.label}` : ''}`;
  const b = new Set(normalizeQuestion(text).split(' ').filter((t) => t.length > 1));
  if (!a.size || !b.size) return { bps: 0, reasons: [] };
  let hit = 0; for (const t of a) if (b.has(t)) hit++;
  const overlap = hit / a.size;
  const reasons = [`${hit}/${a.size} printed words appear in the market title`];
  let bps = Math.round(overlap * 9000);
  if (extractedVenue && m.venueRefs.some((v) => v.venue === extractedVenue)) { bps += 1000; reasons.push(`the screenshot looks like ${extractedVenue} and this market is listed there`); }
  return { bps: Math.min(10000, bps), reasons };
}

export async function runVision(deps: VisionDeps, input: ScanInput, onProgress?: (p: ScanProgress) => void): Promise<ScanResult> {
  const now = deps.now();
  const log: string[] = [];
  const step = (stage: ScanStage, note: string | null = null) => { onProgress?.({ stage, index: STAGES.indexOf(stage), total: STAGES.length, note }); log.push(`${stage}${note ? ` — ${note}` : ''}`); };
  const finish = (status: ScanStatus, verdict: ScanVerdict, extraction: ScanExtraction, extra: Partial<ScanResult> = {}, health = envelope(now, 0, 'UNKNOWN', {})): ScanResult => {
    step('FINALIZING', `${status} / ${verdict}`);
    return {
      id: `scan_${now.toString(36)}`, status, extraction, candidates: [], marketId: null, matchBps: null, verdict, evidence: [],
      rationale: log.join('\n'), origin: 'LIVE', scannedAt: new Date(now).toISOString(), health, ...extra,
    };
  };

  /* 1. Extraction. */
  if (!deps.reader) {
    step('READING_IMAGE', 'no image reader is connected to this engine');
    return finish('UNREADABLE', 'NOT_VERIFIED', emptyExtraction(['no image reader is connected to this engine']), { rationale: `${log.join('\n')}\nThe image (${input.fileName}, ${input.bytes} bytes) was received but this engine has no reader. Nothing was extracted and no market was matched.` });
  }
  let extraction: ScanExtraction;
  try { extraction = await deps.reader.extract(input); step('READING_IMAGE', `reader ${deps.reader.version}: legibility ${extraction.legibilityBps} bps`); }
  catch (e) { step('READING_IMAGE', `reader failed: ${e instanceof Error ? e.message : String(e)}`); return finish('UNREADABLE', 'NOT_VERIFIED', emptyExtraction(['reader failed'])); }
  if (extraction.legibilityBps < MIN_LEGIBILITY_BPS || !extraction.title) {
    step('IDENTIFYING_MARKET', 'not attempted: extraction too weak to match anything');
    return finish('UNREADABLE', 'NOT_VERIFIED', extraction);
  }

  /* 2. Identification against the current board. */
  const board = deps.board();
  let chosen: CanonicalMarket | null = null; let match: { bps: number; reasons: string[] } | null = null;
  if (input.chooseMarketId) {
    chosen = board.find((m) => m.id === input.chooseMarketId) ?? null;
    if (!chosen) { step('IDENTIFYING_MARKET', 'the chosen market is no longer on the board'); return finish('NO_MARKET_DETECTED', 'NOT_VERIFIED', extraction); }
    match = matchScore(extraction.title, chosen, extraction.venue); match.reasons.push('chosen by the user from a previous scan');
    step('IDENTIFYING_MARKET', `user chose ${chosen.id}`);
  } else {
    const scored = board.map((m) => ({ m, s: matchScore(extraction.title!, m, extraction.venue) })).filter((x) => x.s.bps >= MIN_MATCH_BPS).sort((x, y) => y.s.bps - x.s.bps);
    if (!scored.length) { step('IDENTIFYING_MARKET', `no market on the board scores ≥ ${MIN_MATCH_BPS} bps against "${extraction.title}"`); return finish('NO_MARKET_DETECTED', 'NOT_VERIFIED', extraction); }
    if (scored.length > 1 && scored[0].s.bps - scored[1].s.bps < AMBIGUITY_GAP_BPS) {
      step('IDENTIFYING_MARKET', `${scored.length} plausible markets within ${AMBIGUITY_GAP_BPS} bps — asking`);
      const candidates: ScanCandidate[] = scored.slice(0, 4).map(({ m, s }) => ({ marketId: m.id, title: m.title, venue: m.venueRefs[0]?.venue ?? 'KALSHI', category: m.category, matchBps: s.bps, reasons: s.reasons }));
      return finish('AMBIGUOUS', 'NOT_VERIFIED', extraction, { candidates });
    }
    chosen = scored[0].m; match = scored[0].s;
    step('IDENTIFYING_MARKET', `${chosen.id} at ${match.bps} bps`);
  }

  /* 3–4. Venue verification: the venue, asked now, must confirm the market and the read must be fresh. */
  step('MATCHING_VENUE', chosen.venueRefs.map((v) => `${v.venue}:${v.venueMarketId}`).join(', ') || 'no venue ref');
  let vm: VenueMarket | null = null;
  try { vm = await deps.fetchVenue(chosen); } catch (e) { step('FETCHING_MARKET', `venue fetch threw: ${e instanceof Error ? e.message : String(e)}`); }
  const evidence: ScanEvidence[] = [];
  const unverified = (why: string) => {
    step('FETCHING_MARKET', why);
    evidence.push({ label: 'Venue verification', stance: 'CAUTIONS', detail: why });
    return finish('UNVERIFIED', 'NOT_VERIFIED', extraction, { marketId: chosen!.id, matchBps: match!.bps, evidence }, chosen!.health);
  };
  if (!vm) return unverified('the venue did not return this market when asked just now');
  const age = now - new Date(vm.fetchedAt).getTime();
  if (age > MAX_FRESH_MS) return unverified(`the venue read is ${Math.round(age / 1000)}s old — not fresh enough to verify against`);
  if (vm.status !== 'OPEN') return unverified(`the venue reports the market as ${vm.status}`);
  if (vm.impliedBps === null) return unverified('the venue has no price for this market right now');
  step('FETCHING_MARKET', `${vm.venue} confirms ${vm.venueMarketId}: ${vm.impliedBps} bps, ${age}ms old`);
  evidence.push({ label: 'Venue verification', stance: 'SUPPORTS', detail: `${vm.venue} confirmed the market just now at ${(vm.impliedBps / 100).toFixed(1)}%` });
  if (extraction.printedProbabilityBps !== null) {
    const diff = Math.abs(extraction.printedProbabilityBps - vm.impliedBps);
    evidence.push({ label: 'Printed vs live price', stance: diff > 300 ? 'CAUTIONS' : 'NEUTRAL', detail: diff > 300 ? `the screenshot shows ${(extraction.printedProbabilityBps / 100).toFixed(1)}% but the venue is at ${(vm.impliedBps / 100).toFixed(1)}% — the image is stale or from a different market` : 'the printed probability agrees with the venue' });
  }
  const health = envelope(now, age, feedStatus(vm.fetchedAt, now, false), { [vm.venue.toLowerCase()]: feedStatus(vm.fetchedAt, now, false) });

  /* 5–9. The same brain, or the honest absence of one. */
  step('BUILDING_FEATURES'); step('RUNNING_BRAIN', chosen.provenance ? `model ${chosen.provenance.modelVersion}` : 'no model connected');
  step('CROSS_CHECKING'); step('CALCULATING_EDGE', chosen.edgeBps === null ? 'no VIXY probability → no edge' : `${chosen.edgeBps} bps`); step('CALIBRATING_CONFIDENCE', chosen.confidenceBps === null ? '—' : `${chosen.confidenceBps} bps`);
  let verdict: ScanVerdict = 'INSUFFICIENT_DATA';
  if (chosen.vixyProbabilityBps !== null && chosen.edgeBps !== null) {
    const e = chosen.edgeBps; const conf = chosen.confidenceBps ?? 0;
    verdict = e >= 800 && conf >= 6000 ? 'STRONG_EDGE' : e >= 300 ? 'POSITIVE_EDGE' : e <= -300 ? 'NEGATIVE_EDGE' : Math.abs(e) < 100 ? 'NO_EDGE' : 'WATCH';
    evidence.push({ label: 'VIXY read', stance: e >= 300 ? 'SUPPORTS' : e <= -300 ? 'CAUTIONS' : 'NEUTRAL', detail: `VIXY ${(chosen.vixyProbabilityBps / 100).toFixed(1)}% vs venue ${(vm.impliedBps / 100).toFixed(1)}% (${chosen.provenance?.modelVersion ?? 'model'})` });
  } else {
    evidence.push({ label: 'VIXY read', stance: 'NEUTRAL', detail: 'no model is connected; the market is verified but there is no VIXY probability to compare' });
  }
  return finish('VERIFIED', verdict, extraction, { marketId: chosen.id, matchBps: match.bps, evidence }, health);
}
