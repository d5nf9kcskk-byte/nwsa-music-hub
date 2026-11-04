import type { ReactNode } from 'react';
import type { BadgeKind } from './badgeKind';

/**
 * Instrument badges (#hub2-alive): one drawn icon per family, in a tinted
 * circle, from the approved sketch. Look-only: callers render it under
 * useHub2On(), so the stock site keeps its emoji and dots. Which badge a
 * group or an instrument wears is badgeKind.ts.
 */
const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const ART: Record<BadgeKind, ReactNode> = {
  strings: (
    <g transform="rotate(32 12 12) translate(12 12) scale(.9) translate(-12 -12)">
      <path d="M12 6.3C14.6 6.3 15.8 7.6 15.6 9.4C15.5 10.6 14.4 11.3 14.4 12.3C14.4 13.2 16.6 14 16.4 16.4C16.2 19 14.2 20.4 12 20.4C9.8 20.4 7.8 19 7.6 16.4C7.4 14 9.6 13.2 9.6 12.3C9.6 11.3 8.5 10.6 8.4 9.4C8.2 7.6 9.4 6.3 12 6.3Z" />
      <path d="M12 6.3V2.4M10.6 15.6h2.8M12 8.6v7" />
      <circle cx="12" cy="1.9" r="1" />
    </g>
  ),
  woodwind: (
    <>
      <path d="M6.2 17.8L17.8 6.2" strokeWidth={2.3} />
      <path d="M17.8 6.2l1.9-1.9" />
      <path d="M3.6 20.4l4-1.5-2.5-2.5z" />
      <circle cx="10.2" cy="13.8" r=".85" fill="currentColor" stroke="none" />
      <circle cx="12.3" cy="11.7" r=".85" fill="currentColor" stroke="none" />
      <circle cx="14.4" cy="9.6" r=".85" fill="currentColor" stroke="none" />
    </>
  ),
  brass: (
    <>
      <path d="M2.5 11v2" /><path d="M2.5 12H15" /><path d="M15 10.6l6.2-3v8.8l-6.2-3z" />
      <path d="M6.8 12v3.4h7.4V12" /><path d="M7.6 12V8.2M10.3 12V8.2M13 12V8.2" />
      <path d="M6.9 7.8h1.4M9.6 7.8h1.4M12.3 7.8h1.4" />
    </>
  ),
  percussion: (
    <>
      <ellipse cx="12" cy="10.5" rx="7.5" ry="2.8" />
      <path d="M4.5 10.5v5c0 1.6 3.4 2.9 7.5 2.9s7.5-1.3 7.5-2.9v-5" />
      <path d="M7.6 3.4l3.6 5.2M16.6 3.2l-3.4 5.4" /><path d="M8 13.6v4.4M12 14v4.4M16 13.6v4.4" />
    </>
  ),
  rhythm: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7.5 6v12M12 6v12M16.5 6v12" />
      <rect x="6.3" y="6" width="2.4" height="6.5" rx=".5" fill="currentColor" stroke="none" />
      <rect x="10.8" y="6" width="2.4" height="6.5" rx=".5" fill="currentColor" stroke="none" />
    </>
  ),
  voice: (
    <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0" /><path d="M12 17.5V21M8.5 21h7" /></>
  ),
  class: (
    <><path d="M3 5.5c3-.8 6.2-.3 9 1.8 2.8-2.1 6-2.6 9-1.8v12.6c-3-.8-6.2-.3-9 1.8-2.8-2.1-6-2.6-9-1.8z" /><path d="M12 7.3v12.6" /></>
  ),
  ensemble: (
    <>
      <path d="M6.4 17.6L19.2 4.8" /><circle cx="5.4" cy="18.6" r="1.9" fill="currentColor" stroke="none" />
      <path d="M15.6 2.8c2.6.3 5.3 3 5.6 5.6" /><path d="M14.4 5.4c1.4.3 3.5 2.3 3.8 3.8" />
    </>
  ),
};

export function InstrumentBadge({ kind, size = 'md' }: { kind: BadgeKind; size?: 'sm' | 'md' }) {
  return (
    <span className={`hub2-badge hub2-badge-${kind} hub2-badge-${size}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" {...STROKE}>{ART[kind]}</svg>
    </span>
  );
}
