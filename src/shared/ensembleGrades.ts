/**
 * Ensemble grading arithmetic (#gradebook) — the ONE definition of what a
 * quarter grade adds up to, and of what the district requires alongside it.
 *
 * Pure: no Firestore, no DOM, no ORG import, explicit `.ts` on relative
 * imports, so the Gradebook screen, the report builder and the self-check all
 * run the same numbers under plain Node. Same posture as `lessonGrades.ts`,
 * which solved this shape for applied lessons: a strict reader that fails
 * closed, and arithmetic over records the caller already has.
 *
 * ── What the Hub computes, and what it does not ──────────────────────────
 *
 * The director's call (2026-09-14): **the Hub does not grade attendance.**
 * An excused absence costs nothing and is a record only; an unexcused absence
 * or lateness informs the Preparation & Participation mark, and how much it
 * informs it is the director's judgement, made with the counts in front of
 * them. So every category here is a number a person types. Two of them arrive
 * with a SUGGESTION computed from Hub data (playing exams, required concerts)
 * because those are countable rather than observed, and a suggestion is
 * always overwritable.
 *
 * That is a deliberate narrowing of what an earlier design proposed. It is
 * also the honest shape: roll in this app is exception-only, so a "present"
 * record does not exist, and a rate computed from a denominator the director
 * did not know they were creating is worse than a number they chose.
 *
 * ── The three invariants ────────────────────────────────────────────────
 *
 *   1. **Re-normalize over scored categories.** A category with no number
 *      leaves the numerator AND the denominator, so an interim in week three
 *      is not punished for a playing exam that has not happened. This is the
 *      workbook's own formula, verbatim.
 *   2. **A blank is never a zero.** Same fail-closed reader as
 *      `lessonGradeValue` and `criterionPointValue`: anything that is not a
 *      whole 0-100 reads as NOT SCORED.
 *   3. **Below the coverage floor there is no percent at all.** A confident
 *      94 computed from one category out of six, arriving in a district
 *      gradebook, is the worst thing this module could produce.
 */

import { scansCredited } from './concertCheckin.ts';

/** One weighted line of a course's grading plan. */
export interface GradeCategory {
  /** Stable key, independent of the label, so renaming a line keeps its marks. */
  id: string;
  label: string;
  /** Points out of the plan's total. Whole number, 1-100. */
  weight: number;
  /**
   * Where a suggested value comes from, when one can be computed.
   *   • 'exams'    — mean of this quarter's graded playing exams.
   *   • 'concerts' — required concerts credited over required concerts held.
   *   • 'lessons'  — the applied teacher's own term average for this student.
   *   • absent     — nothing to compute; see `fillWith`.
   */
  suggest?: 'exams' | 'concerts' | 'lessons';
  /**
   * The value the column's Fill button writes when there is nothing to
   * compute (director's call, 2026-09-14): start the observed categories at
   * full marks and adjust down from there, which is the same exception-only
   * shape as taking roll.
   *
   * `FULL_MARKS` when absent, so every judgement category gets the button
   * without config having to say so. Set it explicitly to start a category
   * somewhere other than 100.
   *
   * The cost is real and worth stating: once a column is filled, a student
   * you never looked at is indistinguishable from one you considered and
   * left at 100. Blank was the signal that a row still needed you. Fill
   * trades that signal for speed, deliberately, and only when pressed.
   */
  fillWith?: number;
}

/** What an unadjusted judgement category is worth. */
export const FULL_MARKS = 100;

/**
 * What this column's Fill button writes for one student: the computed
 * suggestion where there is one, otherwise full marks. Null means there is
 * nothing to write — an exam nobody has graded suggests nothing, and filling
 * a zero there would be a grade nobody gave.
 */
export function fillValueFor(
  category: GradeCategory,
  suggested: number | null,
): number | null {
  if (category.suggest) return suggested;
  return category.fillWith ?? FULL_MARKS;
}

export const GRADE_MIN = 0;
export const GRADE_MAX = 100;

/**
 * Fraction of the plan's total weight that must be scored before a percent is
 * produced at all. Half: enough for an early interim built on attendance,
 * preparation and one exam, not so little that a single category masquerades
 * as a grade.
 */
export const COVERAGE_FLOOR = 0.5;

