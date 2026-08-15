#!/usr/bin/env node
/**
 * seed-demo-org.mjs — ASYO demo sandbox seeder (#org-config).
 *
 * Populates the asyo-hub-demo Firebase project with a complete, FICTIONAL
 * demo season for the Alpharetta Symphony Youth Orchestra: ensembles,
 * students (+ public mirrors per src/director/publicMirror.ts), a season of
 * rehearsals and concerts pinned relative to "today" (so Today/Now-Next are
 * always alive in a demo), repertoire, announcements, documents, planned
 * absences, and parent messages.
 *
 * SAFETY: hard-aborts unless the service account's project is exactly
 * `asyo-hub-demo` — this script must be physically unable to touch the NWSA
 * production project. Every student is fictional; per CLAUDE.md, real
 * student data never goes in any seed.
 *
 * Idempotent: fixed doc ids + set() overwrite, so re-running resets the
 * sandbox to a clean demo state (extra docs demo users created are left
 * alone). When ASYO sends real season dates/programs, edit the arrays below
 * and re-run.
 *
 * Run:
 *   FIREBASE_SERVICE_ACCOUNT_JSON="$(cat asyo-hub-demo-key.json)" \
 *     node scripts/seed-demo-org.mjs
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const DEMO_PROJECT_ID = 'asyo-hub-demo';

const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!SERVICE_ACCOUNT_JSON) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON not set — aborting.');
  process.exit(1);
}
let serviceAccount;
try {
  serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON);
} catch {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON — aborting.');
  process.exit(1);
}
if (serviceAccount.project_id !== DEMO_PROJECT_ID) {
  console.error(
    `REFUSING to run: service account is for "${serviceAccount.project_id}", `
    + `and this script only ever seeds "${DEMO_PROJECT_ID}". `
    + 'Never point demo seeds at a production project.',
  );
  process.exit(1);
}

if (getApps().length === 0) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

/** YYYY-MM-DD, offsetDays from today (local time). */
function iso(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
/** Next date ≥ today+minOffset that falls on `weekday` (0=Sun). */
function nextWeekday(weekday, minOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + minOffset);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  return d;
}
function isoOf(date) { return date.toISOString().slice(0, 10); }

// ── Directors ──────────────────────────────────────────────────────────────
// Owner = Grant; the ASYO administrator + music director get added from the
// in-app Directors screen after first sign-in (self-service, no redeploy).
const DIRECTORS = [
  { email: 'ggmuze@yahoo.com', role: 'owner', name: 'Grant (Owner)' },
];

// ── Ensembles (mirrors ASYO's real program structure; colors are demo brand) ─
const ENSEMBLES = [
  { id: 'youth-symphony', name: 'Youth Symphony', order: 1, color: '#1d3a6b', defaultLocation: 'Main Rehearsal Hall', conductorName: 'Music Director' },
  { id: 'philharmonia', name: 'Youth Philharmonia', order: 2, color: '#7a2d3d', defaultLocation: 'Rehearsal Room B', conductorName: 'Philharmonia Conductor' },
  { id: 'prelude-strings', name: 'Prelude Strings', order: 3, color: '#2d6a4f', defaultLocation: 'Rehearsal Room C', conductorName: 'Prelude Director' },
  { id: 'chamber-ensembles', name: 'Chamber Ensembles', order: 4, color: '#b07d2a', defaultLocation: 'Chamber Room' },
];

// ── Students — ALL FICTIONAL (26, grades 6–12, strings-heavy like a youth
//    orchestra; winds/brass/percussion in the top two groups) ───────────────
const S = (id, name, instrument, section, grade, ensembleIds) =>
  ({ id, name, instrument, section, grade, status: 'Active', ensembleIds });
