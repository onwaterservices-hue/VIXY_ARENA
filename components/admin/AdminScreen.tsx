import React, { useState } from 'react';
import type { ArenaSnapshot } from '../../types';
import { HoloPanel } from '../holographic/HoloPanel';
import { SectionHeader, StatTile } from '../common/Primitives';
import { Icon } from '../common/Icon';
import { relTime } from '../../lib/format';

const GUARD_TONE = { PASS: 'edge', BLOCKED: 'risk', PENDING: 'warn' } as const;
const JOB_TONE = { RUNNING: 'edge', IDLE: 'neutral', PAUSED: 'warn', FAILED: 'risk' } as const;

/* ADMIN CONSOLE
   In production every route here is server-authorized per request.
   There is no client-side isAdmin check, and no control on this
   screen can change state without the server agreeing. */
/* What each console section is for, in the operator's language. This is
   copy, not configuration: it explains the table beside it and nothing
   in it is read by any control. */
const TAB_NOTE: Record<string, { title: string; body: string; points: string[] }> = {
  GUARDS: {
    title: 'Invariants are enforced, not documented',
    body: 'Each guard is a property the build must hold. A guard that cannot be satisfied is BLOCKED rather than quietly skipped, so the console never implies a capability the system does not have.',
    points: [
      'PASS means the property is checked and holds in this build',
      'BLOCKED means a dependency is absent — no engine, no venue keys',
      'PENDING means the service that would verify it is not connected yet',
    ],
  },
  FLAGS: {
    title: 'Flags are server-authoritative',
    body: 'A flag here is a view of server configuration. Toggling one in the interface would only ever send an intent; the server decides, authorizes and records it.',
    points: [
      'Locked flags cannot be changed from any client',
      'Venue adapters stay off until an ingest service exists',
      'Payments and Discord are out of scope for v1 by design',
    ],
  },
  JOBS: {
    title: 'Jobs are the engine, not the interface',
    body: 'Ingest, matching, inference and settlement all run server-side. The console reports their state; it cannot start, stop or reorder them.',
    points: [
      'RUNNING and PAUSED are reported states, never client assumptions',
      'A paused job downgrades the health of everything derived from it',
      'Last run is the server timestamp, shown as recorded',
    ],
  },
  AUDIT: {
    title: 'Every privileged action is written down',
    body: 'The audit trail is append-only. Actions carry the actor, the target and the time, and nothing in the interface can rewrite an entry once it exists.',
    points: [
      'Entries are written by the server, not by the client',
      'A failed action is recorded exactly like a successful one',
      'Export and review are read paths — they add nothing',
    ],
  },
};

