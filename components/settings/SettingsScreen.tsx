import React from 'react';
import type { ArenaSnapshot, DataOrigin } from '../../types';
import { HoloPanel } from '../holographic/HoloPanel';
import { SectionHeader } from '../common/Primitives';
import { Icon } from '../common/Icon';

import { PRODUCT } from '../../constants';
import { usePrefs } from '../common/prefs-context';
import { useArenaUI } from '../common/ui-context';
import { useAuth } from '../../hooks';
import { ResetPreviewButton } from '../gate/PreviewControls';

/* DEMO-ONLY BRANCHES below test `__DEMO_MODE__` inline (types/build-env.d.ts)
   rather than through a shared constant: bundlers fold the literal only at
   the site that reads it, and the fold is what makes the demo import dead
   code that is not emitted in a production build. */

/* Interface preferences only. The permitted persistence keys are
   fixed by the architecture: theme, onboarding, selected sport,
   ui prefs, reduced motion. Nothing authoritative is stored here. */
export function SettingsScreen({ snapshot, origin, sourceLabel }: {
  snapshot: ArenaSnapshot | null; origin: DataOrigin; sourceLabel: string;
}) {
  const ui = useArenaUI();
  const { auth, sourceLabel: authLabel, signOut } = useAuth();
  /* The account panel reads the viewer's own row from the standings the
     snapshot already carries; it does not keep a separate identity. */
  const you = snapshot?.leaderboard.find((e) => e.isYou);
  const { prefs, setPref } = usePrefs();

  const Toggle = ({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) => (
    <button className="row between setting-row tap" onClick={onClick} aria-pressed={on}>
      <span>{label}</span>
      <span className={`switch ${on ? 'on' : ''}`}><i /></span>
    </button>
  );

  return (
    <div className="screen col g5">
      <SectionHeader eyebrow="Preferences" title="Settings" />

      <div className="split-2">
        <HoloPanel grade={2} eyebrow="Interface" title="Presentation">
          <div className="col g2">
            <Toggle on={prefs.holograms} label="Holographic effects"
                    onClick={() => setPref('holograms', !prefs.holograms)} />
            <Toggle on={prefs.motion} label="Motion"
                    onClick={() => setPref('motion', !prefs.motion)} />
            <Toggle on={prefs.telemetryBar} label="Bottom telemetry strip"
                    onClick={() => setPref('telemetryBar', !prefs.telemetryBar)} />
            <Toggle on={prefs.intelRail} label="Contextual intelligence rail"
                    onClick={() => setPref('intelRail', !prefs.intelRail)} />
            <div className="row between setting-row">
              <span className="col" style={{ gap: 2 }}>
                <span>Guided tour</span>
                <span className="t-nano">restarts on the Arena screen</span>
              </span>
              <button className="btn btn-sm tap"
                      onClick={() => { setPref('tourDone', false); window.location.reload(); }}>
                <Icon name="refresh" size={13} />Replay
              </button>
            </div>
            <div className="row between setting-row">
              <span>Density</span>
              <div className="seg">
                {(['COMFORTABLE', 'COMPACT'] as const).map((d) => (
                  <button key={d} aria-pressed={prefs.density === d} onClick={() => setPref('density', d)}>{d}</button>
                ))}
              </div>
            </div>
          </div>
          <p className="t-nano" style={{ marginTop: 'var(--s-4)' }}>
            Stored under the permitted key <b className="t-mono">ui_prefs</b> only. The system
            respects prefers-reduced-motion regardless of this setting.
          </p>
        </HoloPanel>

        <HoloPanel grade={2} eyebrow="Session" title="Data source">
          <ul className="kv-list">
            <li><span className="t-label">Provider</span><b>{sourceLabel}</b></li>
            <li><span className="t-label">Origin</span>
              <b className={origin === 'DEMO' ? 'edge-neg' : 'edge-pos'}>{origin}</b></li>
            <li><span className="t-label">Build</span><b className="t-mono">{PRODUCT.build}</b></li>
            <li><span className="t-label">Model</span><b className="t-mono">{snapshot?.brain.modelVersion ?? '—'}</b></li>
            <li><span className="t-label">Environment</span><b>{snapshot?.admin.environment ?? '—'}</b></li>
          </ul>
          <div className="notice" style={{ marginTop: 'var(--s-4)' }}>
            <Icon name="refresh" size={14} />
            <span className="t-small">
              While the origin is DEMO, every probability, edge and outcome in this interface is
              synthetic. Connecting the engine replaces the provider without changing a component.
            </span>
          </div>
        </HoloPanel>
      </div>

      {/* ---- conviction callouts ----
          The LOCKED graphic, filtered. Every value it filters on is one
          the engine published — the client grades nothing. */}
      <HoloPanel grade={2} eyebrow="Broadcast" title="Conviction callouts">
        <div className="col g2">
          <Toggle on={prefs.lockCallouts} label="Show the LOCKED graphic when a call is recorded"
                  onClick={() => setPref('lockCallouts', !prefs.lockCallouts)} />
          <div className="row between setting-row">
            <span className="col" style={{ gap: 2 }}>
              <span>Only when VIXY’s confidence is at least</span>
              <span className="t-nano">the engine’s confidence grade for that market · 0 shows every lock</span>
            </span>
            <div className="seg">
              {([0, 6000, 7000, 8000, 9000] as const).map((v) => (
                <button key={v} aria-pressed={prefs.lockMinConfidenceBps === v} disabled={!prefs.lockCallouts}
                        onClick={() => setPref('lockMinConfidenceBps', v)}>{v === 0 ? 'ANY' : `${v / 100}%`}</button>
              ))}
            </div>
          </div>
          <div className="row between setting-row">
            <span className="col" style={{ gap: 2 }}>
              <span>At most one every</span>
              <span className="t-nano">a quiet window between callouts · the toast still records every lock</span>
            </span>
            <div className="seg">
              {([0, 5, 15, 60] as const).map((v) => (
                <button key={v} aria-pressed={prefs.lockQuietMinutes === v} disabled={!prefs.lockCallouts}
                        onClick={() => setPref('lockQuietMinutes', v)}>{v === 0 ? 'EVERY' : `${v}M`}</button>
              ))}
            </div>
          </div>
        </div>
        <p className="t-nano" style={{ marginTop: 'var(--s-4)' }}>
          Click the graphic or press Esc to dismiss it early. It never appears over Arena Vision,
          the compare board or a ticket.
        </p>
      </HoloPanel>

      {/* Identity lives on the Profile screen now. Two places showing the same
          handle is two places to get it wrong. */}
      <HoloPanel grade={1} eyebrow="Account" title="Session">
        <ul className="kv-list">
          <li><span className="t-label">Signed in as</span>
              <b className="t-mono">{auth.session?.handle ?? '—'}</b></li>
          <li><span className="t-label">Email</span>
              <b className="t-mono">{auth.session?.email ?? '—'}</b></li>
          <li><span className="t-label">Account system</span>
              <b className="t-mono">{authLabel}</b></li>
          <li><span className="t-label">Access stage</span>
              <b className="t-mono">{auth.access.stage.replace('_', ' ')}</b></li>
          <li><span className="t-label">Standing</span>
              <b className="t-num">{you && snapshot ? `Rank ${you.rank} of ${snapshot.leaderboard.length}` : '—'}</b></li>
        </ul>
        <div className="row g2 wrap" style={{ marginTop: 'var(--s-4)' }}>
          <button className="btn btn-sm tap" disabled={!auth.actions.signOut}
                  onClick={() => { void signOut().then(() => ui.navigate('auth')); }}>
            <Icon name="external" size={12} />Sign out
          </button>
          {(typeof __DEMO_MODE__ === 'boolean' ? __DEMO_MODE__ : true) && auth.origin === 'PREVIEW' && (
            <ResetPreviewButton onDone={() => ui.navigate('landing')} />
          )}
        </div>
        <p className="t-small" style={{ marginTop: 'var(--s-4)' }}>
          {auth.message ?? 'Your record, linked services and referral standing are on the Profile screen. Access and billing are on the Access screen.'}
        </p>
      </HoloPanel>
    </div>
  );
}
