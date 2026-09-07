import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const OUT = process.env.OUT || 'shots-landing'; fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const errsAll = [];
async function run(name, w, h, route, full, act) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await p.goto('http://127.0.0.1:8123/index.html#/landing');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('vixy_arena:onboarding_dismissed', '1'); localStorage.setItem('vixy_arena:ui_prefs', JSON.stringify({ tourDone: true, motion: false })); });
  await p.goto('http://127.0.0.1:8123/index.html#/' + route); await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(2500);
  if (act) await act(p);
  if (full) await p.evaluate(() => { const m = document.querySelector('main'); if (m) { m.style.overflow = 'visible'; m.style.height = 'auto'; m.style.maxHeight = 'none'; } document.querySelectorAll('.shell').forEach((e) => { e.style.height = 'auto'; e.style.overflow = 'visible'; }); document.documentElement.style.overflow = 'visible'; document.body.style.overflow = 'visible'; });
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  const hash = await p.evaluate(() => location.hash);
  console.log(name, 'overflow:', overflow, 'hash:', hash, errs.length ? errs : '');
  errsAll.push(...errs); await ctx.close();
}
await run('landing-desktop', 1440, 900, 'landing', true);
await run('landing-mobile', 390, 844, 'landing', true);
await run('hero-desktop', 1440, 900, 'landing', false);
await run('hero-mobile', 390, 844, 'landing', false);
// CTA routing
await run('vision-closeup', 1440, 900, 'landing', false, async (p) => { await p.evaluate(() => document.querySelector('.lp-scanner').scrollIntoView({ block: 'start' })); await p.waitForTimeout(500); });
await run('bridge-closeup', 1440, 900, 'landing', false, async (p) => { await p.evaluate(() => document.querySelector('.lp-bridge').scrollIntoView({ block: 'center' })); await p.waitForTimeout(500); });
await run('vision-mobile', 390, 844, 'landing', false, async (p) => { await p.evaluate(() => document.querySelector('.lp-scanner').scrollIntoView({ block: 'start' })); await p.waitForTimeout(500); });
await run('cta-create', 1440, 900, 'landing', false, async (p) => { await p.click('.lp-hero .btn-primary'); await p.waitForTimeout(800); });
await run('cta-signin', 1440, 900, 'landing', false, async (p) => { await p.click('.lp-hero >> text=Sign in'); await p.waitForTimeout(800); });
await run('cta-bridge', 1440, 900, 'landing', false, async (p) => { await p.click('.lp-bridge .btn-primary'); await p.waitForTimeout(800); });
await run('cta-door', 1440, 900, 'landing', false, async (p) => { await p.click('.lp-door .btn-primary'); await p.waitForTimeout(800); });
await run('cta-card', 1440, 900, 'landing', false, async (p) => { await p.click('.lp-card >> nth=0'); await p.waitForTimeout(800); });
await b.close();
console.log('total console errors:', errsAll.length);
