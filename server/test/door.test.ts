/* =============================================================
   THE DOOR, END TO END — node:test against a real server on an
   ephemeral port, a temp database, and a stub Discord.
     node --test server/test/
   ============================================================= */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { startServer, type RunningServer } from '../index.ts';
import { attachCustomer, signStripePayload, unreconciledEvents } from '../billing/stripe.ts';
import { computeAccess } from '../auth/access.ts';
import { openToken, readLink, readSync, recheckDue } from '../discord/sync.ts';

let srv: RunningServer;
let discordStub: Server; let discordPort = 0;
let discordMember = true; let discordRoles: string[] = ['role_pro']; let discordDown = false; let discordTokenCalls = 0;
const STRIPE_SECRET = 'whsec_test_' + 'x'.repeat(24);

/* A stub Discord: token exchange, identity, guild membership. The server code
   path is the real one; only the host differs. */
function startDiscordStub(): Promise<void> {
  return new Promise((res) => {
    discordStub = createServer((req, rs) => {
      const json = (code: number, body: unknown) => { rs.writeHead(code, { 'content-type': 'application/json' }); rs.end(JSON.stringify(body)); };
      if (req.url === '/oauth2/token' && req.method === 'POST') { discordTokenCalls++; return discordDown ? json(503, {}) : json(200, { access_token: 'tok_stub', refresh_token: 'rt_stub_' + discordTokenCalls, token_type: 'Bearer' }); }
      if (req.url === '/users/@me') return json(200, { id: '4242', username: 'oliver_dc' });
      if (req.url?.startsWith('/users/@me/guilds/')) return discordMember ? json(200, { roles: discordRoles }) : json(404, { message: 'Unknown Guild' });
      json(404, { message: 'nope' });
    }).listen(0, '127.0.0.1', () => { discordPort = (discordStub.address() as { port: number }).port; res(); });
  });
}

/* A minimal cookie-aware client. */
class Client {
  cookie = '';
  base: string;
  constructor(base: string) { this.base = base; }
  async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const r = await fetch(this.base + path, {
      method, redirect: 'manual',
      headers: { 'content-type': 'application/json', origin: this.base, cookie: this.cookie, ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const set = r.headers.getSetCookie?.() ?? [];
    for (const c of set) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (v === '') this.cookie = ''; else this.cookie = `${k}=${v}`; }
    const text = await r.text();
    let json: any = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, json, text, headers: r.headers };
  }
}

before(async () => {
  await startDiscordStub();
  srv = await startServer({
    port: 0, databasePath: ':memory:', staticDir: null, production: false, cookieSecure: false,
    sessionIdleMs: 1500, sessionAbsoluteMs: 60 * 60_000, resetTokenMs: 60_000, rateLimitScale: 100,
    stripe: { webhookSecret: STRIPE_SECRET, toleranceSec: 300, emailFallback: false },
    discord: { required: true, clientId: 'cid', clientSecret: 'csec', guildId: 'g1', roleId: 'role_pro',
      redirectUrl: 'http://127.0.0.1/api/auth/discord/callback', apiBase: `http://127.0.0.1:${discordPort}`, oauthBase: 'https://discord.example/oauth2/authorize', recheckMs: 3_600_000, maxAgeMs: 14 * 86_400_000, recheckLoopMs: 0 },
  });
  /* Idle expiry is 1.5s in this suite so we can observe it. */
});
after(async () => { await srv.close(); discordStub.close(); });

const base = () => `http://127.0.0.1:${srv.port}`;
const ENGINE_ROUTES: [string, string, unknown?][] = [['GET', '/api/snapshot'], ['POST', '/api/calls', { marketId: 'x', direction: 'YES', stakePoints: 10 }], ['POST', '/api/scan', { fileName: 'a.png', mimeType: 'image/png', bytes: 1000, dataUrl: 'data:image/png;base64,AAAA' }]];

test('no session: every engine route is 401, session reports CREATE_ACCOUNT', async () => {
  const c = new Client(base());
  const s = await c.call('GET', '/api/auth/session');
  assert.equal(s.status, 200); assert.equal(s.json.session, null); assert.equal(s.json.access.stage, 'CREATE_ACCOUNT');
  for (const [m, p, b] of ENGINE_ROUTES) { const r = await c.call(m, p, b); assert.equal(r.status, 401, `${m} ${p}`); assert.equal(r.json.error, 'no_session'); }
  const st = await fetch(base() + '/api/stream'); assert.equal(st.status, 401);
});

