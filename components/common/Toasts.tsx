import React from 'react';
import { Icon } from './Icon';

export interface Toast {
  id: string;
  message: string;
  tone: 'info' | 'good' | 'warn';
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast glass-02 tone-${t.tone}`}>
          <Icon name={t.tone === 'good' ? 'check' : t.tone === 'warn' ? 'refresh' : 'signals'} size={14} />
          <span className="t-small">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
