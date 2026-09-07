import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { BrainState } from '../../types';
import { useCanvasScene, useReducedMotion } from '../../hooks';

/* =============================================================
   ARENA ATMOSPHERE
   -------------------------------------------------------------
   The environment the arena sits in: a distant grid plane, slow
   telemetry dust, and — when the engine changes state — a wave
   that crosses the whole space.

   The wave is not decoration on a timer. It fires once per state
   transition the engine reports, so what you see moving through
   the room corresponds to something that actually happened.

   Under reduced motion the grid and dust render as one static
   frame and no wave is emitted at all.
   ============================================================= */

export function Atmosphere({ brainState }: { brainState?: BrainState }) {
  const reduced = useReducedMotion();

  /* Each transition stamps a wave. The stamp is a time, so the scene
     can measure how far the wave has travelled without re-rendering. */
  const waveAt = useRef<number | null>(null);
  const waveTone = useRef<'violet' | 'cyan' | 'edge'>('violet');
  const prevState = useRef<BrainState | undefined>(brainState);
  const [, bump] = useState(0);

  useEffect(() => {
    if (!brainState || reduced) return;
    if (prevState.current === brainState) return;
    prevState.current = brainState;
    waveAt.current = performance.now();
    waveTone.current = brainState === 'LOCKED' ? 'violet'
      : brainState === 'SETTLED' ? 'edge' : 'cyan';
    bump((n) => n + 1);
  }, [brainState, reduced]);
  const dust = useMemo(
    () => Array.from({ length: reduced ? 26 : 78 }, (_, i) => ({
      x: ((i * 61) % 100) / 100,
      y: ((i * 37) % 100) / 100,
      s: 0.2 + ((i * 13) % 60) / 100,
      r: 0.5 + ((i * 7) % 10) / 12,
      p: (i % 17) / 17,
    })),
    [reduced],
  );

  const ref = useCanvasScene((ctx, t, w, h) => {
    /* distant perspective grid, lower third only */
    const horizon = h * 0.72;
    ctx.lineWidth = 1;
    for (let i = 1; i <= 9; i++) {
      const k = i / 9;
      const y = horizon + (h - horizon) * (k * k);
      ctx.strokeStyle = `rgba(120,140,255,${0.05 * (1 - k * 0.7)})`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    const drift = ((t * 6) % 120);
    for (let x = -120; x < w + 240; x += 120) {
      const px = x + drift;
      ctx.strokeStyle = 'rgba(120,140,255,0.035)';
      ctx.beginPath();
      ctx.moveTo(w / 2 + (px - w / 2) * 0.32, horizon);
      ctx.lineTo(px, h);
      ctx.stroke();
    }

    /* telemetry dust */
    for (const d of dust) {
      const y = (d.y + t * 0.004 * d.s) % 1;
      const x = (d.x + Math.sin(t * 0.08 + d.p * 8) * 0.006) % 1;
      const a = 0.10 + 0.22 * Math.abs(Math.sin(t * 0.5 + d.p * 9));
      ctx.beginPath();
      ctx.arc(x * w, (1 - y) * h, d.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(178,140,255,${a})`;
      ctx.fill();
    }

    /* ---- state wave -------------------------------------------
       One expanding ring from the centre of the arena, 1.4s, then
       gone. LOCKED contracts instead of expanding: the arena draws
       in toward the decision rather than radiating away from it. */
    const stamp = waveAt.current;
    if (stamp !== null) {
      const age = (performance.now() - stamp) / 1000;
      if (age > 1.5) {
        waveAt.current = null;
      } else {
        const k = age / 1.5;
        const tone = waveTone.current;
        const inward = tone === 'violet';
        const maxR = Math.hypot(w, h) * 0.62;
        const r = inward ? maxR * (1 - k * 0.82) : maxR * k;
        const alpha = (1 - k) * (inward ? 0.30 : 0.20);
        const rgb = tone === 'violet' ? '177,140,255'
          : tone === 'edge' ? '43,232,165' : '55,228,245';
        ctx.save();
        ctx.lineWidth = inward ? 2 : 1.4;
        ctx.strokeStyle = `rgba(${rgb},${alpha})`;
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.44, Math.max(1, r), 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(${rgb},${alpha * 0.5})`;
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.44, Math.max(1, r * (inward ? 1.12 : 0.88)), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  });

  return (
    <>
      <div className="vx-atmosphere" />
      <canvas ref={ref} className="vx-atmosphere-canvas" aria-hidden="true" />
    </>
  );
}
