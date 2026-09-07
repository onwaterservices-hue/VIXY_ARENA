/* Presentation-only formatting. Pure functions of server values.
   No rule here changes meaning — formatting never computes truth. */

import type { Bps, FeedStatus } from '../types';

export const pct = (b: Bps | null, digits = 1): string =>
  b === null || Number.isNaN(b) ? '—' : `${(b / 100).toFixed(digits)}%`;


export const signedPct = (b: Bps | null, digits = 1): string =>
  b === null ? '—' : `${b > 0 ? '+' : b < 0 ? '−' : ''}${Math.abs(b / 100).toFixed(digits)}%`;

export const signedNum = (n: number): string => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;

export const ratio = (b: Bps | null): number => (b === null ? 0 : Math.max(0, Math.min(1, b / 10000)));

export function relTime(iso: string, now = Date.now()): string {
  const d = Math.max(0, now - new Date(iso).getTime());
  if (d < 1000) return 'now';
  if (d < 60_000) return `${Math.floor(d / 1000)}s ago`;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

export function untilTime(iso: string, now = Date.now()): string {
  const d = new Date(iso).getTime() - now;
  if (d <= 0) return 'closed';
  const m = Math.floor(d / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function clockUTC(now = new Date()): string {
  return `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(
    now.getUTCSeconds(),
  ).padStart(2, '0')} UTC`;
}

export const compact = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`
  : `${n}`;

export const statusClass = (s: FeedStatus): string =>
  s === 'LIVE' ? 'pill-live'
  : s === 'DEGRADED' ? 'pill-degrade'
  : s === 'STALE' ? 'pill-stale'
  : s === 'OFFLINE' ? 'pill-offline'
  : 'pill-unknown';

/** Edge direction colour token name. Meaning, not decoration. */
export const edgeTone = (b: Bps | null): 'edge' | 'risk' | 'neutral' =>
  b === null ? 'neutral' : b >= 120 ? 'edge' : b <= -120 ? 'risk' : 'neutral';

/* Money, formatted from the two values a payment provider gives us and
   nothing else: an integer in the currency's minor unit, and an ISO 4217
   code. No currency symbol, divisor or price is written here — Intl knows
   the conventions, and the backend owns the number. */
export function money(minor: number | null, currency: string | null): string {
  if (minor === null || currency === null || !Number.isFinite(minor)) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency,
      minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    }).format(minor / 100);
  } catch {
    /* An unknown currency code is the backend's problem to fix, not a
       reason for the screen to guess at a symbol. */
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}
