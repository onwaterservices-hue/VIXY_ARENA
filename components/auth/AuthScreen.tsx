import React, { useState } from 'react';
import type { ArenaSnapshot, AuthState } from '../../types';
import { PredictionCore } from '../holographic/PredictionCore';
import { Icon } from '../common/Icon';
import { AccessSteps } from '../access/AccessSteps';

/* =============================================================
   THE DOOR
   -------------------------------------------------------------
   Step one of four. Create an account or sign in; nothing else
   is asked here and nothing else is on the screen, because a
   reader at a door wants the handle, not a brochure.

   The form is a form. It hands what was typed to the auth source
   and shows what came back. It never compares a password, never
   decides a handle is taken, never reads a session from anywhere
   but the source — that is the source's job, and in production
   the source is a backend.
   ============================================================= */

export function DoorSide({ snapshot }: { snapshot: ArenaSnapshot | null }) {
  return (
    <aside className="door-side" aria-hidden="true">
      <PredictionCore state={snapshot?.brain.state ?? 'OBSERVING'} size={360} />
      <div className="door-side-copy">
        <span className="door-eyebrow"><i />VIXY ARENA</span>
        <b>Every prediction market.<br />One AI analyst.</b>
        <span>Sports · Politics · Weather · Crypto · Macro · Entertainment · World events</span>
      </div>
    </aside>
  );
}

type Mode = 'CREATE' | 'SIGN_IN';

export function AuthScreen({ snapshot, auth, sourceLabel, initialMode, onSignUp, onSignIn, onForgot, onContinue, onBack }: {
  snapshot: ArenaSnapshot | null;
  /** `signin` when the reader arrived by the Sign in link. */
  initialMode?: 'signin' | 'create';
  auth: AuthState;
  sourceLabel: string;
  onSignUp: (i: { email: string; password: string; handle: string }) => Promise<unknown>;
  onSignIn: (i: { email: string; password: string }) => Promise<unknown>;
  onForgot: (email: string) => Promise<{ message: string }>;
  onContinue: () => void;
  onBack: () => void;
}) {
  /* The source says which of the two makes sense; a fresh browser gets
     Create, one with an account gets Sign in. The reader can flip. */
  const [mode, setMode] = useState<Mode>(() => (initialMode === 'signin' || (auth.actions.signIn && !auth.actions.signUp) ? 'SIGN_IN' : 'CREATE'));
  const [email, setEmail] = useState('');
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const forgot = async () => {
    if (busy) return;
    setBusy(true); setErr(null); setNote(null);
    try { setNote((await onForgot(email)).message); }
    catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
    finally { setBusy(false); }
  };

  const canAct = mode === 'CREATE' ? auth.actions.signUp : auth.actions.signIn;
  const configured = auth.status === 'READY';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !canAct) return;
    setBusy(true); setErr(null);
    try {
      if (mode === 'CREATE') await onSignUp({ email, password, handle });
      else await onSignIn({ email, password });
      setPassword('');
      onContinue();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  /* Already inside: the door has nothing to ask. */
  if (auth.session) {
    return (
      <div className="door">
        <DoorSide snapshot={snapshot} />
        <div className="door-card glass-03">
          <span className="door-eyebrow"><i />Signed in</span>
          <h1 className="door-title">Welcome back, {auth.session.handle}.</h1>
          <AccessSteps auth={auth} />
          <button className="btn btn-primary btn-lg tap" onClick={onContinue}>
            <Icon name="arena" size={16} />Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="door">
      <DoorSide snapshot={snapshot} />

      <div className="door-card glass-03">
        <button className="door-back tap" onClick={onBack} aria-label="Back to the front page">
          <Icon name="chevronL" size={14} />VIXY ARENA
        </button>

        <span className="door-eyebrow"><i />Step 1 of 4</span>
        <h1 className="door-title">
          {mode === 'CREATE' ? 'Create your account.' : 'Sign in.'}
        </h1>
        <p className="door-lede">
          One terminal for every prediction market, and an AI that tells you where the crowd
          has it wrong. Your account is where your calls and your record live.
        </p>

        <AccessSteps auth={auth} compact />

        <div className="door-tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'CREATE'} className={`tap ${mode === 'CREATE' ? 'is-on' : ''}`}
                  onClick={() => { setMode('CREATE'); setErr(null); }}>Create account</button>
          <button role="tab" aria-selected={mode === 'SIGN_IN'} className={`tap ${mode === 'SIGN_IN' ? 'is-on' : ''}`}
                  onClick={() => { setMode('SIGN_IN'); setErr(null); }}>Sign in</button>
        </div>

        <form className="door-form" onSubmit={submit} noValidate>
          {mode === 'CREATE' && (
            <label className="door-field">
              <span>Handle</span>
              <input className="pf-input" value={handle} onChange={(e) => setHandle(e.target.value)}
                     autoComplete="username" placeholder="how the board will know you" maxLength={20}
                     disabled={!canAct} />
            </label>
          )}
          <label className="door-field">
            <span>Email</span>
            <input className="pf-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                   autoComplete="email" placeholder="you@domain.com"
                   disabled={!canAct && !(mode === 'SIGN_IN' && configured)} />
          </label>
          <label className="door-field">
            <span>Password</span>
            <input className="pf-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                   autoComplete={mode === 'CREATE' ? 'new-password' : 'current-password'}
                   placeholder={mode === 'CREATE' ? 'at least 8 characters' : ''} disabled={!canAct} />
          </label>

          {err && <div className="door-err" role="alert"><Icon name="alert" size={13} />{err}</div>}
          {note && <div className="door-note t-micro" role="status">{note}</div>}

          <button className="btn btn-primary btn-lg tap door-submit" type="submit" disabled={!canAct || busy}>
            {busy ? 'One moment' : mode === 'CREATE' ? 'Create account' : 'Sign in'}
            {!busy && <Icon name="chevronR" size={14} />}
          </button>
          {mode === 'SIGN_IN' && (
            <button type="button" className="btn btn-ghost btn-sm tap door-forgot" onClick={forgot} disabled={busy || !configured}>
              Forgot password?
            </button>
          )}
        </form>

        <span className="door-note t-micro">
          {configured
            ? auth.origin === 'PREVIEW'
              ? `${sourceLabel} — this account lives in this browser only. It is a walk-through of the door, not a login system; the real one is a backend.`
              : 'Your credentials go to the account system over TLS and are not kept by this interface.'
            : auth.message ?? 'No account system is connected in this build.'}
        </span>
        <span className="door-note t-nano">
          Virtual points only · no wagering · no cash value
        </span>
      </div>
    </div>
  );
}
