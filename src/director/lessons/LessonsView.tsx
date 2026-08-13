import { useMemo, useState } from 'react';
import { Download, GraduationCap } from 'lucide-react';
import { useLessons } from '../hooks/useLessons';
import { useStudents } from '../hooks/useStudents';
import { useDirectors } from '../hooks/useDirectors';
import { parseDate, formatTimeRange, todayStr } from '../utils';
import { downloadLessonsCsv } from './lessonsCsv';
import type { Lesson } from '../types';

/**
 * Director view of all private lessons (teacher self-reports).
 * CSV is the handoff for Dean payment tracking later — columns stay rich
 * even while grade is not yet collected in the teacher UI.
 */
export function LessonsView() {
  const { lessons, loading } = useLessons();
  const { students } = useStudents();
  const { directors } = useDirectors();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');

  const studentsById = useMemo(() => Object.fromEntries(students.map(s => [s.id, s])), [students]);
  const teachers = useMemo(() => {
    const emails = new Set(lessons.map(l => l.teacherEmail));
    return [...emails].sort().map(email => {
      const d = directors.find(x => x.email === email);
      const sample = lessons.find(l => l.teacherEmail === email);
      return { email, label: d?.name ?? sample?.teacherName ?? email };
    });
  }, [lessons, directors]);

  const filtered = useMemo(() => {
    return lessons.filter(l => {
      if (from && l.date < from) return false;
      if (to && l.date > to) return false;
      if (teacherFilter && l.teacherEmail !== teacherFilter) return false;
      return true;
    });
  }, [lessons, from, to, teacherFilter]);

  const upcoming = filtered.filter(l => l.date >= todayStr()).length;

  function exportCsv() {
    downloadLessonsCsv(filtered, studentsById);
  }

  if (loading) {
    return <div className="dir-tab-page"><div className="dir-empty-inline">Loading lessons…</div></div>;
  }

  return (
    <div className="dir-tab-page">
      <div className="dir-page-body">
        <p className="dir-field-hint" style={{ margin: 0 }}>
          Applied teachers log lessons here. Export is the record for the Dean
          (who taught whom, when, and eventually grade / pay tracking). Grade is
          reserved in the export; teachers are not asked for it in the app yet.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
          <label className="dir-field" style={{ margin: 0, minWidth: 140 }}>
            <span className="dir-label">From</span>
            <input type="date" className="dir-input" value={from} onChange={e => setFrom(e.target.value)} />
          </label>
          <label className="dir-field" style={{ margin: 0, minWidth: 140 }}>
            <span className="dir-label">To</span>
            <input type="date" className="dir-input" value={to} onChange={e => setTo(e.target.value)} />
          </label>
          <label className="dir-field" style={{ margin: 0, minWidth: 180 }}>
            <span className="dir-label">Teacher</span>
            <select className="dir-input" value={teacherFilter} onChange={e => setTeacherFilter(e.target.value)}>
              <option value="">All teachers</option>
              {teachers.map(t => (
                <option key={t.email} value={t.email}>{t.label}</option>
              ))}
            </select>
          </label>
          <button type="button" className="dir-btn dir-btn-primary" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download size={15} /> Download CSV ({filtered.length})
          </button>
        </div>

        <div className="dir-field-hint">
          {filtered.length} lesson{filtered.length === 1 ? '' : 's'}
          {upcoming > 0 ? ` · ${upcoming} upcoming` : ''}
        </div>

        {filtered.length === 0 ? (
          <div className="dir-empty-inline">
            No lessons in this range yet. Teachers add them from their Lessons screen
            once students are assigned by the Dean.
          </div>
        ) : (
          [...filtered]
            .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))
            .map(l => <LessonDirectorRow key={l.id} lesson={l} studentName={studentsById[l.studentId]?.name} />)
        )}
      </div>
    </div>
  );
}

function LessonDirectorRow({ lesson, studentName }: { lesson: Lesson; studentName?: string }) {
  return (
    <div className="dir-ens-row">
      <span className="dir-ens-swatch" style={{ background: lesson.conflict ? 'var(--dir-danger)' : 'var(--dir-lesson)' }} />
      <div className="dir-ens-info">
        <div className="dir-ens-name">
          <GraduationCap size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
          {studentName ?? lesson.studentId}
          {lesson.instrument ? ` · ${lesson.instrument}` : ''}
          {lesson.status === 'Cancelled' && <span className="dir-status-badge absent" style={{ marginLeft: 8 }}>Cancelled</span>}
          {lesson.grade ? <span className="dir-status-badge" style={{ marginLeft: 8 }}>Grade {lesson.grade}</span> : null}
        </div>
        <div className="dir-ens-sub">
          {parseDate(lesson.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          {' · '}{formatTimeRange(lesson.startTime, lesson.endTime)}
          {' · '}{lesson.teacherName || lesson.teacherEmail}
          {lesson.location ? ` · ${lesson.location}` : ''}
        </div>
        {lesson.notes && <div className="dir-ens-sub">{lesson.notes}</div>}
        {lesson.conflict && (
          <div className="dir-ens-sub" style={{ color: 'var(--dir-danger)' }}>
            Pull-out: {lesson.conflict.eventLabel}
          </div>
        )}
      </div>
    </div>
  );
}
