/* =============================================================
   OPERATOR CLI — explicit, audited actions. Not a backdoor: every
   call writes an audit row with actor "operator:cli".
     node server/cli.ts grant <email> [days]     entitlement without Stripe (testing/comps)
     node server/cli.ts revoke <email>
     node server/cli.ts users
     node server/cli.ts outbox                   unsent reset mails (development)
     node server/cli.ts audit [n]
     node server/cli.ts stripe:unmatched          Stripe events that granted nothing because no account matched
     node server/cli.ts stripe:attach <event_id> <email>   attach that event's customer to an account (audited) and replay
     node server/cli.ts calls [email]            locks (and settlements) from the ledger
     node server/cli.ts settle                   run one settlement sweep against the configured engine
     node server/cli.ts evaluate                 chronological out-of-sample evaluation of recorded model reads
   ============================================================= */
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';
import { grantEntitlement, revokeEntitlement } from './billing/entitlements.ts';
import { settlementSweep } from './ledger/settlement.ts';
import { evaluate } from './ledger/evaluation.ts';
import { attachCustomer, unreconciledEvents } from './billing/stripe.ts';
import { DemoEngine } from './engine/DemoEngine.ts';
import { LiveEngine } from './engine/LiveEngine.ts';

const [cmd, a1, a2] = process.argv.slice(2);
const cfg = loadConfig();
const db = openDb(cfg.databasePath);
const userByEmail = (email: string) => db.prepare('SELECT id, email, handle FROM users WHERE email = ?').get(email.toLowerCase()) as { id: string; email: string; handle: string } | undefined;

switch (cmd) {
  case 'grant': {
    const u = userByEmail(a1 ?? ''); if (!u) { console.error('no such user'); process.exit(1); }
    const days = Number(a2 ?? 30);
    const ent = grantEntitlement(db, { userId: u.id, planId: 'operator', stripeCustomerId: null, stripeSubscriptionId: null, currentPeriodEnd: Date.now() + days * 86_400_000, source: 'operator:cli', actor: 'operator:cli' });
    console.log(`granted ${u.email} for ${days} days`, ent); break;
  }
  case 'revoke': {
    const u = userByEmail(a1 ?? ''); if (!u) { console.error('no such user'); process.exit(1); }
    console.log(revokeEntitlement(db, u.id, 'operator:cli', 'operator:cli')); break;
  }
  case 'users': console.table(db.prepare('SELECT id, email, handle, created_at, discord_verified_at FROM users ORDER BY created_at DESC').all()); break;
  case 'outbox': console.table(db.prepare('SELECT id, to_addr, subject, created_at, sent_at FROM mail_outbox ORDER BY created_at DESC LIMIT 20').all()); break;
  case 'stripe:unmatched': console.table(unreconciledEvents(db)); break;
  case 'stripe:attach': {
    const evt = unreconciledEvents(db).find((e) => e.id === a1); const u = userByEmail(a2 ?? '');
    if (!evt || !evt.customer) { console.error('no such unreconciled event, or it has no customer id'); process.exit(1); }
    if (!u) { console.error('no such user'); process.exit(1); }
    console.log(`attached ${evt.customer} to ${u.email}; reconciled ${attachCustomer(db, cfg, u.id, evt.customer, 'operator:cli')} event(s)`); break;
  }
  case 'calls': {
    const u = a1 ? userByEmail(a1) : null;
    const q = 'SELECT c.id, c.user_id, c.market_id, c.direction, c.entry_bps, c.vixy_bps, c.stake_points, c.origin, c.locked_at, s.result, s.points_delta, s.settled_at FROM calls c LEFT JOIN settlements s ON s.call_id = c.id' + (u ? ' WHERE c.user_id = ?' : '') + ' ORDER BY c.locked_at DESC LIMIT 50';
    console.table(u ? db.prepare(q).all(u.id) : db.prepare(q).all()); break;
  }
  case 'evaluate': console.log(JSON.stringify(evaluate(db), null, 2)); break;
  case 'settle': {
    const engine = cfg.engine === 'live' ? new LiveEngine({ refreshMs: cfg.engineRefreshMs }) : new DemoEngine();
    console.log(await settlementSweep(db, engine)); break;
  }
  case 'audit': console.table(db.prepare('SELECT ts, actor, action, target FROM audit ORDER BY id DESC LIMIT ?').all(Number(a1 ?? 30))); break;
  default: console.log('usage: node server/cli.ts grant <email> [days] | revoke <email> | users | outbox | audit [n] | calls [email] | settle | stripe:unmatched | stripe:attach <event_id> <email>');
}
