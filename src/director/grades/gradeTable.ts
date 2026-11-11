/**
 * The Gradebook's numbers (#gradebook) — which tables exist, who is on each,
 * every column, every cell and every student's grade, as plain functions over
 * plain arrays. The screen, the district email and the college "Copy the
 * table" export all read THIS, so they cannot disagree.
 *
 * ── The model (Nov 2026 rebuild): automatic intake ─────────────────────────
 *
 *   • Every graded thing in the Hub is its own column, the moment the first
 *     student on the table is graded on it: every assignment of every type,
 *     every concert required of someone on the table, the lesson average.
 *     Nobody adds a Hub column, and nobody can remove one (the grade exists);
 *     a director can only switch it to "Not counting", and it stays on screen.
 *   • A blank cell means NOT GRADED YET. It is never a zero, and a category is
 *     the mean of the cells that DO have a number — per student.
 *   • A number typed into a cell or a category box replaces the Hub's number
 *     (a spreadsheet typing over a formula), and the Hub's number is still
 *     known, so the screen can say "You typed 92. The Hub says 88."
 *   • A director's own columns (a paper grade) and penalty columns (each one
 *     takes N points off a category) sit beside the Hub's and change nothing
 *     about which Hub items count. There is no longer any mode in which adding
 *     a column makes other grades drop out — that was the bug this replaced.
 *   • Assignment grades are never gated by a due date or the "as of" date: a
 *     grade entered early or late still counts in the quarter it is due in.
 *     The "as of" date governs only things that HAPPEN on a date — a concert,
 *     a lesson, a roll — which have nothing to say before that date.
 *
 * ── High school and college ────────────────────────────────────────────────
 *
 * Every table is one world. A high school table never holds a college student
 * (they are on the MDC roll, not the district one), and a college table never
 * holds a high schooler. A college student in Symphony gets a "Symphony ·
 * College" table, so the grade follows the student rather than the report the
 * exam happened to be created under. College marks are stored in the same
 * `gradeMarks` collection under the group key `college:<ensembleId>`.
 *
 * Pure: no Firestore, no DOM, no ORG import, so `gradeTable.selfcheck.ts` runs
 * it under plain Node.
 */
import type { Assignment, AttendanceRecord, CalendarEvent, Ensemble, Lesson, Student } from '../types';
import {
  attendanceByStudent, categoryResult, concertRequiredOf, concertRole, concertRoll, concertScore,
  gradeValue, itemKey, meetingsHeld, parseColumnKey, tallyCount, tallyGrade, EMPTY_ATTENDANCE,
  type AttendanceEvidence, type CategoryResult, type ColumnKind, type GradeCategory,
} from '../../shared/ensembleGrades';
import { gradeExcusedFromAudience } from '../../shared/audienceExcusal';
import type { ReportLayout } from '../../shared/interimReport';

/* ─────────────────────────────── which tables ─────────────────────────── */

export type World = 'hs' | 'college';

/** One tab on the Gradebook. */
export interface TableSpec {
  /** Stable tab id: a report id ('camerata'), or `hs:<id>` / `college:<id>`. */
  id: string;
  /** The group's own name, without the world. */
  title: string;
  world: World;
  /** What `gradeMarks` docs for this table are filed under. */
  groupKey: string;
  /** College tables read a student's old high school doc for the same group
   *  until the first save files one of their own (marks made while the HS
   *  table still showed college students must not be lost). */
  legacyGroupKey?: string;
  /** An ensemble id, or '' for the applied studio. */
  ensembleId: string;
  /** The district report this table IS, when it is one. */
  layout?: ReportLayout;
}

/** The tab's label: "Symphony Orchestra · College". */
export const tabLabel = (t: TableSpec) => `${t.title} · ${t.world === 'hs' ? 'HS' : 'College'}`;

/** A college year is stored as "College Freshman" … "College Senior"
 *  (#signups), so a high schooler is anyone whose grade does not start there. */
export function isCollegeStudent(s: { grade?: string }): boolean {
  return (s.grade ?? '').trim().toLowerCase().startsWith('college');
}

/** The marks doc for a table rather than a student: which Hub columns are
 *  switched to "Not counting", and which of the director's own columns exist. */
export const TABLE_DOC = '_table';
/** In the table doc's `scores`: `off:<column key>` = 1 means "Not counting". */
export const offKey = (columnKey: string) => `off:${columnKey}`;

const isClass = (e: Pick<Ensemble, 'kind'>) => e.kind === 'class' || e.kind === 'masterclass';