/**
 * The ONE reader of a typed category score. Returns the number, or null for
 * anything that is not a whole 0-100 — blank, "A", "95.5", "-5", "1000".
 */
export function gradeValue(v: unknown): number | null {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = Number(s);
  return n >= GRADE_MIN && n <= GRADE_MAX ? n : null;
}

/* ─────────────────────────── effort and conduct ─────────────────────────── */

/** Effort runs 1 (best) to 3 (worst) — the district's scale, not ours. */
export const EFFORT_GRADES = ['1', '2', '3'] as const;
export type EffortGrade = (typeof EFFORT_GRADES)[number];

/** Conduct is A, B, C, D or F. There is no E. */
export const CONDUCT_GRADES = ['A', 'B', 'C', 'D', 'F'] as const;
export type ConductGrade = (typeof CONDUCT_GRADES)[number];

export function effortValue(v: unknown): EffortGrade | null {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  return (EFFORT_GRADES as readonly string[]).includes(s) ? (s as EffortGrade) : null;
}

export function conductValue(v: unknown): ConductGrade | null {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : '';
  return (CONDUCT_GRADES as readonly string[]).includes(s) ? (s as ConductGrade) : null;
}

/* ──────────────────────────── the weighted grade ────────────────────────── */

export interface GradeTally {
  /** The weighted percent over scored categories, or null below the floor. */
  percent: number | null;
  /** Weight of the categories carrying a number. */
  scoredWeight: number;
  /** Weight of every category in the plan, scored or not. */
  totalWeight: number;
  scored: number;
  of: number;
  /** Every category has a number. */
  complete: boolean;
}

/**
 * Add up a set of typed scores against a plan.
 *
 * The arithmetic is the workbook's, verbatim:
 *   round( Σ(score × weight) / Σ(weight), 0 ) over the SCORED categories.
 *
 * Returns `percent: null` when nothing is scored or when the scored weight is
 * under `COVERAGE_FLOOR` of the plan — see invariant 3.
 */
export function tallyGrade(
  categories: GradeCategory[],
  scores: Record<string, unknown> | undefined,
): GradeTally {
  let num = 0;
  let scoredWeight = 0;
  let totalWeight = 0;
  let scored = 0;
  for (const c of categories) {
    totalWeight += c.weight;
    const v = gradeValue(scores?.[c.id]);
    if (v === null) continue;
    num += v * c.weight;
    scoredWeight += c.weight;
    scored += 1;
  }
  const enough = scoredWeight > 0 && totalWeight > 0 && scoredWeight >= totalWeight * COVERAGE_FLOOR;
  return {
    percent: enough ? Math.round(num / scoredWeight) : null,
    scoredWeight,
    totalWeight,
    scored,
    of: categories.length,
    complete: categories.length > 0 && scored === categories.length,
  };
}

/** A sentence naming what is wrong with an edited plan, or null. */
export function planProblem(categories: GradeCategory[]): string | null {
  if (categories.length === 0) return null; // empty = grading off here, on purpose
  const seen = new Set<string>();
  for (const c of categories) {
    if (!c.label.trim()) return 'Every category needs a name.';
    if (!Number.isInteger(c.weight) || c.weight < 1 || c.weight > 100) {
      return `"${c.label.trim()}" needs a whole number of points, 1-100.`;
    }
    if (seen.has(c.id)) return 'Two categories share an id — remove one.';
    seen.add(c.id);
  }
  return null;
}

/* ──────────────────────── evidence: what the Hub knows ──────────────────── */

/** The marks the Hub holds for one student in one group over one window.
 *  Context for the director's judgement, never a computed grade. */
export interface AttendanceEvidence {
  /** Unexcused absences — `Absent`. */
  absent: number;
  /** Excused absences — `Excused`. A record only; costs nothing. */
  excused: number;
  /** Unexcused lateness — `Late`. */
  late: number;
  /** Excused lateness — `LateExcused`. A record only. */
  lateExcused: number;
  /** Whole-rehearsal lesson pull-outs. NEVER an absence (#applied). */
  lesson: number;
  /** Rehearsals with a roll receipt for this group in the window. */
  meetings: number;
}

export const EMPTY_ATTENDANCE: AttendanceEvidence = {
  absent: 0, excused: 0, late: 0, lateExcused: 0, lesson: 0, meetings: 0,
};

