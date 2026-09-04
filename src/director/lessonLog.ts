import type { Lesson, Student, StudentContact } from './types';
// Explicit .ts on purpose: this module is imported by the lesson-log Cloud
// Function, whose self-check runs under Node's type-stripping loader, and
// that loader cannot resolve an extensionless relative import.
import { isLessonGrade } from './lessonGrades.ts';

/**
 * High School Private Lesson Log helpers (#applied). Pure functions over the
 * paper template's blanks, in the two shapes the form actually has:
 *
 *   • per LESSON — date, time, grade, teacher initial, student initial,
 *     repertoire (composer + title), technique/comments, payroll length.
 *     These live on the `Lesson` doc.
 *   • per SHEET — the header's Term, the Jury Repertoire List, and the three
 *     signature lines at the foot. Filled in once a term, not once a lesson,
 *     so they live in `LessonLogSheet` on the teacher's own directors doc
 *     (see the `lessonLogSheets` note in hooks/useDirectors.ts).
 */

export type PayrollMinutes = 45 | 60;

/** 12th grade → 1 hour; everyone else → 45 minutes (per division form). */
export function defaultPayrollMinutes(schoolGrade?: string): PayrollMinutes {
  const g = (schoolGrade ?? '').trim().toLowerCase();
  if (/^12\b/.test(g) || g === '12th' || g.includes('senior')) return 60;
  return 45;
}

/** Header "Lesson Length" copy for a student's expected band. */
export function lessonLengthLabel(schoolGrade?: string): string {
  return defaultPayrollMinutes(schoolGrade) === 60
    ? '1 hour (12th grade)'
    : '45 minutes (9th–11th grade)';
}

/** Titles that lead a name. "Dr. Grant Gilman" initials GG, never DGG — an
 *  honorific is not part of a name and has never been initialled. The Music
 *  Division is full of doctorates, so this is the common case, not an edge. */
const HONORIFICS = new Set([
  'dr', 'doctor', 'mr', 'mrs', 'ms', 'miss', 'mx', 'prof', 'professor',
  'rev', 'reverend', 'fr', 'father', 'sr', 'sister', 'br', 'brother',
  'rabbi', 'imam', 'cantor', 'maestro', 'maestra', 'coach', 'hon', 'sir', 'dame',
]);

/** Generational suffixes and degrees that trail a name. Deliberately short:
 *  the ambiguous two-letter degrees (MA, MM, BA) are LEFT OUT because they
 *  collide with real surnames — Yo-Yo Ma would initial as "Y". */
const SUFFIXES = new Set([
  'jr', 'sr', 'ii', 'iii', 'iv', 'esq', 'phd', 'edd', 'dma', 'dmus', 'mfa', 'mmus',
]);

const nameKey = (part: string) => part.replace(/[^a-z]/gi, '').toLowerCase();

/**
 * First letters of the teacher's actual NAME. Titles are dropped only where
 * they actually occur — an honorific at the FRONT, a suffix at the BACK — so
 * a middle initial can never be mistaken for a credential ("Grant V. Gilman"
 * stays GVG). A name that is nothing but titles falls back to the raw words
 * rather than returning nothing.
 */
export function suggestTeacherInitials(name?: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(p => nameKey(p).length > 0);
  const named = [...parts];
  while (named.length > 1 && HONORIFICS.has(nameKey(named[0]!))) named.shift();
  while (named.length > 1 && SUFFIXES.has(nameKey(named[named.length - 1]!))) named.pop();
  return named.map(p => nameKey(p)[0]!.toUpperCase()).join('');
}

