import { memo } from 'react';
import { GraduationCap, Image } from 'lucide-react';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebaseAuth';
import { formatTimeRange } from '../utils';
import { lastFirst } from '../../shared/personName';
import {
  ATTENDANCE_BTN_LABEL,
  ATTENDANCE_STATUS_LABEL,
  ROLL_MARKS,
} from '../attendanceStatus';
import { ABSENCE_CATEGORY_LABEL } from '../types';
import type { Student, AttendanceRecord, AttendanceStatus, RosterOverride, PlannedAbsence } from '../types';

/** Resolved lazily, on tap — most rows have no photo, and this list runs to
 *  80+ students, so nothing here should fetch a Storage URL up front. */
async function openExcusePhoto(path: string) {
  if (!storage) return;
  try {
    const url = await getDownloadURL(storageRef(storage, path));
    window.open(url, '_blank', 'noopener');
  } catch {
    window.alert("That photo couldn't be opened — it may not have finished uploading. Ask the student to try again.");
  }
}

interface Props {
  student: Student;
  /** Pending planned absence submitted by the student/parent (#27), already
   *  scoped by AttendanceView to reports that name THIS ensemble (or name
   *  none, the original button's "every rehearsal today" meaning). */
  plannedAbsence?: Pick<PlannedAbsence, 'reason' | 'category' | 'photoPath'>;
  /** Late to SCHOOL today, per the office bulletin (#tardies). Context only —
   *  it is deliberately NOT a class mark, so it never sets a status here. */
  schoolTardy?: { time?: string | null };
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
  /** Open the student's attendance / roster card (name tap). */
  onOpenStudent?: (studentId: string) => void;
}

function StudentCardInner({ student, record, onToggle, isSub, lesson, onLesson, plannedAbsence, schoolTardy, dayContext, history, onOpenStudent }: Props) {
  const status = record?.status;

  return (
    <div className={`dir-student-card ${status ? status.toLowerCase() : ''}`}>
      <div className="dir-student-info">
        <div>
          <div className="dir-student-name">
            {onOpenStudent ? (
              <button
                type="button"
                className="dir-link-btn dir-student-name-btn"
                onClick={() => onOpenStudent(student.id)}
                title="Open student attendance card"
              >
                {lastFirst(student.name)}
              </button>
            ) : (
              lastFirst(student.name)
            )}
            {student.preferredName && <span className="dir-goesby">"{student.preferredName}"</span>}
            {isSub && <span className="dir-sub-badge">Sub</span>}
            {record?.source === 'office' && <span className="dir-office-badge" title={record.reason || 'From office attendance bulletin'}>Office</span>}
            {schoolTardy && (
              <span
                className="dir-tardy-badge"
                title={`Late to school${schoolTardy.time ? ` — arrived ${schoolTardy.time}` : ''}. Not a mark for this class.`}
              >
                Late to school{schoolTardy.time ? ` ${schoolTardy.time}` : ''}
              </span>
            )}
          </div>
          <div className="dir-student-meta">
            {[student.instrument, student.section].filter(Boolean).join(' · ')}
            {student.pronunciation && <span className="dir-pronounce"> · 🗣 {student.pronunciation}</span>}
          </div>
          {record?.source === 'office' && record.reason && (
            <div className="dir-office-reason">{record.reason}</div>
          )}
          {plannedAbsence && !record && (
            <div className="dir-prereport">
              📋 Reported ahead{plannedAbsence.category ? ` · ${ABSENCE_CATEGORY_LABEL[plannedAbsence.category]}` : ''}:
              {' '}{plannedAbsence.reason} — tap Absent (Excused) to accept
              {plannedAbsence.photoPath && (
                <button
                  type="button"
                  className="dir-link-btn"
                  style={{ marginLeft: 6 }}
                  onClick={() => openExcusePhoto(plannedAbsence.photoPath!)}
                >
                  <Image size={12} style={{ verticalAlign: '-2px' }} /> View photo
                </button>
              )}
            </div>
          )}
          {dayContext && dayContext.length > 0 && (
            <div className="dir-daycontext">
              {dayContext.map((c, i) => (
                <span key={i} className={`dir-daycontext-chip ${c.status.toLowerCase()}`}>
                  {(ATTENDANCE_STATUS_LABEL[c.status as AttendanceStatus] ?? c.status)} earlier today
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
              ✎ Marked by {record.updatedBy || 'the Student Assistant'} (Student Assistant)
            </div>
          )}
        </div>
        {status && (
          <span className={`dir-status-badge ${status.toLowerCase()}`}>
            {ATTENDANCE_STATUS_LABEL[status]}
          </span>
        )}
      </div>
      <div className="dir-att-btns">
        {ROLL_MARKS.map(s => (
          <button
            key={s}
            type="button"
            title={ATTENDANCE_STATUS_LABEL[s]}
            className={`dir-att-btn ${s.toLowerCase()}-btn${status === s ? ' active' : ''}`}
            onClick={() => onToggle(student.id, s)}
          >
            {ATTENDANCE_BTN_LABEL[s]}
          </button>
        ))}
        <button
          type="button"
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