const STUDENTS = [
  // Youth Symphony (advanced, gr 9–12)
  S('asyo-s01', 'Whitfield, Clara', 'Violin', 'Violin I', '12th', ['youth-symphony', 'chamber-ensembles']),
  S('asyo-s02', 'Okafor, Daniel', 'Violin', 'Violin I', '11th', ['youth-symphony']),
  S('asyo-s03', 'Marsh, Evelyn', 'Violin', 'Violin II', '10th', ['youth-symphony']),
  S('asyo-s04', 'Tran, Julian', 'Viola', 'Viola', '11th', ['youth-symphony', 'chamber-ensembles']),
  S('asyo-s05', 'Beaumont, Alice', 'Cello', 'Cello', '12th', ['youth-symphony', 'chamber-ensembles']),
  S('asyo-s06', 'Rowan, Theodore', 'Double Bass', 'Bass', '10th', ['youth-symphony']),
  S('asyo-s07', 'Kessler, Naomi', 'Flute', 'Woodwinds', '11th', ['youth-symphony']),
  S('asyo-s08', 'Ibarra, Lucas', 'Oboe', 'Woodwinds', '12th', ['youth-symphony']),
  S('asyo-s09', 'Novak, Priya', 'Clarinet', 'Woodwinds', '10th', ['youth-symphony']),
  S('asyo-s10', 'Sandoval, Henry', 'Bassoon', 'Woodwinds', '11th', ['youth-symphony']),
  S('asyo-s11', 'Ferris, Amara', 'Horn', 'Brass', '12th', ['youth-symphony']),
  S('asyo-s12', 'Leblanc, Owen', 'Trumpet', 'Brass', '9th', ['youth-symphony']),
  S('asyo-s13', 'Draper, Mina', 'Trombone', 'Brass', '10th', ['youth-symphony']),
  S('asyo-s14', 'Castellanos, Riley', 'Percussion', 'Percussion', '9th', ['youth-symphony']),
  // Philharmonia (intermediate, gr 8–10)
  S('asyo-s15', 'Adeyemi, Zoe', 'Violin', 'Violin I', '9th', ['philharmonia']),
  S('asyo-s16', 'Pruitt, Caleb', 'Violin', 'Violin II', '8th', ['philharmonia']),
  S('asyo-s17', 'Nakamura, Elise', 'Viola', 'Viola', '9th', ['philharmonia']),
  S('asyo-s18', 'Holloway, Miles', 'Cello', 'Cello', '8th', ['philharmonia']),
  S('asyo-s19', 'Vargas, Imogen', 'Flute', 'Woodwinds', '10th', ['philharmonia']),
  S('asyo-s20', 'Sterling, Jonah', 'Clarinet', 'Woodwinds', '8th', ['philharmonia']),
  S('asyo-s21', 'Whitaker, Rosa', 'Trumpet', 'Brass', '9th', ['philharmonia']),
  // Prelude Strings (beginning, gr 6–8)
  S('asyo-s22', 'Emerson, Lily', 'Violin', 'Violin', '6th', ['prelude-strings']),
  S('asyo-s23', 'Osei, Nathan', 'Violin', 'Violin', '7th', ['prelude-strings']),
  S('asyo-s24', 'Calloway, Grace', 'Viola', 'Viola', '7th', ['prelude-strings']),
  S('asyo-s25', 'Lindqvist, Sam', 'Cello', 'Cello', '6th', ['prelude-strings']),
  S('asyo-s26', 'Moreau, Ivy', 'Double Bass', 'Bass', '8th', ['prelude-strings']),
];

// Public-projection field contract — keep in lockstep with
// src/director/publicMirror.ts (name, preferredName, instrument, section,
// ensembleIds, status, grade; NEVER pronunciation/contacts).
function publicStudentFields(stu) {
  const out = {};
  for (const k of ['name', 'preferredName', 'instrument', 'section', 'ensembleIds', 'status', 'grade']) {
    if (stu[k] !== undefined) out[k] = stu[k];
  }
  return out;
}

