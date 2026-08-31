import { ORG } from '../../org';
import { termForDate, type Term } from '../../shared/concertCheckin';
import type { ConcertCheckin } from '../types';

/**
 * The cumulative concert-attendance CSV (#concert-checkin).
 *
 * ONE file, one row per student per concert, growing forever — every new
 * concert appends rows to the same document rather than producing a separate
 * download. That was the director's requirement in as many words, and it is
 * why the rows are paired here rather than exported as raw scans: a row is
 * "Ana Ruiz at the Faculty Concert", carrying both times, not two rows that a
 * reader has to join by hand in a spreadsheet.
 *
 * Every row is denormalized from the RECORD, never re-read from the event or
 * the roster. A concert renamed in March must not silently rewrite what
 * happened in September, and a student who leaves the program still attended
 * the concerts they attended.
 */

/** RFC 4180, matching attendanceCsv.ts. */
const esc = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export interface CheckinRow {
  key: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  attendance: string;
  termId: string;
  studentId: string;
  studentName: string;
  grade: string;
  instrument: string;
  email: string;
  in?: ConcertCheckin;
  out?: ConcertCheckin;
}

/** Pair the scans: one row per student per concert. */
export function pairCheckins(records: ConcertCheckin[]): CheckinRow[] {
  const rows = new Map<string, CheckinRow>();
  for (const r of records) {
    const key = `${r.eventId}__${r.studentId}`;
    const row = rows.get(key) ?? {
      key,
      eventId: r.eventId,
      eventTitle: r.eventTitle || '(untitled concert)',
      eventDate: r.eventDate || '',
      attendance: r.eventAttendance ?? '',
      termId: r.termId ?? '',
      studentId: r.studentId,
      studentName: r.studentName || r.studentId,
      grade: r.grade ?? '',
      instrument: r.instrument ?? '',
      email: r.email ?? '',
    };
    // The check-out carries the later, better-known values (a student may have
    // corrected their email between the two), so let it win where it has one.
    if (r.kind === 'in') row.in = r; else row.out = r;
    if (r.email) row.email = r.email;
    if (r.grade) row.grade = r.grade;
    rows.set(key, row);
  }
  return [...rows.values()].sort(
    (a, b) => b.eventDate.localeCompare(a.eventDate)
      || a.studentName.localeCompare(b.studentName),
  );
}

/** Minutes between the two scans, blank when the pair is incomplete. */
export function minutesPresent(row: CheckinRow): string {
  if (!row.in?.at || !row.out?.at) return '';
  return String(Math.max(0, Math.round((row.out.at - row.in.at) / 60000)));
}

function clock(at?: number): string {
  if (!at) return '';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: ORG.timezone,
  }).format(new Date(at));
}

/**
 * The photo cell.
 *
 * A link INTO the Hub, not a link to the storage object. Calling Firebase's
 * getDownloadURL would mint a permanent bearer token on a photograph of a
 * student — anyone the spreadsheet was ever forwarded to could open it, which
 * is exactly what the no-public-read rule on /checkins exists to prevent.
 * This link opens the Check-In screen with the photo selected, and shows it
 * only to someone signed in as staff.
 *
 * The Drive column beside it fills in once the photo sync has filed the image
 * in the shared folder, where access is Drive's own sharing rather than a
 * token in a URL.
 */
export function photoLink(rec?: ConcertCheckin): string {
  if (!rec?.photoPath) return rec?.photoSkipped ? 'no photo (fallback)' : '';
  return `${ORG.publicUrl}director/checkin?photo=${encodeURIComponent(rec.id)}`;
}

export function checkinsToCsv(records: ConcertCheckin[], terms: Term[] = ORG.terms ?? []): string {
  const headers = [
    'Concert', 'Date', 'Requirement', 'Semester',
    'Student', 'Grade', 'Instrument', 'School email',
    'Checked in', 'Check-in time', 'Check-in photo', 'Check-in photo (Drive)',
    'Checked out', 'Check-out time', 'Check-out photo', 'Check-out photo (Drive)',
    'Minutes present', 'Complete',
  ];
  const rows = pairCheckins(records).map(row => {
    const term = terms.find(t => t.id === row.termId)
      ?? (row.eventDate ? termForDate(row.eventDate, terms) : null);
    return [
      row.eventTitle,
      row.eventDate,
      row.attendance === 'required' ? 'Required' : row.attendance === 'optional' ? 'Optional' : '',
      term?.name ?? row.termId,
      row.studentName,
      row.grade,
      row.instrument,
      row.email,
      row.in ? 'Yes' : 'No',
      clock(row.in?.at),
      photoLink(row.in),
      row.in?.photoDriveLink ?? '',
      row.out ? 'Yes' : 'No',
      clock(row.out?.at),
      photoLink(row.out),
      row.out?.photoDriveLink ?? '',
      minutesPresent(row),
      row.in && row.out ? 'Yes' : 'No',
    ].map(esc).join(',');
  });
  return [headers.join(','), ...rows].join('\r\n');
}

/** Per-student, per-semester tallies — how many Required and how many
 *  Optional concerts a student has COMPLETED (both scans). A student who
 *  checked in and wandered off has not completed one, which is the whole
 *  reason the check-out exists. */
export interface Tally { required: number; optional: number }

export function talliesByStudent(
  records: ConcertCheckin[],
): Record<string, Record<string, Tally>> {
  const out: Record<string, Record<string, Tally>> = {};
  for (const row of pairCheckins(records)) {
    if (!row.in || !row.out) continue;
    if (row.attendance !== 'required' && row.attendance !== 'optional') continue;
    const byTerm = out[row.studentId] ??= {};
    const tally = byTerm[row.termId] ??= { required: 0, optional: 0 };
    if (row.attendance === 'required') tally.required += 1;
    else tally.optional += 1;
  }
  return out;
}
