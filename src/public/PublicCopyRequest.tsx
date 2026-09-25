import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Search, Check, Copy, AlertTriangle } from 'lucide-react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../director/firebase';
import { useStudentsPublic } from './hooks/usePublicRoster';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { sortStudents } from '../director/scoreOrder';
import { musicEnsembles, performingEnsembles, pieceEnsembleIds, todayStr } from '../director/utils';
import { BackLink } from './components/BackLink';
import { useHoneypot } from './components/Honeypot';
import { primaryStudent } from '../shared/identity';
import { fmtLongDate } from '../shared/dates';
import {
  COPY_LIMITS, COPY_REASON_LABEL, COPY_REQUEST_REASONS, partLooksVague, type CopyRequestReason,
} from '../shared/copyRequest';
import { ORG } from '../org';
import { PUBLIC_STUDENT_INFO } from './publicStudentInfo';
import type { RepertoirePiece, Student } from '../director/types';
import './signup.css';
import './components/plannedAbsence.css';
import './absence.css';

/**
 * Request a copy of your music (#copy-requests). A public, unauthenticated
 * create into `copyRequests`, anchored to a real student and a real ensemble
 * (firestore.rules), landing on the Copy Requests screen of the director who
 * looks after that ensemble (copyRequestIsMine in src/shared/copyRequest.ts).
 *
 * The piece comes off the site's own repertoire when the director has posted
 * it; when they have not, the student types the title. Either way the PART
 * is typed and required, and a part with no number ("Violin") gets asked
 * about again, because a copy of the wrong part is a wasted trip to the
 * copier. Same layout as PublicAbsence.tsx: numbered steps revealed in order
 * and a `whyNotYet()` line instead of a silent disabled button.
 */

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Piece chosen off the list, typed by hand, or not chosen yet. */
type PieceChoice = { kind: 'listed'; piece: RepertoirePiece } | { kind: 'typed' } | null;

