/* =============================================================
   PRODUCTION PREFLIGHT — run this ON the production host, once,
   before opening the door:  node server/preflight.ts

   It answers the questions PRODUCTION-READINESS.md marks FAIL,
   with the host's own network and the real configuration. It
   never prints a secret (only whether one is set and its shape),
   never writes to the database, and never grants anything.
   Exit code 1 if any REQUIRED check fails.
   ============================================================= */
import { loadConfig } from './config.ts';
import { KalshiAdapter, DEFAULT_KALSHI_SERIES } from './engine/venues/kalshi.ts';
import { PolymarketAdapter } from './engine/venues/polymarket.ts';
import { buildCanonical } from './engine/canonical.ts';
import { openDb } from './db.ts';
import { evaluate } from './ledger/evaluation.ts';
import { discordConfigured } from './discord/oauth.ts';

type Level = 'REQUIRED' | 'ADVISORY';
const results: { name: string; ok: boolean; level: Level; detail: string }[] = [];
const check = (name: string, ok: boolean, level: Level, detail: string) => { results.push({ name, ok, level, detail }); console.log(`${ok ? 'PASS' : level === 'REQUIRED' ? 'FAIL' : 'WARN'}  ${name.padEnd(34)} ${detail}`); };
const shape = (s: string) => (s ? `set (${s.length} chars, starts "${s.slice(0, 4)}…")` : 'NOT SET');

const cfg = loadConfig();
console.log(`\nVIXY ARENA preflight · ${new Date().toISOString()} · NODE_ENV=${process.env.NODE_ENV ?? '(unset)'}\n`);

/* ---- configuration ---- */
check('NODE_ENV=production', cfg.production, 'REQUIRED', cfg.production ? 'production' : 'NOT production — cookies and guards differ');
check('SESSION_SECRET', Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32), 'REQUIRED', shape(process.env.SESSION_SECRET ?? ''));
check('COOKIE_SECURE', cfg.cookieSecure, 'REQUIRED', String(cfg.cookieSecure));
check('ENGINE', cfg.engine === 'live', 'REQUIRED', `${cfg.engine}${cfg.engine === 'demo' ? ' — the labeled simulator would serve the door' : ''}`);
check('MODEL', cfg.model === 'consensus', 'ADVISORY', `${cfg.model} (unvalidated by design)`);
check('DATABASE_PATH writable', (() => { try { const db = openDb(cfg.databasePath); db.close(); return true; } catch { return false; } })(), 'REQUIRED', cfg.databasePath);
check('STRIPE_WEBHOOK_SECRET', Boolean(cfg.stripe.webhookSecret), 'REQUIRED', shape(cfg.stripe.webhookSecret));
check('STRIPE_EMAIL_FALLBACK off', !cfg.stripe.emailFallback, 'REQUIRED', cfg.stripe.emailFallback ? 'ON — email would resolve identity' : 'off');
check('Discord configured', discordConfigured(cfg), cfg.discord.required ? 'REQUIRED' : 'ADVISORY', discordConfigured(cfg) ? `guild ${cfg.discord.guildId}${cfg.discord.roleId ? `, role ${cfg.discord.roleId}` : ''}` : 'client id/secret/guild/redirect missing');
check('APP_ORIGIN', Boolean(cfg.appOrigin) || cfg.staticDir !== null, 'ADVISORY', cfg.appOrigin ?? `same-origin (STATIC_DIR=${cfg.staticDir})`);

