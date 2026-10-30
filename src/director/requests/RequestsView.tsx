import { useMemo, useState } from 'react';
import { Copy, CheckCircle2, RotateCcw, Trash2, ExternalLink, Inbox, Users, CalendarX, X, Image, Send } from 'lucide-react';
import { useCopyRequests, requestMineFilter } from '../hooks/useCopyRequests';
import { usePlannedAbsences } from '../hooks/usePlannedAbsences';
import { useEnsembles } from '../hooks/useEnsembles';
import { useRepertoire } from '../hooks/useRepertoire';
import { useStudents } from '../hooks/useStudents';
import { useEvents } from '../hooks/useEvents';
import { useCurrentDirector } from '../currentDirector';
import { absenceAwaiting } from '../absenceDecision';
import { openExcusePhoto } from '../excusePhoto';
import { COPY_REASON_LABEL, type CopyRequest } from '../../shared/copyRequest';
import { lastFirst } from '../../shared/personName';
import { fmtLongDate } from '../../shared/dates';
import { todayStr, formatTimeRange, takesRoll } from '../utils';
import { ABSENCE_CATEGORY_LABEL, type PlannedAbsence } from '../types';
import '../messages/messages.css';

/**
 * Requests (#requests): every request a student sends a director, in ONE list
 * with ONE count — rehearsal absences and music copies today, and the next
 * kind is one more `Kind`. Opens on MY groups (requestMineFilter, the same
 * filter behind the nav badge and the Today line); "Everyone's" shows the
 * rest, so any director can answer any request.
 *
 * An answer does the thing. YES on an absence writes the excused marks onto
 * the roll (absenceDecision.ts); NO needs a note, and the student is emailed
 * either answer (functions/src/requestDecision.ts). A copy is "Copied", or
 * "Can't do" with a note.
 */

type Scope = 'mine' | 'all';
type Show = 'waiting' | 'answered';
type Kind = 'all' | 'absence' | 'copy';

type Item =
  | { kind: 'absence'; id: string; at: number; waiting: boolean; a: PlannedAbsence }
  | { kind: 'copy'; id: string; at: number; waiting: boolean; c: CopyRequest };

