import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router';
import { ClipboardSignature, FileText, CalendarClock, Check, Search, Paperclip } from 'lucide-react';
import { db } from '../director/firebase';
import { useSignupForms, submitSignupResponse, useSignupSlotBookings } from '../director/hooks/useSignups';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useMinuteTick } from '../director/hooks/useAnnouncements';
import { useStudentsPublic } from './hooks/usePublicRoster';
import { BackLink } from './components/BackLink';
import { EmptyState } from './components/PageHeader';
import { todayStr, toDateStr, ensembleDisplayName } from '../director/utils';
import { sortStudents } from '../director/scoreOrder';
import { fmtLongDate } from '../shared/dates';
import { useLang } from '../shared/i18n';
import { primaryStudent } from '../shared/identity';
import { INSTRUMENT_FAMILY_LABEL } from '../shared/instrumentFamily';
import { audienceLabel, eligibleForSignupPicker, signupClosedReason, signupIsPublished } from '../shared/signupEligibility';
import {
  slotClaimsForAnswers, takenSlotIndices, slotHeldByStudent,
  SignupSlotTakenError, SignupSlotGradeError, assertClaimsMatchGrade,
  gradesMatchSlot, slotBlockedReason, slotGradeAllows,
} from '../shared/signupSlots';
import { getReceipt, saveReceipt } from './signupReceipt';
import { PUBLIC_STUDENT_INFO } from './publicStudentInfo';
import { ORG } from '../org';
import type { Attachment, SignupForm, SignupQuestion, SignupSlotBooking, Student } from '../director/types';
import './signup.css';

/**
 * The student side of a sign-up (#signups): "I want to do this — here's my
 * name and my grade", then whatever paperwork the director attached, signed
 * in the same sitting. Create-only public write, shape-enforced in
 * firestore.rules exactly like the planned-absence and contact forms.
 *
 * Deliberately one page and one Send: the whole point of the feature is to
 * replace collect-names → email-the-file → chase-the-file with a single
 * thing a student can finish on a phone between classes.
 */

const GRADE_OPTIONS = ['9th', '10th', '11th', '12th'];

/** Answers ride to Firestore as one bounded JSON string (see SignupResponse).
 *  Anything past the rules ceiling would be rejected, so trim to fit here and
 *  tell the student, rather than failing the whole send at the last step. */
const ANSWERS_MAX = 4000;
const ANSWER_MAX = 600;

function questionsFor(form: SignupForm): SignupQuestion[] {
  return Array.isArray(form.questions) ? form.questions : [];
}

