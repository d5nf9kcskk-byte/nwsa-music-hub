/**
 * Temporary "What's New" entries for Hub update summaries.
 * Leave empty when there is nothing new — the banner renders nothing.
 *
 * audience: 'staff' = director Today only; 'public' = public home;
 * 'both' = either surface when relevant.
 *
 * Agents: when shipping Hub changes, follow `.cursor/rules/whats-new.mdc`
 * and update this file in the same commit when the rule says to.
 */
export type WhatsNewAudience = 'staff' | 'public' | 'both';

export interface WhatsNewEntry {
  /** Stable id for localStorage dismiss (bump when re-showing the same topic). */
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  bullets: string[];
  audience: WhatsNewAudience;
  /** Optional: hide after this date (inclusive). */
  expires?: string;
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: '2026-08-13-piece-picker-cross-ensemble',
    date: '2026-08-13',
    title: 'Any orchestra piece on any rehearsal',
    audience: 'staff',
    expires: '2026-08-27',
    bullets: [
      'When linking repertoire to a rehearsal or concert, that ensemble’s pieces still appear first.',
      'Search the piece field to add any other library piece (for example Nutcracker on a Camerata strings rehearsal).',
      'Cross-ensemble picks show the piece’s home ensemble name so you can tell where it lives in the library.',
    ],
  },
  {
    id: '2026-08-13-event-detail-clarity',
    date: '2026-08-13',
    title: 'Opening a rehearsal or class card stays focused',
    audience: 'both',
    expires: '2026-08-27',
    bullets: [
      'Tap a rehearsal, class, or event card and you land on that item only: a clear “Rehearsal / Class / Event information” heading, then time, place, and notes.',
      'Site-wide schedule alerts and urgent notices stay on Home, Calendar, and each ensemble page — not stacked on every detail page.',
      'Alerts on those overview pages are grouped under Classes, ensemble, or Everyone, with Show all when a group is long.',
      'Linked repertoire on a rehearsal or concert lists each movement on its own line, so you can see exactly what is planned.',
      'Get directions only appears when the event has a full street address, not for campus room numbers.',
    ],
  },
];