/**
 * Every table the signed-in person gets, in tab order: the district's high
 * school reports first (as configured), then any other high school group with
 * a grade this quarter, then the college tables.
 *
 * `assigned` is the person's `assignedEnsembleIds` (the app's one answer to
 * "whose group is this"); null when they have none, in which case every
 * college ensemble shows plus any group somebody has graded. The configured
 * reports always show, as they always have.
 */
export function tableSpecs(i: {
  reports: ReportLayout[];
  ensembles: Pick<Ensemble, 'id' | 'name' | 'kind' | 'collegeLevel'>[];
  students: Pick<Student, 'id' | 'status' | 'grade' | 'ensembleIds'>[];
  assignments: Pick<Assignment, 'id' | 'dueDate' | 'ensembleIds'>[];
  results: { assignmentId: string; studentId: string; score?: unknown }[];
  period: { start: string; end: string };
  assigned: string[] | null;
}): TableSpec[] {
  const active = i.students.filter(s => s.status === 'Active');
  const byId = new Map(active.map(s => [s.id, s]));
  const reportGroups = new Set(i.reports.flatMap(r => (r.source.kind === 'ensemble' ? [r.source.ensembleId] : [])));
  const mine = (id: string) => !i.assigned || i.assigned.includes(id);

  // Which groups have a grade this quarter, per world.
  const quarterAsg = new Map(i.assignments
    .filter(a => a.dueDate >= i.period.start && a.dueDate <= i.period.end)
    .map(a => [a.id, a]));
  const graded: Record<World, Set<string>> = { hs: new Set(), college: new Set() };
  for (const r of i.results) {
    const a = quarterAsg.get(r.assignmentId);
    const s = byId.get(r.studentId);
    if (!a || !s || gradeValue(r.score) === null) continue;
    for (const e of a.ensembleIds ?? []) {
      if (s.ensembleIds?.includes(e)) graded[isCollegeStudent(s) ? 'college' : 'hs'].add(e);
    }
  }

  const out: TableSpec[] = i.reports.map(layout => {
    const ensembleId = layout.source.kind === 'ensemble' ? layout.source.ensembleId : '';
    return { id: layout.id, title: layout.title, world: 'hs', groupKey: ensembleId || layout.id, ensembleId, layout };
  });
  const name = (e: { name: string }) => e.name;
  const sorted = [...i.ensembles].sort((a, b) => Number(isClass(a)) - Number(isClass(b)) || name(a).localeCompare(name(b)));

  for (const e of sorted) {
    if (reportGroups.has(e.id) || !graded.hs.has(e.id) || !mine(e.id)) continue;
    out.push({ id: `hs:${e.id}`, title: e.name, world: 'hs', groupKey: e.id, ensembleId: e.id });
  }
  for (const e of sorted) {
    const hasCollege = active.some(s => isCollegeStudent(s) && s.ensembleIds?.includes(e.id));
    if (!hasCollege) continue;
    const include = reportGroups.has(e.id)
      || (i.assigned ? i.assigned.includes(e.id) : (!!e.collegeLevel && !isClass(e)) || graded.college.has(e.id));
    if (!include) continue;
    // A configured report's title ("Orchestra") is what the director knows the group as.
    const reportTitle = i.reports.find(r => r.source.kind === 'ensemble' && r.source.ensembleId === e.id)?.title;
    out.push({
      id: `college:${e.id}`, title: reportTitle ?? e.name, world: 'college',
      groupKey: `college:${e.id}`, legacyGroupKey: e.id, ensembleId: e.id,
    });
  }
  return out;
}

/**
 * Who belongs on one table — only that table's world, ever.
 *
 * An ensemble table is its roster. The applied table is the teacher's STUDIO:
 * everyone in `assignedStudentIds`, lesson or no lesson (an honest blank beats
 * a missing row), plus anyone they actually taught in the window. Both lists
 * are already scoped to the signed-in teacher.
 */