// ── Repertoire (public domain; program notes demo the printed program).
//    parts links are deliberately ABSENT — those come from the org's own
//    engraving/library workflow (.cursor/rules/repertoire-ai.mdc). ─────────
const PIECES = [
  {
    id: 'asyo-dvorak8', ensembleIds: ['youth-symphony'], order: 1,
    title: 'Symphony No. 8 — Finale',
    fullTitle: 'Symphony No. 8 in G major, Op. 88 — IV. Allegro ma non troppo',
    composer: 'Antonín Dvořák', composerDates: '1841–1904', catalogNumber: 'Op. 88',
    year: '1889', duration: 10, instrumentation: '2 2 2 2 — 4 2 2 1 — timp — str',
    movements: [{ title: 'Allegro ma non troppo', duration: 10 }],
    programNotes: 'A trumpet fanfare opens a set of variations that swing from village-band cheer to full-orchestra blaze — Dvořák at his sunniest.',
    imslpUrl: 'https://imslp.org/wiki/Symphony_No.8,_Op.88_(Dvořák,_Antonín)',
  },
  {
    id: 'asyo-peergynt', ensembleIds: ['youth-symphony'], order: 2,
    title: 'Peer Gynt Suite No. 1',
    fullTitle: 'Peer Gynt Suite No. 1, Op. 46',
    composer: 'Edvard Grieg', composerDates: '1843–1907', catalogNumber: 'Op. 46',
    year: '1888', duration: 15,
    movements: [
      { title: 'Morning Mood', duration: 4 },
      { title: 'The Death of Åse', duration: 5 },
      { title: 'Anitra’s Dance', duration: 3 },
      { title: 'In the Hall of the Mountain King', duration: 3 },
    ],
    programNotes: 'Four scenes from Ibsen’s play, ending in the most famous accelerando in orchestral music.',
    imslpUrl: 'https://imslp.org/wiki/Peer_Gynt_Suite_No.1,_Op.46_(Grieg,_Edvard)',
  },
  {
    id: 'asyo-hungarian5', ensembleIds: ['philharmonia'], order: 1,
    title: 'Hungarian Dance No. 5',
    composer: 'Johannes Brahms', composerDates: '1833–1897', year: '1869', duration: 3,
    programNotes: 'Brahms heard this fire in the café orchestras of Vienna — every tempo change is a dare.',
  },
  {
    id: 'asyo-barber-strings', ensembleIds: ['prelude-strings'], order: 1,
    title: 'Simple Gifts (arr. strings)',
    composer: 'Traditional Shaker melody', year: '1848', duration: 4,
    programNotes: 'The Shaker hymn Copland made famous — our newest musicians’ first full-ensemble piece.',
  },
  {
    id: 'asyo-rossini', ensembleIds: ['youth-symphony', 'philharmonia'], order: 3,
    title: 'The Barber of Seville — Overture',
    composer: 'Gioachino Rossini', composerDates: '1792–1868', year: '1816', duration: 7,
    programNotes: 'Side-by-side finale: Philharmonia joins the Youth Symphony stands for Rossini’s comic-opera curtain-raiser.',
  },
];

