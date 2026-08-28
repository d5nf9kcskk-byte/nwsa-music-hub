/**
 * Attendance mark helpers. Stored values stay stable ('Excused' = absent
 * excused, for existing docs and the office bulletin); display labels spell
 * out Absent (Excused) / Late (Excused) so the four marks read clearly on roll.
 */
import type { AttendanceStatus } from './types';

/** Marks a director taps on Take Roll (Lesson is separate — pull-out flow). */
export const ROLL_MARKS: AttendanceStatus[] = [
  'Absent',
  'Late',
  'Excused',
  'LateExcused',
];

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  Absent: 'Absent',
  Late: 'Late',
  Excused: 'Absent (Excused)',
  LateExcused: 'Late (Excused)',
  Lesson: 'Lesson',
};

/** Compact button text — full label rides in title= for the long ones. */
export const ATTENDANCE_BTN_LABEL: Record<AttendanceStatus, string> = {
  Absent: 'Absent',
  Late: 'Late',
  Excused: 'Abs Exc',
  LateExcused: 'Late Exc',
  Lesson: 'Lesson',
};

export function isAbsentMark(status: AttendanceStatus): boolean {
  return status === 'Absent' || status === 'Excused';
}

export function isLateMark(status: AttendanceStatus): boolean {
  return status === 'Late' || status === 'LateExcused';
}

export function isExcusedMark(status: AttendanceStatus): boolean {
  return status === 'Excused' || status === 'LateExcused';
}

/** Who's Out / heatmaps / exception strips — anything that isn't Present. */
export function isRollException(status: AttendanceStatus): boolean {
  return status === 'Absent' || status === 'Late' || status === 'Excused' || status === 'LateExcused';
}
