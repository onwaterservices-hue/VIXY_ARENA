import React, { useState } from 'react';
import type { ArenaSnapshot, AuthState } from '../../types';
import { Icon } from '../common/Icon';
import { DoorSide } from './AuthScreen';

/* =============================================================
   PASSWORD RESET — step two of the flow the sign-in screen starts.
   Reached from the emailed link (#/reset/<token>). Same door card,
   same rules: the server validates and burns the token; this screen
   renders what the server answered.
   ============================================================= */
export function ResetScreen({ snapshot, token, onReset, onDone, onBack }: {
  snapshot: ArenaSnapshot | null;
  token: string;
  onReset: (i: { token: string; password: string }) => Promise<AuthState>;
  onDone: () => void;
  onBack: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password !== confirm) { setErr('The two passwords do not match.'); return; }
    setBusy(true); setErr(null);
    try {
      const st = await onReset({ token, password });
      setDone(st.message ?? 'Password updated.');
      setPassword(''); setConfirm('');
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
    finally { setBusy(false); }
  };

  return (
    <div className="door">
      <DoorSide snapshot={snapshot} />
      <div className="door-card glass-03">
        <button className="door-back tap" onClick={onBack} aria-label="Back to sign in">
          <Icon name="chevronL" size={14} />VIXY ARENA
        </button>
        <span className="door-eyebrow"><i />Password reset</span>
        <h1 className="door-title">{done ? 'Done.' : 'Choose a new password.'}</h1>
        {done ? (
          <>
            <p className="t-small">{done}</p>
            <button className="btn btn-primary btn-lg tap" onClick={onDone}><Icon name="arena" size={16} />Continue</button>
          </>
        ) : (
          <form className="door-form" onSubmit={submit} noValidate>
            <label className="door-field">
              <span>New password</span>
              <input className="pf-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                     autoComplete="new-password" placeholder="at least 8 characters" />
            </label>
            <label className="door-field">
              <span>Confirm</span>
              <input className="pf-input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </label>
            {err && <div className="door-err" role="alert"><Icon name="alert" size={13} />{err}</div>}
            <button className="btn btn-primary btn-lg tap door-submit" type="submit" disabled={busy || password.length < 8}>
              {busy ? 'One moment' : 'Set password'}{!busy && <Icon name="chevronR" size={14} />}
            </button>
          </form>
        )}
        <span className="door-note t-nano">Every other session on this account is signed out when the password changes.</span>
      </div>
    </div>
  );
}