test('signup validates, creates a session cookie, and lands at UNLOCK; engine routes are 403 stage_unlock', async () => {
  const c = new Client(base());
  assert.equal((await c.call('POST', '/api/auth/signup', { email: 'bad', handle: 'oliver', password: 'password123' })).status, 400);
  assert.equal((await c.call('POST', '/api/auth/signup', { email: 'o@example.com', handle: 'x', password: 'password123' })).status, 400);
  assert.equal((await c.call('POST', '/api/auth/signup', { email: 'o@example.com', handle: 'oliver', password: 'short' })).status, 400);
  const r = await c.call('POST', '/api/auth/signup', { email: 'O@Example.com', handle: 'oliver', password: 'password123' });
  assert.equal(r.status, 201); assert.equal(r.json.session.email, 'o@example.com'); assert.equal(r.json.access.stage, 'UNLOCK'); assert.equal(r.json.actions.previewUnlock, false);
  assert.match(c.cookie, /^vixy_session=/);
  const dup = await c.call('POST', '/api/auth/signup', { email: 'o@example.com', handle: 'other', password: 'password123' }); assert.equal(dup.status, 409);
  for (const [m, p, b] of ENGINE_ROUTES) { const x = await c.call(m, p, b); assert.equal(x.status, 403, `${m} ${p}`); assert.equal(x.json.error, 'stage_unlock'); }
});

test('sign-in with wrong password fails; right password restores the session', async () => {
  const c = new Client(base());
  assert.equal((await c.call('POST', '/api/auth/signin', { email: 'o@example.com', password: 'nope-nope' })).status, 401);
  const ok = await c.call('POST', '/api/auth/signin', { email: 'o@example.com', password: 'password123' });
  assert.equal(ok.status, 200); assert.equal(ok.json.session.handle, 'oliver');
});

test('cross-site mutation is refused', async () => {
  const c = new Client(base());
  const r = await c.call('POST', '/api/auth/signin', { email: 'o@example.com', password: 'password123' }, { origin: 'https://evil.example' });
  assert.equal(r.status, 403); assert.equal(r.json.error, 'bad_origin');
});

test('Stripe webhook: bad signature 400, good signature grants, replay is a no-op; stage moves to JOIN_DISCORD', async () => {
  const c = new Client(base());
  await c.call('POST', '/api/auth/signin', { email: 'o@example.com', password: 'password123' });
  const userId = (await c.call('GET', '/api/auth/session')).json.session.userId;
  const evt = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { client_reference_id: userId, customer: 'cus_1', subscription: 'sub_1', payment_status: 'paid' } } });
  const bad = await c.call('POST', '/api/billing/webhook', evt, { 'stripe-signature': 't=1,v1=00' }); assert.equal(bad.status, 400);
  const unsigned = await c.call('POST', '/api/billing/webhook', evt, {}); assert.equal(unsigned.status, 400);
  const good = await c.call('POST', '/api/billing/webhook', evt, { 'stripe-signature': signStripePayload(evt, STRIPE_SECRET) });
  assert.equal(good.status, 200); assert.match(good.json.result, /granted/);
  const replay = await c.call('POST', '/api/billing/webhook', evt, { 'stripe-signature': signStripePayload(evt, STRIPE_SECRET) });
  assert.match(replay.json.result, /duplicate/);
  const stale = await c.call('POST', '/api/billing/webhook', evt, { 'stripe-signature': signStripePayload(evt, STRIPE_SECRET, Math.floor(Date.now() / 1000) - 3600) });
  assert.equal(stale.status, 400, 'timestamp outside tolerance');
  const s = await c.call('GET', '/api/auth/session');
  assert.equal(s.json.access.paid, true); assert.equal(s.json.access.stage, 'JOIN_DISCORD');
  const ent = await c.call('GET', '/api/billing/entitlement'); assert.equal(ent.json.entitlement.active, true); assert.deepEqual(ent.json.plans, []);
  for (const [m, p, b] of ENGINE_ROUTES) { const x = await c.call(m, p, b); assert.equal(x.status, 403, `${m} ${p}`); assert.equal(x.json.error, 'stage_join_discord'); }
});