function fmtWhen(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function RequestsView() {
  const copies = useCopyRequests();
  const absences = usePlannedAbsences();
  const { ensembles } = useEnsembles();
  const { pieces } = useRepertoire();
  const { students } = useStudents();
  const { events } = useEvents();
  const me = useCurrentDirector();
  const [scope, setScope] = useState<Scope>('mine');
  const [show, setShow] = useState<Show>('waiting');
  const [kind, setKind] = useState<Kind>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  // The decline box open on one request, and its note.
  const [declining, setDeclining] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  const isMine = useMemo(() => requestMineFilter(me, ensembles), [me, ensembles]);
  const ensembleName = (id: string) => ensembles.find(e => e.id === id)?.name ?? 'Unknown ensemble';
  const today = todayStr();

  const items: Item[] = useMemo(() => [
    ...absences.absences.map(a => ({ kind: 'absence' as const, id: a.id, at: a.submittedAt, waiting: absenceAwaiting(a, today), a })),
    ...copies.requests.map(c => ({ kind: 'copy' as const, id: c.id, at: c.submittedAt, waiting: c.status === 'new', c })),
  ], [absences.absences, copies.requests, today]);

  const inScope = items.filter(i =>
    (kind === 'all' || i.kind === kind)
    && (scope === 'all' || isMine(i.kind === 'copy' ? [i.c.ensembleId] : i.a.ensembleIds)));
  const waitingCount = inScope.filter(i => i.waiting).length;
  const shown = inScope.filter(i => (show === 'waiting') === i.waiting).sort((x, y) => y.at - x.at);

  async function act(id: string, run: () => Promise<string | void>) {
    setBusy(id);
    try {
      const msg = await run();
      if (msg) setDone(d => ({ ...d, [id]: msg }));
      setDeclining(null); setNote('');
    } catch {
      window.alert('That did not save. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  function approve(a: PlannedAbsence) {
    const day = events.filter(e => e.date === a.date && takesRoll(e) && e.status !== 'Cancelled');
    const studentGroups = students.find(s => s.id === a.studentId)?.ensembleIds ?? [];
    void act(a.id, async () => {
      const n = await absences.approve(a, day, studentGroups) ?? 0;
      return n > 0
        ? `Approved. Marked excused on ${n} roll${n === 1 ? '' : 's'}.`
        : 'Approved. Nothing on the calendar that day to mark yet; Take Roll will show the request.';
    });
  }

  /** The decline box: a note is required, because it is what the student reads. */
  function declineBox(id: string, emailTo: string | undefined, send: (n: string) => Promise<void>) {
    if (declining !== id) {
      return (
        <button className="dir-tool-btn" onClick={() => { setDeclining(id); setNote(''); }}>
          <X size={15} /> Decline…
        </button>
      );
    }
    return (
      <div style={{ flexBasis: '100%' }}>
        <label className="dir-msg-meta" htmlFor={`note-${id}`} style={{ display: 'block' }}>
          {emailTo ? `Your note is emailed to ${emailTo}.` : 'No email on this request, so the student will not see your note. It stays here as the record.'}
        </label>
        <textarea id={`note-${id}`} className="dir-input" rows={3} maxLength={1000} value={note}
          onChange={e => setNote(e.target.value)} placeholder="Why not, and what they should do instead"
          style={{ width: '100%', marginBottom: 8 }} autoFocus />
        <div className="dir-msg-actions">
          <button className="dir-tool-btn" disabled={!note.trim() || busy === id} onClick={() => void act(id, () => send(note))}>
            <Send size={15} /> Send decline
          </button>
          <button className="dir-tool-btn" onClick={() => setDeclining(null)}>Cancel</button>
        </div>
      </div>
    );
  }

  function absenceRow(a: PlannedAbsence, waiting: boolean) {
    const status = a.status ?? 'pending';
    const groups = (a.ensembleIds ?? []).map(ensembleName).join(', ') || 'Every rehearsal that day';
    const when = a.timeWindow === 'specific'
      ? (a.startTime ? formatTimeRange(a.startTime, a.endTime) : a.endTime ? `Arriving about ${formatTimeRange(a.endTime)}` : '')
      : 'All day';
    return (
      <article key={a.id} className={`dir-msg ${waiting ? 'unread' : ''}`}>
        <button className="dir-msg-head" onClick={() => setOpenId(id => (id === a.id ? null : a.id))} aria-expanded={openId === a.id}>
          <CalendarX size={17} />
          <span className="dir-msg-from">{lastFirst(a.studentName)}</span>
          <span className="dir-msg-topic">{a.category ? ABSENCE_CATEGORY_LABEL[a.category] : 'Absence'} · {fmtLongDate(a.date)}</span>
          {status !== 'pending' && (
            <span className="dir-msg-replied" style={status === 'approved' ? undefined : { background: '#fee2e2', color: '#991b1b' }}>
              {status === 'approved' ? 'Approved' : 'Declined'}
            </span>
          )}
          <span className="dir-msg-when">{fmtWhen(a.submittedAt)}</span>
        </button>
        {openId === a.id && (
          <div className="dir-msg-body">
            <div className="dir-msg-meta">
              <span>{groups}</span>
              {when && <span>{when}</span>}
              {a.signOutTime && <span>Signed out {formatTimeRange(a.signOutTime)}</span>}
              {a.parentName && <span>Parent: {a.parentName}{a.parentContact ? ` (${a.parentContact})` : ''}</span>}
            </div>
            <p className="dir-msg-text">
              {a.reason}
              {a.notes ? <>{'\n'}<strong>Note:</strong> {a.notes}</> : null}
            </p>
            {status !== 'pending' && (
              <p className="dir-msg-meta">
                {status === 'approved' ? 'Approved' : status === 'declined' ? 'Declined' : 'Dismissed'}
                {a.decidedBy ? ` by ${a.decidedBy}` : ''}{a.decidedAt ? `, ${fmtWhen(a.decidedAt)}` : ''}
                {a.decisionNote ? `: “${a.decisionNote}”` : ''}
              </p>
            )}
            {status === 'pending' && !waiting && (
              <p className="dir-msg-meta">This day has passed. Approving still marks the roll excused.</p>
            )}
            {done[a.id] && <p className="dir-msg-meta" role="status"><strong>{done[a.id]}</strong></p>}
            <div className="dir-msg-actions">
              {a.photoPath && (
                <button className="dir-tool-btn" onClick={() => void openExcusePhoto(a.photoPath!)}>
                  <Image size={15} /> Excuse slip
                </button>
              )}
              {status === 'pending' && (
                <>
                  <button className="dir-tool-btn" disabled={busy === a.id} onClick={() => approve(a)}>
                    <CheckCircle2 size={15} /> Approve and mark excused
                  </button>
                  {declineBox(a.id, a.email, n => absences.decline(a.id, n))}
                </>
              )}
              <button
                className="dir-tool-btn dir-msg-delete"
                onClick={() => { if (window.confirm('Delete this request permanently?')) void absences.remove(a.id); }}
              >
                <Trash2 size={15} /> Delete
              </button>
            </div>
          </div>
        )}
      </article>
    );
  }

  /** A posted part link whose name matches what the student typed, so the
   *  director can print straight from it. */
  function partLink(r: CopyRequest): string | undefined {
    const piece = r.pieceId ? pieces.find(p => p.id === r.pieceId) : undefined;
    const want = r.part.trim().toLowerCase();
    return piece?.partsLinks?.find(l => l.instrument.trim().toLowerCase() === want)?.url;
  }

  function copyRow(r: CopyRequest) {
    const late = r.status === 'new' && r.neededBy && r.neededBy <= today;
    const link = partLink(r);
    return (
      <article key={r.id} className={`dir-msg ${r.status === 'new' ? 'unread' : ''}`}>
        <button className="dir-msg-head" onClick={() => setOpenId(id => (id === r.id ? null : r.id))} aria-expanded={openId === r.id}>
          <Copy size={17} />
          <span className="dir-msg-from">{r.pieceTitle} · {r.part}</span>
          <span className="dir-msg-topic">{ensembleName(r.ensembleId)}</span>
          {r.neededBy && r.status === 'new' && (
            <span className="dir-msg-replied" style={late ? { background: '#fee2e2', color: '#991b1b' } : undefined}>
              By {fmtLongDate(r.neededBy)}
            </span>
          )}
          {r.status === 'declined' && (
            <span className="dir-msg-replied" style={{ background: '#fee2e2', color: '#991b1b' }}>Can’t do</span>
          )}
          <span className="dir-msg-when">{fmtWhen(r.submittedAt)}</span>
        </button>
        {openId === r.id && (
          <div className="dir-msg-body">
            <div className="dir-msg-meta">
              <span>Student: <strong>{r.studentName}</strong></span>
              <span>{COPY_REASON_LABEL[r.reason] ?? r.reason}</span>
              {r.composer && <span>{r.composer}</span>}
              <span>{r.pieceId ? 'Picked from the posted repertoire' : 'Typed by the student (not on the site)'}</span>
            </div>
            <p className="dir-msg-text">
              <strong>Part:</strong> {r.part}
              {'\n'}<strong>Pages:</strong> {r.pages || 'Whole part'}
              {r.notes ? <>{'\n'}<strong>Note:</strong> {r.notes}</> : null}
            </p>
            {r.status !== 'new' && (
              <p className="dir-msg-meta">
                {r.status === 'done' ? 'Done' : 'Can’t do'}{r.doneBy ? ` by ${r.doneBy}` : ''}{r.doneAt ? `, ${fmtWhen(r.doneAt)}` : ''}
                {r.decisionNote ? `: “${r.decisionNote}”` : ''}
              </p>
            )}
            <div className="dir-msg-actions">
              {link && (
                <a className="dir-tool-btn" href={link} target="_blank" rel="noreferrer">
                  <ExternalLink size={15} /> Open this part
                </a>
              )}
              {r.status === 'new' ? (
                <>
                  <button className="dir-tool-btn" onClick={() => void copies.markDone(r.id)}>
                    <CheckCircle2 size={15} /> Mark copied
                  </button>
                  {declineBox(r.id, r.email, n => copies.decline(r.id, n))}
                </>
              ) : (
                <button className="dir-tool-btn" onClick={() => void copies.reopen(r.id)}>
                  <RotateCcw size={15} /> Back to the list
                </button>
              )}
              <button
                className="dir-tool-btn dir-msg-delete"
                onClick={() => { if (window.confirm('Delete this request permanently?')) void copies.remove(r.id); }}
              >
                <Trash2 size={15} /> Delete
              </button>
            </div>
          </div>
        )}
      </article>
    );
  }

  const tab = (on: boolean) => `dir-tool-btn${on ? ' active' : ''}`;

  return (
    <div className="dir-messages">
      <div className="dir-messages-toolbar" style={{ flexWrap: 'wrap' }}>
        <button className={tab(scope === 'mine')} onClick={() => setScope('mine')}><Inbox size={15} /> My groups</button>
        <button className={tab(scope === 'all')} onClick={() => setScope('all')}><Users size={15} /> Everyone's</button>
        <span style={{ width: 12 }} />
        <button className={tab(show === 'waiting')} onClick={() => setShow('waiting')}>
          Waiting{waitingCount > 0 ? ` (${waitingCount})` : ''}
        </button>
        <button className={tab(show === 'answered')} onClick={() => setShow('answered')}>Answered &amp; past</button>
        <span style={{ width: 12 }} />
        <button className={tab(kind === 'all')} onClick={() => setKind('all')}>All</button>
        <button className={tab(kind === 'absence')} onClick={() => setKind('absence')}><CalendarX size={15} /> Absences</button>
        <button className={tab(kind === 'copy')} onClick={() => setKind('copy')}><Copy size={15} /> Copies</button>
      </div>

      {shown.length === 0 && (
        <div className="dir-messages-empty">
          {show === 'answered'
            ? 'Nothing answered yet.'
            : 'Nothing waiting. Students ask from the public site: Report an Absence, and Resources → Request Music Copies.'}
        </div>
      )}

      {shown.map(i => (i.kind === 'absence' ? absenceRow(i.a, i.waiting) : copyRow(i.c)))}
    </div>
  );
}
