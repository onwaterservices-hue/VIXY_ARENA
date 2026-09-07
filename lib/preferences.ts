/* =============================================================
   PREFERENCES — the only module allowed to touch localStorage
   -------------------------------------------------------------
   The architecture fixes the permitted keys. A new key requires
   editing this union, which requires review. Nothing
   authoritative is ever stored here: no entitlement, no points,
   no market state, no call record.
   ============================================================= */

export type PrefKey =
  | 'theme'
  | 'onboarding_dismissed'
  | 'selected_sport'
  | 'ui_prefs'
  | 'reduced_motion'
  | 'landing_seen'
  | 'welcome_dismissed';

export interface UiPrefs {
  density: 'COMFORTABLE' | 'COMPACT';
  holograms: boolean;
  motion: boolean;
  telemetryBar: boolean;
  intelRail: boolean;
  /** Market ids the person has starred. A view preference, not a position. */
  watchlist: string[];
  /** Whether the guided tour has been completed or skipped. */
  tourDone: boolean;
  /** Whether the Arena's plain-English orientation band is expanded. */
  orientation: boolean;
  /* ---- conviction callouts -------------------------------------
     The LOCKED graphic. Off, or on for calls whose market the engine
     grades at or above a confidence floor, at most one per quiet
     window. The floor and the window are display filters over values
     the engine already published — the client never grades anything. */
  lockCallouts: boolean;
  /** Engine confidence floor in bps; 0 shows every lock. */
  lockMinConfidenceBps: 0 | 6000 | 7000 | 8000 | 9000;
  /** Minimum minutes between two callouts; 0 means every lock. */
  lockQuietMinutes: 0 | 5 | 15 | 60;
}

export const DEFAULT_UI_PREFS: UiPrefs = {
  density: 'COMFORTABLE',
  holograms: true,
  motion: true,
  telemetryBar: true,
  intelRail: true,
  watchlist: [],
  tourDone: false,
  orientation: false,
  lockCallouts: true,
  lockMinConfidenceBps: 7000,
  lockQuietMinutes: 15,
};

const NS = 'vixy_arena:';

function read(key: PrefKey): string | null {
  try { return window.localStorage.getItem(NS + key); } catch { return null; }
}

function write(key: PrefKey, value: string): void {
  try { window.localStorage.setItem(NS + key, value); } catch { /* storage unavailable */ }
}

export function loadUiPrefs(): UiPrefs {
  const raw = read('ui_prefs');
  if (!raw) return DEFAULT_UI_PREFS;
  try {
    const parsed = JSON.parse(raw) as Partial<UiPrefs>;
    return { ...DEFAULT_UI_PREFS, ...parsed };
  } catch {
    return DEFAULT_UI_PREFS;
  }
}

export function saveUiPrefs(prefs: UiPrefs): void {
  write('ui_prefs', JSON.stringify(prefs));
}

/* Small persistent booleans. `landing_seen` is what makes the landing page
   a front door rather than a wall: it greets a first-time reader and then
   gets out of the way for every visit after. */
export type FlagKey = 'onboarding_dismissed' | 'landing_seen' | 'welcome_dismissed';

export function loadFlag(key: FlagKey): boolean {
  return read(key) === '1';
}

export function saveFlag(key: FlagKey, value: boolean): void {
  write(key, value ? '1' : '0');
}