export function rosterFor(i: {
  spec: TableSpec;
  students: Student[];
  lessons: Lesson[];
  myEmail?: string;
  assignedStudentIds: string[];
  span: { from: string; through: string };
}): { student: Student; instrument: string }[] {
  const { spec } = i;
  const active = i.students.filter(s => s.status === 'Active'
    && isCollegeStudent(s) === (spec.world === 'college'));
  if (spec.ensembleId) {
    return active
      .filter(s => s.ensembleIds?.includes(spec.ensembleId))
      .map(s => ({ student: s, instrument: s.instrument ?? '' }));
  }
  const src = spec.layout?.source;
  const pattern = (src?.kind === 'appliedLessons' ? src.instrumentPattern : '')?.toLowerCase() ?? '';
  const matches = (instrument: string) => !pattern || instrument.toLowerCase().includes(pattern);
  const byId = new Map<string, string>();
  for (const id of i.assignedStudentIds) {
    const instrument = (i.students.find(s => s.id === id)?.instrument ?? '').trim();
    if (matches(instrument)) byId.set(id, instrument);
  }
  for (const l of i.lessons) {
    if (i.myEmail && l.teacherEmail !== i.myEmail) continue;
    if (l.date < i.span.from || l.date > i.span.through || l.status === 'Cancelled') continue;
    const instrument = (l.instrument || i.students.find(s => s.id === l.studentId)?.instrument || '').trim();
    if (matches(instrument)) byId.set(l.studentId, instrument);
  }
  return active
    .filter(s => byId.has(s.id))
    .map(s => ({ student: s, instrument: byId.get(s.id) || (s.instrument ?? '') }));
}

/* ─────────────────────────────── one table ────────────────────────────── */

/** `exam:<id>` for an assignment of ANY type (the key predates the other
 *  types and holds live overrides), `concert:<id>`, the lesson average, a
 *  director's own column (`x:`) or a penalty column (`d:`). */
export type Kind = ColumnKind | 'lessons';
export const LESSON_KEY = 'lessons:avg';

export interface GradeColumn {
  key: string;
  kind: Kind;
  categoryId: string;
  label: string;
  /** Due date / concert date, for ordering and the header. '' otherwise. */
  date: string;
  refId?: string;
  /** Penalty column: what each one costs. */
  points?: number;
  /** False when the director switched this Hub column to "Not counting". */
  counting: boolean;
  /** Hub columns: students with a number, of the students it is for. */
  graded: number;
  of: number;
}

/** Why a cell is blank, said in words on the cell. */
export type BlankReason = 'not-graded' | 'not-theirs' | 'excused' | 'unreadable';

export interface CellResult {
  /** A number typed into the cell. */
  typed: number | null;
  /** What the Hub says; always null for a director's own column. */
  live: number | null;
  /** typed ?? live — what the category adds up. */
  value: number | null;
  /** Why there is no number, when there is none. */
  blank?: BlankReason;
  /** A mark the Hub holds that is not a 0-100 number ("Pass", "A-"). */
  raw?: string;
}

export interface StudentGrades {
  student: Student;
  instrument: string;
  att: AttendanceEvidence;
  /** By column key. Penalty columns are in `counts`. */
  cells: Record<string, CellResult>;
  counts: Record<string, number>;
  cats: Record<string, CategoryResult>;
  /** Category id → the number the final grade uses. */
  scores: Record<string, number>;
  /** The final grade, or null below the coverage floor. */
  final: number | null;
}

export interface TableModel {
  columns: GradeColumn[];
  rows: StudentGrades[];
  meetings: number;
  /** Category ids with no grade column on this table: a box a person fills. */
  judgement: Set<string>;
}

export interface TableInput {
  /** An ensemble id, or '' for the applied studio. */
  ensembleId: string;
  plan: GradeCategory[];
  /** The quarter's start through the "as of" date. */
  span: { from: string; through: string };
  /** The quarter's own bounds — what an assignment's due date files it into. */
  period: { start: string; end: string };
  today: string;
  roster: { student: Student; instrument: string }[];
  /** This table's docs by student id, plus `TABLE_DOC`. */
  marks: Record<string, { scores?: Record<string, unknown> } | undefined>;
  events: CalendarEvent[];
  records: AttendanceRecord[];
  checkins: { eventId: string; studentId: string; kind?: string }[];
  assignments: Assignment[];
  results: { assignmentId: string; studentId: string; score?: unknown }[];
  /** Lesson average per student, through the "as of" date. */
  lessonAverages: Record<string, number>;
  /** Pulled from this event by a roster override (#concert-excusals). */
  pulledFrom: (student: Student, ev: CalendarEvent) => boolean;
}

/** "Winter Concert · 12/10". */
export function concertLabel(ev: { date: string; title?: string }): string {
  const [, m, d] = ev.date.split('-');
  return `${ev.title || 'Concert'} · ${Number(m)}/${Number(d)}`;
}

/** The category an assignment of this type counts toward: the one that names
 *  the type, else the plan's exam category. */
