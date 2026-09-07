import React from 'react';
import { ROUTES } from '../../constants';
import { Icon } from '../common/Icon';
import { DISCORD_INVITE_URL, hasDiscordInvite } from '../../services/auth';

const GROUPS: { key: string; label: string | null }[] = [
  { key: 'ARENA', label: null },
  { key: 'UNIVERSE', label: 'Universe' },
  { key: 'AI SYSTEM', label: 'AI System' },
  { key: 'SYSTEM', label: 'System' },
];

export function NavRail({ route, onNavigate }: { route: string; onNavigate: (id: string) => void }) {
  return (
    <nav className="rail glass-02" aria-label="Primary">
      {GROUPS.map((g, gi) => (
        <div key={g.key} className="rail-group">
          {g.label && <span className="rail-group-label t-nano">{g.label}</span>}
          {gi > 0 && !g.label && <span className="rail-sep" />}
          {ROUTES.filter((r) => r.group === g.key && !r.hidden).map((r) => {
            const active = route === r.id;
            return (
              <button
                key={r.id}
                className={`rail-item tap ${active ? 'is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => onNavigate(r.id)}
                title={r.description}
              >
                <span className="rail-glow" aria-hidden="true" />
                <Icon name={r.icon} size={19} />
                <span className="rail-label">{r.label}</span>
                {active && <span className="rail-edge" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      ))}
      {/* The community, when an invite is configured. A slot, not a promise:
          with no invite the item does not render at all. */}
      {hasDiscordInvite() && (
        <div className="rail-group">
          <a className="rail-item tap" href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer noopener" title="Join the Discord">
            <span className="rail-glow" aria-hidden="true" />
            <Icon name="signals" size={19} />
            <span className="rail-label">Discord</span>
          </a>
        </div>
      )}
    </nav>
  );
}

export function MobileNav({ route, onNavigate, onMore }: {
  route: string; onNavigate: (id: string) => void; onMore: () => void;
}) {
  const primary = ROUTES.filter((r) => r.primary);
  return (
    <nav className="mnav glass-02" aria-label="Primary">
      {primary.map((r) => {
        const active = route === r.id;
        return (
          <button key={r.id} className={`mnav-item tap ${active ? 'is-active' : ''}`}
                  aria-current={active ? 'page' : undefined} onClick={() => onNavigate(r.id)}>
            <Icon name={r.icon} size={19} />
            <span>{r.short ?? r.label}</span>
          </button>
        );
      })}
      <button className="mnav-item tap" onClick={onMore}>
        <Icon name="menu" size={19} />
        <span>More</span>
      </button>
    </nav>
  );
}

export function MoreSheet({ route, onNavigate, onClose }: {
  route: string; onNavigate: (id: string) => void; onClose: () => void;
}) {
  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet glass-03" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="All sections">
        <div className="sheet-grab" />
        <div className="sheet-grid">
          {ROUTES.filter((r) => !r.hidden).map((r) => (
            <button key={r.id} className={`sheet-item glass-01 tap ${route === r.id ? 'is-active' : ''}`}
                    onClick={() => { onNavigate(r.id); onClose(); }}>
              <Icon name={r.icon} size={18} />
              <span className="t-h3">{r.label}</span>
              <span className="t-nano">{r.group}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
