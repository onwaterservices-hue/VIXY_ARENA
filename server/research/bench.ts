/* =============================================================
   RESEARCH BENCH — DEV ONLY. Never touches the holdout.

   DEV is itself cut chronologically: FIT (first 70 %) fits every
   candidate, CHECK (last 30 %) scores them. Nothing is fitted on
   CHECK, so a candidate that only looks good there is still only a
   DEV result — the holdout is the one that counts.

   Every candidate is scored the same way the product scores itself:
   Brier against the outcome, paired against the venue's own price
   on the same markets, with a paired bootstrap interval.
   ============================================================= */
import { devRows } from './corpus.ts';
import { samples, family, type Sample } from './features.ts';
import { fitIsotonic, applyIsotonic, fitLogistic, applyLogistic, type Isotonic, type Logit } from './models.ts';

export interface Score { name: string; n: number; brier: number; marketBrier: number; gain: number; ci: [number, number]; p: number; logLoss: number }

const mulberry = (seed: number) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export function score(name: string, rows: Sample[], predict: (s: Sample) => number, seed = 20260907, resamples = 20_000): Score {
  const d: number[] = []; let brier = 0, mb = 0, ll = 0;
  for (const s of rows) {
    const q = Math.min(0.999, Math.max(0.001, predict(s)));
    brier += (q - s.y) ** 2; mb += (s.p - s.y) ** 2;
    ll += -(s.y ? Math.log(q) : Math.log(1 - q));
    d.push((s.p - s.y) ** 2 - (q - s.y) ** 2);
  }
  const n = rows.length || 1;
  const m = d.reduce((a, x) => a + x, 0) / n;
  const rnd = mulberry(seed); const means: number[] = [];
  for (let r = 0; r < resamples; r++) { let s = 0; for (let i = 0; i < n; i++) s += d[(rnd() * n) | 0]; means.push(s / n); }
  means.sort((a, b) => a - b);
  const lo = means[Math.floor(0.025 * resamples)], hi = means[Math.floor(0.975 * resamples)];
  const centred = means.map((x) => x - m);
  const p = Math.min(1, 2 * Math.min(centred.filter((x) => x >= Math.abs(m)).length, centred.filter((x) => x <= -Math.abs(m)).length) / resamples + 1 / resamples);
  const r5 = (x: number) => Math.round(x * 1e5) / 1e5;
  return { name, n, brier: r5(brier / n), marketBrier: r5(mb / n), gain: r5(m), ci: [r5(lo), r5(hi)], p: Math.round(p * 1000) / 1000, logLoss: r5(ll / n) };
}

export function devSplit() {
  const all = samples(devRows());
  const cut = Math.floor(all.length * 0.7);
  return { fit: all.slice(0, cut), check: all.slice(cut), all };
}

/* ---------- the candidates ---------- */
export const CANDIDATES: { name: string; build: (fit: Sample[]) => (s: Sample) => number }[] = [
  { name: 'market (baseline)', build: () => (s) => s.p },
  { name: 'isotonic recalibration of p', build: (fit) => { const iso = fitIsotonic(fit.map((s) => ({ p: s.p, y: s.y }))); return (s) => applyIsotonic(iso, s.p); } },
  { name: 'logistic: logit(p) only', build: (fit) => { const m = fitLogistic(fit, ['logitP'], 1); return (s) => applyLogistic(m, s); } },
  { name: 'logistic: p + shape', build: (fit) => { const m = fitLogistic(fit, ['logitP', 'absP', 'absP2'], 1); return (s) => applyLogistic(m, s); } },
  { name: 'logistic: p + momentum', build: (fit) => { const m = fitLogistic(fit, ['logitP', 'drift5', 'drift10', 'drift20', 'accel', 'agree'], 1); return (s) => applyLogistic(m, s); } },
  { name: 'logistic: p + path', build: (fit) => { const m = fitLogistic(fit, ['logitP', 'vol20', 'range20', 'posInRange', 'flips'], 1); return (s) => applyLogistic(m, s); } },
  { name: 'logistic: p + book', build: (fit) => { const m = fitLogistic(fit, ['logitP', 'spreadLast', 'spreadMean10', 'logOi', 'logVol'], 1); return (s) => applyLogistic(m, s); } },
  { name: 'logistic: everything', build: (fit) => { const m = fitLogistic(fit, ['logitP', 'absP', 'absP2', 'drift5', 'drift10', 'drift20', 'accel', 'agree', 'vol20', 'range20', 'posInRange', 'flips', 'spreadLast', 'spreadMean10', 'logOi', 'logVol', 'driftOverSpread'], 5); return (s) => applyLogistic(m, s); } },
  { name: 'shipped drift rule (0.35 × drift20, floored)', build: () => (s) => {
      const floor = Math.max(0.005, s.f.spreadLast);
      const adj = Math.abs(s.f.drift20) > floor ? Math.max(-0.03, Math.min(0.03, 0.35 * s.f.drift20)) : 0;
      return Math.min(0.99, Math.max(0.01, s.p + adj));
    } },
];

if (process.argv[1] && process.argv[1].endsWith('bench.ts')) {
  const { fit, check } = devSplit();
  const out = { dev: { fit: fit.length, check: check.length, fitTo: new Date(fit.at(-1)!.closeTs * 1000).toISOString() }, scores: [] as Score[] };
  for (const c of CANDIDATES) out.scores.push(score(c.name, check, c.build(fit)));
  console.log(JSON.stringify(out, null, 2));
}
