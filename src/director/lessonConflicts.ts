import type { CalendarEvent, Student, RosterOverride } from './types';
import { resolveRoster } from './rosterResolver';
import { takesAttendance } from './utils';

export interface LessonConflict {
  event: CalendarEvent;
  ensembleId: string;
}

const overlaps = (aStart: string, aEnd: string, bStart?: string, bEnd?: string) =>
  !!bStart && !!bEnd && aStart < bEnd && bStart < aEnd;

/**
 * Rehearsals/sectionals/classes the student is expected at (honoring
 * existing subs/pull-outs) that overlap a proposed lesson's time window on
 * the given date. One entry per conflicting event — used to dramatically
 * warn a Teacher before they book over a student's regular commitment.
 */
export function findLessonConflicts(
  studentId: string,
  date: string,
  startTime: string,
  endTime: string,
  events: CalendarEvent[],
  students: Student[],
  overrides: RosterOverride[],
): LessonConflict[] {
  if (!studentId || !date || !startTime || !endTime || endTime <= startTime) return [];
  const eventsById = Object.fromEntries(events.map(e => [e.id, e]));
  const out: LessonConflict[] = [];
  for (const e of events) {
    if (e.date !== date || e.status === 'Cancelled' || !takesAttendance(e.type)) continue;
    if (!overlaps(startTime, endTime, e.startTime, e.endTime)) continue;
    const hitEnsembleId = e.ensembleIds.find(ensId =>
      resolveRoster(students, overrides, { ensembleId: ensId, eventId: e.id, eventsById })
        .some(r => r.student.id === studentId),
    );
    if (hitEnsembleId) out.push({ event: e, ensembleId: hitEnsembleId });
  }
  return out;
}
