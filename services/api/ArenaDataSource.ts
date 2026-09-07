/* =============================================================
   THE DATA CONTRACT
   -------------------------------------------------------------
   Every screen in VIXY ARENA reads through this interface and
   nothing else. Swapping the demo provider for the real engine
   is a one-line change in services/api/index.ts — no component
   is aware of where its data came from.

   Rules enforced by this boundary:
   - components receive data via props/state, never fetch;
   - no business rule (edge, settlement, points, liveness) is
     ever computed in the UI layer;
   - liveness arrives as a server-computed field.
   ============================================================= */

import type {
  ArenaSnapshot, CallIntent, CallRecord, ScanInput, ScanProgress, ScanResult,
} from '../../types';
import { apiFetch } from '../httpClient';

export interface ArenaDataSource {
  /** Human label shown in the UI so the origin is never ambiguous. */
  readonly label: string;
  readonly origin: 'DEMO' | 'LIVE';
  /** Resolve the initial snapshot. */
  load(): Promise<ArenaSnapshot>;
  /**
   * Continuous updates. In production this is an SSE stream from
   * /api/stream carrying the health envelope on every message.
   */
  subscribe(onSnapshot: (snapshot: ArenaSnapshot) => void): () => void;
  /**
   * Submit a call. The client proposes; the server decides. The returned
   * record — including the entry price it was actually written at — is the
   * only truth. The UI must render what comes back, never what it hoped for.
   */
  placeCall(intent: CallIntent): Promise<CallRecord>;
  /**
   * Scan a market from a screenshot.
   *
   * This lives HERE, on the same interface as everything else, on
   * purpose. The scanner is not a separate feature with its own model
   * behind it — it is another doorway into the same engine, and putting
   * it on this contract is what makes that structurally true rather
   * than merely claimed. A component cannot reach a different brain
   * because a component cannot reach anything but this object.
   *
   * The image is an input. What comes back is the engine's read of the
   * CANONICAL market it matched, or an honest statement that it could
   * not match one.
   *
   * `onProgress` reports the stages as they actually complete. It is
   * not a timer: if the work finishes quickly the stages arrive quickly.
   */
  scanMarket(input: ScanInput, onProgress?: (p: ScanProgress) => void): Promise<ScanResult>;
}

/** The real client of the engine API (server/). Origin is whatever the server's
    snapshot says it is — a server-hosted simulator reports DEMO and the badge
    follows; a real engine reports LIVE. The client never decides. */
export class LiveEngineDataSource implements ArenaDataSource {
  readonly label = 'VIXY ENGINE';
  origin: 'DEMO' | 'LIVE' = 'LIVE';
  private readonly baseUrl: string;
  constructor(baseUrl: string) { this.baseUrl = baseUrl; }

  async load(): Promise<ArenaSnapshot> {
    const s = await apiFetch<ArenaSnapshot>(this.baseUrl, '/api/snapshot');
    this.origin = s.health.origin;
    return s;
  }

  subscribe(onSnapshot: (snapshot: ArenaSnapshot) => void): () => void {
    if (typeof EventSource === 'undefined') return () => {};
    const es = new EventSource(`${this.baseUrl}/api/stream`, { withCredentials: true });
    es.onmessage = (ev) => {
      try { const s = JSON.parse(ev.data) as ArenaSnapshot; this.origin = s.health.origin; onSnapshot(s); } catch { /* skip a bad frame */ }
    };
    /* On error EventSource retries by itself; a 401/403 closes it for good and
       the auth heartbeat will drop the reader to the door. */
    return () => es.close();
  }

  placeCall(intent: CallIntent): Promise<CallRecord> {
    return apiFetch<CallRecord>(this.baseUrl, '/api/calls', { method: 'POST', body: intent });
  }

  async scanMarket(input: ScanInput, onProgress?: (p: ScanProgress) => void): Promise<ScanResult> {
    /* The only stage this client can truthfully report is the upload; the
       server owns the rest and its result says how far it got. */
    onProgress?.({ stage: 'READING_IMAGE', index: 0, total: 10, note: null });
    const result = await apiFetch<ScanResult>(this.baseUrl, '/api/scan', { method: 'POST', body: input });
    onProgress?.({ stage: 'FINALIZING', index: 9, total: 10, note: null });
    return result;
  }
}
