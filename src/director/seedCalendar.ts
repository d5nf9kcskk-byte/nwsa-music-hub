import { doc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import type { EventType } from './types';

// Stable ensemble slugs — match the IDs written by seedRoster().
const ENS = {
  orchestra: 'symphony-orchestra',
  wind:      'wind-ensemble',
  camerata:  'camerata-string-orchestra',
  jazz:      'jazz-ensemble',
  chamber:   'chamber-winds',
  collegeChamber: 'college-chamber-orchestra',
  choir:     'high-school-choir',
} as const;

// MDCPS 2026-2027: every weekday on which students do NOT attend school.
const NO_SCHOOL = new Set([
  // Teacher planning days before school opens
  '2026-08-10', '2026-08-11', '2026-08-12',
  // Labor Day
  '2026-09-07',
  // Teacher planning
  '2026-09-21',
  // District-wide Professional Learning Day
  '2026-11-03',
  // Veterans Day
  '2026-11-11',
  // Thanksgiving recess + holiday
  '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27',
  // Teacher planning
  '2026-12-18',
  // Winter recess (Dec 21 – Jan 1)
  '2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-25',
  '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01',
  // Teacher planning
  '2027-01-15',
  // MLK Day
  '2027-01-18',
  // Presidents Day
  '2027-02-15',
  // Teacher planning
  '2027-03-10',
  // Spring recess
  '2027-03-22', '2027-03-23', '2027-03-24', '2027-03-25', '2027-03-26',
  // Teacher planning
  '2027-03-29',
  // Memorial Day
  '2027-05-31',
]);

/**
 * MDCPS (K-12) and Miami Dade College run separate academic calendars — NWSA
 * serves both middle/high schoolers and dual-enrolled college students, so a
 * date can be "off" for one and a normal day for the other. Whenever an MDC
 * marker lands on a day MDCPS is in normal session (i.e. NOT in the no-school
 * set above), attach an explanatory note so a family checking one calendar
 * isn't misled about the other.
 */
function mdcNote(date: string): string | undefined {
  return NO_SCHOOL.has(date) ? undefined : 'MDCPS schools are in regular session this day — this date affects Miami Dade College only.';
}

// School-wide calendar markers (MDCPS academic milestones + MDC key dates).
const MARKERS: { id: string; date: string; title: string; type: EventType; notes?: string }[] = [
  // MDCPS — teacher planning days before school opens
  { id: 'mdcps-plan-0810',          date: '2026-08-10', title: 'MDCPS: Teacher Planning Day — No School', type: 'Event' },
  { id: 'mdcps-plan-0811',          date: '2026-08-11', title: 'MDCPS: Teacher Planning Day — No School', type: 'Event' },
  { id: 'mdcps-plan-0812',          date: '2026-08-12', title: 'MDCPS: Teacher Planning Day — No School', type: 'Event' },
  { id: 'mdcps-first-day',          date: '2026-08-13', title: 'MDCPS: First Day of School',              type: 'Event' },
  { id: 'mdcps-labor-day',          date: '2026-09-07', title: 'MDCPS: Labor Day — No School',            type: 'Event' },
  { id: 'mdcps-plan-0921',          date: '2026-09-21', title: 'MDCPS: Teacher Planning Day — No School', type: 'Event' },
  { id: 'mdcps-gp1-end',            date: '2026-10-16', title: 'MDCPS: End of Grading Period 1',          type: 'Event' },
  { id: 'mdcps-gp2-start',          date: '2026-10-19', title: 'MDCPS: Grading Period 2 Begins',          type: 'Event' },
  { id: 'mdcps-pld-1103',           date: '2026-11-03', title: 'MDCPS: Professional Learning Day — No School', type: 'Event' },
  { id: 'mdcps-veterans-day',       date: '2026-11-11', title: "MDCPS: Veterans' Day — No School",        type: 'Event' },
  { id: 'mdcps-thanksgiving-1123',  date: '2026-11-23', title: 'MDCPS: Thanksgiving Recess — No School',  type: 'Event' },
  { id: 'mdcps-thanksgiving-1124',  date: '2026-11-24', title: 'MDCPS: Thanksgiving Recess — No School',  type: 'Event' },
  { id: 'mdcps-thanksgiving-1125',  date: '2026-11-25', title: 'MDCPS: Thanksgiving Recess — No School',  type: 'Event' },
  { id: 'mdcps-thanksgiving',       date: '2026-11-26', title: 'MDCPS: Thanksgiving — No School',         type: 'Event' },
  { id: 'mdcps-thanksgiving-1127',  date: '2026-11-27', title: 'MDCPS: Thanksgiving Recess — No School',  type: 'Event' },
  { id: 'mdcps-last-before-winter', date: '2026-12-17', title: 'MDCPS: Last Day Before Winter Break',     type: 'Event' },
  { id: 'mdcps-plan-1218',          date: '2026-12-18', title: 'MDCPS: Teacher Planning Day — No School', type: 'Event' },
  { id: 'mdcps-winter-break-start', date: '2026-12-21', title: 'MDCPS: Winter Break — No School',         type: 'Event' },
  { id: 'mdcps-winter-1222',        date: '2026-12-22', title: 'MDCPS: Winter Break — No School',         type: 'Event' },
  { id: 'mdcps-winter-1223',        date: '2026-12-23', title: 'MDCPS: Winter Break — No School',         type: 'Event' },
  { id: 'mdcps-winter-1224',        date: '2026-12-24', title: 'MDCPS: Winter Break — No School',         type: 'Event' },
  { id: 'mdcps-winter-1225',        date: '2026-12-25', title: 'MDCPS: Winter Break — No School',         type: 'Event' },
  { id: 'mdcps-winter-1228',        date: '2026-12-28', title: 'MDCPS: Winter Break — No School',         type: 'Event' },
  { id: 'mdcps-winter-1229',        date: '2026-12-29', title: 'MDCPS: Winter Break — No School',         type: 'Event' },
  { id: 'mdcps-winter-1230',        date: '2026-12-30', title: 'MDCPS: Winter Break — No School',         type: 'Event' },
  { id: 'mdcps-winter-1231',        date: '2026-12-31', title: 'MDCPS: Winter Break — No School',         type: 'Event' },
  { id: 'mdcps-new-years',          date: '2027-01-01', title: "MDCPS: New Year's Day — No School",       type: 'Event' },
  { id: 'mdcps-back-from-winter',   date: '2027-01-04', title: 'MDCPS: Back from Winter Break',           type: 'Event' },
  { id: 'mdcps-sem1-end',           date: '2027-01-14', title: 'MDCPS: End of Semester 1 / Grading Period 2', type: 'Event' },
  { id: 'mdcps-plan-0115',          date: '2027-01-15', title: 'MDCPS: Teacher Planning Day — No School', type: 'Event' },
  { id: 'mdcps-mlk-day',            date: '2027-01-18', title: 'MDCPS: MLK Day — No School',              type: 'Event' },
  { id: 'mdcps-sem2-start',         date: '2027-01-19', title: 'MDCPS: Semester 2 / Grading Period 3 Begins', type: 'Event' },
  { id: 'mdcps-presidents-day',     date: '2027-02-15', title: "MDCPS: Presidents' Day — No School",      type: 'Event' },
  { id: 'mdcps-gp3-end',            date: '2027-03-19', title: 'MDCPS: End of Grading Period 3',          type: 'Event' },
  { id: 'mdcps-plan-0310',          date: '2027-03-10', title: 'MDCPS: Teacher Planning Day — No School', type: 'Event' },
  { id: 'mdcps-spring-break-start', date: '2027-03-22', title: 'MDCPS: Spring Break — No School',         type: 'Event' },
  { id: 'mdcps-spring-0323',        date: '2027-03-23', title: 'MDCPS: Spring Break — No School',         type: 'Event' },
  { id: 'mdcps-spring-0324',        date: '2027-03-24', title: 'MDCPS: Spring Break — No School',         type: 'Event' },
  { id: 'mdcps-spring-0325',        date: '2027-03-25', title: 'MDCPS: Spring Break — No School',         type: 'Event' },
  { id: 'mdcps-spring-0326',        date: '2027-03-26', title: 'MDCPS: Spring Break — No School',         type: 'Event' },
  { id: 'mdcps-plan-0329',          date: '2027-03-29', title: 'MDCPS: Teacher Planning Day — No School', type: 'Event' },
  { id: 'mdcps-gp4-start',          date: '2027-03-30', title: 'MDCPS: Back from Spring Break / Grading Period 4', type: 'Event' },
  { id: 'mdcps-memorial-day',       date: '2027-05-31', title: 'MDCPS: Memorial Day — No School',         type: 'Event' },
  { id: 'mdcps-last-day',           date: '2027-06-03', title: 'MDCPS: Last Day of School',               type: 'Event' },
  // MDC academic calendar (Fall 2026 + Spring 2027)
  { id: 'mdc-fall-start',           date: '2026-08-24', title: 'MDC: Fall 2026 Classes Begin',     type: 'Event', notes: mdcNote('2026-08-24') },
  { id: 'mdc-fall-finals',          date: '2026-12-11', title: 'MDC: Fall 2026 Finals / Last Day', type: 'Event', notes: mdcNote('2026-12-11') },
  { id: 'mdc-winter-break',         date: '2026-12-21', title: 'MDC: Winter Break Begins',         type: 'Event', notes: mdcNote('2026-12-21') },
  { id: 'mdc-spring-start',         date: '2027-01-04', title: 'MDC: Spring 2027 Classes Begin',   type: 'Event', notes: mdcNote('2027-01-04') },
  { id: 'mdc-spring-break-start',   date: '2027-03-22', title: 'MDC: Spring Break Begins',         type: 'Event', notes: mdcNote('2027-03-22') },
  { id: 'mdc-spring-break-end',     date: '2027-03-29', title: 'MDC: Spring Break Ends',           type: 'Event', notes: mdcNote('2027-03-29') },
];

// NWSA 2025-2026 schedule pattern (same rooms and times apply for 2026-2027).
//
// Period 6  (1:10–2:25 PM):
//   Mon/Wed/Fri → Wind Ensemble (4302), Camerata (4304)
//   Tue/Thu     → Symphony Orchestra (4302), Jazz Ensemble (4304), Chamber Winds (4309)
//
// Period 7/8 (2:30–3:45 PM):
//   Tue         → Wind Ensemble (4302)
//   Wed/Fri     → Symphony Orchestra (4302), Jazz Ensemble (4304), Chamber Winds (4309)

type Slot = { ensId: string; start: string; end: string; room: string };

function slotsForDay(dow: number /* UTC getUTCDay(): 0=Sun … 6=Sat */): Slot[] {
  const s: Slot[] = [];
  // Period 6 (1:10–2:25)
  if (dow === 1 || dow === 3 || dow === 5) {
    s.push({ ensId: ENS.wind,     start: '13:10', end: '14:25', room: 'Room 4302' });
    s.push({ ensId: ENS.camerata, start: '13:10', end: '14:25', room: 'Room 4304' });
  }
  if (dow === 2 || dow === 4) {
    s.push({ ensId: ENS.orchestra, start: '13:10', end: '14:25', room: 'Room 4302' });
    s.push({ ensId: ENS.jazz,      start: '13:10', end: '14:25', room: 'Room 4304' });
    s.push({ ensId: ENS.chamber,   start: '13:10', end: '14:25', room: 'Room 4309' });
  }
  // Period 7/8 (2:30–3:45)
  if (dow === 2) {
    s.push({ ensId: ENS.wind, start: '14:30', end: '15:45', room: 'Room 4302' });
  }
  if (dow === 4) {
    s.push({ ensId: ENS.collegeChamber, start: '14:30', end: '15:45', room: '' });
  }
  if (dow === 3 || dow === 5) {
    s.push({ ensId: ENS.orchestra, start: '14:30', end: '15:45', room: 'Room 4302' });
    s.push({ ensId: ENS.jazz,      start: '14:30', end: '15:45', room: 'Room 4304' });
    s.push({ ensId: ENS.chamber,   start: '14:30', end: '15:45', room: 'Room 4309' });
  }
  return s;
}

// Academic (non-ensemble) music classes — NWSA HS Music Division schedule.
// Added as individual calendar entries (type 'Event') so every student can see
// exactly where each period meets, whether it's an ensemble or a class. Teacher
// names are intentionally omitted for now. Days: 1=Mon … 5=Fri.
type ClassSlot = { title: string; days: number[]; start: string; end: string; room: string };
const CLASSES: ClassSlot[] = [
  { title: 'AP Theory',                 days: [1, 2, 3, 4, 5], start: '12:10', end: '13:00', room: 'Room 4204' },
  { title: 'Jazz Theory',               days: [1, 4],          start: '14:30', end: '15:45', room: 'Room 4304' },
  { title: 'Theory — 9th Grade',        days: [1, 4],          start: '14:30', end: '15:45', room: 'Room 4213' },
  { title: 'Theory — 10th Grade',       days: [1, 4],          start: '14:30', end: '15:45', room: 'Room 4210' },
  { title: 'Music History — 11th–12th', days: [1, 4],          start: '14:30', end: '15:45', room: 'Room 4309' },
  { title: 'String Masterclass',        days: [2],             start: '14:30', end: '15:45', room: 'Rooms 4210 / 4304 / 4309' },
  // Vocal-division classes (Period 6). Rooms TBD.
  { title: 'Vocal Lit',                 days: [1, 3, 5],       start: '13:10', end: '14:25', room: '' },
  { title: 'Vocal Forum',               days: [2, 4],          start: '13:10', end: '14:25', room: '' },
];

const classSlug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

type SeedEventData = {
  type: EventType;
  ensembleIds: string[];
  date: string;
  title?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  status: 'Scheduled';
  notes?: string;
};

// School year: Aug 13, 2026 → Jun 3, 2027. UTC ms to avoid TZ day-shifts.
const YEAR_START_MS = Date.UTC(2026, 7, 13);
const YEAR_END_MS = Date.UTC(2027, 5, 3);

/** Every non-ensemble class as a dated calendar event across the school year,
 *  skipping weekends and no-school days. Shared by seedCalendar + seedClasses. */
function classEventDocs(): { id: string; data: SeedEventData }[] {
  const docs: { id: string; data: SeedEventData }[] = [];
  for (let ms = YEAR_START_MS; ms <= YEAR_END_MS; ms += 86_400_000) {
    const d = new Date(ms);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const dateStr = d.toISOString().slice(0, 10);
    if (NO_SCHOOL.has(dateStr)) continue;
    for (const cls of CLASSES) {
      if (!cls.days.includes(dow)) continue;
      docs.push({
        id: `class-${dateStr}-${classSlug(cls.title)}-${cls.start.replace(':', '')}`,
        data: {
          type: 'Event',
          ensembleIds: [],
          date: dateStr,
          title: cls.title,
          startTime: cls.start,
          endTime: cls.end,
          location: cls.room,
          status: 'Scheduled',
        },
      });
    }
  }
  return docs;
}

/** HS Choir rehearsals across the year. Modeled as an ensemble rehearsal (tied
 *  to the high-school-choir ensemble, so it shows on the choir page/filter),
 *  meeting every school day 2:30–3:45. */
function choirRehearsalDocs(): { id: string; data: SeedEventData }[] {
  const docs: { id: string; data: SeedEventData }[] = [];
  for (let ms = YEAR_START_MS; ms <= YEAR_END_MS; ms += 86_400_000) {
    const d = new Date(ms);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const dateStr = d.toISOString().slice(0, 10);
    if (NO_SCHOOL.has(dateStr)) continue;
    docs.push({
      id: `reh-${dateStr}-${ENS.choir}-1430`,
      data: { type: 'Rehearsal', ensembleIds: [ENS.choir], date: dateStr, startTime: '14:30', endTime: '15:45', location: 'Room 4204', status: 'Scheduled' },
    });
  }
  return docs;
}

/** Add the non-instrumental parts of the schedule to an already-seeded
 *  calendar: HS Choir rehearsals plus every academic class (AP Theory …
 *  Vocal Forum). Safe to run any time — idempotent (stable ids), and it never
 *  touches the instrumental rehearsals, markers, or manually-added events.
 *  Returns the number of sessions written. */
export async function seedExtraSchedule(): Promise<number> {
  if (!db) throw new Error('Firebase is not configured.');
  const docs = [...choirRehearsalDocs(), ...classEventDocs()];
  const CHUNK = 499;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const { id, data } of docs.slice(i, i + CHUNK)) batch.set(doc(db, 'events', id), data);
    await batch.commit();
  }
  return docs.length;
}

