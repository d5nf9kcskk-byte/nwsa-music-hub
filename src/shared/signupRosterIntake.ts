/**
 * Sign-up → roster intake (#signups).
 *
 * An `audienceMode: 'open'` sign-up IS the intake: the person filling it in
 * has no roster record yet, so the response carries a typed name and no
 * `studentId` (src/director/types.ts). Somebody then has to turn those
 * responses into real `students` docs, and doing it by hand is exactly the
 * manual loop sign-ups were built to kill — the College Student Information
 * form landed a whole cohort that had to be typed in one at a time.
 *
 * This module is the ONE definition of what that turns into: who is new, who
 * is already on the roster, and what changes on each doc. It is pure and
 * imports no Firebase on purpose, so the director's screen and any future
 * Admin-SDK script plan the same import and a self-check can pin it
 * (`signupRosterIntake.selfcheck.ts`, run in the deploy workflow).
 *
 * What it deliberately does NOT do:
 *   • It never removes an ensemble. A student already in Symphony who signs
 *     up for a college class gains the class and keeps Symphony.
 *   • It never touches `status`, `schoolId`, contacts, or pronunciation. A
 *     sign-up is unauthenticated free text; the school-issued ID and the
 *     contact record are staff work and stay staff work.
 *   • It never writes. The caller does, through the normal `useStudents`
 *     path, so the `studentsPublic` mirror is batched with the source doc
 *     (#privacy) rather than re-implemented here.
 */
import type { SignupResponse, Student } from '../director/types';

/** The grade a college / dual-enrollment student carries on the roster. Free
 *  text elsewhere in the app, but one spelling here so the roster filters,
 *  the concert check-in list and the CSV all read the same word. */
export const COLLEGE_GRADE = 'College';

/** Comparison key for "is this the same person". Case- and spacing-
 *  insensitive, and tolerant of a "Last, First" entry, because the name on a
 *  sign-up is typed by the person rather than picked from the roster. */
export function nameKey(name: string): string {
  const flat = name.trim().replace(/\s+/g, ' ').toLowerCase();
  const comma = flat.indexOf(',');
  const ordered = comma > 0
    ? `${flat.slice(comma + 1).trim()} ${flat.slice(0, comma).trim()}`.trim()
    : flat;
  return ordered.replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Display form of a typed name: trimmed, single-spaced, "Last, First"
 *  flipped back to reading order. Casing is left alone — "diMaggio" is a
 *  name, not a typo. */
export function tidyName(name: string): string {
  const flat = name.trim().replace(/\s+/g, ' ');
  const comma = flat.indexOf(',');
  return comma > 0
    ? `${flat.slice(comma + 1).trim()} ${flat.slice(0, comma).trim()}`.trim()
    : flat;
}

export interface IntakePlanOptions {
  /** Groups every imported student joins — ensembles and/or classes. */
  ensembleIds: string[];
  /** Grade to stamp. Defaults to `COLLEGE_GRADE`. */
  grade?: string;
}

/** One response's outcome. `create` writes a new student; `update` patches an
 *  existing one; `same` means the roster already says all of this. */
export type IntakeAction = 'create' | 'update' | 'same';

export interface IntakeRow {
  response: SignupResponse;
  action: IntakeAction;
  /** The roster student this response resolved to, when there is one. */
  match?: Student;
  /** Groups this student does not have yet (the ones the import adds). */
  addedEnsembleIds: string[];
  /** Full field set for a `create`; the patch for an `update`. Empty on 'same'. */
  fields: Partial<Omit<Student, 'id'>>;
}

/**
 * Resolve a response to a roster student: by `studentId` when the sign-up had
 * one (a 'groups' audience picks from the roster), otherwise by name.
 *
 * Matching on a typed name is the weak link, and it is why the director sees
 * every row before anything is written. An ambiguous name — two people on the
 * roster whose names reduce to the same key — resolves to NOBODY rather than
 * guessing, so the import proposes a new student and a human settles it.
 */
export function matchStudent(
  response: SignupResponse,
  students: Student[],
): Student | undefined {
  if (response.studentId) {
    const byId = students.find(s => s.id === response.studentId);
    if (byId) return byId;
  }
  const key = nameKey(response.studentName ?? '');
  if (!key) return undefined;
  const hits = students.filter(s => nameKey(s.name ?? '') === key);
  return hits.length === 1 ? hits[0] : undefined;
}

/**
 * Plan the import for a set of responses. Pass the responses the director is
 * actually importing (normally `latestPerStudent()` minus withdrawn ones) —
 * this function does not decide which responses count, only what each one
 * would do to the roster.
 *
 * Rows come back in the order given, one per response, so the screen can show
 * the plan beside the responses it came from.
 */
export function planRosterIntake(
  responses: SignupResponse[],
  students: Student[],
  opts: IntakePlanOptions,
): IntakeRow[] {
  const grade = opts.grade ?? COLLEGE_GRADE;
  const wanted = opts.ensembleIds.filter(Boolean);
  const rows: IntakeRow[] = [];
  // Names claimed by earlier rows in this same run, so two responses from the
  // same person (an open sign-up has no roster anchor and no public update
  // rule, so coming back means sending a second doc) never create the student
  // twice.
  const claimed = new Map<string, number>();

  for (const response of responses) {
    const name = tidyName(response.studentName ?? '');
    const key = nameKey(name);
    const earlier = key ? claimed.get(key) : undefined;
    const match = earlier !== undefined ? undefined : matchStudent(response, students);
    const instrument = (response.instrument ?? '').trim();

    if (earlier !== undefined) {
      // Fold into the row that already creates/updates this person. The later
      // response only adds anything if it named an instrument the first
      // one left blank.
      const first = rows[earlier];
      if (instrument && !first.fields.instrument && first.action !== 'same') {
        first.fields = { ...first.fields, instrument };
      }
      rows.push({ response, action: 'same', match: first.match, addedEnsembleIds: [], fields: {} });
      continue;
    }

    if (!match) {
      rows.push({
        response,
        action: 'create',
        addedEnsembleIds: [...wanted],
        fields: {
          name,
          instrument,
          grade,
          ensembleIds: [...wanted],
          status: 'Active',
        },
      });
      if (key) claimed.set(key, rows.length - 1);
      continue;
    }

    const have = match.ensembleIds ?? [];
    const addedEnsembleIds = wanted.filter(id => !have.includes(id));
    const fields: Partial<Omit<Student, 'id'>> = {};
    if (addedEnsembleIds.length) fields.ensembleIds = [...have, ...addedEnsembleIds];
    if (match.grade !== grade) fields.grade = grade;
    // Only fill an instrument in, never overwrite one a director has set:
    // the roster's spelling is the curated one.
    if (instrument && !(match.instrument ?? '').trim()) fields.instrument = instrument;

    rows.push({
      response,
      action: Object.keys(fields).length ? 'update' : 'same',
      match,
      addedEnsembleIds,
      fields,
    });
    if (key) claimed.set(key, rows.length - 1);
  }

  return rows;
}

/** Headline counts for the confirm button ("Add 14 · update 3"). */
export function intakeSummary(rows: IntakeRow[]): {
  create: number; update: number; same: number; total: number;
} {
  const create = rows.filter(r => r.action === 'create').length;
  const update = rows.filter(r => r.action === 'update').length;
  return { create, update, same: rows.length - create - update, total: rows.length };
}
