import type { Lesson, Student } from '../types';
import { downloadCsv } from '../attendance/attendanceCsv';
import { csvEscape as esc } from '../../shared/csv.ts';


/**
 * Rich private-lesson CSV for directors / Dean grade and pay tracking.
 * Columns match the High School Private Lesson Log plus scheduling metadata.
 */
export function lessonsToCsv(
  lessons: Lesson[],
  studentsById: Record<string, Student>,
): string {
  const headers = [
    'Date',
    'Start',
    'End',
    'Student',
    'Student ID',
    'School grade',
    'Instrument',
    'Teacher',
    'Teacher email',
    'Location',
    'Status',
    'Grade',
    'Teacher initials',
    'Student initials',
    'Initialed at',
    'Repertoire composer',
    'Repertoire title',
    'Technique/Comments',
    'Payroll minutes',
    'Notes',
    'Conflict',
    'Conflict ensemble event',
    'Conflict acknowledged',
    'Pull-out override ID',
    'Created',
    'Updated',
    'Updated by',
    'Lesson ID',
  ];
  const rows = [...lessons]
    .sort((a, b) =>
      b.date.localeCompare(a.date) ||
      b.startTime.localeCompare(a.startTime) ||
      (studentsById[a.studentId]?.name ?? '').localeCompare(studentsById[b.studentId]?.name ?? ''))
    .map(l => {
      const stu = studentsById[l.studentId];
      return [
        l.date,
        l.startTime,
        l.endTime,
        stu?.name ?? '',
        l.studentId,
        stu?.grade ?? '',
        l.instrument ?? stu?.instrument ?? '',
        l.teacherName ?? '',
        l.teacherEmail,
        l.location ?? '',
        l.status,
        l.grade ?? '',
        l.teacherInitials ?? '',
        l.studentInitials ?? '',
        l.studentInitialedAt
          ? new Date(l.studentInitialedAt).toISOString()
          : '',
        l.repertoireComposer ?? '',
        l.repertoireTitle ?? '',
        l.gradeNote ?? '',
        l.payrollMinutes ?? '',
        l.notes ?? '',
        l.conflict ? 'Yes' : '',
        l.conflict?.eventLabel ?? '',
        l.conflict?.acknowledgedAt
          ? new Date(l.conflict.acknowledgedAt).toISOString()
          : '',
        l.overrideId ?? '',
        l.createdAt ? new Date(l.createdAt).toISOString() : '',
        l.updatedAt ? new Date(l.updatedAt).toISOString() : '',
        l.updatedBy ?? '',
        l.id,
      ].map(esc).join(',');
    });
  return [headers.join(','), ...rows].join('\r\n');
}

export function downloadLessonsCsv(
  lessons: Lesson[],
  studentsById: Record<string, Student>,
  filename = `nwsa-lessons-${new Date().toISOString().slice(0, 10)}.csv`,
): void {
  downloadCsv(filename, lessonsToCsv(lessons, studentsById));
}
