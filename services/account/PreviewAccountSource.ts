/* =============================================================
   PREVIEW ACCOUNT
   -------------------------------------------------------------
   DEMO builds only. The profile is whatever the preview auth
   source holds — the handle and email the reader typed when they
   created the account in this browser — and nothing else. No
   join policy, no referral standing, no avatar: those are things
   a backend publishes, and none is connected.
   ============================================================= */

import type { AccountState } from '../../types';
import type { AccountSource } from './AccountSource';
import { resolveAuthSource } from '../auth';

export class PreviewAccountSource implements AccountSource {
  readonly label = 'PREVIEW ACCOUNT';

  async load(): Promise<AccountState> {
    const auth = await resolveAuthSource().load();
    const s = auth.session;
    if (!s) {
      return {
        status: 'READY', profile: null, referral: null,
        message: 'Nobody is signed in. Create a preview account to see a profile here.',
        actions: { changeHandle: false, connect: false, signOut: false }, origin: 'NONE',
      };
    }
    return {
      status: 'READY',
      profile: {
        handle: s.handle,
        email: s.email,
        avatarUrl: null,
        joinedAt: s.createdAt,
        handleChange: { allowed: false, cooldownDays: null, nextAllowedAt: null },
        connections: [{
          key: 'discord', label: 'Discord',
          connected: auth.access.discordJoined,
          handle: null,
        }],
      },
      referral: null,
      message: 'Preview account — stored in this browser only. Discord shows what you reported, '
        + 'not what Discord confirmed; a backend verifies that in production.',
      actions: { changeHandle: false, connect: false, signOut: auth.actions.signOut },
      origin: 'NONE',
    };
  }
  async changeHandle(): Promise<never> { throw new Error('Changing a handle requires a configured account system.'); }
  async connect(): Promise<never> { throw new Error('Linking a service requires a configured account system.'); }
  async createReferralCode(): Promise<never> { throw new Error('Creating a referral code requires a configured account system.'); }
  async signOut(): Promise<void> { await resolveAuthSource().signOut(); }
}