/** Write only the MDCPS + MDC academic-calendar markers (no rehearsals). Idempotent. */
export async function seedSchoolCalendar(): Promise<number> {
  if (!db) throw new Error('Firebase is not configured.');
  const CHUNK = 499;
  const docs = MARKERS.map(m => ({
    id: `cal-${m.id}`,
    data: { type: m.type as EventType, ensembleIds: [] as string[], date: m.date, title: m.title, status: 'Scheduled' as const, ...(m.notes ? { notes: m.notes } : {}) },
  }));
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const { id, data } of docs.slice(i, i + CHUNK)) batch.set(doc(db, 'events', id), data);
    await batch.commit();
  }
  return docs.length;
}

export async function seedCalendar(): Promise<{ rehearsals: number; classes: number; markers: number }> {
  if (!db) throw new Error('Firebase is not configured.');

  const allDocs: { id: string; data: SeedEventData }[] = [];

  // 1. Rehearsal events across the school year (UTC ms to avoid TZ day-shifts).
  for (let ms = YEAR_START_MS; ms <= YEAR_END_MS; ms += 86_400_000) {
    const d   = new Date(ms);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue; // skip weekends
    const dateStr = d.toISOString().slice(0, 10);
    if (NO_SCHOOL.has(dateStr)) continue;

    for (const slot of slotsForDay(dow)) {
      const id = `reh-${dateStr}-${slot.ensId}-${slot.start.replace(':', '')}`;
      allDocs.push({
        id,
        data: {
          type: 'Rehearsal',
          ensembleIds: [slot.ensId],
          date: dateStr,
          startTime: slot.start,
          endTime: slot.end,
          location: slot.room,
          status: 'Scheduled',
        },
      });
    }
  }

  // 2. HS Choir rehearsals (ensemble-scoped, every school day).
  allDocs.push(...choirRehearsalDocs());
  const rehearsalCount = allDocs.length;

  // 3. Non-ensemble academic classes (school-wide, shown on every calendar).
  allDocs.push(...classEventDocs());
  const classCount = allDocs.length - rehearsalCount;

  // 3. School-wide calendar markers
  for (const m of MARKERS) {
    allDocs.push({
      id: `cal-${m.id}`,
      data: { type: m.type, ensembleIds: [], date: m.date, title: m.title, status: 'Scheduled', ...(m.notes ? { notes: m.notes } : {}) },
    });
  }

  // 3. Batch write in chunks ≤ 499 (Firestore hard limit: 500 ops/batch)
  const CHUNK = 499;
  for (let i = 0; i < allDocs.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const { id, data } of allDocs.slice(i, i + CHUNK)) {
      batch.set(doc(db, 'events', id), data);
    }
    await batch.commit();
  }

  return { rehearsals: rehearsalCount, classes: classCount, markers: MARKERS.length };
}
