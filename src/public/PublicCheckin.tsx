import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router';
import {
  Search, Mail, Camera, Check, Clock, AlertTriangle, LogIn, LogOut, UserCircle,
  GraduationCap,
} from 'lucide-react';
import { useEvent } from '../director/hooks/useEvents';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useMinuteTick } from '../director/hooks/useAnnouncements';
import { useStudentsPublic } from './hooks/usePublicRoster';
import { useCheckinSettings } from './hooks/useCheckinSettings';
import { BackLink } from './components/BackLink';
import { SkeletonCards } from './components/PageHeader';
import { SelfieCapture } from './components/SelfieCapture';
import { submitCheckin } from './checkinSubmit';
import { getReceipt, receiptForEvent, saveReceipt } from './checkinReceipt';
import { formatTime, ensembleDisplayName } from '../director/utils';
import { sortStudents } from '../director/scoreOrder';
import { fmtFullDate } from '../shared/dates';
import { useLang } from '../shared/i18n';
import { primaryStudent, rememberStudent } from '../shared/identity';
import { ORG } from '../org';
import {
  checkinState, checkinWindow, canCheckOut, checkoutBlockedUntil,
  canCheckIn, checkinCutoff,
  domainsLabel, emailProblem, normalizeEmail, resolveCheckinSettings,
  guestStudentId, isGuestStudentId, guestDoorOpen, guestEmailProblem,
  guestNameProblem, normalizeGuestName,
  type CheckinKind, type CheckinSettings,
} from '../shared/concertCheckin';
import { PUBLIC_STUDENT_INFO } from './publicStudentInfo';
import type { Student } from '../director/types';
import './checkin.css';

/** Wall-clock time at the SCHOOL, not on the viewer's device. At the venue
 *  these agree; on a phone still set to another timezone they do not, and a
 *  check-in receipt that reads an hour off is a support call. */
function clockAt(epoch: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric', minute: '2-digit', timeZone: ORG.timezone,
  }).format(new Date(epoch));
}

/**
 * The concert door (#concert-checkin). A student arriving at a concert says
 * who they are, gives their school email, and takes a photo with the stage
 * behind them; at the end of the night the same three steps record that they
 * were still there.
 *
 * Everything this page decides, the Cloud Function decides again — the window,
 * the domain, the duplicate, the order. That is not redundancy for its own
 * sake: a student in a lobby with a line behind them should learn that
 * check-in does not open for another hour BEFORE they take a photograph, and
 * a record should be worth something regardless of what the page did.
 *
 * Deliberately not gated on remembering anyone. The device may already know
 * the student (the Find My Schedule identity), and then this is two taps; if
 * it does not, the name search is the same forgiving one the lookup page uses.
 */

type Step = 'who' | 'email' | 'photo' | 'sending' | 'done';

