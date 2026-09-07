import React from 'react';
import type { AdminOverview } from '../../types';

/* =============================================================
   PIPELINE DIAGRAM
   -------------------------------------------------------------
   The canonical pipeline, drawn from the same job states the
   admin console reads. A stage is only "running" here if the
   engine says it is running there.
   ============================================================= */

type State = 'RUNNING' | 'IDLE' | 'PAUSED' | 'FAILED';

interface Stage {
  id: string;
  label: string;
  sub: string;
  x: number;
  y: number;
  job?: string;
}

const W = 1220;
const H = 430;
const BW = 168;
const BH = 66;

const STAGES: Stage[] = [
  { id: 'kalshi',    label: 'Kalshi',        sub: 'venue',              x: 24,  y: 40,  job: 'ingest' },
  { id: 'poly',      label: 'Polymarket',    sub: 'venue',              x: 24,  y: 140, job: 'ingest' },
  { id: 'events',    label: 'Event data',    sub: 'real-world facts',   x: 24,  y: 262, job: 'ingest' },
  { id: 'ingest',    label: 'Ingest',        sub: 'normalize · dedupe', x: 236, y: 90,  job: 'ingest' },
  { id: 'canonical', label: 'Canonical',     sub: 'one market object',  x: 434, y: 90,  job: 'match' },
  { id: 'model',     label: 'VIXY model',    sub: 'own probability',    x: 632, y: 90,  job: 'intel' },
  { id: 'edge',      label: 'Edge engine',   sub: 'model − market',     x: 830, y: 90,  job: 'intel' },
  { id: 'rank',      label: 'Ranking',       sub: 'edge score',         x: 1028, y: 90, job: 'intel' },
  { id: 'record',    label: 'Call record',   sub: 'immutable',          x: 1028, y: 262, job: 'lifecycle' },
  { id: 'settle',    label: 'Settlement',    sub: 'verified outcome',   x: 830, y: 262, job: 'settle' },
  { id: 'measure',   label: 'Calibration',   sub: 'measure · learn',    x: 632, y: 262, job: 'health' },
];

const LINKS: [string, string][] = [
  ['kalshi', 'ingest'], ['poly', 'ingest'], ['events', 'ingest'],
  ['ingest', 'canonical'], ['canonical', 'model'], ['model', 'edge'],
  ['edge', 'rank'], ['rank', 'record'], ['record', 'settle'], ['settle', 'measure'],
];

const TONE: Record<State, { stroke: string; fill: string; dot: string; label: string }> = {
  RUNNING: { stroke: 'rgba(43,232,165,0.55)', fill: 'rgba(43,232,165,0.07)', dot: 'var(--vx-edge)', label: 'running' },
  IDLE:    { stroke: 'rgba(160,172,255,0.26)', fill: 'rgba(160,172,255,0.04)', dot: 'var(--vx-neutral)', label: 'idle' },
  PAUSED:  { stroke: 'rgba(255,176,32,0.42)', fill: 'rgba(255,176,32,0.05)', dot: 'var(--vx-warn)', label: 'paused' },
  FAILED:  { stroke: 'rgba(255,84,112,0.5)', fill: 'rgba(255,84,112,0.06)', dot: 'var(--vx-risk)', label: 'failed' },
};

export function PipelineDiagram({ admin }: { admin: AdminOverview | null }) {
  /* No snapshot (the reader is outside the gate): every stage reads IDLE and
     the legend still says where the state would come from. */
  const jobState = (key?: string): State => {
    const job = admin?.jobs.find((j) => j.key === key);
    return (job?.state as State) ?? 'IDLE';
  };
  const box = (id: string) => STAGES.find((s) => s.id === id)!;

  const path = (from: Stage, to: Stage) => {
    const x1 = from.x + BW, y1 = from.y + BH / 2;
    const x2 = to.x, y2 = to.y + BH / 2;
    if (to.x < from.x) {
      // right-to-left leg of the loop
      const fx = from.x, fy = from.y + BH / 2;
      const tx = to.x + BW, ty = to.y + BH / 2;
      const mid = (fx + tx) / 2;
      return `M${fx},${fy} C${mid},${fy} ${mid},${ty} ${tx},${ty}`;
    }
    if (Math.abs(y1 - y2) < 4) return `M${x1},${y1} L${x2},${y2}`;
    const mx = (x1 + x2) / 2;
    return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  };

  return (
    <div className="pipeline-diagram">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="VIXY Arena canonical pipeline">
        <defs>
          <marker id="pl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="rgba(160,172,255,0.45)" />
          </marker>
        </defs>

        {LINKS.map(([a, b]) => (
          <path key={`${a}-${b}`} d={path(box(a), box(b))} fill="none"
                stroke="rgba(160,172,255,0.24)" strokeWidth="1.4" markerEnd="url(#pl-arrow)" />
        ))}

        {/* feedback: calibration → model */}
        <path d={`M${box('measure').x + BW / 2},${box('measure').y} L${box('measure').x + BW / 2},${box('model').y + BH}`}
              fill="none" stroke="rgba(138,92,255,0.42)" strokeWidth="1.4" strokeDasharray="5 4"
              markerEnd="url(#pl-arrow)" />
        <text x={box('measure').x + BW / 2 + 10} y={(box('measure').y + box('model').y + BH) / 2}
              className="pl-note">learning loop</text>

        {STAGES.map((s) => {
          const state = jobState(s.job);
          const tone = TONE[state];
          return (
            <g key={s.id}>
              <rect x={s.x} y={s.y} width={BW} height={BH} rx="10"
                    fill={tone.fill} stroke={tone.stroke} strokeWidth="1.2" />
              <circle cx={s.x + 14} cy={s.y + 16} r="3.4" fill={tone.dot} />
              <text x={s.x + 26} y={s.y + 20} className="pl-state">{tone.label}</text>
              <text x={s.x + 14} y={s.y + 42} className="pl-label">{s.label}</text>
              <text x={s.x + 14} y={s.y + 57} className="pl-sub">{s.sub}</text>
            </g>
          );
        })}
      </svg>
      <div className="pl-legend row g4 wrap">
        {(Object.keys(TONE) as State[]).map((k) => (
          <span key={k} className="row g2 t-nano">
            <i className="pl-dot" style={{ background: TONE[k].dot }} />{TONE[k].label}
          </span>
        ))}
        <span className="t-nano">state read from the engine's job table — nothing here is decorative</span>
      </div>
    </div>
  );
}
