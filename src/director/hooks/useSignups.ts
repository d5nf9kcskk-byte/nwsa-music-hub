import { useState, useEffect, useMemo } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, setDoc,
  runTransaction, query, where, deleteField,
} from 'firebase/firestore';
import { db } from '../firebase';
import { offerUndo } from '../writeStatus';
import { watchCollection } from '../../shared/watchCollection';
import {
  slotBookingId, SignupSlotTakenError, type SlotClaim,
} from '../../shared/signupSlots';
// parseAnswers / responseIsComplete live in the shared module because the
// appointmentsFeed Cloud Function needs them and cannot import anything that
// pulls in the Firebase SDK. Re-exported below so every call site here is
// unchanged.
import {
  appointmentsForForms, parseAnswers, responseIsComplete,
} from '../../shared/signupAppointments';
import { FIXTURES_ON, FIXTURE_SIGNUPS } from './fixtures';
import { currentDirectorName } from '../currentDirector';
import type { SignupForm, SignupResponse, SignupSlotBooking } from '../types';

const MAX_SIGNUP_INVITES = 500;

export type { SlotClaim } from '../../shared/signupSlots';

/**
 * Sign-ups (#signups). `signupForms` is world-readable — the public sign-up
 * page loads it the same way PublicAssignment loads `assignments` — so this
 * hook serves both surfaces. `signupResponses` is staff-only, which is why it
 * lives in a separate hook that the public bundle never calls: a public
 * client attaching that listener would take a permission-denied error and
 * latch the "some data couldn't load" banner.
 */

export function useSignupForms() {
  const [forms, setForms] = useState<SignupForm[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { if (FIXTURES_ON) setForms(FIXTURE_SIGNUPS); setLoading(false); return; }
    return watchCollection(collection(db, 'signupForms'), 'signupForms', snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as SignupForm));
      // Newest first; a sign-up with no deadline sorts by when it was made.
      list.sort((a, b) => (b.deadline ?? '').localeCompare(a.deadline ?? '') || b.createdAt - a.createdAt);
      setForms(list);
    }, () => setLoading(false));
  }, []);

  async function addForm(data: Omit<SignupForm, 'id'>) {
    if (!db) return;
    const ref = await addDoc(collection(db, 'signupForms'), data);
    return ref.id;
  }

  async function updateForm(id: string, data: Partial<Omit<SignupForm, 'id'>>) {
    if (!db) return;
    // Explicit undefined = DELETE the field (same as useAnnouncements /
    // useAssignments). ignoreUndefinedProperties would otherwise drop the key
    // and the OLD value would survive every "clear" — switching a sign-up from
    // "Specific students" back to ensembles left audienceMode: 'students' on
    // the doc, so it stayed invisible on the public page forever.
    const stamped: Record<string, unknown> = {
      ...data, updatedAt: Date.now(), updatedBy: currentDirectorName(),
    };
    const payload = Object.fromEntries(
      Object.entries(stamped).map(([k, v]) => [k, v === undefined ? deleteField() : v]),
    );
    await updateDoc(doc(db, 'signupForms', id), payload);
  }

  async function deleteForm(id: string) {
    if (!db) return;
    const gone = forms.find(f => f.id === id);
    await deleteDoc(doc(db, 'signupForms', id));
    await deleteDoc(doc(db, 'signupAudiences', id));
    await deleteDoc(doc(db, 'signupOwners', id));
    if (gone) {
      const { id: _id, ...data } = gone;
      void _id;
      offerUndo('signupForms', id, data, `Deleted "${gone.title}" — restore?`);
    }
  }

  return { forms, loading, addForm, updateForm, deleteForm };
}