/* ---- venues, from THIS host ---- */
const kalshi = new KalshiAdapter();
const poly = new PolymarketAdapter();
const t0 = Date.now();
const [k, p] = await Promise.all([kalshi.fetchOpen(40), poly.fetchOpen(60)]);
check('Kalshi reachable', k.error === null, 'REQUIRED', k.error ?? `${k.markets.length} markets in ${k.latencyMs}ms from ${DEFAULT_KALSHI_SERIES.length} series${k.partial ? ` (partial: ${k.partial})` : ''}`);
check('Polymarket reachable', p.error === null, 'REQUIRED', p.error ?? `${p.markets.length} markets in ${p.latencyMs}ms (HTTP ${p.httpStatus})`);
const rows = [...k.markets, ...p.markets];
const now = Date.now();
const built = buildCanonical(rows, now);
const priced = built.markets.filter((m) => m.marketProbabilityBps !== null);
check('Canonical board is priced', priced.length > 0, 'REQUIRED', `${built.markets.length} canonical, ${priced.length} priced, ${built.matched} cross-venue matched`);
const fresh = built.markets.filter((m) => m.health.status === 'LIVE');
check('Board reads LIVE', fresh.length === built.markets.length && built.markets.length > 0, 'REQUIRED', `${fresh.length}/${built.markets.length} LIVE (age ≤ 60s)`);
const withDepth = priced.filter((m) => (m.venueRefs[0]?.liquidityUsd ?? 0) > 0);
check('Depth reported', withDepth.length > 0, 'ADVISORY', `${withDepth.length}/${priced.length} markets report depth`);
/* One verify round-trip: the call Arena Vision and settlement both depend on. */
const sample = k.markets.find((m) => m.status === 'OPEN');
let verified = false; let vDetail = 'no open Kalshi market to verify';
if (sample) { try { const one = await kalshi.fetchMarket(sample.venueMarketId); verified = one !== null && one.venueMarketId === sample.venueMarketId; vDetail = verified ? `${sample.venueMarketId} confirmed, implied ${one!.impliedBps} bps` : 'verify returned null'; } catch (e) { vDetail = e instanceof Error ? e.message : String(e); } }
check('Venue verify round-trip', verified, 'REQUIRED', vDetail);
check('Total venue latency', Date.now() - t0 < 20_000, 'ADVISORY', `${Date.now() - t0}ms for both venues`);

/* ---- Discord + Stripe endpoints (no secrets sent) ---- */
if (discordConfigured(cfg)) {
  try { const r = await fetch(`${cfg.discord.apiBase}/gateway`, { signal: AbortSignal.timeout(8000) }); check('Discord API reachable', r.ok, 'REQUIRED', `HTTP ${r.status} from ${cfg.discord.apiBase}`); }
  catch (e) { check('Discord API reachable', false, 'REQUIRED', e instanceof Error ? e.message : String(e)); }
  check('Discord redirect is https', cfg.discord.redirectUrl.startsWith('https://'), 'REQUIRED', cfg.discord.redirectUrl || '(unset)');
}
try { const r = await fetch('https://api.stripe.com/healthcheck', { signal: AbortSignal.timeout(8000) }); check('Stripe API reachable', r.status < 500, 'ADVISORY', `HTTP ${r.status} (outbound only; the webhook is inbound)`); }
catch (e) { check('Stripe API reachable', false, 'ADVISORY', e instanceof Error ? e.message : String(e)); }

/* ---- the evaluation record, stated honestly ---- */
const db = openDb(cfg.databasePath);
const ev = evaluate(db);
db.close();
console.log(`\nModel validation: ${ev.status} — ${ev.verdict}\n`);

const failed = results.filter((r) => !r.ok && r.level === 'REQUIRED');
console.log(`${results.filter((r) => r.ok).length}/${results.length} checks passed; ${failed.length} REQUIRED failure(s).`);
if (failed.length) { console.log('\nDo not open the door until these pass:\n' + failed.map((f) => `  · ${f.name}: ${f.detail}`).join('\n')); process.exit(1); }
console.log('\nPreflight clean. LIVE DATA and DEPLOYMENT lines in docs/PRODUCTION-READINESS.md may be marked PASS with this output attached.');
console.log('MODEL VALIDATION stays FAIL until the evaluation reports out-of-sample skill > 0.');
