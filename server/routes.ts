/* =============================================================
   ROUTES — every handler returns JSON or throws HttpError.
   The stage guard is the only thing standing between a session
   and the engine, and it lives here, on the server.
   ============================================================= */
import { randomBytes, createHash } from 'node:crypto';
import type { DB } from './db.ts';
import type { ServerConfig } from './config.ts';
import type { Ctx } from './http.ts';
import { HttpError, Router, redirect, sendJson } from './http.ts';
import { audit, newId, rateLimit } from './db.ts';
import { EMAIL, HANDLE, hashPassword, validatePassword, verifyPassword } from './auth/password.ts';
import { createSession, destroyAllSessions, destroySession, readSession, setOauthState, type UserRow } from './auth/sessions.ts';
import { authState, computeAccess } from './auth/access.ts';
import { sendMail } from './auth/mailer.ts';
import { billingState } from './billing/entitlements.ts';
import { stripeWebhook } from './billing/stripe.ts';
import { authorizeUrl, completeOauth, discordConfigured, newState } from './discord/oauth.ts';
import { readLink, recheckUser } from './discord/sync.ts';
import type { EngineSource } from './engine/EngineSource.ts';
import { publicBoardFrom } from '../lib/publicBoard.ts';
import { LockRefused, lockCall, userCalls, userPortfolio } from './ledger/calls.ts';
import { calibrationReport } from './ledger/calibration.ts';
import { evaluate } from './ledger/evaluation.ts';
import { CONSTANTS as MODEL_CONSTANTS } from './engine/model/consensusModel.ts';
import { LOCK_POLICY } from './engine/model/lockPolicy.ts';
import type { ArenaSnapshot } from '../types/index.ts';

export interface Deps { db: DB; cfg: ServerConfig; engine: EngineSource; /** Server clock; injectable for tests. */ now?: () => number }

const RESET_MESSAGE = 'If an account exists for that address, a single-use reset link has been sent. It expires in 30 minutes.';

