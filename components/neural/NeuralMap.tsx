import React, { useCallback, useRef, useState } from 'react';
import type { MarketCategory, NeuralGraph, NeuralNode } from '../../types';
import { useCanvasScene } from '../../hooks';
import { Icon } from '../common/Icon';
import { pct } from '../../lib/format';

/* =============================================================
   NEURAL MARKET MAP
   -------------------------------------------------------------
   Nodes are markets, links are modeled relationships. Layout and
   strengths come from the data source; this component draws,
   pans, zooms and reports hover. It asserts nothing itself.
   ============================================================= */

const KIND_COLOR: Record<string, string> = {
  CORRELATION: '138,92,255',
  MOMENTUM: '55,228,245',
  LIQUIDITY: '61,123,255',
  INFLUENCE: '177,140,255',
};

const CATEGORY_COLOR: Record<MarketCategory, string> = {
  SPORTS: '55,228,245',
  CRYPTO: '177,140,255',
  ECONOMICS: '61,123,255',
  POLITICS: '138,92,255',
  CULTURE: '255,176,32',
  WEATHER: '43,232,165',
  FINANCE: '61,123,255',
  ENTERTAINMENT: '255,176,32',
  SCIENCE: '55,228,245',
  TECHNOLOGY: '177,140,255',
  WORLD: '138,92,255',
  OTHER: '138,92,255',
};

const MIN_SCALE = 0.65;
const MAX_SCALE = 3.2;

