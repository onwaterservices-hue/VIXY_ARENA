import React, { useCallback, useMemo, useState } from 'react';
import { useArena, useAuth, useBilling, usePublicBoard, useClock, useHotkey, useMedia, useRoute } from './hooks';
import { DEFAULT_ROUTE, ROUTE_MAP } from './constants';
import { DEMO_MODE } from './services/api';
import { clockUTC } from './lib/format';
import type { CallRecord, Direction, ScanInput, ScanProgress } from './types';

import { Atmosphere } from './components/holographic/Atmosphere';
import { CommandBar, TelemetryBar } from './components/navigation/CommandBar';
import { MobileNav, MoreSheet, NavRail } from './components/navigation/NavRail';
import { MatchCenterScreen } from './components/broadcast/MatchCenterScreen';
import { LockCallout } from './components/broadcast/LockCallout';
import { ScanMarket } from './components/scan/ScanMarket';
import { LandingScreen } from './components/landing/LandingScreen';
import { ScreenIntro } from './components/common/ScreenIntro';
import { Orientation } from './components/common/Orientation';
import { WelcomeCard } from './components/common/WelcomeCard';
import { SlateStrip } from './components/daily/SlateStrip';
import { CompareBoard } from './components/compare/CompareBoard';
import { IntelPanel } from './components/arena/IntelPanel';
import { ArenaUIContext, OriginContext, type ArenaUI } from './components/common/ui-context';
import { MarketDetail } from './components/detail/MarketDetail';
import { CallTicket } from './components/detail/CallTicket';
import { ShareCard } from './components/detail/ShareCard';
import { Toasts, type Toast } from './components/common/Toasts';
import { CommandPalette } from './components/common/CommandPalette';
import { BootSequence } from './components/common/BootSequence';
import { NotificationCenter } from './components/common/NotificationCenter';
import { Shortcuts } from './components/common/Shortcuts';
import { SourceBanner } from './components/common/SourceBanner';
import { Tour } from './components/common/Tour';
import { BroadcastMode } from './components/broadcast/BroadcastMode';
import { PrefsContext } from './components/common/prefs-context';
import { DEFAULT_UI_PREFS, loadFlag, loadUiPrefs, saveFlag, saveUiPrefs, type UiPrefs } from './lib/preferences';

import { ArenaHome } from './components/arena/ArenaHome';
import { LiveScreen } from './components/arena/LiveScreen';
import { MarketsScreen } from './components/markets/MarketsScreen';
import { SignalsScreen } from './components/signals/SignalsScreen';
import { PortfolioScreen } from './components/portfolio/PortfolioScreen';
import { HistoryScreen } from './components/history/HistoryScreen';
import { LeaderboardScreen } from './components/leaderboard/LeaderboardScreen';
import { BrainScreen } from './components/brain/BrainScreen';
import { NeuralScreen } from './components/neural/NeuralScreen';
import { TelemetryScreen } from './components/telemetry/TelemetryScreen';
import { AdminScreen } from './components/admin/AdminScreen';
import { SettingsScreen } from './components/settings/SettingsScreen';
import { HelpScreen } from './components/settings/HelpScreen';
import { AccessScreen } from './components/access/AccessScreen';
import { TerminalLock } from './components/gate/TerminalLock';
import { AuthScreen } from './components/auth/AuthScreen';
import { ResetScreen } from './components/auth/ResetScreen';
import { VisionScreen } from './components/vision/VisionScreen';
import { CrossMarketScreen } from './components/cross/CrossMarketScreen';
import { ProfileScreen } from './components/profile/ProfileScreen';
import { UpNextScreen } from './components/upnext/UpNextScreen';
import { DailyScreen } from './components/daily/DailyScreen';
import { SectorScreen } from './components/sector/SectorScreen';
import { WatchlistScreen } from './components/watchlist/WatchlistScreen';
import { AlertsScreen } from './components/alerts/AlertsScreen';
import { PredictionCore } from './components/holographic/PredictionCore';

const INTEL_ROUTES = new Set(['arena', 'live', 'markets', 'signals', 'sector']);

