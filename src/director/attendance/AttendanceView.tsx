import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { useEnsembles } from '../hooks/useEnsembles';
import { useStudents } from '../hooks/useStudents';
import { useAttendance } from '../hooks/useAttendance';
import { StudentCard } from './StudentCard';
import type { AttendanceStatus } from '../types';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(d: string) {
  const date = new Date(d + 'T12:00:00');
  const isToday = d === todayStr();
  const label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return { label, isToday };
}

function addDays(d: string, n: number) {
  const date = new Date(d + 'T12:00:00');
  date.setDate(date.getDate() + n);
  return date.toISOString().slice(0, 10);
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

  const { students } = useStudents(selectedEnsembleId ?? undefined);
  const { recordMap, toggleAttendance } = useAttendance(date, selectedEnsembleId);

  const activeCount = students.length;
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
          {students.length === 0 ? (
            <div className="dir-empty">
              <Users size={40} />
              <h3>No active students</h3>
              <p>Add students to this ensemble in the Roster tab.</p>
            </div>
          ) : (
            students.map(s => (
              <StudentCard
                key={s.id}
                student={s}
                record={recordMap[s.id]}
                onToggle={handleToggle}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