export function AdminScreen({ snapshot, now }: { snapshot: ArenaSnapshot; now: number }) {
  const a = snapshot.admin;
  const [tab, setTab] = useState<'FLAGS' | 'GUARDS' | 'JOBS' | 'AUDIT'>('GUARDS');
  const blocked = a.guards.filter((g) => g.status === 'BLOCKED').length;

  return (
    <div className="screen col g5">
      <SectionHeader eyebrow="Restricted" title="Admin console"
        action={<span className={`env-badge env-${a.environment.toLowerCase()}`}>{a.environment}</span>} />

      <div className="admin-warning glass-01">
        <Icon name="admin" size={16} />
        <div className="col" style={{ gap: 2 }}>
          <b className="t-h3">Read-only in this build</b>
          <span className="t-small">
            No engine is connected, so every control below is disabled at the source. In production
            each action is authorized server-side per request and written to the audit trail.
          </span>
        </div>
      </div>

      <div className="stat-row">
        <StatTile label="Build" value={a.buildVersion} sub="frontend shell" icon="layers" />
        <StatTile label="Guards passing" value={`${a.guards.filter((g) => g.status === 'PASS').length}/${a.guards.length}`}
                  sub="architecture invariants" tone={blocked ? 'warn' : 'edge'} icon="admin" />
        <StatTile label="Flags enabled" value={`${a.featureFlags.filter((f) => f.enabled).length}/${a.featureFlags.length}`}
                  sub="all venue adapters off" icon="settings" tone="violet" />
        <StatTile label="Jobs running" value={a.jobs.filter((j) => j.state === 'RUNNING').length}
                  sub={`${a.jobs.filter((j) => j.state === 'PAUSED').length} paused`} icon="telemetry" tone="cyan" />
      </div>

      <div className="seg" role="group" aria-label="Admin section">
        {(['GUARDS', 'FLAGS', 'JOBS', 'AUDIT'] as const).map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="admin-body">
      <div className="admin-main col g4">
      {tab === 'GUARDS' && (
        <HoloPanel grade={2} eyebrow="Invariants" title="Architecture guards" padded={false}>
          <div className="table-scroll"><table className="data-table">
            <thead><tr><th>Guard</th><th style={{ width: 120 }}>Status</th><th>Note</th></tr></thead>
            <tbody>
              {a.guards.map((g) => (
                <tr key={g.key}>
                  <td><b>{g.label}</b><div className="t-nano">{g.key}</div></td>
                  <td><span className={`pill pill-${GUARD_TONE[g.status] === 'edge' ? 'live' : GUARD_TONE[g.status] === 'risk' ? 'offline' : 'degrade'}`}>
                    <i className="dot" />{g.status}</span></td>
                  <td className="t-small">{g.note}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </HoloPanel>
      )}

      {tab === 'FLAGS' && (
        <HoloPanel grade={2} eyebrow="Configuration" title="Feature flags" padded={false}>
          <div className="table-scroll"><table className="data-table">
            <thead><tr><th>Flag</th><th style={{ width: 96 }}>State</th><th>Note</th><th style={{ width: 90, textAlign: 'right' }}>Lock</th></tr></thead>
            <tbody>
              {a.featureFlags.map((f) => (
                <tr key={f.key}>
                  <td><b>{f.label}</b><div className="t-nano">{f.key}</div></td>
                  <td>
                    <span className={`switch ${f.enabled ? 'on' : ''}`} role="img"
                          aria-label={f.enabled ? 'enabled' : 'disabled'}><i /></span>
                  </td>
                  <td className="t-small">{f.note}</td>
                  <td style={{ textAlign: 'right' }}>
                    {f.locked && <span className="pill pill-unknown"><Icon name="lock" size={10} />LOCKED</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </HoloPanel>
      )}

      {tab === 'JOBS' && (
        <HoloPanel grade={2} eyebrow="Engine" title="Background jobs" padded={false}>
          <div className="table-scroll"><table className="data-table">
            <thead><tr><th>Job</th><th style={{ width: 110 }}>State</th><th style={{ width: 130 }}>Last run</th><th>Note</th></tr></thead>
            <tbody>
              {a.jobs.map((j) => (
                <tr key={j.key}>
                  <td><b>{j.label}</b><div className="t-nano">{j.key}</div></td>
                  <td><span className={`pill pill-${JOB_TONE[j.state] === 'edge' ? 'live' : JOB_TONE[j.state] === 'risk' ? 'offline' : JOB_TONE[j.state] === 'warn' ? 'degrade' : 'unknown'}`}>
                    <i className="dot" />{j.state}</span></td>
                  <td className="t-nano">{j.lastRunAt}</td>
                  <td className="t-small">{j.note}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </HoloPanel>
      )}

      {tab === 'AUDIT' && (
        <HoloPanel grade={2} eyebrow="Immutable" title="Audit trail" padded={false}>
          <div className="table-scroll"><table className="data-table">
            <thead><tr><th style={{ width: 130 }}>When</th><th style={{ width: 120 }}>Actor</th><th style={{ width: 190 }}>Action</th><th>Target</th></tr></thead>
            <tbody>
              {/* the trail is prepended to, so the row identity has to come
                  from the entry rather than its position */}
              {a.auditTrail.map((e) => (
                <tr key={`${e.ts}-${e.actor}-${e.action}-${e.target}`}>
                  <td className="t-nano">{relTime(e.ts, now)}</td>
                  <td className="t-mono t-small">{e.actor}</td>
                  <td><span className="pill pill-violet"><i className="dot" />{e.action}</span></td>
                  <td className="t-mono t-small">{e.target}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </HoloPanel>
      )}
      </div>

      <aside className="admin-note glass-01">
        <span className="t-label">About this section</span>
        <h3 className="t-h3">{TAB_NOTE[tab].title}</h3>
        <p className="t-small">{TAB_NOTE[tab].body}</p>
        <ul className="admin-points">
          {TAB_NOTE[tab].points.map((pt, i) => (
            <li key={i}><Icon name="check" size={12} /><span>{pt}</span></li>
          ))}
        </ul>
        <div className="admin-note-foot">
          <span className="t-nano">source health</span>
          <span className="t-mono t-nano">{a.health.status} · {a.health.origin}</span>
        </div>
      </aside>
      </div>
    </div>
  );
}
