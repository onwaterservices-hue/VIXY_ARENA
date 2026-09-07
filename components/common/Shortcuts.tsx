import React from 'react';
import { Icon } from './Icon';
import { useFocusTrap } from '../../hooks';

const GROUPS = [
  {
    title: 'Navigation',
    rows: [
      { keys: ['⌘', 'K'], label: 'Command palette — markets, screens, actions' },
      { keys: ['G', 'A'], label: 'Go to Arena' },
      { keys: ['G', 'L'], label: 'Go to Live' },
      { keys: ['G', 'M'], label: 'Go to All Markets' },
      { keys: ['G', 'V'], label: 'Go to Arena Vision' },
      { keys: ['G', 'D'], label: 'Go to the Daily Slate' },
      { keys: ['G', 'S'], label: 'Go to Signals' },
      { keys: ['G', 'P'], label: 'Go to Portfolio' },
      { keys: ['G', 'B'], label: 'Go to VIXY Brain' },
    ],
  },
  {
    title: 'Surface',
    rows: [
      { keys: ['?'], label: 'This panel' },
      { keys: ['⇧', 'B'], label: 'Broadcast mode — camera-ready single market' },
      { keys: ['⇧', 'C'], label: 'Compare — side-by-side board for picked markets' },
      { keys: ['⇧', 'S'], label: 'Arena Vision as a quick overlay — read a market from a screenshot' },
      { keys: ['Esc'], label: 'Close the topmost overlay' },
      { keys: ['↑', '↓'], label: 'Move through palette results' },
      { keys: ['⏎'], label: 'Open the highlighted result' },
    ],
  },
];

export function Shortcuts({ onClose }: { onClose: () => void }) {
  const trapRef = useFocusTrap<HTMLDivElement>();
  return (
    <div className="sheet-scrim modal-scrim" onClick={onClose}>
      <div ref={trapRef} className="shortcuts glass-03" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <header className="row between g3">
          <div className="col" style={{ gap: 2 }}>
            <span className="t-label">Keyboard</span>
            <h3 className="t-h2">Shortcuts</h3>
          </div>
          <button className="icon-btn tap" onClick={onClose} aria-label="Close"><Icon name="close" size={15} /></button>
        </header>
        <div className="shortcut-grid">
          {GROUPS.map((g) => (
            <section key={g.title} className="col g3">
              <span className="t-label">{g.title}</span>
              <ul className="shortcut-list">
                {g.rows.map((r) => (
                  <li key={r.label} className="row between g4">
                    <span className="t-small">{r.label}</span>
                    <span className="row g1">{r.keys.map((k) => <kbd key={k}>{k}</kbd>)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
