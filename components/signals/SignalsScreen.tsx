import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ArenaSnapshot, SignalKind } from '../../types';
import { HoloPanel } from '../holographic/HoloPanel';
import { SignalStream } from './SignalStream';
import { SectionHeader, StatTile } from '../common/Primitives';
import { Icon } from '../common/Icon';

const FILTERS: (SignalKind | 'ALL')[] = [
  'ALL', 'MARKET_SHIFT', 'MOMENTUM_BUILDING', 'LIQUIDITY_CHANGE',
  'CORRELATION_SHIFT', 'SIGNAL_CONFIRMING', 'SIGNAL_LOCKED', 'SIGNAL_SETTLED', 'SOURCE_DEGRADED',
];

export function SignalsScreen({ snapshot, now }: { snapshot: ArenaSnapshot; now: number }) {
  const [filter, setFilter] = useState<SignalKind | 'ALL'>('ALL');
  const [paused, setPaused] = useState(false);
  const frozen = useRef(snapshot.signals);
  useEffect(() => { if (!paused) frozen.current = snapshot.signals; }, [snapshot.signals, paused]);
  const source = paused ? frozen.current : snapshot.signals;
  const events = useMemo(
    () => source.filter((e) => filter === 'ALL' || e.kind === filter),
    [source, filter],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of snapshot.signals) c[e.kind] = (c[e.kind] ?? 0) + 1;
    return c;
  }, [snapshot.signals]);

  return (
    <div className="screen col g5">
      <SectionHeader eyebrow="Engine console" title="VIXY signal stream"
        action={
          <button className={`btn btn-sm tap ${paused ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPaused((v) => !v)}>
            <Icon name={paused ? 'live' : 'clock'} size={13} />
            {paused ? 'Resume stream' : 'Pause stream'}
          </button>
        } />

      <div className="stat-row">
        <StatTile label="Events buffered" value={snapshot.signals.length} sub="rolling window" icon="signals" />
        <StatTile label="Locked" value={counts.SIGNAL_LOCKED ?? 0} sub="call records written" icon="lock" tone="violet" />
        <StatTile label="Settled" value={counts.SIGNAL_SETTLED ?? 0} sub="outcome verified" icon="check" tone="edge" />
        <StatTile label="Degradations" value={counts.SOURCE_DEGRADED ?? 0} sub="freshness budget exceeded"
                  tone={(counts.SOURCE_DEGRADED ?? 0) > 0 ? 'warn' : 'default'} icon="refresh" />
      </div>

      <div className="chipset vx-scroll-x">
        {FILTERS.map((f) => (
          <button key={f} className={`fchip tap ${filter === f ? 'is-active' : ''}`} onClick={() => setFilter(f)}>
            {f.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      <HoloPanel grade={2} padded={false} scan={!paused}
                 eyebrow={paused ? 'Paused · buffer frozen for reading' : 'Live console'}
                 title={`${events.length} events`}>
        <SignalStream events={events} limit={40} now={now} announce />
      </HoloPanel>
    </div>
  );
}