/** One attendance mark, as little of it as this module needs. */
export interface MarkLike {
  studentId: string;
  ensembleId: string;
  date: string;
  status: string;
  /** The rehearsal or concert the roll was taken for (absent on an old mark). */
  eventId?: string;
}

/**
 * Tally one group's marks for one window, per student.
 *
 * Only the four roll marks are counted, and each in its own bucket, because
 * the director grades unexcused and excused differently and a module that
 * added them together would take that choice away. A `Lesson` record is
 * counted separately and is never an absence.
 *
 * School-day tardies are deliberately NOT here and must never be merged in:
 * arriving late to the BUILDING says nothing about walking into Camerata on
 * time, and conflating the two was a real bug in Aug 2026 (#tardies).
 *
 * `excludeEventIds` is how concerts stay out (#concert-roll): a concert takes
 * roll now, and an absence from it is the evidence of the CONCERTS category,
 * which `concertRoll` / `rollEffect` read. Counted here as well, one absence
 * would cost twice. Omitted = nothing skipped, which is every caller that
 * predates concert roll.
 */
export function attendanceByStudent(
  marks: MarkLike[],
  ensembleId: string,
  window: { from: string; through: string },
  excludeEventIds?: ReadonlySet<string>,
): Record<string, AttendanceEvidence> {
  const out: Record<string, AttendanceEvidence> = {};
  for (const m of marks) {
    if (m.ensembleId !== ensembleId) continue;
    if (m.date < window.from || m.date > window.through) continue;
    if (m.eventId && excludeEventIds?.has(m.eventId)) continue;
    const e = (out[m.studentId] ??= { ...EMPTY_ATTENDANCE });
    if (m.status === 'Absent') e.absent += 1;
    else if (m.status === 'Excused') e.excused += 1;
    else if (m.status === 'Late') e.late += 1;
    else if (m.status === 'LateExcused') e.lateExcused += 1;
    else if (m.status === 'Lesson') e.lesson += 1;
  }
  return out;
}

/** Minimal event shape for counting meetings held. */
export interface MeetingLike {
  date: string;
  type?: string;
  rollTaken?: Record<string, unknown> | null;
}

/**
 * How many times this group actually met and took roll in the window.
 *
 * The denominator is the ROLL RECEIPT, not the calendar. A rehearsal that was
 * cancelled, moved, or never rolled is not a meeting anybody missed, and
 * counting it would mark down a whole section silently. It follows that a
 * director who skips roll shrinks this number, which is correct and is why
 * the screen prints it beside the absences rather than hiding it inside a
 * percentage.
 *
 * A concert is a performance, not a meeting (#concert-roll): it takes roll
 * now, and counting its receipt here would enlarge the denominator the
 * rehearsal absences are read against.
 */
export function meetingsHeld(
  events: MeetingLike[],
  ensembleId: string,
  window: { from: string; through: string },
): number {
  let n = 0;
  for (const e of events) {
    if (e.type === 'Concert') continue;
    if (e.date < window.from || e.date > window.through) continue;
    if (e.rollTaken && Object.prototype.hasOwnProperty.call(e.rollTaken, ensembleId)) n += 1;
  }
  return n;
}

/* ───────────────────────────── the suggestions ──────────────────────────── */

export interface ExamEvidence {
  /** The scores that carried a number, in the order the exams are due. */
  scores: number[];
  /** How many exams in this window the student could have been graded on. */
  of: number;
  /** Mean of `scores`, rounded — the suggestion. Null when none are graded. */
  suggested: number | null;
}

/**
 * Mean of a student's graded playing exams in the window.
 *
 * "At least as far as the ones that show a grade" (the director, 2026-09-14):
 * an ungraded exam is left out rather than counted as a zero, so a student
 * whose video has not been watched yet is not failing for it. `of` reports
 * how many were available so the screen can say "2 of 3".
 */
export function examEvidence(
  raw: { score?: unknown }[],
  available: number,
): ExamEvidence {
  const scores: number[] = [];
  for (const r of raw) {
    const v = gradeValue(r.score);
    if (v !== null) scores.push(v);
  }
  const suggested = scores.length
    ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length)
    : null;
  return { scores, of: available, suggested };
}

