import React from 'react';
import { ROUTE_MAP } from '../../constants';
import { Icon } from './Icon';

/* =============================================================
   SCREEN INTRO
   -------------------------------------------------------------
   One line at the top of every screen saying what that screen is
   for, in the words a person would use.

   The Arena is deep — fourteen screens, a broadcast register, a
   vocabulary of its own. Depth is only impressive if you can tell
   where you are, so every route carries its own purpose and this
   strip renders it. The text comes from the route table, which
   means a new screen cannot ship without one.
   ============================================================= */

export function ScreenIntro({ route }: { route: string }) {
  const def = ROUTE_MAP[route];
  if (!def) return null;
  return (
    <div className="screen-intro">
      <span className="screen-intro-icon"><Icon name={def.icon} size={14} /></span>
      <b className="t-body">{def.label}</b>
      <i className="screen-intro-sep" aria-hidden="true" />
      <span className="t-small">{def.description}</span>
    </div>
  );
}
