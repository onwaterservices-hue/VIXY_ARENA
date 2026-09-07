/* Harvest line → backtest archive.
   TICKER_SUFFIX|SERIES|closeTs|y/n|startTs|oiUsd|volUsd|bidC.spreadC,...   ('-' = no bar that minute)
   Prices arrive in cents; the archive is in bps (cents × 100). */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2], out = process.argv[3];
const rows = [], seen = new Set();
let lines = 0, bad = 0;
for (const f of readdirSync(dir).filter(n => n.endsWith('.txt')).sort()) {
  for (const raw of readFileSync(join(dir, f), 'utf8').split('\n')) {
    const t = raw.trim(); if (!t || t.split('|').length !== 8) { if (t) bad++; continue; }
    lines++;
    const [suffix, series, closeTs, r, startTs, oi, vol, bars] = t.split('|');
    const ticker = `${series}-${suffix}`;
    if (seen.has(ticker)) continue; seen.add(ticker);
    const b = [];
    bars.split(',').forEach((tok, i) => {
      if (tok === '-') return;
      const [bid, sp] = tok.split('.').map(Number);
      if (!Number.isFinite(bid) || !Number.isFinite(sp)) return;
      b.push([i * 60, bid * 100, (bid + sp) * 100, Number(oi) || 0, Number(vol) || 0]);
    });
    rows.push([ticker, series, Number(closeTs), r === 'y' ? 'yes' : 'no', Number(startTs), b]);
  }
}
rows.sort((a, b) => a[2] - b[2]);
writeFileSync(out, JSON.stringify(rows));
console.log(`${lines} lines (${bad} malformed) → ${rows.length} markets, ${rows.reduce((a, r) => a + r[5].length, 0)} bars → ${out}`);
