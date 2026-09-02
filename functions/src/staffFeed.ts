import type { Firestore } from 'firebase-admin/firestore';
import { icsAssignment, icsCalendar, icsEvent, icsLesson } from '../../src/shared/ics.ts';
import {
  assignmentMatchesView, eventMatchesView, type CalendarViewSpec,
} from '../../src/shared/calendarView.ts';
import {
  resolveAssignedEnsembleIds, type DirectorAssignmentFields,
} from '../../src/director/directorAssignments.ts';
import ORG from '../../config/orgs/nwsa.json' with { type: 'json' };

/** The doc holding one staff member's "my calendar" token. Also the shape
 *  firestore.rules pins, so a person can read only their own. */
export function staffTokenDocId(email: string): string {
  return `staff__${email}`;
}

const BRANDING = {
  prodId: ORG.ics.prodId,
  uidDomain: ORG.ics.uidDomain,
  timezone: ORG.timezone,
  namePrefix: ORG.ics.namePrefix,
};

/** How much of the schedule a calendar carries. Bounded on both sides so one
 *  request can never walk the whole collection as it grows year on year. */
const DAYS_BACK = 60;
const DAYS_AHEAD = 400;

export function isoOffset(days: number, now: Date = new Date()): string {
  const d = new Date(now.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function withinWindow(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

/**
 * "Everything that applies to ME", as an ordinary calendar view (#my-calendar).
 *
 * The point of this feed is that it is NOT a hand-picked filter: it is derived
 * from the assignments already on the person's `directors` doc, so gaining an
 * ensemble next term changes what the calendar carries without anyone
 * re-subscribing. That is the one thing a hash-addressed `view-<slug>.ics`
 * cannot do — changing a view's filters changes its URL.
 *
 * `school` is ALWAYS true, and that is load-bearing rather than cosmetic. With
 * `ensembleIds` empty and `school` false, `isEveryEnsemble()` is true and
 * `eventMatchesView()` matches EVERY event — so an applied teacher with no
 * ensembles would be handed the entire school calendar, the exact opposite of
 * what this feed is for. With `school` true that person gets school-wide days
 * only (plus their own lessons), and a director gets their own ensembles plus
 * school-wide days. Pinned in the self-check.
 *
 * No type filter: a director wants their rehearsals AND their concerts AND
 * their class meetings. Narrowing by type is what the Schedule screen's
 * Subscribe sheet is for.
 */
export function myCalendarView(
  director: DirectorAssignmentFields | null | undefined,
  ensembles: { id: string; name: string }[],
): CalendarViewSpec {
  return {
    ensembleIds: resolveAssignedEnsembleIds(director, ensembles),
    school: true,
    types: [],
  };
}

/**
 * The calendar body, read at request time.
 *
 * Reads the staff-only `lessons`, scoped to this person's OWN studio by
 * `teacherEmail` — the same predicate `useLessons.ts` issues for a signed-in
 * Applied Teacher, so the subscribed calendar and the screen can never
 * disagree about whose lessons these are. That read is why this cannot be a
 * file in the Pages artifact (#lessons-feed learned it the hard way), and the
 * events are filtered through the SHARED `eventMatchesView` rather than a
 * second copy of the rule.
 *
 * Student names come from `studentsPublic`, not `students`: the projection
 * holds the name and nothing else this needs, so the function never touches
 * the staff-only student record even though it runs with admin rights.
 */
export async function buildStaffIcs(db: Firestore, email: string): Promise<string> {
  const from = isoOffset(-DAYS_BACK);
  const to = isoOffset(DAYS_AHEAD);

  const [directorSnap, ensembleSnap, eventSnap, assignmentSnap, lessonSnap, studentSnap, pieceSnap] =
    await Promise.all([
      db.doc(`directors/${email}`).get(),
      db.collection('ensembles').get(),
      db.collection('events').where('date', '>=', from).where('date', '<=', to).get(),
      db.collection('assignments').where('dueDate', '>=', from).where('dueDate', '<=', to).get(),
      // Equality only, with the window filtered below: a compound
      // (teacherEmail + date range) query needs a composite index, and a
      // missing index fails the whole calendar rather than one event. One
      // teacher's studio is a few hundred docs a year.
      db.collection('lessons').where('teacherEmail', '==', email).get(),
      db.collection('studentsPublic').get(),
      db.collection('repertoire').get(),
    ]);

  const ensembles = ensembleSnap.docs.map(d => ({ id: d.id, name: String(d.get('name') ?? d.id) }));
  const view = myCalendarView(
    directorSnap.exists ? (directorSnap.data() as DirectorAssignmentFields) : null,
    ensembles,
  );

  const nameById = new Map(ensembles.map(e => [e.id, e.name]));
  const pieceById = new Map(pieceSnap.docs.map(d => [d.id, d.data() as { title?: string; composer?: string }]));
  const lookups = {
    ensembleName: (id: string) => nameById.get(id),
    piece: (id: string) => pieceById.get(id),
  };

  const vevents: string[] = [];

  for (const d of eventSnap.docs) {
    const event = { id: d.id, ...(d.data() as object) } as Parameters<typeof icsEvent>[0];
    if (eventMatchesView(event, view)) vevents.push(icsEvent(event, lookups, BRANDING));
  }

  // Due dates for the classes this person teaches. Deliberately NOT gated on
  // `publishAt` the way the public feeds are: this is the author's own
  // calendar, and an assignment that opens to students on Friday still
  // belongs on the Friday of the person who set it.
  for (const d of assignmentSnap.docs) {
    const a = { id: d.id, ...(d.data() as object) } as Parameters<typeof icsAssignment>[0];
    if (assignmentMatchesView(a, view)) vevents.push(icsAssignment(a, lookups, BRANDING));
  }

  const studentName = new Map<string, string>();
  studentSnap.forEach(d => {
    const n = d.get('name');
    if (typeof n === 'string') studentName.set(d.id, n);
  });

  for (const d of lessonSnap.docs) {
    const l = d.data() as Record<string, unknown>;
    const date = String(l.date ?? '');
    if (!withinWindow(date, from, to)) continue;
    vevents.push(icsLesson({
      id: d.id,
      date,
      startTime: l.startTime as string | undefined,
      endTime: l.endTime as string | undefined,
      studentName: studentName.get(String(l.studentId)),
      teacherName: l.teacherName as string | undefined,
      teacherEmail: l.teacherEmail as string | undefined,
      instrument: l.instrument as string | undefined,
      location: l.location as string | undefined,
      status: l.status as string | undefined,
    }, BRANDING));
  }

  return icsCalendar(
    `${ORG.ics.namePrefix} · My schedule`,
    'Your ensembles, your classes, your lessons, and school-wide days. Staff only.',
    vevents,
    BRANDING,
  );
}