export function categoryForAssignment(plan: GradeCategory[], type: string): GradeCategory | undefined {
  return plan.find(c => c.assignmentTypes?.includes(type)) ?? plan.find(c => c.suggest === 'exams');
}

const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

export function buildTable(i: TableInput): TableModel {
  const { ensembleId, plan, span, period, roster, marks, events, assignments } = i;
  const eventsById = new Map(events.map(e => [e.id, e]));
  const assignmentsById = new Map(assignments.map(a => [a.id, a]));
  const rosterIds = new Set(roster.map(r => r.student.id));
  const stored = (id: string) => (marks[id]?.scores ?? {}) as Record<string, unknown>;
  const tableDoc = stored(TABLE_DOC);
  const isOff = (key: string) => !!tableDoc[offKey(key)];

  /* ── indexes ── */
  const scans = new Map<string, { in: boolean; out: boolean }>();
  for (const c of i.checkins) {
    const k = `${c.eventId}|${c.studentId}`;
    const p = scans.get(k) ?? { in: false, out: false };
    if (c.kind === 'out') p.out = true; else p.in = true;
    scans.set(k, p);
  }
  const rollMarks = new Map<string, string>();
  for (const r of i.records) if (r.eventId) rollMarks.set(`${r.eventId}|${r.studentId}|${r.ensembleId}`, r.status);
  const resultScore = new Map<string, unknown>();
  for (const r of i.results) resultScore.set(`${r.assignmentId}|${r.studentId}`, r.score);

  const concertIds = new Set(events.filter(e => e.type === 'Concert').map(e => e.id));
  const attendance = ensembleId ? attendanceByStudent(i.records, ensembleId, span, concertIds) : {};
  const meetings = ensembleId ? meetingsHeld(events, ensembleId, span) : 0;

  /** One student's live number for one concert (unchanged rules, #concert-roll). */
  function liveConcert(student: Student, ev: CalendarEvent): number | null {
    if (ev.status === 'Cancelled') return null;
    const role = concertRole(student, ev);
    if (role === null) return null;
    if (role === 'audience' && ev.concertAttendance !== 'required') return null;
    const named = (ev.attendanceStudentIds ?? []).includes(student.id);
    const excused = (role !== 'performer' && !named && gradeExcusedFromAudience(student.grade, ev))
      || i.pulledFrom(student, ev);
    const scan = scans.get(`${ev.id}|${student.id}`);
    // A performer's roll is the one their OWN director took: this table's group
    // when it plays on the concert, otherwise the groups the student plays with.
    const rollGroups = role !== 'performer' ? []
      : ensembleId && ev.ensembleIds?.includes(ensembleId) ? [ensembleId]
        : (ev.ensembleIds ?? []).filter(e => student.ensembleIds?.includes(e));
    const rolled = rollGroups.some(e => !!ev.rollTaken?.[e]);
    const ms = rollGroups.map(e => rollMarks.get(`${ev.id}|${student.id}|${e}`));
    const status = ms.includes('Absent') ? 'Absent' : ms.includes('Excused') ? 'Excused' : ms.find(Boolean);
    return concertScore({
      role, excused, hasIn: !!scan?.in, hasOut: !!scan?.out, entryOnly: !!ev.checkin?.entryOnly,
      roll: concertRoll(rolled, status),
    });
  }

  /** Any number typed into this key by anybody on the table. */
  const anyTyped = (key: string) => roster.some(r => gradeValue(stored(r.student.id)[key]) !== null);

  /* ── the columns ── */
  type Cell = (s: Student) => CellResult;
  const columns: GradeColumn[] = [];
  const cellOf = new Map<string, Cell>();
  const withTyped = (key: string, s: Student, live: number | null, extra: Partial<CellResult> = {}): CellResult => {
    const typed = gradeValue(stored(s.id)[key]);
    const value = typed ?? live;
    return { typed, live, value, ...(value === null ? extra : {}) };
  };

  // 1. Every assignment due this quarter that reaches the table, of any type.
  if (ensembleId) {
    for (const a of assignments) {
      if (a.dueDate < period.start || a.dueDate > period.end) continue;
      const cat = categoryForAssignment(plan, a.type);
      if (!cat) continue;
      const key = itemKey('exam', a.id);
      const assignedTo = (s: Student) => !!a.ensembleIds?.includes(ensembleId) && !!s.ensembleIds?.includes(ensembleId)
        || !!a.studentIds?.includes(s.id);
      const reaches = a.ensembleIds?.includes(ensembleId) || roster.some(r => a.studentIds?.includes(r.student.id));
      if (!reaches) continue;
      let graded = 0;
      let of = 0;
      for (const { student } of roster) {
        const hasGrade = gradeValue(resultScore.get(`${a.id}|${student.id}`)) !== null;
        if (hasGrade) graded += 1;
        if (hasGrade || assignedTo(student)) of += 1;
      }
      if (graded === 0 && !anyTyped(key)) continue; // appears with its first grade
      columns.push({
        key, kind: 'exam', categoryId: cat.id, label: a.title, date: a.dueDate, refId: a.id,
        counting: !isOff(key), graded, of,
      });
      cellOf.set(key, s => {
        const raw = resultScore.get(`${a.id}|${s.id}`);
        const live = gradeValue(raw);
        const blank: BlankReason = !isBlank(raw) ? 'unreadable' : assignedTo(s) ? 'not-graded' : 'not-theirs';
        return withTyped(key, s, live, { blank, ...(blank === 'unreadable' ? { raw: String(raw) } : {}) });
      });
    }
  }

  // A number typed under an exam that no longer exists is kept and labelled.
  const keysOnTable = new Set<string>();
  for (const [id, m] of Object.entries(marks)) {
    if (id !== TABLE_DOC && !rosterIds.has(id)) continue;
    for (const k of Object.keys(m?.scores ?? {})) keysOnTable.add(k);
  }

  // 2. Every concert required of someone on the table, once it has happened.
  const concertCat = plan.find(c => c.suggest === 'concerts');
  const concertsThrough = span.through < i.today ? span.through : i.today;
  if (concertCat && ensembleId) {
    for (const ev of [...events].sort((a, b) => a.date.localeCompare(b.date))) {
      const concertLike = ev.type === 'Concert' || ev.concertAttendance === 'required';
      if (!concertLike || ev.date < span.from || ev.date > period.end) continue;
      const key = itemKey('concert', ev.id);
      const happened = ev.date <= concertsThrough;
      const live = (s: Student) => (happened && concertRequiredOf(s, ev) ? liveConcert(s, ev) : null);
      let graded = 0;
      let of = 0;
      for (const { student } of roster) {
        if (!concertRequiredOf(student, ev)) continue;
        of += 1;
        if (live(student) !== null) graded += 1;
      }
      if (graded === 0 && !anyTyped(key)) continue;
      columns.push({
        key, kind: 'concert', categoryId: concertCat.id,
        label: `${concertLabel(ev)}${ev.status === 'Cancelled' ? ' (cancelled)' : ''}`,
        date: ev.date, refId: ev.id, counting: !isOff(key), graded, of,
      });
      cellOf.set(key, s => withTyped(key, s, live(s), {
        blank: !concertRequiredOf(s, ev) ? 'not-theirs' : happened ? 'excused' : 'not-graded',
      }));
    }
  }

  // 3. The lesson average.
  const lessonCat = plan.find(c => c.suggest === 'lessons');
  if (lessonCat) {
    const graded = roster.filter(r => i.lessonAverages[r.student.id] !== undefined).length;
    if (graded > 0 || anyTyped(LESSON_KEY)) {
      columns.push({
        key: LESSON_KEY, kind: 'lessons', categoryId: lessonCat.id, label: 'Lesson average',
        date: '', counting: !isOff(LESSON_KEY), graded, of: roster.length,
      });
      cellOf.set(LESSON_KEY, s => withTyped(LESSON_KEY, s, i.lessonAverages[s.id] ?? null, { blank: 'not-graded' }));
    }
  }

  // 4. Typed numbers under Hub items that are gone, and the director's own columns.
  const have = new Set(columns.map(c => c.key));
  for (const key of keysOnTable) {
    if (have.has(key)) continue;
    const p = parseColumnKey(key);
    if (!p) continue;
    if (p.kind === 'exam' || p.kind === 'concert') {
      // A legacy column for an item that is not (or no longer) a Hub column here:
      // kept only if somebody typed a number into it, so nothing typed is lost.
      if (!anyTyped(key)) continue;
      const cat = p.kind === 'concert' ? concertCat : (() => {
        const a = assignmentsById.get(p.id);
        return a ? categoryForAssignment(plan, a.type) : plan.find(c => c.suggest === 'exams');
      })();
      if (!cat) continue;
      const ev = p.kind === 'concert' ? eventsById.get(p.id) : undefined;
      const a = p.kind === 'exam' ? assignmentsById.get(p.id) : undefined;
      const label = p.kind === 'concert'
        ? (ev ? `${concertLabel(ev)}${ev.status === 'Cancelled' ? ' (cancelled)' : ''}` : 'Deleted concert')
        : (a?.title ?? 'Deleted assignment');
      const graded = roster.filter(r => gradeValue(stored(r.student.id)[key]) !== null).length;
      columns.push({
        key, kind: p.kind, categoryId: cat.id, label, date: ev?.date ?? a?.dueDate ?? '', refId: p.id,
        counting: !isOff(key), graded, of: roster.length,
      });
      cellOf.set(key, s => withTyped(key, s, null, { blank: 'not-graded' }));
    } else if (p.categoryId && plan.some(c => c.id === p.categoryId)) {
      columns.push({
        key, kind: p.kind, categoryId: p.categoryId, label: p.id, date: '', points: p.points,
        counting: true, graded: 0, of: roster.length,
      });
      if (p.kind === 'custom') cellOf.set(key, s => withTyped(key, s, null, { blank: 'not-graded' }));
    }
  }

  const catIndex = new Map(plan.map((c, n) => [c.id, n]));
  const KIND_ORDER: Record<Kind, number> = { exam: 0, concert: 0, lessons: 0, custom: 1, tally: 2 };
  columns.sort((a, b) =>
    (catIndex.get(a.categoryId)! - catIndex.get(b.categoryId)!)
    || (KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
    || a.date.localeCompare(b.date)
    || a.label.localeCompare(b.label));
  for (const c of columns) {
    if (c.kind === 'custom') c.graded = roster.filter(r => gradeValue(stored(r.student.id)[c.key]) !== null).length;
  }

  // A box a person fills: nothing in the Hub feeds it by design (no `suggest`),
  // and no grade column of any kind sits under it on this table.
  const judgement = new Set(plan
    .filter(c => !c.suggest && !columns.some(col => col.categoryId === c.id && col.kind !== 'tally'))
    .map(c => c.id));

  /* ── per student ── */
  const rows: StudentGrades[] = roster.map(({ student, instrument }) => {
    const mine = stored(student.id);
    const cells: Record<string, CellResult> = {};
    const counts: Record<string, number> = {};
    for (const col of columns) {
      if (col.kind === 'tally') counts[col.key] = tallyCount(mine[col.key]);
      else cells[col.key] = cellOf.get(col.key)!(student);
    }
    const cats: Record<string, CategoryResult> = {};
    const scores: Record<string, number> = {};
    for (const c of plan) {
      const own = columns.filter(col => col.categoryId === c.id);
      const inputs = own.filter(col => col.kind !== 'tally' && col.counting).map(col => cells[col.key].value);
      const penalty = own.filter(col => col.kind === 'tally').reduce((sum, col) => sum + counts[col.key] * (col.points ?? 0), 0);
      const res = categoryResult({ typed: mine[c.id], inputs, penalty });
      cats[c.id] = res;
      if (res.value !== null) scores[c.id] = res.value;
    }
    return {
      student, instrument,
      att: { ...(attendance[student.id] ?? EMPTY_ATTENDANCE), meetings },
      cells, counts, cats, scores,
      final: tallyGrade(plan, scores).percent,
    };
  });

  return { columns, rows, meetings, judgement };
}

/* ──────────────────────────────── the export ──────────────────────────── */

/**
 * The grid as rows of text, for "Copy the table" (college grade entry, or any
 * table that is not a district report): name, every item column, every
 * category average, the final percent. A blank is an EMPTY cell, never a zero.
 */
export function gridRows(model: TableModel, plan: GradeCategory[], name: (s: Student) => string): string[][] {
  const cols = model.columns;
  const header = [
    'Name',
    ...cols.map(c => (c.kind === 'tally' ? `${c.label} (count, −${c.points} each)` : c.counting ? c.label : `${c.label} (not counting)`)),
    ...plan.map(c => c.label),
    'Final %',
  ];
  const text = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));
  const body = [...model.rows]
    .sort((a, b) => name(a.student).localeCompare(name(b.student)))
    .map(r => [
      name(r.student),
      ...cols.map(c => (c.kind === 'tally' ? (r.counts[c.key] ? String(r.counts[c.key]) : '') : text(r.cells[c.key]?.value))),
      ...plan.map(c => text(r.cats[c.id].value)),
      text(r.final),
    ]);
  return [header, ...body];
}

/** Tab-separated, which pastes straight into a spreadsheet. */
export const rowsToTsv = (rows: string[][]) => rows.map(r => r.join('\t')).join('\n');
