import React, { createContext, useContext } from 'react';
import type { Direction } from '../../types';

/* Shell-level UI intents. Screens raise them; App owns the state.
   Nothing authoritative travels through here — these are view actions. */
export interface ArenaUI {
  openMarket: (marketId: string) => void;
  openCall: (marketId: string, direction?: Direction) => void;
  /* Opens the side-by-side board for a set of canonical markets. The
     board reads the same snapshot values every other surface reads. */
  openCompare: (marketIds: string[]) => void;
  /** Opens the screenshot scanner. Global: any surface can raise it. */
  openScan: () => void;
  navigate: (route: string) => void;
  notify: (message: string, tone?: 'info' | 'good' | 'warn') => void;
}

const noop = () => {};
export const ArenaUIContext = createContext<ArenaUI>({
  openMarket: noop, openCall: noop, openCompare: noop, openScan: noop,
  navigate: noop, notify: noop,
});

export const useArenaUI = () => useContext(ArenaUIContext);

/* ---- origin ------------------------------------------------
   The provider's origin, available to any primitive that renders a
   liveness word. A simulated feed is never allowed to say LIVE. */
export const OriginContext = createContext<'DEMO' | 'LIVE'>('DEMO');
export const useOrigin = () => useContext(OriginContext);
