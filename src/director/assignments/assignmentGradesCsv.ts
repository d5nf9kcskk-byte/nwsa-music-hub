// Explicit .ts on the shared cell escaper, matching every other importer of
// it: scripts/sync-drive-photos.mjs pulls that file in under plain node, whose
// type-stripping loader cannot resolve an extensionless relative import.
import { csvEscape as esc } from '../../shared/csv.ts';
import { tallyScores, type RubricCriterion } from '../examRubric';
import type { AssignmentResult } from '../types';

/**
 * One assignment's grade sheet, as a CSV the district gradebook can read
 * (#exam-rubric follow-on).
 *
 * The rubric shipped a full per-criterion breakdown and no way to get it off
 * the screen, so the last mile of grading was a director reading numbers into
 * another system by hand. This is that mile.
 *
 * Scope is ONE assignment — the sheet you are looking at, not the term. A
 * whole-term export is a different report with different columns (a student
 * per row, an assignment per column) and it is deliberately not this.
 *
 * Three things here are load-bearing:
 *
 *   1. **A rubric cell is matched by criterion ID, never by position.** A
 *      confirmed grade snapshots its OWN lines, so two students on the same
 *      exam can carry different line sets if the rubric was re-weighted
 *      between grading them. Laying the second one out by position would file
 *      one student's Rhythm points in another's Musicality column — a wrong
 *      grade in a gradebook, arriving silently. A line that does not match a
 *      current column leaves the cell BLANK and the row says why.
 *   2. **A blank is not a zero.** Same posture as `criterionPointValue` and
 *      `lessonGradeValue`: an ungraded student exports as empty cells, not as
 *      a row of zeros that a gradebook would average in as a failure.
 *   3. **Every cell goes through `csvEscape`.** Student names are typed by
 *      people and `notes` is free text a director wrote; both reach a
 *      spreadsheet that evaluates a leading `=`.
 *
 * Deliberately no `ORG` import and no DOM, so the arithmetic stays runnable
 * under plain node for the self-check. The browser download is `downloadCsv`
 * (attendance/attendanceCsv), which every other export already uses, and the
 * filename is built by `gradesCsvFilename` below.
 *
 * Grades are staff-only — `assignmentResults` has no public projection and is
 * not getting one. This file is a browser download and nothing else: never
 * written into `dist/`, never added to `feeds/`, never published through the
 * Pages pipeline. It carries no contact information, because nothing here
 * reads `contacts`.
 */

/** A person who gets a row. Denormalized on purpose — an off-roster submitter
 *  has no roster record to read a name out of, and a row must never be
 *  invented for one. */
export interface GradeCsvPerson {
  studentId: string;
  name: string;
  instrument: string;
  /** False for the "videos from students not on this list" fold: someone who
   *  submitted and has since gone Inactive or left the ensemble. Their name
   *  comes off their own submission, so the row is real data, not a guess. */
  onRoster: boolean;
}

export interface GradeCsvInput {
  /** What the exam grades with TODAY — `rubricForAssignment()`'s answer. Empty
   *  for a written test, or for an exam whose director turned rubric grading
   *  off, and then the file simply carries no rubric columns. */
  criteria: RubricCriterion[];
  /** Roster first, in the order the grade sheet shows them; off-roster
   *  submitters after. */
  people: GradeCsvPerson[];
  /** Keyed by student id, exactly as `useAssignmentResults` hands it over. */
  resultMap: Record<string, AssignmentResult | undefined>;
}

const FLAG_EARLIER_RUBRIC = 'Scored on an earlier rubric';
const FLAG_OFF_ROSTER = 'Not on this list';

/** A rubric column's header: the line's name AND what it is worth, because a
 *  bare "Intonation" in a gradebook does not say out of what. */
export function criterionHeader(c: RubricCriterion): string {
  return `${c.label} /${c.max}`;
}

export function gradeCsvHeaders(criteria: RubricCriterion[]): string[] {
  return [
    'Student',
    'Instrument',
    'Status',
    'Score',
    ...criteria.map(criterionHeader),
    ...(criteria.length ? ['Rubric points', 'Rubric out of'] : []),
    'Graded',
    'Notes',
    'Flags',
  ];
}

/**
 * The cells for one person, stringified but not yet escaped.
 *
 * Exported so the self-check can pin the alignment directly rather than
 * re-parsing the CSV to work out what landed where.
 */
export function gradeCsvRow(
  person: GradeCsvPerson,
  result: AssignmentResult | undefined,
  criteria: RubricCriterion[],
): string[] {
  const scores = result?.rubric ?? [];
  // By id, never by index — the snapshot's own order means nothing here.
  const byId = new Map(scores.map(s => [s.id, s]));

  const cells: string[] = [];
  let matched = 0;
  for (const c of criteria) {
    const s = byId.get(c.id);
    // A line whose WORTH has changed is not this column's number either: the
    // header promises a denominator, and 28 under "Intonation /25" is a lie a
    // reader has no way to catch. Blank it and let the flag explain.
    if (s && s.max === c.max) {
      cells.push(String(s.points));
      matched += 1;
    } else {
      cells.push('');
    }
  }

  // The snapshot's own total, so a row laid out on lines that no longer match
  // still carries what it actually earned. `score` is a PERCENT, so on a
  // rubric that does not total 100 it cannot stand in for the raw points.
  const tally = tallyScores(result?.rubric);

  const flags: string[] = [];
  if (scores.length && matched < scores.length) flags.push(FLAG_EARLIER_RUBRIC);
  if (!person.onRoster) flags.push(FLAG_OFF_ROSTER);

  return [
    person.name,
    person.instrument,
    // No result at all reads as Pending — the same thing the grade sheet says.
    result?.status ?? 'Pending',
    result?.score ?? '',
    ...cells,
    ...(criteria.length
      ? [tally ? String(tally.points) : '', tally ? String(tally.max) : '']
      : []),
    result?.gradedAt ?? '',
    result?.notes ?? '',
    flags.join('; '),
  ];
}

/** The whole sheet. One row per person, ungraded people included — a gradebook
 *  import wants the roster, not just whoever is finished. */
export function assignmentGradesToCsv(input: GradeCsvInput): string {
  const { criteria, people, resultMap } = input;
  const lines = [
    gradeCsvHeaders(criteria),
    ...people.map(p => gradeCsvRow(p, resultMap[p.studentId], criteria)),
  ];
  return lines.map(cells => cells.map(esc).join(',')).join('\r\n');
}

/** A filename-safe slug of the assignment's title — the same shape as the
 *  sign-ups export, and org-neutral like it: this codebase builds more than
 *  one school's site, so "nwsa" does not belong in a new user-facing string. */
export function gradesExportSlug(title: string): string {
  return (title || 'assignment')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'assignment';
}

/** `today` is passed in rather than read here, so the self-check can pin it. */
export function gradesCsvFilename(title: string, today: string): string {
  return `grades-${gradesExportSlug(title)}-${today}.csv`;
}
