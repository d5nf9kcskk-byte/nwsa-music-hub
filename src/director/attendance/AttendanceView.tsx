import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Users, GraduationCap } from 'lucide-react';
import { useEnsembles } from '../hooks/useEnsembles';
import { useStudents } from '../hooks/useStudents';
import { useAttendance } from '../hooks/useAttendance';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { useEvents } from '../hooks/useEvents';
import { resolveRoster, lessonsFor } from '../rosterResolver';
import { StudentCard } from './StudentCard';
import { todayStr, addDays, addMinutesToTime } from '../utils';
import type { AttendanceStatus, Student } from '../types';

function formatDate(d: string) {
  const date = new Date(d + 'T12:00:00');
  const isToday = d === todayStr();
  const label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return { label, isToday };
}

export function AttendanceView({ initialEnsembleId }: { initialEnsembleId?: string | null }) {
  const [date, setDate] = useState(todayStr);
  const { ensembles, loading: ensLoading } = useEnsembles();
  const [selectedEnsembleId, setSelectedEnsembleId] = useState<string | null>(initialEnsembleId ?? null);

  useEffect(() => {
    if (ensembles.length > 0 && !selectedEnsembleId) {
      setSelectedEnsembleId(initialEnsembleId ?? ensembles[0].id);
    }
  }, [ensembles, selectedEnsembleId, initialEnsembleId]);

  const { students: allStudents } = useStudents();
  const { overrides, addOverride, deleteOverride } = useRosterOverrides();
  const { events } = useEvents();
  const { recordMap, toggleAttendance } = useAttendance(date, selectedEnsembleId);

  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);

  // Effective roster for this ensemble + date: base members + subs − pulls.
  // (Lesson pull-outs stay ON the roster — they only miss a time window.)
  const resolved = useMemo(() => {
    if (!selectedEnsembleId) return [];
    return resolveRoster(allStudents, overrides, { ensembleId: selectedEnsembleId, date, eventsById });
  }, [allStudents, overrides, selectedEnsembleId, date, eventsById]);

  const lessons = useMemo(() => {
    if (!selectedEnsembleId) return {};
    return lessonsFor(overrides, { ensembleId: selectedEnsembleId, date, eventsById });
  }, [overrides, selectedEnsembleId, date, eventsById]);

  const lessonCount = Object.keys(lessons).length;
  const activeCount = resolved.length;
  const exceptionCount = Object.keys(recordMap).length;
  const { label: dateLabel, isToday } = formatDate(date);
  const [toggleError, setToggleError] = useState('');
  const [lessonStudent, setLessonStudent] = useState<Student | null>(null);

  // Default lesson times: rehearsal start (if an event exists today) + 50 min.
  const todaysEvent = useMemo(
    () => events.find(e => e.date === date && selectedEnsembleId != null && e.ensembleIds.includes(selectedEnsembleId)),
    [events, date, selectedEnsembleId],
  );

  async function handleToggle(studentId: string, status: AttendanceStatus) {
    setToggleError('');
    try {
      await toggleAttendance(studentId, status);
    } catch (e) {
      // Surface the failure — otherwise a rejected write looks like a no-op
      // and the director believes attendance was recorded when it wasn't.
      setToggleError(e instanceof Error ? e.message : 'Could not save — check your connection and try again.');
    }
  }

  async function handleLessonTap(student: Student) {
    const existing = lessons[student.id];
    if (existing) {
      // Toggle off: remove the scheduled lesson for this date.
      setToggleError('');
      try { await deleteOverride(existing.id); }
      catch (e) { setToggleError(e instanceof Error ? e.message : 'Could not remove the lesson.'); }
      return;
    }
    // Legacy whole-rehearsal Lesson status: tapping again clears it the old way.
    if (recordMap[student.id]?.status === 'Lesson') {
      await handleToggle(student.id, 'Lesson');
      return;
    }
    setLessonStudent(student);
  }

  async function saveLesson(start: string, end: string, note: string) {
    if (!lessonStudent || !selectedEnsembleId) return;
    setToggleError('');
    try {
      await addOverride({
        studentId: lessonStudent.id,
        ensembleId: selectedEnsembleId,
        action: 'remove',
        scope: 'range',
        startDate: date,
        endDate: date,
        startTime: start,
        endTime: end < start ? start : end,
        kind: 'lesson',
        reason: note.trim() || undefined,
      });
      setLessonStudent(null);
    } catch (e) {
      setToggleError(e instanceof Error ? e.message : 'Could not save the lesson.');
    }
  }

  if (ensLoading) return <div className="dir-loading">Loading…</div>;

  return (
    <div>
      {/* Date navigation */}
      <div className="dir-date-nav">
        <button className="dir-date-nav-btn" onClick={() => setDate(d => addDays(d, -1))}>
          <ChevronLeft size={18} />
        </button>
        <div className="dir-date-label">
          {dateLabel}
          {isToday && <span className="dir-today-badge">Today</span>}
        </div>
        <button
          className="dir-date-nav-btn"
          onClick={() => setDate(d => addDays(d, 1))}
          disabled={isToday}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Ensemble tabs */}
      {ensembles.length > 0 ? (
        <div className="dir-tabs">
          {ensembles.map(e => (
            <button
              key={e.id}
              className={`dir-tab ${selectedEnsembleId === e.id ? 'active' : ''}`}
              onClick={() => setSelectedEnsembleId(e.id)}
            >
              {e.name}
            </button>
          ))}
        </div>
      ) : (
        <div className="dir-empty">
          <Users size={40} />
          <h3>No ensembles yet</h3>
          <p>Add ensembles and students in the Roster tab first.</p>
        </div>
      )}

      {/* Summary */}
      {selectedEnsembleId && (
        <div className="dir-att-summary">
          <strong>{activeCount}</strong> students ·{' '}
          {exceptionCount === 0 ? 'All present' : (
            <><strong>{exceptionCount}</strong> exception{exceptionCount !== 1 ? 's' : ''} logged</>
          )}
          {lessonCount > 0 && <> · <strong>{lessonCount}</strong> at lessons</>}
        </div>
      )}

      {toggleError && (
        <div className="dir-att-summary" style={{ color: 'var(--dir-danger)', background: 'var(--dir-absent-bg)' }}>
          ⚠ {toggleError}
        </div>
      )}

      {/* Student cards */}
      {selectedEnsembleId && (
        <div className="dir-student-list">
          {resolved.length === 0 ? (
            <div className="dir-empty">
              <Users size={40} />
              <h3>No active students</h3>
              <p>Add students to this ensemble in the Roster tab.</p>
            </div>
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
      )}

      {lessonStudent && (
        <LessonSheet
          student={lessonStudent}
          defaultStart={todaysEvent?.startTime || '15:00'}
          onClose={() => setLessonStudent(null)}
          onSave={saveLesson}
        />
      )}
    </div>
  );
}

/** Small sheet: a lesson is a TIME WINDOW, not the whole rehearsal. */
function LessonSheet({
  student, defaultStart, onClose, onSave,
}: {
  student: Student;
  defaultStart: string;
  onClose: () => void;
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
          <button
            className="dir-btn dir-btn-primary"
            disabled={saving}
            onClick={async () => { setSaving(true); try { await onSave(start, end, note); } finally { setSaving(false); } }}
          >
            {saving ? 'Saving…' : 'Save lesson'}
          </button>
        </div>
      </div>
    </div>
  );
}
