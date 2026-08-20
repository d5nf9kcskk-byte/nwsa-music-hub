import { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { offerUndo } from '../writeStatus';
import { watchCollection } from '../../shared/watchCollection';
import { FIXTURES_ON, FIXTURE_SIGNUPS } from './fixtures';
import { currentDirectorName } from '../currentDirector';
import type { SignupForm, SignupResponse } from '../types';

/**
 * Sign-ups (#signups). `signupForms` is world-readable — the public sign-up
 * page loads it the same way PublicSubmission loads `assignments` — so this
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
    await updateDoc(doc(db, 'signupForms', id), {
      ...data, updatedAt: Date.now(), updatedBy: currentDirectorName(),
    });
  }

  async function deleteForm(id: string) {
    if (!db) return;
    const gone = forms.find(f => f.id === id);
    await deleteDoc(doc(db, 'signupForms', id));
    if (gone) {
      const { id: _id, ...data } = gone;
      void _id;
      offerUndo('signupForms', id, data, `Deleted "${gone.title}" — restore?`);
    }
  }

  return { forms, loading, addForm, updateForm, deleteForm };
}

/**
 * The public write (#signups): one student's response. Unauthenticated and
 * create-only — firestore.rules enforces the exact shape, so this is the ONE
 * place that shape is built. `submittedAt` and `status` are stamped here
 * rather than passed in, mirroring submitAssignmentVideo().
 */
export async function submitSignupResponse(
  data: Omit<SignupResponse, 'id' | 'submittedAt' | 'status'>,
): Promise<string> {
  if (!db) throw new Error('Firestore not initialized');
  const ref = await addDoc(collection(db, 'signupResponses'), {
    ...data,
    submittedAt: Date.now(),
    status: 'submitted',
  });
  return ref.id;
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
    const prev = best.get(r.studentId);
    if (!prev || r.submittedAt > prev.submittedAt) best.set(r.studentId, r);
  }
  return [...best.values()];
}

/** Answers as a plain object. Never throws: the stored JSON comes from an
 *  unauthenticated write, so a malformed value reads as "no answers". */
export function parseAnswers(response: Pick<SignupResponse, 'answersJson'>): Record<string, string> {
  if (!response.answersJson) return {};
  try {
    const parsed: unknown = JSON.parse(response.answersJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** True once the student has done everything this form asks for — the
 *  distinction between "said yes" and "paperwork is in". */
export function responseIsComplete(form: SignupForm, r: SignupResponse): boolean {
  if (form.signatureStatement && !r.signature) return false;
  if (form.guardianStatement && !(r.guardianName && r.guardianSignature)) return false;
  const answers = parseAnswers(r);
  return form.questions.every(q => !q.required || (answers[q.id] ?? '').trim() !== '');
}
