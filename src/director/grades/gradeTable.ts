/**
 * The Gradebook's numbers for ONE table (#gradebook) — every box, every column
 * and every student's grade, as plain functions over plain arrays.
 *
 * The screen and the district email both read this, for every table, so they
 * cannot disagree: the email used to be built from whatever was TYPED, while
 * the screen showed typed numbers plus grey suggestions, and a number that was
 * only ever a suggestion never reached the email at all.
 *
 * ── The model: a spreadsheet, where a typed number replaces a formula ──────
 *
 * A category's box FOLLOWS the Hub until a director types over it (Oct 2026).
 * Before this, "Fill" copied the Hub's number into the box, and a copy is a
 * snapshot: the lesson grades logged after the interim never reached it, and
 * an exam regraded after being added as a column never moved. Now:
 *
 *   • a LINKED column (one exam, one concert) is the Hub's live number until a
 *     number is typed into the cell;
 *   • a column of the director's own is whatever they typed;
 *   • a category is the average of its columns — or, with no exam / concert
 *     columns, of its live source (every graded exam, every concert required
 *     of the student, the applied lesson average) — unless a number is typed
 *     into the box itself;
 *   • incident columns take points OFF the category.
 *
 * Pure: no Firestore, no DOM, no ORG import, so `gradeTable.selfcheck.ts` runs
 * it under plain Node. The two things it cannot know — whether a student was
 * pulled from a concert, and who the signed-in teacher is — arrive as
 * arguments.
 */
import type { Assignment, AttendanceRecord, CalendarEvent, Student } from '../types';
import {
  attendanceByStudent, categoryResult, concertRequiredOf, concertRole, concertRoll, concertScore,
  examEvidence, gradeValue, itemKey, meetingsHeld, parseColumnKey, tallyCount, EMPTY_ATTENDANCE,
  type AttendanceEvidence, type CategoryResult, type ColumnKind, type ExamEvidence, type GradeCategory,
} from '../../shared/ensembleGrades';
import { gradeExcusedFromAudience } from '../../shared/audienceExcusal';

/** One column on the table, whatever its kind. */
export interface GradeColumn {
  /** The key it is stored under in `gradeMarks.scores`. */
  key: string;
  kind: ColumnKind;
  /** The category its numbers roll up into. */
  categoryId: string;
  label: string;
  /** A concert's date / an exam's due date, for ordering. Empty otherwise. */
  date: string;
  /** A concert's event id / an exam's assignment id. */
  refId?: string;
  /** An incident column: what each one costs. */
  points?: number;
}

export interface CellResult {
  /** A number typed into the cell, which replaces the live one. */
  typed: number | null;
  /** What the Hub says (exam grade, concert scans and roll); null for a column of the director's own. */
  live: number | null;
  /** typed ?? live — what the category adds up. */
  value: number | null;
}

export interface StudentGrades {
  student: Student;
  instrument: string;
  att: AttendanceEvidence;
  exams: ExamEvidence;
  concerts: { held: number; credited: number; incomplete: number; excused: number };
  /** Every column's cell, by column key (incident columns are in `counts`). */
  cells: Record<string, CellResult>;
  /** Incident count by column key. Blank is zero incidents. */
  counts: Record<string, number>;
  cats: Record<string, CategoryResult>;
  /** Category id → the number the grade uses. Only categories that have one. */
  scores: Record<string, number>;
}

export interface ExamOption {
  assignment: Assignment;
  /** Roster students whose confirmed grade the Hub can read as a whole 0-100. */
  graded: number;
  /** Roster students with a result whose score the Hub could NOT read. */
  unreadable: number;
  of: number;
}

export interface ConcertOption {
  event: CalendarEvent;
  /** 'performs' = someone on this table plays on it; 'required' = it is
   *  required of someone on this table in the audience; 'other' = neither. */
  relation: 'performs' | 'required' | 'other';
}

export interface PinnedList {
  /** Students whose typed number shadows a number the Hub can work out. */
  students: string[];
  /** Linked-column cells with a typed number shadowing a live one. */
  cells: { studentId: string; key: string }[];
}

