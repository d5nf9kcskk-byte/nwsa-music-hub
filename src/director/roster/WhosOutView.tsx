import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react';
import { useEnsembles } from '../hooks/useEnsembles';
import { useStudents } from '../hooks/useStudents';
import { useEvents } from '../hooks/useEvents';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { useDayAttendance } from '../hooks/useAttendance';
import { usePlannedAbsences } from '../hooks/usePlannedAbsences';
import { lessonsFor, resolveRoster, overrideApplies } from '../rosterResolver';
import { todayStr, addDays, parseDate, formatTimeRange, ensembleColor } from '../utils';
import type { DirNavigate } from '../types-nav';

/**
 * Who's Out (replaces the printable "sub sheet"): one live page answering
 * "who is out today, and why" — attendance marks, parent-reported absences
 * (with one-tap Excuse / Dismiss), lesson pull-outs, and guest players —
 * for any date, filterable by ensemble.
 */
export function WhosOutView({ initialDate, initialEnsembleId = '', onNavigate }: {
  initialDate?: string;
  initialEnsembleId?: string;
  onNavigate: DirNavigate;
}) {
  const { ensembles } = useEnsembles();
  const { students } = useStudents();
  const { events } = useEvents();
  const { overrides } = useRosterOverrides();
  const { absences: plannedAbsences } = usePlannedAbsences();

  const [date, setDate] = useState(initialDate ?? todayStr());
  const [ensembleId, setEnsembleId] = useState(initialEnsembleId);
  const { records } = useDayAttendance(date);

  const today = todayStr();
  const studentsById = useMemo(() => Object.fromEntries(students.map(s => [s.id, s])), [students]);
  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);
  const dayEvents = useMemo(() => events.filter(e => e.date === date), [events, date]);
  const orderedEnsembles = useMemo(
    () => [...ensembles].sort((a, b) => a.order - b.order).filter(e => !ensembleId || e.id === ensembleId),
    [ensembles, ensembleId],
  );

  // Parent/student-reported absences for this date (pending ones are actionable).
  const reported = useMemo(
    () => plannedAbsences
      .filter(a => a.date === date && a.status !== 'dismissed')
      .sort((a, b) => a.studentName.localeCompare(b.studentName)),
    [plannedAbsences, date],
  );

  // Per-ensemble picture: marks, lesson pull-outs, guest players.
  const sections = useMemo(() => orderedEnsembles.map(ens => {
    const marks = records
      .filter(r => r.ensembleId === ens.id && (r.status === 'Absent' || r.status === 'Late' || r.status === 'Excused'))
      .map(r => ({ ...r, student: studentsById[r.studentId] }))
      .filter(r => r.student)
      .sort((a, b) => a.student!.name.localeCompare(b.student!.name));
    const lessons = Object.values(lessonsFor(overrides, { ensembleId: ens.id, date, eventsById }))
      .map(o => ({ ...o, student: studentsById[o.studentId] }))
      .filter(o => o.student);
    const guests = resolveRoster(students, overrides, { ensembleId: ens.id, date, eventsById })
      .filter(r => r.isSub);
    const pulls = overrides
      .filter(o => o.ensembleId === ens.id && o.action === 'remove' && o.kind !== 'lesson' && overrideApplies(o, { ensembleId: ens.id, date, eventsById }))
      .map(o => ({ ...o, student: studentsById[o.studentId] }))
      .filter(o => o.student);
    const rehearsal = dayEvents.find(e => e.ensembleIds.includes(ens.id) && e.status !== 'Cancelled');
    return { ens, marks, lessons, guests, pulls, rehearsal };
  }).filter(s => s.marks.length > 0 || s.lessons.length > 0 || s.guests.length > 0 || s.pulls.length > 0 || s.rehearsal),
  [orderedEnsembles, records, studentsById, overrides, date, eventsById, students, dayEvents]);

  const totalOut = sections.reduce((n, s) => n + s.marks.length, 0);
  const totalLessons = sections.reduce((n, s) => n + s.lessons.length, 0);
  const dateLabel = parseDate(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="dir-tab-page">
      {/* Date navigation */}
      <div className="dir-cal-nav">
        <button className="dir-date-nav-btn" onClick={() => setDate(d => addDays(d, -1))} aria-label="Previous day">
          <ChevronLeft size={18} />
        </button>
        <button className="dir-cal-month" onClick={() => setDate(today)} title="Jump back to today">
          {dateLabel}{date === today && <span className="dir-today-badge">Today</span>}
        </button>
        <button className="dir-date-nav-btn" onClick={() => setDate(d => addDays(d, 1))} aria-label="Next day">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Ensemble filter */}
      {ensembles.length > 1 && (
        <div className="dir-tabs">
          <button className={`dir-tab ${!ensembleId ? 'active' : ''}`} onClick={() => setEnsembleId('')}>All</button>
          {[...ensembles].sort((a, b) => a.order - b.order).map(e => (
            <button key={e.id} className={`dir-tab ${ensembleId === e.id ? 'active' : ''}`} onClick={() => setEnsembleId(e.id)}>
              {e.name}
            </button>
          ))}
        </div>
      )}

      <div className="dir-drawer-body">
        <div className="dir-att-summary" style={{ borderRadius: 10 }}>
          {totalOut === 0 && reported.length === 0 && totalLessons === 0
            ? <>Nobody reported out{ensembleId ? ' for this ensemble' : ''}. 🎉</>
            : <>
                <strong>{totalOut}</strong> marked out
                {reported.length > 0 && <> · <strong>{reported.length}</strong> reported ahead</>}
                {totalLessons > 0 && <> · <strong>{totalLessons}</strong> at lessons</>}
              </>}
        </div>

        {/* Reported ahead of time — actionable before or during roll */}
        {reported.length > 0 && (
          <>
            <div className="dir-section-head"><span>Reported ahead of time</span></div>
            {reported.map(a => (
              <div key={a.id} className="dir-sub-row">
                <div className="dir-sub-info">
                  <div className="dir-sub-name">
                    {a.studentName}
                    {a.status === 'approved'
                      ? <span className="dir-status-badge excused" style={{ marginLeft: 8 }}>Excused</span>
                      : <span className="dir-status-badge late" style={{ marginLeft: 8 }}>Pending</span>}
                  </div>
                  <div className="dir-sub-instr">{a.reason}</div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Per-ensemble: who's out and why */}
        {sections.map(({ ens, marks, lessons, guests, pulls, rehearsal }) => (
          <div key={ens.id}>
            <div className="dir-section-head">
              <span>
                <span className="dir-menu-dot" style={{ background: ensembleColor(ens), marginRight: 6 }} />
                {ens.name}
                {rehearsal?.startTime && <span style={{ fontWeight: 500, color: 'var(--dir-text-muted)' }}> · {formatTimeRange(rehearsal.startTime, rehearsal.endTime)}</span>}
              </span>
              <button className="dir-link-btn" onClick={() => onNavigate('roll', { ensembleId: ens.id })}>
                <ClipboardList size={13} /> Open roll
              </button>
            </div>

            {marks.length === 0 && lessons.length === 0 && guests.length === 0 && pulls.length === 0 && (
              <div className="dir-empty-inline">Everyone expected — nobody marked out.</div>
            )}

            {marks.map(r => (
              <div key={r.id} className="dir-sub-row">
                <div className="dir-sub-info">
                  <div className="dir-sub-name">{r.student!.name}</div>
                  <div className="dir-sub-instr">
                    {r.student!.instrument}
                    {r.status === 'Late' && r.minutesLate ? ` · ${r.minutesLate} min late` : ''}
                  </div>
                </div>
                <span className={`dir-status-badge ${r.status.toLowerCase()}`}>{r.status}</span>
              </div>
            ))}

            {lessons.map(o => (
              <div key={o.id} className="dir-sc-ov lesson">
                <div className="dir-sc-ov-body">
                  <div className="dir-sc-ov-title">{o.student!.name}</div>
                  <div className="dir-sc-ov-meta">
                    Lesson pull-out{o.startTime && o.endTime ? ` · ${formatTimeRange(o.startTime, o.endTime)}` : ''}
                    {o.reason ? ` · ${o.reason}` : ''} — back after
                  </div>
                </div>
              </div>
            ))}

            {pulls.map(o => (
              <div key={o.id} className="dir-sub-row">
                <div className="dir-sub-info">
                  <div className="dir-sub-name">{o.student!.name}</div>
                  <div className="dir-sub-instr">
                    Pulled {o.startDate === o.endDate ? '' : `${o.startDate} → ${o.endDate} `}— {o.reason || 'no reason recorded'}
                  </div>
                </div>
                <span className="dir-status-badge absent">Pulled</span>
              </div>
            ))}

            {guests.map(({ student }) => (
              <div key={student.id} className="dir-sub-row">
                <div className="dir-sub-info">
                  <div className="dir-sub-name">{student.name}</div>
                  <div className="dir-sub-instr">{student.instrument} · guest today (schedule change)</div>
                </div>
                <span className="dir-status-badge excused">Guest</span>
              </div>
            ))}
          </div>
        ))}

        <div className="dir-field-hint">
          This page is read-only — every change happens in one place: <strong>Take Roll</strong>
          (marks, lessons, accepting reported absences) and its <strong>Temporary Roster Changes</strong> tool.
        </div>
      </div>
    </div>
  );
}
