import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ArenaSnapshot, CallIntent, CallRecord, ScanInput, ScanProgress, ScanResult,
} from '../types';
import { resolveDataSource, fetchPublicBoard, DEMO_MODE } from '../services/api';
import type { PublicBoard } from '../types';
import { publicBoardFrom } from '../lib/publicBoard';
import { resolveBillingSource } from '../services/billing';
import { resolveAccountSource } from '../services/account';
import { resolveAuthSource } from '../services/auth';
import { EMPTY_ACCESS } from '../services/auth/AuthSource';
import type { AuthCredentials, AuthState } from '../types';
import type { AccountState, BillingState } from '../types';
import { usePrefs } from '../components/common/prefs-context';

/* ---- data ---------------------------------------------------
   The only place the application talks to a data source.       */
export function useArena(enabled: boolean = true) {
  const source = useMemo(() => resolveDataSource(), []);
  const [snapshot, setSnapshot] = useState<ArenaSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* The engine is asked for nothing until the server has graded the reader
     OPEN. Asking earlier would only earn a 401/403 — and the interface must
     never show "data source unavailable" for what is really a locked door. */
  useEffect(() => {
    if (!enabled) { setSnapshot(null); setError(null); return; }
    let alive = true;
    source
      .load()
      .then((s) => { if (alive) { setSnapshot(s); setError(null); } })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    const unsubscribe = source.subscribe((s) => { if (alive) setSnapshot(s); });
    return () => { alive = false; unsubscribe(); };
  }, [source, enabled]);

  /* After the server writes a lock, ask it for the board again: the record the
     screen shows is the one the ledger holds, not the one the client assumed. */
  const placeCall = useCallback(
    async (intent: CallIntent): Promise<CallRecord> => {
      const rec = await source.placeCall(intent);
      source.load().then((s) => setSnapshot(s)).catch(() => { /* the next stream frame carries it */ });
      return rec;
    },
    [source],
  );

  /* The scanner reaches the engine through the same object as every other
     surface. There is no second client and no second model behind it. */
  const scanMarket = useCallback(
    (input: ScanInput, onProgress?: (p: ScanProgress) => void): Promise<ScanResult> =>
      source.scanMarket(input, onProgress),
    [source],
  );

  return {
    /* The snapshot's own origin wins: a server-hosted simulator reports DEMO
       through the same field a real engine would report LIVE. */
    snapshot, error, origin: snapshot?.health.origin ?? source.origin, sourceLabel: source.label,
    placeCall, scanMarket,
  };
}

/* ---- the public board ---------------------------------------
   What the landing page shows outside the door. Demo builds derive it from
   the demo snapshot (nothing to redact — it is all labeled simulation);
   production builds ask the server, which redacts. */
