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
 */
export function attendanceByStudent(
  marks: MarkLike[],
  ensembleId: string,
  window: { from: string; through: string },
): Record<string, AttendanceEvidence> {
  const out: Record<string, AttendanceEvidence> = {};
  for (const m of marks) {
    if (m.ensembleId !== ensembleId) continue;
    if (m.date < window.from || m.date > window.through) continue;
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
 */
export function meetingsHeld(
  events: MeetingLike[],
  ensembleId: string,
  window: { from: string; through: string },
): number {
  let n = 0;
  for (const e of events) {
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
 * A roster name, split into the two halves the district's tables need.
 *
 * The roster stores names BOTH WAYS, and pretending otherwise is how a report
 * goes out wrong. Checked against the live roster on 2026-09-14: 120 of 142
 * active students are stored "Rose, William F." and 22 are stored
 * "Vincent T. Blades". Every student on the Camerata and Symphony tables is in
 * the first form, so a parser that assumed the second printed the middle
 * initial in the Last Name column ("Beyra, Benjamin A." → "A.") and sorted the
 * whole table by it.
 *
 * A COMMA is the reliable signal, and it is the only one: it is unambiguous
 * about where the surname ends, which the space-separated form is not.
 * "Nelisa Ochoa Rojas" is parsed as Ochoa/first, Rojas/last, and that is a
 * guess — a two-word surname is indistinguishable from a middle name without
 * being told. Storing every name "Last, First" removes the guess entirely, and
 * is worth doing for that reason alone.
 */
export interface ParsedName {
  first: string;
  last: string;
}

export function parseName(raw: string): ParsedName {
  const s = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return { first: '', last: '' };

  const comma = s.indexOf(',');
  if (comma > 0) {
    return { last: s.slice(0, comma).trim(), first: s.slice(comma + 1).trim() };
  }

  const parts = s.split(' ');
  // A single word is a surname, not a first name: it is what an alphabetical
  // list has to sort on, and printing nothing in the Last Name column would be
  // worse than printing the only word there is.
  if (parts.length < 2) return { first: '', last: s };
  return { last: parts[parts.length - 1], first: parts.slice(0, -1).join(' ') };
}

/** "William F. Rose" — the Full Name column, however the roster stores it. */
export function displayName(name: string): string {
  const { first, last } = parseName(name);
  return first ? `${first} ${last}` : last;
}

/** "Rose, William F." — the Applied table's Name column, and the sort key for
 *  every table, because the district wants alphabetical by last name. */
export function lastFirst(name: string): string {
  const { first, last } = parseName(name);
  return first ? `${last}, ${first}` : last;
}

/** Just the surname, for Camerata's own Last Name column. */
export function lastName(name: string): string {
  return parseName(name).last;
}

/** Alphabetical by surname, then by the rest — requirement number one. */
export function byLastName(a: string, b: string): number {
  return lastFirst(a).localeCompare(lastFirst(b), undefined, { sensitivity: 'base' });
}
