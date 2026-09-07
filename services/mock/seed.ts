/* =============================================================
   DEMO SEED — VISUAL DEVELOPMENT ONLY
   -------------------------------------------------------------
   NOTHING IN THIS FILE IS REAL MARKET DATA.
   These are fictional market shells used to develop the interface
   before the Kalshi / Polymarket ingest pipeline is connected.
   No price, probability, edge or outcome here has any meaning.
   ============================================================= */

import type { MarketCategory, Venue } from '../../types';

export interface SeedMarket {
  id: string;
  title: string;
  subtitle: string;
  category: MarketCategory;
  venues: Venue[];
  symbol: string;
  closesInMin: number;
  /* Broadcast labels. In the live system these arrive with the market;
     here they are part of the fictional shell. */
  home: string;
  away: string;
  homeLabel: string;
  awayLabel: string;
  window: string;
}

export const SEED_MARKETS: SeedMarket[] = [
  { id: 'mkt_nfl_kc_buf', symbol: 'KC/BUF', title: 'Kansas City to win vs. Buffalo', subtitle: 'NFL · Week 3 · moneyline', category: 'SPORTS', venues: ['KALSHI', 'POLYMARKET'], closesInMin: 184, home: 'KC', away: 'BUF', homeLabel: 'Kansas City', awayLabel: 'Buffalo', window: 'FULL GAME' },
  { id: 'mkt_nba_bos_den', symbol: 'BOS/DEN', title: 'Boston to win vs. Denver', subtitle: 'NBA · regular season', category: 'SPORTS', venues: ['KALSHI', 'POLYMARKET'], closesInMin: 96, home: 'BOS', away: 'DEN', homeLabel: 'Boston', awayLabel: 'Denver', window: 'FULL GAME' },
  { id: 'mkt_nfl_prop_mahomes', symbol: 'PROP·PM', title: 'Mahomes over 274.5 passing yards', subtitle: 'NFL · player prop', category: 'SPORTS', venues: ['POLYMARKET'], closesInMin: 184, home: 'OVER', away: 'UNDER', homeLabel: 'Over 274.5', awayLabel: 'Under 274.5', window: 'PLAYER PROP' },
  { id: 'mkt_ncaa_uga_ala', symbol: 'UGA/ALA', title: 'Georgia to cover −6.5 vs. Alabama', subtitle: 'NCAAF · spread', category: 'SPORTS', venues: ['KALSHI'], closesInMin: 1420, home: 'UGA', away: 'ALA', homeLabel: 'Georgia −6.5', awayLabel: 'Alabama +6.5', window: 'SPREAD' },
  { id: 'mkt_mlb_lad_nyy', symbol: 'LAD/NYY', title: 'Dodgers to win series vs. Yankees', subtitle: 'MLB · series price', category: 'SPORTS', venues: ['KALSHI', 'POLYMARKET'], closesInMin: 4310, home: 'LAD', away: 'NYY', homeLabel: 'Dodgers', awayLabel: 'Yankees', window: 'SERIES' },
  { id: 'mkt_btc_range', symbol: 'BTC', title: 'BTC above threshold at monthly close', subtitle: 'Crypto · range contract', category: 'CRYPTO', venues: ['KALSHI', 'POLYMARKET'], closesInMin: 2760, home: 'BTC', away: 'MARKET', homeLabel: 'BTC above threshold', awayLabel: 'Venue consensus', window: 'MONTHLY' },
  { id: 'mkt_eth_range', symbol: 'ETH', title: 'ETH above threshold at weekly close', subtitle: 'Crypto · range contract', category: 'CRYPTO', venues: ['POLYMARKET'], closesInMin: 940, home: 'ETH', away: 'MARKET', homeLabel: 'ETH above threshold', awayLabel: 'Venue consensus', window: 'WEEKLY' },
  { id: 'mkt_sol_range', symbol: 'SOL', title: 'SOL above threshold at weekly close', subtitle: 'Crypto · range contract', category: 'CRYPTO', venues: ['POLYMARKET'], closesInMin: 940, home: 'SOL', away: 'MARKET', homeLabel: 'SOL above threshold', awayLabel: 'Venue consensus', window: 'WEEKLY' },
  { id: 'mkt_xrp_range', symbol: 'XRP', title: 'XRP above threshold at monthly close', subtitle: 'Crypto · range contract', category: 'CRYPTO', venues: ['KALSHI'], closesInMin: 2760, home: 'XRP', away: 'MARKET', homeLabel: 'XRP above threshold', awayLabel: 'Venue consensus', window: 'MONTHLY' },
  { id: 'mkt_fed_cut', symbol: 'FOMC', title: 'Policy rate cut at the next meeting', subtitle: 'Economics · FOMC decision', category: 'ECONOMICS', venues: ['KALSHI'], closesInMin: 12600, home: 'CUT', away: 'HOLD', homeLabel: 'Rate cut', awayLabel: 'No change', window: 'FOMC' },
  { id: 'mkt_cpi_print', symbol: 'CPI', title: 'Headline CPI below consensus', subtitle: 'Economics · monthly print', category: 'ECONOMICS', venues: ['KALSHI'], closesInMin: 6200, home: 'UNDER', away: 'OVER', homeLabel: 'Below consensus', awayLabel: 'At or above', window: 'MONTHLY PRINT' },
  { id: 'mkt_awards_film', symbol: 'AWARD', title: 'Front-runner wins Best Picture', subtitle: 'Culture · awards season', category: 'CULTURE', venues: ['POLYMARKET'], closesInMin: 41000, home: 'FRONT', away: 'FIELD', homeLabel: 'Front-runner', awayLabel: 'The field', window: 'AWARDS' },
  { id: 'mkt_storm_landfall', symbol: 'STORM', title: 'Named storm makes landfall this week', subtitle: 'Weather · event contract', category: 'WEATHER', venues: ['KALSHI'], closesInMin: 3100, home: 'YES', away: 'NO', homeLabel: 'Landfall', awayLabel: 'No landfall', window: 'THIS WEEK' },
  { id: 'mkt_epl_ars_liv', symbol: 'ARS/LIV', title: 'Arsenal to beat Liverpool', subtitle: 'Premier League · matchday', category: 'SPORTS', venues: ['POLYMARKET'], closesInMin: 260, home: 'ARS', away: 'LIV', homeLabel: 'Arsenal', awayLabel: 'Liverpool', window: 'FULL MATCH' },
  { id: 'mkt_ufc_main', symbol: 'UFC·MAIN', title: 'Main event ends inside the distance', subtitle: 'UFC · method of victory', category: 'SPORTS', venues: ['KALSHI'], closesInMin: 1180, home: 'INSIDE', away: 'DECISION', homeLabel: 'Inside the distance', awayLabel: 'Goes to decision', window: 'MAIN CARD' },
  { id: 'mkt_senate_seat', symbol: 'SENATE', title: 'Incumbent holds the contested seat', subtitle: 'Politics · midterm race', category: 'POLITICS', venues: ['KALSHI', 'POLYMARKET'], closesInMin: 38000, home: 'HOLD', away: 'FLIP', homeLabel: 'Incumbent holds', awayLabel: 'Seat flips', window: 'ELECTION DAY' },
  { id: 'mkt_cabinet_conf', symbol: 'CONFIRM', title: 'Nominee confirmed before recess', subtitle: 'Politics · confirmation vote', category: 'POLITICS', venues: ['POLYMARKET'], closesInMin: 9400, home: 'YES', away: 'NO', homeLabel: 'Confirmed', awayLabel: 'Not confirmed', window: 'BEFORE RECESS' },
  { id: 'mkt_jobs_print', symbol: 'JOBS', title: 'Payrolls above consensus', subtitle: 'Economics · monthly print', category: 'ECONOMICS', venues: ['KALSHI'], closesInMin: 4100, home: 'OVER', away: 'UNDER', homeLabel: 'Above consensus', awayLabel: 'At or below', window: 'MONTHLY PRINT' },
  { id: 'mkt_index_close', symbol: 'INDEX', title: 'Index closes above the strike', subtitle: 'Finance · daily close', category: 'FINANCE', venues: ['KALSHI'], closesInMin: 320, home: 'ABOVE', away: 'BELOW', homeLabel: 'Above strike', awayLabel: 'Below strike', window: 'DAILY CLOSE' },
  { id: 'mkt_earnings_beat', symbol: 'EARN', title: 'Large-cap beats on earnings', subtitle: 'Finance · quarterly report', category: 'FINANCE', venues: ['POLYMARKET'], closesInMin: 2600, home: 'BEAT', away: 'MISS', homeLabel: 'Beats estimate', awayLabel: 'Misses estimate', window: 'QUARTER' },
  { id: 'mkt_heat_record', symbol: 'HEAT', title: 'Record high set this month', subtitle: 'Weather · temperature record', category: 'WEATHER', venues: ['KALSHI'], closesInMin: 12000, home: 'YES', away: 'NO', homeLabel: 'Record set', awayLabel: 'No record', window: 'THIS MONTH' },
  { id: 'mkt_box_office', symbol: 'B·OFFICE', title: 'Opening weekend clears the threshold', subtitle: 'Entertainment · box office', category: 'ENTERTAINMENT', venues: ['POLYMARKET'], closesInMin: 5400, home: 'OVER', away: 'UNDER', homeLabel: 'Clears threshold', awayLabel: 'Falls short', window: 'OPENING WEEKEND' },
  { id: 'mkt_chart_no1', symbol: 'CHART', title: 'Debut single takes the number one spot', subtitle: 'Entertainment · charts', category: 'ENTERTAINMENT', venues: ['POLYMARKET'], closesInMin: 8600, home: 'NO.1', away: 'FIELD', homeLabel: 'Takes number one', awayLabel: 'The field', window: 'CHART WEEK' },
  { id: 'mkt_launch_window', symbol: 'LAUNCH', title: 'Launch occurs inside the window', subtitle: 'Science · scheduled launch', category: 'SCIENCE', venues: ['KALSHI'], closesInMin: 7200, home: 'ON TIME', away: 'SLIPS', homeLabel: 'Launches in window', awayLabel: 'Slips the window', window: 'LAUNCH WINDOW' },
  { id: 'mkt_trial_readout', symbol: 'TRIAL', title: 'Trial reports before quarter end', subtitle: 'Science · clinical readout', category: 'SCIENCE', venues: ['POLYMARKET'], closesInMin: 30000, home: 'REPORTS', away: 'DELAYED', homeLabel: 'Reports in time', awayLabel: 'Delayed', window: 'QUARTER' },
  { id: 'mkt_summit_deal', symbol: 'SUMMIT', title: 'Agreement signed at the summit', subtitle: 'World · multilateral talks', category: 'WORLD', venues: ['POLYMARKET'], closesInMin: 15200, home: 'SIGNED', away: 'NO DEAL', homeLabel: 'Agreement signed', awayLabel: 'No agreement', window: 'SUMMIT' },
  { id: 'mkt_election_turnout', symbol: 'TURNOUT', title: 'Turnout exceeds prior cycle', subtitle: 'Politics · aggregate measure', category: 'POLITICS', venues: ['POLYMARKET'], closesInMin: 52000, home: 'OVER', away: 'UNDER', homeLabel: 'Exceeds prior', awayLabel: 'Below prior', window: 'CYCLE' },
  { id: 'mkt_nhl_col_vgk', symbol: 'COL/VGK', title: 'Colorado to beat Vegas', subtitle: 'NHL · regular season', category: 'SPORTS', venues: ['KALSHI'], closesInMin: 420, home: 'COL', away: 'VGK', homeLabel: 'Colorado', awayLabel: 'Vegas', window: 'FULL GAME' },
  { id: 'mkt_f1_pole', symbol: 'F1·POLE', title: 'Championship leader takes pole', subtitle: 'Formula 1 · qualifying', category: 'SPORTS', venues: ['POLYMARKET'], closesInMin: 2050, home: 'LEADER', away: 'FIELD', homeLabel: 'Leader on pole', awayLabel: 'The field', window: 'QUALIFYING' },
  { id: 'mkt_tennis_final', symbol: 'TENNIS', title: 'Top seed reaches the final', subtitle: 'ATP · draw progression', category: 'SPORTS', venues: ['POLYMARKET'], closesInMin: 5900, home: 'TOP SEED', away: 'FIELD', homeLabel: 'Top seed', awayLabel: 'The field', window: 'DRAW' },
  { id: 'mkt_esports_major', symbol: 'ESPORTS', title: 'Favourite advances from the group', subtitle: 'Esports · major group stage', category: 'SPORTS', venues: ['POLYMARKET'], closesInMin: 760, home: 'ADVANCE', away: 'OUT', homeLabel: 'Advances', awayLabel: 'Eliminated', window: 'GROUP STAGE' },
  { id: 'mkt_tech_ship', symbol: 'SHIP', title: 'Product ships before the announced date', subtitle: 'Technology · release schedule', category: 'TECHNOLOGY', venues: ['POLYMARKET'], closesInMin: 26000, home: 'SHIPS', away: 'SLIPS', homeLabel: 'Ships on time', awayLabel: 'Slips the date', window: 'RELEASE WINDOW' },
  { id: 'mkt_tech_outage', symbol: 'UPTIME', title: 'Major provider outage this quarter', subtitle: 'Technology · infrastructure', category: 'TECHNOLOGY', venues: ['KALSHI'], closesInMin: 34000, home: 'OUTAGE', away: 'CLEAN', homeLabel: 'Outage recorded', awayLabel: 'No qualifying outage', window: 'QUARTER' },
];

