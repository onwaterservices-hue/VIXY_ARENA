/* =============================================================
   PROVIDER RESOLUTION
   -------------------------------------------------------------
   ONE switch decides where the entire application's data comes
   from, and it is decided at BUILD time (see ../config.ts). A
   production build has no DemoDataSource in it at all; the import
   below is dead code there and the bundler drops it.
   ============================================================= */

import type { ArenaDataSource } from './ArenaDataSource';
import { LiveEngineDataSource } from './ArenaDataSource';
import { DemoDataSource } from '../mock/demoProvider';
import { DEMO_MODE, ENGINE_BASE_URL } from '../config';

export { DEMO_MODE, ENGINE_BASE_URL };

/* DEMO-ONLY BRANCHES below test `__DEMO_MODE__` inline (types/build-env.d.ts)
   rather than through a shared constant: bundlers fold the literal only at
   the site that reads it, and the fold is what makes the demo import dead
   code that is not emitted in a production build. */

export function resolveDataSource(): ArenaDataSource {
  if ((typeof __DEMO_MODE__ === 'boolean' ? __DEMO_MODE__ : true)) return new DemoDataSource();
  return new LiveEngineDataSource(ENGINE_BASE_URL);
}

export type { ArenaDataSource };

import { apiFetch } from '../httpClient';
import type { PublicBoard } from '../../types';

/** The redacted public board, for the landing page of a production build. */
export function fetchPublicBoard(): Promise<PublicBoard> {
  return apiFetch<PublicBoard>(ENGINE_BASE_URL, '/api/public/board');
}