/** Staff-only: explicit student invite lists keyed by form id. */
export function useSignupAudiences() {
  const [byFormId, setByFormId] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    return watchCollection(collection(db, 'signupAudiences'), 'signupAudiences', snap => {
      const map: Record<string, string[]> = {};
      for (const d of snap.docs) {
        const ids = d.data().studentIds;
        if (Array.isArray(ids)) map[d.id] = ids.filter((x): x is string => typeof x === 'string');
      }
      setByFormId(map);
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  return { byFormId, loading };
}

/** Write or clear the staff-only invite list for a form. */
export async function saveSignupAudience(formId: string, studentIds: string[]) {
  if (!db) return;
  const uniq = [...new Set(studentIds)].slice(0, MAX_SIGNUP_INVITES);
  const ref = doc(db, 'signupAudiences', formId);
  if (!uniq.length) {
    await deleteDoc(ref);
    return;
  }
  await setDoc(ref, { studentIds: uniq });
}

export async function deleteSignupAudience(formId: string) {
  if (!db) return;
  await deleteDoc(doc(db, 'signupAudiences', formId));
}

/**
 * Who each sign-up belongs to (#signup-appointments) — formId → owner email.
 *
 * Staff-only, and the counterpart of the world-readable `ownerName` on the
 * form itself: the name is what a student sees, the email is what routes
 * booked slots to the right person's calendar and feed. Both are written
 * together by saveSignupOwner + updateForm, so a form whose name and email
 * disagree is the one state this pair exists to prevent.
 */
export function useSignupOwners() {
  const [byFormId, setByFormId] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    return watchCollection(collection(db, 'signupOwners'), 'signupOwners', snap => {
      const map: Record<string, string> = {};
      for (const d of snap.docs) {
        const email = d.data().email;
        if (typeof email === 'string' && email) map[d.id] = email;
      }
      setByFormId(map);
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  return { byFormId, loading };
}

/** Set (or clear) the staff member a sign-up's appointments belong to. */
export async function saveSignupOwner(formId: string, email: string | undefined) {
  if (!db) return;
  const ref = doc(db, 'signupOwners', formId);
  if (!email) {
    await deleteDoc(ref);
    return;
  }
  await setDoc(ref, { email });
}

/** World-readable slot claims for one sign-up form — drives the "Taken" UI. */
export function useSignupSlotBookings(formId: string) {
  const [bookings, setBookings] = useState<SignupSlotBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !formId) { setBookings([]); setLoading(false); return; }
    const q = query(collection(db, 'signupSlotBookings'), where('formId', '==', formId));
    return watchCollection(q, 'signupSlotBookings', snap => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() } as SignupSlotBooking)));
      setLoading(false);
    }, () => setLoading(false));
  }, [formId]);

  return { bookings, loading };
}

/**
 * Every slot ONE student holds, across all forms — "what times did I book?".
 *
 * Same world-readable collection as above, asked the other way round: by
 * student instead of by form, so a student's own schedule page can show the
 * times they claimed without reading staff-only `signupResponses`. The
 * booking doc already carries the student's name publicly (it has to, so the
 * sign-up page can grey out taken slots), so this exposes nothing new.
 */
export function useStudentSlotBookings(studentId: string) {
  const [bookings, setBookings] = useState<SignupSlotBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !studentId) { setBookings([]); setLoading(false); return; }
    const q = query(collection(db, 'signupSlotBookings'), where('studentId', '==', studentId));
    return watchCollection(q, 'signupSlotBookings', snap => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() } as SignupSlotBooking)));
      setLoading(false);
    }, () => setLoading(false));
  }, [studentId]);

  return { bookings, loading };
}

/**
 * The public write (#signups): one student's response. Unauthenticated and
 * create-only — firestore.rules enforces the exact shape, so this is the ONE
 * place that shape is built. `submittedAt` and `status` are stamped here
 * rather than passed in, mirroring submitAssignmentVideo().
 *
 * When `slotClaims` is set, each claim is written in the SAME transaction as
 * the response so two students cannot grab the same time slot.
 */
export async function submitSignupResponse(
  // `website` is the honeypot on 'open' sign-ups (same field name and same
  // mechanism as the parent contact form): humans never see it, and the
  // exact-key-set rule rejects the create when a bot fills it in.
  data: Omit<SignupResponse, 'id' | 'submittedAt' | 'status'> & { website?: string },
  slotClaims: SlotClaim[] = [],
): Promise<string> {
  if (!db) throw new Error('Firestore not initialized');
  const firestore = db;

  if (slotClaims.length === 0) {
    const ref = await addDoc(collection(firestore, 'signupResponses'), {
      ...data,
      submittedAt: Date.now(),
      status: 'submitted',
    });
    return ref.id;
  }

  const submittedAt = Date.now();
  const responseRef = doc(collection(firestore, 'signupResponses'));

  await runTransaction(firestore, async tx => {
    for (const claim of slotClaims) {
      const bookingRef = doc(firestore, 'signupSlotBookings', slotBookingId(data.formId, claim.questionId, claim.slotIndex));
      const existing = await tx.get(bookingRef);
      if (existing.exists()) {
        const held = existing.data()?.studentId;
        if (held !== data.studentId) throw new SignupSlotTakenError(claim.slotLabel);
      } else {
        tx.set(bookingRef, {
          formId: data.formId,
          questionId: claim.questionId,
          slotIndex: claim.slotIndex,
          slotLabel: claim.slotLabel,
          studentId: data.studentId,
          studentName: data.studentName,
          submittedAt,
        });
      }
    }
    tx.set(responseRef, { ...data, submittedAt, status: 'submitted' });
  });

  return responseRef.id;
}