export function NeuralMap({
  graph, height = 420, onSelect, selectedId,
}: {
  graph: NeuralGraph; height?: number;
  onSelect?: (node: NeuralNode) => void; selectedId?: string | null;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<{ node: NeuralNode; x: number; y: number } | null>(null);
  const [zoomLabel, setZoomLabel] = useState(1);
  const hoverId = useRef<string | null>(null);
  const boxRef = useRef({ w: 0, h: 0 });
  const view = useRef({ scale: 1, ox: 0, oy: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const project = (n: { x: number; y: number }) => ({
    x: n.x * boxRef.current.w * view.current.scale + view.current.ox,
    y: n.y * boxRef.current.h * view.current.scale + view.current.oy,
  });

  const ref = useCanvasScene((ctx, t, w, h) => {
    boxRef.current = { w, h };
    const { scale, ox, oy } = view.current;
    const px = (n: { x: number; y: number }) => ({ x: n.x * w * scale + ox, y: n.y * h * scale + oy });
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));

    const focusId = hoverId.current ?? selectedId ?? null;
    const neighbours = new Set<string>();
    if (focusId) {
      neighbours.add(focusId);
      for (const e of graph.edges) {
        if (e.from === focusId) neighbours.add(e.to);
        if (e.to === focusId) neighbours.add(e.from);
      }
    }

    /* links */
    for (let i = 0; i < graph.edges.length; i++) {
      const e = graph.edges[i];
      const a = byId.get(e.from), b = byId.get(e.to);
      if (!a || !b) continue;
      const pa = px(a), pb = px(b);
      const mag = Math.abs(e.strength);
      const focus = focusId === e.from || focusId === e.to;
      const dim = focusId !== null && !focus;
      const base = focus ? 0.62 : dim ? 0.05 : 0.18 + mag * 0.24;
      const rgb = KIND_COLOR[e.kind] ?? '138,92,255';

      ctx.strokeStyle = `rgba(${rgb},${base})`;
      ctx.lineWidth = focus ? 1.6 * Math.min(1.6, scale) : 1;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      const mx = (pa.x + pb.x) / 2 + (pb.y - pa.y) * 0.10;
      const my = (pa.y + pb.y) / 2 - (pb.x - pa.x) * 0.10;
      ctx.quadraticCurveTo(mx, my, pb.x, pb.y);
      ctx.stroke();

      if (!dim) {
        const f = ((t * (0.16 + mag * 0.32) + i * 0.17) % 1);
        const q = 1 - f;
        const sx = q * q * pa.x + 2 * q * f * mx + f * f * pb.x;
        const sy = q * q * pa.y + 2 * q * f * my + f * f * pb.y;
        ctx.beginPath();
        ctx.arc(sx, sy, focus ? 2.4 : 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb},${focus ? 0.95 : 0.5})`;
        ctx.fill();
      }
    }

    /* nodes */
    for (const n of graph.nodes) {
      const p = px(n);
      const r = (4 + n.weight * 8) * Math.min(1.5, scale);
      const act = n.activityBps / 10000;
      const focus = hoverId.current === n.id || selectedId === n.id;
      const dim = focusId !== null && !neighbours.has(n.id);
      const breathe = 1 + Math.sin(t * 1.5 + n.x * 8) * 0.06;
      const rgb = CATEGORY_COLOR[n.category] ?? '138,92,255';
      const alpha = dim ? 0.18 : 1;

      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2 * breathe);
      g.addColorStop(0, `rgba(${rgb},${(0.30 + act * 0.28) * alpha})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 3.2 * breathe, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, r * breathe, 0, Math.PI * 2);
      ctx.fillStyle = focus ? 'rgba(238,236,255,0.98)' : `rgba(${rgb},${(0.62 + act * 0.3) * alpha})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, r * breathe + 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = focus ? 'rgba(255,255,255,0.85)' : `rgba(160,172,255,${0.22 * alpha})`;
      ctx.lineWidth = focus ? 1.4 : 0.8;
      ctx.stroke();

      if (!dim || focus) {
        ctx.font = `500 ${Math.round(9.5 * Math.min(1.4, scale))}px ui-monospace, "SF Mono", Menlo, monospace`;
        ctx.fillStyle = focus ? 'rgba(234,235,255,0.98)' : `rgba(153,160,204,${0.72 * alpha})`;
        ctx.textAlign = 'center';
        ctx.fillText(n.symbol, p.x, p.y + r + 15);
      }
    }
  }, [graph.nodes.length, selectedId]);

  const pick = useCallback((clientX: number, clientY: number) => {
    const el = wrapRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    let best: { node: NeuralNode; d: number } | null = null;
    for (const n of graph.nodes) {
      const p = project(n);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < 26 && (!best || d < best.d)) best = { node: n, d };
    }
    return best ? { node: best.node, x, y } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.nodes]);

  const zoomBy = (factor: number, cx?: number, cy?: number) => {
    const v = view.current;
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor));
    const mx = cx ?? boxRef.current.w / 2;
    const my = cy ?? boxRef.current.h / 2;
    v.ox = mx - ((mx - v.ox) / v.scale) * next;
    v.oy = my - ((my - v.oy) / v.scale) * next;
    v.scale = next;
    setZoomLabel(next);
  };

  const reset = () => { view.current = { scale: 1, ox: 0, oy: 0 }; setZoomLabel(1); };

  return (
    <div
      ref={wrapRef}
      className="neural-wrap"
      style={{ height }}
      onWheel={(e) => {
        const rect = wrapRef.current!.getBoundingClientRect();
        zoomBy(e.deltaY < 0 ? 1.12 : 0.89, e.clientX - rect.left, e.clientY - rect.top);
      }}
      onPointerDown={(e) => {
        const hit = pick(e.clientX, e.clientY);
        if (hit) return;
        drag.current = { x: e.clientX, y: e.clientY, ox: view.current.ox, oy: view.current.oy };
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      }}
      onPointerUp={(e) => {
        drag.current = null;
        try { (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
      }}
      onPointerMove={(e) => {
        if (drag.current) {
          view.current.ox = drag.current.ox + (e.clientX - drag.current.x);
          view.current.oy = drag.current.oy + (e.clientY - drag.current.y);
          return;
        }
        const hit = pick(e.clientX, e.clientY);
        hoverId.current = hit?.node.id ?? null;
        setHover(hit);
      }}
      onPointerLeave={() => { hoverId.current = null; setHover(null); drag.current = null; }}
      onDoubleClick={reset}
      onClick={(e) => {
        const hit = pick(e.clientX, e.clientY);
        if (hit && onSelect) onSelect(hit.node);
      }}
    >
      <canvas ref={ref} className="neural-canvas" role="img"
              aria-label={`Relationship graph: ${graph.nodes.length} canonical markets, `
                + `${graph.edges.length} modeled links. The list below carries the same nodes.`} />
      <ul className="sr-only">
        {graph.nodes.map((n) => (
          <li key={n.id}>
            <button type="button" onClick={() => onSelect?.(n)}
                    aria-pressed={selectedId === n.id}>
              {n.symbol} · {n.label} · {n.category} · activity {Math.round(n.activityBps / 100)}%
            </button>
          </li>
        ))}
      </ul>

      <div className="neural-controls">
        <button className="icon-btn tap" onClick={(e) => { e.stopPropagation(); zoomBy(1.2); }} aria-label="Zoom in">
          <Icon name="plus" size={14} />
        </button>
        <button className="icon-btn tap" onClick={(e) => { e.stopPropagation(); zoomBy(0.83); }} aria-label="Zoom out">
          <span className="minus" />
        </button>
        <button className="icon-btn tap" onClick={(e) => { e.stopPropagation(); reset(); }} aria-label="Reset view">
          <Icon name="refresh" size={13} />
        </button>
        <span className="t-nano neural-zoom">{zoomLabel.toFixed(1)}×</span>
      </div>

      {hover && (
        <div
          className="neural-tip glass-03"
          style={{
            left: Math.min(Math.max(hover.x + 16, 8), Math.max(8, boxRef.current.w - 250)),
            top: Math.min(Math.max(hover.y - 12, 8), Math.max(8, boxRef.current.h - 140)),
          }}
        >
          <div className="row between g3">
            <span className="t-h3">{hover.node.symbol}</span>
            <span className="t-nano">{hover.node.category}</span>
          </div>
          <div className="t-small" style={{ marginTop: 4 }}>{hover.node.label}</div>
          <div className="row between" style={{ marginTop: 10 }}>
            <span className="t-label">Node activity</span>
            <span className="t-num" style={{ fontSize: 'var(--t-small)' }}>{pct(hover.node.activityBps, 0)}</span>
          </div>
          <div className="meter" style={{ marginTop: 6 }}>
            <i style={{ width: `${hover.node.activityBps / 100}%` }} />
          </div>
          <div className="t-nano" style={{ marginTop: 8 }}>
            {graph.edges.filter((e) => e.from === hover.node.id || e.to === hover.node.id).length} modeled links · click to inspect
          </div>
        </div>
      )}
    </div>
  );
}
