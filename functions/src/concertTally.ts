import type { Firestore } from 'firebase-admin/firestore';
import { normalizeEmail, termForDate, type Term } from '../../src/shared/concertCheckin.ts';
import ORG from '../../config/orgs/nwsa.json' with { type: 'json' };

/**
 * "How many concerts have I done this semester?" (#concert-checkin)
 *
 * Served by a function for one reason: the answer lives in `concertCheckins`,
 * which is staff-only and has no public projection. Attendance is staff-only
 * data under the Hub's privacy model (#privacy) — names are public, what a
 * student did is not — so the public site cannot simply read the collection
 * and count.
 *
 * The identity check is the student's own school email, matched against the
 * address on their OWN check-in records. Without it, typing a classmate's
 * name would return their attendance record, which is exactly the line the
 * privacy model draws. It is not authentication — a school address can be
 * guessed — but it means the page is not a lookup table of everybody's
 * attendance, which is what it would otherwise be. The director decided this
 * deliberately rather than accepting name-only.
 *
 * A wrong email and a student with no records on file get the SAME refusal,
 * so this cannot be used to probe who has attended nothing.
 */

export const TERMS: Term[] = (ORG.terms ?? []) as Term[];

export interface TallyRequest {
  studentId?: unknown;
  email?: unknown;
}

export interface TermTally {
  termId: string;
  termName: string;
  required: number;
  optional: number;
  requiredGoal?: number;
  optionalGoal?: number;
}

export interface TallyResult {
  ok: boolean;
  message?: string;
  terms?: TermTally[];
  /** Concerts checked into but never checked out of — the student can still
   *  do nothing about it, but they should know it did not count. */
  incomplete?: { eventTitle: string; eventDate: string }[];
}

/** The one refusal. Never distinguishes "wrong email" from "no records", so
 *  the endpoint cannot be walked to find out who has attended nothing. */
export const NO_MATCH =
  'We could not match that name and email. Use the school address you check in with, or ask a director.';

/** Minimal shape of a stored scan, as the function reads it back. */
export interface ScanLike {
  eventId?: string;
  eventTitle?: string;
  eventDate?: string;
  eventAttendance?: string | null;
  email?: string;
  kind?: string;
  termId?: string;
}

/**
 * Count completed concerts per semester.
 *
 * A concert counts only when BOTH scans exist — checking in and wandering off
 * is the case the check-out was built to catch — and only when the concert
 * was marked Required or Optional. Mirrors talliesByStudent() in
 * src/director/checkin/checkinCsv.ts; the director's number and the student's
 * number must agree or the feature is worse than useless.
 */
export function tallyScans(
  scans: ScanLike[],
  terms: Term[],
  goals: Record<string, { required?: number; optional?: number }> = {},
): { terms: TermTally[]; incomplete: { eventTitle: string; eventDate: string }[] } {
  const byConcert = new Map<string, { in?: ScanLike; out?: ScanLike }>();
  for (const s of scans) {
    if (!s.eventId) continue;
    const pair = byConcert.get(s.eventId) ?? {};
    if (s.kind === 'out') pair.out = s; else pair.in = s;
    byConcert.set(s.eventId, pair);
  }

  const counts = new Map<string, { required: number; optional: number }>();
  const incomplete: { eventTitle: string; eventDate: string }[] = [];

  for (const pair of byConcert.values()) {
    const any = pair.in ?? pair.out;
    if (!any) continue;
    const attendance = pair.in?.eventAttendance ?? pair.out?.eventAttendance;
    if (attendance !== 'required' && attendance !== 'optional') continue;
    if (!pair.in || !pair.out) {
      incomplete.push({ eventTitle: any.eventTitle ?? '', eventDate: any.eventDate ?? '' });
      continue;
    }
    const termId = any.termId || (any.eventDate ? termForDate(any.eventDate, terms)?.id ?? '' : '');
    const c = counts.get(termId) ?? { required: 0, optional: 0 };
    if (attendance === 'required') c.required += 1; else c.optional += 1;
    counts.set(termId, c);
  }

  incomplete.sort((a, b) => b.eventDate.localeCompare(a.eventDate));

  // Every configured term is reported, including the ones at zero: "0 of 3"
  // in September is the number a student most needs to see.
  const rows: TermTally[] = terms.map(t => ({
    termId: t.id,
    termName: t.name,
    required: counts.get(t.id)?.required ?? 0,
    optional: counts.get(t.id)?.optional ?? 0,
    ...(goals[t.id]?.required != null ? { requiredGoal: goals[t.id].required } : {}),
    ...(goals[t.id]?.optional != null ? { optionalGoal: goals[t.id].optional } : {}),
  }));

  // A concert in no configured term (summer, or a year nobody set up) still
  // happened — report it rather than dropping it silently.
  for (const [termId, c] of counts) {
    if (!termId || rows.some(r => r.termId === termId)) continue;
    rows.push({ termId, termName: termId, required: c.required, optional: c.optional });
  }
  return { terms: rows, incomplete };
}

/** Does this address match the one on the student's own records? */
export function emailMatchesScans(email: string, scans: ScanLike[]): boolean {
  const want = normalizeEmail(email);
  if (!want) return false;
  return scans.some(s => normalizeEmail(s.email ?? '') === want);
}

/** Per-semester goals from the settings doc, with an empty default. */
export async function loadGoals(
  db: Firestore,
): Promise<Record<string, { required?: number; optional?: number }>> {
  try {
    const snap = await db.doc('settings/concertAttendance').get();
    return (snap.data()?.goals ?? {}) as Record<string, { required?: number; optional?: number }>;
  } catch {
    return {};
  }
}