/** School year label like 2025-2026 from a YYYY-MM-DD (Aug–Jul). */
export function schoolYearLabel(isoDate: string): string {
  const y = Number(isoDate.slice(0, 4));
  const m = Number(isoDate.slice(5, 7));
  if (!y || !m) return '';
  return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

/** The form's "Term: SELECT ONE". The repertoire-confirmation deadlines
 *  printed on it are Fall and Spring, so those are the two. */
export const LESSON_TERMS = ['Fall', 'Spring'] as const;
export type LessonTerm = (typeof LESSON_TERMS)[number];

/** Fall runs August–December, Spring January–July (same cut as the school
 *  year label above, so a sheet and its year can never disagree). */
export function termForDate(isoDate: string): LessonTerm {
  return Number(isoDate.slice(5, 7)) >= 8 ? 'Fall' : 'Spring';
}

/** The paper form prints five Jury Repertoire lines. */
export const JURY_REPERTOIRE_SLOTS = 5;

export interface JuryPiece {
  composer: string;
  title: string;
}

/**
 * The blanks that are filled in ONCE per student per term rather than once
 * per lesson: the Jury Repertoire List and the three signature lines.
 * Signatures are typed names plus the date, exactly like a sign-up's — this
 * is a staff screen, so only staff can type into them.
 */
export interface LessonLogSheet {
  juryRepertoire?: JuryPiece[];
  facultySignature?: string;
  facultySignedDate?: string;
  studentSignature?: string;
  studentSignedDate?: string;
  deanSignature?: string;
  deanSignedDate?: string;
}

/** One sheet per student per term — the paper form IS a term sheet, and a
 *  student's Fall jury list must not be overwritten by their Spring one.
 *  A map key, so no dots: `|` is safe where `.` would read as a field path. */
export function sheetKey(studentId: string, schoolYear: string, term: LessonTerm): string {
  return `${studentId}|${schoolYear}|${term}`;
}

/** Which printed sheet is on screen. */
export interface TermRef {
  schoolYear: string;
  term: LessonTerm;
}

export const termOf = (isoDate: string): TermRef => ({
  schoolYear: schoolYearLabel(isoDate),
  term: termForDate(isoDate),
});

export const sameTerm = (a: TermRef, b: TermRef): boolean =>
  a.schoolYear === b.schoolYear && a.term === b.term;

/** Sortable, so a term picker can list newest first without a comparator. */
export const termRank = (t: TermRef): string => `${t.schoolYear}-${t.term === 'Fall' ? '1' : '2'}`;

/**
 * The term's sheet with the row being written punched out — `null` marks
 * where the blanks being filled in go, so the form can render prior rows
 * ABOVE it in the same columns. That is the whole point of the log page: on
 * lesson five, the four earlier lines are on screen while you write.
 *
 * A new lesson lands at the bottom. An edit keeps its own place in the
 * sequence, so lesson 2 stays lesson 2 and the rows above the draft really
 * are the earlier ones.
 */
export function logRowsWithDraft<T extends { id: string }>(termLessons: T[], editingId?: string): (T | null)[] {
  const at = editingId ? termLessons.findIndex(l => l.id === editingId) : -1;
  return at >= 0 ? termLessons.map((l, i) => (i === at ? null : l)) : [...termLessons, null];
}

/** 0-based position of the draft row; +1 is its printed lesson number. */
export const draftRowIndex = <T,>(rows: (T | null)[]): number => rows.indexOf(null);

/** Always exactly JURY_REPERTOIRE_SLOTS rows to render, padded with blanks. */
export function juryRows(sheet?: LessonLogSheet): JuryPiece[] {
  const rows = sheet?.juryRepertoire ?? [];
  return Array.from({ length: JURY_REPERTOIRE_SLOTS }, (_, i) => ({
    composer: rows[i]?.composer ?? '',
    title: rows[i]?.title ?? '',
  }));
}

/** Trim before saving so Firestore doesn't carry five empty objects because
 *  the teacher listed two pieces. Blanks BETWEEN entries are kept — dropping
 *  them would renumber the list under the teacher. */
export function trimJuryRows(rows: JuryPiece[]): JuryPiece[] {
  const kept = rows.map(r => ({ composer: r.composer.trim(), title: r.title.trim() }));
  while (kept.length > 0 && !kept[kept.length - 1]!.composer && !kept[kept.length - 1]!.title) kept.pop();
  return kept;
}

/** Default start/end for a new log line from payroll length. */
export function defaultTimesForPayroll(mins: PayrollMinutes): { startTime: string; endTime: string } {
  return mins === 60
    ? { startTime: '15:00', endTime: '16:00' }
    : { startTime: '15:00', endTime: '15:45' };
}

const INITIALS_MIN = 2;

export function initialsOk(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length >= INITIALS_MIN;
}

/**
 * A row is complete for family email when it happened, carries a readable
 * number, and the student has initialed in person. Cancelled / incomplete
 * rows must never enqueue mail.
 */
export function isLogCompleteForMail(l: Pick<Lesson, 'status' | 'grade' | 'studentInitials'>): boolean {
  return l.status !== 'Cancelled' && isLessonGrade(l.grade) && initialsOk(l.studentInitials);
}

/** Every blank the student's initial actually attests to. Change one after
 *  they initialed and the initial is void — they must sign the new line.
 *  Date and time are in here because the log records WHEN the lesson was, not
 *  only that it happened. */
export type LogMaterialFields = Pick<Lesson,
  'date' | 'startTime' | 'endTime' | 'grade' | 'gradeNote'
  | 'repertoireComposer' | 'repertoireTitle' | 'payrollMinutes'>;

export function logMaterialChanged(before: LogMaterialFields, after: LogMaterialFields): boolean {
  return (before.date ?? '') !== (after.date ?? '')
    || (before.startTime ?? '') !== (after.startTime ?? '')
    || (before.endTime ?? '') !== (after.endTime ?? '')
    || (before.grade ?? '') !== (after.grade ?? '')
    || (before.gradeNote ?? '') !== (after.gradeNote ?? '')
    || (before.repertoireComposer ?? '') !== (after.repertoireComposer ?? '')
    || (before.repertoireTitle ?? '') !== (after.repertoireTitle ?? '')
    || (before.payrollMinutes ?? null) !== (after.payrollMinutes ?? null);
}

/** Composer and title as ONE line, for the places that only have one — the
 *  family email, a summary row. Both fields hold several pieces on separate
 *  lines, so the breaks collapse to "; " rather than escaping into a
 *  header-style body where each field is its own line. */
export function repertoireLine(l: Pick<Lesson, 'repertoireComposer' | 'repertoireTitle'>): string {
  const flat = (v?: string) => (v ?? '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).join('; ');
  const c = flat(l.repertoireComposer);
  const t = flat(l.repertoireTitle);
  if (c && t) return `${c}, ${t}`;
  return c || t || '';
}

/** Emails from a contact doc: student + every guardian with an address. */
export function contactRecipients(c: StudentContact | null | undefined): string[] {
  if (!c) return [];
  const out: string[] = [];
  const add = (e?: string) => {
    const v = (e ?? '').trim();
    if (v && !out.includes(v)) out.push(v);
  };
  add(c.email);
  add(c.parentEmail);
  for (const g of c.guardians ?? []) add(g.email);
  return out;
}

export interface LessonLogMailFields {
  lessonId: string;
  teacherEmail: string;
  teacherName: string;
  studentId: string;
  studentName: string;
  date: string;
  grade: string;
  repertoire: string;
  technique: string;
  teacherInitials: string;
  studentInitials: string;
  payrollMinutes: number;
  recipients: string[];
}

export function buildMailFields(
  lesson: Lesson,
  student: Student | undefined,
  recipients: string[],
): LessonLogMailFields {
  return {
    lessonId: lesson.id,
    teacherEmail: lesson.teacherEmail,
    teacherName: lesson.teacherName ?? lesson.teacherEmail,
    studentId: lesson.studentId,
    studentName: student?.name ?? 'Student',
    date: lesson.date,
    grade: lesson.grade ?? '',
    repertoire: repertoireLine(lesson),
    technique: (lesson.gradeNote ?? '').trim(),
    teacherInitials: (lesson.teacherInitials ?? '').trim(),
    studentInitials: (lesson.studentInitials ?? '').trim(),
    payrollMinutes: lesson.payrollMinutes ?? defaultPayrollMinutes(student?.grade),
    recipients,
  };
}

export function lessonLogMailSubject(f: LessonLogMailFields): string {
  return `Lesson log — ${f.studentName} — ${f.date}`;
}

export function lessonLogMailBody(f: LessonLogMailFields): string {
  const lines = [
    `Hello,`,
    ``,
    `Here is the private lesson log entry for ${f.studentName} on ${f.date}.`,
    ``,
    `Teacher: ${f.teacherName}`,
    `Lesson grade: ${f.grade}`,
    f.repertoire ? `Repertoire: ${f.repertoire}` : null,
    // Its own block, not an inline value: comments run to several lines now.
    f.technique ? `Technique / comments:\n${f.technique}` : null,
    `Payroll length: ${f.payrollMinutes} minutes`,
    f.teacherInitials ? `Teacher initials: ${f.teacherInitials}` : null,
    f.studentInitials ? `Student initials: ${f.studentInitials}` : null,
    ``,
    `This message is a summary of what was logged in the NWSA Music Hub. If anything looks wrong, reply to the teacher.`,
  ];
  return lines.filter(x => x !== null).join('\n');
}

export function lessonLogMailto(f: LessonLogMailFields): string | null {
  if (f.recipients.length === 0) return null;
  const to = f.recipients.map(encodeURIComponent).join(',');
  return `mailto:${to}?subject=${encodeURIComponent(lessonLogMailSubject(f))}&body=${encodeURIComponent(lessonLogMailBody(f))}`;
}
