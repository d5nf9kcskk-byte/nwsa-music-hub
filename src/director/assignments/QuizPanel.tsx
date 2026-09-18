import { useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Download, FileUp } from 'lucide-react';
import { saveQuizFile, setQuizOpen, setQuizSelection, useQuizKey, type QuizSubmissionState } from '../hooks/useQuiz';
import { downloadCsv } from '../attendance/attendanceCsv';
import { todayStr } from '../utils';
import { ORG } from '../../org';
import {
  QuizFileError, allQuestions, latestPerStudent, parseAnswers, quizCsvFilename, quizResultsToCsv,
  quizTotalPoints, scoreQuiz, selectedQuiz,
} from '../../shared/quiz';
import type { Assignment } from '../types';
import './quizPanel.css';

/**
 * The director's side of an online test (#online-test), on the grade sheet.
 *
 * Load the test file, open it at the start of class, close it at the end,
 * download the results. Parts that are choice questions grade themselves; the
 * written answers ride along in the sheet with an empty score column, because
 * a person grades those and a blank must never read as a zero.
 */
export function QuizPanel({ assignment, state }: { assignment: Assignment; state: QuizSubmissionState }) {
  const quiz = assignment.quiz;
  const { key, loading: keyLoading } = useQuizKey(assignment.id);
  // The submissions listener lives on the grade sheet, so the roster rows and
  // this panel read ONE subscription rather than two of the same query.
  const { submissions, loading, loadError, deleteSubmission } = state;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [picking, setPicking] = useState(false);

  const link = `${ORG.publicUrl.replace(/\/$/, '')}/assignments/${assignment.id}`;
  const open = !!assignment.acceptsQuizSubmissions;
  const rows = latestPerStudent(submissions);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const { questions } = await saveQuizFile(assignment.id, await file.text());
      setMsg(`Loaded ${questions} questions. The answer key is stored privately.`);
    } catch (e) {
      setErr(e instanceof QuizFileError || e instanceof Error ? e.message : 'Could not load that file.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function toggleOpen() {
    setBusy(true); setErr('');
    try {
      await setQuizOpen(assignment.id, !open);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not change that.');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    if (!quiz) return;
    const csv = quizResultsToCsv(onTest, key ?? {}, submissions, ms =>
      new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
    downloadCsv(quizCsvFilename(assignment.title, todayStr()), csv);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable; the link is on screen */ }
  }

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="application/json,.json"
      style={{ display: 'none' }}
      onChange={e => { void onFile(e.target.files?.[0]); }}
    />
  );

  if (!quiz) {
    return (
      <section className="dir-quiz">
        <div className="dir-quiz-head">
          <div>
            <div className="dir-quiz-title">Online test</div>
            <div className="dir-field-hint">
              Load a test file and students can take this test on the assignment page with their name.
            </div>
          </div>
          <button type="button" className="dir-tool-btn" disabled={busy} onClick={() => fileRef.current?.click()}>
            <FileUp size={15} /> Load test file
          </button>
          {fileInput}
        </div>
        {err && <div className="dir-quiz-err">⚠ {err}</div>}
      </section>
    );
  }

  const bank = allQuestions(quiz);
  // Nothing ticked yet means the whole bank, so a test loaded before the
  // picker existed behaves exactly as it did.
  const selection = assignment.quizSelection;
  const picked = new Set(selection ?? bank.map(q => q.id));
  const onTest = selectedQuiz(quiz, selection);
  const onTestQuestions = allQuestions(onTest);
  const autoPoints = onTestQuestions.filter(q => q.kind === 'choice').reduce((n, q) => n + q.points, 0);
  const writtenPoints = scoreQuiz(onTest, key ?? {}, {}).toGrade;

  async function toggleQuestion(id: string) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setBusy(true); setErr('');
    try {
      await setQuizSelection(assignment.id, bank.map(q => q.id).filter(qid => next.has(qid)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dir-quiz">
      <div className="dir-quiz-head">
        <div>
          <div className="dir-quiz-title">
            Online test <span className={`dir-quiz-state ${open ? 'open' : ''}`}>{open ? 'Open' : 'Closed'}</span>
          </div>
          <div className="dir-field-hint">
            {onTestQuestions.length} of {bank.length} questions on the test · {quizTotalPoints(onTest)} points
            {autoPoints > 0 && ` · ${autoPoints} grade themselves`}
            {writtenPoints > 0 && ` · ${writtenPoints} written for you`}
          </div>
        </div>
        <button type="button" className={`dir-quiz-toggle ${open ? 'open' : ''}`} disabled={busy} onClick={toggleOpen}>
          {open ? 'Close test' : 'Open test'}
        </button>
      </div>

      <div className="dir-quiz-picker-bar">
        <button type="button" className="dir-tool-btn" onClick={() => setPicking(v => !v)}>
          {picking ? 'Done choosing' : 'Choose questions'}
        </button>
        {onTestQuestions.length === 0 && (
          <span className="dir-quiz-warn">Nothing is on the test yet.</span>
        )}
      </div>

      {picking && (
        <div className="dir-quiz-picker">
          {quiz.sections.map(section => (
            <div key={section.id} className="dir-quiz-picker-sec">
              <div className="dir-quiz-picker-head">{section.title}</div>
              {section.questions.map(q => (
                <label key={q.id} className={`dir-quiz-pick ${picked.has(q.id) ? 'on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={picked.has(q.id)}
                    disabled={busy}
                    onChange={() => { void toggleQuestion(q.id); }}
                  />
                  <span className="dir-quiz-pick-text">{q.prompt}</span>
                  <span className="dir-quiz-pick-pts">{q.points}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="dir-quiz-link">
        <span className="dir-quiz-link-url">{link}</span>
        <button type="button" className="dir-tool-btn" onClick={copyLink}>
          <Copy size={14} /> {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>

      {!keyLoading && !key && (
        <div className="dir-quiz-err">⚠ No answer key is stored for this test. Load the test file again.</div>
      )}
      {msg && <div className="dir-quiz-msg">{msg}</div>}
      {err && <div className="dir-quiz-err">⚠ {err}</div>}

      <div className="dir-quiz-bar">
        <span className="dir-quiz-count">
          {loading ? 'Loading…' : `${rows.length} submitted`}
          {loadError && ' · results did not load, check your connection'}
        </span>
        <div className="dir-quiz-tools">
          {rows.length > 0 && (
            <button type="button" className="dir-tool-btn" onClick={exportCsv} title="Opens in Excel">
              <Download size={15} /> Results sheet
            </button>
          )}
          <button type="button" className="dir-tool-btn" disabled={busy || open} onClick={() => fileRef.current?.click()}
            title={open ? 'Close the test before replacing it' : 'Replace the test file'}>
            <FileUp size={15} /> Replace file
          </button>
          {fileInput}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="dir-quiz-list">
          {rows.map(({ submission, count }) => {
            const answers = parseAnswers(submission.answersJson);
            const score = scoreQuiz(onTest, key ?? {}, answers);
            const expanded = openRow === submission.id;
            return (
              <div key={submission.id} className="dir-quiz-row">
                <button type="button" className="dir-quiz-row-btn" aria-expanded={expanded}
                  onClick={() => setOpenRow(expanded ? null : submission.id)}>
                  {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="dir-quiz-name">{submission.studentName}</span>
                  {count > 1 && <span className="dir-quiz-dupe" title="Sent more than once; the newest is shown">×{count}</span>}
                  <span className="dir-quiz-score">
                    {key ? `${score.autoEarned}/${score.autoPossible}` : '—'}
                  </span>
                  <span className="dir-quiz-time">
                    {new Date(submission.submittedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </button>
                {expanded && (
                  <div className="dir-quiz-detail">
                    {score.sections.filter(s => s.possible > 0).map(s => (
                      <div key={s.sectionId} className="dir-quiz-detail-line">{s.title}: {s.earned}/{s.possible}</div>
                    ))}
                    {onTestQuestions.filter(q => q.kind === 'text' && answers[q.id]).map(q => (
                      <div key={q.id} className="dir-quiz-written">
                        <div className="dir-quiz-written-q">{q.prompt}</div>
                        <div className="dir-quiz-written-a">{answers[q.id]}</div>
                      </div>
                    ))}
                    <button type="button" className="dir-tool-btn dir-quiz-del"
                      onClick={() => { if (window.confirm(`Delete ${submission.studentName}'s submission?`)) void deleteSubmission(submission.id); }}>
                      Delete this submission
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
