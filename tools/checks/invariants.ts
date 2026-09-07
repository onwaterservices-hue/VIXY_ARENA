/* =============================================================
   INVARIANT CHECKS
   -------------------------------------------------------------
   Run with:  npx tsx tools/checks/invariants.ts
   No test framework, no dependencies. These assert the rules the
   architecture says must always hold, against the demo provider.
   The same checks should run against the real engine's snapshot
   the day it exists — the contract is identical.
   ============================================================= */

import { DemoDataSource } from '../../services/mock/demoProvider';
import type { ArenaSnapshot, Bps } from '../../types';
import { pct, signedPct, ratio, untilTime, relTime, money } from '../../lib/format';
import { resolveBillingSource, BILLING_BASE_URL, PAYMENT_LINK_URL, hasPaymentLink } from '../../services/billing';
import { resolveAccountSource, ACCOUNT_BASE_URL } from '../../services/account';
import { AUTH_BASE_URL, DISCORD_INVITE_URL, hasDiscordInvite, resolveAuthSource } from '../../services/auth';
import { HttpAuthSource, UnconfiguredAuthSource } from '../../services/auth/AuthSource';
import { LocalPreviewAuthSource } from '../../services/auth/LocalPreviewAuthSource';
import { DEMO_MODE } from '../../services/api';
import { STEPS } from '../../components/access/AccessSteps';
import { ROUTES, DEFAULT_ROUTE as DEFAULT_ROUTE_ID } from '../../constants';
import { CATEGORIES, SECTORS, sectorOf } from '../../lib/categories';

let failures = 0;
let checks = 0;

