/**
 * College calendar session generation — no Firebase. Shared by the in-app
 * seed (seedCollege.ts) and the admin script (scripts/seed-college.mjs).
 */
import { COLLEGE_CLASSES } from './collegeClasses.ts';
import { MDC_NO_SCHOOL } from '../shared/academicCalendars.ts';

/** MDC Fall 2026 begins Aug 24; after fall finals (Dec 11) through winter
 *  break until Spring 2027 starts Jan 4; spring break Mar 22–29. Depends on
 *  MDC's own calendar (`MDC_NO_SCHOOL`) — NEVER the MDCPS one. MDCPS closes
 *  campus for teacher-planning days and grading-period boundaries that don't
 *  touch MDC at all, and college classes must not go missing on those days. */
export function isCollegeSessionDay(dateStr: string): boolean {
  if (MDC_NO_SCHOOL.has(dateStr)) return false;
  if (dateStr < '2026-08-24') return false;
  if (dateStr > '2026-12-11' && dateStr < '2027-01-04') return false;
  if (dateStr >= '2027-03-22' && dateStr <= '2027-03-29') return false;
  if (dateStr > '2027-06-03') return false;
  return true;
}

const YEAR_START_MS = Date.UTC(2026, 7, 24);
const YEAR_END_MS = Date.UTC(2027, 5, 3);

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
      const clock = cls.start.replace(':', '');
      docs.push({
        id: `class-${dateStr}-${cls.id}-${clock}`,
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
      });
    }
  }
  return docs;
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
