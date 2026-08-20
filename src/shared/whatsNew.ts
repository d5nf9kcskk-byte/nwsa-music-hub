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
import { ORG } from '../org';

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
  // Fixed: Class (Theory, etc.) events couldn't be saved at all — the Save
  // button silently disabled itself because Classes have no ensemble
  // attached by design. Directors need to know Cancel now works.
  {
    id: '2026-08-20-class-status-save-fix',
    date: '2026-08-20',
    title: 'Fixed: saving changes to a Class (Theory, etc.) event',
    audience: 'staff',
    expires: '2026-09-03',
    bullets: [
      'Editing a Class event — marking it Cancelled, changing the time, anything — now saves. It used to silently refuse to save because Classes don\'t have an ensemble attached.',
      'A cancelled class shows a "cancelled today" banner on the public calendar only on the day it happens — not before, not after.',
    ],
  },
  // Sign-ups (#signups): interest + paperwork + signature in one place, so a
  // director stops running collect-names → email-the-file → chase-the-file
  // by hand.
  {
    id: '2026-08-20-signups',
    date: '2026-08-20',
    title: 'Sign-ups: say yes and fill out the form in one place',
    audience: 'both',
    expires: '2026-09-03',
    bullets: [
      'When your director opens a sign-up — All-State auditions, a trip, anything — it shows up on the Hub home page and on your own schedule page.',
      'Tap it, find your name, confirm the grade you are in, answer whatever your director asked, and sign by typing your name. That is the whole thing.',
      'Directors: Sign-ups is a new section in the Director Panel. Aim one at an ensemble and, if you want, only its strings, winds, brass, or percussion.',
      'You get the names and grades in one tap to copy, a spreadsheet, printable signed forms you can save as a PDF, one email to everyone who signed up, and a list of who has not answered yet.',
    ],
  },
  // Appearance + iOS recording fixes. Deliberately says nothing about whether
  // a submission SENDS — that path is still being verified against the
  // Storage rules; only claims what these fixes actually restore.
  {
    id: '2026-08-20-scroll-and-ios-recording',
    date: '2026-08-20',
    title: 'Two fixes: scrolling colors and recording on iPhone/iPad',
    audience: 'both',
    expires: '2026-09-03',
    bullets: [
      'Scrolling quickly no longer flashes a dark background behind the page — the Hub stays in the appearance you picked.',
      'Recording a video assignment on an iPhone or iPad now plays back properly when you watch your take back before sending it.',
    ],
  },
  // Calendar subscribe + video submissions round (#subscribe-any-view,
  // #video-submissions): filter-view feeds, repertoire in calendar notes,
  // classes out of ensemble views, and a real record → watch → submit flow.
  {
    id: '2026-08-17-subscribe-any-view',
    date: '2026-08-17',
    title: 'Subscribe to any calendar view — and a fixed video submit',
    audience: 'both',
    expires: '2026-08-31',
    bullets: [
      'Subscribe now works for whatever the calendar is showing — any mix of ensembles and event types, not just one at a time. Pick the ensembles and categories you care about, subscribe once, and your phone calendar keeps itself up to date.',
      'Repertoire shows up in the notes of synced calendar events, including pieces linked from the Repertoire page.',
      'Filtering to an ensemble no longer mixes in academic classes; pick "Classes" in the type filter when you want them.',
      'Video assignments: the camera preview works, you can watch your take back before sending it, and there is a Submit button — nothing uploads until you press it.',
    ],
  },
  // Student page links were re-keyed on 2026-08-17 (#privacy: doc IDs no
  // longer expose school Student IDs), which reset saved schedules and
  // personal calendar subscriptions made before that date.
  {
    id: '2026-08-17-schedule-links-reset',
    date: '2026-08-17',
    title: 'Pick your schedule again (one-time reset)',
    audience: 'public',
    expires: '2026-08-31',
    bullets: [
      'We changed how student schedule pages are linked behind the scenes to better protect student information.',
      'If your saved schedule or a bookmarked link stopped working, open Find My Schedule and pick your name once — saving works the same as before.',
      'If you subscribed to a personal calendar feed, re-subscribe from your schedule page so it keeps updating.',
    ],
  },
  // Contact form + Messages inbox (#parent-messages) — only shown for orgs
  // with the feature enabled (NWSA ships with contactForm: false, so this
  // entry is invisible there until the director opts in).
  ...(ORG.features.contactForm ? [{
    id: '2026-08-15-parent-messages',
    date: '2026-08-15',
    title: 'Families can message the staff from the site',
    audience: 'both' as const,
    expires: '2026-08-29',
    bullets: [
      'New Contact Us page on the public site: name, email, topic, and message — no account needed.',
      'Staff see every message in the new Messages inbox (Library group), with an unread badge and one-tap email reply.',
      'Messages are only visible to staff.',
    ],
  }] : []),
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
  {
    id: '2026-08-14-roster-live-v2',
    date: '2026-08-14',
    title: 'Find your name and your schedule',
    audience: 'both',
    expires: '2026-08-28',
    bullets: [
      'Search your name on Home to open your personal schedule, including ensembles and theory class by grade.',
      'Ensemble pages list members. Public records show name, instrument, and grade; contact details stay on the director side.',
      'Parents can remember more than one student on a phone. Teachers (or anyone) can tap Find a different student, then Stop remembering on this device, to clear it.',
    ],
  },
  {
    id: '2026-08-14-public-calendar-window-v2',
    date: '2026-08-14',
    title: 'Public site loads the calendar in a window',
    audience: 'staff',
    expires: '2026-08-28',
    bullets: [
      'Every public page used to load the entire school year of rehearsals and classes, which ran the site out of its daily database allowance most mornings.',
      'Public pages now load about a week back and six weeks ahead. Paging to another month on the calendar loads that month on the spot, so nothing is lost.',
      'Concerts and school calendar dates still load for the whole year everywhere, so the Concerts page, repertoire links, and programs are unchanged.',
      'The director side is untouched: you still see the full year.',
      'Calendar subscription links (Add to Calendar) are working again. They went briefly dead this morning when the same allowance stopped the feed files from being built.',
    ],
  },
];