// ── Season events pinned to "today" ────────────────────────────────────────
function buildEvents() {
  const events = [];
  const VENUE = 'Alpharetta Performing Arts Center (demo)';

  // A rehearsal TODAY so Take Roll / Today light up in any demo, any weekday.
  events.push({
    id: 'asyo-today-rehearsal', type: 'Rehearsal', ensembleIds: ['youth-symphony'],
    date: iso(0), startTime: '18:30', endTime: '20:30',
    location: 'Main Rehearsal Hall', pieceIds: ['asyo-dvorak8', 'asyo-rossini'],
    status: 'Scheduled', notes: 'Strings: spiccato passage in the Dvořák finale. Winds at 19:15.',
  });

  // Weekly Sunday rehearsals, 3 weeks back → 14 weeks ahead, staggered times.
  const firstSunday = nextWeekday(0, -21);
  for (let w = 0; w < 17; w++) {
    const d = new Date(firstSunday);
    d.setDate(d.getDate() + w * 7);
    const date = isoOf(d);
    events.push(
      {
        id: `asyo-ys-sun-${date}`, type: 'Rehearsal', ensembleIds: ['youth-symphony'],
        date, startTime: '14:00', endTime: '16:30', location: 'Main Rehearsal Hall',
        pieceIds: ['asyo-dvorak8', 'asyo-peergynt'], status: 'Scheduled',
      },
      {
        id: `asyo-phil-sun-${date}`, type: 'Rehearsal', ensembleIds: ['philharmonia'],
        date, startTime: '13:00', endTime: '14:45', location: 'Rehearsal Room B',
        pieceIds: ['asyo-hungarian5', 'asyo-rossini'], status: 'Scheduled',
      },
      {
        id: `asyo-prelude-sun-${date}`, type: 'Rehearsal', ensembleIds: ['prelude-strings'],
        date, startTime: '12:00', endTime: '13:00', location: 'Rehearsal Room C',
        pieceIds: ['asyo-barber-strings'], status: 'Scheduled',
      },
    );
  }

  // Tuesday chamber coachings, next 8 weeks.
  const firstTuesday = nextWeekday(2, 1);
  for (let w = 0; w < 8; w++) {
    const d = new Date(firstTuesday);
    d.setDate(d.getDate() + w * 7);
    events.push({
      id: `asyo-chamber-tue-${isoOf(d)}`, type: 'Sectional', ensembleIds: ['chamber-ensembles'],
      date: isoOf(d), startTime: '18:00', endTime: '19:30', location: 'Chamber Room',
      status: 'Scheduled',
    });
  }

  // Fall concert (~2.5 weeks out) + winter concert (~9 weeks out).
  events.push(
    {
      id: 'asyo-fall-concert', type: 'Concert',
      ensembleIds: ['youth-symphony', 'philharmonia', 'prelude-strings'],
      date: iso(18), startTime: '19:00', endTime: '21:00', title: 'Fall Concert',
      location: VENUE, venueAddress: '2200 Encore Pkwy, Alpharetta, GA 30009',
      callTime: '17:45', dress: 'Concert black', pickupTime: '21:15',
      pieceIds: ['asyo-barber-strings', 'asyo-hungarian5', 'asyo-dvorak8', 'asyo-rossini'],
      status: 'Scheduled',
      notes: 'All three orchestras. Rossini is the side-by-side finale — Philharmonia sits in with the Youth Symphony.',
    },
    {
      id: 'asyo-winter-concert', type: 'Concert',
      ensembleIds: ['youth-symphony', 'philharmonia'],
      date: iso(63), startTime: '19:00', endTime: '21:00', title: 'Winter Concert',
      location: VENUE, venueAddress: '2200 Encore Pkwy, Alpharetta, GA 30009',
      callTime: '17:45', dress: 'Concert black',
      pieceIds: ['asyo-peergynt', 'asyo-hungarian5'], status: 'Scheduled',
    },
    // One schedule change, so the "things don't slip through cracks" story
    // demos itself: a cancelled rehearsal with an explanatory note.
    {
      id: `asyo-phil-cancelled`, type: 'Rehearsal', ensembleIds: ['philharmonia'],
      date: iso(9 + ((7 - new Date(iso(9)).getDay()) % 7)), startTime: '13:00', endTime: '14:45',
      location: 'Rehearsal Room B', status: 'Cancelled',
      changeNote: 'Cancelled — venue in use for a facility event. See you the following week.',
    },
  );
  return events;
}

// ── Announcements / documents / inbox samples ──────────────────────────────
const ANNOUNCEMENTS = [
  {
    id: 'asyo-ann-welcome', ensembleId: null, title: 'Welcome to the ASYO Music Hub',
    body: 'Schedules, repertoire, concert details, and announcements now live in one place. Tap "Find My Schedule" and search your musician’s name to see their personal calendar — and subscribe so rehearsals appear on your phone automatically.',
    priority: 'important', pinned: true, createdAt: Date.now() - 86_400_000,
  },
  {
    id: 'asyo-ann-fall-tickets', ensembleId: null, title: 'Fall Concert — tickets & call time',
    body: 'Fall Concert call time is 5:45 PM for all orchestras (doors 6:30). Concert black. Details on each musician’s schedule page.',
    priority: 'info', createdAt: Date.now() - 3_600_000,
  },
  {
    id: 'asyo-ann-chamber', ensembleId: 'chamber-ensembles', title: 'Chamber coaching rotations posted',
    body: 'Tuesday coaching assignments are posted. Check the Chamber Ensembles page for your group and time.',
    priority: 'info', createdAt: Date.now() - 7_200_000,
  },
];

const DOCUMENTS = [
  {
    id: 'asyo-doc-handbook', title: 'Family Handbook 2026–27', category: 'Handbook',
    ensembleIds: [], audience: 'All', url: 'https://example.org/asyo-handbook',
    description: 'Attendance policy, concert dress, tuition dates, and communication guidelines.',
    createdAt: Date.now() - 5 * 86_400_000,
  },
  {
    id: 'asyo-doc-dress', title: 'Concert Dress Guidelines', category: 'Policy',
    ensembleIds: [], audience: 'All', url: 'https://example.org/asyo-dress',
    description: 'Concert black for all orchestras — specifics and where to buy.',
    createdAt: Date.now() - 4 * 86_400_000,
  },
];