export interface ConcertEvidence {
  /** Required concerts credited to this student in the window. */
  credited: number;
  /** Required concerts that were HELD in the window. */
  held: number;
  /** Choice concerts credited this semester. */
  choice: number;
  /** Concerts checked into but never out of — no credit, worth showing. */
  incomplete: number;
  /** `credited / held` as a percent, or null when none were held yet. */
  suggested: number | null;
}

/**
 * Required-concert credit over required concerts held.
 *
 * The workbook's formula, verbatim, and the reason it is a suggestion rather
 * than the grade: a concert a student performed IN is credited automatically
 * by the syllabus and never produces a scan, so the raw ratio under-counts
 * anyone who was on stage. The director sees the ratio and decides.
 */
export function concertSuggestion(
  credited: number,
  held: number,
): number | null {
  if (held <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((credited / held) * 100)));
}

/* ──────────────── item columns: one concert, one exam, one grade ────────── */

/**
 * A director can add a column to the Gradebook for ONE concert or ONE playing
 * exam (director's request, 2026-10-01). The column's numbers live in the
 * same `scores` map as the categories, under a prefixed key —
 * `concert:<eventId>` or `exam:<assignmentId>` — so there is no new
 * collection, no rules change, and `tallyGrade` (which reads only plan ids)
 * cannot be fooled into counting a column as a category of its own.
 *
 * A column FOLLOWS the Hub until a director types over it (Oct 2026): a blank
 * cell is the live number — the exam's confirmed grade, the concert's scans
 * and roll — and a typed number is a deliberate override. Nothing is copied
 * into the cell when the column is added, because a copy goes stale the day
 * an exam is regraded or a roll is finished. `categoryResult` below is what a
 * category's box adds up to.
 */
export type ItemKind = 'concert' | 'exam';

/** Which item kind feeds which suggesting category. */
export const ITEM_KIND_FOR: Partial<Record<NonNullable<GradeCategory['suggest']>, ItemKind>> = {
  concerts: 'concert',
  exams: 'exam',
};

export function itemKey(kind: ItemKind, id: string): string {
  return `${kind}:${id}`;
}

export function parseItemKey(key: string): { kind: ItemKind; id: string } | null {
  const m = /^(concert|exam):(.+)$/.exec(key);
  return m ? { kind: m[1] as ItemKind, id: m[2] } : null;
}

/**
 * What a concert's ROLL says about one student (#concert-roll).
 *   'absent'  — marked Absent. No credit, and it stays in their denominator.
 *   'excused' — marked Absent (Excused). Not counted against them.
 *   'present' — roll was finished and they carry no absence. Roll is
 *               exception-only, so "no mark" IS present; Late and Late
 *               (Excused) were there too — punctuality is the director's
 *               judgement in another category, not a missed concert.
 *   null      — roll was never finished and nothing was marked, so nobody can
 *               be called present and the concert says nothing about them.
 *
 * A mark is a fact; only "no mark means present" needs the roll to have been
 * finished (`rollTaken` on the event), so a mark the director actually tapped
 * counts even if they never pressed Finish.
 */
export type ConcertRoll = 'present' | 'absent' | 'excused' | null;

export function concertRoll(rolled: boolean, status: string | undefined): ConcertRoll {
  if (status === 'Absent') return 'absent';
  if (status === 'Excused') return 'excused';
  return rolled ? 'present' : null;
}

/**
 * What the roll adds to one student's count for one REQUIRED concert — the
 * roll-up half of #concert-roll (the per-concert column reads `concertRoll`
 * through `concertItemScore`).
 *   'credit'  — they played and were there: one more concert credited.
 *   'excused' — it leaves their denominator, same as a pull-out does.
 *   'none'    — the roll has nothing to add.
 *
 * A pair of scans that already earned credit is never counted a second time,
 * and it outranks an excused mark: a student who checked in and out was there.
 * Roll never credits someone who does not play on the concert — an audience
 * requirement is the door scan's business, not roll's.
 */
export function rollEffect(i: {
  scanCredited: boolean; performs: boolean; roll: ConcertRoll;
}): 'credit' | 'excused' | 'none' {
  if (i.scanCredited) return 'none';
  if (i.roll === 'excused') return 'excused';
  if (i.roll === 'present' && i.performs) return 'credit';
  return 'none';
}

