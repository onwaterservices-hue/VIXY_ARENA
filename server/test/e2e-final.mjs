/* FINAL PASS — every terminal screen, desktop + mobile, on the LIVE engine with the
   real model, in a state that has model reads, one lock and one settlement.
   Nothing here is fabricated inside the app: the venue stub moves prices the way a
   venue would, and the model/policy/ledger/settlement are the production paths. */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
import { startServer } from '../index.ts';
import { LiveEngine } from '../engine/LiveEngine.ts';
import { normalizeKalshiMarket } from '../engine/venues/kalshi.ts';
import { normalizePolymarketMarket } from '../engine/venues/polymarket.ts';
import { grantEntitlement } from '../billing/entitlements.ts';
import { settlementSweep } from '../ledger/settlement.ts';

const OUT = 'shots-final'; mkdirSync(OUT, { recursive: true });
const fx = (n) => JSON.parse(readFileSync(new URL(`../engine/venues/fixtures/${n}`, import.meta.url), 'utf8'));
const k = fx('kalshi-markets-nfl.json').markets; const pm = fx('polymarket-gamma-markets.json').markets;

/* Price overrides (dollar strings) and a published result, per Kalshi ticker. */
const price = new Map(); const result = new Map();
const kRows = () => k.map((m) => {
  const p = price.get(m.ticker); const r = result.get(m.ticker);
  const mm = { ...m, ...(p ? { yes_bid_dollars: (p - 0.01).toFixed(4), yes_ask_dollars: (p + 0.01).toFixed(4), liquidity_dollars: '25000.00' } : {}), ...(r ? { result: r, status: 'finalized' } : {}) };
  return normalizeKalshiMarket(mm, { category: 'Sports', series_ticker: 'KXNFLGAME', title: m.rules_primary.match(/the (.*?) Pro Football/)[1] }, new Date().toISOString());
});
const kalshi = { venue: 'KALSHI', async fetchOpen() { return { venue: 'KALSHI', fetchedAt: new Date().toISOString(), latencyMs: 80, error: null, markets: kRows() }; }, async fetchMarket(id) { return kRows().find((r) => r.venueMarketId === id) ?? null; } };
const poly = { venue: 'POLYMARKET', async fetchOpen() { return { venue: 'POLYMARKET', fetchedAt: new Date().toISOString(), latencyMs: 120, error: null, markets: pm.map((m) => normalizePolymarketMarket(m, new Date().toISOString())).filter(Boolean) }; } };
const engine = new LiveEngine({ adapters: [kalshi, poly], refreshMs: 30_000, model: 'consensus' });
const srv = await startServer({ port: 0, databasePath: ':memory:', staticDir: 'dist-prod', production: false, cookieSecure: false, discord: { required: false, clientId: '', clientSecret: '', guildId: '', roleId: '', redirectUrl: '', apiBase: '', oauthBase: '', recheckMs: 86_400_000, maxAgeMs: 14 * 86_400_000, recheckLoopMs: 0 }, settleSweepMs: 0 }, { engine });
const BASE = `http://127.0.0.1:${srv.port}`;

/* Build history: two games drift (one up, one down) over 22 refreshes; the rest stay flat (→ SKIP). */
const UP = 'KXNFLGAME-26SEP21NYGLAR-NYG', DOWN = 'KXNFLGAME-26SEP20INDKC-KC';
const base0 = { [UP]: 0.40, [DOWN]: 0.72 };
for (let i = 0; i < 22; i++) {
  price.set(UP, base0[UP] + i * 0.006); price.set(DOWN, base0[DOWN] - i * 0.006);
  await engine.refresh(); await new Promise((r) => setTimeout(r, 15));
}
const snap = await engine.load();
const withReads = snap.markets.filter((m) => m.vixyProbabilityBps !== null);
console.log('markets', snap.markets.length, 'with model reads', withReads.length, withReads.map((m) => `${m.symbol} mkt ${m.marketProbabilityBps} vixy ${m.vixyProbabilityBps} edge ${m.edgeBps} conf ${m.confidenceBps}`));

