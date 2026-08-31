import { Fragment, useMemo, useRef, useState } from 'react';
import { NotesText } from '../../public/components/NotesText';
import { RichTextArea } from '../components/RichTextArea';
import {
  ClipboardSignature, Plus, Users, CalendarClock, Check, Copy, Download, Printer,
  Mail, Link2, Lock, Unlock, Trash2, ChevronLeft, Sparkles, AlertTriangle, Clock,
} from 'lucide-react';
import { useSignupForms, useSignupResponses, useSignupSlotBookings, useSignupAudiences, saveSignupAudience, deleteSignupAudience, removeSlotBooking, latestPerStudent, parseAnswers, responseIsComplete } from '../hooks/useSignups';
import { useStudents } from '../hooks/useStudents';
import { useEnsembles } from '../hooks/useEnsembles';
import { useMinuteTick } from '../hooks/useAnnouncements';
import { SchedulePublishField } from '../components/SchedulePublishField';
import { FileUpload } from '../components/FileUpload';
import { useModalA11y } from '../../shared/useModalA11y';
import { FilterMenu } from '../../shared/FilterMenu';
import { whenQueued } from '../writeStatus';
import { printViaPopup } from '../../shared/printPopup';
import { downloadCsv } from '../attendance/attendanceCsv';
import { addDays, formatDate, todayStr, musicEnsembles, ensembleColor } from '../utils';
import { lastName } from '../scoreOrder';
import { INSTRUMENT_FAMILIES, INSTRUMENT_FAMILY_LABEL } from '../../shared/instrumentFamily';
import { audienceLabel, eligibleForSignup, signupIsOpen, signupIsPublished } from '../../shared/signupEligibility';
import { isTimeslotQuestion } from '../../shared/signupSlots';
import { normalizeTimeslotQuestion, signupQuestionHasContent } from '../../shared/signupSlotTimes';
import { deleteStoredFile } from '../storageCleanup';
import { SignupSlotBuilder } from './SignupSlotBuilder';
import { byLastName, emailList, exportSlug, namesList, responsesToCsv } from './signupsExport';
import { allStateTemplate } from './signupTemplates';
import { ORG } from '../../org';
import { studentMatchesQuery } from '../studentSearch';
import type {
  Ensemble, InstrumentFamilyId, SignupForm, SignupQuestion, SignupResponse, SignupSlotBooking, Student,
} from '../types';
import './signups.css';

/**
 * Sign-ups (#signups) — the director side.
 *
 * Built around the workflow a director actually described: "I have to get all
 * of their names, then I have to email the files to them after I put their
 * names in the system, or I post them all in the same place. It's really
 * messy." So this screen is not just a list of answers:
 *
 *   • Copy names       — the paste-into-the-state-system step, one tap.
 *   • Mark entered     — per student, so the second half of that job is
 *                        tracked instead of remembered.
 *   • Email everyone   — every address collected, in one mail.
 *   • Print packet     — every signed form, one per page → Save as PDF →
 *                        drop the file in Drive. No PDF library needed; the
 *                        browser's own print-to-PDF is the export.
 *   • Still waiting    — who hasn't answered, with their names ready to copy
 *                        into a chase-up message.
 */

type Draft = Omit<SignupForm, 'id'> & { inviteStudentIds?: string[] };

