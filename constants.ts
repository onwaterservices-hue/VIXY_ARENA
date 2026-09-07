import type { IconName } from './components/common/Icon';

export interface RouteDef {
  id: string;
  /** Short label for the mobile dock, where the full label will not fit. */
  short?: string;
  label: string;
  icon: IconName;
  group: 'ARENA' | 'UNIVERSE' | 'AI SYSTEM' | 'SYSTEM';
  /** Shown in the mobile command bar. */
  primary?: boolean;
  /** Reachable by URL but never listed in navigation (the sign-in door). */
  hidden?: boolean;
  description: string;
}

export const ROUTES: RouteDef[] = [
  { id: 'markets',     label: 'All Markets', short: 'All',   icon: 'markets',     group: 'ARENA', primary: true,  description: 'The whole prediction universe — every category, every venue, one board' },
  { id: 'arena',       label: 'Arena',       icon: 'arena',       group: 'ARENA', primary: true,  description: 'The main event, live — what the market thinks, what VIXY thinks, and the gap' },
  { id: 'match',       label: 'Match Center', short: 'Match', icon: 'live', group: 'ARENA',                 description: 'Every prediction event laid out as a fixture, with its clock and its odds' },
  { id: 'live',        label: 'Live',        icon: 'signals',     group: 'ARENA', primary: true,  description: 'Markets whose odds are moving right now' },
  /* The signature feature gets a tab of its own, beside the markets: drop a
     screenshot of any Kalshi or Polymarket panel and VIXY reads it. */
  { id: 'vision',      label: 'Arena Vision', short: 'Vision', icon: 'search', group: 'ARENA', primary: true, description: 'Screenshot any market on Kalshi or Polymarket, drop it here, and VIXY tells you what it thinks' },
  { id: 'daily',       label: 'Daily Slate', short: 'Daily', icon: 'spark', group: 'ARENA', primary: true, description: 'Today’s card, and the objectives that reward analysis over volume' },
  { id: 'upnext',      label: 'Up Next',     short: 'Next', icon: 'clock', group: 'ARENA', description: 'Every scheduled event, in the order it happens' },
  /* The market universe, as a reader navigates it. Each is one hub screen
     driven by the sector table — a new sector is a row, not a screen. */
  { id: 'sector/crypto',        label: 'Crypto',        short: 'Crypto',  icon: 'layers',      group: 'UNIVERSE', description: 'Range and threshold contracts across the majors' },
  { id: 'sector/sports',        label: 'Sports',        short: 'Sports',  icon: 'live',        group: 'UNIVERSE', description: 'Every league on the board, as fixtures with a clock' },
  { id: 'sector/politics',      label: 'Politics',      short: 'Politics',icon: 'leaderboard', group: 'UNIVERSE', description: 'Elections, debates, confirmations and policy' },
  { id: 'sector/weather',       label: 'Weather',       short: 'Weather', icon: 'flame',       group: 'UNIVERSE', description: 'Temperature, precipitation and extreme weather' },
  { id: 'sector/macro',         label: 'Macro',         short: 'Macro',   icon: 'signals',     group: 'UNIVERSE', description: 'The Fed, rates, inflation, jobs, indices and earnings' },
  { id: 'sector/entertainment', label: 'Entertainment', short: 'Culture', icon: 'spark',       group: 'UNIVERSE', description: 'Awards, box office, charts and cultural events' },
  { id: 'sector/news',          label: 'News & Events', short: 'News',    icon: 'neural',      group: 'UNIVERSE', description: 'World affairs, launches, trials and breaking events' },

  { id: 'signals',     label: 'Signals',     icon: 'signals',     group: 'ARENA',                 description: 'A running feed of what the engine noticed, and when' },
  { id: 'watchlist',   label: 'Watchlist',   short: 'Watch', icon: 'spark', group: 'ARENA',            description: 'The markets you starred, with their live numbers beside them' },
  { id: 'alerts',      label: 'Alerts',      icon: 'bell',        group: 'ARENA',                 description: 'What changed — engine events, grouped by what you care about' },
  { id: 'portfolio',   label: 'Portfolio',   icon: 'portfolio',   group: 'ARENA',                 description: 'The calls you have open, and the ones already locked in' },
  { id: 'history',     label: 'History',     icon: 'history',     group: 'ARENA',                 description: 'Every call you have made, scored after the event settled' },
  { id: 'leaderboard', label: 'Leaderboard', short: 'Board', icon: 'leaderboard', group: 'ARENA',            description: 'How everyone\u2019s calls are scoring against each other' },
  { id: 'brain',       label: 'VIXY Brain',  short: 'Brain', icon: 'brain', group: 'AI SYSTEM', primary: true, description: 'What the model is doing right now, and how accurate it has been' },
  { id: 'cross',       label: 'Cross-Market', short: 'Cross', icon: 'neural', group: 'AI SYSTEM', description: 'Where two markets in different worlds move on the same thing' },
  { id: 'neural',      label: 'Neural Map',  icon: 'neural',      group: 'AI SYSTEM',             description: 'How VIXY sees markets relating to one another' },
  { id: 'telemetry',   label: 'Telemetry',   icon: 'telemetry',   group: 'AI SYSTEM',             description: 'Where the data comes from, and how healthy each source is' },
  { id: 'admin',       label: 'Admin',       icon: 'admin',       group: 'SYSTEM',                description: 'Environment, feature flags, guards and background jobs' },
  { id: 'profile',     label: 'Profile',     icon: 'user',        group: 'SYSTEM',                description: 'Who you are in the Arena, and how your calls are scoring' },
  { id: 'access',      label: 'Access',      icon: 'lock',        group: 'SYSTEM',                description: 'Your plan, what it covers, and what the Arena is and is not' },
  { id: 'auth',        label: 'Sign in',     icon: 'user',        group: 'SYSTEM', hidden: true,  description: 'Create your account or sign in' },
  { id: 'settings',    label: 'Settings',    icon: 'settings',    group: 'SYSTEM',                description: 'Interface, motion, density and account' },
  { id: 'help',        label: 'Help',        icon: 'help',        group: 'SYSTEM',                description: 'What every word on screen means, start to finish' },
];

export const ROUTE_MAP = Object.fromEntries(ROUTES.map((r) => [r.id, r])) as Record<string, RouteDef>;
export const DEFAULT_ROUTE = 'markets';

/** Symbols pinned to the global command bar. Presentation choice only. */
/* The pinned ticker samples the UNIVERSE, not one asset class. Four
   crypto tickers across the top of every screen told the reader this
   was a crypto product; it is not. One market from each of the busiest
   categories tells the truth instead. */
export const PINNED_SYMBOLS = ['KC/BUF', 'SENATE', 'CPI', 'INDEX', 'BTC', 'STORM'];

export const PRODUCT = {
  name: 'VIXY ARENA',
  /* The product in one line, used wherever the app introduces itself. */
  tagline: 'The intelligence terminal for prediction markets — every category, one AI analyst.',
  build: 'arena-shell-0.1.0',
};
