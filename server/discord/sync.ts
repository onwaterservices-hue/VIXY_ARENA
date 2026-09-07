/* =============================================================
   DISCORD, DURABLY — four things that are not the same thing:

     identity     discord_links   who this account's Discord user is
                                  (+ an encrypted refresh token so the
                                  server can re-ask Discord later)
     membership   discord_sync    is that user in the guild, right now-ish
     role         discord_sync    do they hold DISCORD_ROLE_ID
     entitlement  entitlements    paid — Stripe's business, not Discord's

   The stage reads `discord_sync`. A verification is CURRENT for
   DISCORD_MAX_AGE_HOURS after the last definite answer; past that it
   falls back to JOIN_DISCORD and asks for a re-check. The re-check
   loop runs every DISCORD_RECHECK_HOURS with the refresh token; a
   definite "not a member / no role" downgrades at once; a Discord
   outage records an ERROR and keeps the last definite answer — it
   never elevates.
   ============================================================= */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { DB } from '../db.ts';
import type { ServerConfig } from '../config.ts';
import { audit } from '../db.ts';
import { checkMembership, type MembershipCheck } from './oauth.ts';

/* ---- token at rest: AES-256-GCM under a key derived from SESSION_SECRET ---- */
const key = (cfg: ServerConfig) => createHash('sha256').update(`discord-refresh:${cfg.sessionSecret}`).digest();
export function sealToken(cfg: ServerConfig, plain: string): string {
  const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', key(cfg), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${body.toString('base64url')}`;
}
export function openToken(cfg: ServerConfig, sealed: string): string | null {
  try {
    const [iv, tag, body] = sealed.split('.').map((p) => Buffer.from(p, 'base64url'));
    const d = createDecipheriv('aes-256-gcm', key(cfg), iv); d.setAuthTag(tag);
    return Buffer.concat([d.update(body), d.final()]).toString('utf8');
  } catch { return null; }
}

export interface DiscordLinkRow { user_id: string; discord_id: string; username: string | null; refresh_token_enc: string | null; linked_at: number; updated_at: number }
export interface DiscordSyncRow { user_id: string; member: number; has_role: number; result: 'VERIFIED' | 'NOT_MEMBER' | 'NO_ROLE' | 'ERROR'; error: string | null; checked_at: number; last_definite_at: number | null }

export function readLink(db: DB, userId: string): DiscordLinkRow | null {
  return (db.prepare('SELECT * FROM discord_links WHERE user_id = ?').get(userId) as DiscordLinkRow | undefined) ?? null;
}
export function readSync(db: DB, userId: string): DiscordSyncRow | null {
  return (db.prepare('SELECT * FROM discord_sync WHERE user_id = ?').get(userId) as DiscordSyncRow | undefined) ?? null;
}

/** Persist identity (+ refresh token) after an OAuth exchange. One Discord account links to one Arena account. */
export function saveLink(db: DB, cfg: ServerConfig, userId: string, check: MembershipCheck, refreshToken: string | null, now = Date.now()): void {
  const taken = db.prepare('SELECT user_id FROM discord_links WHERE discord_id = ? AND user_id <> ?').get(check.discordId, userId) as { user_id: string } | undefined;
  if (taken) throw new Error(`Discord account ${check.discordId} is already linked to another Arena account.`);
  db.prepare(`INSERT INTO discord_links (user_id, discord_id, username, refresh_token_enc, linked_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET discord_id = excluded.discord_id, username = excluded.username,
      refresh_token_enc = COALESCE(excluded.refresh_token_enc, discord_links.refresh_token_enc), updated_at = excluded.updated_at`)
    .run(userId, check.discordId, check.username, refreshToken ? sealToken(cfg, refreshToken) : null, now, now);
}

/** Record what Discord said. Only a definite answer moves users.discord_verified_at. */
export function recordSync(db: DB, userId: string, check: MembershipCheck | null, error: string | null, now = Date.now()): DiscordSyncRow {
  const prev = readSync(db, userId);
  if (check) {
    const result: DiscordSyncRow['result'] = !check.member ? 'NOT_MEMBER' : !check.hasRole ? 'NO_ROLE' : 'VERIFIED';
    db.prepare(`INSERT INTO discord_sync (user_id, member, has_role, result, error, checked_at, last_definite_at) VALUES (?, ?, ?, ?, NULL, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET member = excluded.member, has_role = excluded.has_role, result = excluded.result, error = NULL, checked_at = excluded.checked_at, last_definite_at = excluded.last_definite_at`)
      .run(userId, check.member ? 1 : 0, check.hasRole ? 1 : 0, result, now, now);
    db.prepare('UPDATE users SET discord_id = ?, discord_username = ?, discord_verified_at = ? WHERE id = ?').run(check.discordId, check.username, result === 'VERIFIED' ? now : null, userId);
    if (prev?.result !== result) audit(db, userId, `DISCORD_${result}`, userId, { discordId: check.discordId, hasRole: check.hasRole, member: check.member });
  } else {
    /* An error is recorded as such. member/has_role keep their last definite values; verified_at is untouched. */
    db.prepare(`INSERT INTO discord_sync (user_id, member, has_role, result, error, checked_at, last_definite_at) VALUES (?, ?, ?, 'ERROR', ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET result = 'ERROR', error = excluded.error, checked_at = excluded.checked_at`)
      .run(userId, prev?.member ?? 0, prev?.has_role ?? 0, error, now, prev?.last_definite_at ?? null);
    audit(db, userId, 'DISCORD_CHECK_ERROR', userId, { error });
  }
  return readSync(db, userId)!;
}

