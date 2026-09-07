import { createHash, randomBytes } from 'node:crypto';
import type { DB } from '../db.ts';
import type { ServerConfig } from '../config.ts';
import type { Ctx } from '../http.ts';
import { setCookie } from '../http.ts';

export interface SessionRow { id_hash: string; user_id: string; created_at: number; last_seen_at: number; absolute_expires_at: number; oauth_state: string | null }
export interface UserRow {
  id: string; email: string; handle: string; password_hash: string; created_at: number;
  discord_id: string | null; discord_username: string | null; discord_verified_at: number | null; stripe_customer_id: string | null;
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export function createSession(db: DB, cfg: ServerConfig, userId: string, ctx: Ctx): string {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (id_hash, user_id, created_at, last_seen_at, absolute_expires_at, ip, ua) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(hash(token), userId, now, now, now + cfg.sessionAbsoluteMs, ctx.ip, String(ctx.req.headers['user-agent'] ?? '').slice(0, 200));
  setCookie(ctx.res, cfg.cookieName, token, { secure: cfg.cookieSecure, maxAgeSec: Math.floor(cfg.sessionAbsoluteMs / 1000) });
  return token;
}

/** Resolve the request's session, enforcing idle + absolute expiry. Expired rows are deleted. */
export function readSession(db: DB, cfg: ServerConfig, ctx: Ctx, now = Date.now()): { session: SessionRow; user: UserRow } | null {
  const token = ctx.cookies[cfg.cookieName];
  if (!token) return null;
  const h = hash(token);
  const s = db.prepare('SELECT * FROM sessions WHERE id_hash = ?').get(h) as SessionRow | undefined;
  if (!s) return null;
  if (now > s.absolute_expires_at || now - s.last_seen_at > cfg.sessionIdleMs) {
    db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(h);
    clearSessionCookie(cfg, ctx);
    return null;
  }
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?').run(now, h);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(s.user_id) as UserRow | undefined;
  if (!user) return null;
  return { session: s, user };
}

export function destroySession(db: DB, cfg: ServerConfig, ctx: Ctx): void {
  const token = ctx.cookies[cfg.cookieName];
  if (token) db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(hash(token));
  clearSessionCookie(cfg, ctx);
}

export function destroyAllSessions(db: DB, userId: string): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function clearSessionCookie(cfg: ServerConfig, ctx: Ctx): void {
  setCookie(ctx.res, cfg.cookieName, '', { secure: cfg.cookieSecure, maxAgeSec: 0 });
}

export function setOauthState(db: DB, sessionHash: string, state: string | null): void {
  db.prepare('UPDATE sessions SET oauth_state = ? WHERE id_hash = ?').run(state, sessionHash);
}
