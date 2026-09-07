/* =============================================================
   E2E — the real door, in a real browser, on the production bundle.
   Starts server/index.ts (serving dist-prod) plus a stub Discord,
   then walks: landing → create account → locked (UNLOCK) → Stripe
   webhook grants → JOIN_DISCORD → OAuth (stub) → OPEN board with the
   DEMO badge → sign out → "can't verify" with the API down.
   Screenshots + a request log land in shots-e2e/.
     node server/test/e2e.mjs
   ============================================================= */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { startServer } from '../index.ts';
import { signStripePayload } from '../billing/stripe.ts';

const OUT = 'shots-e2e'; mkdirSync(OUT, { recursive: true });
const STRIPE_SECRET = 'whsec_e2e_' + 'y'.repeat(24);
const log = [];
const note = (m) => { console.log(m); log.push(m); };

/* stub Discord */
let discordPort = 0; let discordUsers = 0;
/* One Discord account can link to one Arena account, so each OAuth exchange in this walk is a different Discord user. */
const discordStub = createServer((req, rs) => {
  const json = (c, b) => { rs.writeHead(c, { 'content-type': 'application/json' }); rs.end(JSON.stringify(b)); };
  if (req.url === '/oauth2/token') { discordUsers++; return json(200, { access_token: `t${discordUsers}`, refresh_token: `r${discordUsers}`, token_type: 'Bearer' }); }
  if (req.url === '/users/@me') return json(200, { id: `77${discordUsers}`, username: `oliver${discordUsers}` });
  if (req.url?.startsWith('/users/@me/guilds/')) return json(200, { roles: [] });
  /* the "authorize" page: immediately redirect back with a code, like a user who clicked Authorize */
  if (req.url?.startsWith('/oauth2/authorize')) {
    const u = new URL(req.url, 'http://x'); const state = u.searchParams.get('state'); const redirect = u.searchParams.get('redirect_uri');
    rs.writeHead(302, { location: `${redirect}?code=ok&state=${state}` }); return rs.end();
  }
  json(404, {});
});
await new Promise((r) => discordStub.listen(0, '127.0.0.1', () => { discordPort = discordStub.address().port; r(); }));

const srv = await startServer({
  port: 0, databasePath: ':memory:', staticDir: 'dist-prod', production: false, cookieSecure: false,
  stripe: { webhookSecret: STRIPE_SECRET, toleranceSec: 300, emailFallback: false },
  discord: { required: true, clientId: 'cid', clientSecret: 'sec', guildId: 'g', roleId: '', redirectUrl: '', apiBase: `http://127.0.0.1:${discordPort}`, oauthBase: `http://127.0.0.1:${discordPort}/oauth2/authorize`, recheckMs: 86_400_000, maxAgeMs: 14 * 86_400_000, recheckLoopMs: 0 },
  settleSweepMs: 0,
});
const BASE = `http://127.0.0.1:${srv.port}`;
srv.cfg.discord.redirectUrl = `${BASE}/api/auth/discord/callback`;
note(`server on ${BASE}`);

