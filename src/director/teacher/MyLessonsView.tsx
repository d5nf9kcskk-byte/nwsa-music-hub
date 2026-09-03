import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { Plus, Trash2, Pencil, MapPin, AlertTriangle, Search, ChevronLeft, Mail } from 'lucide-react';
import { db } from '../firebase';
import { useCurrentDirector } from '../currentDirector';
import { useMyDirector, directorEmailId } from '../hooks/useDirectors';
import { useStudents } from '../hooks/useStudents';
import { useEvents } from '../hooks/useEvents';
import { useEnsembles } from '../hooks/useEnsembles';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { useLessons } from '../hooks/useLessons';
import { findLessonConflicts } from '../lessonConflicts';
import { LESSON_MARKS, gradeSummary, isLessonMark, needsGrade } from '../lessonGrades';
import {
  defaultPayrollMinutes,
  defaultTimesForPayroll,
  initialsOk,
  isLogCompleteForMail,
  lessonLengthLabel,
  logMaterialChanged,
  repertoireLine,
  schoolYearLabel,
  suggestTeacherInitials,
  type PayrollMinutes,
} from '../lessonLog';
import {
  lessonPayloadsFor, pendingSlotDates, schoolYearEnd, slotSentence, WEEKDAY_OPTIONS, type LessonSlot,
} from '../lessonSchedule';
import { enqueueLessonLogMail } from '../lessonLogMail';
import { todayStr, parseDate, formatTimeRange } from '../utils';
import type { Lesson, Student } from '../types';
import { studentMatchesQuery } from '../studentSearch';
import { whenQueued } from '../writeStatus';

const EMPTY_IDS: string[] = [];

type LessonPayload = Omit<Lesson, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy' | 'overrideId'>;

/**
 * Applied Teacher world (#roles, #applied): per-student High School Lesson
 * Log sheets. Prior rows stay visible; add a line, hand the phone to the
 * student for initials, then family email is queued.
 */
