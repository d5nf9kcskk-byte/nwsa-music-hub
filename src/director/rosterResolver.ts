import type { Student, RosterOverride, CalendarEvent } from './types';
import { theoryClassTitleFor, isChoirClassTitle } from './classSchedule';
import { takesAttendance } from './utils';

export interface RosterContext {
  ensembleId: string;
  date?: string;                 // YYYY-MM-DD (attendance / range matching)
  eventId?: string;              // when resolving for a specific event
  eventsById?: Record<string, CalendarEvent>;
}

/** Does override `o` apply within the given context (already known to match ensemble)? */
export function overrideApplies(o: RosterOverride, ctx: RosterContext): boolean {
  // The effective date we're evaluating against: explicit date, or the event's date.
  const ctxDate = ctx.date ?? (ctx.eventId ? ctx.eventsById?.[ctx.eventId]?.date : undefined);

  // A standing rotation describes which REHEARSAL a student attends on a given
  // weekday — it says nothing about concerts. On a performance the student plays
  // with whichever ensemble is on stage, so fall back to base membership (the
  // rotation model deliberately keeps them a member of both). Without this a
  // Jazz concert falling on a Wed/Thu silently drops every Wed/Thu rotator.
  // A date-only context has no event to judge, and is always a rehearsal lookup.
  if (o.kind === 'rotation' && ctx.eventId) {
    const ev = ctx.eventsById?.[ctx.eventId];
    if (ev && !takesAttendance(ev.type)) return false;
  }

  if (o.scope === 'event') {
    if (ctx.eventId && o.eventId === ctx.eventId) return true;
    // Event-scoped override also applies on its event's date (for date-based lookups).
    if (ctxDate && o.eventId && ctx.eventsById?.[o.eventId]?.date === ctxDate) return true;
    return false;
  }

  // scope === 'range'
  if (!ctxDate || !o.startDate || !o.endDate) return false;
  if (o.startDate > ctxDate || ctxDate > o.endDate) return false;
  // Optional recurring-weekday narrowing (standing rotations). Parsed as UTC:
  // `new Date('2026-08-13')` is UTC midnight but .getDay() reads it LOCAL, which
  // shifts the weekday a day west of UTC (see seedCalendar.ts for the same trap).
  if (o.days?.length) return o.days.includes(new Date(`${ctxDate}T00:00:00Z`).getUTCDay());
  return true;
}

/**
 * The write set for a standing rotation ("base X, but on `days` with Y"),
 * in scripts/apply-rotations.mjs's convention — the one every live rotation
 * uses: the student is a base MEMBER of both ensembles (so concerts, which
 * the rotation exemption above skips, list them on both sides), and the
 * rotation itself is removes carving out rehearsal days:
 *   • out of the base ensemble on the rotation days (this doc also carries
 *     `destEnsembleId` — redundant next to base membership on rehearsal days,
 *     but it powers the student panel's one-line rotation summary);
 *   • out of the destination on the OTHER school days (Mon–Fri), plain-shaped
 *     exactly like apply-rotations' docs — without it the student resolves
 *     into both halves of a shared block. A no-op on days the destination
 *     doesn't meet. Omitted when the rotation names every school day
 *     (empty `days` would mean a FULL removal).
 * `ensembleIds` is undefined when membership already covers both (the caller
 * skips the students write); overrides are returned in save order.
 */
export function rotationWrites(
  student: Pick<Student, 'id' | 'ensembleIds'>,
  baseId: string,
  destId: string,
  days: number[],
  startDate: string,
  endDate: string,
): { ensembleIds?: string[]; overrides: Omit<RosterOverride, 'id'>[] } {
  const have = student.ensembleIds ?? [];
  const missing = [baseId, destId].filter(id => !have.includes(id));
  const shared = { studentId: student.id, action: 'remove', kind: 'rotation', scope: 'range', startDate, endDate } as const;
  const overrides: Omit<RosterOverride, 'id'>[] = [
    { ...shared, ensembleId: baseId, days: [...days].sort((a, b) => a - b), destEnsembleId: destId },
  ];
  const reciprocal = [1, 2, 3, 4, 5].filter(d => !days.includes(d));
  if (reciprocal.length) overrides.push({ ...shared, ensembleId: destId, days: reciprocal });
  return { ensembleIds: missing.length ? [...have, ...missing] : undefined, overrides };
}

export interface ResolvedStudent {
  student: Student;
  isSub: boolean; // present via an 'add' override rather than base membership
}

/**
 * The effective roster for an ensemble in a given context:
 *   base active members + temporary adds − temporary pulls.
 * Returns students flagged so the UI can mark subs, sorted by name.
 */