/** Staff-only: everything students have sent in. */
export function useSignupResponses() {
  const [responses, setResponses] = useState<SignupResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    return watchCollection(collection(db, 'signupResponses'), 'signupResponses', snap => {
      setResponses(snap.docs.map(d => ({ id: d.id, ...d.data() } as SignupResponse)));
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  async function setStatus(id: string, status: SignupResponse['status']) {
    if (!db) return;
    await updateDoc(doc(db, 'signupResponses', id), { status });
  }

  async function remove(id: string) {
    if (!db) return;
    const gone = responses.find(r => r.id === id);
    await deleteDoc(doc(db, 'signupResponses', id));
    if (gone) {
      const { id: _id, ...data } = gone;
      void _id;
      offerUndo('signupResponses', id, data, `Removed ${gone.studentName}'s response — restore?`);
    }
  }

  return { responses, loading, setStatus, remove };
}

/** Staff-only: free a time slot someone booked (or clear a stale claim). */
export async function removeSlotBooking(booking: SignupSlotBooking) {
  if (!db) return;
  const { id, ...data } = booking;
  await deleteDoc(doc(db, 'signupSlotBookings', id));
  offerUndo('signupSlotBookings', id, data, `Freed ${booking.slotLabel} — restore?`);
}

/**
 * The current answer per student. A student who comes back and fills in more
 * of the form creates a SECOND doc (there is no unauthenticated update — see
 * SignupResponse), so "what did Maria say" is always the newest one.
 * Withdrawn responses stay in the list so the director can see someone
 * pulled out rather than silently losing them.
 */
export function latestPerStudent(responses: SignupResponse[]): SignupResponse[] {
  const best = new Map<string, SignupResponse>();
  for (const r of responses) {
    // An 'open' sign-up's responses carry no studentId — there is nobody to
    // collapse them against, so each one stands on its own doc id. Keying
    // them all on '' would show the director exactly one of them.
    const key = r.studentId || r.id;
    const prev = best.get(key);
    if (!prev || r.submittedAt > prev.submittedAt) best.set(key, r);
  }
  return [...best.values()];
}

/** Reading a response — the shared definitions, re-exported so this module
 *  stays the one import site for the sign-ups screens. See
 *  src/shared/signupAppointments.ts for why they live there. */
export { parseAnswers, responseIsComplete };

/** Every slot claim on every form — the director's calendar needs the lot,
 *  where the sign-up detail screen only ever wants one form's. */
export function useAllSignupSlotBookings() {
  const [bookings, setBookings] = useState<SignupSlotBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    return watchCollection(collection(db, 'signupSlotBookings'), 'signupSlotBookings', snap => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() } as SignupSlotBooking)));
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  return { bookings, loading };
}

/**
 * Booked time slots as calendar appointments (#signup-appointments), for the
 * Schedule screen.
 *
 * Nothing new is stored: an appointment is derived from the form, the booking,
 * and the newest response, which are three collections the Hub already reads.
 * That is why freeing a slot makes the appointment disappear everywhere at
 * once — there is no second copy to keep in step.
 *
 * `ownerEmail` narrows to one person's sign-ups. Pass undefined for all of
 * them (an Owner looking at the whole department's day).
 */
export function useSignupAppointments(ownerEmail?: string) {
  const { forms, loading: formsLoading } = useSignupForms();
  const { bookings, loading: bookingsLoading } = useAllSignupSlotBookings();
  const { responses, loading: responsesLoading } = useSignupResponses();
  const { byFormId: owners, loading: ownersLoading } = useSignupOwners();

  const appointments = useMemo(() => {
    const mine = ownerEmail ? forms.filter(f => owners[f.id] === ownerEmail) : forms;
    return appointmentsForForms(mine, bookings, responses);
  }, [forms, bookings, responses, owners, ownerEmail]);

  return {
    appointments,
    loading: formsLoading || bookingsLoading || responsesLoading || ownersLoading,
  };
}
