/* One switch, empty on purpose: connecting an account system is a
   deployment decision made with real credentials. */

import type { AccountSource } from './AccountSource';
import { HttpAccountSource, UnconfiguredAccountSource } from './AccountSource';
import { PreviewAccountSource } from './PreviewAccountSource';
import { ACCOUNT_BASE_URL } from '../config';

export { ACCOUNT_BASE_URL };

/* DEMO-ONLY BRANCHES below test `__DEMO_MODE__` inline (types/build-env.d.ts)
   rather than through a shared constant: bundlers fold the literal only at
   the site that reads it, and the fold is what makes the demo import dead
   code that is not emitted in a production build. */

export function resolveAccountSource(): AccountSource {
  if (ACCOUNT_BASE_URL || !(typeof __DEMO_MODE__ === 'boolean' ? __DEMO_MODE__ : true)) return new HttpAccountSource(ACCOUNT_BASE_URL);
  if ((typeof __DEMO_MODE__ === 'boolean' ? __DEMO_MODE__ : true)) return new PreviewAccountSource();
  return new UnconfiguredAccountSource();
}

export type { AccountSource };
