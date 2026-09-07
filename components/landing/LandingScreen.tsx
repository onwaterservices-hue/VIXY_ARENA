import React, { useMemo, useState } from 'react';
import type { PublicBoard } from '../../types';
import { PredictionCore } from '../holographic/PredictionCore';
import { Sparkline } from '../holographic/Sparkline';
import { Icon } from '../common/Icon';
import { CategoryChip, OriginBadge } from '../common/Primitives';
import { useArenaUI } from '../common/ui-context';
import { useMedia } from '../../hooks';
import { CATEGORIES } from '../../lib/categories';
import { CHAIN } from '../common/Orientation';
import { pct, signedPct, untilTime } from '../../lib/format';

/* =============================================================
   LANDING
   -------------------------------------------------------------
   The public face. One job: make it obvious in five seconds what
   VIXY ARENA is, across which markets, and what makes it
   different from a prediction-market dashboard.

   The statement is the product: see what the market thinks, see
   what VIXY thinks, see where they disagree.

   Every figure on this page comes from the same snapshot the
   Arena reads, and carries the same origin badge. When the
   provider is the demo simulator this page says so — a landing
   page that dresses simulated numbers as live intelligence is
   the one place a lie would do the most damage.
   ============================================================= */

/* The rails of the wall. Each one answers a different question a reader
   actually has when they arrive, and the order is the order those
   questions occur to them. */
const RAILS = [
  { key: 'LIVE'    as const, label: 'Live now',      blurb: 'events under way' },
  { key: 'NEXT'    as const, label: 'Up next',       blurb: 'starting soon' },
  { key: 'EDGES'   as const, label: 'Biggest edges', blurb: 'widest disagreement' },
  { key: 'CLOSING' as const, label: 'Closing soon',  blurb: 'last chance to call' },
];
type RailKey = typeof RAILS[number]['key'];

