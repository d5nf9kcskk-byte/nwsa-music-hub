/**
 * Temporary "What's New" entries for Hub update summaries.
 * Leave empty when there is nothing new — the banner renders nothing.
 *
 * audience: 'staff' = director Today only; 'public' = public home;
 * 'both' = either surface when relevant.
 *
 * Launch day 2026-08-13: keep the PUBLIC home clean (no public/both entries
 * dated today). Staff-only tips are fine. From 2026-08-14 onward, public
 * entries may ship again per `.cursor/rules/whats-new.mdc`.
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
    id: '2026-08-13-office-bulletin-roll',
    date: '2026-08-13',
    title: 'Office attendance on Take Roll',
    audience: 'staff',
    expires: '2026-08-27',
    bullets: [
      'The daily school Attendance Bulletin can mark music students Absent / Late / Excused with an Office badge (other departments are ignored).',
      'Your own taps still win. Ambiguous names show under Who’s Out for a quick check.',
      'Cloud ingest starts in dry-run; see docs/ATTENDANCE-BULLETIN.md to flip it on.',
    ],
  },
  {
    id: '2026-08-13-easter-eggs-batch2',
    date: '2026-08-13',
    title: 'Hidden musical delights (staff map)',
    audience: 'staff',
    expires: '2026-08-27',
    bullets: [
      'Students can find quiet easter eggs on the public site; this tip is only for directors so you know what is there.',
      'Text ribbons: first day of school, last day before break, Monday morning, Friday after 3, empty Who’s Out, subscribe footer, all-clear extra line, roster-of-one.',
      'One-time toasts: first Dark mode → “notturno”; first switch to ES → bilingual tip.',
      'Taps: hold Home hero (fermata), long-press empty calendar day, double-tap month title, pinch calendar, filter ens→type→ens→type, triple-tap ensemble title, 4× your name on My Schedule, double-tap a cancelled banner, 3× Announcements title (p/mf/ff), 5× DIRECTOR PANEL strip.',
    ],
  },
  {
    id: '2026-08-13-launch-flyer',
    date: '2026-08-13',
    title: 'Campus launch flyer ready to print',
    audience: 'staff',
    expires: '2026-08-27',
    bullets: [
      'Director → QR kit now opens with a bright one-page “Music Hub is here” flyer (logo, big QR, full URL).',
      'Or open hub-launch-flyer.html on the public site and tap Print flyer for a single letter page to post around campus.',
    ],
  },
  {
    id: '2026-08-13-choir-blocks',
    date: '2026-08-13',
    title: 'Choir block times are staggered from instrumental',
    audience: 'staff',
    expires: '2026-08-27',
    bullets: [
      'Choir Block 1 is 1:10–2:15 and Block 2 is 2:25–3:45, so bathroom breaks do not line up with instrumental.',
      'That clock applies to HS Choir, Vocal Lit, Vocal Forum, and Theory (9th and 10th).',
      'Instrumental ensembles and Jazz Theory / Music History stay on 1:10–2:25 and 2:30–3:45.',
    ],
  },
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
    audience: 'staff',
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
