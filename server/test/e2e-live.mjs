/* E2E on the LIVE engine fed by the captured venue fixtures: does every screen
   render real markets with NO VIXY numbers, LIVE origin, and no console errors? */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
import { startServer } from '../index.ts';
import { LiveEngine } from '../engine/LiveEngine.ts';
import { normalizeKalshiMarket } from '../engine/venues/kalshi.ts';
import { normalizePolymarketMarket } from '../engine/venues/polymarket.ts';
import { grantEntitlement } from '../billing/entitlements.ts';

const OUT = 'shots-e2e-live'; mkdirSync(OUT, { recursive: true });
const fx = (n) => JSON.parse(readFileSync(new URL(`../engine/venues/fixtures/${n}`, import.meta.url), 'utf8'));
const AT = new Date().toISOString();
const k = fx('kalshi-markets-nfl.json').markets; const pm = fx('polymarket-gamma-markets.json').markets;
const kalshi = { venue: 'KALSHI', async fetchOpen() { return { venue: 'KALSHI', fetchedAt: new Date().toISOString(), latencyMs: 80, error: null, markets: k.map((m) => normalizeKalshiMarket(m, { category: 'Sports', series_ticker: 'KXNFLGAME', title: m.rules_primary.match(/the (.*?) Pro Football/)[1] }, AT)) }; } };
const poly = { venue: 'POLYMARKET', async fetchOpen() { return { venue: 'POLYMARKET', fetchedAt: new Date().toISOString(), latencyMs: 120, error: null, markets: pm.map((m) => normalizePolymarketMarket(m, AT)).filter(Boolean) }; } };
const engine = new LiveEngine({ adapters: [kalshi, poly], refreshMs: 5000 , model: 'consensus' });
const srv = await startServer({ port: 0, databasePath: ':memory:', staticDir: 'dist-prod', production: false, cookieSecure: false, discord: { required: false, clientId: '', clientSecret: '', guildId: '', roleId: '', redirectUrl: '', apiBase: '', oauthBase: '', recheckMs: 86_400_000, maxAgeMs: 14 * 86_400_000, recheckLoopMs: 0 }, settleSweepMs: 0 }, { engine });
const BASE = `http://127.0.0.1:${srv.port}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error' && !/status of (401|403|400|422)/.test(m.text())) errors.push(m.text().slice(0, 200)); });
await page.goto(`${BASE}/`); await page.waitForTimeout(1500);
await page.evaluate(() => { localStorage.setItem('vixy_arena:ui_prefs', JSON.stringify({ tourDone: true, motion: false })); localStorage.setItem('vixy_arena:onboarding_dismissed', '1'); });
await page.screenshot({ path: `${OUT}/00-landing-live-public.png`, fullPage: false });
const landing = await page.evaluate(() => document.body.innerText);
console.log('landing has DEMO badge?', /DEMO DATA/.test(landing), '| tracked:', /(\d+)\s*TRACKED/i.exec(landing)?.[1], '| calibration shows:', /([—\d.%-]+)\s*CALIBRATION/i.exec(landing)?.[1]);
/* sign up, grant via the audited path, enter */
await page.goto(`${BASE}/#/markets`); await page.waitForTimeout(1200);
await page.fill('input[autocomplete=username]', 'oliver'); await page.fill('input[type=email]', 'o@example.com'); await page.fill('input[type=password]', 'password123');
await page.click('button[type=submit]'); await page.waitForTimeout(1500);
const uid = (srv.db.prepare('SELECT id FROM users').get()).id;
grantEntitlement(srv.db, { userId: uid, planId: 'operator', stripeCustomerId: null, stripeSubscriptionId: null, currentPeriodEnd: Date.now() + 864e5, source: 'operator:cli', actor: 'operator:cli' });
await page.reload(); await page.waitForTimeout(1500);
if (await page.locator('text=Enter the Arena').count()) { await page.click('text=Enter the Arena'); await page.waitForTimeout(2000); }
const routes = ['markets', 'arena', 'match', 'live', 'sector/sports', 'sector/economics', 'brain', 'telemetry', 'portfolio', 'leaderboard', 'daily', 'upnext', 'signals', 'admin', 'vision', 'profile', 'history', 'cross', 'neural'];
for (const r of routes) {
  await page.goto(`${BASE}/#/${r}`); await page.waitForTimeout(1300);
  await page.screenshot({ path: `${OUT}/${r.replace('/', '-')}.png` });
  const t = await page.evaluate(() => document.body.innerText);
  const badge = /DEMO DATA/.test(t) ? 'DEMO-BADGE!' : 'no demo badge'; const sim = /SIMULATED/.test(t) ? 'SIMULATED!' : '';
  console.log(r.padEnd(18), t.length, 'chars', badge, sim, 'errors so far:', errors.length);
}
console.log('console errors:', errors.length, errors.slice(0, 6));
await browser.close(); await srv.close();