export function usePublicBoard(snapshot: ArenaSnapshot | null, enabled: boolean): PublicBoard | null {
  const [remote, setRemote] = useState<PublicBoard | null>(null);
  useEffect(() => {
    if (!enabled || snapshot || DEMO_MODE) return;
    let alive = true;
    const load = () => fetchPublicBoard().then((b) => { if (alive) setRemote(b); }).catch(() => { /* the page renders without figures */ });
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [enabled, snapshot]);
  return useMemo(() => (snapshot ? publicBoardFrom(snapshot, { featured: true, redact: false }) : remote), [snapshot, remote]);
}

/* ---- billing ------------------------------------------------
   Access state is fetched, never assumed. While a configured backend
   is answering, the screen shows LOADING; if it fails, UNAVAILABLE.
   Neither case is allowed to fall back to a hardcoded plan list.   */
export function useBilling() {
  const source = useMemo(() => resolveBillingSource(), []);
  const [state, setState] = useState<BillingState>(() => ({
    status: 'LOADING', plans: [], entitlement: null,
    paymentMethod: null, invoices: [],
    actions: { upgrade: false, downgrade: false, cancel: false, portal: false },
    message: null, origin: 'NONE',
  }));

  useEffect(() => {
    let alive = true;
    source
      .load()
      .then((s) => { if (alive) setState(s); })
      .catch((e: unknown) => {
        if (!alive) return;
        setState({
          status: 'UNAVAILABLE', plans: [], entitlement: null,
          paymentMethod: null, invoices: [],
          actions: { upgrade: false, downgrade: false, cancel: false, portal: false },
          message: String(e instanceof Error ? e.message : e), origin: 'NONE',
        });
      });
    return () => { alive = false; };
  }, [source]);

  return { billing: state, sourceLabel: source.label };
}

/* ---- account ------------------------------------------------
   Identity is fetched, never assumed. A profile page that renders a
   person before the account system has answered is a profile page
   showing someone who may not exist.                              */
export function useAccount() {
  const source = useMemo(() => resolveAccountSource(), []);
  const [state, setState] = useState<AccountState>(() => ({
    status: 'LOADING', profile: null, referral: null, message: null,
    actions: { changeHandle: false, connect: false, signOut: false }, origin: 'NONE',
  }));

  useEffect(() => {
    let alive = true;
    const reload = () => source
      .load()
      .then((s) => { if (alive) setState(s); })
      .catch((e: unknown) => {
        if (!alive) return;
        setState({
          status: 'UNAVAILABLE', profile: null, referral: null,
          message: String(e instanceof Error ? e.message : e),
          actions: { changeHandle: false, connect: false, signOut: false }, origin: 'NONE',
        });
      });
    reload();
    /* The profile follows the session: sign in or out and it re-reads. */
    const off = resolveAuthSource().subscribe(() => { reload(); });
    return () => { alive = false; off(); };
  }, [source]);

  return { account: state, sourceLabel: source.label };
}


/* ---- auth ---------------------------------------------------
   The door. One object, read at start and on every change, so the
   gate in App and the stepper on the lock screen never disagree
   about which step the reader is on.                              */
const AUTH_NO_ACTIONS = { signUp: false, signIn: false, signOut: false, markDiscordJoined: false, previewUnlock: false };
export function useAuth() {
  const source = useMemo(() => resolveAuthSource(), []);
  const [state, setState] = useState<AuthState>(() => ({
    status: 'LOADING', session: null, access: { ...EMPTY_ACCESS },
    actions: { ...AUTH_NO_ACTIONS }, message: null, origin: 'NONE',
  }));

  useEffect(() => {
    let alive = true;
    const fail = (e: unknown) => {
      if (!alive) return;
      setState({
        /* Not OPEN. An unanswered check is not a yes; the App renders the
           "can't verify" state and draws nothing behind the door. */
        status: 'UNAVAILABLE', session: null, access: { ...EMPTY_ACCESS },
        actions: { ...AUTH_NO_ACTIONS },
        message: String(e instanceof Error ? e.message : e), origin: 'NONE',
      });
    };
    source.load().then((s) => { if (alive) setState(s); }).catch(fail);
    const off = source.subscribe((s) => { if (alive) setState(s); });
    return () => { alive = false; off(); };
  }, [source]);

  const run = useCallback(async (p: Promise<AuthState>) => { const s = await p; setState(s); return s; }, []);

  return {
    auth: state,
    sourceLabel: source.label,
    signUp: useCallback((i: AuthCredentials & { handle: string }) => run(source.signUp(i)), [source, run]),
    signIn: useCallback((i: AuthCredentials) => run(source.signIn(i)), [source, run]),
    signOut: useCallback(() => run(source.signOut()), [source, run]),
    markDiscordJoined: useCallback(() => run(source.markDiscordJoined()), [source, run]),
    requestPasswordReset: useCallback((email: string) => source.requestPasswordReset(email), [source]),
    resetPassword: useCallback((i: { token: string; password: string }) => run(source.resetPassword(i)), [source, run]),
    previewUnlock: useCallback(() => source.previewUnlock ? run(source.previewUnlock()) : Promise.reject(new Error('Not available')), [source, run]),
  };
}

/* ---- global key handler ------------------------------------ */
export function useHotkey(combo: (e: KeyboardEvent) => boolean, handler: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (combo(e)) { e.preventDefault(); handler(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combo, handler]);
}

/* ---- routing ------------------------------------------------
   Hash routing keeps the shell dependency-free and deep-linkable. */
export function useRoute(fallback: string) {
  const read = () => (window.location.hash.replace(/^#\/?/, '') || fallback);
  const [path, setPath] = useState(read);
  useEffect(() => {
    const onHash = () => setPath(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const navigate = useCallback((next: string) => { window.location.hash = `/${next}`; }, []);

  /* A path is a route id plus segments: `markets` is one destination,
     `sector/sports` is another. Splitting here rather than in every screen
     keeps the route table flat while letting a hub own its own sub-pages. */
  const [route, ...params] = path.split('/').filter(Boolean);
  return [route ?? fallback, navigate, params, path] as const;
}

/* ---- motion preference -------------------------------------
   Two sources, one answer. The OS setting is authoritative and can never
   be overridden upward; the in-product Motion switch can only ever turn
   motion further down. Everything that animates — CSS and canvas alike —
   asks this one hook, so the switch in Settings actually stops the
   animation loops rather than only muting the CSS.                      */
export function useReducedMotion(): boolean {
  const [osReduced, setOsReduced] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setOsReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const { prefs } = usePrefs();
  return osReduced || prefs.motion === false;
}

/* ---- media query ------------------------------------------- */
export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    setMatch(mq.matches);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

/* ---- canvas animation loop ---------------------------------
   Pauses when the tab is hidden or the element is off-screen,
   and never runs at all under prefers-reduced-motion.          */
export function useCanvasScene(
  draw: (ctx: CanvasRenderingContext2D, t: number, w: number, h: number) => void,
  deps: unknown[] = [],
) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const reduced = useReducedMotion();
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let visible = true;
    let w = 0, h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const nextW = Math.max(1, Math.floor(r.width));
      const nextH = Math.max(1, Math.floor(r.height));
      if (nextW === w && nextH === h) return;
      w = nextW;
      h = nextH;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Under reduced motion nothing else will ever repaint, so the single
      // static frame has to be drawn again whenever the box changes — a late
      // layout must not leave an empty canvas behind.
      if (reduced) {
        ctx.clearRect(0, 0, w, h);
        drawRef.current(ctx, 0, w, h);
      }
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 });
    io.observe(canvas);

    const start = performance.now();
    let lastPaint = 0;

    const paint = (nowMs: number) => {
      ctx.clearRect(0, 0, w, h);
      drawRef.current(ctx, Math.max(0, (nowMs - start) / 1000), w, h);
      lastPaint = nowMs;
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      paint(now);
    };

    if (reduced) {
      paint(start);
      // one more pass after layout settles, for elements measured at 0 first
      const settle = setTimeout(() => { resize(); paint(start); }, 240);
      return () => { clearTimeout(settle); ro.disconnect(); io.disconnect(); };
    }

    // Paint one frame immediately: embedded previews and background tabs can
    // throttle requestAnimationFrame to nothing, and an empty canvas is worse
    // than a still one.
    paint(performance.now());
    raf = requestAnimationFrame(frame);

    // Watchdog: if rAF has not delivered a frame for a second while the
    // element is on screen, drive the scene from a timer instead.
    const watchdog = setInterval(() => {
      if (!visible || document.hidden) return;
      const now = performance.now();
      if (now - lastPaint > 1000) paint(now);
    }, 1000);

    return () => { clearInterval(watchdog); cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, ...deps]);

  return ref;
}

/* ---- pointer sheen ----------------------------------------- */
export function useSheen<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const onMove = useCallback((e: React.PointerEvent<T>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  }, []);
  return { ref, onPointerMove: onMove };
}

/* ---- focus trap ---------------------------------------------
   Overlays keep the keyboard inside themselves and hand focus
   back to whatever opened them. Required for a dialog to be
   usable without a mouse.                                      */
export function useFocusTrap<T extends HTMLElement>(active = true) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const previous = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(
        el.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((n) => n.offsetParent !== null);

    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) return;
      const index = list.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && index <= 0) { e.preventDefault(); list[list.length - 1].focus(); }
      else if (!e.shiftKey && index === list.length - 1) { e.preventDefault(); list[0].focus(); }
    };

    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [active]);
  return ref;
}

/* ---- element size ------------------------------------------ */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setSize({ width: Math.round(r.width), height: Math.round(r.height) });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setSize({ width: Math.round(r.width), height: Math.round(r.height) });
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/* ---- ticking clock ----------------------------------------- */
export function useClock(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
