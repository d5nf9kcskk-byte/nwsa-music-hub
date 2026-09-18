import { useEffect, useState } from 'react';
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, query, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { watchCollection } from '../../shared/watchCollection';
import { currentDirectorName } from '../currentDirector';
import {
  QUIZ_ANSWERS_MAX, cleanAnswers, splitQuizFile,
  type QuizAnswers, type QuizDefinition, type QuizKey, type QuizSubmission,
} from '../../shared/quiz';

/**
 * Online tests (#online-test). Three Firestore homes, three audiences:
 *
 *   - `assignments/{id}.quiz`     the questions — world-readable, no answers
 *   - `assignmentKeys/{id}`       the answer key — staff-only
 *   - `quizSubmissions`           what students sent — public create, staff read
 *
 * The pure rules (splitting, scoring, the CSV) live in src/shared/quiz.ts.
 */

export class QuizTooLongError extends Error {}

/** Public: send a student's test. `website` is the honeypot (Honeypot.tsx). */
export async function submitQuiz(
  assignmentId: string,
  quiz: QuizDefinition,
  student: { id: string; name: string },
  answers: QuizAnswers,
  bot: { website?: string },
): Promise<string> {
  if (!db) throw new Error('Firestore not initialized');
  const answersJson = JSON.stringify(cleanAnswers(quiz, answers));
  if (answersJson.length > QUIZ_ANSWERS_MAX) throw new QuizTooLongError();
  const ref = await addDoc(collection(db, 'quizSubmissions'), {
    assignmentId,
    studentId: student.id,
    studentName: student.name.trim().slice(0, 120),
    answersJson,
    ...bot,
    submittedAt: Date.now(),
    status: 'submitted',
  });
  return ref.id;
}

export interface QuizSubmissionState {
  submissions: QuizSubmission[];
  loading: boolean;
  loadError: boolean;
  deleteSubmission: (id: string) => Promise<void>;
}

/** Staff: every submission for one assignment. Equality filter only, so no
 *  composite index is needed (same posture as useAssignmentSubmissions). */
export function useQuizSubmissions(assignmentId?: string): QuizSubmissionState {
  const [submissions, setSubmissions] = useState<QuizSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!db || !assignmentId) return;
    const q = query(collection(db, 'quizSubmissions'), where('assignmentId', '==', assignmentId));
    return watchCollection(q, 'quizSubmissions', snap => {
      setLoadError(false);
      setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() } as QuizSubmission)));
    }, () => setLoading(false), () => setLoadError(true));
  }, [assignmentId]);

  async function deleteSubmission(id: string) {
    if (!db) return;
    await deleteDoc(doc(db, 'quizSubmissions', id));
  }

  return { submissions, loading: loading && !!db && !!assignmentId, loadError, deleteSubmission };
}

/** Staff: the answer key for one assignment. */
export function useQuizKey(assignmentId?: string) {
  const [key, setKey] = useState<QuizKey | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !assignmentId) return;
    const firestore = db;
    // Same retry as watchCollection: a staff-only listener attached a beat
    // before the auth token lands is denied once and never recovers on its own.
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsub = () => {};
    const attach = () => {
      if (!alive) return;
      unsub = onSnapshot(doc(firestore, 'assignmentKeys', assignmentId), snap => {
        const answers = snap.exists() ? (snap.data().answers as QuizKey | undefined) : undefined;
        setKey(answers ?? null);
        setLoading(false);
      }, () => {
        setLoading(false);
        if (alive) timer = setTimeout(attach, 3000);
      });
    };
    attach();
    return () => { alive = false; if (timer) clearTimeout(timer); unsub(); };
  }, [assignmentId]);

  return { key, loading: loading && !!db && !!assignmentId };
}

/**
 * Staff: load a test file onto an assignment. The KEY is written first, so a
 * failure between the two writes leaves an unused key rather than a public
 * test with no way to grade it.
 */
export async function saveQuizFile(assignmentId: string, fileText: string): Promise<{ questions: number }> {
  if (!db) throw new Error('Firestore not initialized');
  let raw: unknown;
  try {
    raw = JSON.parse(fileText);
  } catch {
    throw new Error('That file is not a test file (it is not JSON).');
  }
  const { quiz, key } = splitQuizFile(raw);
  const updatedBy = currentDirectorName();
  await setDoc(doc(db, 'assignmentKeys', assignmentId), { answers: key, updatedAt: Date.now(), updatedBy });
  await updateDoc(doc(db, 'assignments', assignmentId), { quiz, updatedAt: Date.now(), updatedBy });
  return { questions: quiz.sections.reduce((n, s) => n + s.questions.length, 0) };
}

/** Staff: choose which of the bank's questions are on this exam. */
export async function setQuizSelection(assignmentId: string, ids: string[]): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, 'assignments', assignmentId), {
    quizSelection: ids,
    updatedAt: Date.now(),
    updatedBy: currentDirectorName(),
  });
}

/** Staff: open or close the test. The rules read this flag on every create. */
export async function setQuizOpen(assignmentId: string, open: boolean): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, 'assignments', assignmentId), {
    acceptsQuizSubmissions: open,
    updatedAt: Date.now(),
    updatedBy: currentDirectorName(),
  });
}
