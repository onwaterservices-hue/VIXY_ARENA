import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ArenaSnapshot, CanonicalMarket, ScanInput, ScanProgress, ScanResult, ScanStage, ScanVerdict,
} from '../../types';
import { Icon } from '../common/Icon';
import { CategoryChip, VenueChip, StatusPill, OriginBadge } from '../common/Primitives';
import { PredictionCore } from '../holographic/PredictionCore';
import { EdgeLadder } from '../holographic/Meters';
import { useFocusTrap, useReducedMotion } from '../../hooks';
import { useArenaUI } from '../common/ui-context';
import { pct, signedPct } from '../../lib/format';
import { NO_VALUE } from '../broadcast/BroadcastPrimitives';

/* =============================================================
   ARENA VISION — SCAN ANY MARKET
   -------------------------------------------------------------
   Bring VIXY any market you find anywhere and ask what it thinks.

   The screen is built around one honesty rule that shows up in
   every state: the screenshot is what YOU saw; the numbers are
   what the ENGINE says about the market it matched. Those two
   things are labelled separately and never merged. A printed
   probability from an image is shown as "printed on the image",
   never as the market's price.

   The work happens in the data source — this component uploads,
   renders stages as they arrive, and displays the result. It
   holds no model, no thresholds and no opinion.
   ============================================================= */

const STAGE_COPY: Record<ScanStage, string> = {
  READING_IMAGE:          'Reading image',
  IDENTIFYING_MARKET:     'Identifying market',
  MATCHING_VENUE:         'Matching venue',
  FETCHING_MARKET:        'Fetching canonical market',
  BUILDING_FEATURES:      'Building feature vector',
  RUNNING_BRAIN:          'Running VIXY Brain',
  CROSS_CHECKING:         'Cross-checking signals',
  CALCULATING_EDGE:       'Calculating edge',
  CALIBRATING_CONFIDENCE: 'Calibrating confidence',
  FINALIZING:             'Finalizing read',
};

const VERDICT_COPY: Record<ScanVerdict, { label: string; tone: string; note: string }> = {
  STRONG_EDGE:       { label: 'Strong edge',        tone: 'edge',  note: 'wide disagreement, firmly held' },
  POSITIVE_EDGE:     { label: 'Positive edge',      tone: 'edge',  note: 'model above market' },
  WATCH:             { label: 'Watch',              tone: 'warn',  note: 'a read, not yet a call' },
  NO_EDGE:           { label: 'No edge',            tone: 'flat',  note: 'model and market agree' },
  NEGATIVE_EDGE:     { label: 'Negative edge',      tone: 'risk',  note: 'model below market' },
  INSUFFICIENT_DATA: { label: 'Insufficient data',  tone: 'flat',  note: 'not enough to grade' },
  NOT_VERIFIED:      { label: 'Not verified',       tone: 'flat',  note: 'no venue confirmed this market' },
};

const MAX_BYTES = 8 * 1024 * 1024;

type Phase = 'IDLE' | 'READY' | 'SCANNING' | 'DONE' | 'ERROR';

