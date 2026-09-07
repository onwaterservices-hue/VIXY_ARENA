import React from 'react';
import type { AccessStage, AuthState } from '../../types';
import { Icon, type IconName } from '../common/Icon';

/* =============================================================
   THE DOOR, AS A LINE
   -------------------------------------------------------------
   Four steps, always in this order, always all four visible so a
   reader on step one can see there are exactly three more. The
   stage is whatever the auth source reported; the component
   highlights it and computes nothing.
   ============================================================= */

export const STEPS: { stage: AccessStage; label: string; icon: IconName; detail: string }[] = [
  { stage: 'CREATE_ACCOUNT', label: 'Create account', icon: 'user',   detail: 'An identity for your calls and your record' },
  { stage: 'UNLOCK',         label: 'Unlock',         icon: 'lock',   detail: 'Pay once on Stripe; the backend confirms it' },
  { stage: 'JOIN_DISCORD',   label: 'Join Discord',   icon: 'signals',detail: 'Where the Arena talks between events' },
  { stage: 'OPEN',           label: 'Enter',          icon: 'arena',  detail: 'The terminal, every market, VIXY beside each' },
];

const ORDER: AccessStage[] = ['CREATE_ACCOUNT', 'UNLOCK', 'JOIN_DISCORD', 'OPEN'];

export function AccessSteps({ auth, compact = false }: { auth: AuthState; compact?: boolean }) {
  const at = ORDER.indexOf(auth.access.stage);
  return (
    <ol className={`steps ${compact ? 'is-compact' : ''}`} aria-label="Steps to enter the Arena">
      {STEPS.map((s, i) => {
        const state = i < at ? 'done' : i === at ? 'now' : 'todo';
        return (
          <li key={s.stage} className={`step is-${state}`} aria-current={state === 'now' ? 'step' : undefined}>
            <span className="step-ico">
              {state === 'done' ? <Icon name="check" size={13} /> : <Icon name={s.icon} size={13} />}
            </span>
            <span className="step-txt">
              <b>{i + 1} · {s.label}</b>
              {!compact && <span>{s.detail}</span>}
            </span>
            {i < STEPS.length - 1 && <i className="step-line" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
