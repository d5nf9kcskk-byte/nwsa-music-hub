import { useMemo, useState } from 'react';
import { CalendarClock, FileText, ShieldCheck, Trash2, UserCheck } from 'lucide-react';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { useConcertExcusals } from '../hooks/useConcertExcusals';
import { currentDirectorName, currentDirectorEmail } from '../currentDirector';
import { EXCUSAL_CATEGORIES, excusableConcerts, excusalCategoryLabel, excusalOverrides } from '../concertExcusal';
import { formatDate, parseDate, todayStr } from '../utils';
import { displayName } from '../../shared/personName';
import { backdropClose } from '../../shared/backdropClose';
import type { CalendarEvent, ConcertExcusal, Ensemble, ExcusalCategory, RosterOverride, Student } from '../types';

function concertLabel(e: CalendarEvent | undefined, ensembleMap: Record<string, Ensemble>) {
  if (!e) return 'A concert that has since been deleted';
  const name = e.title || e.ensembleIds.map(id => ensembleMap[id]?.name).filter(Boolean).join(', ') || 'Concert';
  return `${name} — ${formatDate(e.date)}`;
}

/**
 * "Excused from a concert" on the Move-a-Student page (#concert-excusals).
 * Files the record AND the pull-outs together; the student's excusals already
 * on file list underneath, each with its full record.
 */
