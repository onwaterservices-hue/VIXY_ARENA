/* =============================================================
   THE ACCOUNT CONTRACT
   -------------------------------------------------------------
   Same rule as data and billing: the interface reads one object
   and knows nothing else.

   No handle, email, avatar, join date or connection is written
   anywhere in the client. A profile page that invents a person
   is the most quietly dishonest screen a product can ship —
   everything on it looks like fact.
   ============================================================= */

import type { AccountState } from '../../types';
import { apiFetch } from '../httpClient';

export interface AccountSource {
  readonly label: string;
  load(): Promise<AccountState>;
  /** Propose a new handle. The server decides, and returns the state it wrote. */
  changeHandle(next: string): Promise<AccountState>;
  /** Begin linking an external service. Returns the URL to send the reader to. */
  connect(key: string): Promise<{ url: string }>;
  /**
   * Claim a referral code. The server decides whether it is available and
   * returns the state it wrote — the client never assembles the invite URL,
   * because the URL is the thing attribution is keyed on.
   */
  createReferralCode(code: string): Promise<AccountState>;
  signOut(): Promise<void>;
}

/** The state of this build. It reports the truth and invents no one. */
export class UnconfiguredAccountSource implements AccountSource {
  readonly label = 'NOT CONFIGURED';
  async load(): Promise<AccountState> {
    return {
      status: 'NOT_CONFIGURED',
      profile: null,
      referral: null,
      message:
        'No account system is connected in this build. Identity, email, linked '
        + 'services and the handle-change policy are owned by that system and read '
        + 'at runtime; none are written into the interface. Everything below that '
        + 'does show a value comes from the engine snapshot.',
      actions: { changeHandle: false, connect: false, signOut: false },
      origin: 'NONE',
    };
  }
  async changeHandle(): Promise<never> {
    throw new Error('Changing a handle requires a configured account system.');
  }
  async connect(): Promise<never> {
    throw new Error('Linking a service requires a configured account system.');
  }
  async createReferralCode(): Promise<never> {
    throw new Error('Creating a referral code requires a configured account system.');
  }
  async signOut(): Promise<never> {
    throw new Error('Signing out requires a configured account system.');
  }
}

/** The real implementation. */
export class HttpAccountSource implements AccountSource {
  readonly label = 'ACCOUNT API';
  private readonly baseUrl: string;
  constructor(baseUrl: string) { this.baseUrl = baseUrl; }
  load(): Promise<AccountState> { return apiFetch<AccountState>(this.baseUrl, '/api/account'); }
  async changeHandle(): Promise<never> { throw new Error('Handle changes are not enabled on this server yet.'); }
  async connect(key: string): Promise<{ url: string }> {
    if (key !== 'discord') throw new Error(`No connector for ${key}.`);
    return { url: `${this.baseUrl}/api/auth/discord/start` };
  }
  async createReferralCode(): Promise<never> { throw new Error('Referrals are not enabled on this server yet.'); }
  async signOut(): Promise<void> { await apiFetch(this.baseUrl, '/api/auth/signout', { method: 'POST' }); }
}
