/* =============================================================
   RESEARCH MODELS — small, readable, zero-dependency.

   Two shapes, both of which take the market's own price as their
   starting point, because anything that ignores it starts from a
   worse place than the thing it has to beat:

     recalibrate(p)      — a monotone map fitted on DEV. Tests one
                           idea: that the venue's price is biased in
                           a fixed way (the favourite–longshot bias).
     logistic(logit p, f) — the price plus features, L2-penalised.
                           Tests whether anything in the path adds
                           information beyond the price.
   ============================================================= */
import { logit, sigmoid, type Sample } from './features.ts';

/* ---------- isotonic (pool-adjacent-violators) on p → rate ---------- */
export interface Isotonic { x: number[]; y: number[] }

export function fitIsotonic(pairs: { p: number; y: number }[], minBin = 40): Isotonic {
  const s = pairs.slice().sort((a, b) => a.p - b.p);
  /* start from equal-count bins so single points cannot become steps */
  const bins: { sx: number; sy: number; n: number }[] = [];
  for (let i = 0; i < s.length; i += minBin) {
    const b = s.slice(i, i + minBin);
    bins.push({ sx: b.reduce((a, x) => a + x.p, 0), sy: b.reduce((a, x) => a + x.y, 0), n: b.length });
  }
  /* PAV on the bin means */
  const st: { x: number; y: number; n: number }[] = [];
  for (const b of bins) {
    let cur = { x: b.sx / b.n, y: b.sy / b.n, n: b.n };
    while (st.length && st[st.length - 1].y > cur.y) {
      const prev = st.pop()!;
      const n = prev.n + cur.n;
      cur = { x: (prev.x * prev.n + cur.x * cur.n) / n, y: (prev.y * prev.n + cur.y * cur.n) / n, n };
    }
    st.push(cur);
  }
  return { x: st.map((b) => b.x), y: st.map((b) => b.y) };
}

export function applyIsotonic(iso: Isotonic, p: number): number {
  const { x, y } = iso;
  if (!x.length) return p;
  if (p <= x[0]) return y[0];
  if (p >= x[x.length - 1]) return y[y.length - 1];
  let i = 1; while (i < x.length && x[i] < p) i++;
  const t = (p - x[i - 1]) / (x[i] - x[i - 1] || 1);
  return y[i - 1] + t * (y[i] - y[i - 1]);
}

/* ---------- L2 logistic regression, Newton / IRLS ---------- */
export interface Logit { names: string[]; w: number[]; b: number; mu: number[]; sd: number[] }

export function fitLogistic(rows: Sample[], names: string[], lambda = 1, iters = 40): Logit {
  const X = rows.map((r) => names.map((n) => r.f[n]));
  const yv = rows.map((r) => r.y);
  const k = names.length;
  const mu = names.map((_, j) => X.reduce((a, x) => a + x[j], 0) / X.length);
  const sd = names.map((_, j) => { const m = mu[j]; const v = X.reduce((a, x) => a + (x[j] - m) ** 2, 0) / Math.max(1, X.length - 1); return Math.sqrt(v) || 1; });
  const Z = X.map((x) => x.map((v, j) => (v - mu[j]) / sd[j]));
  let w = new Array(k).fill(0); let b = Math.log((yv.reduce((a, y) => a + y, 0) + 1) / (yv.length - yv.reduce((a, y) => a + y, 0) + 1));
  for (let it = 0; it < iters; it++) {
    const g = new Array(k + 1).fill(0);
    const H = Array.from({ length: k + 1 }, () => new Array(k + 1).fill(0));
    for (let i = 0; i < Z.length; i++) {
      const z = Z[i]; let s = b; for (let j = 0; j < k; j++) s += w[j] * z[j];
      const pi = sigmoid(s); const r = pi - yv[i]; const v = Math.max(1e-6, pi * (1 - pi));
      for (let j = 0; j < k; j++) g[j] += r * z[j];
      g[k] += r;
      for (let j = 0; j <= k; j++) for (let l = 0; l <= k; l++) H[j][l] += v * (j < k ? z[j] : 1) * (l < k ? z[l] : 1);
    }
    for (let j = 0; j < k; j++) { g[j] += lambda * w[j]; H[j][j] += lambda; }
    H[k][k] += 1e-6;
    const step = solve(H, g);
    if (!step) break;
    let big = 0; for (let j = 0; j < k; j++) { w[j] -= step[j]; big = Math.max(big, Math.abs(step[j])); }
    b -= step[k];
    if (big < 1e-8) break;
  }
  return { names, w, b, mu, sd };
}

export function applyLogistic(m: Logit, s: Sample): number {
  let z = m.b;
  for (let j = 0; j < m.names.length; j++) z += m.w[j] * ((s.f[m.names[j]] - m.mu[j]) / m.sd[j]);
  return sigmoid(z);
}

/** Gaussian elimination with partial pivoting; null when singular. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length; const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}

export { logit, sigmoid };
