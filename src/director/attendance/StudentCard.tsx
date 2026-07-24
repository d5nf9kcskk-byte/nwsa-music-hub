import { memo } from 'react';
import { GraduationCap } from 'lucide-react';
import { formatTimeRange } from '../utils';
import type { Student, AttendanceRecord, AttendanceStatus, RosterOverride } from '../types';

interface Props {
  student: Student;
  /** Pending planned absence submitted by the student/parent (#27). */
  plannedAbsence?: { reason: string };
  /** Same-day statuses from other periods (#25), e.g. absent period 1. */
  dayContext?: { label: string; status: string }[];
  /** Last five rehearsals' statuses for mini history dots (#25). */
  history?: string[];
  record: AttendanceRecord | undefined;
  onToggle: (studentId: string, status: AttendanceStatus) => void;
  isSub?: boolean;
  /** Scheduled lesson pull-out (time window) for this student today, if any. */
  lesson?: RosterOverride;
  /** Tap on the Lesson chip: opens the time sheet (or clears an existing lesson). */
  onLesson: (student: Student) => void;
}

function StudentCardInner({ student, record, onToggle, isSub, lesson, onLesson, plannedAbsence, dayContext, history }: Props) {
  const status = record?.status;

  return (
    <div className={`dir-student-card ${status ? status.toLowerCase() : ''}`}>
      <div className="dir-student-info">
        <div>
          <div className="dir-student-name">
            {student.name}
            {student.preferredName && <span className="dir-goesby">"{student.preferredName}"</span>}
            {isSub && <span className="dir-sub-badge">Sub</span>}
          </div>
          <div className="dir-student-meta">
            {[student.instrument, student.section].filter(Boolean).join(' · ')}
            {student.pronunciation && <span className="dir-pronounce"> · 🗣 {student.pronunciation}</span>}
          </div>
          {plannedAbsence && !record && (
            <div className="dir-prereport">📋 Reported ahead: {plannedAbsence.reason} — tap Excused to accept</div>
          )}
          {dayContext && dayContext.length > 0 && (
            <div className="dir-daycontext">
              {dayContext.map((c, i) => (
                <span key={i} className={`dir-daycontext-chip ${c.status.toLowerCase()}`}>
                  {c.status} earlier today
                </span>
              ))}
            </div>
          )}
          {history && history.length > 0 && (
            <span className="dir-history-dots" title="Last 5 rehearsals">
              {history.map((st, i) => <span key={i} className={`dir-history-dot ${st.toLowerCase()}`} />)}
            </span>
          )}
          {lesson && (
            <div className="dir-lesson-badge">
              <GraduationCap size={12} />
              Lesson {lesson.startTime && lesson.endTime ? formatTimeRange(lesson.startTime, lesson.endTime) : ''}
              {lesson.reason ? ` · ${lesson.reason}` : ''}
            </div>
          )}
          {record?.updatedByRole === 'assistant' && (
            <div className="dir-marked-by">
              ✎ Marked by {record.updatedBy || 'the Personnel Assistant'} (Personnel Assistant)
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

/** Rosters run to 80+ rows; memo keeps a single tap from re-rendering them all. */
export const StudentCard = memo(StudentCardInner);
