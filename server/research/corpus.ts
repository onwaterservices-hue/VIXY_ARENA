/* =============================================================
   RESEARCH CORPUS — the sealed split.

   The whole archive is ordered by the market's close time and cut
   once: the earlier 70 % is DEV, the later 30 % is the HOLDOUT.

   DEV is where every idea is tried, tuned, discarded and re-tried.
   The HOLDOUT is scored ONCE, by one model, at the end. Loading it
   requires passing `unseal: true` with a reason, which is printed,
   so a run that touched it cannot be mistaken for one that did not.
   `docs/HOLDOUT-SEAL.md` records the boundary and a SHA-256 of the
   holdout's ticker list, so the split cannot be quietly redrawn
   later to suit a result.
   ============================================================= */
import { createHash } from 'node:crypto';
import { loadArchive, type ArchiveRow } from '../tools/backtest.ts';

export const DEV_FRACTION = 0.7;
export const ARCHIVE_DIR = 'server/test/fixtures/backtest-archive';

export interface Split { dev: ArchiveRow[]; holdout: ArchiveRow[]; boundaryTs: number; holdoutHash: string; devHash: string }

const hashOf = (rows: ArchiveRow[]) => createHash('sha256').update(rows.map((r) => r[0]).join('\n')).digest('hex');

export function split(dir = ARCHIVE_DIR): Split {
  const all = loadArchive(dir).slice().sort((a, b) => (a[2] - b[2]) || (a[0] < b[0] ? -1 : 1));
  const cut = Math.floor(all.length * DEV_FRACTION);
  const dev = all.slice(0, cut); const holdout = all.slice(cut);
  return { dev, holdout, boundaryTs: holdout[0]?.[2] ?? 0, holdoutHash: hashOf(holdout), devHash: hashOf(dev) };
}

/** DEV only. Anything that returns holdout rows must go through `unseal` below. */
export function devRows(dir = ARCHIVE_DIR): ArchiveRow[] { return split(dir).dev; }

export function unseal(reason: string, dir = ARCHIVE_DIR): ArchiveRow[] {
  if (!reason || reason.length < 20) throw new Error('unsealing the holdout requires a written reason');
  const s = split(dir);
  console.error(`\n*** HOLDOUT UNSEALED: ${reason}\n*** ${s.holdout.length} markets, boundary ${new Date(s.boundaryTs * 1000).toISOString()}, sha256 ${s.holdoutHash}\n`);
  return s.holdout;
}

if (process.argv[1] && process.argv[1].endsWith('corpus.ts')) {
  const s = split();
  console.log(JSON.stringify({
    total: s.dev.length + s.holdout.length, dev: s.dev.length, holdout: s.holdout.length,
    devFrom: new Date(s.dev[0][2] * 1000).toISOString(), devTo: new Date(s.dev.at(-1)![2] * 1000).toISOString(),
    boundary: new Date(s.boundaryTs * 1000).toISOString(), holdoutTo: new Date(s.holdout.at(-1)![2] * 1000).toISOString(),
    devHash: s.devHash, holdoutHash: s.holdoutHash,
  }, null, 2));
}