export function LandingScreen({ board, origin, sourceLabel, signedIn, onEnter }: {
  /** The public board: full in demo builds, server-redacted in production. */
  board: PublicBoard | null;
  origin: 'DEMO' | 'LIVE';
  sourceLabel: string;
  /** Whether a session exists. Decides the verb on the main button. */
  signedIn: boolean;
  onEnter: () => void;
}) {
  const ui = useArenaUI();
  const [rail, setRail] = useState<RailKey>('EDGES');
  /* Three cards on a phone, six on a desktop: the wall is a taste of the
     board, not the board. */
  const isPhone = useMedia('(max-width: 760px)');

  /* The wall is built from the snapshot the Arena reads. Membership of a
     rail is decided by engine-issued fields — event status, market state,
     close time — never by the client's own idea of what counts as live. */
  const wall = useMemo(() => {
    const markets = board?.markets ?? [];
    const events = board?.events ?? [];
    const byId = new Map(markets.map((m) => [m.id, m]));
    const pick = (ids: string[]) =>
      ids.map((id) => byId.get(id)).filter(Boolean) as typeof markets;

    const live = pick(events.filter((e) => e.status === 'LIVE').flatMap((e) => e.marketIds));
    const next = pick(
      events.filter((e) => e.status === 'UPCOMING' || e.status === 'CLOSING_SOON')
        .slice(0, 6).flatMap((e) => e.marketIds),
    );
    const edges = [...markets].sort(
      (a, b) => Math.abs(b.edgeBps ?? 0) - Math.abs(a.edgeBps ?? 0),
    );
    const closing = [...markets].sort(
      (a, b) => +new Date(a.closesAt) - +new Date(b.closesAt),
    );
    return { LIVE: live, NEXT: next, EDGES: edges, CLOSING: closing };
  }, [board]);

  /* The one market the page uses as its worked example: the widest
     disagreement on the board, as the engine ranks it. */
  const lead = (board?.featuredId ? board.markets.find((m) => m.id === board.featuredId) : null)
    ?? wall.EDGES.find((m) => m.marketProbabilityBps !== null) ?? null;

  return (
    <div className="landing">
      {/* ---------- HERO ---------- */}
      <section className="lp-hero">
        <div className="lp-hero-copy">
          {/* The five-second test. A stranger reads this block and knows:
              what this is, what it covers, what VIXY does, and what they
              can do next. Every line earns its place by answering one of
              those; nothing here is atmosphere. */}
          <span className="lp-eyebrow">
            <i />The intelligence terminal for prediction markets
          </span>

          <h1 className="lp-title">
            VIXY<span className="lp-title-accent">ARENA</span>
          </h1>

          <p className="lp-statement">
            One terminal. <b>Every prediction market.</b><br />
            Sports, politics, weather, crypto, macro, entertainment, world events —
            and an AI that tells you where the crowd has it wrong.
          </p>

          <ul className="lp-proof" aria-label="What VIXY ARENA does">
            <li><Icon name="markets" size={14} /><span><b>Watches</b> every market on Kalshi and Polymarket, in every category</span></li>
            <li><Icon name="brain" size={14} /><span><b>Models</b> its own probability for each one, with the evidence behind it</span></li>
            <li><Icon name="spark" size={14} /><span><b>Shows the gap</b> between what the market thinks and what VIXY thinks</span></li>
            <li><Icon name="search" size={14} /><span><b>Reads screenshots</b> — drop any market panel in and VIXY analyzes it</span></li>
          </ul>

          <div className="lp-cta-row">
            <button className="btn btn-primary btn-lg tap" onClick={onEnter}>
              <Icon name={signedIn ? 'arena' : 'user'} size={16} />{signedIn ? 'Enter the Arena' : 'Create your account'}
            </button>
            {signedIn ? (
              <button className="scan-cta tap lp-scan" onClick={() => ui.navigate('vision')}>
                <Icon name="search" size={15} />
                <span>Arena Vision</span>
              </button>
            ) : (
              <button className="btn btn-lg tap" onClick={() => ui.navigate('auth/signin')}>
                Sign in
              </button>
            )}
          </div>

          <span className="lp-scan-note">
            Virtual points only · no wagering · no cash value · VIXY is the analyst, never the bookmaker
          </span>
        </div>

        {/* The core is the product's signature. On this page it does the same
            job it does everywhere: it reports what the engine is doing. */}
        <div className="lp-hero-core">
          <PredictionCore state={board?.brain.state ?? 'OBSERVING'} size={480} />
          <div className="lp-core-read">
            <span className={`brain-state state-${(board?.brain.state ?? 'observing').toLowerCase()}`}>
              {board?.brain.state ?? 'STARTING'}
            </span>
            <span className="t-nano">{board?.brain.stage ?? 'resolving provider'}</span>
          </div>
          <div className="lp-core-stats">
            <div><b className="t-num">{board?.brain.marketsTracked ?? '--'}</b><span className="t-nano">tracked</span></div>
            <div><b className="t-num">{board?.brain.marketsMatched ?? '--'}</b><span className="t-nano">matched</span></div>
            <div><b className="t-num">{board ? pct(board.brain.calibrationBps, 1) : '--'}</b><span className="t-nano">calibration</span></div>
          </div>
        </div>
      </section>

      {/* ---------- HOW IT WORKS ----------
          One loop, five beats. EDGE is the product, so EDGE is the hot
          node; the worked example under the loop is the top-edge market
          from the same snapshot the Arena reads, badge and all. */}
      <section className="lp-section">
        <div className="lp-section-head">
          <span className="t-label">How it works</span>
          <h2 className="t-h2">The market has a price. VIXY has its own. The gap is the edge.</h2>
        </div>
        <ol className="lp-chain" aria-label="The VIXY loop">
          {CHAIN.map((c, i) => (
            <li key={c.term} className={`lp-beat ${c.term === 'EDGE' ? 'is-hot' : ''}`}>
              <span className="lp-beat-n">{String(i + 1).padStart(2, '0')}</span>
              <b>{c.term}</b>
              <span className="lp-beat-step t-nano">{c.step}</span>
            </li>
          ))}
          {/* The loop closes: a settled call is a data point, and the next market is already on the board. */}
          <li className="lp-beat-loop" aria-label="Then the next market"><i aria-hidden="true">↺</i><span className="t-nano">then the next market</span></li>
        </ol>
        <p className="lp-chain-read">
          The crowd has one number. VIXY has another. <b>VIXY looks for the disagreement.</b>
        </p>
        {lead && (
          <div className="lp-worked glass-01" aria-label="Worked example from the board">
            <span className="lp-worked-title">
              <CategoryChip category={lead.category} />
              <b>{lead.title}</b>
            </span>
            <span className="lp-worked-nums">
              <span className="col"><span className="t-label">Market</span><b className="t-num">{pct(lead.marketProbabilityBps)}</b></span>
              <i className="lp-worked-arrow" aria-hidden="true" />
              <span className="col"><span className="t-label">VIXY</span><b className="t-num vixy">{pct(lead.vixyProbabilityBps)}</b></span>
              <i className="lp-worked-arrow" aria-hidden="true" />
              <span className="col is-edge"><span className="t-label">Edge</span>
                <b className={`t-num ${(lead.edgeBps ?? 0) >= 0 ? 'edge-pos' : 'edge-neg'}`}>{signedPct(lead.edgeBps)}</b>
                <span className="lp-worked-callout t-nano">the disagreement</span></span>
            </span>
            <span className="lp-worked-foot">
              <OriginBadge origin={origin} label={sourceLabel} />
              <span className="t-nano">{lead.venueRefs.map((v) => v.venue.toLowerCase()).join(' · ')} · closes {untilTime(lead.closesAt, Date.now())}</span>
            </span>
          </div>
        )}
      </section>

      {/* ---------- THE UNIVERSE ----------
          Departments of one system. No per-category counts here: a demo
          board of 33 markets would make the universe look small, and the
          point of this section is breadth, which is a property of the
          engine, not of today's board. */}
      <section className="lp-section">
        <div className="lp-section-head lp-head-row">
          <div className="lp-head-titles">
            <span className="t-label">The market universe</span>
            <h2 className="t-h2">Every category the venues list. One engine reading all of it.</h2>
          </div>
          <span className="lp-universe-meta t-nano">
            Kalshi · Polymarket · one engine · no favourite category
          </span>
        </div>
        <ul className="lp-cats">
          {CATEGORIES.filter((c) => c.key !== 'OTHER').map((c) => (
            <li key={c.key} className="lp-cat" style={{ ['--cat' as string]: `var(${c.accent})` }}>
              <span className="lp-cat-bar" aria-hidden="true" />
              <b>{c.label}</b>
              <span className="t-nano">{c.blurb}</span>
            </li>
          ))}
          <li className="lp-cat lp-cat-more" aria-label="More categories as venues list them">
            <span className="lp-cat-bar" aria-hidden="true" />
            <b>…and whatever the venues list next</b>
            <span className="t-nano">a new category is a row, not a product</span>
          </li>
        </ul>
      </section>

      {/* ---------- THE MARKET WALL ----------
          A broadcast rundown, not a grid: what is on now, what is next,
          where the model disagrees most, and what is about to close.
          Every rail reads the same snapshot the Arena reads. */}
      <section className="lp-section">
        <div className="lp-section-head lp-head-row">
          <div className="lp-head-titles">
            <span className="t-label">The board, right now</span>
            <h2 className="t-h2">This is the Arena. Where VIXY disagrees is where you look.</h2>
          </div>
          <OriginBadge origin={origin} label={sourceLabel} />
        </div>

        <div className="lp-rails" role="tablist" aria-label="Market wall">
          {RAILS.map((r) => (
            <button key={r.key} role="tab" aria-selected={rail === r.key}
                    className={`lp-rail tap ${rail === r.key ? 'is-active' : ''}`}
                    onClick={() => setRail(r.key)}>
              <b>{r.label}</b>
              <span className="t-nano">{r.blurb}</span>
              {/* A count is information only when the rail is a subset of
                  the board. "33 of 33" says nothing. */}
              {(r.key === 'LIVE' || r.key === 'NEXT') && <i className="lp-rail-n">{wall[r.key].length}</i>}
            </button>
          ))}
        </div>

        {wall[rail].length === 0 ? (
          <div className="lp-empty">
            <span className="t-small">
              Nothing in this rail right now. The engine reports what it has; the
              interface does not pad it out.
            </span>
          </div>
        ) : (
          <ul className="lp-grid">
            {wall[rail].slice(0, isPhone ? 3 : 6).map((m) => (
              <li key={m.id}>
                <button className="lp-card glass-01 lift tap" onClick={onEnter}
                        aria-label={`${m.title} — open the Arena`}>
                  <span className="row between g2">
                    <CategoryChip category={m.category} />
                    <span className="t-nano">{m.venueRefs.map((v) => v.venue.toLowerCase()).join(' · ')} · closes {untilTime(m.closesAt, Date.now())}</span>
                  </span>
                  <b className="lp-card-title">{m.title}</b>
                  {m.marketProbabilityBps === null ? (
                    /* Redacted by the server: coverage is public, the figures are not. */
                    <span className="lp-card-inside" aria-label="Figures are inside the terminal">
                      <Icon name="lock" size={13} /><span className="t-nano">market · VIXY · edge — inside</span>
                    </span>
                  ) : (
                    <>
                      <Sparkline series={m.series.slice(-40)} width={260} height={34}
                                 tone={(m.edgeBps ?? 0) >= 0 ? 'edge' : 'risk'} />
                      <span className="lp-card-nums">
                        <span className="col"><span className="t-label">Market</span>
                          <b className="t-num">{pct(m.marketProbabilityBps)}</b></span>
                        <span className="col"><span className="t-label">VIXY</span>
                          <b className="t-num vixy">{pct(m.vixyProbabilityBps)}</b></span>
                        <span className="col is-edge"><span className="t-label">Edge</span>
                          <b className={`t-num ${(m.edgeBps ?? 0) >= 0 ? 'edge-pos' : 'edge-neg'}`}>
                            {signedPct(m.edgeBps)}</b></span>
                      </span>
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {origin === 'DEMO' && (
          <p className="lp-demo-note">
            <Icon name="refresh" size={13} />
            <span>Every figure above comes from <b>{sourceLabel}</b>, a labeled simulator. Nothing on this
            page is live market data, and nothing here is a prediction of any outcome.</span>
          </p>
        )}
      </section>

      {/* ---------- ARENA VISION ----------
          The signature feature, shown as a mechanic rather than a widget:
          a screenshot goes in on the left, a verdict comes out on the
          right, and the rail between them names every step — including
          the one that matters most, verifying the real market. The values
          in the returned card are the lead market's, badge and all. */}
      <section className="lp-section lp-scanner">
        <div className="lp-scanner-head">
          <div className="lp-head-titles">
            <span className="t-label">Arena Vision</span>
            <h2 className="t-h2">Find a market anywhere. Screenshot it. VIXY reads it.</h2>
          </div>
          <p className="t-small">
            Any Kalshi or Polymarket panel, from any screen. VIXY identifies the market,
            verifies it against the live venue, and runs the same brain that powers every
            screen in the Arena. The screenshot is an input — never the truth.
          </p>
        </div>

        <ol className="lp-vision-rail" aria-label="What happens to a screenshot">
          {[
            ['Find', 'any market, any screen'],
            ['Screenshot', 'the panel as you see it'],
            ['Send', 'drop or paste it in'],
            ['Identify', 'venue · question · outcome'],
            ['Verify', 'against the live market'],
            ['Run the brain', 'the same engine, same evidence'],
            ['Verdict', 'market · VIXY · edge · confidence'],
          ].map(([step, note], i) => (
            <li key={step} className={i === 4 ? 'is-key' : ''}>
              <b>{step}</b><span className="t-nano">{note}</span>
            </li>
          ))}
        </ol>

        <div className="lp-vision-demo">
          <div className="lp-vision-in" aria-label="Input: a screenshot of a market panel">
            <span className="lp-vision-tag t-nano">Input · your screenshot</span>
            <div className="lp-shot">
              <span className="lp-shot-bar"><i /><i /><i /></span>
              <span className="lp-shot-line w60" /><span className="lp-shot-line w80" />
              <span className="lp-shot-price">
                <span className="t-nano">Printed price</span>
                <b className="t-num">{lead ? pct(lead.marketProbabilityBps) : '--'}</b>
              </span>
              <span className="lp-shot-line w40" />
            </div>
            <span className="lp-vision-caption t-nano">the image is read, then set aside</span>
          </div>

          <div className="lp-vision-flow" aria-hidden="true"><i /><span className="t-nano">identify · verify</span></div>

          <div className="lp-vision-core" aria-label="Processing: the VIXY core">
            <span className="lp-vision-tag t-nano">Core · the same brain</span>
            <PredictionCore state="CONFIRMING" size={180} />
            <span className="lp-art-beam" aria-hidden="true" />
          </div>

          <div className="lp-vision-flow" aria-hidden="true"><i /><span className="t-nano">verdict</span></div>

          <div className="lp-vision-out glass-02" aria-label="Output: the verdict card">
            <span className="lp-vision-tag t-nano">Output · the verdict</span>
            {lead ? (
              <>
                <span className="lp-verdict-title">
                  <CategoryChip category={lead.category} /><b>{lead.title}</b>
                </span>
                {/* The venue the canonical market lives on. "Verified" is the
                    backend's word to say, once the real reader exists. */}
                <span className="lp-verdict-verified t-nano">
                  <Icon name="layers" size={11} />venue · {lead.venueRefs.map((v) => v.venue.toLowerCase()).join(' · ')}
                </span>
                <dl className="lp-verdict-grid">
                  <div><dt className="t-label">Market</dt><dd className="t-num">{pct(lead.marketProbabilityBps)}</dd></div>
                  <div><dt className="t-label">VIXY</dt><dd className="t-num vixy">{pct(lead.vixyProbabilityBps)}</dd></div>
                  <div className="is-edge"><dt className="t-label">Edge</dt>
                    <dd className={`t-num ${(lead.edgeBps ?? 0) >= 0 ? 'edge-pos' : 'edge-neg'}`}>{signedPct(lead.edgeBps)}</dd></div>
                  <div><dt className="t-label">Confidence</dt><dd className="t-num">{lead.confidenceBps === null ? '—' : pct(lead.confidenceBps)}</dd></div>
                  <div><dt className="t-label">Reversal risk</dt><dd className="t-num">{lead.reversalRiskBps === null ? '—' : pct(lead.reversalRiskBps)}</dd></div>
                </dl>
                {/* The engine's own grade of the edge — side and band — never a word the interface chose. */}
                <div className={`lp-verdict-row ${lead.momentum ? `side-${lead.momentum.side.toLowerCase()}` : ''}`}>
                  <span className="t-label">Verdict</span>
                  <b className="lp-verdict-band">{lead.momentum ? `${lead.momentum.band} · ${lead.momentum.side}` : 'NOT GRADED'}</b>
                  <OriginBadge origin={origin} label={sourceLabel} />
                </div>
              </>
            ) : (
              <span className="t-small">Resolving the data source…</span>
            )}
          </div>
        </div>

      </section>

      {/* ---------- THE BRIDGE ----------
          The page has shown the mechanism, the breadth, the board and the
          reader. The only honest next line is an invitation. */}
      <section className="lp-section lp-bridge" aria-label="Try it">
        <div className="lp-bridge-copy">
          <span className="t-label">Your turn</span>
          <h2 className="t-h2">You've seen the Arena. Now give it a market.</h2>
          <p className="t-small">Bring a screenshot, or open the board. Every figure inside is the engine's, with its evidence beside it.</p>
        </div>
        <div className="lp-cta-row">
          <button className="btn btn-primary btn-lg tap" onClick={() => (signedIn ? ui.navigate('vision') : onEnter())}>
            <Icon name={signedIn ? 'search' : 'user'} size={15} />{signedIn ? 'Open Arena Vision' : 'Create your account'}
          </button>
          {!signedIn && <span className="t-nano lp-bridge-note">virtual points · no wagering · your record is yours</span>}
        </div>
      </section>

      {/* ---------- HOW YOU GET IN ---------- */}
      <section className="lp-section lp-door">
        <div className="lp-section-head">
          <span className="t-label">Getting in</span>
          <h2 className="t-h2">One path into the terminal.</h2>
          <p className="t-small">
            Coverage is public. Every probability, edge and confidence figure is behind the door.
          </p>
        </div>
        <ol className="lp-door-steps">
          <li><span className="lp-door-n">1</span><div><b>Create</b><span>An identity for your calls and your record.</span></div></li>
          <li><span className="lp-door-n">2</span><div><b>Unlock</b><span>Once, on Stripe. The backend confirms it — not the browser.</span></div></li>
          <li><span className="lp-door-n">3</span><div><b>Connect</b><span>Join the Discord. The Arena talks there between events.</span></div></li>
          <li className="is-final"><span className="lp-door-n"><Icon name="arena" size={14} /></span><div><b>Enter the Arena</b><span>Every market, every category, VIXY beside each one.</span></div></li>
        </ol>
        <div className="lp-cta-row">
          <button className="btn btn-primary btn-lg tap" onClick={onEnter}>
            <Icon name={signedIn ? 'arena' : 'user'} size={16} />{signedIn ? 'Enter the Arena' : 'Create your account'}
          </button>
        </div>
      </section>

      {/* ---------- STRAIGHT ANSWERS ---------- */}
      <section className="lp-section">
        <div className="lp-section-head">
          <span className="t-label">Straight answers</span>
          <h2 className="t-h2">What this is, and what it is not</h2>
        </div>
        <dl className="lp-faq">
          <div><dt>What is VIXY ARENA?</dt><dd>An intelligence terminal for prediction markets. It reads the price, builds its own probability, and shows you the gap.</dd></div>
          <div><dt>Which markets?</dt><dd>Whatever Kalshi and Polymarket list — sports, politics, economics, crypto, weather, culture, science, world events. One board.</dd></div>
          <div><dt>Is what I see here live?</dt><dd>Everything on this page is marked. DEMO DATA means a labeled simulator; nothing is called live unless the server reports it live.</dd></div>
          <div><dt>What does VIXY actually predict?</dt><dd>A probability, with evidence, for each market — and where it disagrees with the crowd. It never claims an outcome; calls are scored only after the venue settles.</dd></div>
          <div><dt>Is money involved?</dt><dd>No. Virtual points only, no wagering, no payout, no cash value. VIXY is the analyst, never the bookmaker. Not financial advice.</dd></div>
          <div><dt>What does Arena Vision do?</dt><dd>Screenshot any market panel and drop it in. VIXY identifies it, checks the real venue, runs the same brain, and returns a verdict. The image is an input, never the truth.</dd></div>
        </dl>
      </section>

      <footer className="lp-foot">
        <span className="t-nano">
          VIXY ARENA · prediction intelligence · virtual points only, no wagering, no payout,
          no cash value
        </span>
        <button className="btn btn-sm btn-ghost tap" onClick={onEnter}>
          {signedIn ? 'Enter the Arena' : 'Create your account'}<Icon name="chevronR" size={13} />
        </button>
      </footer>
    </div>
  );
}
