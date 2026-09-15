import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Search, Check, CalendarX, DoorOpen, CalendarOff, UserCheck } from 'lucide-react';
import { collection, doc, setDoc } from 'firebase/firestore';
import { ref as storageRef, uploadString } from 'firebase/storage';
import { db } from '../director/firebase';
import { storage } from '../director/firebaseAuth';
import { useStudentsPublic } from './hooks/usePublicRoster';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { sortStudents } from '../director/scoreOrder';
import { musicEnsembles, todayStr, ensembleColor } from '../director/utils';
import { FilterMenu } from '../shared/FilterMenu';
import { ExcusePhotoUpload } from './components/ExcusePhotoUpload';
import { BackLink } from './components/BackLink';
import { primaryStudent } from '../shared/identity';
import { fmtLongDate } from '../shared/dates';
import { ORG } from '../org';
import { PUBLIC_STUDENT_INFO } from './publicStudentInfo';
import type { AbsenceCategory, Student } from '../director/types';
import './signup.css';
import './components/plannedAbsence.css';
import './checkin.css';
import './absence.css';

/**
 * Rehearsal Absence & Early Dismissal Report (#absence-report). A public,
 * unauthenticated create into `plannedAbsences` — the same collection the
 * PlannedAbsenceButton modal on /student/:id already writes, widened with a
 * category picker, an ensemble multi-select, a time window, and (for
 * "Leaving Early") a mandatory office-note photo. This page is the bare,
 * QR-friendly URL that modal never had: nobody has to find their schedule
 * page first.
 *
 * Structure mirrors PublicSignup.tsx: one `valid` boolean built from
 * short-circuit ANDs, progressively-revealed numbered sections, and a
 * `whyNotYet()` sentence instead of a dead disabled button. The name search
 * is PublicCheckin.tsx's WhoStep, simplified — plannedAbsences.create hard-
 * requires a real students/{id} anchor, so there is no "not on the roster"
 * second door to design for here.
 */

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const CATEGORY_INFO: { value: AbsenceCategory; label: string; desc: string; Icon: typeof DoorOpen }[] = [
  {
    value: 'leaving-early',
    label: 'Leaving Early (Office Note)',
    desc: 'Leaving before rehearsal ends — a photo of your excuse slip is required.',
    Icon: DoorOpen,
  },
  {
    value: 'full-day-absence',
    label: 'Full-Day School Absence',
    desc: "You weren't in school at all today.",
    Icon: CalendarOff,
  },
  {
    value: 'parent-signout',
    label: 'Parent Sign-Out',
    desc: 'A parent or guardian is checking you out during the school day.',
    Icon: UserCheck,
  },
];

