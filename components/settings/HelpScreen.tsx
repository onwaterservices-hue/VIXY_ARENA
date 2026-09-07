import React from 'react';
import type { ArenaSnapshot } from '../../types';
import { PipelineDiagram } from './PipelineDiagram';
import { HoloPanel } from '../holographic/HoloPanel';
import { SectionHeader } from '../common/Primitives';
import { Icon } from '../common/Icon';

const STEPS = [
  { icon: 'markets' as const, title: 'Markets are made canonical', body: 'Venue markets from Kalshi and Polymarket are normalized into one market object, so the same question from two venues is one row, not two.' },
  { icon: 'brain' as const, title: 'VIXY models its own probability', body: 'The engine produces an independent probability with a model version, a feature set version and the inputs that produced it. No provenance, no display.' },
  { icon: 'signals' as const, title: 'The edge is the disagreement', body: 'Edge is the modeled probability minus the market probability, in basis points. The ladder on every card is that difference drawn to scale.' },
  { icon: 'target' as const, title: 'Ranking explains itself', body: 'Opportunities are ordered by an edge score that combines magnitude and confidence, and every entry carries the evidence lines that produced it.' },
  { icon: 'layers' as const, title: 'Markets can be read side by side', body: 'Compare on the Markets screen puts two to four canonical markets on one frame with a shared vertical scale, so their series can be read against each other rather than each against its own axis.' },
  { icon: 'search' as const, title: 'Arena Vision reads any market you find', body: 'Screenshot a market on Kalshi or Polymarket and drop it on the Arena Vision tab. The engine reads the image, matches the real market, then runs the same model — the screenshot is an input, never the answer.' },
  { icon: 'user' as const, title: 'Four steps in', body: 'Create an account, unlock on Stripe, join the Discord, enter. The stage you are on is reported by the account system; the interface only draws it. Coverage is public; every probability stays behind the door.' },
  { icon: 'lock' as const, title: 'Calls become immutable', body: 'When you make a call it is written as a record. Locking freezes it. Nothing in the interface can rewrite history.' },
  { icon: 'check' as const, title: 'Settlement is verified', body: 'Outcomes are resolved against a source of truth, then measured against what the model said, and that measurement feeds calibration.' },
];

export function HelpScreen({ snapshot }: { snapshot: ArenaSnapshot | null }) {
  return (
    <div className="screen col g5">
      <SectionHeader eyebrow="Orientation" title="How the Arena works" />

      <HoloPanel grade={2} eyebrow="Canonical pipeline" title="Discover → verify → model → compare → detect → rank → record → settle → measure → learn">
        <PipelineDiagram admin={snapshot?.admin ?? null} />
      </HoloPanel>

      <div className="help-grid">
        {STEPS.map((s, i) => (
          <HoloPanel key={s.title} grade={2}>
            <div className="col g3">
              <div className="row between">
                <span className="help-ico"><Icon name={s.icon} size={16} /></span>
                <span className="t-num help-num">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <b className="t-h3">{s.title}</b>
              <p className="t-small">{s.body}</p>
            </div>
          </HoloPanel>
        ))}
      </div>

      <HoloPanel grade={3} active eyebrow="Current status" title="This build is an interface shell">
        <p className="t-small" style={{ maxWidth: 720 }}>
          No venue is connected, no model is registered and no settlement service is running.
          Every number you see is produced by a labeled demo provider so the design can be
          reviewed. Nothing here is market intelligence, and nothing here should be acted on.
        </p>
      </HoloPanel>
    </div>
  );
}
