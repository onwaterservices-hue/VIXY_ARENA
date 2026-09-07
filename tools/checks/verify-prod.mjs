#!/usr/bin/env node
/* =============================================================
   PRODUCTION BUNDLE CHECK
   -------------------------------------------------------------
   Reads the emitted files in dist/ and FAILS if anything that only
   belongs to a demo build is present. This is the check that turns
   "the preview account is unreachable in production" from a comment
   into a fact. Run after `vite build` (mode=production):

       npm run verify:prod

   Pass DIST=path to check another directory. Exit code 1 on failure.
   ============================================================= */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const DIST = process.env.DIST || 'dist';

/* Strings that exist only in demo / preview code paths. */
const FORBIDDEN = [
  'Simulate a confirmed payment',
  'PREVIEW ACCOUNT',
  'vixy_arena_preview',
  'DemoDataSource',
  'demo-sim-',
  'simulatedPaid',
  'Reset preview account',
  'LocalPreviewAuthSource',
  'PreviewAccountSource',
  'aistudiocdn.com',
];

/* Allowed until the real Arena Vision reader exists: the honest label on a
   simulated read. Remove from this list the day POST /api/scan is real. */
const EXEMPT = ['SIMULATED READ'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (['.js', '.mjs', '.html', '.css'].includes(extname(p))) out.push(p);
  }
  return out;
}

let files;
try { files = walk(DIST); } catch { console.error(`verify:prod — no ${DIST}/ directory. Run the production build first.`); process.exit(1); }

const hits = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const s of FORBIDDEN) {
    let idx = 0, n = 0;
    while ((idx = text.indexOf(s, idx)) !== -1) { n++; idx += s.length; }
    if (n) hits.push({ file: f, string: s, count: n });
  }
}

console.log(`verify:prod — scanned ${files.length} file(s) in ${DIST}/`);
if (EXEMPT.length) console.log(`  exempt for now: ${EXEMPT.join(', ')}`);
if (hits.length === 0) {
  console.log('  OK — no demo or preview code in the production bundle.');
  process.exit(0);
}
console.error('  FAIL — demo/preview strings found in the production bundle:');
for (const h of hits) console.error(`    ${h.string}  ×${h.count}  in ${h.file}`);
console.error('  The build is not production. Check DEMO_MODE resolution in vite.config.ts / services/config.ts.');
process.exit(1);