const browser = await chromium.launch();
async function walk(width, height, tag) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error' && !/status of (401|403|400|422)/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.goto(`${BASE}/`); await page.waitForTimeout(1200);
  await page.evaluate(() => { localStorage.setItem('vixy_arena:ui_prefs', JSON.stringify({ tourDone: true, motion: false })); localStorage.setItem('vixy_arena:onboarding_dismissed', '1'); });
  await page.goto(`${BASE}/#/markets`); await page.waitForTimeout(1000);
  const email = `${tag}@example.com`;
  if (await page.locator('input[type=email]').count()) {
    await page.fill('input[autocomplete=username]', tag); await page.fill('input[type=email]', email); await page.fill('input[type=password]', 'password123');
    await page.click('button[type=submit]'); await page.waitForTimeout(1200);
  }
  const uid = srv.db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
  grantEntitlement(srv.db, { userId: uid, planId: 'operator', stripeCustomerId: null, stripeSubscriptionId: null, currentPeriodEnd: Date.now() + 864e5, source: 'operator:cli', actor: 'operator:cli' });
  await page.reload(); await page.waitForTimeout(1500);
  if (await page.locator('text=Enter the Arena').count()) { await page.click('text=Enter the Arena'); await page.waitForTimeout(1500); }

  /* One real lock through the API (the policy has 16 prior reads to look at), then a venue-published settlement. */
  const upM = withReads.find((m) => m.venueRefs[0].venueMarketId === UP);
  if (upM && tag === 'desktop') {
    const r = await page.evaluate(async (id) => { const x = await fetch('/api/calls', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ marketId: id, direction: 'YES', stakePoints: 120 }) }); return { s: x.status, j: await x.json() }; }, upM.id);
    console.log('lock →', r.s, r.s === 201 ? r.j.id : r.j.message);
    const downM = withReads.find((m) => m.venueRefs[0].venueMarketId === DOWN);
    if (downM) {
      const r2 = await page.evaluate(async (id) => { const x = await fetch('/api/calls', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ marketId: id, direction: 'NO', stakePoints: 80 }) }); return { s: x.status, j: await x.json() }; }, downM.id);
      console.log('lock 2 →', r2.s, r2.s === 201 ? r2.j.id : r2.j.message);
      /* The venue publishes the second game: NO wins. Sweep at a time past close. */
      result.set(DOWN, 'no');
      const rep = await settlementSweep(srv.db, engine, new Date('2026-10-01T00:00:00Z').getTime());
      console.log('settlement sweep', rep);
    }
    await page.reload(); await page.waitForTimeout(1500);
  }
  const routes = ['markets', 'arena', 'match', 'live', 'sector/sports', 'sector/economics', 'brain', 'telemetry', 'portfolio', 'leaderboard', 'daily', 'upnext', 'signals', 'admin', 'vision', 'profile', 'history', 'cross', 'neural', 'watchlist', 'alerts', 'settings', 'help'];
  for (const r of routes) {
    await page.goto(`${BASE}/#/${r}`); await page.waitForTimeout(1100);
    await page.screenshot({ path: `${OUT}/${tag}-${r.replace('/', '-')}.png` });
    const t = await page.evaluate(() => document.body.innerText);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    console.log(tag.padEnd(7), r.padEnd(16), String(t.length).padStart(5), 'chars', /DEMO DATA/.test(t) ? 'DEMO-BADGE!' : '', /SIMULATED/.test(t) ? 'SIMULATED!' : '', overflow ? 'H-OVERFLOW!' : '', 'errs', errors.length);
  }
  await ctx.close();
  return errors;
}
const e1 = await walk(1440, 900, 'desktop');
const e2 = await walk(390, 844, 'mobile');
console.log('console errors desktop', e1.length, e1.slice(0, 5), 'mobile', e2.length, e2.slice(0, 5));
await browser.close(); await srv.close();
