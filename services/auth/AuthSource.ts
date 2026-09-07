/* =============================================================
   THE AUTH CONTRACT
   -------------------------------------------------------------
   Who is signed in, and how far along the door they are.

   The Arena has exactly one way in, and it is a sequence:

       1. CREATE ACCOUNT   — an identity to attach everything to
       2. UNLOCK           — pay, on a Stripe Payment Link
       3. JOIN DISCORD     — the community the product lives in
       4. OPEN             — the terminal

   The interface renders the sequence; it never decides it. The
   stage comes from the auth source, exactly as entitlement comes
   from the billing source and probabilities come from the engine.
   A client that computed its own access stage from a few flags
   it happened to be holding would be the client deciding who
   gets in, and that is a business rule with a bill attached.

   Three implementations, one switch (see ./index.ts):

     HttpAuthSource          the real one, against the backend
     LocalPreviewAuthSource  DEMO builds only — an account that
                             lives in this browser and says so on
                             every screen that shows it
     UnconfiguredAuthSource  nothing connected; reports the fact

   No password is ever compared, stored, or logged by the
   interface. The preview source hashes what it keeps and the
   HTTP source sends credentials to the backend over TLS and
   forgets them.
   ============================================================= */

import type { AccessStage, AuthCredentials, AuthState } from '../../types';
import { apiFetch } from '../httpClient';

export interface AuthSource {
  readonly label: string;
  /** Read the current session and access stage. */
  load(): Promise<AuthState>;
  /** Fires whenever the session or the stage changes, in this tab or another. */
  subscribe(listener: (state: AuthState) => void): () => void;
  /** Create an account. The source decides whether it can; it returns the state it wrote. */
  signUp(input: AuthCredentials & { handle: string }): Promise<AuthState>;
  signIn(input: AuthCredentials): Promise<AuthState>;
  signOut(): Promise<AuthState>;
  /**
   * Password reset, step one: ask the backend to email a single-use, expiring
   * token to this address. Resolves to the message the reader should see —
   * always the same wording whether or not the address exists, so the door
   * never confirms which emails have accounts. Step two (`resetPassword`)
   * is reached from the emailed link.
   */
  requestPasswordReset(email: string): Promise<{ message: string }>;
  /** Password reset, step two. The token came from the email; the backend validates and burns it. */
  resetPassword(input: { token: string; password: string }): Promise<AuthState>;
  /**
   * Record that the reader says they joined the Discord. In production the
   * backend verifies membership through Discord itself; the flag here is a
   * claim until the server confirms it, and the state says which.
   */
  markDiscordJoined(): Promise<AuthState>;
  /**
   * DEMO builds only. Simulates the backend confirming a purchase so the
   * sequence can be walked end to end without a payment provider. The real
   * sources do not implement it, and the button that calls it is only
   * rendered when `actions.previewUnlock` is true.
   */
  previewUnlock?(): Promise<AuthState>;
}

const NO_ACTIONS = {
  signUp: false, signIn: false, signOut: false, markDiscordJoined: false, previewUnlock: false,
} as const;

export const EMPTY_ACCESS = {
  stage: 'CREATE_ACCOUNT' as AccessStage,
  paid: false,
  discordJoined: false,
  discordVerified: false,
};

/** Nothing connected. Reports it. The stage is NOT open: the App treats a
    source that could not answer as "nothing to draw", never as a yes. A
    build that reaches this class in production is misconfigured, and the
    screen says so instead of opening the terminal. */
export class UnconfiguredAuthSource implements AuthSource {
  readonly label = 'NOT CONFIGURED';
  async load(): Promise<AuthState> {
    return {
      status: 'NOT_CONFIGURED',
      session: null,
      access: { ...EMPTY_ACCESS },
      actions: { ...NO_ACTIONS },
      message: 'No account system is connected in this build (AUTH_BASE_URL is empty and this is '
        + 'not a demo build). Sign-in, entitlement and Discord membership are owned by that system.',
      origin: 'NONE',
    };
  }
  subscribe(): () => void { return () => {}; }
  async signUp(): Promise<never> { throw new Error('Creating an account requires a configured account system.'); }
  async signIn(): Promise<never> { throw new Error('Signing in requires a configured account system.'); }
  async signOut(): Promise<never> { throw new Error('Signing out requires a configured account system.'); }
  async markDiscordJoined(): Promise<never> { throw new Error('Recording Discord membership requires a configured account system.'); }
  async requestPasswordReset(): Promise<never> { throw new Error('Resetting a password requires a configured account system.'); }
  async resetPassword(): Promise<never> { throw new Error('Resetting a password requires a configured account system.'); }
}

/** The real implementation, against server/ (docs/BACKEND-ARCHITECTURE.md).
    The server computes the stage; this class only reads and relays it.
    Discord "membership" is never claimed from here: the Join button sends the
    reader through the server's OAuth flow, and the server records what Discord
    said. */
export class HttpAuthSource implements AuthSource {
  readonly label = 'ACCOUNT API';
  private readonly baseUrl: string;
  private listeners = new Set<(s: AuthState) => void>();
  constructor(baseUrl: string) { this.baseUrl = baseUrl; }

  async load(): Promise<AuthState> {
    return apiFetch<AuthState>(this.baseUrl, '/api/auth/session');
  }

  /* Re-read whenever the tab comes back and on a slow heartbeat, so a session
     the server expired — or an entitlement a webhook granted — shows up without
     a reload. The server is polled; nothing is inferred locally. */
  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener);
    const refresh = () => { this.load().then((s) => this.listeners.forEach((l) => l(s))).catch(() => { /* next tick */ }); };
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVis);
    const timer = setInterval(refresh, 60_000);
    return () => {
      this.listeners.delete(listener);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(timer);
    };
  }

  private async post(path: string, body?: unknown): Promise<AuthState> {
    const st = await apiFetch<AuthState>(this.baseUrl, path, { method: 'POST', body });
    this.listeners.forEach((l) => l(st));
    return st;
  }
  signUp(input: AuthCredentials & { handle: string }): Promise<AuthState> { return this.post('/api/auth/signup', input); }
  signIn(input: AuthCredentials): Promise<AuthState> { return this.post('/api/auth/signin', input); }
  signOut(): Promise<AuthState> { return this.post('/api/auth/signout'); }
  requestPasswordReset(email: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(this.baseUrl, '/api/auth/password/forgot', { method: 'POST', body: { email } });
  }
  resetPassword(input: { token: string; password: string }): Promise<AuthState> { return this.post('/api/auth/password/reset', input); }
  /** Verification, not a claim: hand the reader to the server's Discord OAuth flow. */
  async markDiscordJoined(): Promise<AuthState> {
    window.location.assign(`${this.baseUrl}/api/auth/discord/start`);
    return new Promise<AuthState>(() => { /* the page is leaving */ });
  }
}
