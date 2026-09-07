import React, { useEffect, useLayoutEffect, useState } from 'react';
import { Icon } from './Icon';
import { useFocusTrap } from '../../hooks';

/* =============================================================
   GUIDED TOUR
   -------------------------------------------------------------
   Six stops that explain the product's actual argument, not the
   buttons. Runs once, can be replayed from Settings, and never
   blocks the interface — Esc leaves at any point.
   ============================================================= */

interface Step {
  selector: string;
  title: string;
  body: string;
  place?: 'right' | 'left' | 'top' | 'bottom';
}

const STEPS: Step[] = [
  {
    selector: '.hero-core',
    title: 'The core is the engine',
    body: 'It shows what VIXY is doing right now — observing, analysing, confirming, locked, settled. Nothing on it is a prediction; it is the state of the machine.',
    place: 'left',
  },
  {
    selector: '.lp-main .ladder',
    title: 'The whole product, drawn once',
    body: 'Market probability on one marker, VIXY probability on the other, and the edge is the band between them. Every card, row and receipt uses this same figure.',
    place: 'bottom',
  },
  {
    selector: '.rank-strip',
    title: 'Ranked by disagreement',
    body: 'Opportunities are ordered by an edge score that combines size and confidence — and each one carries the evidence lines the engine cited for it.',
    place: 'top',
  },
  {
    selector: '.neural-wrap',
    title: 'The map is a tool',
    body: 'Drag to pan, scroll to zoom, hover to isolate a cluster. Node colour is the market category; link colour is the kind of modeled relationship.',
    place: 'top',
  },
  {
    selector: '.scan-cta',
    title: 'Arena Vision',
    body: 'Screenshot any market on Kalshi or Polymarket and drop it in. The same engine reads it, matches the real market and gives a verdict on the price. It has a tab of its own on the rail.',
    place: 'bottom',
  },
  {
    selector: '.cmd-search',
    title: 'Reach anything in one keystroke',
    body: 'Press ⌘K for markets, screens and actions. Press ? for the full keyboard map. g then a, l, m, s, p or b jumps between screens.',
    place: 'bottom',
  },
  {
    selector: '.origin-badge',
    title: 'This badge is load-bearing',
    body: 'Every value in this build is synthetic and stamped DEMO. The badge is bound to the data provider — it disappears only when a real engine is connected.',
    place: 'bottom',
  },
];

export function Tour({ onDone }: { onDone: () => void }) {
  const trapRef = useFocusTrap<HTMLDivElement>();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const step = STEPS[i];

  useLayoutEffect(() => {
    const el = document.querySelector(step.selector);
    if (!el) { setRect(null); return; }
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    /* the highlight tracks the element while the smooth scroll runs,
       rather than being measured once at a guessed moment */
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    const t = setTimeout(measure, 420);
    return () => {
      clearTimeout(t);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [step.selector]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
      if (e.key === 'ArrowRight' || e.key === 'Enter') setI((v) => (v + 1 < STEPS.length ? v + 1 : v));
      if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  const pad = 10;
  const box = rect
    ? { x: rect.left - pad, y: rect.top - pad, w: rect.width + pad * 2, h: rect.height + pad * 2 }
    : null;

  const place = step.place ?? 'bottom';
  const cardW = 340;
  const cardStyle: React.CSSProperties = (() => {
    if (!box) return { left: '50%', top: '50%', transform: 'translate(-50%,-50%)' };
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = box.x + box.w / 2 - cardW / 2;
    let top = box.y + box.h + 14;
    if (place === 'top') top = box.y - 190;
    if (place === 'left') { left = box.x - cardW - 16; top = box.y + box.h / 2 - 90; }
    if (place === 'right') { left = box.x + box.w + 16; top = box.y + box.h / 2 - 90; }
    left = Math.max(16, Math.min(left, vw - cardW - 16));
    top = Math.max(16, Math.min(top, vh - 220));
    return { left, top };
  })();

  return (
    <div className="tour" ref={trapRef} role="dialog" aria-modal="true"
         aria-label={`Tour step ${i + 1} of ${STEPS.length}`}>
      <svg className="tour-mask" width="100%" height="100%">
        <defs>
          <mask id="tour-cut">
            <rect width="100%" height="100%" fill="#fff" />
            {box && <rect x={box.x} y={box.y} width={box.w} height={box.h} rx="14" fill="#000" />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(2,3,10,0.72)" mask="url(#tour-cut)" />
        {box && (
          <rect x={box.x} y={box.y} width={box.w} height={box.h} rx="14"
                fill="none" stroke="rgba(177,140,255,0.9)" strokeWidth="1.5" className="tour-ring" />
        )}
      </svg>

      <div className="tour-card glass-03" style={cardStyle}>
        <div className="row between g3">
          <span className="t-label">{i + 1} / {STEPS.length}</span>
          <button className="icon-btn tap" onClick={onDone} aria-label="Skip tour"><Icon name="close" size={14} /></button>
        </div>
        <b className="t-h3">{step.title}</b>
        <p className="t-small">{step.body}</p>
        <div className="row between g3">
          <div className="tour-dots">
            {STEPS.map((_, n) => <i key={n} className={n === i ? 'is-on' : ''} />)}
          </div>
          <div className="row g2">
            {i > 0 && <button className="btn btn-sm tap" onClick={() => setI(i - 1)}>Back</button>}
            {i < STEPS.length - 1
              ? <button className="btn btn-sm btn-primary tap" onClick={() => setI(i + 1)}>Next</button>
              : <button className="btn btn-sm btn-primary tap" onClick={onDone}>Enter the Arena</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
