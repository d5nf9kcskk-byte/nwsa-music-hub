import { useState } from 'react';
import { GraduationCap } from 'lucide-react';
import type { Student, AttendanceRecord, AttendanceStatus, RosterOverride } from '../types';

interface Props {
  student: Student;
  record: AttendanceRecord | undefined;
  onToggle: (studentId: string, status: AttendanceStatus, times?: { startTime?: string; endTime?: string }) => void;
  isSub?: boolean;
  /** Lesson scheduled for this date via Student Schedule Change — auto-surfaced. */
  scheduledLesson?: RosterOverride;
}

function fmtTime(t?: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, '0')}${ampm === 'PM' ? '' : ''} ${ampm}`;
}

export function StudentCard({ student, record, onToggle, isSub, scheduledLesson }: Props) {
  const status = record?.status;
  const [lessonSheet, setLessonSheet] = useState(false);
  const [start, setStart] = useState(scheduledLesson?.startTime ?? '15:00');
  const [end, setEnd] = useState(scheduledLesson?.endTime ?? '15:50');

  // A lesson on the books but not yet logged → prompt chip is pre-armed.
  const lessonWindow = record?.status === 'Lesson' && record.startTime
    ? `${fmtTime(record.startTime)}–${fmtTime(record.endTime)}`
    : scheduledLesson?.startTime
      ? `${fmtTime(scheduledLesson.startTime)}–${fmtTime(scheduledLesson.endTime)}`
      : null;

  function handleLessonTap() {
    if (status === 'Lesson') {
      // Clear it (back to present)
      onToggle(student.id, 'Lesson');
      setLessonSheet(false);
      return;
    }
    // Open the time sheet, prefilled from the scheduled lesson when there is one.
    setLessonSheet(v => !v);
  }

  function saveLesson() {
    onToggle(student.id, 'Lesson', { startTime: start, endTime: end < start ? start : end });
    setLessonSheet(false);
  }

  return (
    <div className={`dir-student-card ${status ? status.toLowerCase() : ''}`}>
      <div className="dir-student-info">
        <div>
          <div className="dir-student-name">
            {student.name}
            {isSub && <span className="dir-sub-badge">Sub</span>}
          </div>
          <div className="dir-student-meta">
            {[student.instrument, student.section].filter(Boolean).join(' · ')}
          </div>
        </div>
        {status ? (
          <span className={`dir-status-badge ${status.toLowerCase()}`}>
            {status === 'Lesson' && record?.startTime ? `Lesson ${lessonWindow}` : status}
          </span>
        ) : scheduledLesson ? (
          <span className="dir-lesson-hint">
            <GraduationCap size={12} /> Lesson {lessonWindow}
          </span>
        ) : null}
      </div>
      <div className="dir-att-btns">
        {(['Absent', 'Late', 'Excused'] as AttendanceStatus[]).map(s => (
          <button
            key={s}
            className={`dir-att-btn ${s.toLowerCase()}-btn${status === s ? ' active' : ''}`}
            onClick={() => onToggle(student.id, s)}
          >
            {s}
          </button>
        ))}
        <button
          className={`dir-att-btn lesson-btn${status === 'Lesson' ? ' active' : ''}`}
          onClick={handleLessonTap}
        >
          Lesson
        </button>
      </div>
      {lessonSheet && status !== 'Lesson' && (
        <div className="dir-lesson-sheet">
          <div className="dir-lesson-sheet-title">
            <GraduationCap size={14} /> Out for a lesson — set the window
          </div>
          <div className="dir-lesson-sheet-row">
            <input className="dir-input" type="time" value={start} onChange={e => setStart(e.target.value)} />
            <span className="dir-lesson-sheet-dash">–</span>
            <input className="dir-input" type="time" value={end} onChange={e => setEnd(e.target.value)} />
            <button className="dir-btn dir-btn-primary dir-lesson-sheet-save" onClick={saveLesson}>Log</button>
          </div>
          <div className="dir-lesson-sheet-note">Counted as present outside this window.</div>
        </div>
      )}
    </div>
  );
}
