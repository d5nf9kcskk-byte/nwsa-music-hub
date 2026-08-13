import type { Lesson, Student } from '../types';
import { downloadCsv } from '../attendance/attendanceCsv';

/** Quote a field if it contains a comma, quote, or newline (RFC 4180). */
const esc = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Rich private-lesson CSV for directors / Dean tracking.
 * Grade column is always present (empty until the app collects it).
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
    'Instrument',
    'Teacher',
    'Teacher email',
    'Location',
    'Status',
    'Grade',
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
        l.instrument ?? stu?.instrument ?? '',
        l.teacherName ?? '',
        l.teacherEmail,
        l.location ?? '',
        l.status,
        l.grade ?? '',
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
