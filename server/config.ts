/* =============================================================
   SERVER CONFIGURATION
   -------------------------------------------------------------
   Read once from the environment (and server/.env if present).
   No value here is ever sent to the client. The server refuses to
   start as production without a session secret.
   ============================================================= */
import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

function loadDotEnv(path: string): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^"(.*)"$/, '$1');
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

export interface ServerConfig {
  port: number;
  host: string;
  production: boolean;
  staticDir: string | null;
  databasePath: string;
  sessionSecret: string;
  cookieSecure: boolean;
  cookieName: string;
  sessionIdleMs: number;
  sessionAbsoluteMs: number;
  appOrigin: string | null;
  discord: {
    required: boolean;
    clientId: string; clientSecret: string; guildId: string; roleId: string;
    redirectUrl: string; apiBase: string; oauthBase: string;
    /** Re-ask Discord every recheckMs; a verification older than maxAgeMs is no longer current. */
    recheckMs: number; maxAgeMs: number; recheckLoopMs: number;
  };
  stripe: { webhookSecret: string; toleranceSec: number; /** Match a checkout to an existing account by email as a last resort (audited). Default false. */ emailFallback: boolean };
  mail: { mode: 'outbox' | 'webhook'; webhookUrl: string; from: string };
  resetTokenMs: number;
  /** Multiplies every rate-limit ceiling. 1 in production; the test suite raises it. */
  rateLimitScale: number;
  /** Publish one un-redacted market on the public board (the landing page's worked example). */
  publicFeatured: boolean;
  /** demo = server-hosted labeled simulator; live = real venue ingest (no model yet). */
  engine: 'demo' | 'live';
  engineRefreshMs: number;
  /** Settlement sweep period; 0 disables the loop (tests call the sweep directly). */
  settleSweepMs: number;
  /** consensus = vixy-arena-consensus-0.1.0 (the default; unvalidated); continuation = 0.2.0 (a candidate that failed its holdout); none = no model, no locks. */
  model: 'consensus' | 'continuation' | 'none';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  loadDotEnv(resolve(process.cwd(), 'server/.env'));
  const production = (env.NODE_ENV ?? '') === 'production';
  let sessionSecret = env.SESSION_SECRET ?? '';
  if (!sessionSecret) {
    if (production) throw new Error('SESSION_SECRET is required in production (32+ random bytes).');
    /* Development only: a per-process secret. Sessions do not survive a restart. */
    sessionSecret = randomBytes(32).toString('hex');
  }
  const num = (k: string, d: number) => { const v = Number(env[k]); return Number.isFinite(v) && v > 0 ? v : d; };
  const bool = (k: string, d: boolean) => (env[k] === undefined ? d : env[k] === 'true');
  const engine: 'demo' | 'live' = env.ENGINE === 'live' ? 'live' : 'demo';
  /* The simulator is labeled on every payload, but a production door with a simulator behind it is
     still a masquerade. Say so explicitly or the server will not start. */
  if (production && engine === 'demo' && !bool('ALLOW_DEMO_ENGINE_IN_PRODUCTION', false)) {
    throw new Error('ENGINE=demo in production is refused. Set ENGINE=live, or ALLOW_DEMO_ENGINE_IN_PRODUCTION=true to run the labeled simulator deliberately.');
  }
  return {
    port: num('PORT', 8787),
    host: env.HOST ?? '127.0.0.1',
    production,
    staticDir: env.STATIC_DIR === '' ? null : (env.STATIC_DIR ?? 'dist'),
    databasePath: env.DATABASE_PATH ?? 'server/data/arena.db',
    sessionSecret,
    cookieSecure: bool('COOKIE_SECURE', production),
    cookieName: 'vixy_session',
    sessionIdleMs: num('SESSION_IDLE_MINUTES', 7 * 24 * 60) * 60_000,
    sessionAbsoluteMs: num('SESSION_ABSOLUTE_HOURS', 30 * 24) * 3_600_000,
    appOrigin: env.APP_ORIGIN || null,
    discord: {
      required: bool('DISCORD_REQUIRED', true),
      clientId: env.DISCORD_CLIENT_ID ?? '',
      clientSecret: env.DISCORD_CLIENT_SECRET ?? '',
      guildId: env.DISCORD_GUILD_ID ?? '',
      roleId: env.DISCORD_ROLE_ID ?? '',
      redirectUrl: env.DISCORD_REDIRECT_URL ?? '',
      apiBase: env.DISCORD_API_BASE ?? 'https://discord.com/api/v10',
      recheckMs: num('DISCORD_RECHECK_HOURS', 24) * 3_600_000,
      maxAgeMs: num('DISCORD_MAX_AGE_HOURS', 14 * 24) * 3_600_000,
      recheckLoopMs: num('DISCORD_RECHECK_LOOP_MINUTES', 15) * 60_000,
      oauthBase: env.DISCORD_OAUTH_BASE ?? 'https://discord.com/oauth2/authorize',
    },
    stripe: { webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? '', toleranceSec: num('STRIPE_TOLERANCE_SEC', 300), emailFallback: bool('STRIPE_EMAIL_FALLBACK', false) },
    mail: {
      mode: env.MAIL_MODE === 'webhook' ? 'webhook' : 'outbox',
      webhookUrl: env.MAIL_WEBHOOK_URL ?? '',
      from: env.MAIL_FROM ?? 'VIXY ARENA <no-reply@vixy.local>',
    },
    resetTokenMs: num('RESET_TOKEN_MINUTES', 30) * 60_000,
    rateLimitScale: 1,
    publicFeatured: bool('PUBLIC_FEATURED', true),
    engine,
    engineRefreshMs: num('ENGINE_REFRESH_SECONDS', 30) * 1000,
    settleSweepMs: num('SETTLE_SWEEP_SECONDS', 60) * 1000,
    model: env.MODEL === 'none' ? 'none' : env.MODEL === 'continuation' ? 'continuation' : 'consensus',
  };
}