/**
 * One student's grade for one concert, from the check-in scans.
 *   checked in AND out (or the arrival scan on an entry-only night) → 100
 *   one scan only                                                   → 50
 *   no scan                                                         → 0
 * A student who PERFORMED on the concert is credited by the syllabus and
 * never scans, so they get 100 — unless the concert's roll marked them Absent
 * (`roll`, #concert-roll), when the syllabus credit is exactly what they did
 * not earn. A completed pair of scans still wins over an Absent mark: it is
 * physical proof they were there. Omit `roll` and the answer is the one this
 * returned before roll existed.
 * Excused students get no number at all — the caller skips them, because an
 * excused concert is not a zero.
 */
export function concertItemScore(s: {
  hasIn: boolean; hasOut: boolean; entryOnly: boolean; performs: boolean;
  roll?: ConcertRoll;
}): number {
  if (scansCredited(s.hasIn, s.hasOut, s.entryOnly)) return 100;
  if (s.performs && s.roll !== 'absent') return 100;
  if (s.hasIn || s.hasOut) return 50;
  return 0;
}

/** Mean of a student's columns of one kind, or null when they have none. */
export function itemAverage(scores: Record<string, unknown> | undefined, kind: ItemKind): number | null {
  const vals: number[] = [];
  for (const [k, v] of Object.entries(scores ?? {})) {
    if (parseItemKey(k)?.kind !== kind) continue;
    const n = gradeValue(v);
    if (n !== null) vals.push(n);
  }
  return vals.length ? Math.round(vals.reduce((s, n) => s + n, 0) / vals.length) : null;
}

/* ───────────── columns of the director's own (#gradebook-columns) ─────────── */

/**
 * A director can also add a column that is not in the Hub at all (director's
 * request, 2026-10-14): a grade given on paper, extra credit, or a thing that
 * COSTS points — a phone out in class, acting out. They ride in the same
 * `scores` map, under a key that carries everything the column is:
 *
 *   x:<categoryId>:<label>            a grade of their own (0-100), averaged
 *                                     with the category's other columns.
 *   d:<categoryId>:<points>:<label>   an incident count. Each one takes
 *                                     `points` off the category: the count is
 *                                     the evidence, the points are the
 *                                     director's rule for it.
 *
 * No new collection and no rules change (`scores` is an open map in
 * firestore.rules). A column that nobody has scored yet still exists, because
 * adding it writes a literal `null` for the roster — a column is the union of
 * the keys across the table's docs, and a key holding null is still a key.
 *
 * The label is part of a Firestore field name, so `cleanLabel` keeps it to
 * characters a field name never needs escaped.
 */
export type ColumnKind = ItemKind | 'custom' | 'tally';

export const COLUMN_LABEL_MAX = 40;
export const TALLY_POINTS_MAX = 100;

/** Characters a Firestore field name is happiest without, plus ':' which the
 *  key format itself uses to separate its parts. */
const LABEL_UNSAFE = '.\\/[]*~`:';

export function cleanLabel(raw: string): string {
  return Array.from(raw)
    .map(ch => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 || LABEL_UNSAFE.includes(ch) ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, COLUMN_LABEL_MAX)
    .trim();
}

/** The key of a director's own graded column, or null when the label is empty. */
export function customKey(categoryId: string, label: string): string | null {
  const clean = cleanLabel(label);
  return clean ? `x:${categoryId}:${clean}` : null;
}

/** The key of an incident column, or null for an empty label or a cost that
 *  is not a whole number of points, 1 to 100. */
export function tallyKey(categoryId: string, points: number, label: string): string | null {
  const clean = cleanLabel(label);
  if (!clean || !Number.isInteger(points) || points < 1 || points > TALLY_POINTS_MAX) return null;
  return `d:${categoryId}:${points}:${clean}`;
}

export interface ParsedColumn {
  kind: ColumnKind;
  /** A concert or exam: the event / assignment id. Otherwise the label. */
  id: string;
  /** Custom and incident columns say which category they belong to. */
  categoryId?: string;
  /** Incident columns: what each one costs. */
  points?: number;
}

/** Every kind of column key, or null for anything else in `scores` — which
 *  includes every category id, so a category is never read as a column. */