export interface TableModel {
  columns: GradeColumn[];
  rows: StudentGrades[];
  meetings: number;
  /** Playing exams due in the window — what a box with no exam columns averages. */
  windowExams: ExamOption[];
  /** Concerts in the window that are required of at least one student here. */
  requiredConcerts: CalendarEvent[];
  /** Concerts this quarter that could still be added as a column. */
  concertOptions: ConcertOption[];
  /** Assignments this quarter that could still be added as a column. */
  examOptions: ExamOption[];
  /** Per category id. */
  pinned: Record<string, PinnedList>;
}

export interface TableInput {
  /** An ensemble id, or '' for the applied studio (no roll, exams or concerts). */
  ensembleId: string;
  plan: GradeCategory[];
  /** The report's window: the quarter's start through the cutoff. */
  span: { from: string; through: string };
  /** The quarter's own bounds — what "+ Add" may offer. */
  period: { start: string; end: string };
  today: string;
  roster: { student: Student; instrument: string }[];
  /** This table's docs, by student id. */
  marks: Record<string, { scores?: Record<string, unknown> } | undefined>;
  events: CalendarEvent[];
  records: AttendanceRecord[];
  checkins: { eventId: string; studentId: string; kind?: string }[];
  assignments: Assignment[];
  results: { assignmentId: string; studentId: string; score?: unknown }[];
  /** The signed-in teacher's lesson average per student (live). */
  lessonAverages: Record<string, number>;
  /** Pulled from this event by a roster override (#concert-excusals). */
  pulledFrom: (student: Student, ev: CalendarEvent) => boolean;
}

/** "Winter Concert · 12/10" — a concert column's heading. */
export function concertLabel(ev: { date: string; title?: string }): string {
  const [, m, d] = ev.date.split('-');
  return `${ev.title || 'Concert'} · ${Number(m)}/${Number(d)}`;
}

const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

