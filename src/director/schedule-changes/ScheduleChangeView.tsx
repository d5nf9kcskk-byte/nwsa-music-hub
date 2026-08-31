import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Search, UserPlus, UserMinus, Trash2, CalendarClock, GraduationCap, Clock, FileText, Repeat, CornerUpRight } from 'lucide-react';
import { useStudents } from '../hooks/useStudents';
import { useEnsembles } from '../hooks/useEnsembles';
import { useEvents } from '../hooks/useEvents';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { useStaffNotices } from '../hooks/useStaffNotices';
import { currentDirectorName } from '../currentDirector';
import { resolveRoster } from '../rosterResolver';
import { ensembleColor, parseDate, todayStr, toDateStr, formatTimeRange, addMinutesToTime, EVENT_TYPE_ICON, musicEnsembles, isClassGroup, takesAttendance, WEEKDAY_LABELS } from '../utils';
import { EnsembleFilter } from '../components/EnsembleFilter';
import { sortStudents, type StudentSort } from '../scoreOrder';
import { SortToggle } from '../components/SortToggle';
import type { DirNavigate } from '../types-nav';
import type { Student, Ensemble, RosterOverride, CalendarEvent } from '../types';
import { studentMatchesQuery } from '../studentSearch';

/** Roster context carried into the sentence page from the by-date flow. */
interface Prefill { ensembleId?: string; date?: string }

/**
 * Move a Student — the PEOPLE door (docs/schedule-ux-two-doors.md §2), the
 * Phase 4b sentence page. Pick a student, then complete ONE sentence:
 *   "[Student] is with [Ensemble ▾] instead of [computed] [today ▾]."
 * The "instead of" is computed by resolveRoster — never asked. Verbs are
 * chips that mutate the sentence in place; the write shapes are unchanged
 * RosterOverrides, so attendance and every schedule view update
 * automatically. Staff-only — never a family banner. Whole-ensemble time
 * changes are the other door (`scheduleSwap`).
 */
