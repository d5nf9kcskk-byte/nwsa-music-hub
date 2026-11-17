/**
 * College calendar session generation — no Firebase. Shared by the in-app
 * seed (seedCollege.ts) and the admin script (scripts/seed-college.mjs).
 */
import { COLLEGE_CLASSES, COLLEGE_ENSEMBLES, COLLEGE_TERM } from './collegeClasses.ts';
import type { CollegeClassSpec } from './collegeClasses.ts';
import { MDC_NO_SCHOOL, MDC_YEAR } from '../shared/academicCalendars.ts';

/**
 * Does Miami Dade College hold classes on this date?
 *
 *   Fall 2026: classes begin Aug 24. The last day of classes and finals is
 *   Dec 11. Winter recess runs to Jan 3.
 *   Spring 2027: classes begin Jan 4. Spring break is Mar 22 to 28, and
 *   classes resume Monday Mar 29. The last day of classes and final exams is
 *   April 30.
 *   Holidays and the Mar 4 Employee Retreat are in `MDC_NO_SCHOOL`.
 *
 * Sources: the block above `MDC_NO_SCHOOL` in src/shared/academicCalendars.ts
 * (MDC's Final Exam Schedule for Term 2273, MDC's Academic Calendar, and
 * MDC's 2027 holidays page, checked 2026-11-12).
 *
 * Depends on MDC's own calendar, NEVER the MDCPS one. MDCPS closes for
 * teacher planning days and grading-period boundaries that do not touch MDC,
 * and college classes must not go missing on those days. The reverse holds
 * too: the college's spring ends April 30, not on the high school's last day
 * (June 3), and Mar 29 is an MDCPS planning day on which the college meets.
 */
export function isCollegeSessionDay(dateStr: string): boolean {
  if (MDC_NO_SCHOOL.has(dateStr)) return false;
  if (dateStr < MDC_YEAR.from) return false;
  if (dateStr > '2026-12-11' && dateStr < '2027-01-04') return false;
  if (dateStr >= '2027-03-22' && dateStr <= '2027-03-28') return false;
  if (dateStr > MDC_YEAR.to) return false;
  return true;
}

// The generators walk MDC's own year, first day of fall to last day of spring.
const YEAR_START_MS = Date.parse(`${MDC_YEAR.from}T00:00:00Z`);
const YEAR_END_MS = Date.parse(`${MDC_YEAR.to}T00:00:00Z`);

export type CollegeSeedEventData = {
  type: 'Class' | 'Rehearsal';
  ensembleIds: string[];
  date: string;
  title?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  status: 'Scheduled';
  notes?: string;
};

/**
 * The one class meeting the generator writes for this class on this date: its
 * doc id and every field. `collegeClassEventDocs()` builds from it, and
 * scripts/prune-college-sessions.mjs compares a live doc against it to tell a
 * generated meeting nobody touched from one a person has edited.
 */
export function collegeClassSession(cls: CollegeClassSpec, dateStr: string): { id: string; data: CollegeSeedEventData } {
  return {
    id: `class-${dateStr}-${cls.id}-${cls.start.replace(':', '')}`,
    data: {
      type: 'Class',
      ensembleIds: [cls.id],
      date: dateStr,
      title: cls.title,
      startTime: cls.start,
      endTime: cls.end,
      location: cls.room,
      status: 'Scheduled',
      notes: `Instructor: ${cls.teacher}${cls.courseCode ? ` · ${cls.courseCode}` : ''}`,
    },
  };
}

export function collegeClassEventDocs(): { id: string; data: CollegeSeedEventData }[] {
  const docs: { id: string; data: CollegeSeedEventData }[] = [];
  for (let ms = YEAR_START_MS; ms <= YEAR_END_MS; ms += 86_400_000) {
    const d = new Date(ms);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const dateStr = d.toISOString().slice(0, 10);
    if (!isCollegeSessionDay(dateStr)) continue;
    for (const cls of COLLEGE_CLASSES) {
      if (!cls.days.includes(dow)) continue;
      docs.push(collegeClassSession(cls, dateStr));
    }
  }
  return docs;
}

/**
 * The `ensembles` docs the college program creates: the two college ensembles
 * and one class group per entry in COLLEGE_CLASSES. One list for the in-app
 * seed and scripts/seed-college.mjs.
 */
export function collegeGroupDocs(): { id: string; data: Record<string, unknown> }[] {
  return [
    ...COLLEGE_ENSEMBLES.map(({ id, ...data }) => ({ id, data: { ...data, kind: 'ensemble', collegeLevel: true } })),
    ...COLLEGE_CLASSES.map(c => ({
      id: c.id,
      data: {
        kind: 'class',
        collegeLevel: true,
        name: c.title,
        order: c.order,
        conductorName: c.teacher,
        ...(c.room ? { defaultLocation: c.room } : {}),
        // The catalog number, onto the GROUP, so the class page can print the
        // number a dual-enrollment student is registered under. A class with
        // no code in the spec carries no field.
        ...(c.courseCode ? { courseCode: c.courseCode } : {}),
        term: c.term ?? COLLEGE_TERM,
        defaultStartTime: c.start,
        defaultEndTime: c.end,
        meetingDays: c.days,
      },
    })),
  ];
}

/** Ids of the blocks a combined block is holding (`changeFrom.absorbed`).
 *  They are off the calendar on purpose, and "Back to normal" re-creates them. */
export function absorbedEventIds(
  events: Iterable<{ changeFrom?: { absorbed?: { id: string }[] } | null }>,
): Set<string> {
  const ids = new Set<string>();
  for (const e of events) for (const a of e.changeFrom?.absorbed ?? []) ids.add(a.id);
  return ids;
}

/**
 * What a seed may CREATE: the college groups and class meetings that do not
 * exist yet. The ONE decision behind the in-app "Add college program" button,
 * `scripts/seed-college.mjs` (its default run) and the "Missing" list of
 * scripts/prune-college-sessions.mjs.
 *
 * It never returns a doc that exists, so a cancelled, moved or edited meeting
 * is never written over. It skips a meeting that a combined block is holding,
 * so a combine is not undone by a second copy. It returns no rehearsal and no
 * room patch: those only make sense on a doc that is already there.
 */
export function missingCollegeDocs(have: {
  groupIds: ReadonlySet<string>;
  eventIds: ReadonlySet<string>;
  absorbed: ReadonlySet<string>;
}) {
  return {
    groups: collegeGroupDocs().filter(d => !have.groupIds.has(d.id)),
    sessions: collegeClassEventDocs().filter(d => !have.eventIds.has(d.id) && !have.absorbed.has(d.id)),
  };
}

/** Patch existing CCO rehearsals with room 4302 (fall schedule). */
export function collegeChamberRehearsalPatches(): { id: string; data: Partial<CollegeSeedEventData> }[] {
  const docs: { id: string; data: Partial<CollegeSeedEventData> }[] = [];
  for (let ms = YEAR_START_MS; ms <= YEAR_END_MS; ms += 86_400_000) {
    const d = new Date(ms);
    if (d.getUTCDay() !== 4) continue;
    const dateStr = d.toISOString().slice(0, 10);
    if (!isCollegeSessionDay(dateStr)) continue;
    docs.push({
      id: `reh-${dateStr}-college-chamber-orchestra-1430`,
      data: { location: 'Room 4302' },
    });
  }
  return docs;
}
