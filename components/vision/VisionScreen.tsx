import React from 'react';
import type { ArenaSnapshot, ScanInput, ScanProgress, ScanResult } from '../../types';
import { ScanMarket } from '../scan/ScanMarket';

/* =============================================================
   ARENA VISION — the tab
   -------------------------------------------------------------
   The signature feature, as a destination rather than a popup.
   Screenshot any market panel on Kalshi or Polymarket, drop it
   here, and the same engine that drives every other screen reads
   it, matches it to the canonical market, models it, and says
   whether it likes the price.

   The page is the scanner plus three sentences. Nothing else
   competes with the drop zone, because the drop zone is the
   product.
   ============================================================= */

export function VisionScreen({ snapshot, onScan }: {
  snapshot: ArenaSnapshot | null;
  onScan: (input: ScanInput, onProgress: (p: ScanProgress) => void) => Promise<ScanResult>;
}) {
  return (
    <div className="screen col g5 vision">
      <ol className="vision-how" aria-label="How Arena Vision works">
        <li><span className="vision-n">1</span><b>Screenshot</b><span>any market panel on Kalshi or Polymarket</span></li>
        <li><span className="vision-n">2</span><b>Drop or paste</b><span>it below — ⌘V works from anywhere on this page</span></li>
        <li><span className="vision-n">3</span><b>VIXY reads it</b><span>matches the market, models it, and gives a verdict on the price</span></li>
      </ol>

      <ScanMarket embedded snapshot={snapshot} onClose={() => {}} onScan={onScan} />


    </div>
  );
}