export function resolveRoster(
  students: Student[],
  overrides: RosterOverride[],
  ctx: RosterContext,
): ResolvedStudent[] {
  const relevant = overrides.filter(o => o.ensembleId === ctx.ensembleId && overrideApplies(o, ctx));
  // Lesson pull-outs are PARTIAL (a time window) — the student is still on the
  // roster and takes roll; the lesson shows as a badge instead.
  const removed = new Set(relevant.filter(o => o.action === 'remove' && o.kind !== 'lesson').map(o => o.studentId));
  const added = new Set(relevant.filter(o => o.action === 'add').map(o => o.studentId));
  // A pull-out that names a destination ensemble subs the student INTO this one
  // (same entry, no separate 'add' override needed). Matched by date/event.
  for (const o of overrides) {
    if (o.destEnsembleId === ctx.ensembleId && o.action === 'remove' && overrideApplies(o, ctx)) {
      added.add(o.studentId);
    }
  }

  const byId = Object.fromEntries(students.map(s => [s.id, s]));
  const result: ResolvedStudent[] = [];

  for (const s of students) {
    if (s.status !== 'Active') continue;
    const isBase = s.ensembleIds?.includes(ctx.ensembleId) ?? false;
    if (isBase && !removed.has(s.id)) result.push({ student: s, isSub: false });
  }
  for (const id of added) {
    const s = byId[id];
    if (s && s.status === 'Active' && !result.some(r => r.student.id === id)) {
      result.push({ student: s, isSub: true });
    }
  }

  result.sort((a, b) => a.student.name.localeCompare(b.student.name));
  return result;
}

/**
 * Whether a student is expected at an event (honoring subs/pulls), and via
 * which ensemble(s). Used by the public personal schedule.
 */
export function studentExpectation(
  studentId: string,
  event: CalendarEvent,
  students: Student[],
  overrides: RosterOverride[],
  eventsById: Record<string, CalendarEvent>,
): { expected: boolean; ensembleIds: string[]; isSub: boolean; attendanceOnly: boolean } {
  const ensembleIds: string[] = [];
  let isSub = false;
  for (const ensId of event.ensembleIds) {
    const roster = resolveRoster(students, overrides, { ensembleId: ensId, eventId: event.id, eventsById });
    const hit = roster.find(r => r.student.id === studentId);
    if (hit) {
      ensembleIds.push(ensId);
      if (hit.isSub) isSub = true;
    }
  }
  if (ensembleIds.length > 0) return { expected: true, ensembleIds, isSub, attendanceOnly: false };

  // Named individual performers (in addition to / instead of an ensemble roster).
  if ((event.studentIds ?? []).includes(studentId)) {
    return { expected: true, ensembleIds: event.ensembleIds.slice(0, 1), isSub: false, attendanceOnly: false };
  }

  // Not performing — but membership in an attendance-required ensemble still
  // puts the event on this student's schedule (audience requirement).
  const student = students.find(st => st.id === studentId);
  const attends = (event.attendanceEnsembleIds ?? []).filter(ensId => student?.ensembleIds?.includes(ensId));
  if (attends.length > 0) return { expected: true, ensembleIds: attends, isSub: false, attendanceOnly: true };

  // Named individual audience attendees.
  if ((event.attendanceStudentIds ?? []).includes(studentId)) {
    return { expected: true, ensembleIds: [], isSub: false, attendanceOnly: true };
  }

  // Academic classes are seeded school-wide (empty ensembleIds). Attach them to
  // personal schedules by grade / jazz membership / choir roster.
  if (event.type === 'Class' && student) {
    const theory = theoryClassTitleFor(student);
    if (theory && event.title === theory) {
      return { expected: true, ensembleIds: [], isSub: false, attendanceOnly: false };
    }
    if (isChoirClassTitle(event.title) && student.ensembleIds?.includes('high-school-choir')) {
      return { expected: true, ensembleIds: ['high-school-choir'], isSub: false, attendanceOnly: false };
    }
  }

  return { expected: false, ensembleIds: [], isSub: false, attendanceOnly: false };
}

/** Counts of subs added and players pulled for an event — for compact summaries. */
export function overrideSummary(overrides: RosterOverride[], eventId: string) {
  const forEvent = overrides.filter(o => o.scope === 'event' && o.eventId === eventId);
  return {
    added: forEvent.filter(o => o.action === 'add').length,
    removed: forEvent.filter(o => o.action === 'remove').length,
  };
}

/**
 * Lesson pull-outs (partial-rehearsal windows) applying to an ensemble+date.
 * Returns studentId -> the lesson override, for badge display in take roll.
 */
export function lessonsFor(
  overrides: RosterOverride[],
  ctx: RosterContext,
): Record<string, RosterOverride> {
  const out: Record<string, RosterOverride> = {};
  for (const o of overrides) {
    if (o.kind === 'lesson' && o.ensembleId === ctx.ensembleId && overrideApplies(o, ctx)) {
      out[o.studentId] = o;
    }
  }
  return out;
}
