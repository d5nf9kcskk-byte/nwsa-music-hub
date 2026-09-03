// .ts extension: loaded by scripts/signup-eligibility.selfcheck.mjs — see
// the note in instrumentFamily.ts.
import { instrumentFamily, type InstrumentFamily } from './instrumentFamily.ts';

/**
 * Who a sign-up is for (#signups) — the ONE definition, shared by the public
 * sign-up page (which decides whether to show a student the form), the Home
 * and personal-schedule alerts, and the director's Sign-ups screen (which
 * counts "3 of 14 responded" against exactly the same set).
 *
 * Three modes:
 *   • groups — ensembleIds + families ANDed (empty = whole program / all).
 *   • students — explicit studentIds (staff-only list loaded into this
 *     object on the director side only). Never stored on the world-readable
 *     signupForms doc.
 *   • open — anyone with the link, on the roster or not. The roster plays no
 *     part: nobody is "eligible" and nobody is "waiting", so the director's
 *     screen counts responses rather than "3 of 14".
 *
 * Deliberately NOT a list of student ids on signupForms: that collection is
 * world-readable and student doc ids are shared with studentsPublic — so an
 * explicit invite list there would publish which named students were invited.
 */

export type SignupAudienceMode = 'groups' | 'students' | 'open';

export interface SignupAudience {
  mode?: SignupAudienceMode;
  ensembleIds: string[];
  families: InstrumentFamily[];
  /** Staff-only: loaded from signupAudiences/{formId}. */
  studentIds?: string[];
}

type EligibleStudent = {
  id?: string;
  ensembleIds?: string[];
  instrument?: string;
  status?: string;
};

export function eligibleForSignup(student: EligibleStudent, audience: SignupAudience): boolean {
  // Open sign-ups target nobody in particular — the audience is whoever has
  // the link, so no roster student is "expected to respond".
  if (audience.mode === 'open') return false;
  if (student.status && student.status !== 'Active') return false;

  if (audience.mode === 'students') {
    const ids = audience.studentIds ?? [];
    if (!ids.length || !student.id) return false;
    return ids.includes(student.id);
  }

  if (audience.ensembleIds.length
      && !audience.ensembleIds.some(id => (student.ensembleIds ?? []).includes(id))) {
    return false;
  }
  if (audience.families.length) {
    const fam = instrumentFamily(student.instrument);
    if (!fam || !audience.families.includes(fam)) return false;
  }
  return true;
}

/** Public-side name picker: group filters only (invite list is staff-only).
 *  Submit is still enforced in firestore.rules for student-specific sign-ups. */
export function eligibleForSignupPicker(
  student: EligibleStudent,
  form: { ensembleIds?: string[]; families?: InstrumentFamily[]; audienceMode?: SignupAudienceMode },
): boolean {
  // Open sign-ups have no name picker at all — the student types their name.
  if (form.audienceMode === 'open') return false;
  if (form.audienceMode === 'students') {
    if (student.status && student.status !== 'Active') return false;
    // Full roster for name pick — rules reject non-invited submits.
    return true;
  }
  return eligibleForSignup(student, {
    mode: 'groups',
    ensembleIds: form.ensembleIds ?? [],
    families: form.families ?? [],
  });
}

/** Home / schedule alerts — only group sign-ups. Invite-only ones need a
 *  direct link, and an OPEN one is aimed at people who aren't in the Hub at
 *  all: showing "type your name" to a student the roster already knows is
 *  the confusion this mode exists to avoid. */
export function signupShowsInAlerts(form: { audienceMode?: SignupAudienceMode }): boolean {
  return form.audienceMode !== 'students' && form.audienceMode !== 'open';
}

/** The /signups INDEX — a wider question than the alert strip, and not the
 *  same one (Sept 2026). The index reused `signupShowsInAlerts`, so an
 *  "Anyone with the link" sign-up existed at its own URL and nowhere else:
 *  a director who opened one had to hand-write an announcement to give
 *  anybody a way in, and a student who lost the link had none.
 *
 *  An open sign-up belongs on the list — the title and audience are already
 *  world-readable on `signupForms`, so listing it publishes nothing new, and
 *  a page you can only reach if you already have the link is not a menu.
 *  Invite-only stays off: "by invitation" means the invitation IS the route,
 *  and the direct link is what carries it. */
export function signupShowsInIndex(form: { audienceMode?: SignupAudienceMode }): boolean {
  return form.audienceMode !== 'students';
}

/** Plain-English "who this is for", e.g. "Camerata · Strings" or "12 students". */
export function audienceLabel(
  audience: SignupAudience,
  ensembleName: (id: string) => string,
  familyLabel: (f: InstrumentFamily) => string,
): string {
  if (audience.mode === 'open') return 'Anyone with the link';
  if (audience.mode === 'students') {
    const n = audience.studentIds?.length ?? 0;
    return n ? `${n} specific student${n === 1 ? '' : 's'}` : 'Specific students (none picked yet)';
  }
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
