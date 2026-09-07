import React from 'react';
import { Icon } from '../common/Icon';
import { LocalPreviewAuthSource } from '../../services/auth/LocalPreviewAuthSource';

/* =============================================================
   DEMO-ONLY CONTROLS
   -------------------------------------------------------------
   Everything that simulates the backend lives in this one module,
   and every import of it is guarded by a build-time literal, so a
   production bundle contains none of it. `npm run verify:prod`
   checks the emitted files for the strings below.
   ============================================================= */

export function SimulatePaymentButton({ busy, onClick, large }: { busy: boolean; onClick: () => void; large?: boolean }) {
  return (
    <button className={`btn ${large ? 'btn-lg' : ''} tap lock-sim`} disabled={busy} onClick={onClick}>
      {large && <Icon name="spark" size={15} />}Simulate a confirmed payment
      <span className="lock-sim-tag">demo only</span>
    </button>
  );
}

export function ResetPreviewButton({ onDone }: { onDone: () => void }) {
  return (
    <button className="btn btn-sm tap lock-sim" onClick={() => { LocalPreviewAuthSource.reset(); onDone(); }}>
      Reset preview account<span className="lock-sim-tag">demo only</span>
    </button>
  );
}
