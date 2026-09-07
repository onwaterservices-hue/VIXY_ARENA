import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const shots = [
  [8124, 'markets', 'prod-markets', 1440, 900, null],
  [8124, 'markets', 'prod-markets-m', 390, 844, null],
  [8124, 'landing', 'prod-landing', 1440, 900, null],
  [8123, 'markets', 'demo-markets-m', 390, 844, 'open'],
  [8123, 'markets', 'demo-locked-m', 390, 844, 'unlock'],
  [8123, 'live', 'demo-live', 1440, 900, 'open'],
  [8123, 'telemetry', 'demo-telemetry', 1440, 900, 'open'],
  [8123, 'landing', 'demo-landing', 1440, 900, null],
  [8123, 'auth/signin', 'demo-signin', 1440, 900, null],
  [8123, 'access', 'demo-access-unlock', 1440, 900, 'unlock'],
  [8123, 'neural', 'demo-neural', 1440, 900, 'open'],
];
const acct = { id: 'a1b2c3d4e5f60718', email: 'oliver@example.com', handle: 'oliver', createdAt: Date.now() - 86400000, salt: 'x', digest: 'y' };
const STATES = { unlock: { account: acct, signedIn: true, simulatedPaid: false, discordJoined: false }, open: { account: acct, signedIn: true, simulatedPaid: true, discordJoined: true } };
for (const [port, route, name, w, h, st] of shots) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  await p.goto(`http://127.0.0.1:${port}/index.html#/landing`);
  await p.evaluate((rec) => { localStorage.clear(); localStorage.setItem('vixy_arena:landing_seen', '1'); localStorage.setItem('vixy_arena:onboarding_dismissed', '1'); localStorage.setItem('vixy_arena:welcome_dismissed', '1'); localStorage.setItem('vixy_arena:ui_prefs', JSON.stringify({ tourDone: true, motion: false })); if (rec) localStorage.setItem('vixy_arena_preview:auth', JSON.stringify(rec)); }, st ? STATES[st] : null);
  await p.goto(`http://127.0.0.1:${port}/index.html#/${route}`); await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(2500);
  if (name === 'demo-signin') { await p.fill('input[type=email]', 'oliver@example.com'); await p.click('text=Forgot password?'); await p.waitForTimeout(400); }
  await p.screenshot({ path: `shots/${name}.png` });
  const t = await p.evaluate(() => document.body.innerText);
  console.log(`=== ${name} (${t.length} chars) === ${t.replace(/\n+/g, ' | ').slice(0, 260)}`); if (errs.length) console.log('   errors:', errs.slice(0, 2));
  await ctx.close();
}
await b.close();
