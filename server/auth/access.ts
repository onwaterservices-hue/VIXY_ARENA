/* =============================================================
   THE STAGE — computed here and nowhere else.
   ============================================================= */
import type { DB } from '../db.ts';
import type { ServerConfig } from '../config.ts';
import type { UserRow } from './sessions.ts';
import { readEntitlement } from '../billing/entitlements.ts';
import { discordCurrent } from '../discord/sync.ts';

export type AccessStage = 'CREATE_ACCOUNT' | 'UNLOCK' | 'JOIN_DISCORD' | 'OPEN';

export interface AuthStatePayload {
  status: 'READY';
  session: { userId: string; email: string; handle: string; createdAt: number } | null;
  access: { stage: AccessStage; paid: boolean; discordJoined: boolean; discordVerified: boolean };
  actions: { signUp: boolean; signIn: boolean; signOut: boolean; markDiscordJoined: boolean; previewUnlock: false };
  message: string | null;
  origin: 'LIVE';
}

export function computeAccess(db: DB, cfg: ServerConfig, user: UserRow | null, now = Date.now()) {
  if (!user) return { stage: 'CREATE_ACCOUNT' as AccessStage, paid: false, discordJoined: false, discordVerified: false };
  const ent = readEntitlement(db, user.id, now);
  const paid = ent.active;
  /* Verified means: Discord gave a definite yes (member + role) within DISCORD_MAX_AGE_HOURS. Older → re-verify. */
  const d = discordCurrent(db, cfg, user.id, now);
  const discordVerified = d.verified;
  let stage: AccessStage = 'OPEN';
  if (!paid) stage = 'UNLOCK';
  else if (cfg.discord.required && !discordVerified) stage = 'JOIN_DISCORD';
  return { stage, paid, discordJoined: d.linked, discordVerified };
}

export function authState(db: DB, cfg: ServerConfig, user: UserRow | null, message: string | null = null): AuthStatePayload {
  const access = computeAccess(db, cfg, user);
  const signedIn = user !== null;
  return {
    status: 'READY',
    session: user ? { userId: user.id, email: user.email, handle: user.handle, createdAt: user.created_at } : null,
    access,
    actions: {
      signUp: !signedIn,
      signIn: !signedIn,
      signOut: signedIn,
      markDiscordJoined: signedIn && access.paid && !access.discordVerified,
      previewUnlock: false,
    },
    message,
    origin: 'LIVE',
  };
}
