import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { useEnsembles } from '../hooks/useEnsembles';
import { useStudents } from '../hooks/useStudents';
import { useAttendance } from '../hooks/useAttendance';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { useEvents } from '../hooks/useEvents';
import { resolveRoster } from '../rosterResolver';
import { StudentCard } from './StudentCard';
import { todayStr, addDays } from '../utils';
import type { AttendanceStatus } from '../types';

function formatDate(d: string) {
  const date = new Date(d + 'T12:00:00');
  const isToday = d === todayStr();
  const label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return { label, isToday };
}

export function AttendanceView() {
  const [date, setDate] = useState(todayStr);
  const { ensembles, loading: ensLoading } = useEnsembles();
  const [selectedEnsembleId, setSelectedEnsembleId] = useState<string | null>(null);

  useEffect(() => {
    if (ensembles.length > 0 && !selectedEnsembleId) {
      setSelectedEnsembleId(ensembles[0].id);
    }
  }, [ensembles, selectedEnsembleId]);

  const { students: allStudents } = useStudents();
  const { overrides } = useRosterOverrides();
  const { events } = useEvents();
  const { recordMap, toggleAttendance } = useAttendance(date, selectedEnsembleId);

  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);

  // Effective roster for this ensemble + date: base members + subs − pulls.
  const resolved = useMemo(() => {
    if (!selectedEnsembleId) return [];
    return resolveRoster(allStudents, overrides, { ensembleId: selectedEnsembleId, date, eventsById });
  }, [allStudents, overrides, selectedEnsembleId, date, eventsById]);

  const activeCount = resolved.length;
  const exceptionCount = Object.keys(recordMap).length;
  const { label: dateLabel, isToday } = formatDate(date);

  function handleToggle(studentId: string, status: AttendanceStatus) {
    toggleAttendance(studentId, status);
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
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
