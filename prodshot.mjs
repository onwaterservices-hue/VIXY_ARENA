import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
for (const [route,name] of [['markets','prod-markets'],['landing','prod-landing'],['auth','prod-auth'],['access','prod-access'],['locked','prod-locked']]) {
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, reducedMotion:'reduce' });
  const p = await ctx.newPage(); const errs=[];
  p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:8124/index.html#/landing');
  await p.evaluate(()=>{ localStorage.clear(); localStorage.setItem('vixy_arena:landing_seen','1'); localStorage.setItem('vixy_arena:onboarding_dismissed','1'); localStorage.setItem('vixy_arena:ui_prefs', JSON.stringify({tourDone:true,motion:false})); });
  await p.goto('http://127.0.0.1:8124/index.html#/'+route); await p.reload({waitUntil:'load'}); await p.waitForTimeout(2500);
  await p.screenshot({ path:`shots/${name}-desktop.png` });
  const t = await p.evaluate(()=>document.body.innerText);
  console.log('=== '+name+' ===\n'+t.replace(/\n+/g,' | ').slice(0,700)); console.log('errors:', errs.slice(0,3));
  await ctx.close();
}
await b.close();
