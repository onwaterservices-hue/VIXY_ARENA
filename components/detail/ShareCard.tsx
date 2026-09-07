import React, { useEffect, useRef, useState } from 'react';
import type { CallRecord, CanonicalMarket } from '../../types';
import { Icon } from '../common/Icon';
import { useFocusTrap } from '../../hooks';
import { pct, signedPct } from '../../lib/format';

/* =============================================================
   RECEIPT — "CALL IT. PROVE IT."
   -------------------------------------------------------------
   A 1080x1920 record of one call, drawn to canvas so it exports
   as a real image. It carries the DEMO stamp for as long as the
   data provider is the simulator; a receipt that could be
   mistaken for a real market claim is not shippable.
   ============================================================= */

const W = 1080;
const H = 1920;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export function ShareCard({ record, origin, market, onClose }: {
  record: CallRecord; origin: 'DEMO' | 'LIVE'; market?: CanonicalMarket | null; onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const trapRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    /* ---- ground ---- */
    ctx.fillStyle = '#04050b';
    ctx.fillRect(0, 0, W, H);

    const glow = ctx.createRadialGradient(W * 0.5, H * 0.30, 40, W * 0.5, H * 0.30, W * 0.95);
    glow.addColorStop(0, 'rgba(138,92,255,0.34)');
    glow.addColorStop(0.45, 'rgba(61,123,255,0.10)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(120,140,255,0.055)';
    ctx.lineWidth = 1;
    for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }

    const mono = '"SF Mono", ui-monospace, Menlo, monospace';
    const sans = '-apple-system, "SF Pro Display", "Inter", system-ui, sans-serif';

    /* ---- mark ---- */
    ctx.save();
    ctx.translate(96, 150);
    ctx.strokeStyle = 'rgba(177,140,255,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, 46, 20, -0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.ellipse(0, 0, 46, 20, 0.8, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#b18cff';
    ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-22, -20); ctx.lineTo(0, 20); ctx.lineTo(22, -20); ctx.stroke();
    ctx.fillStyle = '#37e4f5';
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#eaebff';
    ctx.font = `700 42px ${sans}`;
    ctx.fillText('VIXY', 160, 138);
    ctx.fillStyle = '#b18cff';
    ctx.font = `200 42px ${sans}`;
    ctx.fillText('ARENA', 262, 138);
    ctx.fillStyle = '#5f6590';
    ctx.font = `500 18px ${mono}`;
    ctx.fillText('P R E D I C T I O N   I N T E L L I G E N C E', 162, 172);

    /* ---- kicker ---- */
    ctx.fillStyle = '#eaebff';
    ctx.font = `700 96px ${sans}`;
    ctx.fillText('CALL IT.', 96, 372);
    const grad = ctx.createLinearGradient(96, 400, 700, 480);
    grad.addColorStop(0, '#b18cff');
    grad.addColorStop(1, '#37e4f5');
    ctx.fillStyle = grad;
    ctx.fillText('PROVE IT.', 96, 476);

    /* ---- panel ---- */
    const px = 80, py = 540, pw = W - 160, ph = 960;
    const panel = ctx.createLinearGradient(px, py, px, py + ph);
    panel.addColorStop(0, 'rgba(30,36,74,0.72)');
    panel.addColorStop(1, 'rgba(10,14,32,0.86)');
    ctx.fillStyle = panel;
    roundRect(ctx, px, py, pw, ph, 34);
    ctx.fill();
    ctx.strokeStyle = 'rgba(138,92,255,0.38)';
    ctx.lineWidth = 2;
    ctx.stroke();

    /* corner brackets */
    ctx.strokeStyle = 'rgba(177,140,255,0.75)';
    ctx.lineWidth = 3;
    const b = 34;
    [[px, py, 1, 1], [px + pw, py, -1, 1], [px, py + ph, 1, -1], [px + pw, py + ph, -1, -1]].forEach(([x, y, sx, sy]) => {
      ctx.beginPath();
      ctx.moveTo(x + sx * b, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * b);
      ctx.stroke();
    });

    /* ---- market ---- */
    ctx.fillStyle = '#5f6590';
    ctx.font = `500 20px ${mono}`;
    ctx.fillText('M A R K E T', px + 56, py + 84);

    ctx.fillStyle = '#eaebff';
    ctx.font = `600 46px ${sans}`;
    const lines = wrap(ctx, record.market, pw - 112).slice(0, 3);
    lines.forEach((l, i) => ctx.fillText(l, px + 56, py + 152 + i * 58));

    const afterTitle = py + 152 + lines.length * 58;

    /* ---- direction ---- */
    const dirColor = record.direction === 'YES' ? '#2be8a5' : record.direction === 'NO' ? '#ff5470' : '#7d84b0';
    ctx.strokeStyle = dirColor;
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 2;
    roundRect(ctx, px + 56, afterTitle + 20, 190, 76, 12);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = dirColor;
    ctx.font = `700 44px ${sans}`;
    ctx.fillText(record.direction, px + 88, afterTitle + 74);

    ctx.fillStyle = '#5f6590';
    ctx.font = `500 20px ${mono}`;
    ctx.fillText('S T A K E', px + 288, afterTitle + 48);
    ctx.fillStyle = '#eaebff';
    ctx.font = `600 38px ${mono}`;
    ctx.fillText(`${record.stakePoints} pts`, px + 288, afterTitle + 90);

    /* ---- numbers ---- */
    const ny = afterTitle + 190;
    const cols = [
      { label: 'M A R K E T', value: pct(record.entryBps), color: '#eaebff' },
      { label: 'V I X Y', value: pct(record.vixyBps), color: '#b18cff' },
      { label: 'E D G E', value: signedPct(record.edgeBps), color: record.edgeBps >= 0 ? '#2be8a5' : '#ff5470' },
    ];
    cols.forEach((c, i) => {
      const x = px + 56 + i * ((pw - 112) / 3);
      ctx.fillStyle = '#5f6590';
      ctx.font = `500 20px ${mono}`;
      ctx.fillText(c.label, x, ny);
      ctx.fillStyle = c.color;
      ctx.font = `700 62px ${mono}`;
      ctx.fillText(c.value, x, ny + 74);
    });

    /* ---- ladder ---- */
    const ly = ny + 120;
    const lw = pw - 112;
    ctx.fillStyle = 'rgba(160,172,255,0.14)';
    roundRect(ctx, px + 56, ly, lw, 14, 7);
    ctx.fill();
    for (let i = 0; i <= 10; i++) {
      ctx.fillStyle = i % 5 === 0 ? 'rgba(160,172,255,0.35)' : 'rgba(160,172,255,0.16)';
      ctx.fillRect(px + 56 + (lw * i) / 10, ly - 6, 2, i % 5 === 0 ? 26 : 14);
    }
    const mX = px + 56 + (record.entryBps / 10000) * lw;
    const vX = px + 56 + (record.vixyBps / 10000) * lw;
    const bandGrad = ctx.createLinearGradient(Math.min(mX, vX), 0, Math.max(mX, vX), 0);
    if (record.edgeBps >= 0) { bandGrad.addColorStop(0, 'rgba(43,232,165,0.9)'); bandGrad.addColorStop(1, 'rgba(55,228,245,0.9)'); }
    else { bandGrad.addColorStop(0, 'rgba(255,84,112,0.9)'); bandGrad.addColorStop(1, 'rgba(255,176,32,0.9)'); }
    ctx.fillStyle = bandGrad;
    roundRect(ctx, Math.min(mX, vX), ly, Math.max(5, Math.abs(vX - mX)), 14, 7);
    ctx.fill();
    ctx.fillStyle = '#eaebff';
    ctx.fillRect(mX - 2, ly - 14, 4, 42);
    ctx.fillStyle = '#b18cff';
    ctx.fillRect(vX - 3, ly - 14, 6, 42);
    /* ---- proof chart ---- */
    const panelBottom = py + ph;
    const cy0 = ly + 92;
    const chH = Math.max(110, Math.min(200, panelBottom - cy0 - 132));
    const chW = pw - 112;
    const mkt = market?.series ?? [];
    const vxy = market?.vixySeries ?? [];
    const n = Math.min(mkt.length, vxy.length);
    ctx.fillStyle = '#5f6590';
    ctx.font = `500 20px ${mono}`;
    ctx.fillText('T R A I L I N G   W I N D O W', px + 56, cy0 - 12);

    if (n >= 2) {
      const all = [...mkt.slice(-n), ...vxy.slice(-n)];
      const lo = Math.max(0, Math.min(...all) - 240);
      const hi = Math.min(10000, Math.max(...all) + 240);
      const span = Math.max(1, hi - lo);
      const X = (i: number) => px + 56 + (i / (n - 1)) * chW;
      const Y = (v: number) => cy0 + chH - ((v - lo) / span) * chH;

      ctx.strokeStyle = 'rgba(160,172,255,0.10)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 3; i++) {
        const y = cy0 + (chH * i) / 3;
        ctx.beginPath(); ctx.moveTo(px + 56, y); ctx.lineTo(px + 56 + chW, y); ctx.stroke();
      }

      // edge band
      ctx.beginPath();
      mkt.slice(-n).forEach((v, i) => (i === 0 ? ctx.moveTo(X(i), Y(v)) : ctx.lineTo(X(i), Y(v))));
      for (let i = n - 1; i >= 0; i--) ctx.lineTo(X(i), Y(vxy.slice(-n)[i]));
      ctx.closePath();
      ctx.fillStyle = record.edgeBps >= 0 ? 'rgba(43,232,165,0.16)' : 'rgba(255,84,112,0.16)';
      ctx.fill();

      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = '#eaebff'; ctx.lineWidth = 3;
      ctx.beginPath();
      mkt.slice(-n).forEach((v, i) => (i === 0 ? ctx.moveTo(X(i), Y(v)) : ctx.lineTo(X(i), Y(v))));
      ctx.stroke();
      ctx.strokeStyle = '#b18cff'; ctx.lineWidth = 4;
      ctx.beginPath();
      vxy.slice(-n).forEach((v, i) => (i === 0 ? ctx.moveTo(X(i), Y(v)) : ctx.lineTo(X(i), Y(v))));
      ctx.stroke();
      ctx.fillStyle = '#b18cff';
      ctx.beginPath(); ctx.arc(X(n - 1), Y(vxy.slice(-n)[n - 1]), 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#eaebff';
      ctx.beginPath(); ctx.arc(X(n - 1), Y(mkt.slice(-n)[n - 1]), 7, 0, Math.PI * 2); ctx.fill();
    }

    /* ---- state ---- */
    const sy = cy0 + chH + 62;
    const stateColor = record.state === 'SETTLED'
      ? (record.result === 'WON' ? '#2be8a5' : '#ff5470')
      : record.state === 'LOCKED' ? '#b18cff' : '#37e4f5';
    ctx.fillStyle = '#5f6590';
    ctx.font = `500 20px ${mono}`;
    ctx.fillText('S T A T E', px + 56, sy);
    ctx.fillStyle = stateColor;
    ctx.font = `700 40px ${mono}`;
    ctx.fillText(record.result ? `${record.state} · ${record.result}` : record.state, px + 56, sy + 52);

    if (market?.confidenceBps != null) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#5f6590';
      ctx.font = `500 20px ${mono}`;
      ctx.fillText('C O N F I D E N C E', px + pw - 56, sy);
      ctx.fillStyle = '#37e4f5';
      ctx.font = `700 40px ${mono}`;
      ctx.fillText(pct(market.confidenceBps, 0), px + pw - 56, sy + 52);
      ctx.textAlign = 'left';
    }

    /* ---- tagline ---- */
    const ty = py + ph + 96;
    ctx.strokeStyle = 'rgba(160,172,255,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(96, ty - 52); ctx.lineTo(W - 96, ty - 52); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9aa0cc';
    ctx.font = `600 40px ${sans}`;
    ctx.fillText('CLIMB THE ARENA', W / 2, ty + 8);
    ctx.fillStyle = '#5f6590';
    ctx.font = `500 22px ${mono}`;
    ctx.fillText('M A R K E T   P R O B A B I L I T Y   ·   V I X Y   P R O B A B I L I T Y   ·   E D G E', W / 2, ty + 54);
    ctx.textAlign = 'left';

    /* ---- footer ---- */
    ctx.fillStyle = '#5f6590';
    ctx.font = `500 22px ${mono}`;
    ctx.fillText(record.id, 96, H - 168);
    ctx.fillText(new Date(record.openedAt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC', 96, H - 128);

    if (origin === 'DEMO') {
      ctx.strokeStyle = 'rgba(255,176,32,0.6)';
      ctx.fillStyle = 'rgba(255,176,32,0.12)';
      ctx.lineWidth = 2;
      roundRect(ctx, 96, H - 96, 460, 56, 10);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffb020';
      ctx.font = `600 24px ${mono}`;
      ctx.fillText('DEMO DATA · NOT MARKET INTELLIGENCE', 122, H - 58);
    }

    ctx.fillStyle = '#3f4468';
    ctx.font = `500 22px ${mono}`;
    ctx.textAlign = 'right';
    ctx.fillText('VIXY ARENA', W - 96, H - 128);
    ctx.textAlign = 'left';

    try { setUrl(c.toDataURL('image/png')); } catch { setUrl(null); }
  }, [record, origin, market]);

  return (
    <div className="sheet-scrim modal-scrim" onClick={onClose}>
      <div ref={trapRef} className="share glass-03" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Call receipt">
        <header className="row between g3">
          <div className="col" style={{ gap: 2 }}>
            <span className="t-label">Receipt</span>
            <h3 className="t-h2">Call it. Prove it.</h3>
          </div>
          <button className="icon-btn tap" onClick={onClose} aria-label="Close"><Icon name="close" size={15} /></button>
        </header>

        <div className="share-frame">
          <canvas ref={canvasRef} width={W} height={H} className="share-canvas" role="img"
                  aria-label={`Receipt for ${record.market}: called ${record.direction} at ${pct(record.entryBps)}, `
                    + `VIXY ${pct(record.vixyBps)}, edge ${signedPct(record.edgeBps)}, state ${record.state}`
                    + `${origin === 'DEMO' ? '. Demo data.' : ''}`} />
        </div>

        <div className="row g3">
          {url && (
            <a className="btn btn-primary tap grow" href={url} download={`vixy-arena-${record.id}.png`}>
              <Icon name="arrowDown" size={15} />Download PNG
            </a>
          )}
          <button className="btn tap" onClick={onClose}>Close</button>
        </div>
        <p className="t-nano">1080 × 1920 · sized for a vertical feed</p>
      </div>
    </div>
  );
}