export function PublicAbsence() {
  const { students, loading: studentsLoading } = useStudentsPublic();
  const { ensembles } = useEnsembles();

  // Who: prefill from this device's remembered identity, same shape as
  // PublicCheckin — undefined = hasn't chosen or rejected, null = "not you?".
  const remembered = primaryStudent();
  const prefillStudent = remembered
    ? students.find(s => s.id === remembered.id && s.status === 'Active') ?? null
    : null;
  const [pickedStudent, setPickedStudent] = useState<Student | null | undefined>(undefined);
  const student = pickedStudent !== undefined ? pickedStudent : prefillStudent;
  const [q, setQ] = useState('');

  const [email, setEmail] = useState('');
  const [ensembleIds, setEnsembleIds] = useState<string[]>([]);
  const [date, setDate] = useState(todayStr());
  const [timeWindow, setTimeWindow] = useState<'full' | 'specific'>('full');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [category, setCategory] = useState<AbsenceCategory | ''>('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentContact, setParentContact] = useState('');
  const [signOutTime, setSignOutTime] = useState('');
  const [notes, setNotes] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  const folded = fold(q.trim());
  const matches = useMemo(() => {
    const active = students.filter(s => s.status === 'Active');
    if (!folded) return [];
    return sortStudents(
      active.filter(s => fold(s.name).includes(folded) || fold(s.preferredName ?? '').includes(folded)),
      'lastName',
    ).slice(0, 12);
  }, [students, folded]);

  const ensembleOptions = useMemo(
    () => musicEnsembles([...ensembles].sort((a, b) => a.order - b.order))
      .map(e => ({ value: e.id, label: e.name, color: ensembleColor(e) })),
    [ensembles],
  );

  const emailOk = /.+@.+\..+/.test(email.trim());
  const timeOk = timeWindow === 'full' || (!!startTime && !!endTime && startTime < endTime);
  const categoryOk = category === 'leaving-early' ? !!photo
    : category === 'full-day-absence' ? reason.trim().length >= 10
    : category === 'parent-signout'
      ? reason.trim().length > 0 && parentName.trim().length >= 2 && parentContact.trim().length > 0 && !!signOutTime
      : false;
  const valid = !!student && acknowledged && emailOk && ensembleIds.length > 0
    && !!date && timeOk && !!category && categoryOk;

  function whyNotYet(): string {
    if (!student) return 'Find your name to continue.';
    if (!acknowledged) return 'Check the box above to continue.';
    if (!emailOk) return 'Add your email to continue.';
    if (ensembleIds.length === 0) return 'Pick at least one ensemble or class.';
    if (!date) return 'Pick the date.';
    if (timeWindow === 'specific' && !timeOk) return 'Add a start and end time, with the end after the start.';
    if (!category) return "Choose what's happening.";
    if (category === 'leaving-early' && !photo) return 'Attach a photo of your office note to continue.';
    if (category === 'full-day-absence' && reason.trim().length < 10) return 'Add a few words about why you were out.';
    if (category === 'parent-signout') {
      if (!reason.trim()) return 'Add a reason for the sign-out.';
      if (parentName.trim().length < 2) return "Add the parent or guardian's name.";
      if (!parentContact.trim()) return "Add a parent or guardian's phone or email.";
      if (!signOutTime) return 'Add the time of sign-out.';
    }
    return '';
  }

  async function submit() {
    if (!db || !valid || !student || !category || state === 'saving') return;
    setState('saving'); setError('');
    try {
      const ref = doc(collection(db, 'plannedAbsences'));
      const photoPath = category === 'leaving-early' && photo ? `absenceExcusePhotos/${ref.id}/excuse.jpg` : undefined;
      await setDoc(ref, {
        studentId: student.id,
        studentName: student.name,
        date,
        // Category A has no free-text reason of its own (the photo IS the
        // evidence) — `reason` is one of the six ORIGINAL required fields
        // every plannedAbsences doc has always carried, so it gets a fixed,
        // readable value rather than becoming a seventh optional field.
        reason: (category === 'leaving-early'
          ? 'Leaving early (office note) — see attached photo'
          : reason.trim()
        ).slice(0, 300),
        submittedAt: Date.now(),
        status: 'pending',
        email: email.trim().slice(0, 254),
        ensembleIds,
        category,
        timeWindow,
        ...(timeWindow === 'specific' ? { startTime, endTime } : {}),
        ...(photoPath ? { photoPath } : {}),
        ...(category === 'parent-signout' ? {
          parentName: parentName.trim().slice(0, 120),
          parentContact: parentContact.trim().slice(0, 120),
          signOutTime,
        } : {}),
        acknowledged,
        ...(notes.trim() ? { notes: notes.trim().slice(0, 500) } : {}),
      });
      if (photoPath && photo && storage) {
        await uploadString(storageRef(storage, photoPath), photo, 'data_url');
      }
      setState('done');
    } catch {
      setState('error');
      setError(`Could not send right now — check your connection and try again, or email ${ORG.contactEmail}.`);
    }
  }

  if (studentsLoading) {
    return <div className="pub-page"><div className="pub-signup-loading">Loading…</div></div>;
  }

  if (!PUBLIC_STUDENT_INFO) {
    return (
      <div className="pub-page">
        <BackLink fallback="/" label="Home" />
        <div className="pub-card pub-muted">
          The roster isn't published yet, so this form isn't available. Email {ORG.contactEmail}.
        </div>
      </div>
    );
  }

  if (state === 'done') {
    return (
      <div className="pub-page">
        <div className="pub-signup-done">
          <div className="pub-signup-done-mark"><Check size={30} /></div>
          <h1>Sent to your director</h1>
          <p><strong>{student?.name}</strong> — reported for <strong>{fmtLongDate(date)}</strong>.</p>
          <p className="pub-muted">
            They'll see it before rehearsal. No reply needed{email.trim() ? ` — a copy went to ${email.trim()}` : ''}.
          </p>
          <Link className="pub-signup-send" to="/">Back to the Hub</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pub-page">
      <BackLink fallback="/" label="Home" />

      <header className="pub-signup-head">
        <div className="pub-signup-kicker"><CalendarX size={14} /> Rehearsal absence report</div>
        <h1>Report an Absence</h1>
      </header>

      <div className="pub-card" style={{ borderLeft: '3px solid var(--pub-accent, #0d7e8e)' }}>
        <p style={{ margin: '0 0 10px', fontWeight: 600 }}>Before you fill this out:</p>
        <p className="pub-muted" style={{ margin: '0 0 12px' }}>
          You're responsible for telling your director before missing any rehearsal — not a friend,
          not your section leader, and not after the fact. If the absence is unplanned, notify your
          director the moment you know, not the next day. This form is that notification, not a
          replacement for it: send it in addition to whatever you already said in person or by text.
        </p>
        <label className="pub-parent-toggle">
          <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />
          I understand I'm responsible for notifying my director before missing rehearsal, or
          immediately after if it was unplanned.
        </label>
      </div>

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
            <button className="pub-signup-switch" onClick={() => { setPickedStudent(null); setQ(''); }}>
              Not you?
            </button>
          </div>
        ) : (
          <>
            <div className="pub-search" style={{ marginBottom: 10 }}>
              <Search size={18} />
              <input
                className="pub-search-input"
                placeholder="Type your name…"
                value={q}
                onChange={e => setQ(e.target.value)}
              />
            </div>
            <div className="pub-signup-names">
              {matches.map(s => (
                <button key={s.id} className="pub-signup-name-row" onClick={() => setPickedStudent(s)}>
                  <span className="pub-roster-name">{s.name}</span>
                  <span className="pub-roster-instr">{[s.instrument, s.grade].filter(Boolean).join(' · ')}</span>
                </button>
              ))}
              {folded && matches.length === 0 && (
                <div className="pub-muted">No matching name. Email {ORG.contactEmail} if you can't find yourself.</div>
              )}
            </div>
          </>
        )}
      </div>

      {student && (
        <>
          {/* ── 2 · details ──────────────────────────────── */}
          <div className="pub-signup-step">
            <div className="pub-signup-step-num">2</div>
            <div className="pub-signup-step-title">Details</div>
          </div>
          <div className="pub-card">
            <label className="pub-absence-label" htmlFor="ab-email">Your email</label>
            <input id="ab-email" className="pub-absence-input" type="email" inputMode="email"
              autoComplete="email" maxLength={254} value={email}
              onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />

            <label className="pub-absence-label">Ensembles / classes affected</label>
            <FilterMenu
              prefix="pub"
              allLabel="Choose at least one…"
              options={ensembleOptions}
              selected={ensembleIds}
              onChange={setEnsembleIds}
              ariaLabel="Ensembles or classes affected"
            />

            <label className="pub-absence-label" htmlFor="ab-date">Date</label>
            <input id="ab-date" className="pub-absence-input" type="date"
              value={date} onChange={e => setDate(e.target.value)} />

            <label className="pub-absence-label">Time missing</label>
            <div className="pub-signup-yesno">
              <button type="button" className={`pub-signup-yesno-btn ${timeWindow === 'full' ? 'active' : ''}`}
                onClick={() => setTimeWindow('full')}>Full rehearsal</button>
              <button type="button" className={`pub-signup-yesno-btn ${timeWindow === 'specific' ? 'active' : ''}`}
                onClick={() => setTimeWindow('specific')}>Specific time range</button>
            </div>
            {timeWindow === 'specific' && (
              <div className="pub-absence-times">
                <div>
                  <label className="pub-absence-label" htmlFor="ab-start">Start time</label>
                  <input id="ab-start" className="pub-absence-input" type="time"
                    value={startTime} onChange={e => setStartTime(e.target.value)} />
                </div>
                <div>
                  <label className="pub-absence-label" htmlFor="ab-end">End time</label>
                  <input id="ab-end" className="pub-absence-input" type="time"
                    value={endTime} onChange={e => setEndTime(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          {/* ── 3 · what's happening ─────────────────────── */}
          <div className="pub-signup-step">
            <div className="pub-signup-step-num">3</div>
            <div className="pub-signup-step-title">What's happening</div>
          </div>
          <div className="pub-card">
            <div className="pub-absence-categories" role="radiogroup" aria-label="Absence category">
              {CATEGORY_INFO.map(c => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={category === c.value}
                  className={`pub-absence-cat ${category === c.value ? 'active' : ''}`}
                  onClick={() => setCategory(c.value)}
                >
                  <c.Icon size={18} aria-hidden />
                  <span>
                    <span className="pub-absence-cat-label">{c.label}</span>
                    <span className="pub-absence-cat-desc">{c.desc}</span>
                  </span>
                </button>
              ))}
            </div>

            {category === 'leaving-early' && (
              <div className="pub-absence-branch">
                <label className="pub-absence-label">Photo of your office excuse slip</label>
                <p className="pub-signup-note">Photograph the slip before you hand it back to the office.</p>
                <ExcusePhotoUpload photo={photo} onCapture={setPhoto} onClear={() => setPhoto(null)} disabled={state === 'saving'} />
              </div>
            )}

            {category === 'full-day-absence' && (
              <div className="pub-absence-branch">
                <label className="pub-absence-label" htmlFor="ab-reason-b">Reason</label>
                <textarea id="ab-reason-b" className="pub-absence-input pub-signup-textarea" rows={3}
                  maxLength={300} value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="e.g. Family emergency, out of state" />
              </div>
            )}

            {category === 'parent-signout' && (
              <div className="pub-absence-branch">
                <label className="pub-absence-label" htmlFor="ab-reason-c">Reason for sign-out</label>
                <textarea id="ab-reason-c" className="pub-absence-input pub-signup-textarea" rows={3}
                  maxLength={300} value={reason} onChange={e => setReason(e.target.value)} />
                <label className="pub-absence-label" htmlFor="ab-pname">Parent/guardian name</label>
                <input id="ab-pname" className="pub-absence-input" maxLength={120}
                  autoComplete="name" value={parentName} onChange={e => setParentName(e.target.value)} />
                <label className="pub-absence-label" htmlFor="ab-pcontact">Parent/guardian contact</label>
                <input id="ab-pcontact" className="pub-absence-input" maxLength={120}
                  value={parentContact} onChange={e => setParentContact(e.target.value)} placeholder="Phone or email" />
                <label className="pub-absence-label" htmlFor="ab-signout">Time of sign-out</label>
                <input id="ab-signout" className="pub-absence-input" type="time"
                  value={signOutTime} onChange={e => setSignOutTime(e.target.value)} />
              </div>
            )}
          </div>

          <div className="pub-card">
            <label className="pub-absence-label" htmlFor="ab-notes">
              Anything else your director should know? <span className="pub-signup-optional">(optional)</span>
            </label>
            <textarea id="ab-notes" className="pub-absence-input pub-signup-textarea" rows={2}
              maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          {error && <div className="pub-absence-error">⚠ {error}</div>}

          <button className="pub-signup-send" disabled={!valid || state === 'saving'} onClick={submit}>
            {state === 'saving' ? 'Sending…' : 'Send to my director'}
          </button>
          {!valid && <div className="pub-signup-note pub-signup-why">{whyNotYet()}</div>}
          <p className="pub-signup-privacy">
            What you send here goes only to {ORG.orgShortName} staff.
          </p>
        </>
      )}
    </div>
  );
}
