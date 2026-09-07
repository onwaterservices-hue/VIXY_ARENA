import type { MarketCategory } from '../types';

/* =============================================================
   THE MARKET UNIVERSE
   -------------------------------------------------------------
   VIXY reads every category the venues list. This module is the
   single place the interface learns what those categories are
   called, how they are ordered, and which accent carries them.

   Crypto is one row in this table. It is not the product, and no
   surface in the Arena is allowed to imply otherwise: the pinned
   ticker, the filter rail and the landing page all read their
   category set from here.

   The accents are drawn from the existing token palette — this
   is a differentiation scheme inside one identity, not eleven
   competing themes.
   ============================================================= */

export interface CategoryDef {
  key: MarketCategory;
  label: string;
  /** One line the interface can show when the category needs explaining. */
  blurb: string;
  /** Token name for the accent. Every value already exists in tokens.css. */
  accent: string;
  /** Sports carries the broadcast register harder than the rest. */
  broadcast?: boolean;
}

export const CATEGORIES: CategoryDef[] = [
  { key: 'SPORTS',        label: 'Sports',        blurb: 'Games, series, props and spreads',            accent: '--vx-cyan',       broadcast: true },
  { key: 'POLITICS',      label: 'Politics',      blurb: 'Elections, appointments, legislation',        accent: '--vx-violet-hi' },
  { key: 'ECONOMICS',     label: 'Economics',     blurb: 'Prints, policy decisions, indicators',        accent: '--vx-edge' },
  { key: 'FINANCE',       label: 'Finance',       blurb: 'Indices, rates, earnings, commodities',       accent: '--vx-blue' },
  { key: 'CRYPTO',        label: 'Crypto',        blurb: 'Range and threshold contracts',               accent: '--vx-warn' },
  { key: 'WEATHER',       label: 'Weather',       blurb: 'Storms, temperature, seasonal events',        accent: '--vx-cyan' },
  { key: 'CULTURE',       label: 'Culture',       blurb: 'Awards, releases, public moments',            accent: '--vx-violet-hi' },
  { key: 'ENTERTAINMENT', label: 'Entertainment', blurb: 'Box office, charts, broadcast outcomes',      accent: '--vx-violet' },
  { key: 'SCIENCE',       label: 'Science',       blurb: 'Launches, trials, discoveries',               accent: '--vx-blue' },
  { key: 'TECHNOLOGY',   label: 'Technology',   blurb: 'Shipping dates, adoption, outages',        accent: '--vx-cyan' },
  { key: 'WORLD',         label: 'World',         blurb: 'Current events and global affairs',           accent: '--vx-edge' },
  { key: 'OTHER',         label: 'Other',         blurb: 'Everything else a venue lists',               accent: '--vx-t3' },
];

export const CATEGORY_MAP =
  Object.fromEntries(CATEGORIES.map((c) => [c.key, c])) as Record<MarketCategory, CategoryDef>;

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

/** Label for a category, tolerant of a value the contract has not met yet. */
export function categoryLabel(c: MarketCategory | string): string {
  return CATEGORY_MAP[c as MarketCategory]?.label ?? String(c);
}

/* =============================================================
   SECTORS — THE MARKET UNIVERSE, AS A READER THINKS OF IT
   -------------------------------------------------------------
   Categories are how the venues label a market. Sectors are how
   a person navigates: nobody looks for "economics and finance",
   they look for MACRO. One sector can therefore gather more than
   one category, and the mapping lives here so no screen invents
   its own idea of what belongs together.

   This is a navigation table. It never changes what a market IS —
   the category on a market is still the venue's word for it.
   ============================================================= */

export interface SectorDef {
  key: string;
  label: string;
  /** The line the hub leads with. */
  blurb: string;
  /** Categories this sector gathers. */
  categories: MarketCategory[];
  accent: string;
}

export const SECTORS: SectorDef[] = [
  { key: 'crypto',        label: 'Crypto',         blurb: 'Range and threshold contracts across the majors',
    categories: ['CRYPTO'],                          accent: '--vx-warn' },
  { key: 'sports',        label: 'Sports',         blurb: 'Every league on the board, as fixtures with a clock',
    categories: ['SPORTS'],                          accent: '--vx-cyan' },
  { key: 'politics',      label: 'Politics',       blurb: 'Elections, debates, confirmations and policy',
    categories: ['POLITICS'],                        accent: '--vx-violet-hi' },
  { key: 'weather',       label: 'Weather',        blurb: 'Temperature, precipitation and extreme weather',
    categories: ['WEATHER'],                         accent: '--vx-blue' },
  { key: 'macro',         label: 'Macro',          blurb: 'The Fed, rates, inflation, jobs, indices and earnings',
    categories: ['ECONOMICS', 'FINANCE'],            accent: '--vx-edge' },
  { key: 'entertainment', label: 'Entertainment',  blurb: 'Awards, box office, charts and cultural events',
    categories: ['ENTERTAINMENT', 'CULTURE'],        accent: '--vx-violet' },
  { key: 'news',          label: 'News & Events',  blurb: 'World affairs, launches, trials and breaking events',
    categories: ['WORLD', 'SCIENCE', 'TECHNOLOGY'],  accent: '--vx-cyan' },
  { key: 'other',         label: 'Other',          blurb: 'Everything else a venue lists',
    categories: ['OTHER'],                           accent: '--vx-t3' },
];

export const SECTOR_MAP =
  Object.fromEntries(SECTORS.map((s) => [s.key, s])) as Record<string, SectorDef>;

/** The sector a category belongs to, or null when it is only reachable by category. */
export function sectorOf(category: MarketCategory): SectorDef | null {
  return SECTORS.find((s) => s.categories.includes(category)) ?? null;
}