export function PublicSignup() {
  useLang();
  const { id = '' } = useParams();
  const now = useMinuteTick();
  const today = todayStr();
  const { forms, loading: formsLoading } = useSignupForms();
  const { students, loading: studentsLoading } = useStudentsPublic();
  const { ensembles } = useEnsembles();

  const form = forms.find(f => f.id === id);
  const questions = useMemo(() => (form ? questionsFor(form) : []), [form]);
  const { bookings: slotBookings } = useSignupSlotBookings(id);
  const takenSlots = useMemo(() => takenSlotIndices(slotBookings), [slotBookings]);

  const eligible = useMemo(() => {
    if (!form) return [];
    return sortStudents(
      students.filter(s => eligibleForSignupPicker(s, form)),
      'lastName',
    );
  }, [students, form]);

  // Pre-pick the student this device already identified as, when they're on
  // the list — most students never touch the name picker at all. This is
  // DERIVED, not a useState initializer: on the first render the roster is
  // still loading, so `eligible` is empty and an initializer would latch null
  // and never recover. `undefined` = hasn't chosen, `null` = tapped "Not you?".
  const saved = primaryStudent();
  const savedEligible = saved && eligible.some(s => s.id === saved.id) ? saved.id : null;

  const [pickedId, setPickedId] = useState<string | null | undefined>(undefined);
  const studentId = pickedId !== undefined ? pickedId : savedEligible;
  const [query, setQuery] = useState('');
  const [gradeTouched, setGradeTouched] = useState(false);
  const [grade, setGrade] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [signature, setSignature] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianSignature, setGuardianSignature] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  const student = eligible.find(s => s.id === studentId) ?? null;
  // The roster's grade is the default; the student confirms or corrects it,
  // which is the whole "and this is the grade I'm in" step.
  const effectiveGrade = gradeTouched ? grade : (student?.grade ?? '');
  const receipt = useMemo(() => getReceipt(id), [id]);

  // Every hook runs above the early returns below — React requires the same
  // hook order on every render, loading or not.
  const answersJson = useMemo(() => {
    const filled: Record<string, string> = {};
    for (const q of questions) {
      const v = (answers[q.id] ?? '').trim();
      if (v) filled[q.id] = v.slice(0, ANSWER_MAX);
    }
    return Object.keys(filled).length ? JSON.stringify(filled) : '';
  }, [answers, questions]);
  const answersTooLong = answersJson.length > ANSWERS_MAX;

  // Drop a timeslot pick the moment the confirmed grade no longer allows it
  // (e.g. Ava picked a seniors-only Monday, then her grade shows 10th).
  useEffect(() => {
    if (!effectiveGrade.trim()) return;
    setAnswers(prev => {
      let changed = false;
      const next = { ...prev };
      for (const q of questions) {
        if (q.type !== 'timeslot') continue;
        const ans = (next[q.id] ?? '').trim();
        if (!ans) continue;
        const idx = (q.options ?? []).indexOf(ans);
        if (idx < 0) continue;
        if (!slotGradeAllows(q, idx, effectiveGrade)) {
          next[q.id] = '';
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [effectiveGrade, questions]);

  if (formsLoading || studentsLoading) {
    return <div className="pub-page"><div className="pub-signup-loading">Loading…</div></div>;
  }

  if (!form || !signupIsPublished(form, now)) {
    return (
      <div className="pub-page">
        <BackLink fallback="/signups" label="Sign-ups" />
        <EmptyState icon={<ClipboardSignature size={30} />}>
          That sign-up isn’t available. It may have been taken down, or the link may be out of date.
        </EmptyState>
      </div>
    );
  }

  const closedReason = signupClosedReason(form, today, now);
  const docUrl = form.formUrl ?? '';
  const who = form.audienceMode === 'students'
    ? 'By invitation'
    : audienceLabel(
      { ensembleIds: form.ensembleIds ?? [], families: form.families ?? [] },
      eid => ensembleDisplayName(ensembles.find(e => e.id === eid)),
      f => INSTRUMENT_FAMILY_LABEL[f],
    );

  const needsSignature = !!form.signatureStatement;
  const needsGuardian = !!form.guardianStatement;
  const missingRequired = questions.some(q => q.required && !(answers[q.id] ?? '').trim());
  const valid = !!student
    && effectiveGrade.trim() !== ''
    && !missingRequired
    && (!needsSignature || signature.trim().length >= 3)
    && (!needsGuardian || (guardianName.trim().length >= 2 && guardianSignature.trim().length >= 3))
    && (!form.collectEmail || /.+@.+\..+/.test(email.trim()))
    // Optional, but if they typed one it has to parse — the rules reject a
    // malformed address and the student would never see why.
    && (guardianEmail.trim() === '' || /.+@.+\..+/.test(guardianEmail.trim()));

  async function submit() {
    if (!db || !student || !valid || state === 'saving') return;
    if (answersTooLong) {
      setState('error');
      setError('Your answers are longer than this form can send — please shorten them a little.');
      return;
    }
    setState('saving'); setError('');
    try {
      const slotClaims = form ? slotClaimsForAnswers(form, answers) : [];
      if (form) assertClaimsMatchGrade(form, slotClaims, effectiveGrade.trim());
      await submitSignupResponse({
        formId: id,
        studentId: student.id,
        studentName: student.name.slice(0, 120),
        grade: effectiveGrade.trim().slice(0, 40),
        ...(student.instrument ? { instrument: student.instrument.slice(0, 60) } : {}),
        ...(email.trim() ? { email: email.trim().slice(0, 254) } : {}),
        ...(phone.trim() ? { phone: phone.trim().slice(0, 40) } : {}),
        ...(answersJson ? { answersJson } : {}),
        ...(signature.trim() ? { signature: signature.trim().slice(0, 120) } : {}),
        ...(guardianName.trim() ? { guardianName: guardianName.trim().slice(0, 120) } : {}),
        ...(guardianSignature.trim() ? { guardianSignature: guardianSignature.trim().slice(0, 120) } : {}),
        ...(guardianEmail.trim() ? { guardianEmail: guardianEmail.trim().slice(0, 254) } : {}),
      }, slotClaims);
      saveReceipt(id, {
        studentId: student.id,
        studentName: student.name,
        complete: !missingRequired && (!needsSignature || !!signature.trim()) && (!needsGuardian || !!guardianSignature.trim()),
      });
      setState('done');
    } catch (err) {
      setState('error');
      if (err instanceof SignupSlotTakenError) {
        setError(`That time (${err.slotLabel}) was just taken — pick another slot.`);
      } else if (err instanceof SignupSlotGradeError) {
        setError(`That time (${err.slotLabel}) isn’t available for your grade — ${err.reason}.`);
      } else if (form?.audienceMode === 'students') {
        setError(`This sign-up is by invitation — if your name isn’t on the list, email ${ORG.contactEmail}.`);
      } else {
        setError(`Could not send right now — check your connection and try again, or email ${ORG.contactEmail}.`);
      }
    }
  }

  if (state === 'done') {
    return (
      <div className="pub-page">
        <div className="pub-signup-done">
          <div className="pub-signup-done-mark"><Check size={30} /></div>
          <h1>You’re signed up</h1>
          <p>
            <strong>{student?.name}</strong> · {effectiveGrade} — sent to your director.
            {needsSignature && ' Your signature went with it.'}
          </p>
          <p className="pub-muted">
            Nothing else to do right now. If your director needs anything more,
            they’ll reach out{email.trim() ? ` at ${email.trim()}` : ''}.
          </p>
          <Link className="pub-signup-send" to="/">Back to the Hub</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pub-page">
      <BackLink fallback="/signups" label="Sign-ups" />

      <header className="pub-signup-head">
        <div className="pub-signup-kicker"><ClipboardSignature size={14} /> Sign-up</div>
        <h1>{form.title}</h1>
        <div className="pub-signup-meta">
          <span>{who}</span>
          {form.deadline && (
            <span className={`pub-signup-due ${form.deadline === today ? 'urgent' : ''}`}>
              <CalendarClock size={13} /> {deadlineLine(form.deadline, today)}
            </span>
          )}
        </div>
        {form.intro && <p className="pub-signup-intro">{form.intro}</p>}
        {docUrl && (
          <a className="pub-signup-doc" href={docUrl} target="_blank" rel="noreferrer">
            <FileText size={15} /> Open the official form
          </a>
        )}
      </header>

      {/* `state === 'done'` returned above, so this only shows before a send. */}
      {receipt && (
        <div className="pub-signup-receipt">
          <Check size={15} /> You already signed up as <strong>{receipt.studentName}</strong> on{' '}
          {fmtLongDate(toDateStr(new Date(receipt.at)))}.
          {!closedReason && ' Sending this form again replaces your earlier answers.'}
        </div>
      )}

      {closedReason ? (
        <div className="pub-card pub-signup-closed">
          <h2>Sign-ups are closed</h2>
          <p>
            {closedReason === 'deadline' && form.deadline
              ? `This closed after ${fmtLongDate(form.deadline)}.`
              : 'Your director has closed this sign-up.'}
            {' '}If you still want in, email{' '}
            <a href={`mailto:${ORG.contactEmail}?subject=${encodeURIComponent(form.title)}`}>{ORG.contactEmail}</a>.
          </p>
        </div>
      ) : !PUBLIC_STUDENT_INFO ? (
        <div className="pub-card">
          <p className="pub-muted">The roster isn’t published yet, so you can’t pick your name here. Email {ORG.contactEmail}.</p>
        </div>
      ) : eligible.length === 0 ? (
        <div className="pub-card">
          <p className="pub-muted">
            Nobody on the roster matches who this sign-up is for ({who}). If that’s wrong,
            let your director know — they can widen it in a tap.
          </p>
        </div>
      ) : (
        <>
          {/* ── 1 · who you are ─────────────────────────────── */}
          <div className="pub-signup-step">
            <div className="pub-signup-step-num">1</div>
            <div className="pub-signup-step-title">Your name</div>
          </div>
          <div className="pub-card">
            {student ? (
              <div className="pub-signup-me">
                <div>
                  <div className="pub-signup-me-name">{student.name}</div>
                  <div className="pub-muted">{[student.instrument, student.grade].filter(Boolean).join(' · ')}</div>
                </div>
                <button className="pub-signup-switch" onClick={() => { setPickedId(null); setQuery(''); }}>
                  Not you?
                </button>
              </div>
            ) : (
              <>
                <p className="pub-absence-hint" style={{ marginTop: 0 }}>
                  {form.audienceMode === 'students'
                    ? 'Tap your name. Only invited students can submit — if you’re not on the list, email your director.'
                    : 'Tap your name. Only students this sign-up is for are listed.'}
                </p>
                {eligible.length > 8 && (
                  <div className="pub-search" style={{ marginBottom: 10 }}>
                    <Search size={18} />
                    <input
                      className="pub-search-input"
                      placeholder="Type your name…"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                    />
                  </div>
                )}
                <div className="pub-signup-names">
                  {matching(eligible, query).map(s => (
                    <button key={s.id} className="pub-signup-name-row" onClick={() => { setPickedId(s.id); setGradeTouched(false); }}>
                      <span className="pub-roster-name">{s.name}</span>
                      <span className="pub-roster-instr">{[s.instrument, s.grade].filter(Boolean).join(' · ')}</span>
                    </button>
                  ))}
                  {matching(eligible, query).length === 0 && (
                    <div className="pub-muted">No matching name on this list.</div>
                  )}
                </div>
              </>
            )}
          </div>

          {student && (
            <>
              {/* ── 2 · grade + contact ───────────────────────── */}
              <div className="pub-signup-step">
                <div className="pub-signup-step-num">2</div>
                <div className="pub-signup-step-title">Confirm your grade</div>
              </div>
              <div className="pub-card">
                <label className="pub-absence-label" htmlFor="su-grade">Grade you’re in</label>
                <select
                  id="su-grade"
                  className="pub-absence-input"
                  value={effectiveGrade}
                  onChange={e => { setGradeTouched(true); setGrade(e.target.value); }}
                >
                  <option value="">Choose your grade…</option>
                  {gradeChoices(student.grade).map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                {student.grade && effectiveGrade && effectiveGrade !== student.grade && (
                  <div className="pub-signup-note">
                    The roster says {student.grade}. Your director will see that you corrected it.
                  </div>
                )}

                {form.collectEmail && (
                  <>
                    <label className="pub-absence-label" htmlFor="su-email">Your email</label>
                    <input id="su-email" className="pub-absence-input" type="email" inputMode="email"
                      autoComplete="email" maxLength={254} value={email}
                      onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
                    <div className="pub-signup-note">So your director can send you what comes next.</div>
                  </>
                )}
                {form.collectPhone && (
                  <>
                    <label className="pub-absence-label" htmlFor="su-phone">Phone <span className="pub-signup-optional">(optional)</span></label>
                    <input id="su-phone" className="pub-absence-input" type="tel" inputMode="tel"
                      autoComplete="tel" maxLength={40} value={phone}
                      onChange={e => setPhone(e.target.value)} placeholder="(305) 555-0134" />
                  </>
                )}
              </div>

              {/* ── 3 · the director's questions ───────────────── */}
              {questions.length > 0 && (
                <>
                  <div className="pub-signup-step">
                    <div className="pub-signup-step-num">3</div>
                    <div className="pub-signup-step-title">The form</div>
                  </div>
                  <div className="pub-card">
                    {questions.map(q => (
                      <QuestionField
                        key={q.id}
                        question={q}
                        value={answers[q.id] ?? ''}
                        onChange={v => setAnswers(a => ({ ...a, [q.id]: v }))}
                        takenSlots={takenSlots.get(q.id)}
                        studentId={student.id}
                        studentGrade={effectiveGrade}
                        slotBookings={slotBookings}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* ── 4 · signature ──────────────────────────────── */}
              {needsSignature && (
                <>
                  <div className="pub-signup-step">
                    <div className="pub-signup-step-num">{questions.length > 0 ? 4 : 3}</div>
                    <div className="pub-signup-step-title">Sign</div>
                  </div>
                  <div className="pub-card">
                    <p className="pub-signup-statement">{form.signatureStatement}</p>
                    <label className="pub-absence-label" htmlFor="su-sign">Type your full name to sign</label>
                    <input id="su-sign" className="pub-absence-input pub-signup-sign" maxLength={120}
                      autoComplete="off" autoCapitalize="words" value={signature}
                      onChange={e => setSignature(e.target.value)} placeholder={student.name} />
                    <div className="pub-signup-note">
                      Typing your name here counts as your signature, and records the date and time.
                    </div>

                    {needsGuardian && (
                      <>
                        <div className="pub-signup-divider" />
                        <p className="pub-signup-statement">{form.guardianStatement}</p>
                        <label className="pub-absence-label" htmlFor="su-gname">Parent/guardian name</label>
                        <input id="su-gname" className="pub-absence-input" maxLength={120}
                          autoComplete="name" value={guardianName}
                          onChange={e => setGuardianName(e.target.value)} placeholder="e.g. Jordan Rivera" />
                        <label className="pub-absence-label" htmlFor="su-gsign">Parent/guardian signature</label>
                        <input id="su-gsign" className="pub-absence-input pub-signup-sign" maxLength={120}
                          autoComplete="off" autoCapitalize="words" value={guardianSignature}
                          onChange={e => setGuardianSignature(e.target.value)} placeholder="Type the full name above" />
                        <label className="pub-absence-label" htmlFor="su-gemail">
                          Parent/guardian email <span className="pub-signup-optional">(optional)</span>
                        </label>
                        <input id="su-gemail" className="pub-absence-input" type="email" inputMode="email"
                          maxLength={254} value={guardianEmail}
                          onChange={e => setGuardianEmail(e.target.value)} placeholder="parent@example.com" />
                      </>
                    )}
                  </div>
                </>
              )}

              {error && <div className="pub-absence-error">⚠ {error}</div>}

              <button className="pub-signup-send" disabled={!valid || state === 'saving'} onClick={submit}>
                {state === 'saving' ? 'Sending…' : needsSignature ? 'Sign and send' : 'Send to my director'}
              </button>
              {!valid && (
                <div className="pub-signup-note pub-signup-why">
                  {whyNotYet({ effectiveGrade, missingRequired, needsSignature, signature, needsGuardian, guardianName, guardianSignature, collectEmail: !!form.collectEmail, email, guardianEmail })}
                </div>
              )}
              <p className="pub-signup-privacy">
                What you send here goes only to {ORG.orgShortName} staff.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────

function QuestionField({ question, value, onChange, takenSlots, studentId, studentGrade, slotBookings }: {
  question: SignupQuestion;
  value: string;
  onChange: (v: string) => void;
  takenSlots?: Set<number>;
  studentId?: string;
  studentGrade?: string;
  slotBookings?: SignupSlotBooking[];
}) {
  const label = (
    <label className="pub-absence-label" htmlFor={`su-q-${question.id}`}>
      {question.label}{!question.required && <span className="pub-signup-optional"> (optional)</span>}
    </label>
  );
  return (
    <div className="pub-signup-q">
      {label}
      {question.reference && <QuestionReference file={question.reference} />}
      {question.type === 'long' ? (
        <textarea id={`su-q-${question.id}`} className="pub-absence-input pub-signup-textarea"
          rows={4} maxLength={ANSWER_MAX} value={value} onChange={e => onChange(e.target.value)} />
      ) : question.type === 'choice' ? (
        <select id={`su-q-${question.id}`} className="pub-absence-input"
          value={value} onChange={e => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {(question.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : question.type === 'timeslot' ? (
        <div className="pub-signup-slots" id={`su-q-${question.id}`} role="radiogroup" aria-label={question.label}>
          {(question.options ?? []).map((slot, i) => {
            const taken = takenSlots?.has(i) && !(studentId && slotBookings && slotHeldByStudent(slotBookings, question.id, i, studentId));
            const allowed = question.optionGrades?.[i];
            const gradeOk = !studentGrade || gradesMatchSlot(studentGrade, allowed);
            const blocked = !taken && !!studentGrade && !gradeOk;
            const gradeBadge = slotBlockedReason(allowed);
            const selected = value === slot;
            const disabled = taken || blocked;
            return (
              <button
                key={slot}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                className={`pub-signup-slot ${selected ? 'active' : ''} ${taken || blocked ? 'taken' : ''}`}
                onClick={() => { if (!disabled) onChange(selected ? '' : slot); }}
              >
                <span className="pub-signup-slot-time">{slot}</span>
                {taken && <span className="pub-signup-slot-badge">Taken</span>}
                {!taken && gradeBadge && (
                  <span className={`pub-signup-slot-badge ${blocked ? '' : 'pub-signup-slot-badge-limit'}`}>
                    {blocked ? 'Not available' : gradeBadge}
                  </span>
                )}
              </button>
            );
          })}
          {(question.options ?? []).length === 0 && (
            <div className="pub-signup-note">No times listed yet — check back soon.</div>
          )}
        </div>
      ) : question.type === 'yesno' ? (
        <div className="pub-signup-yesno">
          {['Yes', 'No'].map(o => (
            <button
              key={o}
              type="button"
              className={`pub-signup-yesno-btn ${value === o ? 'active' : ''}`}
              onClick={() => onChange(value === o ? '' : o)}
            >
              {o}
            </button>
          ))}
        </div>
      ) : (
        <input id={`su-q-${question.id}`} className="pub-absence-input"
          maxLength={ANSWER_MAX} value={value} onChange={e => onChange(e.target.value)} />
      )}
      {question.help && <div className="pub-signup-note">{question.help}</div>}
    </div>
  );
}

function isImageAttachment(file: Attachment): boolean {
  return /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(file.name)
    || /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(file.url);
}

function QuestionReference({ file }: { file: Attachment }) {
  if (isImageAttachment(file)) {
    return (
      <a className="pub-signup-ref" href={file.url} target="_blank" rel="noreferrer">
        <img className="pub-signup-ref-img" src={file.url} alt={file.name} />
      </a>
    );
  }
  return (
    <a className="pub-signup-ref-link" href={file.url} target="_blank" rel="noreferrer">
      <Paperclip size={14} /> {file.name || 'Reference file'}
    </a>
  );
}

function matching(students: Student[], query: string): Student[] {
  const q = query.trim().toLowerCase();
  if (!q) return students;
  return students.filter(s =>
    s.name.toLowerCase().includes(q) || (s.preferredName ?? '').toLowerCase().includes(q));
}

/** 9th–12th, plus whatever the roster says when it isn't one of those (a
 *  college-credit or transfer label shouldn't vanish from the dropdown). */
function gradeChoices(rosterGrade?: string): string[] {
  const g = (rosterGrade ?? '').trim();
  return g && !GRADE_OPTIONS.includes(g) ? [...GRADE_OPTIONS, g] : GRADE_OPTIONS;
}

function deadlineLine(deadline: string, today: string): string {
  if (deadline < today) return `Closed ${fmtLongDate(deadline)}`;
  if (deadline === today) return 'Closes today';
  return `By ${fmtLongDate(deadline)}`;
}

/** One plain sentence naming what's still missing — better than a dead
 *  button with no explanation, which is what students actually report. */
function whyNotYet(s: {
  effectiveGrade: string; missingRequired: boolean;
  needsSignature: boolean; signature: string;
  needsGuardian: boolean; guardianName: string; guardianSignature: string;
  collectEmail: boolean; email: string; guardianEmail: string;
}): string {
  if (!s.effectiveGrade.trim()) return 'Pick the grade you’re in to continue.';
  if (s.collectEmail && !/.+@.+\..+/.test(s.email.trim())) return 'Add your email to continue.';
  if (s.missingRequired) return 'A question above still needs an answer.';
  if (s.needsSignature && s.signature.trim().length < 3) return 'Type your full name to sign.';
  if (s.needsGuardian && (s.guardianName.trim().length < 2 || s.guardianSignature.trim().length < 3)) {
    return 'A parent or guardian still needs to add their name and sign.';
  }
  if (s.guardianEmail.trim() && !/.+@.+\..+/.test(s.guardianEmail.trim())) {
    return 'That parent/guardian email doesn’t look right — fix it or clear it.';
  }
  return '';
}