function check(name: string, condition: boolean, detail = '') {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const isBps = (v: Bps | null): boolean =>
  v === null || (Number.isInteger(v) && v >= 0 && v <= 10000);

function assertSnapshot(s: ArenaSnapshot, label: string) {
  console.log(`\n${label}`);

  /* --- probabilities are integer basis points --------------- */
  for (const m of s.markets) {
    check('market probability is integer bps', isBps(m.marketProbabilityBps), m.id);
    check('vixy probability is integer bps', isBps(m.vixyProbabilityBps), m.id);
    check('confidence is integer bps', isBps(m.confidenceBps), m.id);
    check('signal quality is integer bps', isBps(m.signalQualityBps), m.id);
    check('reversal risk is integer bps', isBps(m.reversalRiskBps), m.id);
    check('dispersion is integer bps', isBps(m.dispersionBps), m.id);

    /* --- edge is exactly vixy minus market ------------------ */
    if (m.marketProbabilityBps !== null && m.vixyProbabilityBps !== null) {
      check('edge equals vixy minus market',
        m.edgeBps === m.vixyProbabilityBps - m.marketProbabilityBps, m.id);
    }

    /* --- provenance is mandatory ---------------------------- */
    check('probability carries provenance',
      m.vixyProbabilityBps === null || m.provenance !== null, m.id);

    /* --- broadcast layer is server-graded -------------------- */
    check('event phase is one the contract names',
      ['PREGAME', 'CALIBRATION', 'CONFIRMATION', 'LOCK_WINDOW', 'FINAL'].includes(m.phase), m.id);
    if (m.matchup) {
      check('matchup sides are both labelled',
        m.matchup.home.code.length > 0 && m.matchup.away.code.length > 0, m.id);
      check('matchup side probabilities are integer bps',
        isBps(m.matchup.home.probabilityBps) && isBps(m.matchup.away.probabilityBps), m.id);
    }
    if (m.momentum) {
      check('momentum bias stays inside the rail',
        m.momentum.biasBps === null
          || (Number.isInteger(m.momentum.biasBps) && Math.abs(m.momentum.biasBps) <= 10000), m.id);
      check('momentum side is one the contract names',
        ['UP', 'DOWN', 'NEUTRAL'].includes(m.momentum.side), m.id);
      check('momentum band is one the contract names',
        ['NONE', 'LEVEL', 'SLIGHT', 'MODERATE', 'STRONG', 'DOMINANT'].includes(m.momentum.band), m.id);
      /* the meter and the edge figure must never point opposite ways */
      if (m.edgeBps !== null && m.momentum.biasBps !== null) {
        check('momentum bias agrees in sign with the edge',
          Math.sign(m.momentum.biasBps) === Math.sign(m.edgeBps) || m.edgeBps === 0, m.id);
      }
      check('an absent edge grades as NONE',
        m.edgeBps !== null || m.momentum.band === 'NONE', m.id);
    }
    check('provenance names a model version',
      m.provenance === null || m.provenance.modelVersion.length > 0, m.id);

    /* --- resolution criteria exist -------------------------- */
    check('market states how it settles', m.resolution !== null, m.id);

    /* --- health envelope -------------------------------------*/
    check('health envelope carries a server status',
      typeof m.health.status === 'string' && m.health.status.length > 0, m.id);
    check('health envelope declares origin',
      m.health.origin === 'DEMO' || m.health.origin === 'LIVE', m.id);
    check('data age is a non-negative number',
      Number.isFinite(m.health.dataAgeMs) && m.health.dataAgeMs >= 0, m.id);
    check('asOf parses as a date', !Number.isNaN(Date.parse(m.health.asOf)), m.id);

    /* --- series ---------------------------------------------- */
    check('series and vixy series have equal length',
      m.series.length === m.vixySeries.length, m.id);
    check('series values are in range',
      m.series.every((v) => v >= 0 && v <= 10000), m.id);
    check('venue refs are present', m.venueRefs.length > 0, m.id);
    for (const v of m.venueRefs) {
      check('venue implied is bps', isBps(v.impliedBps), `${m.id}/${v.venue}`);
      check('venue bid below ask',
        v.bidBps === null || v.askBps === null || v.bidBps <= v.askBps, `${m.id}/${v.venue}`);
    }
  }

  /* --- ranking is ordered and complete ---------------------- */
  const ranks = s.opportunities.map((o) => o.rank);
  check('ranks are 1..n with no gaps',
    ranks.every((r, i) => r === i + 1), ranks.join(','));
  check('every opportunity points at a real market',
    s.opportunities.every((o) => s.markets.some((m) => m.id === o.marketId)));
  check('every opportunity carries evidence',
    s.opportunities.every((o) => o.evidence.length > 0));
  check('edge score never negative',
    s.opportunities.every((o) => o.edgeScore >= 0));

  /* --- calls ------------------------------------------------- */
  for (const c of s.calls) {
    check('call edge equals vixy minus entry', c.edgeBps === c.vixyBps - c.entryBps, c.id);
    check('settled calls carry a result',
      c.state !== 'SETTLED' || c.result !== null, c.id);
    check('unsettled calls carry no result',
      c.state === 'SETTLED' || c.result === null, c.id);
    check('settled calls carry a settlement time',
      c.state !== 'SETTLED' || c.settledAt !== null, c.id);
    check('stake is positive', c.stakePoints > 0, c.id);
  }

  /* --- leaderboard ------------------------------------------ */
  check('leaderboard ranks are sequential',
    s.leaderboard.every((e, i) => e.rank === i + 1));
  check('exactly one competitor is flagged as you',
    s.leaderboard.filter((e) => e.isYou).length === 1);
  check('accuracy is bps', s.leaderboard.every((e) => isBps(e.accuracyBps)));

  /* --- signals ---------------------------------------------- */
  check('signals are newest first',
    s.signals.every((e, i) => i === 0 || Date.parse(s.signals[i - 1].ts) >= Date.parse(e.ts)));
  check('every signal declares origin', s.signals.every((e) => e.origin === 'DEMO'));

  /* --- graph ------------------------------------------------- */
  const ids = new Set(s.graph.nodes.map((n) => n.id));
  check('graph edges reference known nodes',
    s.graph.edges.every((e) => ids.has(e.from) && ids.has(e.to)));
  check('graph layout stays inside the unit square',
    s.graph.nodes.every((n) => n.x >= 0 && n.x <= 1 && n.y >= 0 && n.y <= 1));
  check('node weights are 0..1',
    s.graph.nodes.every((n) => n.weight >= 0 && n.weight <= 1));

  /* --- brain / calibration ---------------------------------- */
  check('calibration bins are ordered',
    s.brain.calibrationBins.every((b, i) => i === 0 || b.predictedBps > s.brain.calibrationBins[i - 1].predictedBps));
  check('calibration bins are bps', s.brain.calibrationBins.every((b) => isBps(b.predictedBps) && isBps(b.realizedBps)));

  /* --- admin ------------------------------------------------- */
  check('demo environment is never PRODUCTION', s.admin.environment !== 'PRODUCTION');
  check('venue adapters stay disabled while demo',
    s.admin.featureFlags.filter((f) => f.key.startsWith('venue_')).every((f) => !f.enabled));
  check('payments and discord stay disabled',
    s.admin.featureFlags.filter((f) => f.key === 'payments' || f.key === 'discord').every((f) => !f.enabled));
  check('origin labeling guard passes',
    s.admin.guards.find((g) => g.key === 'origin_labeling')?.status === 'PASS');
}

function assertFormatters() {
  console.log('\nformatters');
  check('pct renders one decimal', pct(4237) === '42.4%', pct(4237));
  check('pct handles null', pct(null) === '—');
  check('signedPct adds a plus', signedPct(120).startsWith('+'), signedPct(120));
  check('signedPct uses a true minus sign', signedPct(-120).startsWith('−'), signedPct(-120));
  check('ratio clamps high', ratio(20000) === 1);
  check('ratio clamps low', ratio(-5) === 0);
  check('untilTime says closed in the past', untilTime(new Date(Date.now() - 1000).toISOString()) === 'closed');
  check('relTime says now for fresh values', relTime(new Date().toISOString()) === 'now');
}

async function main() {
  const source = new DemoDataSource();
  const first = await source.load();
  assertSnapshot(first, 'snapshot · initial');

  /* place a call and assert the record the provider writes back */
  const market = first.markets[0];
  const before = first.portfolio.pointsBalance;
  const record = await source.placeCall({ marketId: market.id, direction: 'YES', stakePoints: 100 });
  check('call record is OPEN on acceptance', record.state === 'OPEN');
  check('call record has a server entry price', Number.isInteger(record.entryBps));
  check('call record edge is consistent', record.edgeBps === record.vixyBps - record.entryBps);

  const afterCall = await source.load();
  check('points balance is reduced by the stake',
    afterCall.portfolio.pointsBalance === before - 100,
    `${afterCall.portfolio.pointsBalance} vs ${before - 100}`);
  check('the new call is in the record', afterCall.calls.some((c) => c.id === record.id));
  assertSnapshot(afterCall, 'snapshot · after a call');

  /* rejected intents */
  let rejected = false;
  try { await source.placeCall({ marketId: 'nope', direction: 'YES', stakePoints: 10 }); }
  catch { rejected = true; }
  check('unknown market is rejected', rejected);

  rejected = false;
  try { await source.placeCall({ marketId: market.id, direction: 'YES', stakePoints: 10_000_000 }); }
  catch { rejected = true; }
  check('over-stake is rejected', rejected);

  /* --- form records are results, not decoration -------------- */
  for (const f of afterCall.portfolio.form) {
    check('portfolio form entry is a settled result', ['W', 'L', 'P'].includes(f), f);
  }
  check('form never claims more results than have settled',
    afterCall.portfolio.form.length <= afterCall.portfolio.settledCalls,
    `${afterCall.portfolio.form.length} vs ${afterCall.portfolio.settledCalls}`);
  for (const e of afterCall.leaderboard) {
    check('leaderboard form entries are settled results',
      e.form.every((f) => ['W', 'L', 'P'].includes(f)), e.handle);
    check('leaderboard locks are a non-negative count',
      Number.isInteger(e.locks) && e.locks >= 0, e.handle);
  }

  /* --- the analyst reports its own grades -------------------- */
  for (const ev of afterCall.brain.evidence) {
    check('evidence state is one the contract names',
      ['SCANNING', 'BUILDING', 'ALIGNED', 'CONFLICTED', 'CONFIRMED'].includes(ev.state), ev.key);
    check('a scanning track reports no progress figure',
      ev.state !== 'SCANNING' || ev.progressBps === null, ev.key);
    check('a reported progress figure is integer bps', isBps(ev.progressBps), ev.key);
  }

  /* --- the scanner is a doorway into the same engine ---------- */
  {
    const img = (name: string, bytes: number, mime = 'image/png', tail = 'x') => ({
      fileName: name, mimeType: mime, bytes, dataUrl: `data:image/png;base64,${tail}`,
    });
    const stages: string[] = [];
    const scan = await source.scanMarket(img('a.png', 220_000, 'image/png', 'seed-a'), (p) => stages.push(p.stage));
    check('scan reports every stage it declares', stages.length === 10, String(stages.length));
    check('scan stages arrive in order',
      stages[0] === 'READING_IMAGE' && stages[stages.length - 1] === 'FINALIZING');
    check('scan status is one the contract names',
      ['UNREADABLE', 'NO_MARKET_DETECTED', 'AMBIGUOUS', 'UNVERIFIED', 'VERIFIED'].includes(scan.status), scan.status);
    check('scan verdict is one the contract names',
      ['STRONG_EDGE', 'POSITIVE_EDGE', 'WATCH', 'NO_EDGE', 'NEGATIVE_EDGE',
       'INSUFFICIENT_DATA', 'NOT_VERIFIED'].includes(scan.verdict), scan.verdict);
    check('a scan always reports its origin', scan.origin === 'DEMO' || scan.origin === 'LIVE');

    /* the same image must give the same read — a scanner whose answer
       changes on re-upload is not a scanner */
    const again = await source.scanMarket(img('a.png', 220_000, 'image/png', 'seed-a'));
    check('the same screenshot gives the same read',
      again.status === scan.status && again.marketId === scan.marketId && again.verdict === scan.verdict);

    /* a non-image must fail honestly rather than produce a verdict */
    const bad = await source.scanMarket(img('notes.txt', 4_000, 'text/plain'));
    check('an unreadable upload is reported as unreadable', bad.status === 'UNREADABLE', bad.status);
    check('an unreadable upload claims no market', bad.marketId === null);
    check('an unreadable upload grades as insufficient data',
      bad.verdict === 'INSUFFICIENT_DATA', bad.verdict);
    check('an unreadable upload carries no evidence', bad.evidence.length === 0);

    /* sweep the outcome space and hold every branch to the same rules */
    let sawAmbiguous = false;
    let sawVerified = false;
    for (let i = 0; i < 24; i++) {
      const r = await source.scanMarket(img(`s${i}.png`, 90_000 + i * 7919, 'image/png', `t${i}`));
      check('an unmatched scan never names a market',
        r.status === 'VERIFIED' || r.marketId === null, r.status);
      check('a scan without a match never claims an edge verdict',
        r.status === 'VERIFIED'
          || ['NOT_VERIFIED', 'INSUFFICIENT_DATA'].includes(r.verdict), `${r.status}/${r.verdict}`);
      check('an ambiguous scan offers candidates instead of guessing',
        r.status !== 'AMBIGUOUS' || r.candidates.length > 0, r.status);
      check('a confident scan offers no candidates to choose between',
        r.status !== 'VERIFIED' || r.candidates.length === 0, r.status);
      if (r.status === 'AMBIGUOUS') sawAmbiguous = true;
      if (r.status === 'VERIFIED') {
        sawVerified = true;
        check('a verified scan resolves to a market in the canonical set',
          afterCall.markets.some((m) => m.id === r.marketId), String(r.marketId));
        check('a verified scan carries engine evidence', r.evidence.length > 0);
        /* the verdict must agree with the canonical market it rests on */
        const m = afterCall.markets.find((x) => x.id === r.marketId);
        if (m && (m.edgeBps ?? 0) < 0 && (m.confidenceBps ?? 0) >= 4000
            && m.momentum && m.momentum.band !== 'LEVEL' && m.momentum.band !== 'NONE') {
          check('a negative edge never grades as a positive verdict',
            !['STRONG_EDGE', 'POSITIVE_EDGE'].includes(r.verdict), r.verdict);
        }
      }
    }
    check('the ambiguous path is reachable', sawAmbiguous);
    check('the verified path is reachable', sawVerified);
  }

  assertFormatters();
  assertSchedule(afterCall);
  assertSlate(afterCall);

  /* Drive the provider through a full cycle and record every state it
     actually emits, rather than trusting the type union. */
  {
    const cycleSource = new DemoDataSource();
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const s = await cycleSource.load();
      seen.add(s.brain.state);
      (cycleSource as unknown as { brainIndex: number }).brainIndex =
        ((cycleSource as unknown as { brainIndex: number }).brainIndex + 1);
    }
    assertBrainStates(seen);
  }
  await assertBilling();
  await assertAuth();
  await assertAccount();
  assertNavigation();

  console.log(`\n${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.error(`${failures} FAILED`);
    process.exit(1);
  }
  console.log('all invariants hold');
}

/* ---- THE SCHEDULE -------------------------------------------
   An event layer is only useful if it is honest about time. These
   checks are what stop "LIVE" from becoming decoration.           */
/* ---- THE DAILY SLATE ----------------------------------------
   A retention surface is where a product is most tempted to
   cheat: a progress bar that only ever goes up feels good and
   means nothing. Every objective here must be engine-computed,
   bounded by its own target, and reward analysis rather than
   volume — there is deliberately no objective a reader can meet
   by staking more.                                            */
function assertSlate(s: ArenaSnapshot) {
  const slate = s.slate;
  check('the snapshot carries a daily slate', !!slate);
  if (!slate) return;

  check('the slate names a calendar day', /^\d{4}-\d{2}-\d{2}$/.test(slate.id), slate.id);
  check('the slate opens before it closes',
    +new Date(slate.opensAt) < +new Date(slate.closesAt), `${slate.opensAt} → ${slate.closesAt}`);
  check('the slate publishes a card', slate.marketIds.length > 0, String(slate.marketIds.length));

  const ids = new Set(s.markets.map((m) => m.id));
  check('every market on the card exists',
    slate.marketIds.every((id) => ids.has(id)), slate.marketIds.join(','));
  check('the card carries no duplicates',
    new Set(slate.marketIds).size === slate.marketIds.length);

  /* The card must never be one category wearing a disguise. */
  const cardCats = new Set(
    slate.marketIds.map((id) => s.markets.find((m) => m.id === id)?.category),
  );
  check('the card spans at least four categories', cardCats.size >= 4, String(cardCats.size));

  /* Word-bounded on purpose: "better" is not "bet". */
  const VOLUME_WORDS = /\b(wager|wagers|wagering|stake|stakes|bet|bets|betting|spin|spins|deposit|deposits|wheel)\b/i;
  for (const o of slate.objectives) {
    check(`objective ${o.key} has a target above zero`, o.target > 0, String(o.target));
    check(`objective ${o.key} never reports progress past its target`,
      o.progress <= o.target, `${o.progress}/${o.target}`);
    check(`objective ${o.key} never reports negative progress`, o.progress >= 0, String(o.progress));
    check(`objective ${o.key} agrees with its own completion flag`,
      o.complete === (o.progress >= o.target), `${o.progress}/${o.target} complete=${o.complete}`);
    check(`objective ${o.key} explains itself`, o.detail.length > 15, o.detail);
    /* The whole point of the design: nothing here is met by volume. */
    check(`objective ${o.key} does not reward wagering`,
      !VOLUME_WORDS.test(`${o.label} ${o.detail}`), `${o.label} — ${o.detail}`);
  }

  check('the slate agrees with its own objective count',
    slate.total === slate.objectives.length, `${slate.total} vs ${slate.objectives.length}`);
  check('the slate counts completions correctly',
    slate.completed === slate.objectives.filter((o) => o.complete).length,
    String(slate.completed));
  check('a streak is never negative', slate.streakDays >= 0, String(slate.streakDays));
  check('the best streak is never below the current one',
    slate.bestStreakDays >= slate.streakDays, `${slate.bestStreakDays} vs ${slate.streakDays}`);
}

function assertSchedule(s: ArenaSnapshot) {
  const ids = new Set(s.markets.map((m) => m.id));
  const now = Date.now();

  check('the snapshot carries a schedule', Array.isArray(s.events) && s.events.length > 0,
    String(s.events?.length));

  let prev = -Infinity;
  for (const e of s.events) {
    const t = +new Date(e.startsAt);
    check(`event ${e.id} has a valid start time`, Number.isFinite(t), e.startsAt);
    check('the schedule is in chronological order', t >= prev, `${e.id} ${e.startsAt}`);
    prev = t;

    check(`event ${e.id} names only markets that exist`,
      e.marketIds.every((id) => ids.has(id)), e.marketIds.join(','));
    check(`event ${e.id} carries at least one market`, e.marketIds.length > 0, e.id);

    /* The two claims a schedule can get wrong in a way a reader would
       notice immediately, and believe. */
    if (e.status === 'LIVE') {
      check(`live event ${e.id} has already started`, t <= now + 60_000, e.startsAt);
    }
    if (e.status === 'UPCOMING') {
      check(`upcoming event ${e.id} has not started`, t > now - 60_000, e.startsAt);
    }
    check(`event ${e.id} carries a health envelope`,
      typeof e.health?.status === 'string', String(e.health?.status));
  }

  /* Breadth: the schedule must not be one category wearing a disguise. */
  const cats = new Set(s.events.map((e) => e.category));
  check('the schedule spans at least six categories', cats.size >= 6, String(cats.size));
  check('sports is on the schedule', cats.has('SPORTS'));
  check('the schedule is not majority crypto',
    s.events.filter((e) => e.category === 'CRYPTO').length * 2 < s.events.length,
    String(s.events.filter((e) => e.category === 'CRYPTO').length));
}

/* ---- BILLING ------------------------------------------------
   The product rule is that no price, plan or entitlement is ever
   written into the client. These checks are how that rule stops
   being a comment and starts being enforced.                    */
async function assertBilling() {
  const source = resolveBillingSource();
  const state = await source.load();

  check('an unconfigured build reports NOT_CONFIGURED',
    BILLING_BASE_URL !== '' || state.status === 'NOT_CONFIGURED', state.status);
  check('an unconfigured build ships no plans', state.plans.length === 0,
    `${state.plans.length} plans`);
  check('an unconfigured build claims no entitlement', state.entitlement === null);
  check('an unconfigured build claims no live origin', state.origin === 'NONE', state.origin);
  check('an unconfigured build explains itself',
    typeof state.message === 'string' && state.message.length > 20);

  check('an unconfigured build shows no payment method', state.paymentMethod === null);

  /* The payment link is a URL slot and nothing more. Empty is the honest
     default, and anything that is not a Stripe checkout URL must be treated
     as empty — an Unlock button that opens an arbitrary page is a phishing
     surface, not a feature. */
  check('no payment link is configured in this build',
    PAYMENT_LINK_URL === '' && !hasPaymentLink(), PAYMENT_LINK_URL || '(empty)');
  check('a configured payment link would have to be a Stripe checkout URL',
    PAYMENT_LINK_URL === '' || /^https:\/\/(buy|checkout)\.stripe\.com\//.test(PAYMENT_LINK_URL));
  check('a payment link never carries a price into the client',
    !/\d+\.\d{2}|\$|price=/.test(PAYMENT_LINK_URL));
  check('an unconfigured build shows no invoices', state.invoices.length === 0,
    String(state.invoices.length));
  check('an unconfigured build offers no management actions',
    !state.actions.upgrade && !state.actions.downgrade
    && !state.actions.cancel && !state.actions.portal,
    JSON.stringify(state.actions));

  let checkoutRefused = false;
  try { await source.startCheckout('anything'); } catch { checkoutRefused = true; }
  check('checkout is refused without a configured backend', checkoutRefused);

  let portalRefused = false;
  try { await source.openPortal(); } catch { portalRefused = true; }
  check('the billing portal is refused without a configured backend', portalRefused);

  /* Money formatting must be a pure function of the two values a payment
     provider supplies. It may never invent a figure for a missing one. */
  check('money renders nothing when there is no price', money(null, 'USD') === '—',
    money(null, 'USD'));
  check('money renders nothing when there is no currency', money(1000, null) === '—',
    money(1000, null));
  check('money never loses precision to floating point',
    money(1999, 'USD').includes('19.99'), money(1999, 'USD'));
  check('an unknown currency code is reported, not guessed',
    money(1000, 'ZZZ').includes('ZZZ'), money(1000, 'ZZZ'));
}

/* ---- ACCOUNT ------------------------------------------------
   A profile page that invents a person is the most quietly
   dishonest screen a product can ship: every field on it looks
   like a fact. These checks are what stop that.               */
async function assertAccount() {
  const source = resolveAccountSource();
  const state = await source.load();

  check('no account backend URL is committed', ACCOUNT_BASE_URL === '', ACCOUNT_BASE_URL);
  /* In a demo build the account follows the preview session; with nobody
     signed in it must still invent no one. */
  check('a demo build resolves the labeled preview account', !DEMO_MODE || /PREVIEW/.test(source.label), source.label);
  check('with nobody signed in the account invents no person', state.profile === null);
  check('the account mints no referral state without a backend', state.referral === null);
  check('the account claims no live origin without a backend', state.origin === 'NONE', state.origin);
  check('with nobody signed in the account offers no actions',
    !state.actions.changeHandle && !state.actions.connect && !state.actions.signOut,
    JSON.stringify(state.actions));
  check('the account explains itself', typeof state.message === 'string' && state.message.length > 20);

  for (const [name, run] of [
    ['changing a handle', () => source.changeHandle('someone')],
    ['linking a service', () => source.connect('discord')],
    ['creating a referral code', () => source.createReferralCode('vixy')],
  ] as const) {
    let refused = false;
    try { await run(); } catch { refused = true; }
    check(`${name} is refused without an account backend`, refused);
  }
}

/* ---- NAVIGATION AND COMPREHENSION ---------------------------
   A screen a reader cannot identify is a screen that does not
   help them. Every route carries its own plain-English purpose,
   and the check below is what stops a new one shipping without.  */
/* ---- ENGINE STATES ------------------------------------------
   The core is the product's signature and it claims to report what
   the engine is doing. That claim only holds if every state the
   contract allows actually reaches the screen with its own name. */
function assertBrainStates(seen: Set<string>) {
  const ALL = ['OBSERVING', 'ANALYZING', 'COMPARING', 'CONFIRMING',
               'LOCKED', 'SETTLING', 'SETTLED'];
  for (const st of ALL) {
    check(`the engine reaches the ${st} state`, seen.has(st), [...seen].join(','));
  }
  check('the engine reports no state outside the contract',
    [...seen].every((s) => ALL.includes(s)), [...seen].join(','));
}

function assertNavigation() {
  const ids = new Set<string>();
  for (const r of ROUTES) {
    check(`route ${r.id} has a unique id`, !ids.has(r.id), r.id);
    ids.add(r.id);
    check(`route ${r.id} states what it is for`,
      typeof r.description === 'string' && r.description.length >= 20, r.description);
    check(`route ${r.id} is not described in engine jargon`,
      !/canonical|telemetry stream|throughput/i.test(r.description), r.description);
  }
  check('the landing route is not a nav destination', !ids.has('landing'));
  check('access is reachable from the interface', ids.has('access'));
  check('the schedule is reachable from the interface', ids.has('upnext'));
  check('the profile is reachable from the interface', ids.has('profile'));
  check('the daily slate is reachable from the interface', ids.has('daily'));
  check('the watchlist is reachable from the interface', ids.has('watchlist'));
  check('alerts are reachable from the interface', ids.has('alerts'));
  check('cross-market intelligence is reachable', ids.has('cross'));

  /* THE UNIVERSE. The product's central claim is that it covers everything,
     so every category the contract allows must be reachable through exactly
     one sector — a category with no sector is a market a reader cannot
     navigate to, and a category in two sectors is a market that appears
     twice on the master board. */
  for (const c of CATEGORIES) {
    const owners = SECTORS.filter((s2) => s2.categories.includes(c.key));
    check(`category ${c.key} belongs to exactly one sector`,
      owners.length === 1, owners.map((o) => o.key).join(',') || 'none');
    check(`category ${c.key} resolves to its sector`, sectorOf(c.key)?.key === owners[0]?.key);
  }
  for (const sec of SECTORS) {
    check(`sector ${sec.key} has a destination in the route table`,
      ids.has(`sector/${sec.key}`) || sec.key === 'other', sec.key);
    check(`sector ${sec.key} explains itself`, sec.blurb.length > 12, sec.blurb);
    check(`sector ${sec.key} gathers at least one category`, sec.categories.length > 0);
  }
  check('the terminal opens on the whole universe, not one category',
    DEFAULT_ROUTE_ID === 'markets', DEFAULT_ROUTE_ID);
  check('no sector is the terminal default',
    !DEFAULT_ROUTE_ID.startsWith('sector/'), DEFAULT_ROUTE_ID);

  /* The category table is the product's claim that this is not a crypto
     app. Crypto must be present, and must not be first. */
  const keys = CATEGORIES.map((c) => c.key);
  check('the market universe covers at least twelve categories', keys.length >= 12,
    String(keys.length));
  check('technology is a category', keys.includes('TECHNOLOGY'));
  check('crypto is one category among many', keys.includes('CRYPTO'));
  check('crypto does not lead the category table', keys[0] !== 'CRYPTO', keys[0]);
  check('sports leads the category table', keys[0] === 'SPORTS', keys[0]);
  check('every category carries an explanation',
    CATEGORIES.every((c) => c.blurb.length > 8));
  check('category accents come from the token palette',
    CATEGORIES.every((c) => c.accent.startsWith('--vx-')));
}

/* =============================================================
   THE DOOR
   -------------------------------------------------------------
   The sequence is fixed, the stage is reported, the preview
   account is labeled and unreachable from a production build,
   and no password is ever stored in the clear.
   ============================================================= */
async function assertAuth() {
  console.log('\nauth / the door');

  check('no auth backend URL is committed', AUTH_BASE_URL === '', AUTH_BASE_URL);
  check('no Discord invite is committed', DISCORD_INVITE_URL === '', DISCORD_INVITE_URL);
  check('the invite check refuses anything but a Discord URL', !hasDiscordInvite());

  /* a node shim for the browser-only preview store */
  const store = new Map<string, string>();
  const listeners = new Map<string, Set<() => void>>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    },
    addEventListener: (t: string, f: () => void) => { (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(f); },
    removeEventListener: (t: string, f: () => void) => { listeners.get(t)?.delete(f); },
    dispatchEvent: (e: { type: string }) => { listeners.get(e.type)?.forEach((f) => f()); return true; },
  };
  (globalThis as unknown as { CustomEvent: unknown }).CustomEvent = class { type: string; constructor(t: string) { this.type = t; } };

  const source = resolveAuthSource();
  check('the resolved auth source in a demo build is the labeled preview',
    !DEMO_MODE || source instanceof LocalPreviewAuthSource, source.label);
  check('the preview source says PREVIEW in its label', !(source instanceof LocalPreviewAuthSource) || /PREVIEW/.test(source.label));

  const unconf = await new UnconfiguredAuthSource().load();
  check('an unconfigured auth source reports NOT_CONFIGURED', unconf.status === 'NOT_CONFIGURED');
  check('an unconfigured auth source does NOT report OPEN (fail closed: an unanswered check is not a yes)', unconf.access.stage !== 'OPEN');
  check('an unconfigured auth source carries no session', unconf.session === null);
  check('an unconfigured auth source offers no action', Object.values(unconf.actions).every((v) => v === false));
  const http = new HttpAuthSource('https://example.invalid');
  let threw = false;
  try { await http.load(); } catch { threw = true; }
  check('the HTTP auth source rejects when its backend is unreachable — it never reports OPEN on its own', threw);

  const pv = new LocalPreviewAuthSource();
  LocalPreviewAuthSource.reset();
  let st = await pv.load();
  check('fresh preview: stage is CREATE_ACCOUNT', st.access.stage === 'CREATE_ACCOUNT');
  check('fresh preview: nobody is signed in', st.session === null);
  check('fresh preview: sign-up is the only door', st.actions.signUp && !st.actions.signIn && !st.actions.previewUnlock);
  check('preview origin is PREVIEW', st.origin === 'PREVIEW');

  let rejected = false;
  try { await pv.signUp({ email: 'bad', password: 'password123', handle: 'ok_handle' }); } catch { rejected = true; }
  check('preview rejects an invalid email', rejected);
  rejected = false;
  try { await pv.signUp({ email: 'a@b.co', password: 'short', handle: 'ok_handle' }); } catch { rejected = true; }
  check('preview rejects a short password', rejected);

  st = await pv.signUp({ email: 'A@B.co', password: 'password123', handle: 'reader_1' });
  check('after sign-up: signed in', st.session?.handle === 'reader_1');
  check('after sign-up: email is normalised', st.session?.email === 'a@b.co');
  check('after sign-up: stage is UNLOCK', st.access.stage === 'UNLOCK');
  check('after sign-up: not paid', !st.access.paid);
  const raw = store.get('vixy_arena_preview:auth') ?? '';
  check('the password is not stored in the clear', !raw.includes('password123'));
  check('a salted digest is stored instead', /"digest":"[0-9a-f]{64}"/.test(raw));

  rejected = false;
  try { await pv.markDiscordJoined(); } catch { rejected = true; }
  check('Discord cannot be recorded before unlock', rejected);

  st = await pv.previewUnlock();
  check('preview unlock moves to JOIN_DISCORD', st.access.stage === 'JOIN_DISCORD');
  check('preview unlock is reported as paid but never as verified Discord', st.access.paid && !st.access.discordVerified);
  st = await pv.markDiscordJoined();
  check('Discord self-report moves to OPEN', st.access.stage === 'OPEN');
  check('Discord self-report stays unverified', st.access.discordJoined && !st.access.discordVerified);
  check('the preview message says it is a preview', /preview/i.test(st.message ?? ''));

  st = await pv.signOut();
  check('sign-out returns to CREATE_ACCOUNT', st.access.stage === 'CREATE_ACCOUNT' && st.session === null);
  check('sign-in is offered after sign-out', st.actions.signIn && !st.actions.signUp);
  rejected = false;
  try { await pv.signIn({ email: 'a@b.co', password: 'wrongpassword' }); } catch { rejected = true; }
  check('a wrong password is refused', rejected);
  st = await pv.signIn({ email: 'a@b.co', password: 'password123' });
  check('the right password signs in and remembers the stage', st.access.stage === 'OPEN');
  LocalPreviewAuthSource.reset();

  check('the door has exactly four steps', STEPS.length === 4);
  check('the steps run account → unlock → discord → enter',
    STEPS.map((x) => x.stage).join('>') === 'CREATE_ACCOUNT>UNLOCK>JOIN_DISCORD>OPEN');
  const ids = new Set(ROUTES.map((r) => r.id));
  check('the door has a route', ids.has('auth'));
  check('the door is not listed in navigation', ROUTES.find((r) => r.id === 'auth')?.hidden === true);
  check('Arena Vision is a tab', ids.has('vision'));
  check('Arena Vision is a primary tab', ROUTES.find((r) => r.id === 'vision')?.primary === true);
  check('the mobile dock holds six primaries', ROUTES.filter((r) => r.primary).length === 6,
    String(ROUTES.filter((r) => r.primary).length));
}

main().catch((e) => { console.error(e); process.exit(1); });
