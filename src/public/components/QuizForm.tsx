import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { useHoneypot } from './Honeypot';
import { QuizTooLongError, submitQuiz } from '../../director/hooks/useQuiz';
import { withRetry } from '../../shared/withRetry';
import { ORG } from '../../org';
import { primaryStudent, rememberStudent } from '../../shared/identity';
import { QUIZ_TEXT_MAX, allQuestions, type QuizAnswers, type QuizDefinition } from '../../shared/quiz';
import type { Assignment, Student } from '../../director/types';
import '../quiz.css';

/**
 * The online test on a public assignment page (#online-test).
 *
 * A student picks their name off this class's roster, answers, and sends.
 * The list is the class the assignment was given to and nobody else, and
 * firestore.rules checks that membership again on the write — the link is not
 * a secret (students have no accounts), the roster is the gate. Nothing here
 * knows the key:
 * the assignment doc carries questions only. Answers are drafted into this
 * browser's storage as they are typed, so a tab that reloads mid-test (a
 * phone locking, a mis-tap on Back) loses nothing. Storage is best-effort and
 * the form works without it.
 */
export function QuizForm({ assignment, quiz, students }: {
  assignment: Assignment;
  quiz: QuizDefinition;
  students: Student[];
}) {
  const draftKey = `quizDraft:${assignment.id}`;
  const doneKey = `quizDone:${assignment.id}`;
  const honeypot = useHoneypot();

  const [studentId, setStudentId] = useState(
    () => readJson<{ studentId?: string }>(draftKey)?.studentId ?? primaryStudent()?.id ?? '',
  );
  const [answers, setAnswers] = useState<QuizAnswers>(() => readJson<{ answers?: QuizAnswers }>(draftKey)?.answers ?? {});
  const [state, setState] = useState<'editing' | 'confirm' | 'saving' | 'done' | 'error'>(
    () => (readJson<{ at?: number }>(doneKey)?.at ? 'done' : 'editing'),
  );
  const [doneAt, setDoneAt] = useState<number | undefined>(() => readJson<{ at?: number }>(doneKey)?.at);
  const [error, setError] = useState('');

  useEffect(() => {
    if (state === 'done') return;
    writeJson(draftKey, { studentId, answers });
  }, [draftKey, studentId, answers, state]);

  // The class this test was given to, and nobody else. Names come from
  // studentsPublic, which is already the public roster (#privacy); anyone
  // individually assigned is on the list too.
  const roster = useMemo(() => {
    const groups = new Set(assignment.ensembleIds ?? []);
    const named = new Set(assignment.studentIds ?? []);
    return students
      .filter(s => s.status === 'Active'
        && (named.has(s.id) || (s.ensembleIds ?? []).some(id => groups.has(id))))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students, assignment.ensembleIds, assignment.studentIds]);

  const me = roster.find(s => s.id === studentId);
  const name = me?.name ?? '';

  const questions = allQuestions(quiz);
  const blankChoices = questions.filter(q => q.kind === 'choice' && !answers[q.id]).length;
  const overChosen = quiz.sections
    .filter(s => s.choose)
    .map(s => ({ s, written: s.questions.filter(q => (answers[q.id] ?? '').trim()).length }))
    .filter(x => x.written > (x.s.choose ?? 0));
  const nameOk = !!me;

  function pickStudent(id: string) {
    setStudentId(id);
    const picked = roster.find(s => s.id === id);
    // Same remembered identity the rest of the public site uses, so the next
    // test on this phone opens with their name already chosen.
    if (picked) rememberStudent({ id: picked.id, name: picked.name, ensembleIds: picked.ensembleIds ?? [], instrument: picked.instrument });
  }

  function set(id: string, value: string) {
    setAnswers(a => ({ ...a, [id]: value }));
    if (state === 'confirm' || state === 'error') setState('editing');
  }

  async function send() {
    if (!me || overChosen.length > 0 || state === 'saving') return;
    if (blankChoices > 0 && state !== 'confirm') { setState('confirm'); return; }
    setState('saving'); setError('');
    try {
      await withRetry(() => submitQuiz(assignment.id, quiz, { id: me.id, name: me.name }, answers, honeypot.botFields()), 2);
      const at = Date.now();
      writeJson(doneKey, { at });
      // The draft goes the moment the test is in: on a shared computer the
      // next person must not open onto someone else's name and answers. The
      // answers stay in memory for "fix it and send again" on this page only.
      removeKey(draftKey);
      setDoneAt(at);
      setState('done');
    } catch (err) {
      setState('error');
      if (err instanceof QuizTooLongError) {
        setError('Your written answers are longer than the test can send. Shorten one a little and send again.');
      } else if ((err as { code?: string })?.code === 'permission-denied') {
        setError('The test would not take that. It is either closed, or this class list does not have you on it. Tell your teacher right away.');
      } else {
        setError(`Could not send right now. Check your connection and try again. Your answers are still here. If it keeps failing, tell your teacher or email ${ORG.contactEmail}.`);
      }
    }
  }

  if (state === 'done') {
    return (
      <div className="pub-quiz-done">
        <div className="pub-quiz-done-mark"><Check size={28} /></div>
        <h3>Test sent</h3>
        <p>
          {name ? <strong>{name}</strong> : 'Your answers'}
          {doneAt ? ` · ${new Date(doneAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
        </p>
        <p className="pub-muted">You are done. You can close this page.</p>
        <button
          type="button"
          className="pub-quiz-again"
          onClick={() => { removeKey(doneKey); setState('editing'); }}
        >
          Made a mistake? Fix it and send again
        </button>
      </div>
    );
  }

  return (
    <div className="pub-quiz">
      {honeypot.field}
      <label className="pub-quiz-label" htmlFor="quiz-name">Your name</label>
      <select
        id="quiz-name"
        className="pub-quiz-input pub-quiz-select"
        value={studentId}
        onChange={e => pickStudent(e.target.value)}
      >
        <option value="">Choose your name…</option>
        {roster.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      {roster.length === 0 && (
        <p className="pub-quiz-hint">This class has no roster in the Hub yet, so there is nobody to pick. Tell your teacher.</p>
      )}
      {roster.length > 0 && !me && (
        <p className="pub-quiz-hint">Not on the list? Tell your teacher before you start.</p>
      )}

      {quiz.sections.map(section => {
        const written = section.questions.filter(q => (answers[q.id] ?? '').trim()).length;
        return (
          <fieldset key={section.id} className="pub-quiz-section">
            <legend className="pub-quiz-section-title">{section.title}</legend>
            {section.instructions && <p className="pub-quiz-instructions">{section.instructions}</p>}
            {section.choose && (
              <p className={`pub-quiz-choose ${written > section.choose ? 'over' : ''}`}>
                Answer {section.choose}. You have answered {written}.
                {written > section.choose && ' Clear one before you send.'}
              </p>
            )}
            {section.questions.map((q, i) => (
              <div key={q.id} className="pub-quiz-q">
                <div className="pub-quiz-prompt">
                  <span className="pub-quiz-num">{i + 1}.</span> {q.prompt}
                  <span className="pub-quiz-pts">{q.points} pt{q.points === 1 ? '' : 's'}</span>
                </div>
                {q.kind === 'choice' && (q.options ?? []).length <= 4 && (
                  <div className="pub-quiz-options" role="radiogroup" aria-label={q.prompt}>
                    {(q.options ?? []).map(opt => (
                      <label key={opt} className={`pub-quiz-option ${answers[q.id] === opt ? 'picked' : ''}`}>
                        <input
                          type="radio"
                          name={`q-${q.id}`}
                          checked={answers[q.id] === opt}
                          onChange={() => set(q.id, opt)}
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                )}
                {q.kind === 'choice' && (q.options ?? []).length > 4 && (
                  <select
                    className="pub-quiz-input pub-quiz-select"
                    value={answers[q.id] ?? ''}
                    onChange={e => set(q.id, e.target.value)}
                  >
                    <option value="">Choose…</option>
                    {(q.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                )}
                {q.kind === 'text' && (
                  <textarea
                    className="pub-quiz-input pub-quiz-text"
                    rows={4}
                    maxLength={QUIZ_TEXT_MAX}
                    value={answers[q.id] ?? ''}
                    onChange={e => set(q.id, e.target.value)}
                    placeholder={section.choose ? 'Leave blank if you are not answering this one' : ''}
                  />
                )}
              </div>
            ))}
          </fieldset>
        );
      })}

      {state === 'confirm' && (
        <p className="pub-quiz-warn">
          {blankChoices} question{blankChoices === 1 ? ' is' : 's are'} still blank. Send anyway?
        </p>
      )}
      {state === 'error' && <p className="pub-quiz-error">{error}</p>}
      {!nameOk && roster.length > 0 && <p className="pub-quiz-hint">Choose your name to send.</p>}

      <button
        type="button"
        className="pub-quiz-send"
        disabled={!nameOk || overChosen.length > 0 || state === 'saving'}
        onClick={send}
      >
        {state === 'saving' ? 'Sending…' : state === 'confirm' ? 'Yes, send my test' : 'Send my test'}
      </button>
    </div>
  );
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

function removeKey(key: string): void {
  try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
}
