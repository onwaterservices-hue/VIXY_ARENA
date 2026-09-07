import React, { useState } from 'react';
import type { ArenaSnapshot } from '../../types';
import { HoloPanel } from '../holographic/HoloPanel';
import { NeuralMap } from './NeuralMap';
import { SectionHeader, StatTile, CategoryChip } from '../common/Primitives';
import { pct } from '../../lib/format';

export function NeuralScreen({ snapshot }: { snapshot: ArenaSnapshot }) {
  /* The selection is held as an id and resolved against the current
     snapshot on every render. Holding the node object itself would freeze
     the inspector on the values from the tick it was clicked. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? snapshot.graph.nodes.find((n) => n.id === selectedId) ?? null : null;
  const links = selected
    ? snapshot.graph.edges.filter((e) => e.from === selected.id || e.to === selected.id)
    : [];
  const byId = new Map(snapshot.graph.nodes.map((n) => [n.id, n]));

  return (
    <div className="screen col g5">
      <SectionHeader eyebrow="Modeled relationships" title="Neural market map" />

      <div className="stat-row">
        <StatTile label="Nodes" value={snapshot.graph.nodes.length} sub="canonical markets" icon="neural" />
        <StatTile label="Links" value={snapshot.graph.edges.length} sub="modeled relationships" icon="layers" tone="violet" />
        <StatTile label="Clusters" value={new Set(snapshot.graph.nodes.map((n) => n.category)).size} sub="by category" icon="markets" tone="cyan" />
        <StatTile label="Topology" value="DEMO" sub="placeholder relationships" tone="warn" icon="refresh" />
      </div>

      <div className="split-side">
        <HoloPanel grade={2} padded={false} eyebrow="Interactive" title="Relationship graph"
          actions={<div className="map-legend row g3">
            <span className="lg lg-corr">Correlation</span>
            <span className="lg lg-mom">Momentum</span>
            <span className="lg lg-liq">Liquidity</span>
            <span className="lg lg-inf">Influence</span>
          </div>}>
          <NeuralMap graph={snapshot.graph} height={640} selectedId={selected?.id ?? null} onSelect={(n) => setSelectedId(n.id)} />
        </HoloPanel>

        <HoloPanel grade={selected ? 3 : 1} active={!!selected}
                   eyebrow={selected ? 'Selected node' : 'Inspector'} title={selected?.symbol ?? 'Select a node'}>
          {!selected ? (
            <div className="col g4">
              <p className="t-small">Click any node to inspect its modeled cluster. Relationships here are
                generated placeholders for interface development — they describe nothing real yet.</p>
              <div className="col g2">
                <span className="t-label">Clusters by category</span>
                <ul className="link-list">
                  {Object.entries(
                    snapshot.graph.nodes.reduce<Record<string, number>>((acc, n) => {
                      acc[n.category] = (acc[n.category] ?? 0) + 1; return acc;
                    }, {}),
                  ).map(([k, v]) => (
                    <li key={k} className="row between g3">
                      <span className="row g2"><CategoryChip category={k as never} /></span>
                      <span className="t-num">{v}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="col g2">
                <span className="t-label">Link types</span>
                <ul className="link-list">
                  {Object.entries(
                    snapshot.graph.edges.reduce<Record<string, number>>((acc, e) => {
                      acc[e.kind] = (acc[e.kind] ?? 0) + 1; return acc;
                    }, {}),
                  ).map(([k, v]) => (
                    <li key={k} className="row between g3">
                      <span className={`link-kind k-${k.toLowerCase()}`}>{k}</span>
                      <span className="t-num">{v}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="col g4">
              <div className="row g2"><CategoryChip category={selected.category} /></div>
              <div className="t-h3">{selected.label}</div>
              <div className="col g2">
                <div className="row between"><span className="t-label">Node activity</span>
                  <span className="t-num">{pct(selected.activityBps, 0)}</span></div>
                <div className="meter"><i style={{ width: `${selected.activityBps / 100}%` }} /></div>
              </div>
              <div className="col g2">
                <span className="t-label">Modeled links ({links.length})</span>
                <ul className="link-list">
                  {links.map((l, i) => {
                    const other = byId.get(l.from === selected.id ? l.to : l.from);
                    return (
                      <li key={i} className="row between g3">
                        <span className="row g2"><b>{other?.symbol}</b><span className={`link-kind k-${l.kind.toLowerCase()}`}>{l.kind}</span></span>
                        <span className={`t-num ${l.strength >= 0 ? 'edge-pos' : 'edge-neg'}`}>{l.strength.toFixed(2)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}
        </HoloPanel>
      </div>
    </div>
  );
}
