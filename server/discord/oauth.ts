/* =============================================================
   DISCORD — membership verified by Discord, never claimed by the client.
   ============================================================= */
import { randomBytes } from 'node:crypto';
import type { DB } from '../db.ts';
import type { ServerConfig } from '../config.ts';
import { audit } from '../db.ts';
import { HttpError } from '../http.ts';
import type { UserRow } from '../auth/sessions.ts';
import { recordSync, saveLink } from './sync.ts';

export const discordConfigured = (cfg: ServerConfig) =>
  Boolean(cfg.discord.clientId && cfg.discord.clientSecret && cfg.discord.guildId && cfg.discord.redirectUrl);

export function authorizeUrl(cfg: ServerConfig, state: string): string {
  const u = new URL(cfg.discord.oauthBase);
  u.searchParams.set('client_id', cfg.discord.clientId);
  u.searchParams.set('redirect_uri', cfg.discord.redirectUrl);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'identify guilds.members.read');
  u.searchParams.set('state', state);
  u.searchParams.set('prompt', 'none');
  return u.toString();
}

export const newState = () => randomBytes(16).toString('base64url');

async function exchangeCode(cfg: ServerConfig, code: string): Promise<{ access: string; refresh: string | null }> {
  const r = await fetch(`${cfg.discord.apiBase}/oauth2/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.discord.clientId, client_secret: cfg.discord.clientSecret, grant_type: 'authorization_code', code, redirect_uri: cfg.discord.redirectUrl }),
  });
  if (!r.ok) throw new HttpError(502, 'discord_token', `Discord token exchange failed (${r.status}).`);
  const j = await r.json() as { access_token?: string; refresh_token?: string };
  if (!j.access_token) throw new HttpError(502, 'discord_token', 'Discord returned no access token.');
  return { access: j.access_token, refresh: j.refresh_token ?? null };
}

export interface MembershipCheck { member: boolean; hasRole: boolean; discordId: string; username: string }

/** Ask Discord. The answer is the only thing that ever sets discord_verified_at. */
export async function checkMembership(cfg: ServerConfig, accessToken: string): Promise<MembershipCheck> {
  const h = { authorization: `Bearer ${accessToken}` };
  const me = await fetch(`${cfg.discord.apiBase}/users/@me`, { headers: h });
  if (!me.ok) throw new HttpError(502, 'discord_me', `Discord identity lookup failed (${me.status}).`);
  const user = await me.json() as { id: string; username: string };
  const m = await fetch(`${cfg.discord.apiBase}/users/@me/guilds/${cfg.discord.guildId}/member`, { headers: h });
  if (m.status === 404 || m.status === 403) return { member: false, hasRole: false, discordId: user.id, username: user.username };
  if (!m.ok) throw new HttpError(502, 'discord_member', `Discord membership lookup failed (${m.status}).`);
  const member = await m.json() as { roles?: string[] };
  const hasRole = !cfg.discord.roleId || (member.roles ?? []).includes(cfg.discord.roleId);
  return { member: true, hasRole, discordId: user.id, username: user.username };
}

/** OAuth complete: persist the identity (durably, with the refresh token sealed) and record what Discord said. */
export async function completeOauth(db: DB, cfg: ServerConfig, user: UserRow, code: string): Promise<MembershipCheck> {
  const token = await exchangeCode(cfg, code);
  const check = await checkMembership(cfg, token.access);
  try { saveLink(db, cfg, user.id, check, token.refresh); }
  catch (e) { audit(db, user.id, 'DISCORD_LINK_REFUSED', user.id, { discordId: check.discordId }); throw new HttpError(409, 'discord_taken', e instanceof Error ? e.message : 'Discord account already linked.'); }
  recordSync(db, user.id, check, null);
  return check;
}
