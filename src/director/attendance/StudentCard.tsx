import { GraduationCap } from 'lucide-react';
import { formatTimeRange } from '../utils';
import type { Student, AttendanceRecord, AttendanceStatus, RosterOverride } from '../types';

interface Props {
  student: Student;
  record: AttendanceRecord | undefined;
  onToggle: (studentId: string, status: AttendanceStatus) => void;
  isSub?: boolean;
  /** Scheduled lesson pull-out (time window) for this student today, if any. */
  lesson?: RosterOverride;
  /** Tap on the Lesson chip: opens the time sheet (or clears an existing lesson). */
  onLesson: (student: Student) => void;
}

export function StudentCard({ student, record, onToggle, isSub, lesson, onLesson }: Props) {
  const status = record?.status;

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
          {lesson && (
            <div className="dir-lesson-badge">
              <GraduationCap size={12} />
              Lesson {lesson.startTime && lesson.endTime ? formatTimeRange(lesson.startTime, lesson.endTime) : ''}
              {lesson.reason ? ` · ${lesson.reason}` : ''}
            </div>
          )}
        </div>
        {status && (
          <span className={`dir-status-badge ${status.toLowerCase()}`}>{status}</span>
        )}
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
          className={`dir-att-btn lesson-btn${lesson || status === 'Lesson' ? ' active' : ''}`}
          onClick={() => onLesson(student)}
        >
          Lesson
        </button>
      </div>
    </div>
  );
}
