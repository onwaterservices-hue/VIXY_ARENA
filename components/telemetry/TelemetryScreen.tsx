import React from 'react';
import type { ArenaSnapshot } from '../../types';
import { HoloPanel } from '../holographic/HoloPanel';
import { SignalMeter, FreshnessPulse } from '../holographic/Meters';
import { SectionHeader, StatTile, StatusPill } from '../common/Primitives';
import { pct, relTime } from '../../lib/format';

export function TelemetryScreen({ snapshot, now }: { snapshot: ArenaSnapshot; now: number }) {
  const s = snapshot.system;
  return (
    <div className="screen col g5">
      <SectionHeader eyebrow="Operations" title="Telemetry" />

      <div className="stat-row">
        <StatTile label="Uptime" value={pct(s.uptimeBps, 2)} sub="rolling window" tone="edge" icon="telemetry" />
        <StatTile label="Ingest lag" value={`${s.ingestLagMs}ms`} sub="venue → canonical" icon="refresh" tone="cyan" />
        <StatTile label="Match queue" value={s.matchQueue} sub="pending equivalence checks" icon="layers" />
        <StatTile label="Settlement queue" value={s.settlementQueue} sub="awaiting verification" icon="check" tone="violet" />
      </div>

      <div className="tele-grid">
        {s.sources.map((src) => (
          <HoloPanel key={src.key} grade={2} eyebrow="Source" title={src.label}
                     actions={<StatusPill status={src.status} />}>
            <div className="col g4">
              <div className="row between">
                <FreshnessPulse ageMs={Math.max(0, now - new Date(src.lastEventAt).getTime())} status={src.status} />
                <div className="col" style={{ alignItems: 'flex-end', gap: 0 }}>
                  <b className="t-num">{src.latencyMs}ms</b>
                  <span className="t-nano">p50 latency</span>
                </div>
              </div>
              <SignalMeter label="Success rate" valueBps={src.successRateBps} tone="edge" segments={18} />
              <div className="row between">
                <span className="t-nano">{src.throughputPerMin} events/min</span>
                <span className="t-nano">last event {relTime(src.lastEventAt, now)}</span>
              </div>
            </div>
          </HoloPanel>
        ))}
      </div>

      <HoloPanel grade={1} eyebrow="Freshness policy" title="How status is decided">
        <p className="t-small">
          Liveness is computed by the health service from the age of the underlying source data,
          not by this interface. When a source exceeds its freshness budget the status is
          downgraded and every value derived from it is labeled accordingly. If no message
          arrives inside the budget, the interface shows UNKNOWN rather than the last good value.
        </p>
      </HoloPanel>
    </div>
  );
}
