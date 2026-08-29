import { useMemo, useState } from 'react';
import { Download, GraduationCap } from 'lucide-react';
import { useLessons } from '../hooks/useLessons';
import { useStudents } from '../hooks/useStudents';
import { useDirectors } from '../hooks/useDirectors';
import { parseDate, formatTimeRange, todayStr } from '../utils';
import { downloadLessonsCsv } from './lessonsCsv';
import { LessonsFeedPanel, LESSONS_FEED_ENABLED } from './LessonsFeedPanel';
import type { Lesson } from '../types';
import type { DirNavigate } from '../types-nav';

/**
 * Director view of all private lessons (applied-teacher self-reports),
 * including the grade each teacher gave. CSV is the handoff for Dean grade
 * and payment tracking.
 */
export function LessonsView({ onNavigate }: { onNavigate?: DirNavigate } = {}) {
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
          Applied teachers fill the High School Lesson Log for each student
          (grade, repertoire, technique, teacher and student initials). Export
          is the Dean spreadsheet: who taught whom, when, mark, initials,
          repertoire, and payroll length.
        </p>

        {/* The private lessons calendar is on hold — see the note at the top
            of LessonsFeedPanel.tsx. Offering the link while the generator
            refuses to build it would hand out a URL that never resolves. */}
        {LESSONS_FEED_ENABLED && <LessonsFeedPanel />}

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
            <span className="dir-label">Applied teacher</span>
            <select className="dir-input" value={teacherFilter} onChange={e => setTeacherFilter(e.target.value)}>
              <option value="">All applied teachers</option>
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
            No lessons in this range yet. Applied teachers add them from their Lesson
            Log once students are assigned by the Dean.
          </div>
        ) : (
          [...filtered]
            .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))
            .map(l => <LessonDirectorRow key={l.id} lesson={l} studentName={studentsById[l.studentId]?.name} onNavigate={onNavigate} />)
        )}
      </div>
    </div>
  );
}

/** One logged lesson. Tapping it opens the student it belongs to. */
function LessonDirectorRow({ lesson, studentName, onNavigate }: {
  lesson: Lesson;
  studentName?: string;
  onNavigate?: DirNavigate;
}) {
  return (
    <button
      type="button"
      className="dir-ens-row dir-sc-pick"
      disabled={!onNavigate}
      onClick={() => onNavigate?.('roster', { studentId: lesson.studentId })}
    >
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
          {lesson.payrollMinutes ? ` · ${lesson.payrollMinutes} min` : ''}
          {lesson.location ? ` · ${lesson.location}` : ''}
        </div>
        {(lesson.repertoireComposer || lesson.repertoireTitle) && (
          <div className="dir-ens-sub">
            {[lesson.repertoireComposer, lesson.repertoireTitle].filter(Boolean).join(', ')}
          </div>
        )}
        {lesson.gradeNote && <div className="dir-ens-sub">{lesson.gradeNote}</div>}
        {(lesson.teacherInitials || lesson.studentInitials) && (
          <div className="dir-ens-sub">
            {lesson.teacherInitials ? `T: ${lesson.teacherInitials}` : ''}
            {lesson.teacherInitials && lesson.studentInitials ? ' · ' : ''}
            {lesson.studentInitials ? `S: ${lesson.studentInitials}` : ''}
          </div>
        )}
        {lesson.notes && <div className="dir-ens-sub">{lesson.notes}</div>}
        {lesson.conflict && (
          <div className="dir-ens-sub" style={{ color: 'var(--dir-danger)' }}>
            Pull-out: {lesson.conflict.eventLabel}
          </div>
        )}
      </div>
    </button>
  );
}