export function parseColumnKey(key: string): ParsedColumn | null {
  const item = parseItemKey(key);
  if (item) return { kind: item.kind, id: item.id };
  const own = /^x:([A-Za-z0-9_-]+):(.+)$/.exec(key);
  if (own) return { kind: 'custom', categoryId: own[1], id: own[2] };
  const tally = /^d:([A-Za-z0-9_-]+):(\d{1,3}):(.+)$/.exec(key);
  if (tally) {
    const points = Number(tally[2]);
    if (points >= 1 && points <= TALLY_POINTS_MAX) {
      return { kind: 'tally', categoryId: tally[1], points, id: tally[3] };
    }
  }
  return null;
}

/**
 * An incident count. Unlike a grade, an unreadable or blank count is ZERO:
 * "no incident recorded" is the safe reading, and the only way a student could
 * be marked down is by a number somebody actually wrote.
 */
export function tallyCount(v: unknown): number {
  return gradeValue(v) ?? 0;
}

/**
 * What one category's box adds up to for one student (Oct 2026).
 *
 *   derived  the average of whatever the Hub and the director's columns say
 *            (`inputs`: a blank input is skipped, never a zero)
 *   typed    a number written into the box itself — it OVERRIDES derived,
 *            exactly as typing over a formula does in a spreadsheet
 *   base     typed, else derived
 *   penalty  the incident columns' total
 *   value    base minus penalty, held to 0-100 — the number the grade uses
 *
 * Two promises: a penalty never CREATES a score (no base means no value, so a
 * student with an incident and nothing else is not suddenly graded at 96), and
 * a typed number is still marked down by an incident column — the director
 * who fills a box at 100 and then logs two phones expects 96, not 100.
 */
export interface CategoryResult {
  typed: number | null;
  derived: number | null;
  penalty: number;
  base: number | null;
  value: number | null;
}

export function categoryResult(i: {
  typed: unknown;
  inputs: Array<number | null>;
  penalty: number;
}): CategoryResult {
  const typed = gradeValue(i.typed);
  const have = i.inputs.filter((n): n is number => n !== null);
  const derived = have.length ? Math.round(have.reduce((s, n) => s + n, 0) / have.length) : null;
  const penalty = Math.max(0, Math.round(i.penalty));
  const base = typed ?? derived;
  const value = base === null ? null : Math.max(GRADE_MIN, Math.min(GRADE_MAX, base - penalty));
  return { typed, derived, penalty, base, value };
}

/* ─────────────────── which concerts are required of a student ───────────── */

/** The fields of a calendar event that say who it is for. */
export interface ConcertLike {
  ensembleIds: string[];
  studentIds?: string[];
  attendanceEnsembleIds?: string[];
  attendanceStudentIds?: string[];
  concertAttendance?: 'required' | 'optional' | null;
}

export interface StudentLike {
  id: string;
  ensembleIds?: string[];
}

/** 'performer' plays on it; 'audience' is required in the seats; null is
 *  neither — the concert has nothing to say about this student. */
export type ConcertRole = 'performer' | 'audience' | null;

/**
 * How a student relates to a concert, from the event's own lists — the same
 * three lists `studentExpectation` reads for a student's schedule, so the
 * Gradebook cannot disagree with the page that told the student to be there.
 *
 * An event that lists NOBODY (no performers, no audience) is school-wide:
 * the Required flag alone means "everyone", which is how every concert that
 * predates the audience lists was entered.
 *
 * Grade excusals (seniors, #audience-excusal) and pull-outs are deliberately
 * NOT here: they are a separate verdict the caller applies, so the evidence
 * line can still say "1 excused" rather than pretending it never applied.
 */
export function concertRole(s: StudentLike, ev: ConcertLike): ConcertRole {
  const mine = s.ensembleIds ?? [];
  if ((ev.ensembleIds ?? []).some(e => mine.includes(e)) || (ev.studentIds ?? []).includes(s.id)) {
    return 'performer';
  }
  const groups = ev.attendanceEnsembleIds ?? [];
  const named = ev.attendanceStudentIds ?? [];
  if (groups.some(e => mine.includes(e)) || named.includes(s.id)) return 'audience';
  const listsNobody = !(ev.ensembleIds ?? []).length && !(ev.studentIds ?? []).length
    && !groups.length && !named.length;
  return listsNobody ? 'audience' : null;
}

