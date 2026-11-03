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
import { fmtLongDateInline } from '../shared/dates';
import { ORG } from '../org';
import { t, useLang } from '../shared/i18n';
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

// Translation keys, not strings: t() reads the language at render time.
const CATEGORY_INFO: { value: AbsenceCategory; label: string; desc: string; Icon: typeof DoorOpen }[] = [
  { value: 'leaving-early', label: 'abs.cat.early', desc: 'abs.cat.earlyDesc', Icon: DoorOpen },
  { value: 'full-day-absence', label: 'abs.cat.fullDay', desc: 'abs.cat.fullDayDesc', Icon: CalendarOff },
  { value: 'parent-signout', label: 'abs.cat.signout', desc: 'abs.cat.signoutDesc', Icon: UserCheck },
];

/** Shortest reason a Full-Day Absence will accept. Shown under the box too. */
const REASON_MIN_CHARS = 10;

export function PublicAbsence() {
  useLang(); // re-render when the EN|ES toggle flips
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
    : category === 'full-day-absence' ? reason.trim().length >= REASON_MIN_CHARS
    : category === 'parent-signout'
      ? reason.trim().length > 0 && parentName.trim().length >= 2 && parentContact.trim().length > 0 && !!signOutTime
      : false;
  const valid = !!student && acknowledged && emailOk && ensembleIds.length > 0
    && !!date && timeOk && !!category && categoryOk;

  function whyNotYet(): string {
    if (!student) return t('abs.why.name');
    if (!acknowledged) return t('abs.why.ack');
    if (!emailOk) return t('abs.why.email');
    if (ensembleIds.length === 0) return t('abs.why.ensemble');
    if (!date) return t('abs.why.date');
    if (timeWindow === 'specific' && !timeOk) return t('abs.why.times');
    if (!category) return t('abs.why.category');
    if (category === 'leaving-early' && !photo) return t('abs.why.photo');
    if (category === 'full-day-absence' && reason.trim().length < REASON_MIN_CHARS) return t('abs.why.reasonMin', { min: REASON_MIN_CHARS });
    if (category === 'parent-signout') {
      if (!reason.trim()) return t('abs.why.signoutReason');
      if (parentName.trim().length < 2) return t('abs.why.parentName');
      if (!parentContact.trim()) return t('abs.why.parentContact');
      if (!signOutTime) return t('abs.why.signoutTime');
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
      setError(t('abs.err.send', { email: ORG.contactEmail }));
    }
  }

  if (studentsLoading) {
    return <div className="pub-page"><div className="pub-signup-loading">{t('misc.loading')}</div></div>;
  }

  if (!PUBLIC_STUDENT_INFO) {
    return (
      <div className="pub-page">
        <BackLink fallback="/" label={t('nav.home')} />
        <div className="pub-card pub-muted">
          {t('abs.unpublished', { email: ORG.contactEmail })}
        </div>
      </div>
    );
  }

  if (state === 'done') {
    return (
      <div className="pub-page">
        <div className="pub-signup-done">
          <div className="pub-signup-done-mark"><Check size={30} /></div>
          <h1>{t('abs.done.title')}</h1>
          <p><strong>{student?.name}</strong> — {t('abs.done.reportedFor')} <strong>{fmtLongDateInline(date)}</strong>.</p>
          <p className="pub-muted">
            {email.trim()
              ? t('abs.done.willEmail', { email: email.trim() })
              : t('abs.done.willAnswer')}
          </p>
          <Link className="pub-signup-send" to="/">{t('abs.done.back')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pub-page">
      <BackLink fallback="/" label={t('nav.home')} />

      <header className="pub-signup-head">
        <div className="pub-signup-kicker"><CalendarX size={14} /> {t('abs.kicker')}</div>
        <h1>{t('nav.absence')}</h1>
      </header>

      <div className="pub-card" style={{ borderLeft: '3px solid var(--pub-accent, #0d7e8e)' }}>
        <p style={{ margin: '0 0 10px', fontWeight: 600 }}>{t('abs.beforeYou')}</p>
        <p className="pub-muted" style={{ margin: '0 0 12px' }}>
          {t('abs.policy')}
        </p>
        <label className="pub-parent-toggle">
          <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />
          {t('abs.ack')}
        </label>
      </div>

      {/* ── 1 · who you are ─────────────────────────────── */}
      <div className="pub-signup-step">
        <div className="pub-signup-step-num">1</div>
        <div className="pub-signup-step-title">{t('abs.step.name')}</div>
      </div>
      <div className="pub-card">
        {student ? (
          <div className="pub-signup-me">
            <div>
              <div className="pub-signup-me-name">{student.name}</div>
              <div className="pub-muted">{[student.instrument, student.grade].filter(Boolean).join(' · ')}</div>
            </div>
            <button className="pub-signup-switch" onClick={() => { setPickedStudent(null); setQ(''); }}>
              {t('abs.notYou')}
            </button>
          </div>
        ) : (
          <>
            <div className="pub-search" style={{ marginBottom: 10 }}>
              <Search size={18} />
              <input
                className="pub-search-input"
                placeholder={t('abs.typeName')}
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
                <div className="pub-muted">{t('abs.noMatch', { email: ORG.contactEmail })}</div>
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
            <div className="pub-signup-step-title">{t('abs.step.details')}</div>
          </div>
          <div className="pub-card">
            <label className="pub-absence-label" htmlFor="ab-email">{t('abs.email')}</label>
            <input id="ab-email" className="pub-absence-input" type="email" inputMode="email"
              autoComplete="email" maxLength={254} value={email}
              onChange={e => setEmail(e.target.value)} placeholder={t('abs.emailPh')} />

            <label className="pub-absence-label">{t('abs.ensembles')}</label>
            <FilterMenu
              prefix="pub"
              allLabel={t('abs.chooseOne')}
              options={ensembleOptions}
              selected={ensembleIds}
              onChange={setEnsembleIds}
              ariaLabel={t('abs.ensemblesAria')}
            />

            <label className="pub-absence-label" htmlFor="ab-date">{t('abs.date')}</label>
            <input id="ab-date" className="pub-absence-input" type="date"
              value={date} onChange={e => setDate(e.target.value)} />

            <label className="pub-absence-label">{t('abs.timeMissing')}</label>
            <div className="pub-signup-yesno">
              <button type="button" className={`pub-signup-yesno-btn ${timeWindow === 'full' ? 'active' : ''}`}
                onClick={() => setTimeWindow('full')}>{t('abs.fullRehearsal')}</button>
              <button type="button" className={`pub-signup-yesno-btn ${timeWindow === 'specific' ? 'active' : ''}`}
                onClick={() => setTimeWindow('specific')}>{t('abs.specificTime')}</button>
            </div>
            {timeWindow === 'specific' && (
              <div className="pub-absence-times">
                <div>
                  <label className="pub-absence-label" htmlFor="ab-start">{t('abs.startTime')}</label>
                  <input id="ab-start" className="pub-absence-input" type="time"
                    value={startTime} onChange={e => setStartTime(e.target.value)} />
                </div>
                <div>
                  <label className="pub-absence-label" htmlFor="ab-end">{t('abs.endTime')}</label>
                  <input id="ab-end" className="pub-absence-input" type="time"
                    value={endTime} onChange={e => setEndTime(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          {/* ── 3 · what's happening ─────────────────────── */}
          <div className="pub-signup-step">
            <div className="pub-signup-step-num">3</div>
            <div className="pub-signup-step-title">{t('abs.step.what')}</div>
          </div>
          <div className="pub-card">
            <div className="pub-absence-categories" role="radiogroup" aria-label={t('abs.categoryAria')}>
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
                    <span className="pub-absence-cat-label">{t(c.label)}</span>
                    <span className="pub-absence-cat-desc">{t(c.desc)}</span>
                  </span>
                </button>
              ))}
            </div>

            {category === 'leaving-early' && (
              <div className="pub-absence-branch">
                <label className="pub-absence-label">{t('abs.photoLabel')}</label>
                <p className="pub-signup-note">{t('abs.photoNote')}</p>
                <ExcusePhotoUpload photo={photo} onCapture={setPhoto} onClear={() => setPhoto(null)} disabled={state === 'saving'} />
              </div>
            )}

            {category === 'full-day-absence' && (
              <div className="pub-absence-branch">
                <label className="pub-absence-label" htmlFor="ab-reason-b">{t('abs.reason')}</label>
                <textarea id="ab-reason-b" className="pub-absence-input pub-signup-textarea" rows={3}
                  maxLength={300} value={reason} onChange={e => setReason(e.target.value)}
                  placeholder={t('abs.reasonPh')} />
                <p className="pub-signup-note">
                  {t('abs.reasonNote', { min: REASON_MIN_CHARS })}
                </p>
              </div>
            )}

            {category === 'parent-signout' && (
              <div className="pub-absence-branch">
                <label className="pub-absence-label" htmlFor="ab-reason-c">{t('abs.signoutReason')}</label>
                <textarea id="ab-reason-c" className="pub-absence-input pub-signup-textarea" rows={3}
                  maxLength={300} value={reason} onChange={e => setReason(e.target.value)} />
                <label className="pub-absence-label" htmlFor="ab-pname">{t('abs.parentName')}</label>
                <input id="ab-pname" className="pub-absence-input" maxLength={120}
                  autoComplete="name" value={parentName} onChange={e => setParentName(e.target.value)} />
                <label className="pub-absence-label" htmlFor="ab-pcontact">{t('abs.parentContact')}</label>
                <input id="ab-pcontact" className="pub-absence-input" maxLength={120}
                  value={parentContact} onChange={e => setParentContact(e.target.value)} placeholder={t('abs.phoneOrEmail')} />
                <label className="pub-absence-label" htmlFor="ab-signout">{t('abs.signoutTime')}</label>
                <input id="ab-signout" className="pub-absence-input" type="time"
                  value={signOutTime} onChange={e => setSignOutTime(e.target.value)} />
              </div>
            )}
          </div>

          <div className="pub-card">
            <label className="pub-absence-label" htmlFor="ab-notes">
              {t('abs.notes')} <span className="pub-signup-optional">{t('misc.optional')}</span>
            </label>
            <textarea id="ab-notes" className="pub-absence-input pub-signup-textarea" rows={2}
              maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          {error && <div className="pub-absence-error">⚠ {error}</div>}

          <button className="pub-signup-send" disabled={!valid || state === 'saving'} onClick={submit}>
            {state === 'saving' ? t('vid.sending') : t('abs.send')}
          </button>
          {!valid && <div className="pub-signup-note pub-signup-why">{whyNotYet()}</div>}
          <p className="pub-signup-privacy">
            {t('abs.privacy', { org: ORG.orgShortName })}
          </p>
        </>
      )}
    </div>
  );
}