export const SEED_PLAYERS = [
  'ORACLE_9', 'nightshade', 'vector.eth', 'QUANT_KID', 'blueline', 'holloway',
  'mercury', 'SABERMETRIC', 'coldstreak', 'atlas_07', 'pinnacle', 'redshift',
];


/* =============================================================
   DEMO SCHEDULE — VISUAL DEVELOPMENT ONLY
   -------------------------------------------------------------
   Events, not markets. One event owns the markets written about
   it, and has a start time of its own — which is the only way an
   interface can answer "what is on tonight".

   `startsInMin` is relative so the schedule is always plausible
   whenever the demo is opened. In production every one of these
   fields arrives from the venue's event feed.
   ============================================================= */

export interface SeedEvent {
  id: string;
  title: string;
  league: string | null;
  category: MarketCategory;
  /** Minutes from now. Negative means already under way. */
  startsInMin: number;
  marketIds: string[];
  note: string | null;
}

export const SEED_EVENTS: SeedEvent[] = [
  { id: 'evt_nfl_kc_buf', title: 'Kansas City vs. Buffalo', league: 'NFL', category: 'SPORTS', startsInMin: -34, marketIds: ['mkt_nfl_kc_buf', 'mkt_nfl_prop_mahomes'], note: 'Moneyline and player props on the same clock' },
  { id: 'evt_nba_bos_den', title: 'Boston vs. Denver', league: 'NBA', category: 'SPORTS', startsInMin: -12, marketIds: ['mkt_nba_bos_den'], note: null },
  { id: 'evt_epl_ars_liv', title: 'Arsenal vs. Liverpool', league: 'Premier League', category: 'SPORTS', startsInMin: 96, marketIds: ['mkt_epl_ars_liv'], note: null },
  { id: 'evt_nhl_col_vgk', title: 'Colorado vs. Vegas', league: 'NHL', category: 'SPORTS', startsInMin: 240, marketIds: ['mkt_nhl_col_vgk'], note: null },
  { id: 'evt_index_close', title: 'Cash equity close', league: 'US session', category: 'FINANCE', startsInMin: 300, marketIds: ['mkt_index_close'], note: null },
  { id: 'evt_esports_major', title: 'Major group stage', league: 'Esports', category: 'SPORTS', startsInMin: 560, marketIds: ['mkt_esports_major'], note: null },
  { id: 'evt_ncaa_uga_ala', title: 'Georgia vs. Alabama', league: 'NCAAF', category: 'SPORTS', startsInMin: 1300, marketIds: ['mkt_ncaa_uga_ala'], note: null },
  { id: 'evt_ufc_card', title: 'Main card', league: 'UFC', category: 'SPORTS', startsInMin: 1090, marketIds: ['mkt_ufc_main'], note: null },
  { id: 'evt_f1_quali', title: 'Qualifying', league: 'Formula 1', category: 'SPORTS', startsInMin: 1960, marketIds: ['mkt_f1_pole'], note: null },
  { id: 'evt_crypto_weekly', title: 'Weekly crypto settlement', league: null, category: 'CRYPTO', startsInMin: 900, marketIds: ['mkt_eth_range', 'mkt_sol_range'], note: null },
  { id: 'evt_jobs_print', title: 'Payrolls release', league: 'BLS', category: 'ECONOMICS', startsInMin: 4050, marketIds: ['mkt_jobs_print'], note: 'Scheduled information event' },
  { id: 'evt_earnings', title: 'Large-cap earnings call', league: null, category: 'FINANCE', startsInMin: 2540, marketIds: ['mkt_earnings_beat'], note: null },
  { id: 'evt_storm', title: 'Named storm track update', league: 'NHC', category: 'WEATHER', startsInMin: 3000, marketIds: ['mkt_storm_landfall'], note: 'Advisory cadence drives the market' },
  { id: 'evt_mlb_series', title: 'Dodgers vs. Yankees series', league: 'MLB', category: 'SPORTS', startsInMin: 4260, marketIds: ['mkt_mlb_lad_nyy'], note: null },
  { id: 'evt_box_office', title: 'Opening weekend', league: null, category: 'ENTERTAINMENT', startsInMin: 5340, marketIds: ['mkt_box_office'], note: null },
  { id: 'evt_tennis_draw', title: 'Semi-final day', league: 'ATP', category: 'SPORTS', startsInMin: 5840, marketIds: ['mkt_tennis_final'], note: null },
  { id: 'evt_cpi_print', title: 'CPI release', league: 'BLS', category: 'ECONOMICS', startsInMin: 6150, marketIds: ['mkt_cpi_print'], note: 'Scheduled information event' },
  { id: 'evt_launch', title: 'Launch window opens', league: null, category: 'SCIENCE', startsInMin: 7150, marketIds: ['mkt_launch_window'], note: null },
  { id: 'evt_chart_week', title: 'Chart week closes', league: null, category: 'ENTERTAINMENT', startsInMin: 8550, marketIds: ['mkt_chart_no1'], note: null },
  { id: 'evt_confirmation', title: 'Confirmation vote', league: 'Senate', category: 'POLITICS', startsInMin: 9350, marketIds: ['mkt_cabinet_conf'], note: null },
  { id: 'evt_heat', title: 'Monthly temperature record window', league: 'NOAA', category: 'WEATHER', startsInMin: 11950, marketIds: ['mkt_heat_record'], note: null },
  { id: 'evt_fomc', title: 'FOMC decision', league: 'Federal Reserve', category: 'ECONOMICS', startsInMin: 12550, marketIds: ['mkt_fed_cut'], note: 'The single largest scheduled event on the board' },
  { id: 'evt_summit', title: 'Multilateral summit', league: null, category: 'WORLD', startsInMin: 15150, marketIds: ['mkt_summit_deal'], note: null },
  { id: 'evt_tech_release', title: 'Announced release date', league: null, category: 'TECHNOLOGY', startsInMin: 25950, marketIds: ['mkt_tech_ship'], note: null },
  { id: 'evt_btc_monthly', title: 'Monthly crypto settlement', league: null, category: 'CRYPTO', startsInMin: 2710, marketIds: ['mkt_btc_range', 'mkt_xrp_range'], note: null },
  { id: 'evt_trial', title: 'Clinical readout window', league: null, category: 'SCIENCE', startsInMin: 29950, marketIds: ['mkt_trial_readout'], note: null },
  { id: 'evt_tech_quarter', title: 'Infrastructure quarter closes', league: null, category: 'TECHNOLOGY', startsInMin: 33950, marketIds: ['mkt_tech_outage'], note: null },
  { id: 'evt_senate', title: 'Election day', league: null, category: 'POLITICS', startsInMin: 37950, marketIds: ['mkt_senate_seat', 'mkt_election_turnout'], note: null },
  { id: 'evt_awards', title: 'Awards ceremony', league: null, category: 'CULTURE', startsInMin: 40950, marketIds: ['mkt_awards_film'], note: null },
];
