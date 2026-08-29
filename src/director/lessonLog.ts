import type { Lesson, Student, StudentContact } from './types';
import { isLessonMark } from './lessonGrades';

/**
 * High School Private Lesson Log helpers (#applied). Pure functions over the
 * Lesson doc fields that match the paper template: repertoire, technique
 * (gradeNote), teacher/student initials, and payroll length.
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

/** First letters of each word in the teacher's display name. */
export function suggestTeacherInitials(name?: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts.map(p => p[0]!.toUpperCase()).join('');
}

/** School year label like 2025-2026 from a YYYY-MM-DD (Aug–Jul). */
export function schoolYearLabel(isoDate: string): string {
  const y = Number(isoDate.slice(0, 4));
  const m = Number(isoDate.slice(5, 7));
  if (!y || !m) return '';
  return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
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
 * A row is complete for family email when it happened, carries a recognized
 * mark, and the student has initialed in person. Cancelled / incomplete rows
 * must never enqueue mail.
 */
export function isLogCompleteForMail(l: Pick<Lesson, 'status' | 'grade' | 'studentInitials'>): boolean {
  return l.status !== 'Cancelled' && isLessonMark(l.grade) && initialsOk(l.studentInitials);
}

/** Fields whose change voids a prior student initial (must re-initial). */
export function logMaterialChanged(
  before: Pick<Lesson, 'grade' | 'gradeNote' | 'repertoireComposer' | 'repertoireTitle' | 'payrollMinutes'>,
  after: Pick<Lesson, 'grade' | 'gradeNote' | 'repertoireComposer' | 'repertoireTitle' | 'payrollMinutes'>,
): boolean {
  return (before.grade ?? '') !== (after.grade ?? '')
    || (before.gradeNote ?? '') !== (after.gradeNote ?? '')
    || (before.repertoireComposer ?? '') !== (after.repertoireComposer ?? '')
    || (before.repertoireTitle ?? '') !== (after.repertoireTitle ?? '')
    || (before.payrollMinutes ?? null) !== (after.payrollMinutes ?? null);
}

export function repertoireLine(l: Pick<Lesson, 'repertoireComposer' | 'repertoireTitle'>): string {
  const c = (l.repertoireComposer ?? '').trim();
  const t = (l.repertoireTitle ?? '').trim();
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
    f.technique ? `Technique / comments: ${f.technique}` : null,
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
