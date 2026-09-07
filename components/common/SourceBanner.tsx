import React from 'react';
import type { ArenaSnapshot } from '../../types';
import { Icon } from './Icon';
import { useArenaUI } from './ui-context';

/* Shown only when the health service reports something other than LIVE.
   Degradation is stated plainly and links to where it can be inspected. */
export function SourceBanner({ snapshot }: { snapshot: ArenaSnapshot }) {
  const ui = useArenaUI();
  const bad = snapshot.system.sources.filter((s) => s.status !== 'LIVE');
  if (bad.length === 0) return null;
  return (
    <div className="source-banner glass-01" role="status">
      <Icon name="refresh" size={14} />
      <span className="t-small">
        <b>{bad.length} source{bad.length > 1 ? 's' : ''} degraded</b> — {bad.map((s) => s.label).join(', ')}.
        Values derived from {bad.length > 1 ? 'them' : 'it'} carry the downgraded status.
      </span>
      <button className="btn btn-sm btn-ghost tap" onClick={() => ui.navigate('telemetry')}>Inspect</button>
    </div>
  );
}
