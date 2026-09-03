import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, deleteField, query, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import { noteLoadError, noteLoadOk } from '../../shared/appStatus';
import { trackWrite } from '../writeStatus';
import {
  directorRole,
  directorRoles,
  hasDirectorRole,
  isStaffMember,
  primaryDirectorRole,
  directorRoleLabels,
  type DirectorRole,
} from '../directorRoles';

export type { DirectorRole };
export {
  directorRole,
  directorRoles,
  hasDirectorRole,
  isStaffMember,
  primaryDirectorRole,
  directorRoleLabels,
};

/**
 * Director allowlist, stored as data (#deploy-hang fix). Each doc's id is the
 * director's lowercased Google sign-in email; presence grants access. Adding or
 * removing a director is a plain Firestore write — no rules redeploy — which is
 * what ends the old "added a director, their saves silently fail until someone
 * hand-deploys the rules" trap. Enforcement lives in firestore.rules (only the
 * Owner may add/remove/change roles here); this hook powers the Directors screen.
 *
 * Four access levels (#roles) — see StaffRole in types.ts:
 *   • owner     — the one account that can manage this list (add/remove
 *                 directors, change roles). Assigned out-of-band, never through
 *                 the app, so there's never more than one by accident.
 *   • director  — full edit access to everything except this list.
 *   • teacher   — scoped to scheduling private lessons for their own assigned
 *                 students (see Lesson / useLessons). Cannot touch rosters,
 *                 schedule, repertoire, documents, announcements, or this list.
 *   • assistant — Student Assistant: takes roll (attendance) for the
 *                 ensembles in `assignedEnsembleIds`. Optional extras on
 *                 `assistantCapabilities` (schedule / repertoire / sign-ups /
 *                 announcements) — never contacts, notes, or grades.
 * A doc with no `role`/`roles` (every director created before this feature) is
 * treated as ['director'] everywhere — see `directorRoles()`.
 *
 * Multi-role (#roles): one person may hold several levels at once (e.g.
 * director + applied teacher). Stored as `roles: StaffRole[]`; the legacy
 * single `role` field is still read for unmigrated docs.
 */

export interface Director {
  email: string;    // doc id
  name?: string;    // display name — auto-captured from Google profile on
                     // first sign-in (see currentDirector.ts), editable after
  /** @deprecated Prefer `roles`. Still read for unmigrated docs. */
  role?: DirectorRole;
  /** One or more access levels — a director who also teaches lists both. */
  roles?: DirectorRole[];
  addedBy?: string; // email of the director who added them
  addedAt?: number; // epoch ms
  /** Applied-teacher only: instrument(s) they teach, e.g. ["Violin"]. */
  instruments?: string[];
  /** Applied-teacher only: students they give private lessons to. An Owner/Director
   *  sets this when adding the teacher; the teacher may adjust it themselves
   *  afterward (firestore.rules allows a director to self-edit this field). */
  assignedStudentIds?: string[];
  /** Applied-teacher only: the STANDING weekly lesson time for each assigned
   *  student, keyed by student id (#applied). Lives here, beside the
   *  assignment it qualifies, rather than in a collection of its own — see
   *  src/director/lessonSchedule.ts for why, and for the expansion into
   *  ordinary dated Lesson docs. Staff-only, like the whole directors doc. */
  lessonSlots?: Record<string, import('../lessonSchedule').LessonSlot>;
  /** Applied-teacher only: the parts of the paper High School Lesson Log that
   *  are filled in ONCE per student per term rather than once per lesson —
   *  the Jury Repertoire List and the three signature lines. Keyed by
   *  `sheetKey(studentId, schoolYear, term)` so Fall and Spring are separate
   *  sheets, as on paper. Here beside `lessonSlots` for the same reason: no
   *  new collection and no second query/rule pair (#applied). */
  lessonLogSheets?: Record<string, import('../lessonLog').LessonLogSheet>;
  /** Ensembles / classes this person is responsible for — conducting (director),
   *  roll (assistant), or teaching (classroom). Jazz Combos can also match by
   *  name pattern via `assignedEnsemblePatterns`. */
  assignedEnsembleIds?: string[];
  /** Name patterns (case-insensitive regex) that expand to ensemble ids at read
   *  time — e.g. every "Jazz Combo #N" joins automatically. */
  assignedEnsemblePatterns?: string[];
  /** Student Assistant only: optional extras beyond take-roll (see
   *  AssistantCapability). Absent / empty = roll only. */
  assistantCapabilities?: import('../types').AssistantCapability[];
  /** MDC work email — shown on ensemble/class pages instead of the Gmail login. */
  mdcEmail?: string;
  phone?: string;
}

