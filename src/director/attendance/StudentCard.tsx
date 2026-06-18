import type { Student, AttendanceRecord, AttendanceStatus } from '../types';

interface Props {
  student: Student;
  record: AttendanceRecord | undefined;
  onToggle: (studentId: string, status: AttendanceStatus) => void;
  isSub?: boolean;
}

export function StudentCard({ student, record, onToggle, isSub }: Props) {
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
      </div>
    </div>
  );
}