export function buildRouter({ db, cfg, engine, now = () => Date.now() }: Deps): Router {
  const r = new Router();
  const who = (ctx: Ctx) => readSession(db, cfg, ctx);
  const requireUser = (ctx: Ctx): UserRow => {
    const s = who(ctx);
    if (!s) throw new HttpError(401, 'no_session', 'Sign in to continue.');
    return s.user;
  };
  /* THE GATE. Engine routes are served only to a session the server grades OPEN. */
  const requireOpen = (ctx: Ctx): UserRow => {
    const user = requireUser(ctx);
    const access = computeAccess(db, cfg, user);
    if (access.stage !== 'OPEN') throw new HttpError(403, 'stage_' + access.stage.toLowerCase(), `Access stage is ${access.stage}; the terminal is not open for this account.`);
    return user;
  };

  /* ---- health (public, no data) ---- */
  r.add('GET', '/api/health', () => ({ ok: true, engine: engine.label, origin: engine.origin, discord: discordConfigured(cfg) ? 'configured' : 'not_configured', stripe: cfg.stripe.webhookSecret ? 'configured' : 'not_configured' }));

  /* ---- auth ---- */
  r.add('GET', '/api/auth/session', (ctx) => authState(db, cfg, who(ctx)?.user ?? null));

  r.add('POST', '/api/auth/signup', async (ctx) => {
    if (!rateLimit(db, `signup:${ctx.ip}`, 20 * cfg.rateLimitScale, 60 * 60_000)) throw new HttpError(429, 'rate_limited', 'Too many attempts. Try again later.');
    const b = await ctx.json<{ email?: string; handle?: string; password?: string }>();
    const email = String(b.email ?? '').trim().toLowerCase();
    const handle = String(b.handle ?? '').trim();
    const password = String(b.password ?? '');
    if (!EMAIL.test(email)) throw new HttpError(400, 'bad_email', 'Enter a valid email address.');
    if (!HANDLE.test(handle)) throw new HttpError(400, 'bad_handle', 'A handle is 3–20 letters, numbers or underscores.');
    const pw = validatePassword(password); if (pw) throw new HttpError(400, 'bad_password', pw);
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'email_taken', 'An account with that email already exists. Sign in instead.');
    if (db.prepare('SELECT 1 FROM users WHERE handle = ? COLLATE NOCASE').get(handle)) throw new HttpError(409, 'handle_taken', 'That handle is taken.');
    const id = newId();
    db.prepare('INSERT INTO users (id, email, handle, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(id, email, handle, hashPassword(password), Date.now());
    audit(db, id, 'SIGNUP', id, { email, ip: ctx.ip });
    createSession(db, cfg, id, ctx);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow;
    ctx.res.statusCode = 201;
    return authState(db, cfg, user);
  });

  r.add('POST', '/api/auth/signin', async (ctx) => {
    const b = await ctx.json<{ email?: string; password?: string }>();
    const email = String(b.email ?? '').trim().toLowerCase();
    if (!rateLimit(db, `signin:${ctx.ip}:${email}`, 10 * cfg.rateLimitScale, 15 * 60_000)) throw new HttpError(429, 'rate_limited', 'Too many sign-in attempts. Try again in 15 minutes.');
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
    const ok = user ? verifyPassword(String(b.password ?? ''), user.password_hash) : (verifyPassword('x', hashPassword('y')), false);
    if (!user || !ok) { audit(db, email || 'unknown', 'SIGNIN_FAILED', null, { ip: ctx.ip }); throw new HttpError(401, 'bad_credentials', 'Email or password is incorrect.'); }
    createSession(db, cfg, user.id, ctx);
    audit(db, user.id, 'SIGNIN', user.id, { ip: ctx.ip });
    return authState(db, cfg, user);
  });

  r.add('POST', '/api/auth/signout', (ctx) => {
    const s = who(ctx);
    destroySession(db, cfg, ctx);
    if (s) audit(db, s.user.id, 'SIGNOUT', s.user.id);
    return authState(db, cfg, null);
  });

  r.add('POST', '/api/auth/password/forgot', async (ctx) => {
    const b = await ctx.json<{ email?: string }>();
    const email = String(b.email ?? '').trim().toLowerCase();
    if (!EMAIL.test(email)) throw new HttpError(400, 'bad_email', 'Enter a valid email address.');
    if (!rateLimit(db, `forgot:${ctx.ip}`, 5 * cfg.rateLimitScale, 15 * 60_000)) return { message: RESET_MESSAGE };
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
    if (user) {
      const token = randomBytes(32).toString('base64url');
      db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha(token), user.id, Date.now() + cfg.resetTokenMs);
      const origin = cfg.appOrigin ?? `${ctx.req.headers['x-forwarded-proto'] ?? 'http'}://${ctx.req.headers.host}`;
      const link = `${origin}/#/reset/${token}`;
      await sendMail(db, cfg, email, 'Reset your VIXY ARENA password', `Someone asked to reset the password for ${email}.\n\nIf that was you, open this link within 30 minutes:\n${link}\n\nIf not, ignore this message; nothing changes.`);
      audit(db, user.id, 'PASSWORD_RESET_REQUESTED', user.id, { ip: ctx.ip });
    }
    return { message: RESET_MESSAGE };
  });

  r.add('POST', '/api/auth/password/reset', async (ctx) => {
    const b = await ctx.json<{ token?: string; password?: string }>();
    const token = String(b.token ?? '');
    const pw = validatePassword(String(b.password ?? '')); if (pw) throw new HttpError(400, 'bad_password', pw);
    const row = db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(sha(token)) as { user_id: string; expires_at: number; used_at: number | null } | undefined;
    if (!row || row.used_at !== null || row.expires_at < Date.now()) throw new HttpError(400, 'bad_token', 'That reset link is invalid or has expired. Request a new one.');
    db.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').run(Date.now(), sha(token));
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(b.password)), row.user_id);
    destroyAllSessions(db, row.user_id);
    audit(db, row.user_id, 'PASSWORD_RESET', row.user_id, { ip: ctx.ip });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id) as UserRow;
    createSession(db, cfg, user.id, ctx);
    return authState(db, cfg, user, 'Password updated. Every other session was signed out.');
  });

  /* ---- Discord ---- */
  r.add('GET', '/api/auth/discord/start', (ctx) => {
    const s = who(ctx);
    if (!s) throw new HttpError(401, 'no_session', 'Sign in first.');
    if (!discordConfigured(cfg)) throw new HttpError(503, 'discord_not_configured', 'Discord verification is not configured on this server.');
    const state = newState();
    setOauthState(db, s.session.id_hash, state);
    redirect(ctx.res, authorizeUrl(cfg, state));
    return undefined;
  });

  r.add('GET', '/api/auth/discord/callback', async (ctx) => {
    const s = who(ctx);
    if (!s) throw new HttpError(401, 'no_session', 'Sign in first.');
    const state = ctx.url.searchParams.get('state');
    const code = ctx.url.searchParams.get('code');
    if (!state || !code || state !== s.session.oauth_state) throw new HttpError(400, 'bad_state', 'OAuth state did not match. Start again from the Arena.');
    setOauthState(db, s.session.id_hash, null);
    const check = await completeOauth(db, cfg, s.user, code);
    const back = (cfg.appOrigin ?? '') + (check.member && check.hasRole ? '/#/locked' : '/#/access?discord=not_member');
    redirect(ctx.res, back);
    return undefined;
  });

  /* The client's "I've joined" / "Verify with Discord": not a claim — a fresh check through Discord
     using the stored, sealed refresh token. Without a stored link there is nothing to check. */
  r.add('POST', '/api/auth/discord', async (ctx) => {
    const user = requireUser(ctx);
    if (!discordConfigured(cfg)) throw new HttpError(503, 'discord_not_configured', 'Discord verification is not configured on this server.');
    if (!readLink(db, user.id)) throw new HttpError(409, 'discord_not_linked', 'Link Discord first — the Verify with Discord button starts that.');
    const sync = await recheckUser(db, cfg, user.id);
    const msg = sync?.result === 'VERIFIED' ? null
      : sync?.result === 'ERROR' ? `Discord could not be reached (${sync.error}). Your last verified state stands; try again shortly.`
      : sync?.result === 'NO_ROLE' ? 'You are in the server but do not hold the required role yet.'
      : 'Membership was not confirmed. Join the server, then press Verify with Discord again.';
    return authState(db, cfg, user, msg);
  });

  /* ---- billing ---- */
  r.add('GET', '/api/billing/entitlement', (ctx) => billingState(db, requireUser(ctx).id));
  r.add('GET', '/api/billing/catalogue', () => ({ plans: [], message: 'Prices live on the Stripe page, not in this API.' }));
  r.add('POST', '/api/billing/webhook', async (ctx) => {
    const raw = await ctx.rawBody();
    const sig = ctx.req.headers['stripe-signature'];
    return stripeWebhook(db, cfg, raw, Array.isArray(sig) ? sig[0] : sig);
  });

  /* ---- account ---- */
  r.add('GET', '/api/account', (ctx) => {
    const u = requireUser(ctx);
    return {
      status: 'READY', referral: null,
      profile: {
        handle: u.handle, email: u.email, avatarUrl: null, joinedAt: u.created_at,
        handleChange: { allowed: false, cooldownDays: null, nextAllowedAt: null },
        connections: [{ key: 'discord', label: 'Discord', connected: u.discord_verified_at !== null, handle: u.discord_username }],
      },
      message: null, actions: { changeHandle: false, connect: discordConfigured(cfg), signOut: true }, origin: 'LIVE',
    };
  });

  /* ---- the public board (UNAUTHENTICATED, REDACTED) ----
     Coverage for the landing page. The server strips every probability, edge
     and confidence figure except on the one featured market. Cached for 15 s. */
  let boardCache: { at: number; body: unknown } | null = null;
  r.add('GET', '/api/public/board', async () => {
    if (boardCache && Date.now() - boardCache.at < 15_000) return boardCache.body;
    const snap = await engine.load();
    const body = publicBoardFrom(snap, { featured: cfg.publicFeatured, redact: true });
    boardCache = { at: Date.now(), body };
    return body;
  });

  /* ---- engine (PROTECTED) ---- */
  /* The engine's snapshot is global; the signed-in person's calls and portfolio come from the
     ledger — the only place a lock exists — so what they see is what the server recorded. */
  const personal = (snap: ArenaSnapshot, userId: string): ArenaSnapshot => ({ ...snap, calls: userCalls(db, userId, now()), portfolio: userPortfolio(db, userId, now()) });
  r.add('GET', '/api/snapshot', async (ctx) => { const u = requireOpen(ctx); return personal(await engine.load(), u.id); });
  /* The model, named and measured. Public facts, no data: which version runs, that its constants are unvalidated,
     and how its locked probabilities have actually scored — nulls until there is a sample. */
  r.add('GET', '/api/model', () => ({
    engine: engine.label, origin: engine.origin,
    model: engine.origin === 'LIVE' && /model /.test(engine.label) ? { version: MODEL_CONSTANTS.version, validated: MODEL_CONSTANTS.validated, constants: MODEL_CONSTANTS } : null,
    lockPolicy: engine.origin === 'LIVE' ? { version: LOCK_POLICY.version, validated: LOCK_POLICY.validated, thresholds: LOCK_POLICY } : null,
  }));
  r.add('GET', '/api/model/calibration', (ctx) => { requireUser(ctx); return calibrationReport(db, now()); });
  r.add('GET', '/api/model/evaluation', (ctx) => { requireUser(ctx); return evaluate(db, now()); });
  r.add('GET', '/api/calls', (ctx) => { const u = requireOpen(ctx); return { calls: userCalls(db, u.id, now()), portfolio: userPortfolio(db, u.id, now()), origin: engine.origin }; });
  r.add('POST', '/api/calls', async (ctx) => {
    const u = requireOpen(ctx);
    const b = await ctx.json<{ marketId?: unknown; direction?: unknown; stakePoints?: unknown }>();
    if (typeof b.marketId !== 'string' || !b.marketId) throw new HttpError(400, 'bad_call', 'marketId is required.');
    if (b.direction !== 'YES' && b.direction !== 'NO' && b.direction !== 'WAIT') throw new HttpError(400, 'bad_call', 'direction must be YES, NO or WAIT.');
    if (typeof b.stakePoints !== 'number' || !Number.isFinite(b.stakePoints) || b.stakePoints <= 0) throw new HttpError(400, 'bad_call', 'stakePoints must be a positive number.');
    /* Two authorities, in order: the engine prices, the ledger records. */
    const quote = await engine.quote(b.marketId, b.direction);
    if (!quote) throw new HttpError(404, 'unknown_market', 'The engine does not know this market.');
    try { ctx.res.statusCode = 201; return lockCall(db, u.id, { marketId: b.marketId, direction: b.direction, stakePoints: b.stakePoints }, quote, now()); }
    catch (e) { if (e instanceof LockRefused) throw new HttpError(422, e.code, e.message); throw e; }
  });
  r.add('POST', '/api/scan', async (ctx) => {
    const u = requireOpen(ctx);
    const input = await ctx.json<{ fileName: string; mimeType: string; bytes: number; dataUrl: string; chooseMarketId?: string }>();
    if (typeof input.dataUrl !== 'string' || !input.dataUrl.startsWith('data:image/')) throw new HttpError(400, 'bad_image', 'Upload an image.');
    return engine.scanMarket(u.id, input);
  });
  r.add('GET', '/api/stream', (ctx) => {
    const u = requireOpen(ctx);
    ctx.res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    ctx.res.write(': connected\n\n');
    const off = engine.subscribe((s) => { ctx.res.write(`data: ${JSON.stringify(personal(s, u.id))}\n\n`); });
    const ping = setInterval(() => ctx.res.write(': ping\n\n'), 25_000);
    ctx.req.on('close', () => { off(); clearInterval(ping); });
    return undefined;
  });

  return r;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export function jsonError(ctx: Ctx, e: unknown): void {
  if (e instanceof HttpError) { sendJson(ctx.res, e.status, { error: e.code, message: e.message }); return; }
  console.error('[server] unhandled', e);
  sendJson(ctx.res, 500, { error: 'internal', message: 'Something failed on the server. Nothing was assumed.' });
}
