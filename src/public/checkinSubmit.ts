import type { CheckinKind } from '../shared/concertCheckin';

/**
 * Posting a scan to the concertCheckin Cloud Function (#concert-checkin).
 *
 * The v1 Functions hostname is derivable from the project id alone, which is
 * why the endpoint is v1 — the same reason the lessons feed is (a v2 URL
 * carries a project hash unknown until after the first deploy).
 *
 * Nothing here decides anything. The page has already checked the window, the
 * domain, and whether this student is on file, so the student hears about a
 * problem early; the function checks all of it again and its answer is the
 * one that counts.
 */

export interface CheckinOutcome {
  ok: boolean;
  failure?: string;
  message?: string;
  at?: number;
}

export function checkinEndpoint(): string {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  return projectId ? `https://us-central1-${projectId}.cloudfunctions.net/concertCheckin` : '';
}

/**
 * One scan. Exactly one of `studentId` (a student on the roster) and
 * `guestName` (the college door — a student not entered in the Hub yet, who
 * typed their own name). A guest never sends a student id: the function
 * derives one from the email, so a caller cannot name itself.
 */
export type CheckinPost =
  & { eventId: string; email: string; kind: CheckinKind; photo?: string }
  & ({ studentId: string; guestName?: never } | { guestName: string; studentId?: never });

export async function submitCheckin(args: CheckinPost): Promise<CheckinOutcome> {
  const url = checkinEndpoint();
  if (!url) {
    return { ok: false, failure: 'offline', message: 'The Hub is not configured for check-in yet.' };
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
  } catch {
    // A concert lobby is the worst wifi in the building. Say so plainly, and
    // never claim a record was written when the request never landed.
    return {
      ok: false,
      failure: 'network',
      message: 'That did not reach the Hub. Check your signal and press it again.',
    };
  }
  try {
    return await res.json() as CheckinOutcome;
  } catch {
    return { ok: false, failure: 'network', message: 'The Hub gave an answer we could not read. Try again.' };
  }
}