export function SignupsView() {
  const now = useMinuteTick();
  const today = todayStr();
  const { forms, loading, addForm, updateForm, deleteForm } = useSignupForms();
  const { responses, setStatus, remove } = useSignupResponses();
  const { byFormId: audiences } = useSignupAudiences();
  const { students } = useStudents();
  const { ensembles } = useEnsembles();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ form: SignupForm | null; draft: Draft } | null>(null);

  const open = forms.find(f => f.id === openId) ?? null;

  function newSignup(draft?: Draft) {
    setEditing({ form: null, draft: draft ?? blankDraft(today) });
  }

  async function save(draft: Draft) {
    if (!editing) return;
    const { inviteStudentIds, ...formDraft } = draft;
    const mode = formDraft.audienceMode ?? 'groups';
    if (editing.form) {
      await updateForm(editing.form.id, formDraft);
      if (mode === 'students') await saveSignupAudience(editing.form.id, inviteStudentIds ?? []);
      else await deleteSignupAudience(editing.form.id);
    } else {
      const id = await addForm(formDraft);
      if (id) {
        if (mode === 'students') await saveSignupAudience(id, inviteStudentIds ?? []);
        setOpenId(id);
      }
    }
    setEditing(null);
  }

  if (open) {
    return (
      <>
        <SignupDetail
          form={open}
          responses={responses.filter(r => r.formId === open.id)}
          students={students}
          ensembles={ensembles}
          audiences={audiences}
          today={today}
          now={now}
          onBack={() => setOpenId(null)}
          onEdit={() => setEditing({ form: open, draft: toDraft(open, audiences) })}
          onToggleClosed={() => void updateForm(open.id, { closed: !open.closed })}
          onExtend={deadline => void updateForm(open.id, { deadline })}
          onSetStatus={setStatus}
          onRemoveResponse={remove}
          onDelete={async () => { await deleteForm(open.id); setOpenId(null); }}
        />
        {editing && (
          <SignupEditor
            initial={editing.draft}
            isNew={!editing.form}
            formId={editing.form?.id}
            ensembles={ensembles}
            students={students}
            onSave={save}
            onClose={() => setEditing(null)}
          />
        )}
      </>
    );
  }

  return (
    <div className="dir-signups">
      <div className="dir-signups-toolbar">
        <button className="dir-btn dir-btn-primary" onClick={() => newSignup()}>
          <Plus size={15} /> New sign-up
        </button>
        <button className="dir-btn dir-btn-ghost" onClick={() => newSignup(allStateTemplate(addDays(today, 1)))}>
          <Sparkles size={15} /> All-State template
        </button>
      </div>

      {!loading && forms.length === 0 && (
        <div className="dir-empty">
          <ClipboardSignature size={40} />
          <h3>No sign-ups yet</h3>
          <p>
            A sign-up asks students to say yes and fill out the paperwork in one place —
            you get their names, grades, and signatures without chasing email.
            The All-State template sets one up in about a minute.
          </p>
        </div>
      )}

      {forms.map(f => {
        const mine = latestPerStudent(responses.filter(r => r.formId === f.id))
          .filter(r => r.status !== 'withdrawn');
        const target = students.filter(s => eligibleForSignup(s, audienceOf(f, audiences)));
        const complete = mine.filter(r => responseIsComplete(f, r)).length;
        const live = signupIsOpen(f, today, now);
        return (
          <button key={f.id} className="dir-signup-card" onClick={() => setOpenId(f.id)}>
            <div className="dir-signup-card-head">
              <span className="dir-signup-card-title">{f.title}</span>
              <span className={`dir-signup-state ${live ? 'open' : 'closed'}`}>
                {live ? 'Open' : signupIsPublished(f, now) ? 'Closed' : 'Scheduled'}
              </span>
            </div>
            <div className="dir-signup-card-meta">
              <span><Users size={13} /> {mine.length} of {target.length} responded</span>
              {(f.signatureStatement || (f.questions ?? []).length > 0) && (
                <span><Check size={13} /> {complete} complete</span>
              )}
              {f.deadline && (
                <span className={live && f.deadline === today ? 'urgent' : undefined}>
                  <CalendarClock size={13} /> {f.deadline === today ? 'Closes today' : formatDate(f.deadline)}
                </span>
              )}
            </div>
            <div className="dir-signup-card-who">
              {audienceLabel(audienceOf(f, audiences), id => ensembles.find(e => e.id === id)?.name ?? '', fam => INSTRUMENT_FAMILY_LABEL[fam])}
            </div>
          </button>
        );
      })}

      {editing && (
        <SignupEditor
          initial={editing.draft}
          isNew={!editing.form}
          formId={editing.form?.id}
          ensembles={ensembles}
          students={students}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ── Detail ────────────────────────────────────────────────────────────

interface DetailProps {
  form: SignupForm;
  responses: SignupResponse[];
  students: Student[];
  ensembles: Ensemble[];
  audiences: Record<string, string[]>;
  today: string;
  now: number;
  onBack: () => void;
  onEdit: () => void;
  onToggleClosed: () => void;
  onExtend: (deadline: string) => void;
  onSetStatus: (id: string, status: SignupResponse['status']) => Promise<void>;
  onRemoveResponse: (id: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

function SignupDetail({
  form, responses, students, ensembles, audiences, today, now,
  onBack, onEdit, onToggleClosed, onExtend, onSetStatus, onRemoveResponse, onDelete,
}: DetailProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [freeingId, setFreeingId] = useState<string | null>(null);
  const { bookings: slotBookings } = useSignupSlotBookings(form.id);

  const latest = useMemo(() => latestPerStudent(responses).sort(byLastName), [responses]);
  const active = latest.filter(r => r.status !== 'withdrawn');
  const target = useMemo(
    () => students.filter(s => eligibleForSignup(s, audienceOf(form, audiences))),
    [students, form, audiences],
  );
  const respondedIds = new Set(active.map(r => r.studentId));
  const waiting = target.filter(s => !respondedIds.has(s.id))
    .sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)));
  const questions = form.questions ?? [];
  const timeslotQuestions = useMemo(() => questions.filter(isTimeslotQuestion), [questions]);
  // A sign-up that only asks for a name and a grade has no "complete" state
  // to report — every response would read Complete, which says nothing.
  const asksForMore = !!form.signatureStatement || questions.length > 0;
  const live = signupIsOpen(form, today, now);
  const publicUrl = `${ORG.publicUrl.replace(/\/$/, '')}/signup/${form.id}`;
  const docUrl = form.formUrl ?? '';

  async function freeSlot(booking: SignupSlotBooking) {
    if (freeingId) return;
    const who = booking.studentName;
    if (!window.confirm(`Free ${booking.slotLabel}?${who ? ` ${who} could book it again.` : ''}`)) return;
    setFreeingId(booking.id);
    try {
      await removeSlotBooking(booking);
    } finally {
      setFreeingId(null);
    }
  }

  async function copy(what: string, text: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(c => (c === what ? '' : c)), 2200);
    } catch {
      // Clipboard is blocked in some in-app browsers — a prompt still lets
      // the director copy by hand rather than losing the action entirely.
      window.prompt('Copy this:', text);
    }
  }

  function printPacket() {
    if (printRef.current) printViaPopup(`${ORG.brandName} — ${form.title}`, printRef.current.outerHTML);
    else window.print();
  }

  const mailto = () => {
    const to = emailList(active);
    const subject = encodeURIComponent(form.title);
    return `mailto:?bcc=${encodeURIComponent(to)}&subject=${subject}`;
  };

  return (
    <div className="dir-signups">
      <button className="dir-drawer-back" onClick={onBack}>
        <ChevronLeft size={16} /> All sign-ups
      </button>

      <div className="dir-signup-detail-head">
        <div>
          <h2 className="dir-signup-detail-title">{form.title}</h2>
          <div className="dir-signup-card-meta">
            <span className={`dir-signup-state ${live ? 'open' : 'closed'}`}>
              {live ? 'Open' : signupIsPublished(form, now) ? 'Closed' : 'Scheduled'}
            </span>
            <span><Users size={13} /> {active.length} of {target.length} responded</span>
            {form.deadline && (
              <span className={live && form.deadline === today ? 'urgent' : undefined}>
                <CalendarClock size={13} /> {formatDate(form.deadline)}
              </span>
            )}
          </div>
          <div className="dir-signup-card-who">
            {audienceLabel(audienceOf(form, audiences), id => ensembles.find(e => e.id === id)?.name ?? '', fam => INSTRUMENT_FAMILY_LABEL[fam])}
          </div>
        </div>
      </div>

      {/* Share — the students' way in. */}
      <div className="dir-signup-share">
        <div className="dir-signup-share-url">{publicUrl}</div>
        <button className="dir-tool-btn" onClick={() => void copy('link', publicUrl)}>
          <Link2 size={15} /> {copied === 'link' ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <p className="dir-signup-hint">
        {form.audienceMode === 'students'
          ? 'This sign-up is by invitation — share the link with the students you picked. It won’t appear on the Hub home page.'
          : 'Students also see this on the Hub home page and on their own schedule page — they don’t need the link. It stops showing once they’ve sent it.'}
      </p>

      {/* The workflow row. */}
      <div className="dir-signups-toolbar">
        <button className="dir-tool-btn" disabled={!active.length} onClick={() => void copy('names', namesList(active))}>
          <Copy size={15} /> {copied === 'names' ? 'Copied' : 'Copy names'}
        </button>
        <button
          className="dir-tool-btn"
          disabled={!active.length}
          onClick={() => downloadCsv(`${exportSlug(form)}-${today}.csv`, responsesToCsv(form, active))}
        >
          <Download size={15} /> CSV
        </button>
        <button className="dir-tool-btn" disabled={!active.length} onClick={printPacket}>
          <Printer size={15} /> Print / save PDF
        </button>
        <a className={`dir-tool-btn${emailList(active) ? '' : ' dir-signup-disabled'}`} href={mailto()}>
          <Mail size={15} /> Email everyone
        </a>
        <button className="dir-tool-btn" onClick={onToggleClosed}>
          {form.closed ? <><Unlock size={15} /> Reopen</> : <><Lock size={15} /> Close now</>}
        </button>
        {form.deadline && form.deadline <= today && !form.closed && (
          <button className="dir-tool-btn" onClick={() => onExtend(addDays(today, 1))}>
            <CalendarClock size={15} /> Give one more day
          </button>
        )}
        <button className="dir-tool-btn" onClick={onEdit}>Edit sign-up</button>
      </div>

      {docUrl && (
        <p className="dir-signup-hint">
          Students see a link to <a href={docUrl} target="_blank" rel="noreferrer">the official form</a> on the sign-up page.
        </p>
      )}

      {questions.length > 0 && (
        <>
          <div className="dir-signup-section">Questions</div>
          {questions.map(q => (
            <div key={q.id} className="dir-signup-qlist-row">
              <span>{q.label}</span>
              <span className={`dir-signup-tag ${q.required ? 'required' : 'optional'}`}>
                {q.required ? 'Required' : 'Optional'}
              </span>
            </div>
          ))}
        </>
      )}

      {timeslotQuestions.length > 0 && (
        <>
          <div className="dir-signup-section"><Clock size={13} /> Time slots</div>
          {timeslotQuestions.map(q => (
            <SignupSlotSchedule
              key={q.id}
              question={q}
              bookings={slotBookings.filter(b => b.questionId === q.id)}
              freeingId={freeingId}
              onFree={freeSlot}
            />
          ))}
        </>
      )}

      {/* Responses. */}
      <div className="dir-signup-section">Responses</div>
      {latest.length === 0 && (
        <div className="dir-empty-inline">Nothing in yet. Responses land here the moment a student sends one.</div>
      )}
      {latest.map(r => {
        const complete = responseIsComplete(form, r);
        const answers = parseAnswers(r);
        const student = students.find(s => s.id === r.studentId);
        const gradeChanged = !!student?.grade && student.grade !== r.grade;
        return (
          <article key={r.id} className={`dir-signup-resp ${r.status === 'withdrawn' ? 'withdrawn' : ''}`}>
            <button className="dir-signup-resp-head" onClick={() => setOpenRow(id => (id === r.id ? null : r.id))} aria-expanded={openRow === r.id}>
              <span className="dir-signup-resp-name">{r.studentName}</span>
              <span className="dir-signup-resp-grade">{r.grade}</span>
              {r.instrument && <span className="dir-signup-resp-instr">{r.instrument}</span>}
              <span className="dir-signup-tags">
                {asksForMore && (complete
                  ? <span className="dir-signup-tag done"><Check size={12} /> Complete</span>
                  : <span className="dir-signup-tag partial">Interest only</span>)}
                {r.status === 'entered' && <span className="dir-signup-tag entered">In the system</span>}
                {r.status === 'withdrawn' && <span className="dir-signup-tag withdrawn">Withdrawn</span>}
              </span>
            </button>
            {openRow === r.id && (
              <div className="dir-signup-resp-body">
                {gradeChanged && (
                  <div className="dir-signup-warn">
                    <AlertTriangle size={13} /> They entered <strong>{r.grade}</strong>; the roster says {student?.grade}.
                  </div>
                )}
                <div className="dir-signup-resp-meta">
                  <span>Sent {new Date(r.submittedAt).toLocaleString()}</span>
                  {r.email && <a href={`mailto:${r.email}`}>{r.email}</a>}
                  {r.phone && <span>{r.phone}</span>}
                </div>
                {questions.map(q => (
                  <div key={q.id} className="dir-signup-answer">
                    <div className="dir-signup-answer-q">{q.label}</div>
                    <div className="dir-signup-answer-a">{answers[q.id] || <em>— no answer —</em>}</div>
                  </div>
                ))}
                {r.signature && (
                  <div className="dir-signup-answer">
                    <div className="dir-signup-answer-q">Signed by student</div>
                    <div className="dir-signup-sig">{r.signature}</div>
                  </div>
                )}
                {r.guardianSignature && (
                  <div className="dir-signup-answer">
                    <div className="dir-signup-answer-q">Signed by parent/guardian{r.guardianName ? ` — ${r.guardianName}` : ''}</div>
                    <div className="dir-signup-sig">{r.guardianSignature}</div>
                    {r.guardianEmail && <a className="dir-signup-answer-a" href={`mailto:${r.guardianEmail}`}>{r.guardianEmail}</a>}
                  </div>
                )}
                <div className="dir-signup-resp-actions">
                  <button
                    className="dir-tool-btn"
                    onClick={() => void onSetStatus(r.id, r.status === 'entered' ? 'submitted' : 'entered')}
                  >
                    <Check size={15} /> {r.status === 'entered' ? 'Not in the system yet' : 'Mark entered in the system'}
                  </button>
                  <button
                    className="dir-tool-btn"
                    onClick={() => void onSetStatus(r.id, r.status === 'withdrawn' ? 'submitted' : 'withdrawn')}
                  >
                    {r.status === 'withdrawn' ? 'Un-withdraw' : 'Mark withdrawn'}
                  </button>
                  <button
                    className="dir-tool-btn dir-btn-danger"
                    onClick={() => { if (window.confirm(`Remove ${r.studentName}'s response?`)) void onRemoveResponse(r.id); }}
                  >
                    <Trash2 size={15} /> Remove
                  </button>
                </div>
              </div>
            )}
          </article>
        );
      })}

      {/* Who hasn't answered — the chase-up list. */}
      {waiting.length > 0 && (
        <>
          <div className="dir-signup-section">
            Still waiting ({waiting.length})
            <button className="dir-signup-section-btn" onClick={() => void copy('waiting', waiting.map(s => s.name).join('\n'))}>
              <Copy size={13} /> {copied === 'waiting' ? 'Copied' : 'Copy names'}
            </button>
          </div>
          <div className="dir-signup-waiting">
            {waiting.map(s => (
              <span key={s.id} className="dir-signup-waiting-chip">
                {s.name}{s.grade ? ` · ${s.grade}` : ''}
              </span>
            ))}
          </div>
        </>
      )}

      <div className="dir-signup-danger">
        {confirmDelete ? (
          <>
            <span>Delete this sign-up? Responses stay in the database but you won’t see them here.</span>
            <button className="dir-btn dir-btn-danger" onClick={() => void onDelete()}>Delete</button>
            <button className="dir-btn dir-btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </>
        ) : (
          <button className="dir-btn dir-btn-ghost" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={15} /> Delete sign-up
          </button>
        )}
      </div>

      {/* Off-screen print packet: one signed form per page. */}
      <div className="dir-signup-print-host" aria-hidden="true">
        <div ref={printRef} className="signup-packet">
          {active.map(r => {
            const answers = parseAnswers(r);
            return (
              <section key={r.id} className="signup-sheet">
                <header className="signup-sheet-head">
                  <div className="signup-sheet-org">{ORG.orgFullName}</div>
                  <h1>{form.title}</h1>
                </header>
                <dl className="signup-sheet-fields">
                  <dt>Student</dt><dd>{r.studentName}</dd>
                  <dt>Grade</dt><dd>{r.grade}</dd>
                  {r.instrument && <><dt>Instrument</dt><dd>{r.instrument}</dd></>}
                  {r.email && <><dt>Email</dt><dd>{r.email}</dd></>}
                  {r.phone && <><dt>Phone</dt><dd>{r.phone}</dd></>}
                  {questions.map(q => (
                    <Fragment key={q.id}>
                      <dt>{q.label}</dt><dd>{answers[q.id] || '—'}</dd>
                    </Fragment>
                  ))}
                </dl>
                {form.signatureStatement && (
                  <div className="signup-sheet-sign">
                    <div className="signup-sheet-statement"><NotesText text={form.signatureStatement} /></div>
                    <div className="signup-sheet-line">
                      <span className="signup-sheet-sig">{r.signature ?? '—'}</span>
                      <span className="signup-sheet-cap">Student signature (typed) · {new Date(r.submittedAt).toLocaleString()}</span>
                    </div>
                  </div>
                )}
                {form.guardianStatement && (
                  <div className="signup-sheet-sign">
                    <div className="signup-sheet-statement"><NotesText text={form.guardianStatement} /></div>
                    <div className="signup-sheet-line">
                      <span className="signup-sheet-sig">{r.guardianSignature ?? '—'}</span>
                      <span className="signup-sheet-cap">
                        Parent/guardian signature (typed){r.guardianName ? ` · ${r.guardianName}` : ''}
                        {r.guardianEmail ? ` · ${r.guardianEmail}` : ''}
                      </span>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Interview slot schedule (director detail) ─────────────────────────

function SignupSlotSchedule({ question, bookings, freeingId, onFree }: {
  question: SignupQuestion;
  bookings: SignupSlotBooking[];
  freeingId: string | null;
  onFree: (b: SignupSlotBooking) => void;
}) {
  const byIndex = useMemo(() => {
    const map = new Map<number, SignupSlotBooking>();
    for (const b of bookings) map.set(b.slotIndex, b);
    return map;
  }, [bookings]);
  const slots = question.options ?? [];
  const booked = new Set(bookings.map(b => b.slotIndex)).size;
  const open = Math.max(0, slots.length - booked);

  return (
    <div className="dir-signup-slots">
      <div className="dir-signup-slots-head">
        <span className="dir-signup-slots-title">{question.label}</span>
        <span className="dir-signup-slots-count">
          {booked} booked · {open} open
        </span>
      </div>
      {slots.length === 0 ? (
        <div className="dir-empty-inline">No times listed — edit the sign-up to add slots.</div>
      ) : (
        <div className="dir-signup-slots-grid">
          {slots.map((label, i) => {
            const booking = byIndex.get(i);
            return (
              <div key={label} className={`dir-signup-slot-row ${booking ? 'booked' : 'open'}`}>
                <span className="dir-signup-slot-time">{label}</span>
                <span className="dir-signup-slot-who">
                  {booking ? (
                    <strong>{booking.studentName}</strong>
                  ) : (
                    <span className="dir-signup-slot-open">Open</span>
                  )}
                </span>
                {booking && (
                  <button
                    type="button"
                    className="dir-tool-btn dir-signup-slot-free"
                    disabled={freeingId === booking.id}
                    onClick={() => void onFree(booking)}
                  >
                    {freeingId === booking.id ? 'Freeing…' : 'Free slot'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Editor ────────────────────────────────────────────────────────────

function SignupEditor({ initial, isNew, formId, ensembles, students, onSave, onClose }: {
  initial: Draft;
  isNew: boolean;
  formId?: string;
  ensembles: Ensemble[];
  students: Student[];
  onSave: (draft: Draft) => Promise<void>;
  onClose: () => void;
}) {
  const panelRef = useModalA11y<HTMLDivElement>(onClose, true, { closeOnBack: true });
  const [draft, setDraft] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [studentQuery, setStudentQuery] = useState('');
  // Stable Storage folder so a file can attach before the form doc exists.
  const [uploadId] = useState(() => formId ?? `new-${Date.now()}`);
  // A booking points at a slot's POSITION, so a booked question can't be reordered.
  const { bookings: slotBookings } = useSignupSlotBookings(formId ?? '');
  const inviteMode = draft.audienceMode === 'students';
  const inviteIds = draft.inviteStudentIds ?? [];
  const ensembleOptions = useMemo(
    () => musicEnsembles(ensembles).map(e => ({ value: e.id, label: e.name, color: ensembleColor(e) })),
    [ensembles],
  );
  const familyOptions = useMemo(
    () => INSTRUMENT_FAMILIES.map(f => ({ value: f.id, label: f.label })),
    [],
  );

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft(d => ({ ...d, [key]: value }));
  }
  function setAudienceMode(mode: 'groups' | 'students') {
    setDraft(d => ({
      ...d,
      audienceMode: mode === 'students' ? 'students' : undefined,
      inviteStudentIds: mode === 'students' ? (d.inviteStudentIds ?? []) : [],
    }));
  }
  function toggleInviteStudent(id: string) {
    set('inviteStudentIds', inviteIds.includes(id)
      ? inviteIds.filter(x => x !== id)
      : [...inviteIds, id]);
  }
  const studentMatches = studentQuery.trim()
    ? students.filter(s => s.status === 'Active' && studentMatchesQuery(s, studentQuery)).slice(0, 8)
    : [];
  function setQuestion(i: number, patch: Partial<SignupQuestion>) {
    set('questions', draft.questions.map((q, n) => (n === i ? { ...q, ...patch } : q)));
  }
  function setQuestionReference(i: number, next: SignupQuestion['reference'] | undefined) {
    const prev = draft.questions[i]?.reference;
    if (prev?.url && prev.url !== next?.url) void deleteStoredFile(prev.url);
    setQuestion(i, { reference: next });
  }
  function removeQuestion(i: number) {
    const gone = draft.questions[i];
    if (gone?.reference?.url) void deleteStoredFile(gone.reference.url);
    set('questions', draft.questions.filter((_, n) => n !== i));
  }
  function addQuestion() {
    set('questions', [...draft.questions, { id: newQuestionId(draft.questions), label: '', type: 'short' }]);
  }
  function moveQuestion(i: number, delta: number) {
    const next = [...draft.questions];
    const j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set('questions', next);
  }

  async function handleSave() {
    if (!draft.title.trim()) return;
    if (inviteMode && inviteIds.length === 0) {
      setSaveError('Pick at least one student, or switch back to ensembles.');
      return;
    }
    // A question with slots/options but no label would be filtered away below.
    // Stop instead: silently deleting a built-out time slot grid is data loss.
    const unnamed = draft.questions.findIndex(q => !q.label.trim() && signupQuestionHasContent(q));
    if (unnamed >= 0) {
      setSaveError(`Question ${unnamed + 1} has answers or time slots but no question text — name it so it isn't dropped.`);
      return;
    }
    setSaving(true); setSaveError('');
    try {
      await whenQueued(onSave({
        ...draft,
        title: draft.title.trim(),
        intro: draft.intro?.trim() || undefined,
        audienceMode: inviteMode ? 'students' : undefined,
        ensembleIds: inviteMode ? [] : draft.ensembleIds,
        families: inviteMode ? [] : draft.families,
        inviteStudentIds: inviteMode ? inviteIds : [],
        // A guardian can only co-sign something the student signed first.
        guardianStatement: draft.signatureStatement?.trim() ? draft.guardianStatement?.trim() || undefined : undefined,
        signatureStatement: draft.signatureStatement?.trim() || undefined,
        formUrl: draft.formUrl?.trim() || undefined,
        questions: draft.questions
          .filter(q => q.label.trim() || signupQuestionHasContent(q))
          .map(q => {
            if (q.type === 'timeslot') return normalizeTimeslotQuestion({ ...q, label: q.label.trim() });
            return {
              ...q,
              label: q.label.trim(),
              options: q.type === 'choice'
                ? (q.options ?? []).map(o => o.trim()).filter(Boolean)
                : undefined,
              help: q.help?.trim() || undefined,
              reference: q.reference,
              optionGrades: undefined,
              slotDefs: undefined,
            };
          }),
      }));
      onClose();
    } catch (err) {
      setSaving(false);
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer" role="dialog" aria-modal="true" aria-label={isNew ? 'New sign-up' : 'Edit sign-up'} tabIndex={-1} ref={panelRef}>
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">{isNew ? 'New sign-up' : 'Edit sign-up'}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-field">
            <label className="dir-label">Title *</label>
            <input className="dir-input" value={draft.title} autoFocus
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. All-State auditions — who's in?" />
          </div>

          <div className="dir-field">
            <label className="dir-label">What students should know</label>
            <RichTextArea value={draft.intro ?? ''} rows={4}
              onChange={v => set('intro', v)}
              placeholder="Dates, what auditioning involves, what happens next…" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Who is this for?</label>
            <div className="dir-checkbox-group" style={{ marginBottom: 10 }}>
              <label className={`dir-checkbox-tag ${!inviteMode ? 'checked' : ''}`}>
                <input type="radio" name="audience-mode" checked={!inviteMode}
                  onChange={() => setAudienceMode('groups')} />
                Ensembles / instruments
              </label>
              <label className={`dir-checkbox-tag ${inviteMode ? 'checked' : ''}`}>
                <input type="radio" name="audience-mode" checked={inviteMode}
                  onChange={() => setAudienceMode('students')} />
                Specific students
              </label>
            </div>

            {inviteMode ? (
              <>
                <div className="dir-signup-help" style={{ marginBottom: 8 }}>
                  Only the students you add can submit. Share the link directly — this
                  won’t show on the Hub home page. The invite list stays staff-only.
                </div>
                {inviteIds.length > 0 && (
                  <div className="dir-checkbox-group" style={{ marginBottom: 8 }}>
                    {inviteIds.map(id => {
                      const s = students.find(x => x.id === id);
                      return (
                        <label key={id} className="dir-checkbox-tag checked" onClick={() => toggleInviteStudent(id)}>
                          {s?.name ?? id} ✕
                        </label>
                      );
                    })}
                  </div>
                )}
                <input className="dir-input" value={studentQuery}
                  onChange={e => setStudentQuery(e.target.value)}
                  placeholder="Search a student to add…" />
                {studentMatches.length > 0 && (
                  <div className="dir-add-sub-list" style={{ marginTop: 6 }}>
                    {studentMatches.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        className="dir-ens-row dir-sc-pick"
                        onClick={() => { toggleInviteStudent(s.id); setStudentQuery(''); }}
                      >
                        <div className="dir-ens-info">
                          <div className="dir-ens-name">{s.name}</div>
                          <div className="dir-ens-sub">{s.instrument}</div>
                        </div>
                        {inviteIds.includes(s.id) ? <span className="dir-sub-badge">Added</span> : <Plus size={16} />}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="dir-signup-audience-fm">
                  <FilterMenu
                    prefix="dir"
                    allLabel="Whole program"
                    options={ensembleOptions}
                    selected={draft.ensembleIds}
                    onChange={ids => set('ensembleIds', ids)}
                    ariaLabel="Ensembles this sign-up is for"
                  />
                </div>
                <div className="dir-signup-help">Whole program = everyone. Pick several ensembles to narrow.</div>
              </>
            )}
          </div>

          {!inviteMode && (
          <div className="dir-field">
            <label className="dir-label">Narrow to instruments</label>
            <div className="dir-signup-audience-fm">
              <FilterMenu
                prefix="dir"
                allLabel="All instruments"
                options={familyOptions}
                selected={draft.families}
                onChange={ids => set('families', ids as InstrumentFamilyId[])}
                ariaLabel="Instrument families"
              />
            </div>
            <div className="dir-signup-help">
              All instruments = every instrument. Pick Strings to reach only the string
              players in the ensembles above — harp counts as a string. Students whose
              roster instrument is blank or unrecognized aren’t matched, so fix those on
              the Roster first.
            </div>
          </div>
          )}

          <div className="dir-field">
            <label className="dir-label">Answers needed by</label>
            <input className="dir-input" type="date" value={draft.deadline ?? ''}
              onChange={e => set('deadline', e.target.value || undefined)} />
            <div className="dir-signup-help">
              The sign-up stops taking answers after this day. You can always give it one more day.
            </div>
          </div>

          <div className="dir-field">
            <label className="dir-label">Also collect</label>
            <div className="dir-checkbox-group">
              <label className={`dir-checkbox-tag ${draft.collectEmail ? 'checked' : ''}`}>
                <input type="checkbox" checked={!!draft.collectEmail} onChange={e => set('collectEmail', e.target.checked || undefined)} />
                Student email
              </label>
              <label className={`dir-checkbox-tag ${draft.collectPhone ? 'checked' : ''}`}>
                <input type="checkbox" checked={!!draft.collectPhone} onChange={e => set('collectPhone', e.target.checked || undefined)} />
                Phone
              </label>
            </div>
            <div className="dir-signup-help">Name and grade are always collected.</div>
          </div>

          <div className="dir-signup-section">Questions</div>
          {draft.questions.map((q, i) => (
            <div key={q.id} className="dir-signup-qedit">
              <div className="dir-signup-qedit-row">
                <input className="dir-input" value={q.label} placeholder="Question"
                  onChange={e => setQuestion(i, { label: e.target.value })} />
                <button className="dir-tool-btn" onClick={() => moveQuestion(i, -1)} aria-label="Move up" disabled={i === 0}>↑</button>
                <button className="dir-tool-btn" onClick={() => moveQuestion(i, 1)} aria-label="Move down" disabled={i === draft.questions.length - 1}>↓</button>
                <button className="dir-tool-btn dir-btn-danger" aria-label="Remove question"
                  onClick={() => removeQuestion(i)}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="dir-signup-qedit-row">
                <select className="dir-select" value={q.type}
                  onChange={e => setQuestion(i, { type: e.target.value as SignupQuestion['type'] })}>
                  <option value="short">Short answer</option>
                  <option value="long">Long answer</option>
                  <option value="choice">Pick one</option>
                  <option value="timeslot">Time slot</option>
                  <option value="yesno">Yes / No</option>
                </select>
                <label className={`dir-checkbox-tag ${q.required ? 'required' : 'optional'}`}>
                  <input type="checkbox" checked={!!q.required} onChange={e => setQuestion(i, { required: e.target.checked || undefined })} />
                  {q.required ? 'Required' : 'Optional'}
                </label>
              </div>
              <input className="dir-input" value={q.help ?? ''}
                placeholder="Hint under the question (optional)"
                onChange={e => setQuestion(i, { help: e.target.value || undefined })} />
              <FileUpload
                folder={`documents/signups/${uploadId}`}
                attachments={q.reference ? [q.reference] : []}
                onChange={atts => setQuestionReference(i, atts[0])}
                single
                accept="image/*,application/pdf"
                label="Attach picture or PDF"
              />
              {q.type === 'choice' && (
                <input className="dir-input" value={(q.options ?? []).join(', ')}
                  placeholder="Choices, separated by commas"
                  onChange={e => setQuestion(i, { options: e.target.value.split(',').map(o => o.trim()).filter(Boolean) })} />
              )}
              {q.type === 'timeslot' && (
                <SignupSlotBuilder
                  slotDefs={q.slotDefs ?? []}
                  manualDraft={q.slotManualDraft ?? (q.slotDefs?.length ? '' : (q.options ?? []).join('\n'))}
                  optionGrades={q.optionGrades}
                  locked={slotBookings.some(b => b.questionId === q.id)}
                  onChange={patch => setQuestion(i, patch)}
                />
              )}
            </div>
          ))}
          <button className="dir-btn dir-btn-ghost" onClick={addQuestion}>
            <Plus size={15} /> Add a question
          </button>

          <div className="dir-signup-section">Signature</div>
          <div className="dir-field">
            <label className="dir-label">What the student is agreeing to</label>
            <RichTextArea value={draft.signatureStatement ?? ''} rows={4}
              onChange={v => set('signatureStatement', v)}
              placeholder="Leave empty to just collect names and answers — no signature." />
            <div className="dir-signup-help">
              Filled in = the student types their full name to sign, and the Hub records
              the date and time with it.
            </div>
          </div>
          {draft.signatureStatement?.trim() && (
            <div className="dir-field">
              <label className="dir-label">What a parent/guardian is agreeing to</label>
              <RichTextArea value={draft.guardianStatement ?? ''} rows={3}
                onChange={v => set('guardianStatement', v)}
                placeholder="Leave empty if no parent signature is needed." />
            </div>
          )}

          <div className="dir-signup-section">Extras</div>
          <div className="dir-field">
            <label className="dir-label">Link to the official form (optional)</label>
            <input className="dir-input" value={draft.formUrl ?? ''}
              onChange={e => set('formUrl', e.target.value)}
              placeholder="https://… (Drive, district site, FMEA)" />
            <div className="dir-signup-help">
              Shown on the sign-up page so students can read the real paperwork
              before they sign here.
            </div>
          </div>

          <SchedulePublishField
            publishAt={draft.publishAt}
            onChange={v => set('publishAt', v)}
            label="Open later"
          />

          {saveError && <div className="dir-signup-error">⚠ {saveError}</div>}

        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="dir-btn dir-btn-primary" disabled={!draft.title.trim() || saving} onClick={handleSave}>
            {saving ? 'Saving…' : isNew ? 'Create sign-up' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────

function audienceOf(f: SignupForm | Draft, audiences: Record<string, string[]> = {}) {
  const mode = f.audienceMode ?? 'groups';
  return {
    mode,
    ensembleIds: f.ensembleIds ?? [],
    families: f.families ?? [],
    studentIds: mode === 'students' && 'id' in f
      ? (audiences[f.id] ?? (f as Draft).inviteStudentIds ?? [])
      : mode === 'students'
        ? ((f as Draft).inviteStudentIds ?? [])
        : undefined,
  };
}

function toDraft(f: SignupForm, audiences: Record<string, string[]>): Draft {
  const { id, ...rest } = f;
  return {
    ...rest,
    inviteStudentIds: f.audienceMode === 'students' ? (audiences[id] ?? []) : [],
  };
}

function blankDraft(today: string): Draft {
  return {
    title: '',
    ensembleIds: [],
    families: [],
    deadline: addDays(today, 7),
    questions: [],
    collectEmail: true,
    createdAt: Date.now(),
  };
}

/** Stable per-question id. Answers key off it, so it must never be reused
 *  for a different question inside the same form. */
function newQuestionId(existing: SignupQuestion[]): string {
  let n = existing.length + 1;
  const taken = new Set(existing.map(q => q.id));
  while (taken.has(`q${n}`)) n++;
  return `q${n}`;
}
