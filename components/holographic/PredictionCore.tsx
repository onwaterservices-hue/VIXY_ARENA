import React, { useMemo } from 'react';
import type { BrainState } from '../../types';
import { useCanvasScene, useReducedMotion } from '../../hooks';

/* =============================================================
   PREDICTION CORE
   -------------------------------------------------------------
   A single canvas: neural sphere, orbital rings, particle field
   and signal propagation. The five VIXY states each have their
   own physics — the object tells you what the engine is doing
   before you read a word of it.

   Cost control: one 2D context, capped DPR, geometry precomputed
   once, paused off-screen and under prefers-reduced-motion.
   ============================================================= */

type RGB = [number, number, number];

const PALETTE: Record<BrainState, { core: RGB; mesh: RGB; accent: RGB; spin: number; energy: number }> = {
  OBSERVING:  { core: [138, 92, 255], mesh: [120, 132, 220], accent: [61, 123, 255], spin: 0.10, energy: 0.42 },
  ANALYZING:  { core: [150, 110, 255], mesh: [90, 190, 240], accent: [55, 228, 245], spin: 0.30, energy: 1.00 },
  COMPARING:  { core: [140, 150, 255], mesh: [110, 160, 235], accent: [61, 123, 255], spin: 0.22, energy: 0.86 },
  CONFIRMING: { core: [177, 140, 255], mesh: [140, 130, 255], accent: [55, 228, 245], spin: 0.18, energy: 0.78 },
  LOCKED:     { core: [190, 160, 255], mesh: [150, 140, 255], accent: [138, 92, 255], spin: 0.05, energy: 0.55 },
  SETTLING:   { core: [150, 210, 220], mesh: [130, 170, 215], accent: [43, 232, 165], spin: 0.12, energy: 0.48 },
  SETTLED:    { core: [120, 220, 200], mesh: [110, 170, 200], accent: [43, 232, 165], spin: 0.03, energy: 0.30 },
};

const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

interface Pt { x: number; y: number; z: number }

function fibonacciSphere(n: number): Pt[] {
  const pts: Pt[] = [];
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const t = phi * i;
    pts.push({ x: Math.cos(t) * r, y, z: Math.sin(t) * r });
  }
  return pts;
}

