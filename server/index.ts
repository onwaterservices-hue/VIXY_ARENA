/* =============================================================
   VIXY ARENA — API + static server. Zero dependencies.
     node server/index.ts
   ============================================================= */
import { createServer } from 'node:http';
import { loadConfig, type ServerConfig } from './config.ts';
import { openDb, type DB } from './db.ts';
import { makeCtx, sendJson, serveStatic, HttpError } from './http.ts';
import { buildRouter, jsonError } from './routes.ts';
import { DemoEngine } from './engine/DemoEngine.ts';
import { LiveEngine } from './engine/LiveEngine.ts';
import type { EngineSource } from './engine/EngineSource.ts';
import { startSettlementLoop } from './ledger/settlement.ts';
import { startDiscordRecheckLoop } from './discord/sync.ts';
import { discordConfigured } from './discord/oauth.ts';

export interface RunningServer { port: number; close(): Promise<void>; db: DB; cfg: ServerConfig }

export function startServer(overrides: Partial<ServerConfig> = {}, deps: { engine?: EngineSource; now?: () => number } = {}): Promise<RunningServer> {
  const cfg = { ...loadConfig(), ...overrides };
  const db = openDb(cfg.databasePath);
  const engine = deps.engine ?? (cfg.engine === 'live'
    ? new LiveEngine({ refreshMs: cfg.engineRefreshMs, environment: cfg.production ? 'PRODUCTION' : 'DEVELOPMENT', model: cfg.model === 'none' ? null : cfg.model, store: db })
    : new DemoEngine());
  const router = buildRouter({ db, cfg, engine, now: deps.now });
  const stopDiscord = discordConfigured(cfg) && cfg.discord.recheckLoopMs > 0 ? startDiscordRecheckLoop(db, cfg, cfg.discord.recheckLoopMs) : () => {};
  const stopSettlement = cfg.settleSweepMs > 0 ? startSettlementLoop(db, engine, cfg.settleSweepMs, (r) => { if (r.settled || r.errors.length) console.log('[settlement]', r); }) : () => {};

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    /* CORS only when the app is on another origin, and only for that origin. */
    if (cfg.appOrigin && req.headers.origin === cfg.appOrigin) {
      res.setHeader('Access-Control-Allow-Origin', cfg.appOrigin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'content-type,stripe-signature', 'Access-Control-Max-Age': '600' });
        res.end(); return;
      }
    }
    if (url.pathname.startsWith('/api/')) {
      const m = router.match(req.method ?? 'GET', url.pathname);
      const ctx = makeCtx(req, res, url, m?.params ?? {});
      if (!m) { jsonError(ctx, new HttpError(404, 'not_found', 'No such API route.')); return; }
      /* Same-site CSRF check for mutations: Origin/Referer must match our host. Webhooks are exempt (signed). */
      if (req.method !== 'GET' && url.pathname !== '/api/billing/webhook') {
        const origin = req.headers.origin ?? (req.headers.referer ? new URL(req.headers.referer).origin : null);
        const self = `${cfg.appOrigin ?? (req.headers['x-forwarded-proto'] ?? 'http') + '://' + req.headers.host}`;
        if (origin && origin !== self && origin !== cfg.appOrigin) { jsonError(ctx, new HttpError(403, 'bad_origin', 'Cross-site request refused.')); return; }
      }
      try {
        const out = await m.route.handler(ctx);
        if (out !== undefined && !res.headersSent) sendJson(res, res.statusCode === 201 ? 201 : 200, out);
      } catch (e) { if (!res.headersSent) jsonError(ctx, e); else res.end(); }
      return;
    }
    if (cfg.staticDir && serveStatic(cfg.staticDir, url.pathname, res)) return;
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found');
  });

  return new Promise((resolve) => {
    server.listen(cfg.port, cfg.host, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : cfg.port;
      resolve({ port, db, cfg, close: () => new Promise((r) => { stopSettlement(); stopDiscord(); server.closeAllConnections(); server.close(() => { db.close(); r(); }); }) });
    });
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  startServer().then((s) => {
    console.log(`[VIXY ARENA] api+static on http://${s.cfg.host}:${s.port}  db=${s.cfg.databasePath}  static=${s.cfg.staticDir ?? '(none)'}  production=${s.cfg.production}`);
    console.log(`[VIXY ARENA] discord=${s.cfg.discord.clientId ? 'configured' : 'NOT configured'}  stripe=${s.cfg.stripe.webhookSecret ? 'configured' : 'NOT configured'}  mail=${s.cfg.mail.mode}`);
  });
}