export function PublicCopyRequest() {
  const [params] = useSearchParams();
  const { students, loading: studentsLoading } = useStudentsPublic();
  const { ensembles } = useEnsembles();
  const { pieces } = useRepertoire();
  const honeypot = useHoneypot();

  const remembered = primaryStudent();
  const prefillStudent = remembered
    ? students.find(s => s.id === remembered.id && s.status === 'Active') ?? null
    : null;
  const [pickedStudent, setPickedStudent] = useState<Student | null | undefined>(undefined);
  const student = pickedStudent !== undefined ? pickedStudent : prefillStudent;
  const [q, setQ] = useState('');

  // A "Request a copy" link on a piece page arrives with ?piece=<id>.
  const linkedPiece = pieces.find(p => p.id === params.get('piece')) ?? null;

  const [ensemblePick, setEnsemblePick] = useState('');
  const [piecePick, setPiecePick] = useState<PieceChoice | undefined>(undefined);
  const [pieceQ, setPieceQ] = useState('');
  const [typedTitle, setTypedTitle] = useState('');
  const [typedComposer, setTypedComposer] = useState('');
  const [part, setPart] = useState('');
  const [pages, setPages] = useState('');
  const [reason, setReason] = useState<CopyRequestReason | ''>('');
  const [neededBy, setNeededBy] = useState('');
  const [notes, setNotes] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  const folded = fold(q.trim());
  const matches = useMemo(() => {
    if (!folded) return [];
    return sortStudents(
      students.filter(s => s.status === 'Active'
        && (fold(s.name).includes(folded) || fold(s.preferredName ?? '').includes(folded))),
      'lastName',
    ).slice(0, 12);
  }, [students, folded]);

  // The student's own groups first; a student on no roster yet can pick any
  // performing ensemble rather than being stuck.
  const ensembleOptions = useMemo(() => {
    const sorted = [...ensembles].sort((a, b) => a.order - b.order);
    const mine = musicEnsembles(sorted).filter(e => student?.ensembleIds?.includes(e.id));
    return mine.length ? mine : performingEnsembles(musicEnsembles(sorted));
  }, [ensembles, student]);

  const linkedEnsemble = linkedPiece
    ? ensembleOptions.find(e => pieceEnsembleIds(linkedPiece).includes(e.id))?.id ?? ''
    : '';
  const ensembleId = ensemblePick
    || linkedEnsemble
    || (ensembleOptions.length === 1 ? ensembleOptions[0].id : '');
  const ensemble = ensembles.find(e => e.id === ensembleId);

  const ensemblePieces = useMemo(
    () => (ensembleId ? pieces.filter(p => pieceEnsembleIds(p).includes(ensembleId)) : []),
    [pieces, ensembleId],
  );
  const pieceFolded = fold(pieceQ.trim());
  const shownPieces = pieceFolded
    ? ensemblePieces.filter(p => fold(`${p.title} ${p.fullTitle ?? ''} ${p.composer ?? ''}`).includes(pieceFolded))
    : ensemblePieces;

  const choice: PieceChoice = piecePick !== undefined
    ? piecePick
    : linkedPiece && ensemblePieces.some(p => p.id === linkedPiece.id)
      ? { kind: 'listed', piece: linkedPiece }
      : ensemblePieces.length === 0 && ensembleId ? { kind: 'typed' } : null;

  const pieceTitle = choice?.kind === 'listed' ? choice.piece.title : typedTitle.trim();
  const composer = choice?.kind === 'listed' ? choice.piece.composer ?? '' : typedComposer.trim();
  const partNames = choice?.kind === 'listed'
    ? [...new Set((choice.piece.partsLinks ?? []).map(l => l.instrument.trim()).filter(Boolean))]
    : [];
  const vague = partLooksVague(part);

  const valid = !!student && !!ensembleId && !!choice && pieceTitle.length > 0
    && part.trim().length >= COPY_LIMITS.partMin && !!reason;

  function whyNotYet(): string {
    if (!student) return 'Find your name to continue.';
    if (!ensembleId) return 'Pick the ensemble the music is for.';
    if (!choice) return 'Pick the piece, or tap “My piece isn’t listed”.';
    if (!pieceTitle) return 'Type the name of the piece.';
    if (part.trim().length < COPY_LIMITS.partMin) return 'Type the exact part you play.';
    if (!reason) return 'Tell your director why you need the copy.';
    return '';
  }

  function resetPiece() {
    setPiecePick(undefined); setPieceQ(''); setPart('');
  }

  async function submit() {
    if (!db || !valid || !student || !reason || state === 'saving') return;
    setState('saving'); setError('');
    try {
      await addDoc(collection(db, 'copyRequests'), {
        studentId: student.id,
        studentName: student.name.slice(0, COPY_LIMITS.studentName),
        ensembleId,
        ...(choice?.kind === 'listed' ? { pieceId: choice.piece.id } : {}),
        pieceTitle: pieceTitle.slice(0, COPY_LIMITS.pieceTitle),
        ...(composer ? { composer: composer.slice(0, COPY_LIMITS.composer) } : {}),
        part: part.trim().slice(0, COPY_LIMITS.part),
        ...(pages.trim() ? { pages: pages.trim().slice(0, COPY_LIMITS.pages) } : {}),
        reason,
        ...(neededBy ? { neededBy } : {}),
        ...(notes.trim() ? { notes: notes.trim().slice(0, COPY_LIMITS.notes) } : {}),
        submittedAt: Date.now(),
        status: 'new',
        // Present only when a BOT filled the hidden field; the rules' exact
        // key set rejects it (Honeypot.tsx).
        ...honeypot.botFields(),
      });
      setState('done');
    } catch {
      setState('error');
      setError(`Could not send right now. Check your connection and try again, or email ${ORG.contactEmail}.`);
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
          <p><strong>{pieceTitle}</strong>, {part.trim()}</p>
          <p className="pub-muted">
            {ensemble ? `${ensemble.name}'s director` : 'Your director'} will see it on their list.
            {neededBy ? ` You asked for it by ${fmtLongDate(neededBy)}.` : ''}
            {' '}Pick it up at rehearsal unless they tell you otherwise.
          </p>
          <button
            className="pub-signup-send"
            onClick={() => {
              setState('idle'); resetPiece(); setTypedTitle(''); setTypedComposer('');
              setPages(''); setReason(''); setNeededBy(''); setNotes('');
            }}
          >
            Request another part
          </button>
          <Link className="pub-signup-switch" to="/" style={{ display: 'block', marginTop: 12 }}>Back to the Hub</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pub-page">
      <BackLink fallback="/" label="Home" />

      <header className="pub-signup-head">
        <div className="pub-signup-kicker"><Copy size={14} /> Music copies</div>
        <h1>Request a Copy of Your Music</h1>
        <p className="pub-muted" style={{ margin: '6px 0 0' }}>
          Need a copy to practise from, a fix for a bad page turn, or a bigger print because the
          crop is too small? Ask here and it goes straight to your director.
        </p>
      </header>
      {honeypot.field}

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
            <button className="pub-signup-switch" onClick={() => { setPickedStudent(null); setQ(''); setEnsemblePick(''); resetPiece(); }}>
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
          {/* ── 2 · ensemble + piece ─────────────────────── */}
          <div className="pub-signup-step">
            <div className="pub-signup-step-num">2</div>
            <div className="pub-signup-step-title">Which piece</div>
          </div>
          <div className="pub-card">
            <label className="pub-absence-label" htmlFor="cr-ens">Ensemble</label>
            <select
              id="cr-ens"
              className="pub-absence-input"
              value={ensembleId}
              onChange={e => { setEnsemblePick(e.target.value); resetPiece(); }}
            >
              <option value="">Choose…</option>
              {ensembleOptions.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>

            {ensembleId && choice?.kind === 'listed' && (
              <div className="pub-signup-me" style={{ marginTop: 12 }}>
                <div>
                  <div className="pub-signup-me-name">{choice.piece.title}</div>
                  {choice.piece.composer && <div className="pub-muted">{choice.piece.composer}</div>}
                </div>
                <button className="pub-signup-switch" onClick={resetPiece}>Change</button>
              </div>
            )}

            {ensembleId && !choice && (
              <>
                <label className="pub-absence-label">Piece</label>
                {ensemblePieces.length > 6 && (
                  <div className="pub-search" style={{ marginBottom: 10 }}>
                    <Search size={18} />
                    <input
                      className="pub-search-input"
                      placeholder="Search this ensemble's music…"
                      value={pieceQ}
                      onChange={e => setPieceQ(e.target.value)}
                    />
                  </div>
                )}
                <div className="pub-signup-names">
                  {shownPieces.map(p => (
                    <button key={p.id} className="pub-signup-name-row" onClick={() => setPiecePick({ kind: 'listed', piece: p })}>
                      <span className="pub-roster-name">{p.title}</span>
                      {p.composer && <span className="pub-roster-instr">{p.composer}</span>}
                    </button>
                  ))}
                  <button className="pub-signup-name-row" onClick={() => setPiecePick({ kind: 'typed' })}>
                    <span className="pub-roster-name">My piece isn't listed</span>
                    <span className="pub-roster-instr">Type it in</span>
                  </button>
                </div>
              </>
            )}

            {ensembleId && choice?.kind === 'typed' && (
              <div className="pub-absence-branch">
                {ensemblePieces.length === 0 && (
                  <p className="pub-signup-note" style={{ marginTop: 0 }}>
                    This ensemble's music isn't posted on the site yet, so type it in.
                  </p>
                )}
                <label className="pub-absence-label" htmlFor="cr-title">Name of the piece</label>
                <input id="cr-title" className="pub-absence-input" maxLength={COPY_LIMITS.pieceTitle}
                  value={typedTitle} onChange={e => setTypedTitle(e.target.value)}
                  placeholder="e.g. Symphony No. 5, 1st movement" />
                <label className="pub-absence-label" htmlFor="cr-composer">
                  Composer <span className="pub-signup-optional">(optional)</span>
                </label>
                <input id="cr-composer" className="pub-absence-input" maxLength={COPY_LIMITS.composer}
                  value={typedComposer} onChange={e => setTypedComposer(e.target.value)} />
                {ensemblePieces.length > 0 && (
                  <button className="pub-signup-switch" style={{ marginTop: 10 }} onClick={resetPiece}>
                    Back to the list
                  </button>
                )}
              </div>
            )}
          </div>

          {choice && (
            <>
              {/* ── 3 · the part ─────────────────────────── */}
              <div className="pub-signup-step">
                <div className="pub-signup-step-num">3</div>
                <div className="pub-signup-step-title">Your exact part</div>
              </div>
              <div className="pub-card">
                <p className="pub-signup-note" style={{ marginTop: 0 }}>
                  Be specific: the part name exactly as it's printed at the top of your music, with
                  its number and key. “Violin 2”, not “Violin”. “Horn 3 in F”, not “Horn”.
                </p>
                {partNames.length > 0 && (
                  <div className="pub-chips" style={{ flexWrap: 'wrap' }}>
                    {partNames.map(n => (
                      <button key={n} type="button" className={`pub-chip ${part.trim() === n ? 'active' : ''}`}
                        onClick={() => setPart(n)}>
                        {n}
                      </button>
                    ))}
                  </div>
                )}
                <label className="pub-absence-label" htmlFor="cr-part">Part</label>
                <input id="cr-part" className="pub-absence-input" maxLength={COPY_LIMITS.part}
                  value={part} onChange={e => setPart(e.target.value)}
                  placeholder={student.instrument ? `e.g. ${student.instrument} 2` : 'e.g. Trumpet 1 in B♭'} />
                {vague && (
                  <div className="pub-signup-note" style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                    <AlertTriangle size={15} style={{ flex: 'none', marginTop: 2 }} />
                    <span>
                      No part number? If your section has a 1st and 2nd part (or more), add which one you
                      play. Leave it as is only if there's just one part.
                    </span>
                  </div>
                )}
                <label className="pub-absence-label" htmlFor="cr-pages">
                  Pages, measures, or movement <span className="pub-signup-optional">(optional)</span>
                </label>
                <input id="cr-pages" className="pub-absence-input" maxLength={COPY_LIMITS.pages}
                  value={pages} onChange={e => setPages(e.target.value)}
                  placeholder="Leave blank for the whole part, or e.g. pages 3–4, mm. 120–180" />
              </div>

              {/* ── 4 · why ──────────────────────────────── */}
              <div className="pub-signup-step">
                <div className="pub-signup-step-num">4</div>
                <div className="pub-signup-step-title">Why you need it</div>
              </div>
              <div className="pub-card">
                <div className="pub-absence-categories" role="radiogroup" aria-label="Why you need the copy">
                  {COPY_REQUEST_REASONS.map(r => (
                    <button
                      key={r}
                      type="button"
                      role="radio"
                      aria-checked={reason === r}
                      className={`pub-absence-cat ${reason === r ? 'active' : ''}`}
                      onClick={() => setReason(r)}
                    >
                      <span className="pub-absence-cat-label">{COPY_REASON_LABEL[r]}</span>
                    </button>
                  ))}
                </div>

                <label className="pub-absence-label" htmlFor="cr-by">
                  Need it by <span className="pub-signup-optional">(optional)</span>
                </label>
                <input id="cr-by" className="pub-absence-input" type="date" min={todayStr()}
                  value={neededBy} onChange={e => setNeededBy(e.target.value)} />

                <label className="pub-absence-label" htmlFor="cr-notes">
                  Anything else? <span className="pub-signup-optional">(optional)</span>
                </label>
                <textarea id="cr-notes" className="pub-absence-input pub-signup-textarea" rows={2}
                  maxLength={COPY_LIMITS.notes} value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Please enlarge to 11×17, or put pages 2 and 3 side by side" />
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
        </>
      )}
    </div>
  );
}
