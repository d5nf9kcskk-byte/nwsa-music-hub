import type { Ensemble, EventType } from '../../director/types';
import { ensembleColor } from '../../director/utils';
import './eventChip.css';

/** Gold is reserved exclusively for concerts, everywhere on the site (#31). */
const CONCERT_GOLD = '#ca8a04';

/**
 * 2–3 letter monogram from an ensemble name's initials:
 * "Symphony Orchestra" → SO, "College Chamber Orchestra" → CCO, "Guitar" → GU.
 */
export function ensembleMonogram(name?: string): string {
  if (!name) return '';
  const words = name
    .split(/[\s\-–—/]+/)
    .filter(w => /[A-Za-z0-9]/.test(w))
    .filter(w => !/^(of|the|and|for|de|la|los|el)$/i.test(w));
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
}

/** "#rrggbb" → rgba() at the given alpha — the low-opacity ensemble tint. */
function tint(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(100, 116, 139, ${alpha})`; // slate fallback
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * One shape per event type, ALWAYS paired with the type word (never
 * color/shape alone): ● Rehearsal, ★ Concert, ◆ Sectional, ■ Event.
 */
function TypeShape({ type }: { type: EventType }) {
  const common = { width: 8, height: 8, viewBox: '0 0 10 10', 'aria-hidden': true };
  switch (type) {
    case 'Rehearsal':
      return <svg {...common}><circle cx="5" cy="5" r="4" fill="currentColor" /></svg>;
    case 'Concert':
      return (
        <svg {...common}>
          <path
            d="M5 0 L6.18 3.38 L9.76 3.45 L6.9 5.62 L7.94 9.05 L5 7 L2.06 9.05 L3.1 5.62 L0.24 3.45 L3.82 3.38 Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'Sectional':
      return <svg {...common}><path d="M5 0.4 L9.6 5 L5 9.6 L0.4 5 Z" fill="currentColor" /></svg>;
    case 'Event':
      return <svg {...common}><rect x="1" y="1" width="8" height="8" rx="1.5" fill="currentColor" /></svg>;
  }
}

/**
 * The one visual identity for an event (#31): ensemble-tinted chip with the
 * ensemble's monogram plus a shape+word pair for the event type.
 */
export function EventChip({ ensemble, type }: { ensemble?: Ensemble; type: EventType }) {
  const base = ensembleColor(ensemble);
  const mono = ensembleMonogram(ensemble?.name);
  return (
    <span
      className="pub-eventchip"
      style={{ background: tint(base, 0.13), borderColor: tint(base, 0.32) }}
      title={ensemble ? `${ensemble.name} · ${type}` : type}
    >
      {mono && <span className="pub-eventchip-mono" style={{ color: base }}>{mono}</span>}
      <span
        className="pub-eventchip-type"
        style={type === 'Concert' ? { color: CONCERT_GOLD } : undefined}
      >
        <TypeShape type={type} /> {type}
      </span>
    </span>
  );
}