test('Discord: start redirects with state; callback with wrong state fails; non-member stays JOIN_DISCORD; member+role opens', async () => {
  const c = new Client(base());
  await c.call('POST', '/api/auth/signin', { email: 'o@example.com', password: 'password123' });
  const start = await c.call('GET', '/api/auth/discord/start');
  assert.equal(start.status, 302);
  const loc = new URL(start.headers.get('location')!); const state = loc.searchParams.get('state')!;
  assert.equal(loc.origin + loc.pathname, 'https://discord.example/oauth2/authorize'); assert.ok(state);
  assert.equal((await c.call('GET', `/api/auth/discord/callback?code=abc&state=WRONG`)).status, 400);
  discordMember = false;
  const s1 = await c.call('GET', '/api/auth/discord/start'); const st1 = new URL(s1.headers.get('location')!).searchParams.get('state')!;
  const cb1 = await c.call('GET', `/api/auth/discord/callback?code=abc&state=${st1}`);
  assert.equal(cb1.status, 302); assert.match(cb1.headers.get('location')!, /not_member/);
  assert.equal((await c.call('GET', '/api/auth/session')).json.access.stage, 'JOIN_DISCORD');
  discordMember = true; discordRoles = ['other'];
  const s2 = await c.call('GET', '/api/auth/discord/start'); const st2 = new URL(s2.headers.get('location')!).searchParams.get('state')!;
  await c.call('GET', `/api/auth/discord/callback?code=abc&state=${st2}`);
  assert.equal((await c.call('GET', '/api/auth/session')).json.access.stage, 'JOIN_DISCORD', 'member without the required role stays locked');
  discordRoles = ['role_pro'];
  const s3 = await c.call('GET', '/api/auth/discord/start'); const st3 = new URL(s3.headers.get('location')!).searchParams.get('state')!;
  const cb3 = await c.call('GET', `/api/auth/discord/callback?code=abc&state=${st3}`);
  assert.match(cb3.headers.get('location')!, /#\/locked$/);
  const s = await c.call('GET', '/api/auth/session');
  assert.equal(s.json.access.discordVerified, true); assert.equal(s.json.access.stage, 'OPEN');
});

test('Discord is durable and bounded: link + sealed refresh token persist; leaving the guild downgrades on re-check; an outage never elevates; old verifications expire', async () => {
  const c = new Client(base());
  await c.call('POST', '/api/auth/signin', { email: 'o@example.com', password: 'password123' });
  const uid = (await c.call('GET', '/api/auth/session')).json.session.userId;
  const link = readLink(srv.db, uid)!; const sync0 = readSync(srv.db, uid)!;
  assert.equal(link.discord_id, '4242'); assert.ok(link.refresh_token_enc && !link.refresh_token_enc.includes('rt_stub'), 'token is sealed at rest');
  assert.match(openToken(srv.cfg, link.refresh_token_enc!)!, /^rt_stub_/); assert.equal(sync0.result, 'VERIFIED');

  /* 1. They leave the server. The scheduled re-check (due after recheckMs) downgrades to JOIN_DISCORD. */
  discordMember = false;
  const later = Date.now() + 2 * 3_600_000;
  const rep = await recheckDue(srv.db, srv.cfg, later);
  assert.equal(rep.checked, 1); assert.equal(rep.downgraded, 1);
  assert.equal(readSync(srv.db, uid)!.result, 'NOT_MEMBER');
  assert.equal((await c.call('GET', '/api/auth/session')).json.access.stage, 'JOIN_DISCORD');
  assert.equal((await c.call('GET', '/api/snapshot')).status, 403);

  /* 2. They rejoin and press Verify: a real re-check through Discord, no OAuth round-trip needed. */
  discordMember = true;
  const v = await c.call('POST', '/api/auth/discord');
  assert.equal(v.status, 200); assert.equal(v.json.access.stage, 'OPEN'); assert.equal(v.json.message, null);

  /* 3. Discord goes down. The re-check records ERROR, keeps the last definite answer, and does not change the stage. */
  discordDown = true;
  const v2 = await c.call('POST', '/api/auth/discord');
  assert.equal(v2.json.access.stage, 'OPEN'); assert.match(v2.json.message, /could not be reached/);
  assert.equal(readSync(srv.db, uid)!.result, 'ERROR');
  /* …and an outage while NOT verified stays not verified (fail closed, never elevate). */
  discordDown = false; discordMember = false; await c.call('POST', '/api/auth/discord');
  assert.equal((await c.call('GET', '/api/auth/session')).json.access.stage, 'JOIN_DISCORD');
  discordDown = true; await c.call('POST', '/api/auth/discord');
  assert.equal((await c.call('GET', '/api/auth/session')).json.access.stage, 'JOIN_DISCORD');
  discordDown = false; discordMember = true; await c.call('POST', '/api/auth/discord');
  assert.equal((await c.call('GET', '/api/auth/session')).json.access.stage, 'OPEN');

  /* 4. A verification older than maxAge is not current: the stage computed 15 days out is JOIN_DISCORD. */
  const user = srv.db.prepare('SELECT * FROM users WHERE id = ?').get(uid) as any;
  assert.equal(computeAccess(srv.db, srv.cfg, user, Date.now() + 15 * 86_400_000).stage, 'JOIN_DISCORD');
  assert.equal(computeAccess(srv.db, srv.cfg, user, Date.now() + 13 * 86_400_000).stage, 'OPEN');

  /* 5. One Discord account cannot be linked to a second Arena account. */
  const c2 = new Client(base());
  await c2.call('POST', '/api/auth/signup', { email: 'two@example.com', handle: 'second', password: 'password123' });
  const s = await c2.call('GET', '/api/auth/discord/start'); const st = new URL(s.headers.get('location')!).searchParams.get('state')!;
  const cb = await c2.call('GET', `/api/auth/discord/callback?code=abc&state=${st}`);
  assert.equal(cb.status, 409); assert.equal(cb.json.error, 'discord_taken');
  assert.equal(readLink(srv.db, (await c2.call('GET', '/api/auth/session')).json.session.userId), null);
});

test('OPEN: every engine route answers; the snapshot is labeled DEMO; a call is recorded; scan is labeled', async () => {
  const c = new Client(base());
  await c.call('POST', '/api/auth/signin', { email: 'o@example.com', password: 'password123' });
  const snap = await c.call('GET', '/api/snapshot');
  assert.equal(snap.status, 200); assert.equal(snap.json.health.origin, 'DEMO'); assert.ok(snap.json.markets.length > 0);
  const call = await c.call('POST', '/api/calls', { marketId: snap.json.markets[0].id, direction: 'YES', stakePoints: 50 });
  assert.equal(call.status, 201); assert.equal(call.json.state, 'OPEN'); assert.equal(call.json.stakePoints, 50);
  /* The lock is a durable row; the personal snapshot serves it back from the ledger, points debited. */
  const mine = await c.call('GET', '/api/calls');
  assert.equal(mine.json.calls.length, 1); assert.equal(mine.json.calls[0].id, call.json.id); assert.equal(mine.json.portfolio.pointsBalance, 950);
  assert.equal((await c.call('GET', '/api/snapshot')).json.calls[0].id, call.json.id);
  /* Immutable: the database itself refuses to alter or delete a lock. */
  assert.throws(() => srv.db.prepare('UPDATE calls SET direction = ? WHERE id = ?').run('NO', call.json.id), /immutable/);
  assert.throws(() => srv.db.prepare('DELETE FROM calls WHERE id = ?').run(call.json.id), /permanent/);
  /* Refusals are typed: unknown market 404, overstake 422. */
  assert.equal((await c.call('POST', '/api/calls', { marketId: 'nope', direction: 'YES', stakePoints: 5 })).status, 404);
  const big = await c.call('POST', '/api/calls', { marketId: snap.json.markets[1].id, direction: 'YES', stakePoints: 5000 });
  assert.equal(big.status, 422); assert.equal(big.json.error, 'insufficient_points');
  /* One open lock per market per person. */
  const dup = await c.call('POST', '/api/calls', { marketId: snap.json.markets[0].id, direction: 'NO', stakePoints: 5 });
  assert.equal(dup.status, 422); assert.equal(dup.json.error, 'already_locked');
  const scan = await c.call('POST', '/api/scan', { fileName: 'a.png', mimeType: 'image/png', bytes: 4000, dataUrl: 'data:image/png;base64,' + 'A'.repeat(200) });
  assert.equal(scan.status, 200); assert.equal(scan.json.origin, 'DEMO');
  const acct = await c.call('GET', '/api/account'); assert.equal(acct.json.profile.connections[0].connected, true);
});

test('Stripe identity: an email-only checkout is parked, not granted; out-of-order subscription events reconcile once the customer is known; operator attach is audited', async () => {
  const c = new Client(base());
  await c.call('POST', '/api/auth/signup', { email: 'relay@example.com', handle: 'relay', password: 'password123' });
  const uid = (await c.call('GET', '/api/auth/session')).json.session.userId;
  const post = (evt: string) => c.call('POST', '/api/billing/webhook', evt, { 'stripe-signature': signStripePayload(evt, STRIPE_SECRET) });

  /* 1. Subscription event arrives BEFORE checkout, for an unknown customer: parked. */
  const sub = JSON.stringify({ id: 'evt_o1', type: 'customer.subscription.created', data: { object: { id: 'sub_9', customer: 'cus_9', status: 'active', current_period_end: Math.floor(Date.now() / 1000) + 86400 } } });
  const r1 = await post(sub); assert.match(r1.json.result, /parked/);
  assert.equal(unreconciledEvents(srv.db).some((e) => e.id === 'evt_o1'), true);
  assert.equal((await c.call('GET', '/api/auth/session')).json.access.stage, 'UNLOCK');

  /* 2. Checkout with ONLY an email that happens to match — no client_reference_id, no known customer: parked, no access. */
  const emailOnly = JSON.stringify({ id: 'evt_o2', type: 'checkout.session.completed', data: { object: { customer: 'cus_9', payment_status: 'paid', customer_details: { email: 'relay@example.com' } } } });
  const r2 = await post(emailOnly); assert.match(r2.json.result, /parked/);
  assert.equal((await c.call('GET', '/api/auth/session')).json.access.stage, 'UNLOCK', 'email alone never grants');

  /* 3. Checkout that carries the authenticated association: granted, and the parked subscription event is replayed. */
  const good = JSON.stringify({ id: 'evt_o3', type: 'checkout.session.completed', data: { object: { client_reference_id: uid, customer: 'cus_9', subscription: 'sub_9', payment_status: 'paid' } } });
  const r3 = await post(good); assert.match(r3.json.result, /granted to .* \(via client_reference_id\); reconciled 2 earlier/);
  assert.equal(unreconciledEvents(srv.db).length, 0);
  const s = await c.call('GET', '/api/auth/session'); assert.equal(s.json.access.paid, true);
  assert.equal((srv.db.prepare('SELECT stripe_customer_id FROM users WHERE id = ?').get(uid) as any).stripe_customer_id, 'cus_9');

  /* 4. Operator path for the genuinely mismatched case: attach a customer to an account, audited, replaying parked events. */
  const c2 = new Client(base());
  await c2.call('POST', '/api/auth/signup', { email: 'mismatch@example.com', handle: 'mism', password: 'password123' });
  const uid2 = (await c2.call('GET', '/api/auth/session')).json.session.userId;
  const orphan = JSON.stringify({ id: 'evt_o4', type: 'checkout.session.completed', data: { object: { customer: 'cus_77', subscription: 'sub_77', payment_status: 'paid', customer_details: { email: 'someone@privaterelay.appleid.com' } } } });
  await post(orphan);
  assert.equal((await c2.call('GET', '/api/auth/session')).json.access.paid, false);
  assert.equal(attachCustomer(srv.db, srv.cfg, uid2, 'cus_77', 'operator:test'), 1);
  assert.equal((await c2.call('GET', '/api/auth/session')).json.access.paid, true);
  assert.ok((srv.db.prepare("SELECT 1 FROM audit WHERE action = 'STRIPE_CUSTOMER_ATTACHED' AND target = ?").get(uid2)));
});

test('subscription.deleted revokes; stage falls back to UNLOCK and engine routes close again', async () => {
  const c = new Client(base());
  await c.call('POST', '/api/auth/signin', { email: 'o@example.com', password: 'password123' });
  const evt = JSON.stringify({ id: 'evt_2', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'canceled', current_period_end: Math.floor(Date.now() / 1000) - 10 } } });
  const r = await c.call('POST', '/api/billing/webhook', evt, { 'stripe-signature': signStripePayload(evt, STRIPE_SECRET) });
  assert.match(r.json.result, /inactive/);
  assert.equal((await c.call('GET', '/api/auth/session')).json.access.stage, 'UNLOCK');
  assert.equal((await c.call('GET', '/api/snapshot')).status, 403);
  const evt3 = JSON.stringify({ id: 'evt_3', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', current_period_end: Math.floor(Date.now() / 1000) + 86400, items: { data: [{ price: { id: 'price_pro' } }] } } } });
  await c.call('POST', '/api/billing/webhook', evt3, { 'stripe-signature': signStripePayload(evt3, STRIPE_SECRET) });
  const s = await c.call('GET', '/api/auth/session'); assert.equal(s.json.access.stage, 'OPEN');
  assert.equal((await c.call('GET', '/api/billing/entitlement')).json.entitlement.planId, 'price_pro');
});

test('password reset: same message for unknown address; token burns; other sessions die', async () => {
  const c = new Client(base());
  const unknown = await c.call('POST', '/api/auth/password/forgot', { email: 'nobody@example.com' });
  const known = await c.call('POST', '/api/auth/password/forgot', { email: 'o@example.com' });
  assert.equal(unknown.json.message, known.json.message);
  const mail = srv.db.prepare('SELECT body FROM mail_outbox WHERE to_addr = ? ORDER BY created_at DESC').get('o@example.com') as { body: string };
  const token = /#\/reset\/([A-Za-z0-9_-]+)/.exec(mail.body)![1];
  const other = new Client(base()); await other.call('POST', '/api/auth/signin', { email: 'o@example.com', password: 'password123' });
  assert.equal((await c.call('POST', '/api/auth/password/reset', { token, password: 'short' })).status, 400);
  const ok = await c.call('POST', '/api/auth/password/reset', { token, password: 'newpassword456' });
  assert.equal(ok.status, 200); assert.equal(ok.json.session.handle, 'oliver');
  assert.equal((await c.call('POST', '/api/auth/password/reset', { token, password: 'newpassword456' })).status, 400, 'token is single-use');
  assert.equal((await other.call('GET', '/api/auth/session')).json.session, null, 'the other session was invalidated');
  assert.equal((await new Client(base()).call('POST', '/api/auth/signin', { email: 'o@example.com', password: 'password123' })).status, 401);
  assert.equal((await new Client(base()).call('POST', '/api/auth/signin', { email: 'o@example.com', password: 'newpassword456' })).status, 200);
});

test('sign-out invalidates server-side; idle expiry drops the session', async () => {
  const c = new Client(base());
  await c.call('POST', '/api/auth/signin', { email: 'o@example.com', password: 'newpassword456' });
  const cookie = c.cookie;
  await c.call('POST', '/api/auth/signout');
  c.cookie = cookie; /* replay the old cookie */
  assert.equal((await c.call('GET', '/api/auth/session')).json.session, null, 'a signed-out cookie is dead on the server');
  await c.call('POST', '/api/auth/signin', { email: 'o@example.com', password: 'newpassword456' });
  assert.ok((await c.call('GET', '/api/auth/session')).json.session);
  await new Promise((r) => setTimeout(r, 1700));
  assert.equal((await c.call('GET', '/api/auth/session')).json.session, null, 'idle expiry');
  assert.equal((await c.call('GET', '/api/snapshot')).status, 401);
});

test('audit trail recorded every access-affecting write', () => {
  const rows = srv.db.prepare('SELECT action FROM audit').all() as { action: string }[];
  const actions = new Set(rows.map((r) => r.action));
  for (const a of ['SIGNUP', 'SIGNIN', 'SIGNIN_FAILED', 'ENTITLEMENT_GRANTED', 'ENTITLEMENT_REVOKED', 'DISCORD_VERIFIED', 'DISCORD_NOT_MEMBER', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET', 'SIGNOUT']) assert.ok(actions.has(a), a);
});
