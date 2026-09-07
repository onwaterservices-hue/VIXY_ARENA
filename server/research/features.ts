/* =============================================================
   RESEARCH FEATURES — everything computable at the decision point
   from what the venue published before it.

   The decision point is the LAST archived bar (60 minutes before
   the market closed). Every feature uses bars at or before it and
   nothing else. `p` is the market's own probability there; it is
   both a feature and the baseline every model has to beat.
   ============================================================= */
import type { ArchiveRow } from '../tools/backtest.ts';

export interface Sample {
  ticker: string; series: string; closeTs: number; y: 0 | 1;
  p: number;                 /* market probability at the decision point, 0..1 */
  f: Record<string, number>; /* candidate features */
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const std = (a: number[]) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
export const logit = (p: number) => Math.log(Math.min(0.999, Math.max(0.001, p)) / (1 - Math.min(0.999, Math.max(0.001, p))));
export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Coarse sport family from the series ticker — a grouping, never a prediction. */
export function family(series: string): string {
  const s = series.toUpperCase();
  if (/(ATP|WTA|ITF|CHALLENGER|DAVISCUP|UNITEDCUP|TENNIS)/.test(s)) return 'TENNIS';
  if (/(TABLETENNIS|TT|ITTF|WTT)/.test(s)) return 'TABLETENNIS';
  if (/(MLB|BASEBALL|LMB|NPB|KBO|BB)/.test(s)) return 'BASEBALL';
  if (/(NBA|NCAAB|CBA|BASKET|FIBA|WNBA|DBB)/.test(s)) return 'BASKETBALL';
  if (/(NFL|NCAAF|CFL|UFL)/.test(s)) return 'AMFOOTBALL';
  if (/(NHL|HOCKEY|KHL|SHL)/.test(s)) return 'HOCKEY';
  if (/(EPL|LALIGA|SERIEA|BUNDES|LIGUE|MLS|UEFA|SL|SOCCER|FGAME|LIGA|DIV)/.test(s)) return 'SOCCER';
  if (/(CS2|LOL|DOTA|VALORANT|ESPORT)/.test(s)) return 'ESPORTS';
  if (/(CRICKET|T20|ODI|TEST|HUNDRED)/.test(s)) return 'CRICKET';
  if (/(UFC|BOXING|FIGHT|MMA)/.test(s)) return 'FIGHT';
  return 'OTHER';
}

/** Null when the row has too little history to score at all. */
export function sampleOf(row: ArchiveRow): Sample | null {
  const [ticker, series, closeTs, result, , bars] = row;
  if (bars.length < 20) return null;
  const mid = bars.map(([, b, a]) => (b + a) / 2 / 10000);   /* 0..1 */
  const spread = bars.map(([, b, a]) => (a - b) / 10000);
  const L = mid.length - 1;
  const p = mid[L];
  if (!(p > 0 && p < 1)) return null;
  const last20 = mid.slice(-20), last10 = mid.slice(-10), last5 = mid.slice(-5);
  const d = (w: number[]) => w[w.length - 1] - w[0];
  const ch = last20.slice(1).map((x, i) => x - last20[i]);
  const nz = ch.filter((x) => x !== 0);
  let flips = 0; for (let i = 1; i < nz.length; i++) if (Math.sign(nz[i]) !== Math.sign(nz[i - 1])) flips++;
  const hi = Math.max(...last20), lo = Math.min(...last20);
  const oi = bars[L][3] || 0, vol = bars[L][4] || 0;
  const drift20 = d(last20), drift10 = d(last10), drift5 = d(last5);
  return {
    ticker, series, closeTs, y: result === 'yes' ? 1 : 0, p,
    f: {
      logitP: logit(p),
      /* favourite-longshot shape: distance from an even market, and its square */
      absP: Math.abs(p - 0.5),
      absP2: (p - 0.5) ** 2,
      /* momentum at three horizons, and whether the short one agrees with the long one */
      drift5, drift10, drift20,
      accel: drift5 - (drift20 - drift5) / 3,
      agree: Math.sign(drift5) === Math.sign(drift20) && drift20 !== 0 ? 1 : 0,
      /* path shape */
      vol20: std(ch),
      range20: hi - lo,
      posInRange: hi > lo ? (p - lo) / (hi - lo) : 0.5,
      flips,
      /* book and size */
      spreadLast: spread[L],
      spreadMean10: mean(spread.slice(-10)),
      logOi: Math.log10(1 + oi),
      logVol: Math.log10(1 + vol),
      bars: bars.length,
      /* drift measured against the noise the book itself shows */
      driftOverSpread: spread[L] > 0 ? drift20 / spread[L] : 0,
    },
  };
}

export function samples(rows: ArchiveRow[]): Sample[] {
  return rows.map(sampleOf).filter((s): s is Sample => s !== null).sort((a, b) => a.closeTs - b.closeTs);
}

export const FEATURES = Object.keys(sampleOf([
  'X-Y', 'X', 0, 'yes', 0, Array.from({ length: 20 }, (_, i) => [i * 60, 4000, 4100, 1000, 10]),
] as ArchiveRow)!.f);
