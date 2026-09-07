import React, { useEffect, useRef, useState } from 'react';
import { PredictionCore } from '../holographic/PredictionCore';
import { useReducedMotion } from '../../hooks';
import { PRODUCT } from '../../constants';

/* =============================================================
   BOOT SEQUENCE
   -------------------------------------------------------------
   Shown once per browser, and never under reduced motion. It
   states what actually happened during startup — the contract
   version, the resolved provider, the guards — rather than
   inventing a loading bar for drama.
   ============================================================= */

const STEPS = [
  { label: 'contracts', detail: 'canonical types · integer basis points' },
  { label: 'design tokens', detail: 'color · space · motion · materials' },
  { label: 'data source', detail: 'resolving provider' },
  { label: 'guards', detail: 'origin labeling · no client business rules' },
  { label: 'holographic layer', detail: 'prediction core online' },
];

export function BootSequence({ sourceLabel, fast, onDone }: {
  sourceLabel: string; fast: boolean; onDone: () => void;
}) {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);

  /* onDone is recreated by the parent on every tick of its clock, so it is
     held in a ref: the interval must not be torn down and rebuilt once a
     second, which would restart the sequence part-way through. */
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    if (reduced) { doneRef.current(); return; }
    const id = setInterval(() => setStep((s) => (s >= STEPS.length ? s : s + 1)), fast ? 150 : 330);
    return () => clearInterval(id);
  }, [reduced, fast]);

  /* The exit is its own effect: a state updater has to stay pure, and
     StrictMode double-invokes it in development. */
  useEffect(() => {
    if (reduced || step < STEPS.length) return;
    setLeaving(true);
    const t = setTimeout(() => doneRef.current(), 620);
    return () => clearTimeout(t);
  }, [step, reduced]);

  if (reduced) return null;

  return (
    <div className={`boot-seq ${leaving ? 'is-leaving' : ''}`} role="status" aria-label="Starting VIXY Arena">
      <div className="boot-seq-core">
        <PredictionCore state={step < 3 ? 'OBSERVING' : step < 5 ? 'ANALYZING' : 'CONFIRMING'} size={340} />
      </div>
      <div className="boot-seq-mark col center">
        <span className="boot-seq-word">VIXY<em>ARENA</em></span>
        <span className="t-nano">{PRODUCT.build} · the real-time prediction command center</span>
      </div>
      <ul className="boot-seq-log">
        {STEPS.map((s, i) => (
          <li key={s.label} className={i < step ? 'is-done' : i === step ? 'is-active' : ''}>
            <span className="boot-seq-dot" />
            <span className="boot-seq-label">{s.label}</span>
            <span className="boot-seq-detail t-nano">
              {s.label === 'data source' && i < step ? sourceLabel.toLowerCase() : s.detail}
            </span>
            <span className="boot-seq-state t-nano">{i < step ? 'ok' : i === step ? '…' : ''}</span>
          </li>
        ))}
      </ul>
      <span className="t-nano boot-seq-foot">demo provider · no venue, model or settlement service connected</span>
    </div>
  );
}