export function ScanMarket({ snapshot, onClose, onScan, embedded = false }: {
  snapshot: ArenaSnapshot | null;
  onClose: () => void;
  onScan: (input: ScanInput, onProgress: (p: ScanProgress) => void) => Promise<ScanResult>;
  /** Rendered as a page (the Arena Vision tab) rather than a dialog. */
  embedded?: boolean;
}) {
  const trapRef = useFocusTrap<HTMLDivElement>(!embedded);
  const reduced = useReducedMotion();
  const ui = useArenaUI();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [phase, setPhase] = useState<Phase>('IDLE');
  const [dragging, setDragging] = useState(false);
  const [input, setInput] = useState<ScanInput | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const matched: CanonicalMarket | null = useMemo(
    () => (result?.marketId && snapshot
      ? snapshot.markets.find((m) => m.id === result.marketId) ?? null
      : null),
    [result, snapshot],
  );

  /* ---- accepting a file ------------------------------------ */
  const accept = useCallback(async (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setPhase('ERROR');
      setError(`That file is ${file.type || 'an unknown type'}. Screenshots only — PNG, JPEG or WebP.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      setPhase('ERROR');
      setError(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 8 MB.`);
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('the file could not be read'));
      r.readAsDataURL(file);
    }).catch(() => null);

    if (!dataUrl) {
      setPhase('ERROR');
      setError('That file could not be read by the browser.');
      return;
    }
    setInput({ fileName: file.name, mimeType: file.type, bytes: file.size, dataUrl });
    setResult(null);
    setProgress(null);
    setPhase('READY');
  }, []);

  /* Paste straight from the clipboard: the fastest path from "I saw a
     market" to "what does VIXY think", and the one people will use. */
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? [])
        .find((i) => i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (file) { e.preventDefault(); void accept(file); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [accept]);

  useEffect(() => {
    if (embedded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, embedded]);

  /* ---- running the scan ------------------------------------ */
  const run = useCallback(async (chooseMarketId?: string) => {
    if (!input) return;
    setPhase('SCANNING');
    setError(null);
    setProgress(null);
    try {
      const r = await onScan({ ...input, chooseMarketId }, setProgress);
      setResult(r);
      setPhase('DONE');
    } catch (e) {
      setPhase('ERROR');
      setError(e instanceof Error ? e.message : 'The scan could not be completed.');
    }
  }, [input, onScan]);

  const reset = () => {
    setInput(null); setResult(null); setProgress(null); setError(null); setPhase('IDLE');
  };

  const verdict = result ? VERDICT_COPY[result.verdict] : null;

  return (
    <div className={embedded ? 'scan-page' : 'scan-scrim'} ref={trapRef}
         role={embedded ? undefined : 'dialog'} aria-modal={embedded ? undefined : true}
         aria-label="Arena Vision — analyze a market from a screenshot">
      <div className={`scan glass-03 brackets ${embedded ? 'is-page' : ''}`}>
        <i className="bk bk-tl" /><i className="bk bk-tr" /><i className="bk bk-bl" /><i className="bk bk-br" />

        {!embedded && (
        <header className="scan-head">
          <div className="col" style={{ gap: 2, minWidth: 0 }}>
            <span className="t-label">Bring VIXY any market</span>
            <h2 className="t-h2">Arena Vision</h2>
          </div>
          <div className="row g2">
            <span className="scan-venues">
              <VenueChip venue="KALSHI" /><VenueChip venue="POLYMARKET" />
            </span>
            {!embedded && (
              <button className="icon-btn tap" onClick={onClose} aria-label="Close scanner">
                <Icon name="close" size={15} />
              </button>
            )}
          </div>
        </header>
        )}

        <div className="scan-body">
          {/* ---------- LEFT: the image ---------- */}
          <section className="scan-left" aria-label="Screenshot">
            {!input ? (
              <div
                className={`scan-drop ${dragging ? 'is-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void accept(f);
                }}
              >
                <span className="scan-drop-ring" aria-hidden="true" />
                <Icon name="arrowDown" size={26} />
                <b className="t-h3">Drop a screenshot</b>
                <span className="t-small">
                  A market from Kalshi or Polymarket. Paste works too — ⌘V.
                </span>
                <button className="btn btn-primary tap" onClick={() => fileRef.current?.click()}>
                  <Icon name="markets" size={15} />Upload screenshot
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="sr-only"
                       aria-label="Choose a screenshot to scan"
                       onChange={(e) => { const f = e.target.files?.[0]; if (f) void accept(f); }} />
                <span className="t-nano">PNG, JPEG or WebP · up to 8 MB · the image is the input, never the answer</span>
              </div>
            ) : (
              <figure className="scan-shot">
                <span className="scan-shot-tag">
                  <Icon name="user" size={11} />YOUR UPLOAD
                </span>
                <img src={input.dataUrl} alt={`Screenshot to scan: ${input.fileName}`} />
                {phase === 'SCANNING' && !reduced && <span className="scan-beam" aria-hidden="true" />}
                <figcaption className="row between g2">
                  <span className="t-nano">{input.fileName}</span>
                  <button className="btn btn-sm btn-ghost tap" onClick={reset}>Replace</button>
                </figcaption>
              </figure>
            )}

            {result && result.extraction.title && (
              <div className={`scan-extract ${result.origin === 'DEMO' ? 'is-sim' : ''}`}>
                <div className="row between g2">
                  <span className="t-label">
                    {result.origin === 'DEMO' ? 'Simulated read' : 'Read from the image'}
                  </span>
                  <OriginBadge origin={result.origin} label={result.origin === 'DEMO' ? 'DEMO SIMULATOR' : 'VIXY ENGINE'} />
                </div>
                {result.origin === 'DEMO' && (
                  <span className="scan-sim-note">
                    <Icon name="alert" size={12} />
                    The demo provider does not read pixels. It produces a repeatable reading from
                    the file so the pipeline can be exercised end to end — nothing below was read
                    from your image, and it may not match what the image shows.
                  </span>
                )}
                <ul className="scan-extract-list">
                  <li><span>Venue</span><b>{result.extraction.venue ?? NO_VALUE}</b></li>
                  <li><span>Market</span><b>{result.extraction.title}</b></li>
                  <li><span>Outcome</span><b>{result.extraction.outcome ?? NO_VALUE}</b></li>
                  <li>
                    <span>Printed on the image</span>
                    <b className="t-num">{
                      result.extraction.printedProbabilityBps === null
                        ? NO_VALUE : pct(result.extraction.printedProbabilityBps)
                    }</b>
                  </li>
                </ul>
                {result.extraction.unreadable.length > 0 && (
                  <span className="t-nano">
                    could not read: {result.extraction.unreadable.join(', ')}
                  </span>
                )}
                <span className="t-nano scan-extract-note">
                  This is what the screenshot said. It is not the market's price.
                </span>
              </div>
            )}
          </section>

          {/* ---------- RIGHT: the engine ---------- */}
          <section className="scan-right" aria-label="VIXY analysis">
            {phase === 'IDLE' && (
              <div className="scan-idle">
                <PredictionCore state={snapshot?.brain.state ?? 'OBSERVING'} size={220} />
                <b className="t-h3">One brain, another door</b>
                <p className="t-small">
                  A scan runs the same engine as every other screen in the Arena. It reads
                  the image, identifies the market, matches it to a venue, retrieves the
                  canonical market and then models it. If it cannot match the market with
                  confidence it will say so rather than guess.
                </p>
              </div>
            )}

            {phase === 'READY' && (
              <div className="scan-idle">
                <PredictionCore state={snapshot?.brain.state ?? 'OBSERVING'} size={200} />
                <b className="t-h3">Ready to scan</b>
                <p className="t-small">The image will be read, matched against the connected venues, and run through the engine.</p>
                <button className="btn btn-primary btn-lg tap" onClick={() => void run()}>
                  <Icon name="brain" size={16} />Run VIXY Brain
                </button>
              </div>
            )}

            {phase === 'SCANNING' && (
              <div className="scan-run">
                <div className="scan-run-core">
                  <PredictionCore state="ANALYZING" size={200} />
                </div>
                <ol className="scan-stages" aria-live="polite">
                  {(Object.keys(STAGE_COPY) as ScanStage[]).map((st, i) => {
                    const at = progress?.index ?? -1;
                    const state = i < at ? 'done' : i === at ? 'now' : 'wait';
                    return (
                      <li key={st} className={`scan-stage is-${state}`}>
                        <span className="scan-stage-mark" aria-hidden="true">
                          {state === 'done' ? <Icon name="check" size={11} /> : <i />}
                        </span>
                        <span>{STAGE_COPY[st]}</span>
                      </li>
                    );
                  })}
                </ol>
                {progress?.note && <span className="t-nano">{progress.note}</span>}
              </div>
            )}

            {phase === 'ERROR' && (
              <div className="scan-idle" role="alert">
                <span className="scan-bad"><Icon name="close" size={22} /></span>
                <b className="t-h3">That did not work</b>
                <p className="t-small">{error}</p>
                <button className="btn tap" onClick={reset}>Try another image</button>
              </div>
            )}

            {phase === 'DONE' && result && verdict && (
              <div className="scan-result">
                {/* the verification state leads, before any number — and the
                    origin sits beside it, because a verified DEMO read and a
                    verified LIVE read are two different claims */}
                <div className="row between g2 wrap">
                <div className={`scan-state state-${result.status.toLowerCase()}`}>
                  <Icon name={result.status === 'VERIFIED' ? 'check' : 'refresh'} size={13} />
                  {result.status === 'VERIFIED' ? 'Verified against a venue'
                    : result.status === 'AMBIGUOUS' ? 'Several markets fit'
                    : result.status === 'UNVERIFIED' ? 'Identified, not verified'
                    : result.status === 'NO_MARKET_DETECTED' ? 'No market found in the image'
                    : 'Image unreadable'}
                  {result.matchBps !== null && (
                    <span className="t-nano">match {pct(result.matchBps, 0)}</span>
                  )}
                </div>
                <OriginBadge origin={result.origin}
                             label={result.origin === 'DEMO' ? 'DEMO SIMULATOR' : 'VIXY ENGINE'} />
                </div>

                {result.status === 'AMBIGUOUS' ? (
                  <div className="scan-candidates">
                    <b className="t-h3">Which market is this?</b>
                    <p className="t-small">{result.rationale}</p>
                    <ul className="scan-cand-list">
                      {result.candidates.map((c) => (
                        <li key={c.marketId}>
                          <button className="scan-cand tap" onClick={() => void run(c.marketId)}>
                            <span className="col grow" style={{ gap: 2, alignItems: 'flex-start', minWidth: 0 }}>
                              <span className="row g2">
                                <CategoryChip category={c.category} />
                                <VenueChip venue={c.venue} />
                              </span>
                              <b>{c.title}</b>
                              <span className="t-nano">{c.reasons.join(' · ')}</span>
                            </span>
                            <span className="col" style={{ alignItems: 'flex-end', gap: 2 }}>
                              <b className="t-num">{pct(c.matchBps, 0)}</b>
                              <span className="t-nano">match</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <>
                    <div className={`scan-verdict tone-${verdict.tone}`}>
                      <span className="t-label">VIXY market read</span>
                      <b className="scan-verdict-word">{verdict.label}</b>
                      <span className="t-nano">{verdict.note}</span>
                    </div>

                    {matched ? (
                      <>
                        {/* THE COMPARISON. The whole point of the feature in one
                            strip: what the picture said, what the live engine says
                            now, and the distance between them. The screenshot
                            column is labelled as a reading of an image and nothing
                            more — it is the one number here that is not live. */}
                        <div className="scan-vs" role="group" aria-label="Screenshot versus live engine">
                          <div className="scan-vs-col is-shot">
                            <span className="scan-vs-tag"><Icon name="search" size={11} />Screenshot says</span>
                            <b className="t-num">
                              {result.extraction.printedProbabilityBps === null
                                ? NO_VALUE : pct(result.extraction.printedProbabilityBps)}
                            </b>
                            <span className="t-nano">printed on the image · not live</span>
                          </div>
                          <div className="scan-vs-mid" aria-hidden="true">
                            <i />
                            <span className="t-nano">
                              {result.extraction.printedProbabilityBps === null
                                || matched.marketProbabilityBps === null
                                ? 'no delta'
                                : `${signedPct(matched.marketProbabilityBps - result.extraction.printedProbabilityBps)} since the shot`}
                            </span>
                            <i />
                          </div>
                          <div className="scan-vs-col is-live">
                            <span className="scan-vs-tag"><i className="dot pulse-dot" />Live engine says</span>
                            <b className="t-num">{pct(matched.marketProbabilityBps)}</b>
                            <span className="t-nano">market now · VIXY {pct(matched.vixyProbabilityBps)}</span>
                          </div>
                        </div>

                        <div className="scan-nums">
                          <div className="col">
                            <span className="t-label">Market</span>
                            <b className="t-num scan-num">{pct(matched.marketProbabilityBps)}</b>
                          </div>
                          <div className="col">
                            <span className="t-label">VIXY</span>
                            <b className="t-num scan-num vixy">{pct(matched.vixyProbabilityBps)}</b>
                          </div>
                          <div className="col">
                            <span className="t-label">Edge</span>
                            <b className={`t-num scan-num ${(matched.edgeBps ?? 0) >= 0 ? 'edge-pos' : 'edge-neg'}`}>
                              {matched.edgeBps === null ? NO_VALUE : signedPct(matched.edgeBps)}
                            </b>
                          </div>
                          <div className="col">
                            <span className="t-label">Confidence</span>
                            <b className="t-num scan-num">{pct(matched.confidenceBps)}</b>
                          </div>
                        </div>

                        <EdgeLadder marketBps={matched.marketProbabilityBps}
                                    vixyBps={matched.vixyProbabilityBps}
                                    edgeBps={matched.edgeBps} size="sm" />

                        <div className="row between g2 scan-market-line">
                          <span className="row g2">
                            <CategoryChip category={matched.category} />
                            <StatusPill status={matched.health.status} compact />
                          </span>
                          <span className="t-nano">{matched.title}</span>
                        </div>
                      </>
                    ) : (
                      <p className="t-small">{result.rationale}</p>
                    )}

                    {result.evidence.length > 0 && (
                      <div className="scan-evidence">
                        <span className="t-label">What the engine is reading</span>
                        <ul>
                          {result.evidence.map((e) => (
                            <li key={e.label} className={`scan-ev stance-${e.stance.toLowerCase()}`}>
                              <Icon name={e.stance === 'CAUTIONS' ? 'close' : e.stance === 'SUPPORTS' ? 'check' : 'target'} size={12} />
                              <span className="col" style={{ gap: 1, minWidth: 0 }}>
                                <b>{e.label}</b>
                                <span className="t-nano">{e.detail}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {matched && <p className="t-small scan-rationale">{result.rationale}</p>}

                    <div className="scan-actions">
                      {matched && (
                        <button className="btn btn-primary tap"
                                onClick={() => { onClose(); ui.openMarket(matched.id); }}>
                          Open full market<Icon name="chevronR" size={13} />
                        </button>
                      )}
                      <button className="btn tap" onClick={reset}>Scan another</button>
                    </div>
                  </>
                )}

                <p className="t-nano scan-disclaimer">
                  This is VIXY's current model read, not a prediction of the outcome and not
                  financial advice. Values come from the {result.origin === 'DEMO' ? 'labeled demo provider' : 'engine'}.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
