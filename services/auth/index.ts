/* =============================================================
   AUTH PROVIDER RESOLUTION
   -------------------------------------------------------------
   One switch. In order:

     AUTH_BASE_URL set   → HttpAuthSource      (production)
     DEMO_MODE           → LocalPreviewAuthSource (walk the door
                           end to end in a browser; labeled)
     otherwise           → UnconfiguredAuthSource (reports it, and
                           the App refuses to open the terminal)

   Both values are BUILD-time constants (../config.ts). A production
   build has DEMO_MODE=false baked in, so LocalPreviewAuthSource is
   dead code there and is not in the bundle — `npm run verify:prod`
   asserts that on the emitted files rather than trusting this
   comment.
   ============================================================= */

import { AUTH_BASE_URL, DISCORD_INVITE_URL } from '../config';
import type { AuthSource } from './AuthSource';
import { HttpAuthSource, UnconfiguredAuthSource } from './AuthSource';
import { LocalPreviewAuthSource } from './LocalPreviewAuthSource';


export { AUTH_BASE_URL, DISCORD_INVITE_URL };

/* DEMO-ONLY BRANCHES below test `__DEMO_MODE__` inline (types/build-env.d.ts)
   rather than through a shared constant: bundlers fold the literal only at
   the site that reads it, and the fold is what makes the demo import dead
   code that is not emitted in a production build. */

export const hasDiscordInvite = (): boolean =>
  /^https:\/\/(discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]+$/.test(DISCORD_INVITE_URL);

let cached: AuthSource | null = null;

export function resolveAuthSource(): AuthSource {
  if (cached) return cached;
  /* A production build always has an account API: same-origin when no base URL
     is given. The preview source exists only in demo builds; the unconfigured
     source is what a demo build without a preview would report. */
  if (AUTH_BASE_URL || !(typeof __DEMO_MODE__ === 'boolean' ? __DEMO_MODE__ : true)) cached = new HttpAuthSource(AUTH_BASE_URL);
  else if ((typeof __DEMO_MODE__ === 'boolean' ? __DEMO_MODE__ : true)) cached = new LocalPreviewAuthSource();
  else cached = new UnconfiguredAuthSource();
  return cached;
}

export type { AuthSource };