/** Normalise an email to the form used as the Firestore doc id. */
export function directorEmailId(email: string): string {
  return email.trim().toLowerCase();
}

export function useDirectors() {
  const [directors, setDirectors] = useState<Director[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    const q = query(collection(db, 'directors'), orderBy('email'));
    return onSnapshot(q, snap => {
      setDirectors(snap.docs.map(d => ({ email: d.id, ...d.data() } as Director)));
      noteLoadOk('directors');
      setLoading(false);
    }, () => { noteLoadError('directors'); setLoading(false); });
  }, []);

  /** Add a new director (Owner only — enforced in firestore.rules). Role
   *  defaults to 'director'; 'owner' is never assignable from the app. */
  async function addDirector(email: string, addedBy?: string, extra?: {
    name?: string;
    roles?: Exclude<DirectorRole, 'owner'>[];
    /** @deprecated Use `roles`. */
    role?: Exclude<DirectorRole, 'owner'>;
    instruments?: string[];
    assignedStudentIds?: string[];
    assignedEnsembleIds?: string[];
    assistantCapabilities?: import('../types').AssistantCapability[];
    mdcEmail?: string;
    phone?: string;
  }) {
    if (!db) return;
    const dbRef = db;
    const id = directorEmailId(email);
    const roles = extra?.roles ?? (extra?.role ? [extra.role] : ['director']);
    await trackWrite('Director', () =>
      setDoc(doc(dbRef, 'directors', id), {
        email: id,
        roles,
        ...(extra?.name ? { name: extra.name } : {}),
        ...(extra?.instruments ? { instruments: extra.instruments } : {}),
        ...(extra?.assignedStudentIds ? { assignedStudentIds: extra.assignedStudentIds } : {}),
        ...(extra?.assignedEnsembleIds ? { assignedEnsembleIds: extra.assignedEnsembleIds } : {}),
        ...(extra?.assistantCapabilities?.length
          ? { assistantCapabilities: extra.assistantCapabilities }
          : {}),
        ...(extra?.mdcEmail ? { mdcEmail: extra.mdcEmail } : {}),
        ...(extra?.phone ? { phone: extra.phone } : {}),
        addedBy: addedBy ?? null,
        addedAt: Date.now(),
      }));
  }

  /**
   * Edit an existing director's name / role / instruments / assigned
   * students or ensembles. Owner can change anything about anyone;
   * firestore.rules also lets a signed-in director update ONLY `name` or
   * `assignedStudentIds` on their OWN doc (self-service name capture and
   * "students assigned to me"). A key explicitly set to `undefined` is
   * DELETED (ignoreUndefinedProperties would otherwise drop it silently and
   * strand e.g. a stale ensemble list on someone switched away from
   * assistant).
   */
  async function updateDirector(email: string, patch: Partial<Omit<Director, 'email'>>) {
    if (!db) return;
    const dbRef = db;
    const id = directorEmailId(email);
    const payload = Object.fromEntries(
      Object.entries(patch).map(([k, v]) => [k, v === undefined ? deleteField() : v]),
    );
    await trackWrite('Director update', () => updateDoc(doc(dbRef, 'directors', id), payload));
  }

  async function removeDirector(email: string) {
    if (!db) return;
    const dbRef = db;
    await trackWrite('Director removal', () =>
      deleteDoc(doc(dbRef, 'directors', directorEmailId(email))));
  }

  return { directors, loading, addDirector, updateDirector, removeDirector };
}

/**
 * A single director's own doc, live. Unlike `useDirectors()` (which lists
 * the whole collection — Owner-only under firestore.rules), this only ever
 * `get`s one doc, which any signed-in user may do for their OWN email — so
 * a Teacher can read/edit their own `assignedStudentIds` without needing
 * list access to everyone else's.
 */
export function useMyDirector(email: string | null | undefined) {
  const [director, setDirector] = useState<Director | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !email) { setLoading(false); return; }
    const id = directorEmailId(email);
    return onSnapshot(doc(db, 'directors', id), snap => {
      setDirector(snap.exists() ? ({ email: id, ...snap.data() } as Director) : null);
      setLoading(false);
    }, () => setLoading(false));
  }, [email]);

  return { director, loading };
}