export function MyLessonsView() {
  const me = useCurrentDirector();
  const { director } = useMyDirector(me?.email);
  const { students } = useStudents();
  const { events } = useEvents();
  const { ensembles } = useEnsembles();
  const { overrides, addOverride, deleteOverride } = useRosterOverrides();
  const { lessons, addLesson, updateLesson, deleteLesson, syncLessonMirror } = useLessons();

  const [editingStudents, setEditingStudents] = useState(false);
  const [sheetStudentId, setSheetStudentId] = useState<string | null>(null);
  const [editingLesson, setEditingLesson] = useState<Lesson | null | 'new'>(null);
  const [editingSlot, setEditingSlot] = useState(false);
  const [slotBusy, setSlotBusy] = useState(false);
  const [slotAdded, setSlotAdded] = useState<{ count: number; conflicts: number } | null>(null);
  const [confirmDeleteLesson, setConfirmDeleteLesson] = useState<string | null>(null);
  const [mailBanner, setMailBanner] = useState<{ queued: boolean; mailto: string | null; name: string } | null>(null);

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
  const ungraded = myLessons.filter(l => needsGrade(l, today));
  const needsInitial = myLessons.filter(l =>
    l.status !== 'Cancelled' && isLessonMark(l.grade) && !initialsOk(l.studentInitials) && l.date <= today,
  );

  const summaries = Object.fromEntries(
    assignedStudents.map(s => [s.id, gradeSummary(myLessons.filter(l => l.studentId === s.id), today)]),
  );

  const sheetStudent = sheetStudentId ? studentsById[sheetStudentId] : undefined;
  const sheetLessons = useMemo(
    () => (sheetStudentId ? myLessons.filter(l => l.studentId === sheetStudentId) : []),
    [myLessons, sheetStudentId],
  );

  async function saveAssignedStudents(ids: string[]) {
    if (!db || !me) return;
    await updateDoc(doc(db, 'directors', directorEmailId(me.email)), { assignedStudentIds: ids });
  }

  /** The standing weekly time for one student — stored on my own director doc
   *  beside the assignment it qualifies (#applied). `null` removes it. */
  async function saveSlot(studentId: string, slot: LessonSlot | null) {
    if (!db || !me) return;
    const next = { ...(director?.lessonSlots ?? {}) };
    if (slot) next[studentId] = slot; else delete next[studentId];
    await updateDoc(doc(db, 'directors', directorEmailId(me.email)), { lessonSlots: next });
  }

  /**
   * Turn the standing time into real lessons through the end of the school
   * year. Dates that already have a lesson are skipped, cancelled ones
   * included — see pendingSlotDates().
   *
   * ponytail: generates every matching weekday, holidays and breaks included.
   * The teacher cancels the handful that don't happen. Skipping no-school days
   * would mean the app knowing the district calendar, which it doesn't.
   */
  async function generateFromSlot(student: Student, slot: LessonSlot) {
    if (!me) return;
    setSlotBusy(true);
    try {
      const mine = myLessons.filter(l => l.studentId === student.id);
      const payloads = lessonPayloadsFor(
        slot, student,
        { email: directorEmailId(me.email), name: me.name },
        mine, today, schoolYearEnd(today),
      );
      let conflicts = 0;
      for (const payload of payloads) {
        conflicts += findLessonConflicts(
          student.id, payload.date, slot.startTime, slot.endTime, events, students, overrides,
        ).length > 0 ? 1 : 0;
        await addLesson(payload);
      }
      setSlotAdded({ count: payloads.length, conflicts });
    } finally {
      setSlotBusy(false);
    }
  }

  async function saveLesson(data: LessonPayload, existing: Lesson | null) {
    if (existing?.overrideId) {
      await deleteOverride(existing.overrideId);
      if (db) await updateDoc(doc(db, 'lessons', existing.id), { overrideId: deleteField() });
    }

    let lessonId: string | undefined;
    if (existing) {
      await updateLesson(existing.id, data);
      const cleared: Record<string, unknown> = {};
      if (!data.grade && existing.grade) cleared.grade = deleteField();
      if (!data.gradeNote && existing.gradeNote) cleared.gradeNote = deleteField();
      if (!data.repertoireComposer && existing.repertoireComposer) cleared.repertoireComposer = deleteField();
      if (!data.repertoireTitle && existing.repertoireTitle) cleared.repertoireTitle = deleteField();
      if (!data.teacherInitials && existing.teacherInitials) cleared.teacherInitials = deleteField();
      if (!data.studentInitials && existing.studentInitials) {
        cleared.studentInitials = deleteField();
        cleared.studentInitialedAt = deleteField();
      }
      if (!data.notes && existing.notes) cleared.notes = deleteField();
      if (!data.location && existing.location) cleared.location = deleteField();
      if (db && Object.keys(cleared).length > 0) {
        await updateDoc(doc(db, 'lessons', existing.id), cleared);
        // A cleared `location` cannot be expressed by the merge in
        // updateLesson — rebuild the public mirror from the doc itself.
        await syncLessonMirror(existing.id);
      }
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

    const saved: Lesson = {
      ...data,
      id: lessonId,
      createdAt: existing?.createdAt ?? Date.now(),
      overrideId: existing?.overrideId,
    };
    if (isLogCompleteForMail(saved)) {
      const result = await enqueueLessonLogMail(saved, studentsById[saved.studentId]);
      setMailBanner({
        queued: result.queued,
        mailto: result.mailto,
        name: studentsById[saved.studentId]?.name ?? 'the student',
      });
    }
  }

  async function handleDeleteLesson(l: Lesson) {
    if (l.overrideId) await deleteOverride(l.overrideId);
    await deleteLesson(l.id);
    setConfirmDeleteLesson(null);
  }

  if (!me) return null;

  // ── Per-student log sheet ──────────────────────────────────────────
  if (sheetStudentId && sheetStudent) {
    const g = summaries[sheetStudent.id];
    const payrollDefault = defaultPayrollMinutes(sheetStudent.grade);
    return (
      <div className="dir-tab-page">
        <div style={{ padding: '8px 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="dir-tool-btn" onClick={() => { setSheetStudentId(null); setEditingLesson(null); }}>
            <ChevronLeft size={14} /> All students
          </button>
        </div>

        <div className="dir-form-section-label" style={{ marginTop: 4 }}>
          {sheetStudent.name}
          {sheetStudent.instrument ? ` · ${sheetStudent.instrument}` : ''}
        </div>
        <div className="dir-page-hint" style={{ marginTop: 0 }}>
          Grade {sheetStudent.grade ?? '—'} · {lessonLengthLabel(sheetStudent.grade)} ·{' '}
          {schoolYearLabel(today)}
          {g ? ` · Term ${g.letter} (${g.average.toFixed(2)}, ${g.graded} of ${g.gradable})` : ' · not graded yet'}
        </div>

        {mailBanner && (
          <MailBanner banner={mailBanner} onDismiss={() => setMailBanner(null)} />
        )}

        <WeeklySlotPanel
          student={sheetStudent}
          slot={director?.lessonSlots?.[sheetStudent.id]}
          lessons={sheetLessons}
          today={today}
          busy={slotBusy}
          added={slotAdded}
          editing={editingSlot}
          onEdit={() => { setSlotAdded(null); setEditingSlot(true); }}
          onCancelEdit={() => setEditingSlot(false)}
          onSave={async slot => { await saveSlot(sheetStudent.id, slot); setEditingSlot(false); }}
          onGenerate={slot => generateFromSlot(sheetStudent, slot)}
          onDismissAdded={() => setSlotAdded(null)}
        />

        <div className="dir-form-section-label">Lesson log ({sheetLessons.filter(l => l.status !== 'Cancelled').length})</div>
        {sheetLessons.length === 0 ? (
          <div className="dir-empty-inline">No lessons logged yet. Tap “Add lesson” after you teach.</div>
        ) : (
          sheetLessons.map((l, i) => (
            <LogRow
              key={l.id}
              index={i + 1}
              lesson={l}
              today={today}
              confirming={confirmDeleteLesson === l.id}
              onEdit={() => setEditingLesson(l)}
              onDeleteRequest={() => setConfirmDeleteLesson(l.id)}
              onDeleteCancel={() => setConfirmDeleteLesson(null)}
              onDeleteConfirm={() => handleDeleteLesson(l)}
            />
          ))
        )}

        <div style={{ padding: '12px 16px 80px' }}>
          <button
            className="dir-btn dir-btn-primary"
            onClick={() => setEditingLesson('new')}
            disabled={assignedStudents.length === 0}
          >
            <Plus size={14} /> Add lesson
          </button>
        </div>

        {editingLesson !== null && (
          <LessonLogForm
            lesson={editingLesson === 'new' ? null : editingLesson}
            lockedStudentId={sheetStudent.id}
            teacherEmail={directorEmailId(me.email)}
            teacherName={me.name}
            assignedStudents={assignedStudents}
            priorLessons={sheetLessons}
            defaultPayroll={payrollDefault}
            events={events}
            students={students}
            overrides={overrides}
            ensembleMap={ensembleMap}
            onSave={async data => {
              await saveLesson(data, editingLesson === 'new' ? null : editingLesson);
              setEditingLesson(null);
            }}
            onClose={() => setEditingLesson(null)}
          />
        )}
      </div>
    );
  }

  // ── Student list ───────────────────────────────────────────────────
  return (
    <div className="dir-tab-page">
      <div className="dir-page-hint" style={{ marginTop: 4 }}>
        Open a student to see their lesson log. After each lesson, add a line,
        fill the grade and comments, then have the student type their initials
        on this device. A summary email is queued for the family when the line
        is complete.
      </div>

      {mailBanner && (
        <MailBanner banner={mailBanner} onDismiss={() => setMailBanner(null)} />
      )}

      {(ungraded.length > 0 || needsInitial.length > 0) && (
        <div className="dir-page-hint" style={{ marginTop: 4 }}>
          {ungraded.length > 0 && (
            <span>{ungraded.length} lesson{ungraded.length === 1 ? '' : 's'} still need a grade. </span>
          )}
          {needsInitial.length > 0 && (
            <span>{needsInitial.length} graded lesson{needsInitial.length === 1 ? '' : 's'} still need student initials.</span>
          )}
        </div>
      )}

      <div className="dir-form-section-label" style={{ marginTop: 8 }}>My students ({assignedStudents.length})</div>
      {assignedStudents.length === 0 ? (
        <div className="dir-empty-inline">
          No students assigned to you yet. The Dean sets teacher–student assignments;
          once those are in the Hub, they will show here. You can also adjust your list below if needed.
        </div>
      ) : (
        assignedStudents.map(s => {
          const g = summaries[s.id];
          const count = myLessons.filter(l => l.studentId === s.id && l.status !== 'Cancelled').length;
          const pending = myLessons.filter(l =>
            l.studentId === s.id && (
              needsGrade(l, today)
              || (isLessonMark(l.grade) && !initialsOk(l.studentInitials) && l.date <= today)
            ),
          ).length;
          return (
            <button
              key={s.id}
              type="button"
              className="dir-ens-row"
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', background: 'transparent' }}
              onClick={() => setSheetStudentId(s.id)}
            >
              <span className="dir-ens-swatch" style={{ background: 'var(--dir-primary, #2563eb)' }} />
              <div className="dir-ens-info">
                <div className="dir-ens-name">
                  {s.name}{s.instrument ? ` · ${s.instrument}` : ''}
                  {pending > 0 && (
                    <span className="dir-status-badge absent" style={{ marginLeft: 8 }}>
                      {pending} to finish
                    </span>
                  )}
                </div>
                <div className="dir-ens-sub">
                  Grade {s.grade ?? '—'} · {count} lesson{count === 1 ? '' : 's'}
                  {g ? ` · Term ${g.letter} (${g.average.toFixed(2)})` : ' · not graded yet'}
                </div>
              </div>
            </button>
          );
        })
      )}
      <div style={{ padding: '4px 16px 14px' }}>
        <button className="dir-tool-btn" onClick={() => setEditingStudents(true)}>
          <Pencil size={13} /> Adjust my students
        </button>
      </div>

      {editingStudents && (
        <StudentAssignEditor
          allStudents={students}
          assignedIds={assignedIds}
          onSave={async ids => { await saveAssignedStudents(ids); setEditingStudents(false); }}
          onClose={() => setEditingStudents(false)}
        />
      )}
    </div>
  );
}

/**
 * The standing weekly lesson time (#applied).
 *
 * Deliberately a SENTENCE and at most two buttons, not a scheduler: the whole
 * point is that a teacher who meets a student every Friday at 2 says so once
 * instead of typing thirty dates. Reads as "Fridays, 2:00 PM – 2:45 PM ·
 * Room 214" with one action — put those on the calendar — and never
 * enumerates the dates it is about to create.
 */
function WeeklySlotPanel({
  student, slot, lessons, today, busy, added, editing,
  onEdit, onCancelEdit, onSave, onGenerate, onDismissAdded,
}: {
  student: Student;
  slot?: LessonSlot;
  lessons: Lesson[];
  today: string;
  busy: boolean;
  added: { count: number; conflicts: number } | null;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (slot: LessonSlot | null) => Promise<void>;
  onGenerate: (slot: LessonSlot) => void;
  onDismissAdded: () => void;
}) {
  const through = schoolYearEnd(today);
  const pending = slot ? pendingSlotDates(slot, lessons, today, through) : [];
  const throughLabel = parseDate(through).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  if (editing) {
    return <SlotEditor student={student} slot={slot} onSave={onSave} onCancel={onCancelEdit} />;
  }

  return (
    <>
      <div className="dir-form-section-label">Weekly lesson time</div>
      <div className="dir-page-hint" style={{ marginTop: 0 }}>
        {slot
          ? <>{slotSentence(slot)}. </>
          : <>No standing time set. Set one and the Hub puts every week on {student.name}’s calendar and yours. </>}
        <button className="dir-tool-btn" onClick={onEdit} style={{ marginLeft: 4 }}>
          {slot ? 'Change' : 'Set weekly time'}
        </button>
      </div>

      {slot && pending.length > 0 && (
        <div style={{ padding: '0 16px 8px' }}>
          <button className="dir-btn dir-btn-primary" disabled={busy} onClick={() => onGenerate(slot)}>
            <Plus size={14} />{' '}
            {busy
              ? 'Adding…'
              : `Add the remaining ${pending.length} through ${throughLabel}`}
          </button>
        </div>
      )}
      {slot && pending.length === 0 && !added && (
        <div className="dir-page-hint" style={{ marginTop: 0 }}>
          Every week through {throughLabel} is already on the calendar.
        </div>
      )}

      {added && (
        <div className="dir-page-hint" style={{ marginTop: 0, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span>
            Added {added.count} lesson{added.count === 1 ? '' : 's'}.
            {added.conflicts > 0 && (
              <> {added.conflicts} of them overlap a rehearsal or class — open those below to
              confirm the pull-out, which is what tells the ensemble director.</>
            )}
          </span>
          <button className="dir-tool-btn" onClick={onDismissAdded}>Dismiss</button>
        </div>
      )}
    </>
  );
}

/** Three fields: which day, what time, which room. Nothing else is a slot. */
function SlotEditor({ student, slot, onSave, onCancel }: {
  student: Student;
  slot?: LessonSlot;
  onSave: (slot: LessonSlot | null) => Promise<void>;
  onCancel: () => void;
}) {
  const fallback = defaultTimesForPayroll(defaultPayrollMinutes(student.grade));
  const [weekday, setWeekday] = useState(slot?.weekday ?? 1);
  const [startTime, setStartTime] = useState(slot?.startTime ?? fallback.startTime);
  const [endTime, setEndTime] = useState(slot?.endTime ?? fallback.endTime);
  const [location, setLocation] = useState(slot?.location ?? '');
  const [saving, setSaving] = useState(false);
  const valid = !!startTime && !!endTime && endTime > startTime;

  return (
    <>
      <div className="dir-form-section-label">Weekly lesson time</div>
      <div style={{ padding: '0 16px' }}>
        <div className="dir-field">
          <label className="dir-label">Day</label>
          <select className="dir-select" value={weekday} onChange={e => setWeekday(Number(e.target.value))}>
            {WEEKDAY_OPTIONS.map(d => <option key={d.weekday} value={d.weekday}>{d.label}</option>)}
          </select>
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
        {!valid && <div className="dir-page-hint" style={{ marginTop: 0 }}>The end time has to be after the start.</div>}
        <div className="dir-field">
          <label className="dir-label">Room (optional)</label>
          <input className="dir-input" value={location} onChange={e => setLocation(e.target.value)} placeholder="Room 214" />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '4px 0 12px' }}>
          <button
            className="dir-btn dir-btn-primary"
            disabled={!valid || saving}
            onClick={async () => {
              setSaving(true);
              await onSave({ weekday, startTime, endTime, ...(location.trim() ? { location: location.trim() } : {}) });
            }}
          >
            Save weekly time
          </button>
          <button className="dir-btn dir-btn-ghost" disabled={saving} onClick={onCancel}>Cancel</button>
          {slot && (
            <button
              className="dir-btn dir-btn-danger"
              disabled={saving}
              onClick={async () => { setSaving(true); await onSave(null); }}
            >
              Remove
            </button>
          )}
        </div>
        <div className="dir-page-hint" style={{ marginTop: 0 }}>
          Removing the weekly time leaves lessons already on the calendar alone.
        </div>
      </div>
    </>
  );
}

function MailBanner({ banner, onDismiss }: {
  banner: { queued: boolean; mailto: string | null; name: string };
  onDismiss: () => void;
}) {
  return (
    <div className="dir-page-hint" style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <Mail size={14} />
      <span>
        {banner.queued
          ? `Summary queued for ${banner.name}'s family email.`
          : banner.mailto
            ? `No queued send yet — open Mail to send ${banner.name}'s summary.`
            : `Saved. No family email on file for ${banner.name}.`}
      </span>
      {banner.mailto && (
        <a className="dir-tool-btn" href={banner.mailto}>Open in Mail</a>
      )}
      <button type="button" className="dir-tool-btn" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}

function LogRow({ index, lesson, today, confirming, onEdit, onDeleteRequest, onDeleteCancel, onDeleteConfirm }: {
  index: number;
  lesson: Lesson;
  today: string;
  confirming: boolean;
  onEdit: () => void;
  onDeleteRequest: () => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: () => void;
}) {
  const rep = repertoireLine(lesson);
  return (
    <div className="dir-ens-row">
      <span className="dir-ens-swatch" style={{ background: lesson.conflict ? 'var(--dir-danger)' : 'var(--dir-primary, #2563eb)' }} />
      <div className="dir-ens-info">
        <div className="dir-ens-name">
          #{index} · {parseDate(lesson.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          {lesson.status === 'Cancelled' && <span className="dir-status-badge absent" style={{ marginLeft: 8 }}>Cancelled</span>}
          {isLessonMark(lesson.grade) && <span className="dir-status-badge" style={{ marginLeft: 8 }}>Grade {lesson.grade}</span>}
          {needsGrade(lesson, today) && <span className="dir-status-badge absent" style={{ marginLeft: 8 }}>Needs a grade</span>}
          {isLessonMark(lesson.grade) && !initialsOk(lesson.studentInitials) && lesson.date <= today && (
            <span className="dir-status-badge absent" style={{ marginLeft: 8 }}>Needs initials</span>
          )}
        </div>
        <div className="dir-ens-sub">
          {formatTimeRange(lesson.startTime, lesson.endTime)}
          {lesson.payrollMinutes ? ` · ${lesson.payrollMinutes} min` : ''}
          {lesson.teacherInitials ? ` · T: ${lesson.teacherInitials}` : ''}
          {lesson.studentInitials ? ` · S: ${lesson.studentInitials}` : ''}
        </div>
        {rep && <div className="dir-ens-sub">{rep}</div>}
        {lesson.gradeNote && <div className="dir-ens-sub">{lesson.gradeNote}</div>}
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
    const q = query.trim();
    if (!q) return active;
    return active.filter(s => studentMatchesQuery(s, q));
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

/**
 * Two-step log form: teacher fills the official line, then the student types
 * initials on this device. Scheduling (times / location / conflict) lives
 * under “More.”
 */
function LessonLogForm({
  lesson, lockedStudentId, teacherEmail, teacherName, assignedStudents, priorLessons,
  defaultPayroll, events, students, overrides, ensembleMap, onSave, onClose,
}: {
  lesson: Lesson | null;
  lockedStudentId: string;
  teacherEmail: string;
  teacherName: string;
  assignedStudents: Student[];
  priorLessons: Lesson[];
  defaultPayroll: PayrollMinutes;
  events: import('../types').CalendarEvent[];
  students: Student[];
  overrides: import('../types').RosterOverride[];
  ensembleMap: Record<string, import('../types').Ensemble>;
  onSave: (data: LessonPayload) => Promise<void>;
  onClose: () => void;
}) {
  const last = [...priorLessons].filter(l => l.status !== 'Cancelled').at(-1);
  const times0 = lesson
    ? { startTime: lesson.startTime, endTime: lesson.endTime }
    : defaultTimesForPayroll(last?.payrollMinutes ?? defaultPayroll);

  const [date, setDate] = useState(lesson?.date ?? todayStr());
  const [startTime, setStartTime] = useState(times0.startTime);
  const [endTime, setEndTime] = useState(times0.endTime);
  const [location, setLocation] = useState(lesson?.location ?? '');
  const [notes, setNotes] = useState(lesson?.notes ?? '');
  const [grade, setGrade] = useState(isLessonMark(lesson?.grade) ? lesson!.grade! : '');
  const [gradeNote, setGradeNote] = useState(lesson?.gradeNote ?? '');
  const [repertoireComposer, setRepertoireComposer] = useState(lesson?.repertoireComposer ?? '');
  const [repertoireTitle, setRepertoireTitle] = useState(lesson?.repertoireTitle ?? '');
  const [payrollMinutes, setPayrollMinutes] = useState<PayrollMinutes>(
    lesson?.payrollMinutes ?? last?.payrollMinutes ?? defaultPayroll,
  );
  const [teacherInitials, setTeacherInitials] = useState(
    lesson?.teacherInitials ?? last?.teacherInitials ?? suggestTeacherInitials(teacherName),
  );
  const [studentInitials, setStudentInitials] = useState(lesson?.studentInitials ?? '');
  const [step, setStep] = useState<'teacher' | 'student'>(
    lesson && isLessonMark(lesson.grade) && !initialsOk(lesson.studentInitials) ? 'student' : 'teacher',
  );
  const [showMore, setShowMore] = useState(!!(lesson?.location || lesson?.conflict || lesson?.notes));
  const [ackConflict, setAckConflict] = useState(!!lesson?.conflict);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const studentId = lockedStudentId;
  const student = assignedStudents.find(s => s.id === studentId) ?? students.find(s => s.id === studentId);

  const conflicts = useMemo(
    () => findLessonConflicts(studentId, date, startTime, endTime, events, students, overrides),
    [studentId, date, startTime, endTime, events, students, overrides],
  );

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setAckConflict(false);
  }, [studentId, date, startTime, endTime]);

  // Changing payroll updates default end time only for brand-new lessons that
  // still sit on the stock start time.
  useEffect(() => {
    if (lesson) return;
    const next = defaultTimesForPayroll(payrollMinutes);
    setStartTime(next.startTime);
    setEndTime(next.endTime);
  }, [payrollMinutes, lesson]);

  const hasConflict = conflicts.length > 0;
  const validTimes = !!startTime && !!endTime && endTime > startTime;
  const teacherReady = !!studentId && !!date && validTimes && (!hasConflict || ackConflict)
    && isLessonMark(grade) && initialsOk(teacherInitials)
    && !!repertoireComposer.trim() && !!repertoireTitle.trim()
    && !!gradeNote.trim();

  function buildPayload(initials: string, initialedAt?: number): LessonPayload {
    const primary = conflicts[0];
    return {
      teacherEmail,
      teacherName,
      studentId,
      date,
      startTime,
      endTime,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      grade: grade || undefined,
      gradeNote: grade ? gradeNote.trim() || undefined : undefined,
      repertoireComposer: repertoireComposer.trim() || undefined,
      repertoireTitle: repertoireTitle.trim() || undefined,
      teacherInitials: teacherInitials.trim() || undefined,
      studentInitials: initials.trim() || undefined,
      studentInitialedAt: initials.trim() ? (initialedAt ?? Date.now()) : undefined,
      payrollMinutes,
      instrument: student?.instrument,
      status: lesson?.status ?? 'Scheduled',
      conflict: hasConflict && ackConflict && primary ? {
        eventId: primary.event.id,
        ensembleId: primary.ensembleId,
        eventLabel: `${ensembleMap[primary.ensembleId]?.name ?? primary.event.type} (${formatTimeRange(primary.event.startTime, primary.event.endTime)})`,
        acknowledgedAt: Date.now(),
        acknowledgedBy: teacherName,
      } : undefined,
    };
  }

  function goToStudentStep() {
    setError('');
    if (!teacherReady) {
      setError('Fill date, grade, repertoire (composer + title), technique/comments, and your initials first.');
      return;
    }
    if (!validTimes) { setError('End time must be after the start time.'); return; }
    // Material edits void a prior student initial.
    if (lesson && initialsOk(lesson.studentInitials) && logMaterialChanged(lesson, {
      grade, gradeNote, repertoireComposer, repertoireTitle, payrollMinutes,
    })) {
      setStudentInitials('');
    }
    setStep('student');
  }

  async function handleSaveWithInitials() {
    setError('');
    if (!initialsOk(studentInitials)) {
      setError('Student initials must be at least 2 characters.');
      return;
    }
    setSaving(true);
    try {
      const keepAt = lesson && lesson.studentInitials === studentInitials.trim()
        ? lesson.studentInitialedAt
        : Date.now();
      await whenQueued(onSave(buildPayload(studentInitials, keepAt)));
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
          <span className="dir-drawer-title">
            {step === 'student'
              ? 'Student initials'
              : lesson ? 'Edit lesson log' : 'Add lesson log'}
          </span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          {step === 'teacher' ? (
            <>
              <div className="dir-page-hint" style={{ margin: '0 0 8px', padding: 0 }}>
                {student?.name ?? 'Student'} · {lessonLengthLabel(student?.grade)}
              </div>

              <div className="dir-field">
                <label className="dir-label">Lesson date</label>
                <input className="dir-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>

              <div className="dir-field">
                <label className="dir-label">Lesson grade</label>
                <select className="dir-select" value={grade} onChange={e => setGrade(e.target.value)}>
                  <option value="">Select mark</option>
                  {LESSON_MARKS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div className="dir-field-row">
                <div className="dir-field">
                  <label className="dir-label">Composer</label>
                  <input className="dir-input" value={repertoireComposer} onChange={e => setRepertoireComposer(e.target.value)} placeholder="Composer" />
                </div>
                <div className="dir-field">
                  <label className="dir-label">Title</label>
                  <input className="dir-input" value={repertoireTitle} onChange={e => setRepertoireTitle(e.target.value)} placeholder="Piece title" />
                </div>
              </div>

              <div className="dir-field">
                <label className="dir-label">Technique / comments</label>
                <input
                  className="dir-input"
                  value={gradeNote}
                  onChange={e => setGradeNote(e.target.value)}
                  placeholder="What to practise, what improved"
                />
              </div>

              <div className="dir-field">
                <label className="dir-label">Payroll length</label>
                <select
                  className="dir-select"
                  value={payrollMinutes}
                  onChange={e => setPayrollMinutes(Number(e.target.value) as PayrollMinutes)}
                >
                  <option value={45}>45 minutes</option>
                  <option value={60}>1 hour</option>
                </select>
              </div>

              <div className="dir-field">
                <label className="dir-label">Teacher initials</label>
                <input
                  className="dir-input"
                  value={teacherInitials}
                  onChange={e => setTeacherInitials(e.target.value.toUpperCase())}
                  placeholder="Your initials"
                  autoCapitalize="characters"
                />
              </div>

              <button type="button" className="dir-tool-btn" onClick={() => setShowMore(v => !v)}>
                {showMore ? 'Hide scheduling details' : 'More (times, location, notes)'}
              </button>

              {showMore && (
                <>
                  <div className="dir-field-row" style={{ marginTop: 8 }}>
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
                    <label className="dir-label">Internal notes</label>
                    <input className="dir-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional, not on the paper log" />
                  </div>
                </>
              )}

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
                </div>
              )}
            </>
          ) : (
            <>
              <div className="dir-page-hint" style={{ margin: '0 0 12px', padding: 0 }}>
                Hand the device to {student?.name ?? 'the student'}. They type their initials to confirm this lesson log line.
              </div>
              <div style={{ marginBottom: 12, fontSize: 14, lineHeight: 1.4 }}>
                <div><strong>Date:</strong> {date}</div>
                <div><strong>Grade:</strong> {grade}</div>
                <div><strong>Repertoire:</strong> {repertoireComposer}, {repertoireTitle}</div>
                {gradeNote && <div><strong>Comments:</strong> {gradeNote}</div>}
              </div>
              <div className="dir-field">
                <label className="dir-label">Student initials</label>
                <input
                  className="dir-input"
                  value={studentInitials}
                  onChange={e => setStudentInitials(e.target.value.toUpperCase())}
                  placeholder="Type your initials"
                  autoCapitalize="characters"
                  autoFocus
                  style={{ fontSize: 28, letterSpacing: 4, textAlign: 'center', padding: '16px 12px' }}
                />
              </div>
            </>
          )}

          {error && <div className="dir-sc-error">⚠ {error}</div>}
        </div>
        <div className="dir-drawer-footer">
          {step === 'teacher' ? (
            <>
              <button className="dir-btn dir-btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
              <button className="dir-btn dir-btn-primary" onClick={goToStudentStep} disabled={!teacherReady}>
                Next: student initials
              </button>
            </>
          ) : (
            <>
              <button className="dir-btn dir-btn-ghost" onClick={() => setStep('teacher')} disabled={saving}>Back</button>
              <button
                className="dir-btn dir-btn-primary"
                onClick={handleSaveWithInitials}
                disabled={saving || !initialsOk(studentInitials)}
              >
                {saving ? 'Saving…' : 'Save lesson log'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