export function PredictionCore({
  state, size = 420, className = '',
}: { state: BrainState; size?: number; className?: string }) {
  const reduced = useReducedMotion();

  const geometry = useMemo(() => {
    const nodes = fibonacciSphere(reduced ? 110 : 190);
    const links: [number, number][] = [];
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const near = nodes
        .map((b, j) => ({ j, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2 }))
        .filter((e) => e.j !== i)
        .sort((p, q) => p.d - q.d)
        .slice(0, 3);
      for (const { j } of near) if (i < j) links.push([i, j]);
    }
    const dust = Array.from({ length: reduced ? 30 : 90 }, (_, i) => ({
      a: (i / 90) * Math.PI * 2,
      r: 0.72 + ((i * 37) % 100) / 240,
      s: 0.22 + ((i * 17) % 100) / 320,
      y: (((i * 53) % 100) / 100 - 0.5) * 1.5,
      z: ((i * 29) % 100) / 100,
    }));
    return { nodes, links, dust };
  }, [reduced]);

  const ref = useCanvasScene((ctx, t, w, h) => {
    const p = PALETTE[state];
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) * 0.30;
    const spin = t * p.spin * 2 * Math.PI * 0.22;
    const tilt = 0.34 + Math.sin(t * 0.24) * 0.07;
    const breathe = 1 + Math.sin(t * (state === 'ANALYZING' ? 2.2 : 0.9)) * (state === 'LOCKED' ? 0.006 : 0.018);
    const pulse = (Math.sin(t * 1.6) + 1) / 2;

    const project = (pt: Pt) => {
      const sx = pt.x * Math.cos(spin) + pt.z * Math.sin(spin);
      const sz = -pt.x * Math.sin(spin) + pt.z * Math.cos(spin);
      const sy = pt.y * Math.cos(tilt) - sz * Math.sin(tilt);
      const dz = pt.y * Math.sin(tilt) + sz * Math.cos(tilt);
      const persp = 1 / (1.9 - dz * 0.45);
      return { x: cx + sx * R * breathe * persp * 1.9, y: cy + sy * R * breathe * persp * 1.9, d: dz };
    };

    /* --- volumetric halo ---------------------------------- */
    const halo = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 2.5);
    halo.addColorStop(0, rgba(p.core, 0.20 + pulse * 0.06 * p.energy));
    halo.addColorStop(0.45, rgba(p.accent, 0.06));
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);

    /* everything below is emissive: additive compositing is what
       makes a hologram read as light rather than paint */
    ctx.globalCompositeOperation = 'lighter';

    /* --- containment ring --------------------------------- */
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.98, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(p.mesh, 0.09);
    ctx.lineWidth = 1;
    ctx.stroke();

    /* --- orbital rings ------------------------------------ */
    for (let k = 0; k < 3; k++) {
      const rr = R * (1.32 + k * 0.30);
      const ringTilt = 0.9 + k * 0.5 + Math.sin(t * 0.16 + k) * 0.1;
      const phase = spin * (k % 2 === 0 ? 1 : -0.7) + k;
      ctx.beginPath();
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        const x = Math.cos(a) * rr;
        const z = Math.sin(a) * rr;
        const rx = x * Math.cos(phase) + z * Math.sin(phase);
        const rz = -x * Math.sin(phase) + z * Math.cos(phase);
        const px = cx + rx;
        const py = cy + rz * Math.sin(ringTilt) * 0.42;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = rgba(p.mesh, 0.16 + k * 0.04);
      ctx.lineWidth = 1;
      ctx.stroke();

      // traveling node on the ring
      const na = t * (0.5 + k * 0.22) + k * 2;
      const nx = Math.cos(na) * rr, nz = Math.sin(na) * rr;
      const rx = nx * Math.cos(phase) + nz * Math.sin(phase);
      const rz = -nx * Math.sin(phase) + nz * Math.cos(phase);
      const px = cx + rx, py = cy + rz * Math.sin(ringTilt) * 0.42;
      ctx.beginPath();
      ctx.arc(px, py, 2.1, 0, Math.PI * 2);
      ctx.fillStyle = rgba(p.accent, 0.9);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fillStyle = rgba(p.accent, 0.14);
      ctx.fill();
    }

    /* --- particle dust ------------------------------------ */
    for (const d of geometry.dust) {
      const a = d.a + t * d.s * (0.4 + p.energy);
      const rr = R * (1.05 + d.r * 0.9);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr * 0.5 + d.y * R * 0.5;
      const tw = 0.22 + 0.5 * Math.abs(Math.sin(t * 1.4 + d.z * 6));
      ctx.beginPath();
      ctx.arc(x, y, 0.85, 0, Math.PI * 2);
      ctx.fillStyle = rgba(p.mesh, tw * (0.45 + p.energy * 0.4));
      ctx.fill();
    }

    /* --- neural mesh -------------------------------------- */
    const proj = geometry.nodes.map(project);
    ctx.lineWidth = 0.7;
    for (const [i, j] of geometry.links) {
      const a = proj[i], b = proj[j];
      const depth = (a.d + b.d) / 2;
      const alpha = (0.13 + (depth + 1) * 0.20) * (0.55 + p.energy * 0.45);
      ctx.strokeStyle = rgba(p.mesh, alpha * 0.8);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    /* --- signal propagation ------------------------------- */
    const pulses = state === 'ANALYZING' ? 7
      : state === 'COMPARING' ? 6
      : state === 'CONFIRMING' ? 4
      : state === 'SETTLING' ? 3
      : state === 'OBSERVING' ? 2 : 1;
    for (let s = 0; s < pulses; s++) {
      const idx = Math.floor(Math.abs(t * (0.6 + s * 0.31) + s * 13) % geometry.links.length);
      const link = geometry.links[idx];
      if (!link) continue;
      const [i, j] = link;
      const a = proj[i], b = proj[j];
      const f = ((t * (1.4 + s * 0.2) + s) % 1);
      const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = rgba(p.accent, 0.95);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = rgba(p.accent, 0.13);
      ctx.fill();
    }

    /* --- nodes -------------------------------------------- */
    for (const q of proj) {
      const front = (q.d + 1) / 2;
      ctx.beginPath();
      ctx.arc(q.x, q.y, 0.8 + front * 1.3, 0, Math.PI * 2);
      ctx.fillStyle = rgba(p.core, 0.34 + front * 0.72);
      ctx.fill();
    }

    /* --- state geometry ----------------------------------- */
    if (state === 'ANALYZING') {
      // scanning plane through the sphere
      const sy = cy + Math.sin(t * 1.25) * R * 1.05;
      const grad = ctx.createLinearGradient(cx - R * 1.6, sy, cx + R * 1.6, sy);
      grad.addColorStop(0, 'rgba(55,228,245,0)');
      grad.addColorStop(0.5, 'rgba(55,228,245,0.5)');
      grad.addColorStop(1, 'rgba(55,228,245,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(cx - R * 1.6, sy);
      ctx.lineTo(cx + R * 1.6, sy);
      ctx.stroke();
    }
    if (state === 'COMPARING') {
      /* Two arcs sweeping toward each other and meeting: the engine holding
         its own read against the venues'. They converge, they do not merge —
         a disagreement is the product, not a failure. */
      const k = (t % 2.6) / 2.6;
      const gap = (1 - k) * Math.PI * 0.66;
      const rr = R * 1.46;
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        const mid = dir > 0 ? 0 : Math.PI;
        ctx.arc(cx, cy, rr, mid - Math.PI * 0.34 + gap * dir, mid + Math.PI * 0.34 + gap * dir);
        ctx.strokeStyle = rgba(dir > 0 ? p.accent : p.core, 0.30 + (1 - k) * 0.35);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    if (state === 'SETTLING') {
      /* A ring closing in on the sphere: the outcome resolving. It stops
         short of the surface, because settling is not yet settled. */
      const k = (t % 1.9) / 1.9;
      const rr = R * (1.9 - k * 0.42);
      ctx.beginPath();
      ctx.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
      ctx.strokeStyle = rgba(p.accent, 0.22 + k * 0.34);
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    if (state === 'CONFIRMING') {
      const k = (t % 2.2) / 2.2;
      const rr = R * (2.0 - k * 0.72);
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(p.accent, 0.45 * (1 - k));
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    if (state === 'LOCKED') {
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(a) * R * 1.62, y = cy + Math.sin(a) * R * 1.62;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = rgba(p.core, 0.5 + pulse * 0.2);
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    if (state === 'SETTLED') {
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 1);
      ctx.strokeStyle = rgba(p.accent, 0.34);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    /* --- core -------------------------------------------- */
    const coreR = R * (0.30 + pulse * 0.03 * p.energy);
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.4);
    cg.addColorStop(0, rgba(p.core, 0.92));
    cg.addColorStop(0.28, rgba(p.core, 0.32));
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR * 2.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
  }, [state]);

  return (
    <canvas
      ref={ref}
      className={`prediction-core ${className}`}
      style={{ width: '100%', height: size, maxWidth: '100%' }}
      aria-hidden="true"
    />
  );
}
