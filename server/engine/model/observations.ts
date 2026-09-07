/* =============================================================
   OBSERVATION HISTORY — what the venues said, when.

   The Arena polls venues every ~30 s but kept no history. The model
   needs the recent path of each venue's price, so each refresh
   records one observation per venue market. Chronology is enforced
   at the door: an observation stamped in the future is refused
   (that is the only way look-ahead could enter), and observations
   are kept ascending. In-memory, bounded; the observations a lock
   was built on are frozen into the lock row, so a restart loses
   context but never the record.
   ============================================================= */
import type { Venue } from '../../../types/index.ts';
import type { VenueMarket } from '../venues/types.ts';

export interface Observation {
  /** Server clock at the venue read, ms. */
  at: number;
  venue: Venue;
  impliedBps: number;
  bidBps: number | null;
  askBps: number | null;
  spreadBps: number | null;
  liquidityUsd: number | null;
}

export class LookAheadError extends Error {}

export const keyFor = (venue: Venue, venueMarketId: string) => `${venue}:${venueMarketId}`;

export class ObservationHistory {
  private buffers = new Map<string, Observation[]>();
  private cap: number;
  constructor(cap = 80) { this.cap = cap; }

  /** Record one venue read. Refuses a future timestamp; ignores an exact duplicate timestamp. */
  record(vm: VenueMarket, now: number): boolean {
    if (vm.impliedBps === null) return false;
    /* Post-resolution prices (0/1 after settlement) are not observations of an open market; they would leak the outcome into drift. */
    if (vm.status !== 'OPEN') return false;
    const at = new Date(vm.fetchedAt).getTime();
    if (!Number.isFinite(at)) return false;
    if (at > now) throw new LookAheadError(`observation at ${vm.fetchedAt} is after now (${new Date(now).toISOString()}) — refused`);
    const k = keyFor(vm.venue, vm.venueMarketId);
    const buf = this.buffers.get(k) ?? [];
    const last = buf[buf.length - 1];
    if (last && at <= last.at) return false; /* not newer than what we have */
    buf.push({ at, venue: vm.venue, impliedBps: vm.impliedBps, bidBps: vm.bidBps, askBps: vm.askBps, spreadBps: vm.spreadBps, liquidityUsd: vm.liquidityUsd });
    if (buf.length > this.cap) buf.splice(0, buf.length - this.cap);
    this.buffers.set(k, buf);
    return true;
  }

  recordAll(rows: VenueMarket[], now: number): number { let n = 0; for (const r of rows) if (this.record(r, now)) n++; return n; }

  /** Observations at or before `now`, ascending. Never returns anything from the future. */
  get(venue: Venue, venueMarketId: string, now: number): Observation[] {
    return (this.buffers.get(keyFor(venue, venueMarketId)) ?? []).filter((o) => o.at <= now);
  }

  size(): number { return this.buffers.size; }
}