const browser = await chromium.launch();
async function shoot(page, name) { await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/${name}.png` }); }
async function apiStatus(page, path, method = 'GET') {
  return page.evaluate(async ({ path, method }) => { const r = await fetch(path, { method, credentials: 'include', headers: { 'content-type': 'application/json' }, body: method === 'GET' ? undefined : '{}' }); return r.status; }, { path, method });
}
async function gateCheck(page, label) {
  const snap = await apiStatus(page, '/api/snapshot'); const calls = await apiStatus(page, '/api/calls', 'POST'); const scan = await apiStatus(page, '/api/scan', 'POST');
  note(`[${label}] GET /api/snapshot=${snap}  POST /api/calls=${calls}  POST /api/scan=${scan}`);
  return { snap, calls, scan };
}

for (const [w, h, tag] of [[1440, 900, 'desktop'], [390, 844, 'mobile']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  /* resource 401/403 lines are this script's own gate probes; anything else counts */
  page.on('console', (m) => { if (m.type() === 'error' && !/status of (401|403|400)/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  const email = `oliver+${tag}@example.com`;

  /* 1. fresh visitor: landing (public), door */
  await page.goto(`${BASE}/`); await page.waitForTimeout(2200);
  await page.evaluate(() => localStorage.setItem('vixy_arena:ui_prefs', JSON.stringify({ tourDone: true, motion: false })));
  await shoot(page, `${tag}-01-landing`);
  let g = await gateCheck(page, `${tag} no session`); if (g.snap !== 401) throw new Error('expected 401');
  await page.goto(`${BASE}/#/markets`); await page.waitForTimeout(1500); await shoot(page, `${tag}-02-door`);
  const text = await page.evaluate(() => document.body.innerText);
  if (!/Create your account/.test(text)) throw new Error('door not shown');

  /* 2. create account through the real form */
  await page.fill('input[autocomplete=username]', tag === 'desktop' ? 'oliver' : 'oliver_m');
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', 'password123');
  await page.click('button[type=submit]'); await page.waitForTimeout(1800);
  await shoot(page, `${tag}-03-locked-unlock`);
  let body = await page.evaluate(() => document.body.innerText);
  if (!/TERMINAL LOCKED/i.test(body) || /Simulate a confirmed payment/.test(body)) throw new Error('expected locked UNLOCK without simulate button');
  const pcts = (body.match(/\d+\.\d%/g) || []); note(`[${tag} UNLOCK] percentages visible on locked screen: ${pcts.join(' ') || 'none'}`);
  g = await gateCheck(page, `${tag} UNLOCK`); if (g.snap !== 403) throw new Error('expected 403');

  /* 3. Stripe webhook grants (signed, from "Stripe") */
  const userId = await page.evaluate(async () => (await (await fetch('/api/auth/session')).json()).session.userId);
  const evt = JSON.stringify({ id: `evt_${tag}`, type: 'checkout.session.completed', data: { object: { client_reference_id: userId, customer: `cus_${tag}`, payment_status: 'paid' } } });
  const wh = await fetch(`${BASE}/api/billing/webhook`, { method: 'POST', headers: { 'stripe-signature': signStripePayload(evt, STRIPE_SECRET) }, body: evt });
  note(`[${tag}] webhook → ${wh.status} ${await wh.text()}`);
  await page.reload(); await page.waitForTimeout(1800); await shoot(page, `${tag}-04-locked-discord`);
  body = await page.evaluate(() => document.body.innerText);
  if (!/Join the room|Discord/i.test(body)) throw new Error('expected JOIN_DISCORD');
  g = await gateCheck(page, `${tag} JOIN_DISCORD`); if (g.snap !== 403) throw new Error('expected 403');

  /* 4. Discord OAuth through the stub (real server code path) */
  await page.click('text=Verify with Discord'); await page.waitForTimeout(2500);
  note(`[${tag}] after OAuth → ${page.url()}`);
  await shoot(page, `${tag}-05-open-gate`);
  await page.click('text=Enter the Arena'); await page.waitForTimeout(2500);
  await shoot(page, `${tag}-06-board`);
  body = await page.evaluate(() => document.body.innerText);
  if (!/DEMO DATA/.test(body)) throw new Error('board must carry the DEMO badge (server-hosted simulator)');
  g = await gateCheck(page, `${tag} OPEN`); if (g.snap !== 200) throw new Error('expected 200');

  /* 5. sign out → door; old cookie dead */
  await page.goto(`${BASE}/#/settings`); await page.waitForTimeout(1500);
  await page.click('text=Sign out'); await page.waitForTimeout(1500);
  await shoot(page, `${tag}-07-after-signout`);
  g = await gateCheck(page, `${tag} after sign-out`); if (g.snap !== 401) throw new Error('expected 401 after sign-out');

  note(`[${tag}] console errors: ${errors.length}${errors.length ? ' ' + JSON.stringify(errors.slice(0, 3)) : ''}`);
  await ctx.close();
}

/* 6. API down → "can't verify", never the board */
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const page = await ctx.newPage();
await page.route('**/api/**', (r) => r.abort());
await page.goto(`${BASE}/#/markets`); await page.waitForTimeout(2500);
await shoot(page, 'desktop-08-api-down');
const down = await page.evaluate(() => document.body.innerText);
if (!/can’t be verified|can't be verified/i.test(down)) throw new Error('expected can’t-verify state');
note(`[api down] shows: ${down.split('\n').filter(Boolean)[0]}`);
await ctx.close();

await browser.close(); await srv.close(); discordStub.close();
writeFileSync(`${OUT}/request-log.txt`, log.join('\n'));
note('E2E OK');
