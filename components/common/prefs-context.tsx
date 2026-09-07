import React, { createContext, useContext } from 'react';
import { DEFAULT_UI_PREFS, type UiPrefs } from '../../lib/preferences';

export interface PrefsApi {
  prefs: UiPrefs;
  setPref: <K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) => void;
}

export const PrefsContext = createContext<PrefsApi>({
  prefs: DEFAULT_UI_PREFS,
  setPref: () => {},
});

export const usePrefs = () => useContext(PrefsContext);