export function buildTable(i: TableInput): TableModel {
  const { ensembleId, plan, span, period, today, roster, marks, events, assignments } = i;
  const eventsById = new Map(events.map(e => [e.id, e]));
  const assignmentsById = new Map(assignments.map(a => [a.id, a]));

  /* ── indexes, so a cell is a lookup and not a scan ── */
  const scans = new Map<string, { in: boolean; out: boolean }>();           // `${eventId}|${studentId}`
  for (const c of i.checkins) {
    const k = `${c.eventId}|${c.studentId}`;
    const p = scans.get(k) ?? { in: false, out: false };
    if (c.kind === 'out') p.out = true; else p.in = true;
    scans.set(k, p);
  }
  const rollMarks = new Map<string, string>();                                // `${eventId}|${studentId}` → status
  if (ensembleId) {
    for (const r of i.records) {
      if (r.ensembleId === ensembleId && r.eventId) rollMarks.set(`${r.eventId}|${r.studentId}`, r.status);
    }
  }
  const resultScore = new Map<string, unknown>();                             // `${assignmentId}|${studentId}`
  for (const r of i.results) resultScore.set(`${r.assignmentId}|${r.studentId}`, r.score);

  /* ── what the Hub itself says ── */
  const concertIds = new Set(events.filter(e => e.type === 'Concert').map(e => e.id));
  const attendance = ensembleId ? attendanceByStudent(i.records, ensembleId, span, concertIds) : {};
  const meetings = ensembleId ? meetingsHeld(events, ensembleId, span) : 0;

  const concertsInSpan = events
    .filter(e => e.type === 'Concert' && e.status !== 'Cancelled' && e.date >= span.from && e.date <= span.through)
    .sort((a, b) => a.date.localeCompare(b.date));

  const windowExamList = ensembleId
    ? assignments.filter(a => a.type === 'Playing Exam' && a.ensembleIds?.includes(ensembleId)
      && a.dueDate >= span.from && a.dueDate <= span.through)
    : [];

  function liveExam(studentId: string, assignmentId: string): number | null {
    return gradeValue(resultScore.get(`${assignmentId}|${studentId}`));
  }

  function liveConcert(student: Student, ev: CalendarEvent): number | null {
    const role = concertRole(student, ev);
    if (role === null) return null;
    const named = (ev.attendanceStudentIds ?? []).includes(student.id);
    const excused = (role !== 'performer' && !named && gradeExcusedFromAudience(student.grade, ev))
      || i.pulledFrom(student, ev);
    const scan = scans.get(`${ev.id}|${student.id}`);
    const rolled = !!(ensembleId && ev.rollTaken?.[ensembleId]);
    return concertScore({
      role,
      excused,
      hasIn: !!scan?.in,
      hasOut: !!scan?.out,
      entryOnly: !!ev.checkin?.entryOnly,
      roll: concertRoll(rolled, rollMarks.get(`${ev.id}|${student.id}`)),
    });
  }

  /* ── the columns on this table: the union of the keys its docs hold ── */
  const examCat = plan.find(c => c.suggest === 'exams');
  const concertCat = plan.find(c => c.suggest === 'concerts');
  const keys = new Set<string>();
  for (const m of Object.values(marks)) for (const k of Object.keys(m?.scores ?? {})) keys.add(k);

  const columns: GradeColumn[] = [];
  for (const key of keys) {
    const p = parseColumnKey(key);
    if (!p) continue;
    if (p.kind === 'concert') {
      if (!concertCat) continue; // no category to roll up into on this plan
      const ev = eventsById.get(p.id);
      columns.push({
        key, kind: 'concert', categoryId: concertCat.id, refId: p.id,
        label: ev ? concertLabel(ev) : 'Deleted concert', date: ev?.date ?? '',
      });
    } else if (p.kind === 'exam') {
      if (!examCat) continue;
      const a = assignmentsById.get(p.id);
      columns.push({
        key, kind: 'exam', categoryId: examCat.id, refId: p.id,
        label: a?.title ?? 'Deleted exam', date: a?.dueDate ?? '',
      });
    } else if (p.categoryId && plan.some(c => c.id === p.categoryId)) {
      columns.push({
        key, kind: p.kind, categoryId: p.categoryId, label: p.id, date: '', points: p.points,
      });
    }
  }
  const catIndex = new Map(plan.map((c, n) => [c.id, n]));
  const KIND_ORDER: Record<ColumnKind, number> = { concert: 0, exam: 0, custom: 1, tally: 2 };
  columns.sort((a, b) =>
    (catIndex.get(a.categoryId)! - catIndex.get(b.categoryId)!)
    || (KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
    || a.date.localeCompare(b.date)
    || a.label.localeCompare(b.label));
  const columnsOf = (catId: string) => columns.filter(c => c.categoryId === catId);

  /* ── per student ── */
  const pinned: Record<string, PinnedList> = {};
  for (const c of plan) pinned[c.id] = { students: [], cells: [] };
  const requiredEverywhere = new Set<string>();

  const rows: StudentGrades[] = roster.map(({ student, instrument }) => {
    const stored = (marks[student.id]?.scores ?? {}) as Record<string, unknown>;

    const required = concertsInSpan.filter(ev => concertRequiredOf(student, ev));
    const concertLives = required.map(ev => liveConcert(student, ev));
    for (const ev of required) requiredEverywhere.add(ev.id);
    const concerts = { held: 0, credited: 0, incomplete: 0, excused: 0 };
    for (const v of concertLives) {
      if (v === null) { concerts.excused += 1; continue; }
      concerts.held += 1;
      if (v === 100) concerts.credited += 1;
      else if (v === 50) concerts.incomplete += 1;
    }
    const concertRollup = categoryResult({ typed: null, inputs: concertLives, penalty: 0 }).derived;

    const examScores = windowExamList.flatMap(a => {
      const k = `${a.id}|${student.id}`;
      return resultScore.has(k) ? [{ score: resultScore.get(k) }] : [];
    });
    const exams = examEvidence(examScores, windowExamList.length);

    const cells: Record<string, CellResult> = {};
    const counts: Record<string, number> = {};
    for (const col of columns) {
      if (col.kind === 'tally') { counts[col.key] = tallyCount(stored[col.key]); continue; }
      const typed = gradeValue(stored[col.key]);
      let live: number | null = null;
      if (col.kind === 'exam' && col.refId) live = liveExam(student.id, col.refId);
      else if (col.kind === 'concert' && col.refId) {
        const ev = eventsById.get(col.refId);
        live = ev ? liveConcert(student, ev) : null;
      }
      cells[col.key] = { typed, live, value: typed ?? live };
    }

    const cats: Record<string, CategoryResult> = {};
    const scores: Record<string, number> = {};
    for (const c of plan) {
      const mine = columnsOf(c.id);
      const linked = mine.filter(col => col.kind === 'concert' || col.kind === 'exam');
      const inputs: Array<number | null> = [
        ...linked.map(col => cells[col.key].value),
        ...mine.filter(col => col.kind === 'custom').map(col => cells[col.key].value),
      ];
      // No exam / concert columns: the live source speaks for the category.
      if (linked.length === 0 && c.suggest) {
        inputs.push(
          c.suggest === 'exams' ? exams.suggested
            : c.suggest === 'concerts' ? concertRollup
              : i.lessonAverages[student.id] ?? null,
        );
      }
      const penalty = mine
        .filter(col => col.kind === 'tally')
        .reduce((sum, col) => sum + counts[col.key] * (col.points ?? 0), 0);
      const res = categoryResult({ typed: stored[c.id], inputs, penalty });
      cats[c.id] = res;
      if (res.value !== null) scores[c.id] = res.value;

      if (res.typed !== null && res.derived !== null) pinned[c.id].students.push(student.id);
      for (const col of linked) {
        const cell = cells[col.key];
        if (cell.typed !== null && cell.live !== null) pinned[c.id].cells.push({ studentId: student.id, key: col.key });
      }
    }

    return {
      student, instrument,
      att: { ...(attendance[student.id] ?? EMPTY_ATTENDANCE), meetings },
      exams, concerts, cells, counts, cats, scores,
    };
  });

  /* ── what the "+ Add" menus may still offer ── */
  const have = new Set(columns.map(c => c.key));
  const offerThrough = [period.end, today, span.through].reduce((a, b) => (a < b ? a : b));

  const graded = (a: Assignment): ExamOption => {
    let n = 0;
    let bad = 0;
    for (const { student } of roster) {
      const k = `${a.id}|${student.id}`;
      if (!resultScore.has(k)) continue;
      const raw = resultScore.get(k);
      if (gradeValue(raw) !== null) n += 1; else if (!isBlank(raw)) bad += 1;
    }
    return { assignment: a, graded: n, unreadable: bad, of: roster.length };
  };

  const concertOptions: ConcertOption[] = concertCat
    ? events
      .filter(e => e.type === 'Concert' && e.status !== 'Cancelled'
        && e.date >= period.start && e.date <= offerThrough && !have.has(itemKey('concert', e.id)))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(event => {
        const plays = roster.some(r => concertRole(r.student, event) === 'performer');
        const needed = !plays && roster.some(r => concertRequiredOf(r.student, event));
        return { event, relation: plays ? 'performs' as const : needed ? 'required' as const : 'other' as const };
      })
    : [];

  const examOptions: ExamOption[] = examCat && ensembleId
    ? assignments
      .filter(a => a.ensembleIds?.includes(ensembleId)
        && a.dueDate >= period.start && a.dueDate <= period.end && !have.has(itemKey('exam', a.id)))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map(graded)
    : [];

  return {
    columns,
    rows,
    meetings,
    windowExams: windowExamList.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(graded),
    requiredConcerts: concertsInSpan.filter(ev => requiredEverywhere.has(ev.id)),
    concertOptions,
    examOptions,
    pinned,
  };
}
