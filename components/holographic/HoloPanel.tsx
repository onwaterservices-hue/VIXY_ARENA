import React from 'react';
import { Brackets } from '../common/Primitives';
import { useSheen } from '../../hooks';

export type PanelGrade = 1 | 2 | 3;

/* The one panel in the product. Grade selects the glass material;
   `active` promotes the holographic treatment; `scan` is reserved
   for surfaces that are genuinely analysing something. */
export function HoloPanel({
  grade = 2, title, eyebrow, actions, footer, scan = false, active = false,
  padded = true, className = '', bodyClassName = '', style, children, as = 'section',
}: {
  grade?: PanelGrade;
  title?: React.ReactNode;
  eyebrow?: string;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  scan?: boolean;
  active?: boolean;
  padded?: boolean;
  className?: string;
  bodyClassName?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  as?: 'section' | 'div' | 'article';
}) {
  const { ref, onPointerMove } = useSheen<HTMLElement>();
  const Tag = as as React.ElementType;
  return (
    <Tag
      ref={ref as React.Ref<HTMLElement>}
      onPointerMove={onPointerMove}
      className={`holo-panel glass-0${active ? 3 : grade} brackets sheen ${active ? 'holo-live' : ''} ${className}`}
      style={style}
    >
      <Brackets />
      {scan && <span className="scan-sweep" />}
      {(title || actions) && (
        <header className="panel-head">
          <div className="col" style={{ gap: 1, minWidth: 0 }}>
            {eyebrow && <span className="t-label">{eyebrow}</span>}
            {typeof title === 'string' ? <h3 className="t-h3">{title}</h3> : title}
          </div>
          {actions && <div className="row g2">{actions}</div>}
        </header>
      )}
      <div className={`${padded ? 'panel-body' : ''} ${bodyClassName}`}>{children}</div>
      {footer && <footer className="panel-foot">{footer}</footer>}
    </Tag>
  );
}