/**
 * Is this concert REQUIRED of this student, for the Required Performance
 * Attendance category?
 *   • a performer: yes — playing in it is the requirement — unless the
 *     director marked the concert Optional;
 *   • in the audience: only when the concert is marked Required, because the
 *     Required flag is also what turns on the door check-in that is the only
 *     evidence an audience member leaves;
 *   • anyone else: no.
 * Marking a concert Optional wins over everything.
 */
export function concertRequiredOf(s: StudentLike, ev: ConcertLike): boolean {
  const role = concertRole(s, ev);
  const flag = ev.concertAttendance ?? null;
  if (role === null || flag === 'optional') return false;
  return role === 'performer' ? true : flag === 'required';
}

/**
 * One student's number for one concert, or null when the concert has nothing
 * to say about them: not theirs to attend, excused, or marked Absent
 * (Excused) on the roll. A null is never a zero.
 */
export function concertScore(i: {
  role: ConcertRole;
  /** A grade excusal or a pull-out — decided by the caller. */
  excused: boolean;
  hasIn: boolean;
  hasOut: boolean;
  entryOnly: boolean;
  roll: ConcertRoll;
}): number | null {
  if (i.role === null || i.excused) return null;
  const performs = i.role === 'performer';
  const scanCredited = scansCredited(i.hasIn, i.hasOut, i.entryOnly);
  if (rollEffect({ scanCredited, performs, roll: i.roll }) === 'excused') return null;
  return concertItemScore({
    hasIn: i.hasIn, hasOut: i.hasOut, entryOnly: i.entryOnly, performs, roll: i.roll,
  });
}

/* ─────────────────────── what the district asks alongside ───────────────── */

/** The district's comment triggers. Values come from org config. */
export interface CommentRules {
  /** Academic score at or below this needs a written reason. */
  academicAtOrBelow: number;
  /** This effort grade needs a reason (3, the worst). */
  effortAtOrAbove: number;
  /** This conduct grade or lower needs a reason ('C'). */
  conductAtOrBelow: string;
}

export const DEFAULT_COMMENT_RULES: CommentRules = {
  academicAtOrBelow: 79,
  effortAtOrAbove: 3,
  conductAtOrBelow: 'C',
};

/**
 * Why this row needs a comment code, as a list of reasons. Empty means none
 * is required.
 *
 * A row with no academic number does NOT trigger the academic rule — an
 * ungraded student is not a failing one, which is the same "blank is not a
 * zero" posture as everything else here.
 */
export function commentReasons(
  row: { percent: number | null; effort: EffortGrade | null; conduct: ConductGrade | null },
  rules: CommentRules = DEFAULT_COMMENT_RULES,
): string[] {
  const out: string[] = [];
  if (row.percent !== null && row.percent <= rules.academicAtOrBelow) out.push('Academic');
  if (row.effort !== null && Number(row.effort) >= rules.effortAtOrAbove) out.push('Effort');
  const floor = CONDUCT_GRADES.indexOf(rules.conductAtOrBelow as ConductGrade);
  if (row.conduct !== null && floor >= 0 && CONDUCT_GRADES.indexOf(row.conduct) >= floor) {
    out.push('Conduct');
  }
  return out;
}

/** Whether a row is ready to submit, and what is missing if not. */
export type RowReadiness = 'ok' | 'no-grade' | 'missing-effort-conduct' | 'needs-code';

export function rowReadiness(
  row: {
    percent: number | null;
    effort: EffortGrade | null;
    conduct: ConductGrade | null;
    codes: string[];
  },
  rules: CommentRules = DEFAULT_COMMENT_RULES,
): RowReadiness {
  if (row.percent === null) return 'no-grade';
  if (row.effort === null || row.conduct === null) return 'missing-effort-conduct';
  if (commentReasons(row, rules).length > 0 && row.codes.length === 0) return 'needs-code';
  return 'ok';
}

/* ────────────────────────────── names ──────────────────────────────────── */

/**
 * Name parsing moved to `personName.ts` so the roster and these report tables
 * share ONE definition of a surname (they used to disagree). Re-exported here
 * because this module's own callers — and its self-check — ask for them by
 * name.
 */
export {
  parseName, displayName, lastFirst, lastName, byLastName, type ParsedName,
} from './personName.ts';
