// .ts extension: loaded by scripts/signup-eligibility.selfcheck.mjs — see
// the note in instrumentFamily.ts.
import { instrumentFamily, type InstrumentFamily } from './instrumentFamily.ts';

/**
 * Who a sign-up is for (#signups) — the ONE definition, shared by the public
 * sign-up page (which decides whether to show a student the form), the Home
 * and personal-schedule alerts, and the director's Sign-ups screen (which
 * counts "3 of 14 responded" against exactly the same set).
 *
 * Two independent narrowings, ANDed:
 *   • ensembleIds — empty means the whole program.
 *   • families    — empty means every instrument. "The string players in
 *                   Camerata" is ensembleIds: ['camerata'] + families:
 *                   ['strings'].
 *
 * Deliberately NOT a list of student ids: `signupForms` is world-readable
 * (the public page has to load it before anyone identifies themselves), and
 * student doc ids are shared with `studentsPublic` — so an explicit invite
 * list would publish which named students were invited to what. Ensembles
 * and instrument families are already public facts about a student.
 */

export interface SignupAudience {
  ensembleIds: string[];
  families: InstrumentFamily[];
}

type EligibleStudent = {
  ensembleIds?: string[];
  instrument?: string;
  status?: string;
};

export function eligibleForSignup(student: EligibleStudent, audience: SignupAudience): boolean {
  if (student.status && student.status !== 'Active') return false;
  if (audience.ensembleIds.length
      && !audience.ensembleIds.some(id => (student.ensembleIds ?? []).includes(id))) {
    return false;
  }
  if (audience.families.length) {
    const fam = instrumentFamily(student.instrument);
    // An unrecognized (or missing) instrument can't be proven to belong to a
    // targeted family. Showing the form to everyone would be worse than a
    // director fixing one roster instrument, so this fails closed.
    if (!fam || !audience.families.includes(fam)) return false;
  }
  return true;
}

/** Plain-English "who this is for", e.g. "Camerata · Strings". */
export function audienceLabel(
  audience: SignupAudience,
  ensembleName: (id: string) => string,
  familyLabel: (f: InstrumentFamily) => string,
): string {
  const who = audience.ensembleIds.map(ensembleName).filter(Boolean).join(', ')
    || 'Everyone in the program';
  const what = audience.families.map(familyLabel).join(', ');
  return what ? `${who} · ${what}` : who;
}

/** Has this sign-up gone live yet? Mirrors `isPublished` for announcements
 *  and assignments — no publishAt, or its moment has passed. */
export function signupIsPublished(form: { publishAt?: number }, now: number = Date.now()): boolean {
  return !form.publishAt || form.publishAt <= now;
}

/** Is this sign-up accepting responses right now? Live, not closed by hand,
 *  and on or before its deadline (the deadline day itself still counts). */
export function signupIsOpen(
  form: { publishAt?: number; closed?: boolean; deadline?: string },
  today: string,
  now: number = Date.now(),
): boolean {
  if (!signupIsPublished(form, now)) return false;
  if (form.closed) return false;
  return !form.deadline || form.deadline >= today;
}

/** Why a live sign-up is no longer taking responses — for the message the
 *  student sees. Null while it is still open. */
export function signupClosedReason(
  form: { publishAt?: number; closed?: boolean; deadline?: string },
  today: string,
  now: number = Date.now(),
): 'closed' | 'deadline' | null {
  if (signupIsOpen(form, today, now)) return null;
  return form.closed || !form.deadline ? 'closed' : 'deadline';
}
