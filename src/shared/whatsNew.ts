/**
 * Temporary "What's New" entries for Hub update summaries.
 * Leave empty until the next real change set — the banner renders nothing.
 *
 * audience: 'staff' = director Today only; 'public' = public home;
 * 'both' = either surface when relevant.
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
    id: '2026-08-13-grouped-alerts',
    date: '2026-08-13',
    title: 'Alerts are grouped by who they apply to',
    audience: 'staff',
    expires: '2026-08-27',
    bullets: [
      'Schedule changes and urgent notices sit under Classes, ensemble, or Everyone headings on home, other public pages, and each ensemble hub.',
      'Each alert stays its own card. If a group has more than three, the rest hide behind Show all until you expand them.',
      'Director Today and ensemble hubs use the same layout so a busy change day stays scannable.',
    ],
  },
];
