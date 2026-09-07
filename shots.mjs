import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8123';
const OUT = process.env.OUT || '/home/claude/arena/shots';
fs.mkdirSync(OUT, { recursive: true });

const NS = 'vixy_arena:';
const AUTH_KEY = 'vixy_arena_preview:auth';
const acct = { id: 'a1b2c3d4e5f60718', email: 'oliver@example.com', handle: 'oliver', createdAt: Date.now() - 86400000, salt: 'x', digest: 'y' };
const STATES = {
  fresh:   null,
  unlock:  { account: acct, signedIn: true, simulatedPaid: false, discordJoined: false },
  discord: { account: acct, signedIn: true, simulatedPaid: true, discordJoined: false },
  open:    { account: acct, signedIn: true, simulatedPaid: true, discordJoined: true },
};

const SIZES = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

const OPEN_ROUTES = ['markets','arena','match','live','vision','daily','upnext',
  'sector/sports','sector/crypto','sector/politics','sector/weather','sector/macro','sector/entertainment','sector/news',
  'signals','watchlist','alerts','portfolio','history','leaderboard','brain','cross','neural','telemetry','admin','profile','access','settings','help','locked'];

const DOOR = [
  ['fresh','landing','01-landing'],
  ['fresh','auth','02-auth-create'],
  ['fresh','auth/signin','03-auth-signin'],
  ['unlock','markets','04-locked-unlock'],
  ['unlock','access','05-access-unlock'],
  ['discord','markets','06-locked-discord'],
  ['discord','access','07-access-discord'],
];

const browser = await chromium.launch();
const log = [];
async function shot(sizeName, stateName, route, name, full) {
  const ctx = await browser.newContext({ viewport: SIZES[sizeName], deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE + '/index.html#/landing');
  await page.evaluate(({ NS, AUTH_KEY, rec, tour }) => {
    localStorage.clear();
    localStorage.setItem(NS + 'landing_seen', '1');
    localStorage.setItem(NS + 'onboarding_dismissed', '1');
    localStorage.setItem(NS + 'welcome_dismissed', '1');
    localStorage.setItem(NS + 'ui_prefs', JSON.stringify({ tourDone: tour, motion: false }));
    if (rec) localStorage.setItem(AUTH_KEY, JSON.stringify(rec)); else localStorage.removeItem(AUTH_KEY);
  }, { NS, AUTH_KEY, rec: STATES[stateName], tour: true });
  await page.goto(BASE + '/index.html#/' + route); await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2600);
  // dismiss boot if any remains
  const text = await page.evaluate(() => document.body.innerText);
  const file = `${OUT}/${name}-${sizeName}.png`;
  await page.screenshot({ path: file, fullPage: !!full });
  log.push({ name, sizeName, stateName, route, file, errors, textLen: text.length, text });
  await ctx.close();
  return text;
}

for (const size of Object.keys(SIZES)) {
  for (const [state, route, name] of DOOR) await shot(size, state, route, name, name === '01-landing');
  let i = 10;
  for (const r of OPEN_ROUTES) {
    const name = String(i++).padStart(2, '0') + '-' + r.replace('/', '-');
    await shot(size, 'open', r, name, false);
  }
}
await browser.close();
fs.writeFileSync(`${OUT}/log.json`, JSON.stringify(log, null, 2));
console.log('done', log.length, 'shots;', log.filter((l) => l.errors.length).length, 'with errors');
for (const l of log.filter((l) => l.errors.length)) console.log(l.name, l.sizeName, l.errors.slice(0, 3));
