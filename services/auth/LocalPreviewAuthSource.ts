/* =============================================================
   LOCAL PREVIEW AUTH
   -------------------------------------------------------------
   An account that lives in this browser, for DEMO builds only.

   It exists so the whole sequence — create account, locked
   terminal, unlock, join Discord, enter — can be walked and
   reviewed before a backend exists. It is not a login system and
   nothing about it pretends to be one:

     · it is resolved ONLY when DEMO_MODE is true (see ./index.ts)
     · every screen that shows it carries the PREVIEW ACCOUNT badge
     · its unlock is a labeled simulation, never an entitlement
     · its Discord flag is a self-report, marked unverified

   The password is never kept. A salted SHA-256 digest is stored
   so sign-in can be checked; that is a courtesy for the preview,
   not a security claim — localStorage is readable by any script
   on the origin and the badge says so.
   ============================================================= */

import type { AccessStage, AuthCredentials, AuthSession, AuthState } from '../../types';
import type { AuthSource } from './AuthSource';

const KEY = 'vixy_arena_preview:auth';
const EVENT = 'vixy:preview-auth';

interface PreviewRecord {
  /** Account, once created. */
  account: { id: string; email: string; handle: string; createdAt: number; salt: string; digest: string } | null;
  /** Whether a session is open in this browser. */
  signedIn: boolean;
  /** Set by the labeled preview unlock. Never by a payment. */
  simulatedPaid: boolean;
  /** Self-reported by the reader. Never verified here. */
  discordJoined: boolean;
}

const EMPTY: PreviewRecord = { account: null, signedIn: false, simulatedPaid: false, discordJoined: false };

function read(): PreviewRecord {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<PreviewRecord>) };
  } catch { return { ...EMPTY }; }
}

function write(rec: PreviewRecord): void {
  try { window.localStorage.setItem(KEY, JSON.stringify(rec)); } catch { /* storage unavailable */ }
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* no window */ }
}

async function digest(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  /* No SubtleCrypto (non-secure context). Refuse rather than store plaintext. */
  throw new Error('This browser context cannot hash a password; open the preview over https or localhost.');
}

function randomId(): string {
  try {
    const a = new Uint8Array(8);
    crypto.getRandomValues(a);
    return Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return Math.random().toString(36).slice(2, 12); }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HANDLE = /^[a-z0-9_]{3,20}$/i;

function stageOf(rec: PreviewRecord): AccessStage {
  if (!rec.account || !rec.signedIn) return 'CREATE_ACCOUNT';
  if (!rec.simulatedPaid) return 'UNLOCK';
  if (!rec.discordJoined) return 'JOIN_DISCORD';
  return 'OPEN';
}

function toState(rec: PreviewRecord): AuthState {
  const signedIn = Boolean(rec.account && rec.signedIn);
  const session: AuthSession | null = signedIn && rec.account
    ? { userId: rec.account.id, email: rec.account.email, handle: rec.account.handle, createdAt: rec.account.createdAt }
    : null;
  return {
    status: 'READY',
    session,
    access: {
      stage: stageOf(rec),
      paid: rec.simulatedPaid,
      discordJoined: rec.discordJoined,
      discordVerified: false,
    },
    actions: {
      signUp: !rec.account,
      signIn: Boolean(rec.account) && !rec.signedIn,
      signOut: signedIn,
      markDiscordJoined: signedIn && rec.simulatedPaid && !rec.discordJoined,
      previewUnlock: signedIn && !rec.simulatedPaid,
    },
    message: 'Preview account — stored in this browser only. Nothing here is a real login, '
      + 'a real payment or a verified Discord membership.',
    origin: 'PREVIEW',
  };
}

export class LocalPreviewAuthSource implements AuthSource {
  readonly label = 'PREVIEW ACCOUNT';

  async load(): Promise<AuthState> { return toState(read()); }

  subscribe(listener: (state: AuthState) => void): () => void {
    const on = () => listener(toState(read()));
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener('storage', on); };
  }

  async signUp(input: AuthCredentials & { handle: string }): Promise<AuthState> {
    const rec = read();
    if (rec.account) throw new Error('A preview account already exists in this browser. Sign in instead.');
    const email = input.email.trim().toLowerCase();
    const handle = input.handle.trim();
    if (!EMAIL.test(email)) throw new Error('Enter a valid email address.');
    if (!HANDLE.test(handle)) throw new Error('A handle is 3–20 letters, numbers or underscores.');
    if (input.password.length < 8) throw new Error('Use at least 8 characters for the password.');
    const salt = randomId();
    const next: PreviewRecord = {
      ...rec,
      account: { id: randomId(), email, handle, createdAt: Date.now(), salt, digest: await digest(input.password, salt) },
      signedIn: true,
    };
    write(next);
    return toState(next);
  }

  /* A browser-only account has no mailbox to send a token to. Say so;
     do not fake a "check your email" that nothing will ever deliver. */
  async requestPasswordReset(email: string): Promise<{ message: string }> {
    if (!EMAIL.test(email.trim().toLowerCase())) throw new Error('Enter a valid email address.');
    return {
      message: 'Preview account — there is no email delivery in this browser-only walk-through. '
        + 'Password reset is a backend feature; the real account system emails a single-use link.',
    };
  }
  async resetPassword(): Promise<never> {
    throw new Error('Password reset needs the real account system; the preview cannot receive a reset link.');
  }

  async signIn(input: AuthCredentials): Promise<AuthState> {
    const rec = read();
    if (!rec.account) throw new Error('No preview account exists in this browser yet. Create one first.');
    const email = input.email.trim().toLowerCase();
    const ok = email === rec.account.email
      && (await digest(input.password, rec.account.salt)) === rec.account.digest;
    if (!ok) throw new Error('That email and password do not match the preview account in this browser.');
    const next = { ...rec, signedIn: true };
    write(next);
    return toState(next);
  }

  async signOut(): Promise<AuthState> {
    const next = { ...read(), signedIn: false };
    write(next);
    return toState(next);
  }

  async markDiscordJoined(): Promise<AuthState> {
    const rec = read();
    if (!rec.account || !rec.signedIn) throw new Error('Sign in first.');
    if (!rec.simulatedPaid) throw new Error('Unlock the terminal before joining the Discord.');
    const next = { ...rec, discordJoined: true };
    write(next);
    return toState(next);
  }

  async previewUnlock(): Promise<AuthState> {
    const rec = read();
    if (!rec.account || !rec.signedIn) throw new Error('Sign in first.');
    const next = { ...rec, simulatedPaid: true };
    write(next);
    return toState(next);
  }

  /** Test and review hook: wipe the preview account from this browser. */
  static reset(): void { write({ ...EMPTY }); }
}
