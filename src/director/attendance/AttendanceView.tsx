import { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Users, GraduationCap, Clock, CalendarDays, ClipboardList, CheckCheck, Phone, Mail, Copy } from 'lucide-react';
import { useEnsembles } from '../hooks/useEnsembles';
import { useStudents } from '../hooks/useStudents';
import { useAttendance, useDayAttendance, useAllAttendance } from '../hooks/useAttendance';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { usePlannedAbsences } from '../hooks/usePlannedAbsences';
import { useSeatingCharts } from '../hooks/useSeatingCharts';
import { useEvents } from '../hooks/useEvents';
import { useContacts } from '../hooks/useContacts';
import { resolveRoster, lessonsFor, overrideApplies } from '../rosterResolver';
import { StudentCard } from './StudentCard';
import { SortToggle } from '../components/SortToggle';
import { sortStudents, type StudentSort } from '../scoreOrder';
import { todayStr, addDays, addMinutesToTime, toDateStr, parseDate, formatTimeRange, ensembleColor, musicEnsembles } from '../utils';
import type { AttendanceStatus, Student, Ensemble, CalendarEvent } from '../types';

interface Period {
  event: CalendarEvent | null;   // null = ad-hoc roll (no scheduled rehearsal)
  ensembleId: string;
}

export function AttendanceView({ initialEnsembleId, onNavigate }: { initialEnsembleId?: string | null; onNavigate?: import('../types-nav').DirNavigate }) {
  const { ensembles, loading: ensLoading } = useEnsembles();
  const { events, loading: eventsLoading } = useEvents();
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

  // If arriving from a "Take Roll" jump, open that ensemble's period for today —
  // but only after events have loaded, otherwise we'd land in ad-hoc (untagged)
  // roll even when a rehearsal IS scheduled, defeating per-period attendance.
  useEffect(() => {
    if (!initialEnsembleId || eventsLoading) return;
    setPeriod(prev => prev ?? (periods.find(x => x.ensembleId === initialEnsembleId) ?? { event: null, ensembleId: initialEnsembleId }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEnsembleId, eventsLoading, periods.length]);

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
        onNavigate={onNavigate}
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
        {musicEnsembles(ensembles).map(e => (
          <button key={e.id} className="dir-tab" onClick={() => setPeriod({ event: periods.find(p => p.ensembleId === e.id)?.event ?? null, ensembleId: e.id })}>
            {e.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Roll for one period = (date, ensemble, optional specific rehearsal event). */
function RollPeriod({ date, period, ensemble, onBack, onNavigate }: {
  date: string; period: Period; ensemble?: Ensemble; onBack: () => void;
  onNavigate?: import('../types-nav').DirNavigate;
}) {
  const { students: allStudents } = useStudents();
  const { overrides, addOverride, deleteOverride } = useRosterOverrides();
  const { events, updateEvent } = useEvents();
  const { records: dayRecords } = useDayAttendance(date);
  const { records: historyRecords } = useAllAttendance();
  const { contacts } = useContacts();
  const [showSummary, setShowSummary] = useState(false);
  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);
  const eventId = period.event?.id ?? null;
  const ensembleId = period.ensembleId;
  const { recordMap, toggleAttendance } = useAttendance(date, ensembleId, eventId);
  const { absences: plannedAbsences } = usePlannedAbsences();
  // Students removed from THIS roster today by a pull override (not lessons):
  // they must never just vanish — show who, why, and for how long.
  const pulledToday = useMemo(() => {
    const ctx = { ensembleId, date, eventId: eventId ?? undefined, eventsById };
    return overrides
      .filter(o => o.ensembleId === ensembleId && o.action === 'remove' && o.kind !== 'lesson' && overrideApplies(o, ctx))
      .map(o => ({ o, student: allStudents.find(st => st.id === o.studentId) }));
  }, [overrides, ensembleId, date, eventId, eventsById, allStudents]);

  const plannedByStudent = useMemo(() => Object.fromEntries(
    plannedAbsences.filter(a => a.date === date && a.status !== 'dismissed').map(a => [a.studentId, a]),
  ), [plannedAbsences, date]);

  const ctx = { ensembleId, date, eventId: eventId ?? undefined, eventsById };
  const resolved = useMemo(() => resolveRoster(allStudents, overrides, ctx), [allStudents, overrides, ensembleId, date, eventId, eventsById]);
  const lessons = useMemo(() => lessonsFor(overrides, ctx), [overrides, ensembleId, date, eventId, eventsById]);

  const [toggleError, setToggleError] = useState('');
  // Status-strip highlight filter (redesign Phase 6). Dims non-matching rows
  // instead of removing them: the list must NEVER reflow under a pending tap
  // mid-roll (marked rows vanishing shifted the next tap onto the wrong
  // student). Attendance stays exception-only — Present is always derived.
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | 'Unmarked' | null>(null);
  const [lessonStudent, setLessonStudent] = useState<Student | null>(null);
  const [chartView, setChartView] = useState(false);
  const [sort, setSort] = useState<StudentSort>('scoreOrder');
  // Take Roll list order: score order (default) or last name, reusing the
  // app's shared sort logic — Violin I/II already rank distinctly there.
  // Chart view keeps its seating-chart section order and is left untouched.
  const orderedRoster = useMemo(() => {
    const subIds = new Set(resolved.filter(r => r.isSub).map(r => r.student.id));
    return sortStudents(resolved.map(r => r.student), sort)
      .map(student => ({ student, isSub: subIds.has(student.id) }));
  }, [resolved, sort]);
  const { charts } = useSeatingCharts(ensembleId);
  const latestChart = charts[0] ?? null;

  // Instrumentation-gap warning (#29): every player of an instrument is out.
  const gapWarning = useMemo(() => {
    const out = new Set(Object.values(recordMap)
      .filter(r => r.status === 'Absent' || r.status === 'Excused')
      .map(r => r.studentId));
    const byInstr = new Map<string, { total: number; present: number }>();
    for (const { student } of resolved) {
      const k = student.instrument || 'Unknown';
      const e = byInstr.get(k) ?? { total: 0, present: 0 };
      e.total += 1;
      if (!out.has(student.id)) e.present += 1;
      byInstr.set(k, e);
    }
    const missing = [...byInstr.entries()].filter(([, v]) => v.total > 0 && v.present === 0).map(([k]) => k);
    return missing;
  }, [recordMap, resolved]);

  const lessonCount = Object.keys(lessons).length;
  const exceptionCount = Object.values(recordMap).filter(r => r.status !== 'Lesson').length;
  const statusCounts = useMemo(() => {
    const c = { Absent: 0, Late: 0, Excused: 0 } as Record<'Absent' | 'Late' | 'Excused', number>;
    for (const r of Object.values(recordMap)) {
      if (r.status === 'Absent' || r.status === 'Late' || r.status === 'Excused') c[r.status] += 1;
    }
    return c;
  }, [recordMap]);
  const unmarkedCount = resolved.filter(({ student }) => !recordMap[student.id] && !lessons[student.id]).length;
  function rowMatchesFilter(studentId: string): boolean {
    if (!statusFilter) return true;
    if (statusFilter === 'Unmarked') return !recordMap[studentId] && !lessons[studentId];
    if (statusFilter === 'Lesson') return Boolean(lessons[studentId]) || recordMap[studentId]?.status === 'Lesson';
    return recordMap[studentId]?.status === statusFilter;
  }
  function toggleFilter(f: AttendanceStatus | 'Unmarked') {
    setStatusFilter(cur => (cur === f ? null : f));
  }

  // Same-day context from OTHER periods/ensembles (#25).
  const dayContext = useMemo(() => {
    const m: Record<string, { label: string; status: string }[]> = {};
    for (const r of dayRecords) {
      if (r.ensembleId === ensembleId && (r.eventId ?? null) === (eventId ?? null)) continue;
      (m[r.studentId] ??= []).push({ label: r.ensembleId, status: r.status });
    }
    return m;
  }, [dayRecords, ensembleId, eventId]);

  // Last-5-rehearsals mini-history dots per student (#25).
  const history5 = useMemo(() => {
    const byStudent: Record<string, string[]> = {};
    const mine = historyRecords
      .filter(r => r.ensembleId === ensembleId && r.date < date)
      .sort((a, b) => b.date.localeCompare(a.date));
    for (const r of mine) {
      (byStudent[r.studentId] ??= []);
      if (byStudent[r.studentId].length < 5) byStudent[r.studentId].push(r.status);
    }
    return byStudent;
  }, [historyRecords, ensembleId, date]);

  // Roll receipt (#22): stamp the event whenever the summary is opened.
  async function stampReceipt() {
    if (!period.event) return;
    const absent = Object.values(recordMap).filter(r => r.status === 'Absent').length;
    try {
      await updateEvent(period.event.id, {
        rollTaken: { ...(period.event.rollTaken ?? {}), [ensembleId]: { at: Date.now(), absent } },
      });
    } catch { /* non-fatal */ }
  }
  const dateLabel = parseDate(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeLabel = period.event?.startTime ? formatTimeRange(period.event.startTime, period.event.endTime) : '';

  async function handleToggle(studentId: string, status: AttendanceStatus) {
    setToggleError('');
    // Silently record minutes-late for the Tracker (#25) when marking Late today.
    let minutesLate: number | undefined;
    if (status === 'Late' && date === todayStr() && period.event?.startTime) {
      const [h, m] = period.event.startTime.split(':').map(Number);
      const now = new Date();
      minutesLate = Math.max(0, now.getHours() * 60 + now.getMinutes() - (h * 60 + m));
    }
    try { await toggleAttendance(studentId, status, minutesLate ? { minutesLate } : undefined); }
    catch (e) { setToggleError(e instanceof Error ? e.message : 'Could not save — try again.'); }
  }

  async function handleLessonTap(student: Student) {
    const existing = lessons[student.id];
    if (existing) {
      const win = existing.startTime && existing.endTime ? ` (${existing.startTime}–${existing.endTime})` : '';
      if (!window.confirm(`Remove ${student.name}'s lesson pull-out${win}? They'll be expected for the full rehearsal.`)) return;
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
      <div className="dir-roll-sticky-top">
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

      <div className="dir-att-summary dir-att-strip">
        <button className={`dir-att-chip${statusFilter === null ? ' on' : ''}`} onClick={() => setStatusFilter(null)}>
          <strong>{resolved.length}</strong> on roster
        </button>
        {exceptionCount === 0 && <span className="dir-att-allpresent">All present</span>}
        {statusCounts.Absent > 0 && (
          <button className={`dir-att-chip absent${statusFilter === 'Absent' ? ' on' : ''}`} onClick={() => toggleFilter('Absent')}>
            <strong>{statusCounts.Absent}</strong> Absent
          </button>
        )}
        {statusCounts.Late > 0 && (
          <button className={`dir-att-chip late${statusFilter === 'Late' ? ' on' : ''}`} onClick={() => toggleFilter('Late')}>
            <strong>{statusCounts.Late}</strong> Late
          </button>
        )}
        {statusCounts.Excused > 0 && (
          <button className={`dir-att-chip excused${statusFilter === 'Excused' ? ' on' : ''}`} onClick={() => toggleFilter('Excused')}>
            <strong>{statusCounts.Excused}</strong> Excused
          </button>
        )}
        {lessonCount > 0 && (
          <button className={`dir-att-chip lesson${statusFilter === 'Lesson' ? ' on' : ''}`} onClick={() => toggleFilter('Lesson')}>
            <strong>{lessonCount}</strong> Lessons
          </button>
        )}
        {unmarkedCount > 0 && exceptionCount > 0 && (
          <button className={`dir-att-chip${statusFilter === 'Unmarked' ? ' on' : ''}`} onClick={() => toggleFilter('Unmarked')}>
            <strong>{unmarkedCount}</strong> Unmarked
          </button>
        )}
        {pulledToday.length > 0 && <> · <strong>{pulledToday.length}</strong> pulled</>}
        {onNavigate && (
          <button className="dir-link-btn" style={{ marginLeft: 'auto' }} onClick={() => onNavigate('scheduleChanges', { ensembleId })}>
            Temporary Roster Changes
          </button>
        )}
      </div>
      </div>

      {/* Every pull is documented HERE, where roll is taken — name, why, how long. */}
      {pulledToday.length > 0 && (
        <div className="dir-pulled-strip">
          {pulledToday.map(({ o, student }) => (
            <div key={o.id} className="dir-pulled-row">
              <span className="dir-pulled-name">{student?.name ?? 'Student'}</span>
              <span className="dir-pulled-why">
                pulled {o.scope === 'event' ? 'for this event' : o.startDate === o.endDate ? 'today' : `${o.startDate} → ${o.endDate}`}
                {' — '}{o.reason || 'no reason recorded'}
              </span>
              {onNavigate && (
                <button className="dir-link-btn" onClick={() => onNavigate('scheduleChanges', { ensembleId, studentId: o.studentId })}>
                  Adjust
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {toggleError && (
        <div className="dir-att-summary" style={{ color: 'var(--dir-danger)', background: 'var(--dir-absent-bg)' }}>⚠ {toggleError}</div>
      )}

      {gapWarning.length > 0 && (
        <div className="dir-gap-warning">🎺 Section gap: no {gapWarning.join(', ')} present today</div>
      )}

      {latestChart && (
        <div style={{ padding: '0 16px 8px' }}>
          <button className="dir-tool-btn" onClick={() => setChartView(v => !v)}>
            {chartView ? '📋 List view' : '🪑 Chart view'}
          </button>
        </div>
      )}

      {chartView && latestChart ? (
        <div className="dir-chart-roll">
          <div className="dir-field-hint" style={{ padding: '0 16px 8px' }}>
            Tap a chair: Present → Absent → Late → Present.
          </div>
          {latestChart.sections.map((sec, i) => (
            <div key={i} className="dir-chart-section">
              <div className="dir-form-section-label" style={{ padding: '0 16px' }}>{sec.section}</div>
              <div className="dir-chart-seats">
                {sec.seats.map((seat, j) => {
                  const st = recordMap[seat.studentId]?.status;
                  const stu = allStudents.find(x => x.id === seat.studentId);
                  const cycle = () => {
                    if (!st) handleToggle(seat.studentId, 'Absent');
                    else if (st === 'Absent') handleToggle(seat.studentId, 'Late');
                    else handleToggle(seat.studentId, st as AttendanceStatus); // tapping current clears
                  };
                  return (
                    <button key={seat.studentId} className={`dir-chart-seat ${st ? st.toLowerCase() : 'present'}`} onClick={cycle}>
                      <span className="dir-chart-seat-num">{j + 1}</span>
                      <span className="dir-chart-seat-name">{stu?.preferredName || stu?.name?.split(',')[0] || '—'}</span>
                      {st && <span className="dir-chart-seat-status">{st}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
      <>
      {resolved.length > 0 && (
        <div style={{ padding: '4px 16px 8px' }}>
          <SortToggle value={sort} onChange={setSort} />
        </div>
      )}
      <div className="dir-student-list">
        {resolved.length === 0 ? (
          <div className="dir-empty"><Users size={40} /><h3>No active students</h3><p>Add students to this ensemble in the Roster tab.</p></div>
        ) : (
          orderedRoster.map(({ student, isSub }) => (
            <div key={student.id} className={rowMatchesFilter(student.id) ? undefined : 'dir-roll-dim'}>
            <StudentCard
              student={student}
              record={recordMap[student.id]}
              onToggle={handleToggle}
              isSub={isSub}
              lesson={lessons[student.id]}
              onLesson={handleLessonTap}
              plannedAbsence={plannedByStudent[student.id]}
              dayContext={dayContext[student.id]}
              history={history5[student.id]}
            />
            </div>
          ))
        )}
      </div>
      </>
      )}

      <div className="dir-roll-sticky-bottom" style={{ padding: '8px 16px calc(8px + env(safe-area-inset-bottom))' }}>
        <button
          className="dir-btn dir-btn-primary"
          style={{ width: '100%' }}
          onClick={() => { stampReceipt(); setShowSummary(true); }}
        >
          <CheckCheck size={16} style={{ verticalAlign: '-3px' }} /> Finish roll — summary
        </button>
      </div>

      {showSummary && (
        <AbsenteeSummary
          records={Object.values(recordMap)}
          students={allStudents}
          contacts={contacts}
          ensembleName={ensemble?.name ?? ''}
          dateLabel={dateLabel}
          onClose={() => setShowSummary(false)}
        />
      )}

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
            <label className="dir-label">Reason *</label>
            <div className="dir-field-row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              {['Applied lesson', 'Another ensemble', 'Released from school'].map(r => (
                <button key={r} type="button" className="dir-tool-btn" onClick={() => setNote(n => n.startsWith(r) ? n : `${r}${n ? ` — ${n}` : ''}`)}>
                  {r}
                </button>
              ))}
            </div>
            <input className="dir-input" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Applied lesson — Dr. Rivera" />
            <div className="dir-field-hint">Every pull-out is documented — this shows on the roll card and Who's Out.</div>
          </div>
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="dir-btn dir-btn-primary" disabled={saving || !note.trim()}
            onClick={async () => { setSaving(true); try { await onSave(start, end, note); } finally { setSaving(false); } }}>
            {saving ? 'Saving…' : 'Save lesson'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Post-roll absentee summary (#23): who's out, one tap to act on it. */
function AbsenteeSummary({ records, students, contacts, ensembleName, dateLabel, onClose }: {
  records: { studentId: string; status: string; startTime?: string; endTime?: string }[];
  students: Student[];
  contacts: Record<string, { email?: string; parentEmail?: string; phone?: string } | undefined>;
  ensembleName: string;
  dateLabel: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const nameOf = (id: string) => students.find(s => s.id === id)?.name ?? 'Student';
  const flagged = records.filter(r => r.status === 'Absent' || r.status === 'Late' || r.status === 'Excused');
  const absent = flagged.filter(r => r.status === 'Absent');
  const late = flagged.filter(r => r.status === 'Late');

  function copyForTeams() {
    const lines = [
      `${ensembleName} — ${dateLabel}`,
      ...(absent.length ? [`Absent: ${absent.map(r => nameOf(r.studentId)).join(', ')}`] : []),
      ...(late.length ? [`Late: ${late.map(r => nameOf(r.studentId)).join(', ')}`] : []),
      ...(flagged.length === 0 ? ['Everyone present ✅'] : []),
    ];
    navigator.clipboard?.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">Roll summary — {ensembleName}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          {flagged.length === 0 ? (
            <div className="dir-empty-inline">🎉 Everyone present. Nothing to follow up.</div>
          ) : (
            flagged.map(r => {
              const c = contacts[r.studentId];
              return (
                <div key={r.studentId} className="dir-sub-row">
                  <div className="dir-sub-info">
                    <div className="dir-sub-name">{nameOf(r.studentId)}</div>
                    <div className="dir-sub-instr">{r.status}</div>
                  </div>
                  {c?.phone && (
                    <a className="dir-icon-btn" href={`tel:${c.phone}`} aria-label="Call"><Phone size={15} /></a>
                  )}
                  {(c?.parentEmail || c?.email) && (
                    <a
                      className="dir-icon-btn"
                      aria-label="Email"
                      href={`mailto:${c.parentEmail || c.email}?subject=${encodeURIComponent(`${ensembleName} attendance — ${dateLabel}`)}&body=${encodeURIComponent(`Hello,\n\n${nameOf(r.studentId)} was marked ${r.status.toLowerCase()} at today's ${ensembleName} rehearsal (${dateLabel}). `)}`}
                    >
                      <Mail size={15} />
                    </a>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose}>Close</button>
          <button className="dir-btn dir-btn-primary" onClick={copyForTeams}>
            <Copy size={15} style={{ verticalAlign: '-2px' }} /> {copied ? 'Copied ✓' : 'Copy for Teams'}
          </button>
        </div>
      </div>
    </div>
  );
}
