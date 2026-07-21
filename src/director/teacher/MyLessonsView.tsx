import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { Plus, Trash2, Pencil, MapPin, AlertTriangle, Search } from 'lucide-react';
import { db } from '../firebase';
import { useCurrentDirector } from '../currentDirector';
import { useMyDirector, directorEmailId } from '../hooks/useDirectors';
import { useStudents } from '../hooks/useStudents';
import { useEvents } from '../hooks/useEvents';
import { useEnsembles } from '../hooks/useEnsembles';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { useLessons } from '../hooks/useLessons';
import { findLessonConflicts } from '../lessonConflicts';
import { todayStr, parseDate, formatTimeRange } from '../utils';
import type { Lesson, Student } from '../types';

// Stable reference so `director?.assignedStudentIds ?? EMPTY_IDS` doesn't
// hand useMemo a fresh [] literal every render (which would defeat memoizing).
const EMPTY_IDS: string[] = [];

/**
 * The Teacher's entire world (#roles): who they're assigned to teach, and
 * the private lessons they've scheduled for those students. A Teacher can
 * adjust their own assigned-student list (firestore.rules allows a director
 * to self-edit ONLY that field), but every other collection in the Hub stays
 * out of reach.
 */
export function MyLessonsView() {
  const me = useCurrentDirector();
  const { director } = useMyDirector(me?.email);
  const { students } = useStudents();
  const { events } = useEvents();
  const { ensembles } = useEnsembles();
  const { overrides, addOverride, deleteOverride } = useRosterOverrides();
  const { lessons, addLesson, updateLesson, deleteLesson } = useLessons();

  const [editingStudents, setEditingStudents] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson | null | 'new'>(null);
  const [confirmDeleteLesson, setConfirmDeleteLesson] = useState<string | null>(null);

  const assignedIds = director?.assignedStudentIds ?? EMPTY_IDS;
  const assignedStudents = useMemo(
    () => students.filter(s => assignedIds.includes(s.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [students, assignedIds],
  );
  const studentsById = useMemo(() => Object.fromEntries(students.map(s => [s.id, s])), [students]);
  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);

  const myLessons = useMemo(
    () => (me ? lessons.filter(l => l.teacherEmail === directorEmailId(me.email)) : [])
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    [lessons, me],
  );
  const today = todayStr();
  const upcoming = myLessons.filter(l => l.date >= today);
  const past = myLessons.filter(l => l.date < today);

  async function saveAssignedStudents(ids: string[]) {
    if (!db || !me) return;
    await updateDoc(doc(db, 'directors', directorEmailId(me.email)), { assignedStudentIds: ids });
  }

  /** Save a lesson (new or edit) and keep its linked pull-out override in
   *  sync: delete the old one (if any), create a fresh one iff the teacher
   *  just acknowledged a conflict. Simpler than diffing/updating in place. */
  async function saveLesson(data: Omit<Lesson, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy' | 'overrideId'>, existing: Lesson | null) {
    // Clear any previously-linked override up front — updateLesson's typed
    // payload can't carry a FieldValue, so this uses updateDoc directly.
    if (existing?.overrideId) {
      await deleteOverride(existing.overrideId);
      if (db) await updateDoc(doc(db, 'lessons', existing.id), { overrideId: deleteField() });
    }

    let lessonId: string | undefined;
    if (existing) {
      await updateLesson(existing.id, data);
      lessonId = existing.id;
    } else {
      lessonId = await addLesson(data);
    }
    if (!lessonId) return;

    if (data.conflict) {
      const overrideId = await addOverride({
        studentId: data.studentId,
        ensembleId: data.conflict.ensembleId,
        action: 'remove',
        scope: 'range',
        startDate: data.date,
        endDate: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
        kind: 'lesson',
        reason: `Lesson — ${me?.name ?? 'Teacher'}`,
      });
      if (overrideId) await updateLesson(lessonId, { overrideId });
    }
  }

  async function handleDeleteLesson(l: Lesson) {
    if (l.overrideId) await deleteOverride(l.overrideId);
    await deleteLesson(l.id);
    setConfirmDeleteLesson(null);
  }

  if (!me) return null;

  return (
    <div className="dir-tab-page">
      {/* My students */}
      <div className="dir-form-section-label" style={{ marginTop: 8 }}>My students ({assignedStudents.length})</div>
      {assignedStudents.length === 0 ? (
        <div className="dir-empty-inline">
          No students assigned to you yet. Ask the Owner to assign students from the Directors screen, or add them yourself below.
        </div>
      ) : (
        <div className="dir-checkbox-group" style={{ padding: '0 16px 4px' }}>
          {assignedStudents.map(s => (
            <span key={s.id} className="dir-checkbox-tag checked" style={{ cursor: 'default' }}>
              {s.name}{s.instrument ? ` — ${s.instrument}` : ''}
            </span>
          ))}
        </div>
      )}
      <div style={{ padding: '4px 16px 14px' }}>
        <button className="dir-tool-btn" onClick={() => setEditingStudents(true)}>
          <Pencil size={13} /> Adjust my students
        </button>
      </div>

      {/* My lessons */}
      <div className="dir-form-section-label">Upcoming lessons ({upcoming.length})</div>
      {upcoming.length === 0 ? (
        <div className="dir-empty-inline">No lessons scheduled. Tap “New lesson” to add one.</div>
      ) : (
        upcoming.map(l => (
          <LessonRow
            key={l.id}
            lesson={l}
            student={studentsById[l.studentId]}
            confirming={confirmDeleteLesson === l.id}
            onEdit={() => setEditingLesson(l)}
            onDeleteRequest={() => setConfirmDeleteLesson(l.id)}
            onDeleteCancel={() => setConfirmDeleteLesson(null)}
            onDeleteConfirm={() => handleDeleteLesson(l)}
          />
        ))
      )}

      {past.length > 0 && (
        <>
          <div className="dir-form-section-label">Past lessons</div>
          {past.slice(-10).reverse().map(l => (
            <LessonRow
              key={l.id}
              lesson={l}
              student={studentsById[l.studentId]}
              confirming={confirmDeleteLesson === l.id}
              onEdit={() => setEditingLesson(l)}
              onDeleteRequest={() => setConfirmDeleteLesson(l.id)}
              onDeleteCancel={() => setConfirmDeleteLesson(null)}
              onDeleteConfirm={() => handleDeleteLesson(l)}
            />
          ))}
        </>
      )}

      <button className="dir-fab" onClick={() => setEditingLesson('new')} aria-label="New lesson">
        <Plus size={22} />
      </button>

      {editingStudents && (
        <StudentAssignEditor
          allStudents={students}
          assignedIds={assignedIds}
          onSave={async ids => { await saveAssignedStudents(ids); setEditingStudents(false); }}
          onClose={() => setEditingStudents(false)}
        />
      )}

      {editingLesson !== null && (
        <LessonForm
          lesson={editingLesson === 'new' ? null : editingLesson}
          teacherEmail={directorEmailId(me.email)}
          teacherName={me.name}
          assignedStudents={assignedStudents}
          events={events}
          students={students}
          overrides={overrides}
          ensembleMap={ensembleMap}
          onSave={async data => { await saveLesson(data, editingLesson === 'new' ? null : editingLesson); setEditingLesson(null); }}
          onClose={() => setEditingLesson(null)}
        />
      )}
    </div>
  );
}

function LessonRow({ lesson, student, confirming, onEdit, onDeleteRequest, onDeleteCancel, onDeleteConfirm }: {
  lesson: Lesson;
  student?: Student;
  confirming: boolean;
  onEdit: () => void;
  onDeleteRequest: () => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: () => void;
}) {
  return (
    <div className="dir-ens-row">
      <span className="dir-ens-swatch" style={{ background: lesson.conflict ? 'var(--dir-danger)' : 'var(--dir-primary, #2563eb)' }} />
      <div className="dir-ens-info">
        <div className="dir-ens-name">
          {student?.name ?? 'Unknown student'}
          {lesson.status === 'Cancelled' && <span className="dir-status-badge absent" style={{ marginLeft: 8 }}>Cancelled</span>}
        </div>
        <div className="dir-ens-sub">
          {parseDate(lesson.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {formatTimeRange(lesson.startTime, lesson.endTime)}
          {lesson.location ? ` · ${lesson.location}` : ''}
        </div>
        {lesson.conflict && (
          <div className="dir-ens-sub" style={{ color: 'var(--dir-danger)' }}>
            <AlertTriangle size={11} style={{ verticalAlign: '-1px' }} /> Conflicts with {lesson.conflict.eventLabel} — confirmed
          </div>
        )}
      </div>
      {confirming ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="dir-btn dir-btn-danger dir-sc-small" onClick={onDeleteConfirm}>Delete</button>
          <button className="dir-btn dir-btn-ghost dir-sc-small" onClick={onDeleteCancel}>Cancel</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button className="dir-icon-btn" onClick={onEdit} aria-label="Edit lesson"><Pencil size={15} /></button>
          <button className="dir-icon-btn" onClick={onDeleteRequest} aria-label="Delete lesson"><Trash2 size={15} /></button>
        </div>
      )}
    </div>
  );
}

/** Self-service "students assigned to me" editor — search + checkbox list
 *  over the full active roster, same interaction as the Owner's version in
 *  DirectorsManager but writing only this teacher's own doc. */
function StudentAssignEditor({ allStudents, assignedIds, onSave, onClose }: {
  allStudents: Student[];
  assignedIds: string[];
  onSave: (ids: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [ids, setIds] = useState(assignedIds);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const active = useMemo(() => allStudents.filter(s => s.status === 'Active').sort((a, b) => a.name.localeCompare(b.name)), [allStudents]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return active;
    return active.filter(s => s.name.toLowerCase().includes(q) || s.instrument?.toLowerCase().includes(q));
  }, [active, query]);

  function toggle(id: string) {
    setIds(cur => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">My students</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-sc-search">
            <Search size={16} />
            <input className="dir-sc-search-input" placeholder="Search students…" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <div className="dir-checkbox-group" style={{ marginTop: 8 }}>
            {filtered.map(s => (
              <label key={s.id} className={`dir-checkbox-tag ${ids.includes(s.id) ? 'checked' : ''}`}>
                <input type="checkbox" checked={ids.includes(s.id)} onChange={() => toggle(s.id)} />
                {s.name}{s.instrument ? ` — ${s.instrument}` : ''}
              </label>
            ))}
            {filtered.length === 0 && <div className="dir-loc-empty">No students match.</div>}
          </div>
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="dir-btn dir-btn-primary" disabled={saving} onClick={async () => { setSaving(true); await onSave(ids); }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LessonForm({
  lesson, teacherEmail, teacherName, assignedStudents, events, students, overrides, ensembleMap, onSave, onClose,
}: {
  lesson: Lesson | null;
  teacherEmail: string;
  teacherName: string;
  assignedStudents: Student[];
  events: import('../types').CalendarEvent[];
  students: Student[];
  overrides: import('../types').RosterOverride[];
  ensembleMap: Record<string, import('../types').Ensemble>;
  onSave: (data: Omit<Lesson, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy' | 'overrideId'>) => Promise<void>;
  onClose: () => void;
}) {
  const [studentId, setStudentId] = useState(lesson?.studentId ?? assignedStudents[0]?.id ?? '');
  const [date, setDate] = useState(lesson?.date ?? todayStr());
  const [startTime, setStartTime] = useState(lesson?.startTime ?? '15:00');
  const [endTime, setEndTime] = useState(lesson?.endTime ?? '15:30');
  const [location, setLocation] = useState(lesson?.location ?? '');
  const [notes, setNotes] = useState(lesson?.notes ?? '');
  // A previously-acknowledged conflict starts pre-checked (re-opening an
  // unchanged lesson shouldn't re-block on the same conflict); ANY change to
  // a field that affects conflict detection resets the ack, since it may now
  // be a different conflict (or none, or a new one) — see the effect below.
  const [ackConflict, setAckConflict] = useState(!!lesson?.conflict);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const conflicts = useMemo(
    () => findLessonConflicts(studentId, date, startTime, endTime, events, students, overrides),
    [studentId, date, startTime, endTime, events, students, overrides],
  );

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setAckConflict(false);
  }, [studentId, date, startTime, endTime]);

  const student = assignedStudents.find(s => s.id === studentId) ?? students.find(s => s.id === studentId);
  const hasConflict = conflicts.length > 0;
  const validTimes = !!startTime && !!endTime && endTime > startTime;
  const canSave = !!studentId && !!date && validTimes && (!hasConflict || ackConflict);

  async function handleSave() {
    setError('');
    if (!validTimes) { setError('End time must be after the start time.'); return; }
    setSaving(true);
    try {
      const primary = conflicts[0];
      await onSave({
        teacherEmail, teacherName, studentId, date, startTime, endTime,
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
        status: lesson?.status ?? 'Scheduled',
        conflict: hasConflict && ackConflict && primary ? {
          eventId: primary.event.id,
          ensembleId: primary.ensembleId,
          eventLabel: `${ensembleMap[primary.ensembleId]?.name ?? primary.event.type} (${formatTimeRange(primary.event.startTime, primary.event.endTime)})`,
          acknowledgedAt: Date.now(),
          acknowledgedBy: teacherName,
        } : undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save — try again.');
      setSaving(false);
    }
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">{lesson ? 'Edit lesson' : 'New lesson'}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          {assignedStudents.length === 0 ? (
            <div className="dir-sc-error">No students are assigned to you yet — ask the Owner to assign some first.</div>
          ) : (
            <div className="dir-field">
              <label className="dir-label">Student</label>
              <select className="dir-select" value={studentId} onChange={e => setStudentId(e.target.value)}>
                {assignedStudents.map(s => <option key={s.id} value={s.id}>{s.name}{s.instrument ? ` — ${s.instrument}` : ''}</option>)}
              </select>
            </div>
          )}

          <div className="dir-field">
            <label className="dir-label">Date</label>
            <input className="dir-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">Starts</label>
              <input className="dir-input" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="dir-field">
              <label className="dir-label">Ends</label>
              <input className="dir-input" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
          <div className="dir-field">
            <label className="dir-label"><MapPin size={12} /> Location</label>
            <input className="dir-input" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Practice Room 3" />
          </div>
          <div className="dir-field">
            <label className="dir-label">Notes</label>
            <input className="dir-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
          </div>

          {hasConflict && (
            <div className="dir-conflict-banner">
              ⚠ <strong>Scheduling conflict</strong> — {student?.name ?? 'This student'} is expected at{' '}
              {conflicts.map((c, i) => (
                <span key={c.event.id}>
                  {i > 0 && ', '}
                  <strong>{ensembleMap[c.ensembleId]?.name ?? c.event.type}</strong> ({formatTimeRange(c.event.startTime, c.event.endTime)})
                </span>
              ))}{' '}
              during this lesson time.
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10, fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={ackConflict}
                  onChange={e => setAckConflict(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                I have confirmed with the classroom teacher or ensemble director that {student?.name ?? 'the student'} will miss this time.
              </label>
              {ackConflict && (
                <div style={{ marginTop: 8, fontWeight: 400 }}>
                  Reminder: {student?.name ?? 'the student'} is still expected in rehearsal up to and directly after
                  the lesson time. Tardiness and attendance will apply as needed if that doesn't happen.
                </div>
              )}
            </div>
          )}

          {error && <div className="dir-sc-error">⚠ {error}</div>}
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="dir-btn dir-btn-primary" onClick={handleSave} disabled={saving || !canSave}>
            {saving ? 'Saving…' : 'Save lesson'}
          </button>
        </div>
      </div>
    </div>
  );
}
