import React, { useMemo } from 'react';
import type { Momentum } from '../../types';
import { useCanvasScene } from '../../hooks';
import { AdvantageTag, NO_VALUE } from './BroadcastPrimitives';
import { signedPct } from '../../lib/format';

/* =============================================================
   MOMENTUM METER
   -------------------------------------------------------------
   A possession meter for a prediction event. The bias, the side
   and the band all arrive from the engine; the meter draws the
   position and lets particles drift toward whichever side the
   engine says is under pressure.

   With no read, the meter sits at centre, greyed, labelled "--".
   It never drifts to a side it has not been told about.
   ============================================================= */

export function MomentumMeter({ momentum, edgeBps, height = 74, compact = false }: {
  momentum: Momentum | null; edgeBps?: number | null; height?: number; compact?: boolean;
}) {
  const bias = momentum?.biasBps ?? null;
  /* The share of the rail the UP side holds, 0..1. The meter is read like
     a possession bar: the boundary between the two colours IS the head,
     so the coloured area and the marker can never disagree. */
  const pos = bias === null ? 0.5 : Math.min(1, Math.max(0, (bias + 10000) / 20000));
  const side = momentum?.side ?? 'NEUTRAL';
  const known = bias !== null;

  const scene = useMemo(() => {
    /* Particles are seeded once and drift toward the loaded side. They
       carry no information beyond the direction the engine reported —
       they are the visual grammar of pressure, not a second data source. */
    const N = 46;
    const seeds = Array.from({ length: N }, (_, i) => ({
      y: (i * 37 % 100) / 100,
      speed: 0.18 + ((i * 53) % 100) / 320,
      phase: ((i * 71) % 100) / 100,
      size: 0.8 + ((i * 29) % 100) / 90,
    }));
    return (ctx: CanvasRenderingContext2D, t: number, w: number, h: number) => {
      ctx.clearRect(0, 0, w, h);
      if (!known) return;
      /* Up is the left end of the rail, so pressure toward up runs left. */
      const dir = side === 'UP' ? -1 : side === 'DOWN' ? 1 : 0;
      if (dir === 0) return;
      const cx = pos * w;
      ctx.globalCompositeOperation = 'lighter';
      for (const s of seeds) {
        const travel = ((t * s.speed + s.phase) % 1);
        /* particles emerge from the meter head and run outward toward
           the side under pressure, fading as they go */
        const x = cx + dir * travel * (dir > 0 ? w - cx : cx);
        const y = h * (0.16 + s.y * 0.68);
        const fade = Math.sin(travel * Math.PI);
        ctx.beginPath();
        ctx.arc(x, y, s.size * (0.7 + fade), 0, Math.PI * 2);
        ctx.fillStyle = dir < 0
          ? `rgba(43,232,165,${0.10 + fade * 0.34})`
          : `rgba(255,84,112,${0.10 + fade * 0.34})`;
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    };
  }, [pos, side, known]);

  const canvasRef = useCanvasScene(scene, [pos, side, known]);

  return (
    <div className={`mom ${compact ? 'is-compact' : ''} side-${side.toLowerCase()} ${known ? '' : 'is-unknown'}`}>
      <div className="mom-head row between">
        <span className="mom-end t-label">Up side</span>
        <span className="t-label">Momentum</span>
        <span className="mom-end t-label">Down side</span>
      </div>

      <div className="mom-rail" style={{ height }}
           role="img"
           aria-label={known
             ? `Momentum sits toward the ${side.toLowerCase()} side${edgeBps != null ? `, edge ${signedPct(edgeBps)}` : ''}`
             : 'No momentum read yet'}>
        <canvas ref={canvasRef} className="mom-canvas" aria-hidden="true" />
        <span className="mom-track" aria-hidden="true">
          <i className="mom-half up" style={{ width: `${pos * 100}%` }} />
          <i className="mom-half down" style={{ width: `${(1 - pos) * 100}%` }} />
        </span>
        <span className="mom-centre" aria-hidden="true" />
        <span className="mom-head-mark" style={{ left: `${pos * 100}%` }} aria-hidden="true">
          <i />
        </span>
      </div>

      <div className="mom-foot row between">
        <AdvantageTag band={momentum?.band ?? 'NONE'} side={side} />
        <span className="t-num mom-value">
          {edgeBps == null ? NO_VALUE : signedPct(edgeBps)}
        </span>
      </div>
    </div>
  );
}
