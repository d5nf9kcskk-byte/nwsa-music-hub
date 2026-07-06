import { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Users, GraduationCap, Clock, CalendarDays, ClipboardList } from 'lucide-react';
import { useEnsembles } from '../hooks/useEnsembles';
import { useStudents } from '../hooks/useStudents';
import { useAttendance } from '../hooks/useAttendance';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { useEvents } from '../hooks/useEvents';
import { resolveRoster, lessonsFor } from '../rosterResolver';
import { StudentCard } from './StudentCard';
import { todayStr, addDays, addMinutesToTime, toDateStr, parseDate, formatTimeRange, ensembleColor } from '../utils';
import type { AttendanceStatus, Student, Ensemble, CalendarEvent } from '../types';

interface Period {
  event: CalendarEvent | null;   // null = ad-hoc roll (no scheduled rehearsal)
  ensembleId: string;
}

export function AttendanceView({ initialEnsembleId }: { initialEnsembleId?: string | null }) {
  const { ensembles, loading: ensLoading } = useEnsembles();
  const { events } = useEvents();
  const [date, setDate] = useState(todayStr);
  const [showCal, setShowCal] = useState(false);
  const [period, setPeriod] = useState<Period | null>(null);
  const [calCursor, setCalCursor] = useState(() => { const d = parseDate(todayStr()); d.setDate(1); return d; });

  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);
  const isToday = date === todayStr();

  // Periods for the selected day: one per (rehearsal/sectional event × ensemble).
  const periods = useMemo<Period[]>(() => {
    const out: Period[] = [];
    for (const e of events) {
      if (e.date !== date) continue;
      if (e.type !== 'Rehearsal' && e.type !== 'Sectional') continue;
      for (const ensId of e.ensembleIds) out.push({ event: e, ensembleId: ensId });
    }
    out.sort((a, b) => (a.event?.startTime ?? '99').localeCompare(b.event?.startTime ?? '99'));
    return out;
  }, [events, date]);

  // If arriving from a "Take Roll" jump, open that ensemble's period for today.
  useEffect(() => {
    if (!initialEnsembleId) return;
    setPeriod(prev => prev ?? (periods.find(x => x.ensembleId === initialEnsembleId) ?? { event: null, ensembleId: initialEnsembleId }));
    // Run once for the incoming intent; periods for today are stable enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEnsembleId, periods.length]);

  if (ensLoading) return <div className="dir-loading">Loading…</div>;
  if (ensembles.length === 0) {
    return (
      <div className="dir-empty">
        <Users size={40} />
        <h3>No ensembles yet</h3>
        <p>Add ensembles and students in the Roster tab first.</p>
      </div>
    );
  }

  if (period) {
    return (
      <RollPeriod
        date={date}
        period={period}
        ensemble={ensembleMap[period.ensembleId]}
        onBack={() => setPeriod(null)}
      />
    );
  }

  // ── Level 1: pick a day, then a period ──
  const cells = (() => {
    const y = calCursor.getFullYear(), mo = calCursor.getMonth();
    const first = new Date(y, mo, 1).getDay();
    const n = new Date(y, mo + 1, 0).getDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < first; i++) out.push(null);
    for (let d = 1; d <= n; d++) out.push(toDateStr(new Date(y, mo, d)));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  })();
  const daysWithRehearsal = new Set(events.filter(e => e.type === 'Rehearsal' || e.type === 'Sectional').map(e => e.date));
  const dateLabel = parseDate(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div>
      {/* Date navigation — any date, both directions */}
      <div className="dir-cal-nav">
        <button className="dir-date-nav-btn" onClick={() => setDate(d => addDays(d, -1))} aria-label="Previous day"><ChevronLeft size={18} /></button>
        <button className="dir-cal-month" onClick={() => setShowCal(s => !s)}>
          <CalendarDays size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          {dateLabel}{isToday ? '' : ''}
        </button>
        <button className="dir-date-nav-btn" onClick={() => setDate(d => addDays(d, 1))} aria-label="Next day"><ChevronRight size={18} /></button>
      </div>
      {!isToday && (
        <button className="dir-link-btn" style={{ display: 'block', margin: '0 auto 6px' }} onClick={() => setDate(todayStr())}>Jump to today</button>
      )}

      {/* Month picker */}
      {showCal && (
        <div className="dir-cal" style={{ marginBottom: 10 }}>
          <div className="dir-cal-nav" style={{ padding: '4px 0' }}>
            <button className="dir-date-nav-btn" onClick={() => setCalCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
            <span className="dir-cal-month">{calCursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
            <button className="dir-date-nav-btn" onClick={() => setCalCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
          </div>
          <div className="dir-cal-weekdays">{['S','M','T','W','T','F','S'].map((d, i) => <div key={i} className="dir-cal-weekday">{d}</div>)}</div>
          <div className="dir-cal-grid">
            {cells.map((d, i) => d === null ? <div key={i} className="dir-cal-cell empty" /> : (
              <button key={i} className={`dir-cal-cell ${d === date ? 'selected' : ''} ${d === todayStr() ? 'today' : ''}`} onClick={() => { setDate(d); setShowCal(false); }}>
                <span className="dir-cal-day">{parseDate(d).getDate()}</span>
                <span className="dir-cal-dots">{daysWithRehearsal.has(d) && <span className="dir-cal-dot" style={{ background: 'var(--dir-blue)' }} />}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Periods for the day */}
      <div className="dir-form-section-label" style={{ padding: '4px 16px' }}>Rehearsals this day — tap to take roll</div>
      {periods.length === 0 ? (
        <div className="dir-empty-inline" style={{ margin: '0 16px 12px' }}>No rehearsals scheduled. Pick an ensemble below to take roll anyway.</div>
      ) : (
        <div style={{ padding: '0 16px' }}>
          {periods.map((p, i) => {
            const ens = ensembleMap[p.ensembleId];
            return (
              <button key={i} className="dir-ens-row dir-sc-pick" onClick={() => setPeriod(p)}>
                <span className="dir-ens-swatch" style={{ background: ens ? ensembleColor(ens) : '#94a3b8' }} />
                <div className="dir-ens-info">
                  <div className="dir-ens-name"><ClipboardList size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />{ens?.name ?? 'Ensemble'}</div>
                  <div className="dir-ens-sub">
                    {p.event?.startTime ? <><Clock size={11} style={{ verticalAlign: '-1px' }} /> {formatTimeRange(p.event.startTime, p.event.endTime)}</> : 'Rehearsal'}
                    {p.event?.location ? ` · ${p.event.location}` : ''}
                  </div>
                </div>
                <ChevronRight size={18} style={{ opacity: 0.45, flexShrink: 0 }} />
              </button>
            );
          })}
        </div>
      )}

      {/* Ad-hoc: take roll for any ensemble even without a scheduled rehearsal */}
      <div className="dir-form-section-label" style={{ padding: '10px 16px 4px' }}>Or take roll for any ensemble</div>
      <div className="dir-tabs">
        {ensembles.map(e => (
          <button key={e.id} className="dir-tab" onClick={() => setPeriod({ event: periods.find(p => p.ensembleId === e.id)?.event ?? null, ensembleId: e.id })}>
            {e.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Roll for one period = (date, ensemble, optional specific rehearsal event). */
function RollPeriod({ date, period, ensemble, onBack }: {
  date: string; period: Period; ensemble?: Ensemble; onBack: () => void;
}) {
  const { students: allStudents } = useStudents();
  const { overrides, addOverride, deleteOverride } = useRosterOverrides();
  const { events } = useEvents();
  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);
  const eventId = period.event?.id ?? null;
  const ensembleId = period.ensembleId;
  const { recordMap, toggleAttendance } = useAttendance(date, ensembleId, eventId);

  const ctx = { ensembleId, date, eventId: eventId ?? undefined, eventsById };
  const resolved = useMemo(() => resolveRoster(allStudents, overrides, ctx), [allStudents, overrides, ensembleId, date, eventId, eventsById]);
  const lessons = useMemo(() => lessonsFor(overrides, ctx), [overrides, ensembleId, date, eventId, eventsById]);

  const [toggleError, setToggleError] = useState('');
  const [lessonStudent, setLessonStudent] = useState<Student | null>(null);

  const lessonCount = Object.keys(lessons).length;
  const exceptionCount = Object.values(recordMap).filter(r => r.status !== 'Lesson').length;
  const dateLabel = parseDate(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeLabel = period.event?.startTime ? formatTimeRange(period.event.startTime, period.event.endTime) : '';

  async function handleToggle(studentId: string, status: AttendanceStatus) {
    setToggleError('');
    try { await toggleAttendance(studentId, status); }
    catch (e) { setToggleError(e instanceof Error ? e.message : 'Could not save — try again.'); }
  }

  async function handleLessonTap(student: Student) {
    const existing = lessons[student.id];
    if (existing) {
      setToggleError('');
      try { await deleteOverride(existing.id); }
      catch (e) { setToggleError(e instanceof Error ? e.message : 'Could not remove the lesson.'); }
      return;
    }
    if (recordMap[student.id]?.status === 'Lesson') { await handleToggle(student.id, 'Lesson'); return; }
    setLessonStudent(student);
  }

  async function saveLesson(start: string, end: string, note: string) {
    if (!lessonStudent) return;
    setToggleError('');
    try {
      await addOverride({
        studentId: lessonStudent.id, ensembleId, action: 'remove', scope: 'range',
        startDate: date, endDate: date, startTime: start,
        endTime: end <= start ? addMinutesToTime(start, 30) : end,
        kind: 'lesson', reason: note.trim() || undefined,
      });
      setLessonStudent(null);
    } catch (e) { setToggleError(e instanceof Error ? e.message : 'Could not save the lesson.'); }
  }

  return (
    <div>
      <div className="dir-sc-panel-head">
        <button className="dir-drawer-back" onClick={onBack}><ChevronLeft size={18} /> Back</button>
        <div className="dir-sc-student" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="dir-ens-swatch" style={{ background: ensemble ? ensembleColor(ensemble) : '#94a3b8', height: 26 }} />
          <div>
            <div className="dir-sc-student-name" style={{ fontSize: 17 }}>{ensemble?.name ?? 'Roll'}</div>
            <div className="dir-ens-sub">{dateLabel}{timeLabel ? ` · ${timeLabel}` : ''}</div>
          </div>
        </div>
      </div>

      <div className="dir-att-summary">
        <strong>{resolved.length}</strong> students ·{' '}
        {exceptionCount === 0 ? 'All present' : <><strong>{exceptionCount}</strong> exception{exceptionCount !== 1 ? 's' : ''}</>}
        {lessonCount > 0 && <> · <strong>{lessonCount}</strong> at lessons</>}
      </div>

      {toggleError && (
        <div className="dir-att-summary" style={{ color: 'var(--dir-danger)', background: 'var(--dir-absent-bg)' }}>⚠ {toggleError}</div>
      )}

      <div className="dir-student-list">
        {resolved.length === 0 ? (
          <div className="dir-empty"><Users size={40} /><h3>No active students</h3><p>Add students to this ensemble in the Roster tab.</p></div>
        ) : (
          resolved.map(({ student, isSub }) => (
            <StudentCard
              key={student.id}
              student={student}
              record={recordMap[student.id]}
              onToggle={handleToggle}
              isSub={isSub}
              lesson={lessons[student.id]}
              onLesson={handleLessonTap}
            />
          ))
        )}
      </div>

      {lessonStudent && (
        <LessonSheet
          student={lessonStudent}
          defaultStart={period.event?.startTime || '15:00'}
          onClose={() => setLessonStudent(null)}
          onSave={saveLesson}
        />
      )}
    </div>
  );
}

/** Small sheet: a lesson is a TIME WINDOW, not the whole rehearsal. */
function LessonSheet({ student, defaultStart, onClose, onSave }: {
  student: Student; defaultStart: string; onClose: () => void;
  onSave: (start: string, end: string, note: string) => Promise<void>;
}) {
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(() => addMinutesToTime(defaultStart, 50));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title"><GraduationCap size={17} style={{ verticalAlign: '-3px' }} /> Lesson — {student.name}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-field-hint" style={{ marginBottom: 10 }}>
            The student is out only for this window and counts as present for the rest of rehearsal.
          </div>
          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">Lesson starts</label>
              <input className="dir-input" type="time" value={start} onChange={e => setStart(e.target.value)} />
            </div>
            <div className="dir-field">
              <label className="dir-label">Lesson ends</label>
              <input className="dir-input" type="time" value={end} onChange={e => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="dir-field">
            <label className="dir-label">Applied teacher / note (optional)</label>
            <input className="dir-input" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Dr. Rivera" />
          </div>
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="dir-btn dir-btn-primary" disabled={saving}
            onClick={async () => { setSaving(true); try { await onSave(start, end, note); } finally { setSaving(false); } }}>
            {saving ? 'Saving…' : 'Save lesson'}
          </button>
        </div>
      </div>
    </div>
  );
}
