import type { AttendanceRecord, Student, Ensemble } from '../types';

/** Quote a field if it contains a comma, quote, or newline (RFC 4180). */
const esc = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Build a spreadsheet-ready CSV of attendance records, newest first. */
export function attendanceToCsv(
  records: AttendanceRecord[],
  studentsById: Record<string, Student>,
  ensemblesById: Record<string, Ensemble>,
): string {
  const headers = ['Date', 'Student', 'Instrument', 'Ensemble', 'Status', 'Minutes Late', 'Reason', 'Notes', 'Follow-up'];
  const rows = [...records]
    .sort((a, b) =>
      b.date.localeCompare(a.date) ||
      (studentsById[a.studentId]?.name ?? '').localeCompare(studentsById[b.studentId]?.name ?? ''))
    .map(r => [
      r.date,
      studentsById[r.studentId]?.name ?? r.studentId,
      studentsById[r.studentId]?.instrument ?? '',
      ensemblesById[r.ensembleId]?.name ?? r.ensembleId,
      r.status,
      r.minutesLate != null ? String(r.minutesLate) : '',
      r.reason ?? '',
      r.notes ?? '',
      r.followUp ?? '',
    ].map(esc).join(','));
  return [headers.join(','), ...rows].join('\r\n');
}

/** Trigger a browser download of a CSV string (opens cleanly in Excel/Sheets). */
export function downloadCsv(filename: string, csv: string): void {
  // Leading BOM so Excel detects UTF-8.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