export function ConcertExcusalForm({ student, students, events, eventsById, ensembleMap }: {
  student: Student;
  students: Student[];
  events: CalendarEvent[];
  eventsById: Record<string, CalendarEvent>;
  ensembleMap: Record<string, Ensemble>;
}) {
  const { overrides } = useRosterOverrides();
  const { excusals, fileExcusal } = useConcertExcusals();
  const [picked, setPicked] = useState<string[]>([]);
  const [category, setCategory] = useState<ExcusalCategory | ''>('');
  const [requestedOn, setRequestedOn] = useState(todayStr());
  const [requestedBy, setRequestedBy] = useState('');
  const [approvedBy, setApprovedBy] = useState(currentDirectorName() ?? '');
  const [record, setRecord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const concerts = useMemo(
    () => excusableConcerts(student, events, students, overrides, eventsById, todayStr()),
    [student, events, students, overrides, eventsById],
  );
  const picks = concerts.filter(c => picked.includes(c.event.id));
  const ready = !busy && picks.length > 0 && !!category && !!record.trim();
  const mine = excusals
    .filter(x => x.studentId === student.id)
    .sort((a, b) => b.createdAt - a.createdAt);

  async function handleSave() {
    if (!ready || !category) return;
    setBusy(true); setError(''); setSaved('');
    try {
      await fileExcusal({
        studentId: student.id,
        eventIds: picks.map(p => p.event.id),
        category,
        record: record.trim(),
        ...(requestedOn ? { requestedOn } : {}),
        ...(requestedBy.trim() ? { requestedBy: requestedBy.trim() } : {}),
        ...(approvedBy.trim() ? { approvedBy: approvedBy.trim() } : {}),
        createdAt: Date.now(),
        createdBy: currentDirectorName() ?? currentDirectorEmail() ?? 'unknown',
      }, excusalOverrides(student.id, picks));
      setSaved(`Saved — ${student.name} is off ${picks.length === 1 ? 'that concert' : `those ${picks.length} concerts`}.`);
      setPicked([]); setCategory(''); setRecord(''); setRequestedBy('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save — try again.');
    } finally { setBusy(false); }
  }

  return (
    <>
      {error && <div className="dir-sc-error">⚠ {error}</div>}
      <div className="dir-sent">
        <b>{student.name}</b> is excused from:
      </div>
      {concerts.length === 0 ? (
        <div className="dir-empty-inline">
          {mine.length
            ? `No upcoming concerts left to excuse ${student.name} from — the ones already excused are listed below.`
            : `${student.name} isn’t on stage for any upcoming concert.`}
        </div>
      ) : concerts.map(({ event }) => (
        <label key={event.id} className="dir-checkbox-row">
          <input
            type="checkbox"
            checked={picked.includes(event.id)}
            onChange={e => setPicked(p => e.target.checked ? [...p, event.id] : p.filter(id => id !== event.id))}
          />
          <span>{concertLabel(event, ensembleMap)}</span>
        </label>
      ))}

      <label className="dir-label" htmlFor="excusal-category">Reason</label>
      <select id="excusal-category" className="dir-input" value={category} onChange={e => setCategory(e.target.value as ExcusalCategory)}>
        <option value="">Choose…</option>
        {EXCUSAL_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>

      <div className="dir-form-section-label">The record</div>
      <label className="dir-label" htmlFor="excusal-on">Requested on</label>
      <input id="excusal-on" className="dir-input" type="date" value={requestedOn} onChange={e => setRequestedOn(e.target.value)} />
      <label className="dir-label" htmlFor="excusal-by">Requested by</label>
      <input id="excusal-by" className="dir-input" value={requestedBy} onChange={e => setRequestedBy(e.target.value)} placeholder="e.g. the student, by email · a parent, in person" />
      <label className="dir-label" htmlFor="excusal-approved">Approved by</label>
      <input id="excusal-approved" className="dir-input" value={approvedBy} onChange={e => setApprovedBy(e.target.value)} />
      <label className="dir-label" htmlFor="excusal-record">The request, word for word — and anything else on file</label>
      <textarea
        id="excusal-record"
        className="dir-input dir-textarea dir-excusal-textarea"
        rows={10}
        value={record}
        onChange={e => setRecord(e.target.value)}
        placeholder="Paste the email here, including who sent it and when. Add any conversation, documentation, or follow-up."
      />

      <div className="dir-sc-summary dir-conseq">
        <div>{student.name} comes off the roster, the printed program and the seating for {picks.length ? (picks.length === 1 ? 'that concert' : `those ${picks.length} concerts`) : 'the concerts you tick'}. Their ensembles and every other rehearsal and concert are unchanged.</div>
        <div>An excused required concert doesn’t count against them in the Gradebook.</div>
        <div>The reason and this record are for directors and applied teachers only. Assistants and the public site see only that they aren’t playing.</div>
      </div>

      <div className="dir-drawer-footer" style={{ padding: '12px 0' }}>
        <button className="dir-btn dir-btn-primary" disabled={!ready} onClick={handleSave}>
          {busy ? 'Saving…' : 'Save excusal'}
        </button>
      </div>
      {saved && <div className="dir-field-hint" role="status">✓ {saved}</div>}

      <div className="dir-form-section-label">Excusals on file for {student.name}</div>
      {mine.length === 0
        ? <div className="dir-empty-inline">None.</div>
        : mine.map(x => <ExcusalCard key={x.id} excusal={x} eventsById={eventsById} ensembleMap={ensembleMap} />)}
    </>
  );
}

/**
 * The short door to an excusal (#concert-roll): one concert, a reason, an
 * optional note — opened from a concert's roll and from its Roster. It files
 * exactly what the full form above files, through the same hook, so the record
 * and its pull-outs land in one batch and everything that already honours an
 * excusal (the program, the seating page, the Gradebook) follows with no second
 * path to keep in step. The long form stays for the paper trail a director
 * wants in full: who asked, when, who approved.
 *
 * Everything it needs is handed in. `overrides` in particular is the whole
 * rosterOverrides collection, which every listener loads in full, so a sheet
 * that opened its own would re-read it each time it was opened.
 */
export function QuickExcusalSheet({ student, event, students, overrides, eventsById, fileExcusal, onClose }: {
  student: Student;
  event: CalendarEvent;
  students: Student[];
  overrides: RosterOverride[];
  eventsById: Record<string, CalendarEvent>;
  fileExcusal: ReturnType<typeof useConcertExcusals>['fileExcusal'];
  onClose: () => void;
}) {
  const [category, setCategory] = useState<ExcusalCategory | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const picks = useMemo(
    () => excusableConcerts(student, [event], students, overrides, eventsById, todayStr()),
    [student, event, students, overrides, eventsById],
  );
  const ready = !busy && picks.length > 0 && !!category;
  const who = displayName(student.name);

  async function handleSave() {
    if (!ready || !category) return;
    setBusy(true); setError('');
    try {
      const by = currentDirectorName();
      await fileExcusal({
        studentId: student.id,
        eventIds: [event.id],
        category,
        record: note.trim(),
        ...(by ? { approvedBy: by } : {}),
        createdAt: Date.now(),
        createdBy: by ?? currentDirectorEmail() ?? 'unknown',
      }, excusalOverrides(student.id, picks));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save — try again.');
    } finally { setBusy(false); }
  }

  return (
    <div className="dir-drawer-overlay" {...backdropClose(onClose)}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title"><UserCheck size={17} style={{ verticalAlign: '-3px' }} /> Excuse {who}</span>
          <button className="dir-drawer-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="dir-drawer-body">
          {error && <div className="dir-sc-error">⚠ {error}</div>}
          <div className="dir-roster-event-name">{event.title || 'This concert'}</div>
          <div className="dir-field-hint" style={{ marginBottom: 10 }}>{formatDate(event.date)}</div>
          {picks.length === 0 ? (
            <div className="dir-empty-inline">
              {who} isn’t on stage for this concert, or it has already happened — an absence from a past
              concert is marked on that concert’s roll.
            </div>
          ) : (
            <>
              <div className="dir-label">Reason</div>
              <div className="dir-verb-chips" role="group" aria-label="Reason">
                {EXCUSAL_CATEGORIES.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    className={`dir-tool-btn dir-verb-chip ${category === c.value ? 'active' : ''}`}
                    aria-pressed={category === c.value}
                    onClick={() => setCategory(c.value)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <label className="dir-label" htmlFor="quick-excusal-note">The request, word for word — optional</label>
              <textarea
                id="quick-excusal-note"
                className="dir-input dir-textarea"
                rows={4}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Paste the email, or write who asked and what they said."
              />
              <div className="dir-sc-summary dir-conseq">
                <div>{who} comes off the roster, the printed program and the seating for this concert only. Their ensembles and every other rehearsal and concert are unchanged.</div>
                <div>An excused required concert doesn’t count against them in the Gradebook.</div>
                <div>The reason and note are for directors and applied teachers only.</div>
              </div>
            </>
          )}
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="dir-btn dir-btn-primary" disabled={!ready} onClick={handleSave}>
            {busy ? 'Saving…' : 'Save excusal'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** One excusal and its whole record. Shared by the Move-a-Student page, the
 *  student's detail page, and a concert's roster. */
export function ExcusalCard({ excusal: x, eventsById, ensembleMap, studentName }: {
  excusal: ConcertExcusal;
  eventsById: Record<string, CalendarEvent>;
  ensembleMap: Record<string, Ensemble>;
  /** Shown when the card is listed somewhere that isn't already about the student. */
  studentName?: string;
}) {
  const { overrides } = useRosterOverrides();
  const { canFile, deleteExcusal } = useConcertExcusals();
  const filed = new Date(x.createdAt);
  return (
    <div className="dir-sc-ov remove">
      <div className="dir-sc-ov-body">
        <div className="dir-sc-ov-title">
          <UserCheck size={14} /> {studentName ? `${studentName} — ` : ''}Excused · {excusalCategoryLabel(x.category)}
        </div>
        <div className="dir-sc-ov-lines">
          {x.eventIds.map(id => (
            <div key={id} className="dir-sc-ov-line"><CalendarClock size={12} /> {concertLabel(eventsById[id], ensembleMap)}</div>
          ))}
          <div className="dir-sc-ov-line">
            <FileText size={12} />
            Requested{x.requestedOn ? ` ${fmt(x.requestedOn)}` : ''}{x.requestedBy ? ` by ${x.requestedBy}` : ''}
            {x.approvedBy ? ` · approved by ${x.approvedBy}` : ''}
          </div>
          <div className="dir-sc-ov-line">
            <ShieldCheck size={12} /> Filed by {x.createdBy}, {filed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {filed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </div>
        </div>
        {x.record && <div className="dir-excusal-record">{x.record}</div>}
      </div>
      {canFile && (
        <button
          className="dir-icon-btn"
          onClick={() => { if (window.confirm('Delete this excusal? The student goes back on those concerts.')) void deleteExcusal(x, overrides); }}
          aria-label="Delete this excusal"
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}

function fmt(d: string) {
  return parseDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