const PLANNED_ABSENCES = [
  {
    id: 'asyo-pa-1', studentId: 'asyo-s03', studentName: 'Marsh, Evelyn',
    date: iso(7 + ((7 - new Date(iso(7)).getDay()) % 7)),
    reason: 'Family wedding out of state', submittedAt: Date.now() - 86_400_000, status: 'pending',
  },
  {
    id: 'asyo-pa-2', studentId: 'asyo-s18', studentName: 'Holloway, Miles',
    date: iso(0), reason: 'Orthodontist — will arrive 30 min late',
    submittedAt: Date.now() - 43_200_000, status: 'pending',
  },
];

const PARENT_MESSAGES = [
  {
    id: 'asyo-pm-1', parentName: 'Dana Whitfield', email: 'dana.whitfield@example.org',
    studentName: 'Whitfield, Clara', topic: 'concerts',
    message: 'How many guest tickets does each family get for the Fall Concert, and can grandparents buy extras at the door?',
    submittedAt: Date.now() - 2 * 3_600_000, status: 'new',
  },
  {
    id: 'asyo-pm-2', parentName: 'Marcus Osei', email: 'm.osei@example.org',
    studentName: 'Osei, Nathan', topic: 'schedule',
    message: 'Nathan has a school retreat the second Sunday of next month. Will missing that rehearsal affect his seating for the concert?',
    submittedAt: Date.now() - 26 * 3_600_000, status: 'new',
  },
  {
    id: 'asyo-pm-3', parentName: 'Elena Rivera', email: 'elena.r@example.org',
    topic: 'enrollment',
    message: 'My daughter is in 7th grade and has played violin for three years. Is it too late to audition for Prelude Strings this season, and what would she need to prepare?',
    submittedAt: Date.now() - 3 * 86_400_000, status: 'read',
  },
];

// ── Write everything ───────────────────────────────────────────────────────
(async () => {
  let count = 0;
  let batch = db.batch();
  const commitIfFull = async () => {
    if (++count % 400 === 0) { await batch.commit(); batch = db.batch(); }
  };
  const put = async (col, { id, ...data }) => {
    batch.set(db.collection(col).doc(id), data);
    await commitIfFull();
  };

  for (const d of DIRECTORS) {
    batch.set(db.collection('directors').doc(d.email), {
      email: d.email, name: d.name, role: d.role,
      addedBy: 'seed-demo-org.mjs', addedAt: Date.now(),
    });
    await commitIfFull();
  }
  for (const e of ENSEMBLES) await put('ensembles', e);
  for (const s of STUDENTS) {
    const { id, ...data } = s;
    batch.set(db.collection('students').doc(id), data);
    await commitIfFull();
    batch.set(db.collection('studentsPublic').doc(id), publicStudentFields(data));
    await commitIfFull();
  }
  for (const p of PIECES) await put('repertoire', p);
  for (const ev of buildEvents()) await put('events', ev);
  for (const a of ANNOUNCEMENTS) await put('announcements', a);
  for (const doc of DOCUMENTS) await put('documents', doc);
  for (const pa of PLANNED_ABSENCES) await put('plannedAbsences', pa);
  for (const pm of PARENT_MESSAGES) await put('parentMessages', pm);

  await batch.commit();
  console.log(`Seeded ${count} docs into ${DEMO_PROJECT_ID}:`);
  console.log(`  ${ENSEMBLES.length} ensembles, ${STUDENTS.length} students (+mirrors), ${PIECES.length} pieces`);
  console.log(`  ${buildEvents().length} events, ${ANNOUNCEMENTS.length} announcements, ${DOCUMENTS.length} documents`);
  console.log(`  ${PLANNED_ABSENCES.length} planned absences, ${PARENT_MESSAGES.length} parent messages`);
  console.log('Owner: ggmuze@yahoo.com — add the ASYO admin + music director from the Directors screen.');
})();