/** Is this account's Discord verification current? Definite VERIFIED within the max age. */
export function discordCurrent(db: DB, cfg: ServerConfig, userId: string, now = Date.now()): { verified: boolean; linked: boolean; stale: boolean; checkedAt: number | null } {
  const link = readLink(db, userId); const sync = readSync(db, userId);
  if (!link || !sync) return { verified: false, linked: Boolean(link), stale: false, checkedAt: sync?.checked_at ?? null };
  const definiteOk = sync.member === 1 && sync.has_role === 1 && sync.last_definite_at !== null;
  const stale = sync.last_definite_at === null || now - sync.last_definite_at > cfg.discord.maxAgeMs;
  return { verified: definiteOk && !stale, linked: true, stale, checkedAt: sync.checked_at };
}

async function refreshAccessToken(cfg: ServerConfig, refreshToken: string): Promise<{ access: string; refresh: string | null }> {
  const r = await fetch(`${cfg.discord.apiBase}/oauth2/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.discord.clientId, client_secret: cfg.discord.clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (!r.ok) throw new Error(`Discord token refresh failed (${r.status})`);
  const j = await r.json() as { access_token?: string; refresh_token?: string };
  if (!j.access_token) throw new Error('Discord token refresh returned no access token');
  return { access: j.access_token, refresh: j.refresh_token ?? null };
}

/**
 * Re-ask Discord about one linked account using the stored refresh token.
 * Returns the sync row written. Never throws: an outage becomes an ERROR row.
 */
export async function recheckUser(db: DB, cfg: ServerConfig, userId: string, now = Date.now()): Promise<DiscordSyncRow | null> {
  const link = readLink(db, userId);
  if (!link) return null;
  const refresh = link.refresh_token_enc ? openToken(cfg, link.refresh_token_enc) : null;
  if (!refresh) return recordSync(db, userId, null, 'no refresh token stored; a new OAuth round-trip is required', now);
  try {
    const t = await refreshAccessToken(cfg, refresh);
    if (t.refresh) db.prepare('UPDATE discord_links SET refresh_token_enc = ?, updated_at = ? WHERE user_id = ?').run(sealToken(cfg, t.refresh), now, userId);
    const check = await checkMembership(cfg, t.access);
    if (check.discordId !== link.discord_id) return recordSync(db, userId, null, `token belongs to a different Discord user (${check.discordId})`, now);
    return recordSync(db, userId, check, null, now);
  } catch (e) {
    return recordSync(db, userId, null, e instanceof Error ? e.message : String(e), now);
  }
}

/** Everyone whose last check is older than the recheck period. */
export async function recheckDue(db: DB, cfg: ServerConfig, now = Date.now()): Promise<{ checked: number; downgraded: number; errors: number }> {
  const due = db.prepare('SELECT l.user_id FROM discord_links l LEFT JOIN discord_sync s ON s.user_id = l.user_id WHERE s.checked_at IS NULL OR s.checked_at < ? LIMIT 200')
    .all(now - cfg.discord.recheckMs) as { user_id: string }[];
  const out = { checked: 0, downgraded: 0, errors: 0 };
  for (const { user_id } of due) {
    const before = readSync(db, user_id)?.result;
    const after = await recheckUser(db, cfg, user_id, now);
    out.checked++;
    if (after?.result === 'ERROR') out.errors++;
    else if (before === 'VERIFIED' && after && after.result !== 'VERIFIED') out.downgraded++;
  }
  return out;
}

export function startDiscordRecheckLoop(db: DB, cfg: ServerConfig, everyMs: number): () => void {
  const t = setInterval(async () => {
    try { const r = await recheckDue(db, cfg); if (r.checked) console.log('[discord] recheck', r); } catch (e) { console.error('[discord]', e); }
  }, everyMs);
  return () => clearInterval(t);
}