/* ---- THE FRONT DOOR -----------------------------------------
   A first-time reader arrives at the landing page; everyone else
   arrives in the Arena. The decision is made here, at module
   scope, before React renders anything — so the first paint is
   already the right screen rather than a flash of the Arena with
   the landing page dropped on top of it a frame later.

   An explicit hash always wins: a shared link to #/markets opens
   markets, first visit or not.                                  */
if (typeof window !== 'undefined' && !window.location.hash && !loadFlag('landing_seen')) {
  window.location.hash = '/landing';
}

export default function App() {
  const { auth, sourceLabel: authLabel, signUp, signIn, markDiscordJoined, previewUnlock, requestPasswordReset, resetPassword } = useAuth();
  /* The engine is consulted only once the server says OPEN (see the gate below). */
  const { snapshot, error, origin, sourceLabel, placeCall, scanMarket } = useArena(DEMO_MODE || (auth.status === 'READY' && auth.access.stage === 'OPEN'));
  const { billing } = useBilling();
  const [route, navigate, params, path] = useRoute(DEFAULT_ROUTE);
  /* Outside the door the page still needs coverage and the engine's state; the
     server publishes those redacted. Inside, the real snapshot supersedes it. */
  const board = usePublicBoard(snapshot, route === 'landing' || auth.status !== 'READY' || auth.access.stage !== 'OPEN');
  const now = useClock(1000);
  const isMobile = useMedia('(max-width: 860px)');
  const isNarrow = useMedia('(max-width: 1440px)');

  const [moreOpen, setMoreOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<{ marketId: string; direction: Direction } | null>(null);
  const [compareIds, setCompareIds] = useState<string[] | null>(null);
  const [lockCall, setLockCall] = useState<CallRecord | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [receipt, setReceipt] = useState<CallRecord | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [prefs, setPrefs] = useState<UiPrefs>(DEFAULT_UI_PREFS);
  const [booting, setBooting] = useState(true);
  const [seenBoot, setSeenBoot] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [broadcast, setBroadcast] = useState(false);
  const [welcomeDone, setWelcomeDone] = useState(true);

  React.useEffect(() => {
    setPrefs(loadUiPrefs());
    setSeenBoot(loadFlag('onboarding_dismissed'));
    setWelcomeDone(loadFlag('welcome_dismissed'));
  }, []);

  const setPref = useCallback(<K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) => {
    setPrefs((p) => {
      const next = { ...p, [key]: value };
      saveUiPrefs(next);
      return next;
    });
  }, []);

  const notify = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((t) => [...t, { id, message, tone }].slice(-2));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }, []);

  const ui: ArenaUI = useMemo(() => ({
    openMarket: (id) => setDetailId(id),
    openCall: (id, direction = 'YES') => { setDetailId(null); setTicket({ marketId: id, direction }); },
    openCompare: (marketIds) => setCompareIds(marketIds.slice(0, 4)),
    openScan: () => setScanOpen(true),
    navigate,
    notify,
  }), [navigate, notify]);

  useHotkey(
    useCallback((e: KeyboardEvent) => (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k', []),
    useCallback(() => setPaletteOpen((v) => !v && !lockedRef.current), []),
  );

  /* The hotkey listener binds once; it reads the latest snapshot through
     a ref rather than re-subscribing on every tick. */
  const snapshotRef = React.useRef(snapshot);
  React.useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);

  /* g-prefixed jumps, terminal style. Ignored while typing. */
  React.useEffect(() => {
    let armed = false;
    let timer: ReturnType<typeof setTimeout>;
    const jumps: Record<string, string> = {
      a: 'arena', l: 'live', m: 'markets', s: 'signals', c: 'match',
      p: 'portfolio', b: 'brain', n: 'neural', t: 'telemetry', h: 'history', u: 'upnext', d: 'daily', v: 'vision',
    };
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') { e.preventDefault(); setShortcutsOpen(true); return; }
      /* Overlays that show market numbers do not open while the gate is engaged. */
      if (lockedRef.current && e.shiftKey && ['b', 's', 'c'].includes(e.key.toLowerCase())) { e.preventDefault(); return; }
      if (e.key.toLowerCase() === 'b' && e.shiftKey) { e.preventDefault(); setBroadcast((v) => !v); return; }
      if (e.key.toLowerCase() === 's' && e.shiftKey) { e.preventDefault(); setScanOpen((v) => !v); return; }
      /* Compare with no selection opens the three highest-ranked
         opportunities, which is what the shortcut is for. */
      if (e.key.toLowerCase() === 'c' && e.shiftKey) {
        e.preventDefault();
        setCompareIds((cur) => {
          if (cur) return null;
          /* a board needs at least two columns; with fewer ranked
             opportunities the shortcut does nothing rather than opening
             an empty overlay the next press would have to undo */
          const ids = snapshotRef.current?.opportunities.slice(0, 3).map((o) => o.marketId) ?? [];
          return ids.length > 1 ? ids : null;
        });
        return;
      }
      if (e.key === 'Escape') {
        setShortcutsOpen(false); setNotifOpen(false); setPaletteOpen(false);
        setReceipt(null); setTicket(null); setDetailId(null); setBroadcast(false);
        setCompareIds(null); setScanOpen(false); setLockCall(null);
        return;
      }
      if (e.key.toLowerCase() === 'g') { armed = true; clearTimeout(timer); timer = setTimeout(() => { armed = false; }, 1200); return; }
      if (armed) {
        const target = jumps[e.key.toLowerCase()];
        armed = false;
        if (target) { e.preventDefault(); navigate(target); }
      }
    };
    const onBroadcast = () => setBroadcast(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('vixy:broadcast', onBroadcast);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('vixy:broadcast', onBroadcast);
      clearTimeout(timer);
    };
  }, [navigate]);

  /* True while the reader is inside a modal surface. Read through a ref so
     the announcement effect does not re-subscribe every time one opens. */
  const lockedRef = React.useRef(false);
  const prefsRef = React.useRef(prefs);
  prefsRef.current = prefs;
  const lastCalloutRef = React.useRef(0);
  const busyRef = React.useRef(false);
  const busy = scanOpen || compareIds !== null || broadcast
    || ticket !== null || receipt !== null || tourOpen || paletteOpen
    || detailId !== null || moreOpen || route === 'vision';
  busyRef.current = busy;

  /* A lock that arrived while the reader was elsewhere is dropped rather than
     held: replaying it minutes later, out of context, would be worse than the
     toast that already announced it. */
  React.useEffect(() => { if (busy) setLockCall(null); }, [busy]);

  /* Announce lifecycle transitions the engine reports. The client is told;
     it never decides. */
  const seenCallStates = React.useRef<Map<string, string>>(new Map());
  React.useEffect(() => {
    if (!snapshot) return;
    /* Call toasts belong to a reader inside the terminal. On the public landing they are noise over the product. */
    if (route === 'landing') return;
    const first = seenCallStates.current.size === 0;
    for (const c of snapshot.calls) {
      const prev = seenCallStates.current.get(c.id);
      seenCallStates.current.set(c.id, `${c.state}:${c.result ?? ''}`);
      if (first || prev === undefined) continue;
      const next = `${c.state}:${c.result ?? ''}`;
      if (prev === next) continue;
      if (c.state === 'LOCKED') {
        notify(`Locked · ${c.market}`, 'info');
        /* The official call gets the arena's full attention for a beat —
           but not while the reader is inside a surface of their own, and
           only for the calls the reader asked to see: the callout setting
           can be off, floored on the engine's confidence for that market,
           and rate-limited. The toast still records every lock. */
        const p = prefsRef.current;
        const conf = snapshot.markets.find((m) => m.id === c.marketId)?.confidenceBps ?? null;
        const passesFloor = p.lockMinConfidenceBps === 0 || (conf !== null && conf >= p.lockMinConfidenceBps);
        const quiet = p.lockQuietMinutes * 60_000;
        const passesQuiet = quiet === 0 || Date.now() - lastCalloutRef.current >= quiet;
        if (p.lockCallouts && passesFloor && passesQuiet && !busyRef.current) {
          lastCalloutRef.current = Date.now();
          setLockCall((cur) => cur ?? c);
        }
      }
      if (c.state === 'SETTLED') {
        notify(`Settled ${c.result} · ${c.market}`, c.result === 'WON' ? 'good' : 'warn');
      }
    }
  }, [snapshot, notify, route]);

  const clock = useMemo(() => clockUTC(new Date(now)), [now]);
  /* ---- THE ACCESS GATE --------------------------------------
     One decision, made by one party. The auth source reports the
     reader's `access.stage`; the server that backs it has already
     folded payment (billing) and Discord membership into that stage.
     The client renders it and never computes it.

     FAIL CLOSED. If the source has not answered (LOADING), could not
     answer (UNAVAILABLE) or does not exist in this build
     (NOT_CONFIGURED), the terminal is NOT rendered. The interface does
     not refuse anyone — it simply has nothing it was told it may show.
     The server is the layer that refuses; see AccessUnverified.

     `billing` is informational (the Access page reads it). It is no
     longer part of the gate: an unreachable billing backend used to
     count as "entitled", which is the client deciding a business rule.

     `#/locked` renders the lock screen on demand so the state is
     reachable and reviewable without pretending anyone is locked out. */
  const authVerified = auth.status === 'READY';
  const stageOpen = authVerified && auth.access.stage === 'OPEN';
  const needsAccount = authVerified && !auth.session;
  const lockedByGate = !stageOpen;
  lockedRef.current = lockedByGate;

  const showIntel = !isMobile && !isNarrow && prefs.intelRail && INTEL_ROUTES.has(route) && !lockedByGate;
  const showTelemetry = !isMobile && prefs.telemetryBar;
  const isLanding = route === 'landing';
  const isAuth = route === 'auth';
  /* A destination may be a bare id (`markets`) or an id with segments
     (`sector/sports`). The full path wins when the route table names it, so
     navigation highlights the exact hub the reader is on. */
  const known = ROUTE_MAP[path] ? path : ROUTE_MAP[route] ? route : DEFAULT_ROUTE;

  /* Offer the tour once the boot screen is out of the way, and only if the
     stored preference says it has not been seen. */
  React.useEffect(() => {
    if (booting || prefs.tourDone || isLanding || known !== 'arena') return;
    const id = setTimeout(() => setTourOpen(true), 650);
    return () => clearTimeout(id);
  }, [booting, prefs.tourDone, known, isLanding]);



  const detailMarket = snapshot?.markets.find((m) => m.id === detailId) ?? null;
  const ticketMarket = snapshot?.markets.find((m) => m.id === ticket?.marketId) ?? null;

  /* Entering the Arena is a one-way door for the default route only: the
     landing page stays reachable at #/landing forever, and from the Help
     screen, because a product should never hide its own explanation. */
  const enterArena = useCallback(() => {
    saveFlag('landing_seen', true);
    navigate(auth.session ? DEFAULT_ROUTE : 'auth');
  }, [navigate, auth.session]);


  const screen = () => {
    /* When the gate is engaged the terminal renders the lock everywhere except
       the screens a locked reader still needs: access, help and settings.
       Hiding those would trap someone who is trying to pay. There is no snapshot
       behind the door in production — the server refuses it — so these screens
       take a nullable snapshot. `#/locked` renders the lock on demand. */
    const lock = (
      <TerminalLock snapshot={snapshot} billing={billing} auth={auth}
                    onManage={() => navigate(auth.session ? 'access' : 'auth')}
                    onLearnMore={() => navigate('help')}
                    onDiscordJoined={markDiscordJoined}
                    onPreviewUnlock={previewUnlock}
                    onEnter={() => navigate(DEFAULT_ROUTE)} />
    );
    if (route === 'locked') return lock;
    if (lockedByGate) {
      switch (known.split('/')[0]) {
        case 'access':   return <AccessScreen />;
        case 'help':     return <HelpScreen snapshot={snapshot} />;
        case 'settings': return <SettingsScreen snapshot={snapshot} origin={origin} sourceLabel={sourceLabel} />;
        default:         return lock;
      }
    }
    if (error) {
      return (
        <div className="boot col center g4">
          <span className="t-label">Data source unavailable</span>
          <p className="t-small" style={{ maxWidth: 420, textAlign: 'center' }}>{error}</p>
          <button className="btn btn-sm tap" onClick={() => window.location.reload()}>Try again</button>
        </div>
      );
    }
    if (!snapshot) {
      return (
        <div className="boot col center g4">
          <PredictionCore state="OBSERVING" size={220} />
          <span className="t-label">Resolving data source</span>
          <div className="boot-bar"><i /></div>
        </div>
      );
    }
    switch (known.split('/')[0]) {
      case 'arena':       return <ArenaHome snapshot={snapshot} now={now} onNavigate={navigate} />;
      case 'match':       return <MatchCenterScreen snapshot={snapshot} now={now} />;
      case 'sector':      return <SectorScreen sectorKey={params[0] ?? ''} snapshot={snapshot} now={now} origin={origin} sourceLabel={sourceLabel} onNavigate={navigate} />;
      case 'watchlist':   return <WatchlistScreen snapshot={snapshot} now={now} onNavigate={navigate} />;
      case 'alerts':      return <AlertsScreen snapshot={snapshot} now={now} origin={origin} sourceLabel={sourceLabel} onNavigate={navigate} />;
      case 'daily':       return <DailyScreen snapshot={snapshot} now={now} origin={origin} sourceLabel={sourceLabel} onNavigate={navigate} />;
      case 'upnext':      return <UpNextScreen snapshot={snapshot} now={now} />;
      case 'live':        return <LiveScreen snapshot={snapshot} now={now} />;
      case 'vision':      return <VisionScreen snapshot={snapshot} onScan={(input, onProgress) => scanMarket(input, onProgress)} />;
      case 'markets':     return <MarketsScreen snapshot={snapshot} now={now} />;
      case 'signals':     return <SignalsScreen snapshot={snapshot} now={now} />;
      case 'portfolio':   return <PortfolioScreen snapshot={snapshot} now={now} />;
      case 'history':     return <HistoryScreen snapshot={snapshot} now={now} />;
      case 'leaderboard': return <LeaderboardScreen snapshot={snapshot} origin={origin} sourceLabel={sourceLabel} />;
      case 'brain':       return <BrainScreen snapshot={snapshot} now={now} />;
      case 'cross':       return <CrossMarketScreen snapshot={snapshot} origin={origin} sourceLabel={sourceLabel} onNavigate={navigate} />;
      case 'neural':      return <NeuralScreen snapshot={snapshot} />;
      case 'telemetry':   return <TelemetryScreen snapshot={snapshot} now={now} />;
      case 'admin':       return <AdminScreen snapshot={snapshot} now={now} />;
      case 'profile':     return <ProfileScreen snapshot={snapshot} now={now} origin={origin} sourceLabel={sourceLabel} onNavigate={navigate} />;
      case 'access':      return <AccessScreen />;
      case 'settings':    return <SettingsScreen snapshot={snapshot} origin={origin} sourceLabel={sourceLabel} />;
      case 'help':        return <HelpScreen snapshot={snapshot} />;
      default:            return <ArenaHome snapshot={snapshot} now={now} onNavigate={navigate} />;
    }
  };

  /* ---- LANDING ----------------------------------------------
     The public face renders without the Arena's chrome: no command
     bar, no rail, no telemetry strip. It keeps the shell element
     (and its density/motion/hologram attributes) so every token and
     every reduced-motion rule that governs the app governs the
     landing page too — one identity, not a marketing site bolted on
     the side.

     The scanner is reachable from here, which is the point: the
     first thing a reader can do is hand VIXY a market of their own
     before they have signed up for anything.                     */
  if (isLanding) {
    return (
      <PrefsContext.Provider value={{ prefs, setPref }}>
      <ArenaUIContext.Provider value={ui}><OriginContext.Provider value={origin}>
        <div
          className="shell is-landing"
          data-density={prefs.density}
          data-holograms={prefs.holograms ? 'on' : 'off'}
          data-motion={prefs.motion ? 'on' : 'off'}
        >
          <a className="skip-link" href="#lp-main">Skip to content</a>
          <Atmosphere brainState={snapshot?.brain.state ?? board?.brain.state} />

          <main id="lp-main" className="landing-main vx-scroll" tabIndex={-1}>
            <LandingScreen
              board={board}
              origin={board?.origin ?? origin}
              sourceLabel={sourceLabel}
              signedIn={Boolean(auth.session)}
              onEnter={enterArena}
            />
          </main>

          {scanOpen && (
            <ScanMarket snapshot={snapshot} onClose={() => setScanOpen(false)}
                        onScan={(input: ScanInput, onProgress: (p: ScanProgress) => void) =>
                          scanMarket(input, onProgress)} />
          )}

          <Toasts toasts={toasts} />

          {booting && (
            <BootSequence
              sourceLabel={sourceLabel}
              fast={seenBoot}
              onDone={() => { setBooting(false); saveFlag('onboarding_dismissed', true); }}
            />
          )}
        </div>
      </OriginContext.Provider></ArenaUIContext.Provider>
      </PrefsContext.Provider>
    );
  }

  /* ---- PASSWORD RESET (from the emailed link) ---------------- */
  if (route === 'reset' && params[0]) {
    return (
      <PrefsContext.Provider value={{ prefs, setPref }}>
      <ArenaUIContext.Provider value={ui}><OriginContext.Provider value={origin}>
        <div className="shell is-landing is-door" data-density={prefs.density}
             data-holograms={prefs.holograms ? 'on' : 'off'} data-motion={prefs.motion ? 'on' : 'off'}>
          <Atmosphere brainState={snapshot?.brain.state ?? board?.brain.state} />
          <main className="landing-main vx-scroll" tabIndex={-1}>
            <ResetScreen snapshot={snapshot} token={params[0]} onReset={resetPassword}
                         onDone={() => { saveFlag('landing_seen', true); navigate(DEFAULT_ROUTE); }}
                         onBack={() => navigate('auth/signin')} />
          </main>
          <Toasts toasts={toasts} />
        </div>
      </OriginContext.Provider></ArenaUIContext.Provider>
      </PrefsContext.Provider>
    );
  }

  /* ---- ACCESS NOT VERIFIED ----------------------------------
     The account system is loading, unreachable, or absent from this
     build. Nothing behind the door is drawn until it answers. This is
     the state a production deploy shows when the auth API is down —
     and the state this build shows if it was built without one. */
  if (!authVerified && !isLanding) {
    const loading = auth.status === 'LOADING';
    return (
      <PrefsContext.Provider value={{ prefs, setPref }}>
      <ArenaUIContext.Provider value={ui}><OriginContext.Provider value={origin}>
        <div className="shell is-landing is-door"
             data-density={prefs.density}
             data-holograms={prefs.holograms ? 'on' : 'off'}
             data-motion={prefs.motion ? 'on' : 'off'}>
          <Atmosphere brainState={snapshot?.brain.state ?? board?.brain.state} />
          <main className="landing-main vx-scroll" tabIndex={-1}>
            <div className="boot col center g4" role={loading ? 'status' : 'alert'}>
              <PredictionCore state="OBSERVING" size={200} />
              <span className="t-label">{loading ? 'Verifying your access' : 'Your access can’t be verified right now'}</span>
              {loading
                ? <div className="boot-bar"><i /></div>
                : (
                  <>
                    <p className="t-small" style={{ maxWidth: 440, textAlign: 'center' }}>
                      {auth.status === 'NOT_CONFIGURED'
                        ? 'This build has no account system connected, so the terminal cannot open. Nothing here is a market value.'
                        : 'The account system did not answer. Nothing is drawn until it does — the terminal never opens on a check it could not make.'}
                    </p>
                    {auth.message && <p className="t-nano" style={{ maxWidth: 440, textAlign: 'center' }}>{auth.message}</p>}
                    <div className="row g2">
                      <button className="btn btn-primary btn-sm tap" onClick={() => window.location.reload()}>Try again</button>
                      <button className="btn btn-sm tap" onClick={() => navigate('landing')}>How VIXY works</button>
                    </div>
                  </>
                )}
            </div>
          </main>
          <Toasts toasts={toasts} />
        </div>
      </OriginContext.Provider></ArenaUIContext.Provider>
      </PrefsContext.Provider>
    );
  }

  /* ---- THE DOOR ---------------------------------------------
     Step one. Rendered without the Arena's chrome, like the landing
     page, because a reader with no account has nothing to navigate
     yet. Every terminal route lands here until a session exists;
     the landing page stays reachable because it is the explanation. */
  if (isAuth || (needsAccount && !isLanding)) {
    return (
      <PrefsContext.Provider value={{ prefs, setPref }}>
      <ArenaUIContext.Provider value={ui}><OriginContext.Provider value={origin}>
        <div className="shell is-landing is-door"
             data-density={prefs.density}
             data-holograms={prefs.holograms ? 'on' : 'off'}
             data-motion={prefs.motion ? 'on' : 'off'}>
          <a className="skip-link" href="#door-main">Skip to content</a>
          <Atmosphere brainState={snapshot?.brain.state ?? board?.brain.state} />
          <main id="door-main" className="landing-main vx-scroll" tabIndex={-1}>
            <AuthScreen snapshot={snapshot} auth={auth} sourceLabel={authLabel}
                        initialMode={params[0] === 'signin' ? 'signin' : 'create'}
                        onSignUp={async (i) => { const st = await signUp(i); notify(`Account created · welcome, ${st.session?.handle ?? i.handle}`, 'good'); return st; }}
                        onSignIn={async (i) => { const st = await signIn(i); notify(`Signed in · ${st.session?.handle ?? ''}`, 'good'); return st; }}
                        onForgot={requestPasswordReset}
                        onContinue={() => { saveFlag('landing_seen', true); navigate(DEFAULT_ROUTE); }}
                        onBack={() => navigate('landing')} />
          </main>
          <Toasts toasts={toasts} />
          {booting && (
            <BootSequence sourceLabel={sourceLabel} fast={seenBoot}
                          onDone={() => { setBooting(false); saveFlag('onboarding_dismissed', true); }} />
          )}
        </div>
      </OriginContext.Provider></ArenaUIContext.Provider>
      </PrefsContext.Provider>
    );
  }

  return (
    <PrefsContext.Provider value={{ prefs, setPref }}>
    <ArenaUIContext.Provider value={ui}><OriginContext.Provider value={origin}>
      <div
        className={`shell ${showIntel ? 'has-intel' : ''} ${isMobile ? 'is-mobile' : ''} ${showTelemetry ? '' : 'no-telemetry'}`}
        data-density={prefs.density}
        data-holograms={prefs.holograms ? 'on' : 'off'}
        data-motion={prefs.motion ? 'on' : 'off'}
      >
        <a className="skip-link" href="#arena-main">Skip to content</a>
        <Atmosphere brainState={snapshot?.brain.state ?? board?.brain.state} />

        <CommandBar snapshot={snapshot} origin={origin} sourceLabel={sourceLabel}
                    hideMarkets={lockedByGate}
                    route={known} onNavigate={navigate} compact={isMobile}
                    onOpenPalette={() => { if (!lockedByGate) setPaletteOpen(true); }}
                    onOpenNotifications={() => { if (!lockedByGate) setNotifOpen((v) => !v); }}
                    onOpenScan={() => navigate('vision')}
                    unread={snapshot?.signals.filter((x) => x.kind === 'SIGNAL_LOCKED' || x.kind === 'SIGNAL_SETTLED').length ?? 0} />

        {!isMobile && <NavRail route={known} onNavigate={navigate} />}

        <main id="arena-main" className="workspace vx-scroll" key={known} tabIndex={-1}>
          <div className="workspace-inner enter">
            {snapshot && !lockedByGate && route !== 'locked' && <SourceBanner snapshot={snapshot} />}
            {/* The Arena home explains itself at length in its orientation
                band; every other screen gets the one-line version. */}
            {snapshot && !error && route !== DEFAULT_ROUTE && route !== 'locked' && !lockedByGate && <ScreenIntro route={known} />}

            {/* The terminal's home carries the two things a returning reader
                needs before anything else: what this is, and where they are in
                today's slate. They live here rather than inside one screen so
                they follow the home route if it ever moves. */}
            {snapshot && !error && route === DEFAULT_ROUTE && !lockedByGate && (
              <div className="col g4" style={{ marginBottom: 'var(--s-5)' }}>
                {!welcomeDone && auth.session && (
                  <WelcomeCard snapshot={snapshot} handle={auth.session.handle}
                               onDismiss={() => { saveFlag('welcome_dismissed', true); setWelcomeDone(true); }} />
                )}
                {/* The orientation chip is desktop-only: on a phone the landing
                    page already did that job and the board needs the height. */}
                {!isMobile && <Orientation onNavigate={navigate} />}
                <SlateStrip snapshot={snapshot} now={now} onOpen={() => navigate('daily')} />
              </div>
            )}
            {screen()}
          </div>
        </main>

        {showIntel && <IntelPanel snapshot={snapshot} now={now} onNavigate={navigate} />}

        {showTelemetry && <TelemetryBar snapshot={snapshot} clock={clock} />}

        {isMobile && <MobileNav route={known} onNavigate={navigate} onMore={() => setMoreOpen(true)} />}
        {isMobile && moreOpen && (
          <MoreSheet route={known} onNavigate={navigate} onClose={() => setMoreOpen(false)} />
        )}

        {detailMarket && snapshot && (
          <MarketDetail market={detailMarket} snapshot={snapshot} now={now}
                        onClose={() => setDetailId(null)} />
        )}

        {ticketMarket && ticket && snapshot && (
          <CallTicket
            market={ticketMarket}
            initialDirection={ticket.direction}
            pointsBalance={snapshot.portfolio.pointsBalance}
            now={now}
            onClose={() => setTicket(null)}
            onShare={(record) => { setTicket(null); setReceipt(record); }}
            onSubmit={async (direction, stake) => {
              const record = await placeCall({ marketId: ticketMarket.id, direction, stakePoints: stake });
              notify(`Call recorded · ${ticketMarket.symbol} ${direction} · ${stake} pts`, 'good');
              return record;
            }}
          />
        )}

        {receipt && (
          <ShareCard record={receipt} origin={origin}
                     market={snapshot?.markets.find((m) => m.id === receipt.marketId) ?? null}
                     onClose={() => setReceipt(null)} />
        )}

        {notifOpen && snapshot && (
          <NotificationCenter snapshot={snapshot} now={now} onClose={() => setNotifOpen(false)} />
        )}

        {shortcutsOpen && <Shortcuts onClose={() => setShortcutsOpen(false)} />}

        {paletteOpen && snapshot && (
          <CommandPalette snapshot={snapshot} onClose={() => setPaletteOpen(false)} />
        )}

        {scanOpen && (
          <ScanMarket snapshot={snapshot} onClose={() => setScanOpen(false)}
                      onScan={(input: ScanInput, onProgress: (p: ScanProgress) => void) =>
                        scanMarket(input, onProgress)} />
        )}

        {/* The lock graphic is a moment, and a moment cannot be had on top of
            something else. It is suppressed — not queued behind — while the
            reader is inside any other surface; the toast already recorded it. */}
        {lockCall && !busy && <LockCallout record={lockCall} onDone={() => setLockCall(null)} />}

        {compareIds && compareIds.length > 1 && snapshot && (
          <CompareBoard snapshot={snapshot} ids={compareIds} now={now}
                        onClose={() => setCompareIds(null)} />
        )}

        {broadcast && snapshot && (
          <BroadcastMode snapshot={snapshot} now={now} onClose={() => setBroadcast(false)} />
        )}

        {tourOpen && (
          <Tour onDone={() => { setTourOpen(false); setPref('tourDone', true); }} />
        )}

        <Toasts toasts={toasts} />

        {booting && (
          <BootSequence
            sourceLabel={sourceLabel}
            fast={seenBoot}
            onDone={() => { setBooting(false); saveFlag('onboarding_dismissed', true); }}
          />
        )}
      </div>
    </OriginContext.Provider></ArenaUIContext.Provider>
    </PrefsContext.Provider>
  );
}
