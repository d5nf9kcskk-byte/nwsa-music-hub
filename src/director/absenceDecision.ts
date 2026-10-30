/**
 * Answering a rehearsal absence request (#requests). The Requests screen is
 * where a director says yes or no to a `plannedAbsences` report; this module
 * is the ONE answer to two questions about it:
 *
 *   • is it still waiting on somebody (`absenceAwaiting`) — the nav badge, the
 *     Today line and the screen's "Waiting" list all count through it;
 *   • what does YES write onto the roll (`absenceExcuseMarks`).
 *
 * Type-only imports, like plannedAbsenceScope.ts, so the self-check runs under
 * Node without the org config. The caller hands over the day's roll-taking
 * events already filtered (`takesRoll`, not cancelled) — that predicate lives
 * in utils.ts, which reaches the org config.
 */
import type { AttendanceStatus, PlannedAbsence } from './types';

type Report = Pick<PlannedAbsence, 'studentId' | 'date' | 'category' | 'ensembleIds' | 'timeWindow' | 'startTime' | 'endTime' | 'status'>;
type Ev = { id: string; date: string; ensembleIds: string[]; startTime?: string; endTime?: string };
type Rec = { id: string; studentId: string; ensembleId: string; date: string; eventId?: string | null; status: AttendanceStatus };

/** Still waiting on a director: never answered, and the day has not passed.
 *  A report for a day already gone is a record, not a request — it stays on
 *  the screen under "Answered & past" but asks nobody for anything. */
export function absenceAwaiting(a: Pick<PlannedAbsence, 'status' | 'date'>, today: string): boolean {
  return (a.status ?? 'pending') === 'pending' && a.date >= today;
}

/** The roll mark a YES stands for. Arriving late is late, excused; every other
 *  category (leaving early included — there is no "left early" mark) is an
 *  excused absence, and the director can change it on the roll. */
export function excusedStatusFor(category: PlannedAbsence['category']): AttendanceStatus {
  return category === 'arriving-late' ? 'LateExcused' : 'Excused';
}

/** A specific-time report covers only the blocks it overlaps. Arriving late
 *  carries just the arrival time as `endTime`, so it covers every block that
 *  starts before then. A block with no times overlaps everything. */
function overlaps(e: Ev, r: Report): boolean {
  if (r.timeWindow !== 'specific') return true;
  const from = r.startTime || '00:00';
  const to = r.endTime || '23:59';
  return (e.startTime || '00:00') < to && (e.endTime || '23:59') > from;
}

export interface ExcusePlan {
  creates: { ensembleId: string; eventId: string; status: AttendanceStatus }[];
  updates: { id: string; status: AttendanceStatus }[];
}

/**
 * What YES writes. One mark per (block, group) the report covers, for the
 * groups the student named — or, on an old report that named none, every group
 * they are in (that report's original meaning: "out for every rehearsal").
 *
 * Never a downgrade: an Absent or Late already on the roll becomes the excused
 * version; an excused mark or a Lesson already there is left exactly as it is.
 * A legacy record with no eventId stands for that group's whole day, the same
 * reading `useAttendance` gives it, and is updated once, not once per block.
 */
export function absenceExcuseMarks(
  report: Report,
  dayEvents: readonly Ev[],
  records: readonly Rec[],
  studentEnsembleIds: readonly string[],
): ExcusePlan {
  const status = excusedStatusFor(report.category);
  const scope = report.ensembleIds?.length ? report.ensembleIds : studentEnsembleIds;
  const plan: ExcusePlan = { creates: [], updates: [] };
  const touched = new Set<string>();
  for (const e of dayEvents) {
    if (e.date !== report.date || !overlaps(e, report)) continue;
    for (const ensembleId of e.ensembleIds) {
      if (!scope.includes(ensembleId)) continue;
      const existing = records.find(r =>
        r.studentId === report.studentId && r.ensembleId === ensembleId && r.date === report.date
        && (r.eventId === e.id || r.eventId == null));
      if (!existing) plan.creates.push({ ensembleId, eventId: e.id, status });
      else if ((existing.status === 'Absent' || existing.status === 'Late') && !touched.has(existing.id)) {
        touched.add(existing.id);
        plan.updates.push({ id: existing.id, status });
      }
    }
  }
  return plan;
}