export function ScheduleChangeView({ initialEnsembleId = '', initialStudentId, initialMode, initialDate, initialEventId, onNavigate }: {
  initialEnsembleId?: string;
  /** Lets the ensemble headings here open their own hub. */
  onNavigate?: DirNavigate;
  /** Arrived from a lesson or pull-out shown elsewhere (Today, Who's Out) —
   *  open straight onto that student rather than the picker. */
  initialStudentId?: string;
  /** Deep link from Change a Day's "Move a student…" (#two-doors §6 4a):
   *  lands directly on that block's roster. */
  initialMode?: 'student' | 'date';
  initialDate?: string;
  initialEventId?: string;
}) {
  const { students } = useStudents();
  const { ensembles } = useEnsembles();
  const { events } = useEvents();
  const { overrides } = useRosterOverrides();
  const [mode, setMode] = useState<'student' | 'date'>(initialMode ?? 'student');
  const [selectedId, setSelectedId] = useState<string | null>(initialStudentId ?? null);
  const [prefill, setPrefill] = useState<Prefill | null>(initialStudentId && initialDate ? { ensembleId: initialEnsembleId || undefined, date: initialDate } : null);
  const [query, setQuery] = useState('');
  const [ensembleId, setEnsembleId] = useState(initialEnsembleId);
  const [sort, setSort] = useState<StudentSort>('lastName');
  const [dateSel, setDateSel] = useState(initialDate ?? todayStr());
  const [calCursor, setCalCursor] = useState(() => parseDate(initialDate ?? todayStr()));
  const [dateEventId, setDateEventId] = useState<string | null>(initialEventId ?? null);

  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);
  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);
  // Month-picker data — must stay above the early return below (rules of hooks).
  const daysWithEvents = useMemo(() => new Set(events.filter(e => e.ensembleIds.length > 0).map(e => e.date)), [events]);
  const monthCells = useMemo(() => {
    const y = calCursor.getFullYear(), mo = calCursor.getMonth();
    const first = new Date(y, mo, 1).getDay();
    const n = new Date(y, mo + 1, 0).getDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < first; i++) out.push(null);
    for (let d = 1; d <= n; d++) out.push(toDateStr(new Date(y, mo, d)));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [calCursor]);

  const selected = students.find(s => s.id === selectedId) ?? null;

  if (selected) {
    return (
      <SentencePage
        student={selected}
        students={students}
        ensembles={ensembles}
        events={events}
        eventsById={eventsById}
        prefill={prefill ?? undefined}
        onNavigate={onNavigate}
        onBack={() => { setSelectedId(null); setPrefill(null); }}
      />
    );
  }

  const q = query.trim().toLowerCase();
  const list = sortStudents(
    students
      .filter(s => s.status !== 'Graduated' && s.status !== 'Inactive')
      .filter(s => !ensembleId || s.ensembleIds?.includes(ensembleId))
      .filter(s => !q || studentMatchesQuery(s, q)),
    sort,
  );

  // By-date flow: that day's rehearsals/concerts → tap one → its expected
  // roster. Class-only events are excluded to match the sentence page, which
  // never moves a student out of a class (that's a Roster change).
  const dayEvents = events
    .filter(e => e.date === dateSel
      && e.ensembleIds.some(id => ensembleMap[id] && !isClassGroup(ensembleMap[id])))
    .sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));
  const dateEvent = dateEventId ? eventsById[dateEventId] : null;

  return (
    <div className="dir-tab-page">
      <div className="dir-sc-intro">
        <CalendarClock size={18} />
        {mode === 'student' ? 'Pick a student to change their schedule.' : 'Pick a day, then a rehearsal, then the student.'}
      </div>
      {onNavigate && (
        <div className="dir-field-hint" style={{ margin: '0 16px' }}>
          Changing a whole block’s time or room?{' '}
          <button className="dir-inline-link" onClick={() => onNavigate('scheduleSwap', mode === 'date' ? { date: dateSel } : undefined)}>
            Change a Day
          </button>
        </div>
      )}

      {/* Direction: start from a student, or start from a date on the schedule */}
      <div className="dir-mode-toggle" style={{ margin: '6px 16px 8px' }}>
        <button className={`dir-segment-btn ${mode === 'student' ? 'active' : ''}`} onClick={() => setMode('student')}>By student</button>
        <button className={`dir-segment-btn ${mode === 'date' ? 'active' : ''}`} onClick={() => setMode('date')}>By date</button>
      </div>

      {mode === 'student' ? (
        <>
          <div className="dir-sc-search">
            <Search size={16} />
            <input
              className="dir-sc-search-input"
              placeholder="Search students…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          {/* Jump straight to one ensemble's assigned roster */}
          <EnsembleFilter ensembles={ensembles} value={ensembleId} onChange={setEnsembleId} allLabel="All students" />
          <div style={{ padding: '2px 16px 8px' }}>
            <SortToggle value={sort} onChange={setSort} />
          </div>

          <div className="dir-page-body">
            {list.length === 0 ? (
              <div className="dir-empty-inline">No students match.</div>
            ) : (
              list.map(s => (
                <button key={s.id} className="dir-ens-row dir-sc-pick" onClick={() => setSelectedId(s.id)}>
                  <span className="dir-ens-swatch" style={{ background: pickColor(s, ensembles) }} />
                  <div className="dir-ens-info">
                    <div className="dir-ens-name">{s.name}</div>
                    <div className="dir-ens-sub">{s.instrument || '—'}</div>
                  </div>
                  <ChevronRight size={18} style={{ opacity: 0.45, flexShrink: 0 }} />
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="dir-page-body">
          <div className="dir-cal" style={{ marginBottom: 6 }}>
            <div className="dir-cal-nav" style={{ padding: '4px 0' }}>
              <button className="dir-date-nav-btn" onClick={() => setCalCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft size={16} /></button>
              <span className="dir-cal-month">{calCursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
              <button className="dir-date-nav-btn" onClick={() => setCalCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight size={16} /></button>
            </div>
            <div className="dir-cal-weekdays">{['S','M','T','W','T','F','S'].map((d, i) => <div key={i} className="dir-cal-weekday">{d}</div>)}</div>
            <div className="dir-cal-grid">
              {monthCells.map((d, i) => d === null ? <div key={i} className="dir-cal-cell empty" /> : (
                <button key={i} className={`dir-cal-cell ${d === dateSel ? 'selected' : ''} ${d === todayStr() ? 'today' : ''}`} onClick={() => { setDateSel(d); setDateEventId(null); }}>
                  <span className="dir-cal-day">{parseDate(d).getDate()}</span>
                  <span className="dir-cal-dots">{daysWithEvents.has(d) && <span className="dir-cal-dot" style={{ background: 'var(--dir-primary)' }} />}</span>
                </button>
              ))}
            </div>
          </div>

          {!dateEvent ? (
            dayEvents.length === 0 ? (
              <div className="dir-empty-inline">No rehearsals or concerts on this day.</div>
            ) : (
              dayEvents.map(e => (
                <button key={e.id} className="dir-ens-row dir-sc-pick" onClick={() => setDateEventId(e.id)}>
                  <span className="dir-ens-swatch" style={{ background: ensembleColor(ensembleMap[e.ensembleIds[0]]) }} />
                  <div className="dir-ens-info">
                    <div className="dir-ens-name">
                      {EVENT_TYPE_ICON[e.type]} {e.title || e.ensembleIds.map(id => ensembleMap[id]?.name).filter(Boolean).join(', ') || e.type}
                    </div>
                    <div className="dir-ens-sub">
                      {formatTimeRange(e.startTime, e.endTime) || 'No time set'}{e.location ? ` · ${e.location}` : ''}
                    </div>
                  </div>
                  <ChevronRight size={18} style={{ opacity: 0.45, flexShrink: 0 }} />
                </button>
              ))
            )
          ) : (
            <>
              <button className="dir-drawer-back" onClick={() => setDateEventId(null)} style={{ marginBottom: 8 }}>
                <ChevronLeft size={18} /> All of {parseDate(dateSel).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </button>
              {dateEvent.ensembleIds.filter(eid => ensembleMap[eid] && !isClassGroup(ensembleMap[eid])).map(eid => {
                const roster = sortStudents(
                  resolveRoster(students, overrides, { ensembleId: eid, date: dateSel, eventsById }).map(r => r.student),
                  sort,
                );
                return (
                  <div key={eid}>
                    <div className="dir-form-section-label">
                      {onNavigate && ensembleMap[eid] ? (
                        <button
                          type="button"
                          className="dir-inline-link"
                          onClick={() => onNavigate('ensembleHub', { ensembleId: eid })}
                        >
                          {ensembleMap[eid].name}
                        </button>
                      ) : (ensembleMap[eid]?.name ?? 'Ensemble')}
                      {' '}— expected roster ({roster.length})
                    </div>
                    <div style={{ padding: '0 0 8px' }}>
                      <SortToggle value={sort} onChange={setSort} />
                    </div>
                    {roster.map(s => (
                      <button
                        key={s.id}
                        className="dir-ens-row dir-sc-pick"
                        onClick={() => { setPrefill({ ensembleId: eid, date: dateSel }); setSelectedId(s.id); }}
                      >
                        <span className="dir-ens-swatch" style={{ background: ensembleColor(ensembleMap[eid]) }} />
                        <div className="dir-ens-info">
                          <div className="dir-ens-name">{s.name}</div>
                          <div className="dir-ens-sub">{s.instrument || '—'}</div>
                        </div>
                        <ChevronRight size={18} style={{ opacity: 0.45, flexShrink: 0 }} />
                      </button>
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function pickColor(s: Student, ensembles: Ensemble[]): string {
  const first = ensembles.find(e => s.ensembleIds?.includes(e.id));
  return first ? ensembleColor(first) : '#94a3b8';
}

/**
 * The director's verbs (#two-doors §2) — chips that mutate the sentence in
 * place. Each writes the same RosterOverride shape the old VERB_PRESET forms
 * did (no new shapes):
 *   send  → remove + destEnsembleId (one doc pulls here, subs there)
 *   lesson→ remove, kind 'lesson', a time window on one day (partial — the
 *           student stays on roll)
 *   out   → remove with a required reason (the only verb that leaves the
 *           building — pre-existing rule)
 *   subIn → add
 */
type Verb = 'send' | 'lesson' | 'out' | 'subIn';

const VERB_CHIPS: { verb: Verb; icon: React.ReactNode; label: string }[] = [
  { verb: 'send',   icon: <CornerUpRight size={15} />,  label: 'With another ensemble' },
  { verb: 'lesson', icon: <GraduationCap size={15} />,  label: 'Lesson pull-out' },
  { verb: 'out',    icon: <UserMinus size={15} />,      label: 'Out (trip, excused)' },
  { verb: 'subIn',  icon: <UserPlus size={15} />,       label: 'Sub in' },
];

/**
 * Phase 4b sentence page (#two-doors §2): one page, no drawers. The sentence
 * carries the whole change; the consequence card says what happens before
 * save; the student's active moves list below with one-tap delete (undo =
 * deleting one doc). Standing rotations stay a link to the existing form
 * until the Rotations page (Phase 4d).
 */
function SentencePage({ student, students, ensembles, events, eventsById, prefill, onBack, onNavigate }: {
  student: Student;
  students: Student[];
  ensembles: Ensemble[];
  events: CalendarEvent[];
  eventsById: Record<string, CalendarEvent>;
  prefill?: Prefill;
  onBack: () => void;
  onNavigate?: DirNavigate;
}) {
  const { overrides, addOverride, deleteOverride } = useRosterOverrides();
  const { addNotice } = useStaffNotices();
  const [verb, setVerb] = useState<Verb>('send');
  const [date, setDate] = useState(prefill?.date ?? todayStr());
  const [endDate, setEndDate] = useState('');       // '' = single day (the default)
  const [destId, setDestId] = useState('');
  const [fromChoice, setFromChoice] = useState(prefill?.ensembleId ?? '');
  const [lessonStart, setLessonStart] = useState('15:00');
  const [lessonEnd, setLessonEnd] = useState('15:50');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);

  // The "instead of" — computed, never asked (#two-doors §2): resolveRoster
  // over that day's attendance-taking events (rotations and shared blocks
  // included). With no calendar that far out, fall back to membership —
  // that weekday's meeting groups first. Classes never count: pulling a
  // student out of Music Theory is not what this door does.
  const expectedIds = useMemo(() => {
    const ids: string[] = [];
    for (const e of events.filter(e => e.date === date && takesAttendance(e.type))) {
      for (const eid of e.ensembleIds) {
        const ens = ensembleMap[eid];
        if (!ens || isClassGroup(ens) || ids.includes(eid)) continue;
        if (resolveRoster(students, overrides, { ensembleId: eid, eventId: e.id, eventsById }).some(r => r.student.id === student.id)) ids.push(eid);
      }
    }
    if (ids.length) return ids;
    const member = (student.ensembleIds ?? []).filter(id => ensembleMap[id] && !isClassGroup(ensembleMap[id]));
    const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
    const meets = member.filter(id => ensembleMap[id].meetingDays?.includes(wd));
    return meets.length ? meets : member;
  }, [events, date, students, overrides, eventsById, ensembleMap, student]);

  // Overridable only on the rare day the student resolves into two rehearsals.
  const fromId = expectedIds.includes(fromChoice) ? fromChoice : (expectedIds[0] ?? '');
  const fromName = ensembleMap[fromId]?.name ?? '';
  const destName = ensembleMap[destId]?.name ?? '';
  // A lesson is always single-day — ignore any range left over from another
  // verb (the through-date control is hidden for lessons, so stale state here
  // would put a phantom range in the card and the notice).
  const end = verb !== 'lesson' && endDate && endDate > date ? endDate : date;
  const whenText = (date === todayStr() ? 'today' : fmtLong(date)) + (end !== date ? ` → ${fmtLong(end)}` : '');
  const needsFrom = verb !== 'subIn';

  const destOptions = musicEnsembles(ensembles).filter(e => e.id !== fromId);
  const ready = !busy
    && (!needsFrom || !!fromId)
    && (verb === 'send' || verb === 'subIn' ? !!destId : true)
    && (verb === 'out' ? !!reason.trim() : true);

  const consequences: string[] =
    needsFrom && !fromId
      ? [`No rehearsal for ${student.name} ${whenText} — nothing to pull them from. Sub in works, or pick another day.`]
      : verb === 'send' ? [
          `${fromName}’s roll ${whenText}: ${student.name} flagged → ${destName || '…'}, not marked absent.`,
          ...(destId ? [`${destName}’s roll: ${student.name} as sub.`] : []),
          'Staff-only — no family banner. Directors get a heads-up on Today.',
        ]
      : verb === 'lesson' ? [
          `${fromName}’s roll ${whenText}: ${student.name} shows a lesson badge ${fmtTime(lessonStart)}–${fmtTime(lessonEnd)} — still on the roster, present the rest of rehearsal.`,
          'Staff-only. Directors get a heads-up on Today.',
        ]
      : verb === 'out' ? [
          `${fromName}’s roll ${whenText}: ${student.name} is off the roster — shows on Who’s Out with the reason.`,
          'Staff-only — no family banner. Directors get a heads-up on Today.',
        ]
      : [
          `${destName || '…'}’s roll ${whenText}: ${student.name} listed as a sub.`,
          `Their own rehearsals are unchanged.${destId ? ' Directors get a heads-up on Today.' : ''}`,
        ];

  const myOverrides = overrides
    .filter(o => o.studentId === student.id)
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));

  async function handleSave() {
    if (!ready) return;
    setBusy(true); setError('');
    try {
      let data: Omit<RosterOverride, 'id'>;
      if (verb === 'lesson') {
        data = {
          studentId: student.id, ensembleId: fromId, action: 'remove', scope: 'range',
          startDate: date, endDate: date,
          startTime: lessonStart,
          // Guard against a zero/negative-length window — nudge to a 30-min minimum.
          endTime: lessonEnd <= lessonStart ? addMinutesToTime(lessonStart, 30) : lessonEnd,
          kind: 'lesson',
          reason: reason.trim() || undefined,
        };
      } else if (verb === 'send') {
        data = {
          studentId: student.id, ensembleId: fromId, action: 'remove', scope: 'range',
          startDate: date, endDate: end, destEnsembleId: destId,
          reason: `Subbing into ${destName}`,
        };
      } else if (verb === 'subIn') {
        data = { studentId: student.id, ensembleId: destId, action: 'add', scope: 'range', startDate: date, endDate: end };
      } else {
        data = { studentId: student.id, ensembleId: fromId, action: 'remove', scope: 'range', startDate: date, endDate: end, reason: reason.trim() };
      }
      await addOverride(data);
      // §5.1: one notice for every affected director. Best-effort — the move
      // itself is saved either way.
      const affected = verb === 'send' ? [fromId, destId] : verb === 'subIn' ? [destId] : [fromId];
      const noticeText =
        verb === 'send' ? `${student.name} is with ${destName} instead of ${fromName} ${whenText}.`
        : verb === 'lesson' ? `${student.name} — lesson pull-out from ${fromName}, ${fmtTime(lessonStart)}–${fmtTime(lessonEnd)} ${whenText}.`
        : verb === 'out' ? `${student.name} is out ${whenText} (${reason.trim()}) — off ${fromName}.`
        : `${student.name} subs into ${destName} ${whenText}.`;
      const by = currentDirectorName();
      try {
        await addNotice({
          text: noticeText, ensembleIds: affected, date,
          ...(end !== date ? { endDate: end } : {}),
          createdAt: Date.now(),
          ...(by ? { createdBy: by } : {}),
        });
      } catch { /* notice is best-effort */ }
      // Reset the sentence to its default state — this also closes the Save
      // gate for every verb, so a stray second tap can't write a duplicate.
      setVerb('send');
      setReason('');
      setDestId('');
      setEndDate('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save — try again.');
    } finally { setBusy(false); }
  }

  const destSelect = (
    <select className="dir-sent-ctl" value={destId} onChange={e => setDestId(e.target.value)} aria-label="Ensemble">
      <option value="">ensemble…</option>
      {destOptions.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
    </select>
  );
  // Computed home ensemble — only a control on the rare two-rehearsal day.
  const fromBit = expectedIds.length > 1 ? (
    <select className="dir-sent-ctl" value={fromId} onChange={e => setFromChoice(e.target.value)} aria-label="Instead of which rehearsal">
      {expectedIds.map(id => <option key={id} value={id}>{ensembleMap[id]?.name ?? id}</option>)}
    </select>
  ) : (
    <em className="dir-sent-fixed">{fromName || 'no rehearsal'}</em>
  );
  const dateBit = (
    <>
      <input className="dir-sent-ctl" type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="Date" />
      {verb !== 'lesson' && (endDate ? (
        <> through <input className="dir-sent-ctl" type="date" value={endDate} min={date} onChange={e => setEndDate(e.target.value)} aria-label="Through" />
          <button className="dir-inline-link" onClick={() => setEndDate('')}>just one day</button></>
      ) : (
        <button className="dir-inline-link" onClick={() => setEndDate(date)}>through…</button>
      ))}
    </>
  );

  return (
    <div className="dir-tab-page">
      <div className="dir-sc-panel-head">
        <button className="dir-drawer-back" onClick={onBack}><ChevronLeft size={18} /> Back</button>
        <div className="dir-sc-student">
          <div className="dir-sc-student-name">{student.name}</div>
          <div className="dir-ens-sub">{student.instrument || '—'}</div>
        </div>
      </div>

      <div className="dir-page-body">
        {error && <div className="dir-sc-error">⚠ {error}</div>}

        <div className="dir-verb-chips" role="tablist" aria-label="What kind of move">
          {VERB_CHIPS.map(c => (
            <button
              key={c.verb}
              className={`dir-tool-btn dir-verb-chip ${verb === c.verb ? 'active' : ''}`}
              aria-pressed={verb === c.verb}
              onClick={() => setVerb(c.verb)}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>

        <div className="dir-sent">
          <b>{student.name}</b>{student.instrument ? <span className="dir-sent-muted"> ({student.instrument.toLowerCase()})</span> : null}
          {verb === 'send' && <> is with {destSelect} instead of {fromBit} {dateBit}.</>}
          {verb === 'lesson' && <> is at a lesson{' '}
            <input className="dir-sent-ctl" type="time" value={lessonStart} onChange={e => setLessonStart(e.target.value)} aria-label="Lesson starts" />–
            <input className="dir-sent-ctl" type="time" value={lessonEnd} onChange={e => setLessonEnd(e.target.value)} aria-label="Lesson ends" />
            {' '}instead of {fromBit} {dateBit}.</>}
          {verb === 'out' && <> is out (trip, excused) — not at {fromBit} — {dateBit}, because{' '}
            <input className="dir-sent-ctl dir-sent-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="field trip, released early…" aria-label="Reason" />.</>}
          {verb === 'subIn' && <> also plays with {destSelect} as a sub {dateBit}.</>}
        </div>
        {verb === 'lesson' && (
          <input
            className="dir-input" style={{ marginBottom: 4 }}
            value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Note (optional) — e.g. Trumpet lesson, Dr. Rivera"
            aria-label="Lesson note"
          />
        )}

        <div className="dir-sc-summary dir-conseq">
          {consequences.map((line, i) => <div key={i}>{line}</div>)}
        </div>

        <div className="dir-drawer-footer" style={{ padding: '12px 0' }}>
          <button className="dir-btn dir-btn-primary" disabled={!ready} onClick={handleSave}>
            {busy ? 'Saving…' : 'Save move'}
          </button>
        </div>

        {onNavigate && (
          <div className="dir-field-hint" style={{ marginBottom: 10 }}>
            {/* Every-week moves live on the Rotations page (#two-doors §4). */}
            <button className="dir-inline-link" onClick={() => onNavigate('rotations')}>
              <Repeat size={12} style={{ verticalAlign: '-1px' }} /> Standing weekly rotation…
            </button>
            {' '}· Joining or leaving an ensemble permanently is a{' '}
            <button className="dir-inline-link" onClick={() => onNavigate('roster', { studentId: student.id })}>Roster</button> change.
          </div>
        )}

        <div className="dir-form-section-label">Active moves for {student.name}</div>
        {myOverrides.length === 0 ? (
          <div className="dir-empty-inline">No temporary subs, pull-outs, or lessons right now.</div>
        ) : (
          myOverrides.map(o => (
            <div key={o.id} className={`dir-sc-ov ${o.kind === 'lesson' ? 'lesson' : o.action}`}>
              <div className="dir-sc-ov-body">
                <div className="dir-sc-ov-title">
                  {o.kind === 'lesson' ? <GraduationCap size={14} />
                    : o.kind === 'rotation' ? <Repeat size={14} />
                    : o.action === 'add' ? <UserPlus size={14} /> : <UserMinus size={14} />}
                  {o.kind === 'lesson'
                    ? `Lesson — out of ${ensembleMap[o.ensembleId]?.name ?? 'rehearsal'}`
                    : o.kind === 'rotation'
                      ? 'Standing weekly rotation'
                    : o.action === 'remove' && o.destEnsembleId
                      ? `Pulled FROM ${ensembleMap[o.ensembleId]?.name ?? 'ensemble'} → ${ensembleMap[o.destEnsembleId]?.name ?? 'another ensemble'}`
                      : `${o.action === 'add' ? 'Subbed INTO' : 'Pulled FROM'} ${ensembleMap[o.ensembleId]?.name ?? 'ensemble'}`}
                </div>
                <div className="dir-sc-ov-lines">
                  {o.kind === 'rotation' && o.destEnsembleId && (
                    <div className="dir-sc-ov-line">
                      <Repeat size={12} /> {rotationSummary(ensembleMap[o.ensembleId], ensembleMap[o.destEnsembleId], o.days)}
                    </div>
                  )}
                  <div className="dir-sc-ov-line"><CalendarClock size={12} /> {describeWhen(o)}</div>
                  {o.kind === 'lesson' && o.startTime && o.endTime && (
                    <div className="dir-sc-ov-line"><Clock size={12} /> Out {formatTimeRange(o.startTime, o.endTime)} (present the rest of rehearsal)</div>
                  )}
                  {o.reason && !(o.destEnsembleId && o.reason.startsWith('Subbing into')) && <div className="dir-sc-ov-line"><FileText size={12} /> {o.reason}</div>}
                </div>
              </div>
              <button className="dir-icon-btn" onClick={() => deleteOverride(o.id)} aria-label="Delete this change"><Trash2 size={15} /></button>
            </div>
          ))
        )}
      </div>

    </div>
  );
}

function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
}
/** "Mon/Wed: Camerata · Fri: Wind Ensemble" — the base ensemble's remaining
 *  meeting days (when it declares any), then the rotation days. */
function rotationSummary(base: Ensemble | undefined, dest: Ensemble | undefined, days: number[] | undefined): string {
  if (!dest || !days?.length) return '';
  const names = (ds: number[]) => [...ds].sort((a, b) => a - b).map(d => WEEKDAY_LABELS[d]).join('/');
  const destPart = `${names(days)}: ${dest.name}`;
  if (!base) return destPart;
  const baseDays = (base.meetingDays ?? []).filter(d => !days.includes(d));
  return `${baseDays.length ? names(baseDays) : 'Other days'}: ${base.name} · ${destPart}`;
}
function describeWhen(o: RosterOverride) {
  if (o.scope === 'event') return 'For one rehearsal';
  if (o.startDate && o.endDate) {
    // A weekday rotation is NOT a continuous pull — saying so made a Tue/Fri
    // rotation read identically to a 325-day removal.
    if (o.days?.length) {
      const on = o.days.map(d => WEEKDAY_LABELS[d]).join(', ');
      return `${on} only · ${fmtLong(o.startDate)} → ${fmtLong(o.endDate)}`;
    }
    if (o.startDate === o.endDate) return fmtLong(o.startDate);
    const days = Math.round((parseDate(o.endDate).getTime() - parseDate(o.startDate).getTime()) / 86400000) + 1;
    return `${fmtLong(o.startDate)} → ${fmtLong(o.endDate)} (${days} days)`;
  }
  return 'Ongoing';
}
function fmtLong(d: string) {
  return parseDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