export function PublicCheckin() {
  useLang();
  const { id = '' } = useParams();
  const { event, loading } = useEvent(id);
  const { ensembles } = useEnsembles();
  const { students } = useStudentsPublic();
  const site = useCheckinSettings();
  const now = useMinuteTick();

  // Everything the student has actually touched is an OVERRIDE over what the
  // page can work out for itself. Derived-not-stored on purpose: the prefill
  // depends on the roster arriving and on a receipt this device may or may not
  // hold, and expressing that as effects meant three setState calls firing as
  // soon as the roster loaded, one render after another.
  const [pickedStudent, setPickedStudent] = useState<Student | null>(null);
  const [rejectedPrefill, setRejectedPrefill] = useState(false);
  const [kindOverride, setKindOverride] = useState<CheckinKind | null>(null);
  const [emailInput, setEmailInput] = useState<string | null>(null);
  const [stepOverride, setStepOverride] = useState<Step | null>(null);
  const [q, setQ] = useState('');
  // The college door: `guestMode` is the card being open, `guestName` is the
  // name once it has been filled in. Both null/false is the ordinary path.
  const [guestMode, setGuestMode] = useState(false);
  const [guestName, setGuestName] = useState<string | null>(null);
  // Lifted out of the card on purpose: "Fix this" on the photo step sends a
  // guest back here to correct a mistyped address, and the card is unmounted
  // in between. Left inside, it would clear the name they had already typed
  // — punishing them for fixing the very thing that matters.
  const [guestFirst, setGuestFirst] = useState('');
  const [guestLast, setGuestLast] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [doneAt, setDoneAt] = useState(0);
  // Which scan the confirmation screen is confirming. It cannot be the
  // derived `kind`: that reads the receipt, and send() has just WRITTEN the
  // receipt, so an arrival re-derives as 'out' one render later and the
  // student is told "You are checked out. That is everything. Thanks for
  // coming." on the way IN — then never comes back, and a concert needs both
  // scans to count. Pinned to what was actually sent.
  const [doneKind, setDoneKind] = useState<CheckinKind>('in');
  const [sending, setSending] = useState(false);

  // What this device already knows: a receipt from earlier tonight first (it
  // knows the email too), then the Find My Schedule identity.
  const prior = event ? receiptForEvent(event.id) : null;
  const remembered = primaryStudent();
  const prefillStudent = rejectedPrefill ? null : (
    prior ? students.find(s => s.id === prior.studentId)
      : remembered ? students.find(s => s.id === remembered.id)
      : undefined
  ) ?? null;

  const student = pickedStudent ?? prefillStudent;

  // A receipt written by the college door earlier tonight. It is the whole
  // reason a guest does not have to retype anything to check out: the email
  // IS their identity, and the receipt is where this device kept it.
  const priorGuest = rejectedPrefill || !prior || !isGuestStudentId(prior.studentId) ? null : prior;
  const guestWho = guestName !== null
    ? { name: guestName, email: normalizeEmail(emailInput ?? '') }
    : priorGuest ? { name: priorGuest.studentName, email: priorGuest.email }
    : null;

  // One identity, whichever door it came through. Everything below —
  // the receipt, the in/out decision, the record — reads these three.
  const whoId = student?.id ?? (guestWho ? guestStudentId(guestWho.email) : '');
  const whoName = student?.name ?? guestWho?.name ?? '';
  const priorForStudent = event && whoId ? getReceipt(event.id, whoId) : null;
  const kind: CheckinKind = kindOverride
    ?? (priorForStudent?.in && !priorForStudent.out ? 'out' : 'in');
  const email = guestWho ? guestWho.email : (emailInput ?? priorForStudent?.email ?? prior?.email ?? '');
  // Sending wins over every override: the page must not offer a second
  // press while a record is in flight.
  // A guest fills in name and email on ONE card, so the college path has no
  // separate email step — it goes straight to the photo.
  const step: Step = sending ? 'sending'
    : (stepOverride ?? (guestWho ? 'photo' : student ? 'email' : 'who'));

  const settings = useMemo(() => resolveCheckinSettings(event ?? {}, site), [event, site]);
  const state = event ? checkinState(event, settings, ORG.timezone, now) : 'off';

  if (loading && !event) return <div className="pub-page"><SkeletonCards n={2} /></div>;

  if (!event) {
    return (
      <div className="pub-page">
        <BackLink fallback="/calendar" label="Back" className="pub-back-link" />
        <div className="pub-card pub-muted">That concert is not on the calendar.</div>
      </div>
    );
  }

  const title = event.title
    || event.ensembleIds.map(eid => ensembleDisplayName(ensembles.find(e => e.id === eid))).filter(Boolean).join(' + ')
    || 'Concert';
  const win = checkinWindow(event, settings, ORG.timezone);
  const domains = settings.emailDomains;
  const hint = domainsLabel(domains);

  /* ── The station is not taking records ── */

  if (state !== 'open') {
    return (
      <div className="pub-page pub-checkin">
        <BackLink fallback={`/event/${event.id}`} label="Back to the concert" className="pub-back-link" />
        <ClosedCard state={state} title={title} event={event} win={win} />
      </div>
    );
  }

  const checkoutReady = kind === 'in' || canCheckOut(event, settings, ORG.timezone, now);
  const blockedUntil = checkoutBlockedUntil(event, settings, ORG.timezone);
  // The late-arrival cutoff. Only ever blocks the ARRIVAL: someone who came
  // late still checks out at the end, or their evening ends with one dangling
  // scan and no credit either way.
  const arrivalClosed = kind === 'in' && !canCheckIn(event, settings, ORG.timezone, now);
  const cutoffAt = checkinCutoff(event, settings, ORG.timezone);

  async function send() {
    if (!event || (!student && !guestWho)) return;
    setError('');
    setSending(true);
    const outcome = await submitCheckin({
      eventId: event.id,
      // Exactly one of these. A guest sends no student id at all — the
      // function derives it from the email, so this page cannot name it.
      ...(guestWho ? { guestName: guestWho.name } : { studentId: student!.id }),
      email: normalizeEmail(email),
      kind,
      ...(photo ? { photo } : {}),
    });
    if (!outcome.ok) {
      setSending(false);
      setError(outcome.message ?? 'That did not go through. Find a director.');
      // A refusal that the student can fix sends them back to the step that
      // fixes it, rather than to the top of the page.
      setStepOverride(outcome.failure === 'wrong-domain' || outcome.failure === 'bad-email' ? 'email'
        : outcome.failure === 'no-photo' || outcome.failure === 'bad-photo' ? 'photo'
        : 'photo');
      return;
    }
    const at = outcome.at ?? Date.now();
    saveReceipt(
      { eventId: event.id, studentId: whoId, studentName: whoName, email: normalizeEmail(email) },
      kind, at,
    );
    // The device now knows this student, so their schedule and alerts work
    // for the rest of the year without a second lookup. NOT for a guest:
    // there is no roster record to remember, and a made-up identity in Find
    // My Schedule would follow them around every other page in the Hub.
    if (student) {
      rememberStudent({
        id: student.id, name: student.name,
        ensembleIds: student.ensembleIds ?? [],
        ...(student.instrument ? { instrument: student.instrument } : {}),
      });
    }
    setSending(false);
    setDoneAt(at);
    setDoneKind(kind);
    setStepOverride('done');
  }

  if (step === 'done') {
    return (
      <div className="pub-page pub-checkin">
        <div className="pub-checkin-done">
          <div className="pub-checkin-tick"><Check size={40} aria-hidden /></div>
          <h1>{doneKind === 'in' ? 'You are checked in' : 'You are checked out'}</h1>
          <p className="pub-checkin-big">{clockAt(doneAt)}</p>
          <p className="pub-muted">{whoName} · {title}</p>
          {doneKind === 'in' ? (
            <p className="pub-checkin-next">
              <strong>Come back to this page when the concert ends</strong> and check out.
              You need both to get credit.
            </p>
          ) : (
            <p className="pub-checkin-next">That is everything. Thanks for coming.</p>
          )}
          <div className="pub-checkin-actions">
            {doneKind === 'in' && (
              <button type="button" className="pub-btn-ghost" onClick={() => {
                setKindOverride('out'); setPhoto(null); setStepOverride('photo'); setDoneAt(0);
              }}>
                <LogOut size={16} aria-hidden /> Check out now
              </button>
            )}
            {student && (
              <Link className="pub-btn-ghost" to={`/student/${student.id}`}>See my concert count</Link>
            )}
            <Link className="pub-btn-ghost" to={`/event/${event.id}`}>Back to the concert</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pub-page pub-checkin">
      <BackLink fallback={`/event/${event.id}`} label="Back to the concert" className="pub-back-link" />

      <header className="pub-checkin-head">
        <span className={`pub-checkin-kind ${kind}`}>
          {kind === 'in' ? <><LogIn size={14} aria-hidden /> Check in</> : <><LogOut size={14} aria-hidden /> Check out</>}
        </span>
        <h1>{title}</h1>
        <p className="pub-muted">{fmtFullDate(event.date)}{event.startTime ? ` · ${formatTime(event.startTime)}` : ''}</p>
        {event.concertAttendance && (
          <span className={`pub-attend-badge ${event.concertAttendance}`}>
            {event.concertAttendance === 'required' ? 'Required concert' : 'Optional concert'}
          </span>
        )}
      </header>

      <ol className="pub-checkin-steps">
        <li className={step === 'who' ? 'on' : whoName ? 'ok' : ''}>Your name</li>
        <li className={step === 'email' ? 'on' : guestWho || (email && !emailProblem(email, domains)) ? 'ok' : ''}>School email</li>
        <li className={step === 'photo' || step === 'sending' ? 'on' : photo ? 'ok' : ''}>Photo</li>
      </ol>

      {error && (
        <div className="pub-checkin-error" role="alert">
          <AlertTriangle size={18} aria-hidden /> {error}
        </div>
      )}

      {/* 1 — who. Two doors: the roster search, and (for students who are
          not entered in the Hub yet) typing your own name. The search is
          deliberately the default and the college door the second choice —
          a dual-enrolled student who IS on the roster should find their name
          rather than quietly creating a second identity for the evening. */}
      {step === 'who' && !guestMode && (
        <WhoStep
          students={students}
          q={q}
          setQ={setQ}
          collegeDoor={guestDoorOpen(settings)}
          onPick={s => { setPickedStudent(s); setStepOverride('email'); }}
          onCollege={() => { setGuestMode(true); setError(''); }}
        />
      )}

      {step === 'who' && guestMode && (
        <CollegeStep
          settings={settings}
          first={guestFirst}
          setFirst={setGuestFirst}
          last={guestLast}
          setLast={setGuestLast}
          email={emailInput ?? ''}
          setEmail={v => { setEmailInput(v); setError(''); }}
          onBack={() => { setGuestMode(false); setEmailInput(null); }}
          onDone={name => { setGuestName(name); setStepOverride('photo'); }}
        />
      )}

      {/* 2 — email */}
      {step === 'email' && student && (
        <section className="pub-card pub-checkin-card">
          <p className="pub-checkin-who">
            <UserCircle size={18} aria-hidden /> {student.name}
            <button
              type="button"
              className="pub-linkish"
              onClick={() => {
                setPickedStudent(null);
                setRejectedPrefill(true);
                setEmailInput('');
                setStepOverride('who');
              }}
            >
              Not you?
            </button>
          </p>
          <label className="pub-checkin-label" htmlFor="checkin-email">
            <Mail size={16} aria-hidden /> Your school email
          </label>
          <input
            id="checkin-email"
            className="pub-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={hint ? hint.split(',')[0].replace('@', 'you@') : 'you@school.edu'}
            value={email}
            onChange={e => { setEmailInput(e.target.value); setError(''); }}
          />
          {hint && <p className="pub-checkin-hint">It has to end in {hint}.</p>}
          <button
            type="button"
            className="pub-btn"
            disabled={Boolean(emailProblem(email, domains))}
            onClick={() => setStepOverride('photo')}
          >
            Next — take the photo
          </button>
          {email && emailProblem(email, domains) === 'domain' && (
            <p className="pub-checkin-hint warn">That is not a school address. Use {hint}.</p>
          )}
        </section>
      )}

      {/* 3 — photo */}
      {(step === 'photo' || step === 'sending') && (student || guestWho) && (
        <section className="pub-card pub-checkin-card">
          {/* The college path skips the separate email step, so this is where a
              guest sees their address read back to them. Worth the line: the
              email is their identity, and a typo does not fail — it quietly
              makes them a second person, whose check-out never finds this
              check-in and who gets credit for neither. */}
          {guestWho && (
            <p className="pub-checkin-who">
              <GraduationCap size={18} aria-hidden />
              <span>{guestWho.name} · {guestWho.email}</span>
              <button
                type="button"
                className="pub-linkish"
                onClick={() => {
                  setGuestName(null);
                  setRejectedPrefill(true);
                  setGuestMode(true);
                  // A guest restored from tonight's receipt never typed into
                  // these fields on this page load, so seed them from the name
                  // the receipt kept — otherwise "Fix this" hands a returning
                  // student an empty form.
                  if (!guestFirst && !guestLast) {
                    const cut = guestWho.name.indexOf(' ');
                    setGuestFirst(cut < 0 ? guestWho.name : guestWho.name.slice(0, cut));
                    setGuestLast(cut < 0 ? '' : guestWho.name.slice(cut + 1));
                  }
                  // Keep the address on screen rather than blanking it: the
                  // student is here to see what they got wrong.
                  setEmailInput(guestWho.email);
                  setPhoto(null);
                  setStepOverride('who');
                }}
              >
                Fix this
              </button>
            </p>
          )}
          <label className="pub-checkin-label">
            <Camera size={16} aria-hidden /> {kind === 'in' ? 'A photo with the stage behind you' : 'One more photo, with the stage behind you'}
          </label>
          <p className="pub-checkin-hint">
            This is how a director can tell you were really here. It is only ever
            seen by your directors.
          </p>
          {settings.photoOptional && (
            <p className="pub-checkin-hint">
              A director has made the photo optional tonight — you can send without one.
            </p>
          )}
          <SelfieCapture
            photo={photo}
            onCapture={p => { setPhoto(p); setError(''); }}
            onClear={() => setPhoto(null)}
            disabled={step === 'sending'}
          />
          {arrivalClosed && cutoffAt && (
            <p className="pub-checkin-hint warn">
              <Clock size={14} aria-hidden /> Check-in closed at {clockAt(cutoffAt)}.
              Find a director so they can record you.
            </p>
          )}
          {!checkoutReady && blockedUntil && (
            <p className="pub-checkin-hint warn">
              <Clock size={14} aria-hidden /> Check-out opens at {clockAt(blockedUntil)}.
            </p>
          )}
          <button
            type="button"
            className="pub-btn pub-checkin-send"
            disabled={step === 'sending' || (!photo && !settings.photoOptional) || !checkoutReady || arrivalClosed}
            onClick={send}
          >
            {step === 'sending'
              ? 'Sending…'
              : kind === 'in' ? 'Check me in' : 'Check me out'}
          </button>
        </section>
      )}

      <p className="pub-checkin-foot">
        Your photo is used only to confirm concert attendance and is visible only
        to your directors.
      </p>
    </div>
  );
}

/* ── Step 1: find yourself ── */

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function WhoStep({ students, q, setQ, onPick, collegeDoor, onCollege }: {
  students: Student[];
  q: string;
  setQ: (v: string) => void;
  onPick: (s: Student) => void;
  /** Whether this org has a college door at all. Off for every org that has
   *  named no college domains, which is the fail-closed default. */
  collegeDoor: boolean;
  onCollege: () => void;
}) {
  const folded = fold(q.trim());
  const matches = useMemo(() => {
    const active = students.filter(s => s.status === 'Active');
    if (!folded) return [];
    return sortStudents(
      active.filter(s => fold(s.name).includes(folded) || fold(s.preferredName ?? '').includes(folded)),
      'lastName',
    ).slice(0, 12);
  }, [students, folded]);

  if (!PUBLIC_STUDENT_INFO) {
    return <div className="pub-card pub-muted">Check-in is not available on this site.</div>;
  }

  return (
    <section className="pub-card pub-checkin-card">
      <label className="pub-checkin-label" htmlFor="checkin-who">
        <Search size={16} aria-hidden /> Find your name
      </label>
      <input
        id="checkin-who"
        className="pub-input"
        type="search"
        autoComplete="off"
        placeholder="Start typing your name"
        value={q}
        onChange={e => setQ(e.target.value)}
      />
      {folded && matches.length === 0 && (
        <p className="pub-checkin-hint warn">
          No match. Try your last name — or find a director.
        </p>
      )}
      <ul className="pub-checkin-matches">
        {matches.map(s => (
          <li key={s.id}>
            <button type="button" onClick={() => onPick(s)}>
              <span className="name">{s.name}</span>
              <span className="meta">{[s.grade, s.instrument].filter(Boolean).join(' · ')}</span>
            </button>
          </li>
        ))}
      </ul>
      {collegeDoor && (
        <p className="pub-checkin-college-door">
          <button type="button" className="pub-linkish" onClick={onCollege}>
            <GraduationCap size={15} aria-hidden /> I am a college student and I am not on this list
          </button>
        </p>
      )}
    </section>
  );
}

/* ── Step 1, the other door: college students who are not in the Hub yet ── */

/**
 * Name and college email on ONE card (#concert-checkin).
 *
 * Together, not as two steps, because for a student with no roster record
 * they are one act — and because the email is the part that actually matters.
 * It is the identity: the record id is derived from it, so the check-out at
 * the end of the night finds this check-in by the address and not by the
 * spelling of the name. Which is why the address gets its own confirmation
 * line before the photo, and the name does not.
 */
function CollegeStep({ settings, first, setFirst, last, setLast, email, setEmail, onBack, onDone }: {
  settings: CheckinSettings;
  /** Held by the parent so a bounce back from the photo step to fix the email
   *  does not also wipe the name. */
  first: string;
  setFirst: (v: string) => void;
  last: string;
  setLast: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  onBack: () => void;
  onDone: (name: string) => void;
}) {
  const name = normalizeGuestName(`${first} ${last}`);
  const nameBad = guestNameProblem(name);
  const emailBad = guestEmailProblem(email, settings);
  const hint = domainsLabel(settings.guestEmailDomains);

  return (
    <section className="pub-card pub-checkin-card">
      <p className="pub-checkin-who">
        <GraduationCap size={18} aria-hidden /> College student
        <button type="button" className="pub-linkish" onClick={onBack}>Back to the list</button>
      </p>
      <p className="pub-checkin-hint">
        Your name is not in the Hub yet. Type it here and it will be on the
        director&rsquo;s attendance sheet all the same.
      </p>

      <label className="pub-checkin-label" htmlFor="checkin-first">Your name</label>
      <div className="pub-checkin-name-row">
        <input
          id="checkin-first"
          className="pub-input"
          type="text"
          autoComplete="given-name"
          placeholder="First name"
          value={first}
          onChange={e => setFirst(e.target.value)}
        />
        <input
          id="checkin-last"
          className="pub-input"
          type="text"
          autoComplete="family-name"
          placeholder="Last name"
          value={last}
          onChange={e => setLast(e.target.value)}
        />
      </div>

      <label className="pub-checkin-label" htmlFor="checkin-college-email">
        <Mail size={16} aria-hidden /> Your college email
      </label>
      <input
        id="checkin-college-email"
        className="pub-input"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="off"
        spellCheck={false}
        placeholder={hint ? hint.split(',')[0].replace('@', 'you@') : 'you@college.edu'}
        value={email}
        onChange={e => setEmail(e.target.value)}
      />
      {hint && (
        <p className="pub-checkin-hint">
          It has to end in {hint}. <strong>Use the same address when you check
          out</strong> — it is how the Hub knows the two are you.
        </p>
      )}
      {email && emailBad === 'domain' && (
        <p className="pub-checkin-hint warn">
          That is not a college address. If you are on the student list, go back
          and find your name instead.
        </p>
      )}

      <button
        type="button"
        className="pub-btn"
        disabled={Boolean(nameBad || emailBad)}
        onClick={() => onDone(name)}
      >
        Next — take the photo
      </button>
    </section>
  );
}

/* ── The station is shut ── */

function ClosedCard({ state, title, event, win }: {
  state: 'off' | 'early' | 'closed';
  title: string;
  event: { date: string; startTime?: string };
  win: { opensAt: number } | null;
}) {
  const opensAt = win ? new Date(win.opensAt) : null;
  return (
    <section className="pub-card pub-checkin-card pub-checkin-closed">
      <h1>{title}</h1>
      <p className="pub-muted">{fmtFullDate(event.date)}{event.startTime ? ` · ${formatTime(event.startTime)}` : ''}</p>
      {state === 'early' && opensAt && (
        <>
          <p className="pub-checkin-big"><Clock size={20} aria-hidden /> Not open yet</p>
          <p>
            Check-in opens at {clockAt(opensAt.getTime())}. Come back then — this
            page will be waiting.
          </p>
        </>
      )}
      {state === 'closed' && (
        <>
          <p className="pub-checkin-big">Check-in has closed</p>
          <p>If you were here and did not get checked in, find a director. Do not just leave it.</p>
        </>
      )}
      {state === 'off' && (
        <>
          <p className="pub-checkin-big">No check-in for this one</p>
          <p>This concert is not using the check-in station.</p>
        </>
      )}
    </section>
  );
}
