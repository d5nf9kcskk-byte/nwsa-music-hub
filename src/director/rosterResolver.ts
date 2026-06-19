import type { Student, RosterOverride, CalendarEvent } from './types';

export interface RosterContext {
  ensembleId: string;
  date?: string;                 // YYYY-MM-DD (attendance / range matching)
  eventId?: string;              // when resolving for a specific event
  eventsById?: Record<string, CalendarEvent>;
}

/** Does override `o` apply within the given context (already known to match ensemble)? */
function overrideApplies(o: RosterOverride, ctx: RosterContext): boolean {
  // The effective date we're evaluating against: explicit date, or the event's date.
  const ctxDate = ctx.date ?? (ctx.eventId ? ctx.eventsById?.[ctx.eventId]?.date : undefined);

  if (o.scope === 'event') {
    if (ctx.eventId && o.eventId === ctx.eventId) return true;
    // Event-scoped override also applies on its event's date (for date-based lookups).
    if (ctxDate && o.eventId && ctx.eventsById?.[o.eventId]?.date === ctxDate) return true;
    return false;
  }

  // scope === 'range'
  if (!ctxDate || !o.startDate || !o.endDate) return false;
  return o.startDate <= ctxDate && ctxDate <= o.endDate;
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
  const removed = new Set(relevant.filter(o => o.action === 'remove').map(o => o.studentId));
  const added = new Set(relevant.filter(o => o.action === 'add').map(o => o.studentId));

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
): { expected: boolean; ensembleIds: string[]; isSub: boolean } {
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
  return { expected: ensembleIds.length > 0, ensembleIds, isSub };
}

/** Counts of subs added and players pulled for an event — for compact summaries. */
export function overrideSummary(overrides: RosterOverride[], eventId: string) {
  const forEvent = overrides.filter(o => o.scope === 'event' && o.eventId === eventId);
  return {
    added: forEvent.filter(o => o.action === 'add').length,
    removed: forEvent.filter(o => o.action === 'remove').length,
  };
}
