import React from 'react';

/* =============================================================
   THE LAST LINE
   -------------------------------------------------------------
   An exception anywhere below this component must never produce a
   blank page. Verified 2026-09-05: with DEMO_MODE=false the shell
   rendered nothing at all, because a data-source method threw inside
   an effect and nothing caught it. This boundary renders the same
   honest state the App uses when a source rejects, plus the message,
   so a misconfigured deploy says what is wrong instead of going dark.
   ============================================================= */

interface State { error: Error | null }

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    /* Surface it where a deploy check will see it. Never swallowed. */
    console.error('[VIXY ARENA] unrecoverable render error', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="boot col center g4" role="alert"
           style={{ minHeight: '100vh', padding: 24, background: 'var(--vx-bg, #04050b)' }}>
          <span className="t-label">VIXY ARENA could not start</span>
          <p className="t-small" style={{ maxWidth: 460, textAlign: 'center' }}>
            {this.state.error.message}
          </p>
          <p className="t-nano" style={{ maxWidth: 460, textAlign: 'center' }}>
            Nothing on this screen is a market value. If you are the operator, the message above
            names the source or setting that failed.
          </p>
          <button className="btn btn-sm tap" onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  }
}
