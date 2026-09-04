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
import {
  LESSON_GRADE_MAX, LESSON_GRADE_MIN, gradeSummary, isLessonGrade, lessonGradeValue, needsGrade,
} from '../lessonGrades';
import {
  LESSON_TERMS,
  defaultPayrollMinutes,
  defaultTimesForPayroll,
  draftRowIndex,
  initialsOk,
  isLogCompleteForMail,
  juryRows,
  lessonLengthLabel,
  logMaterialChanged,
  logRowsWithDraft,
  sameTerm,
  schoolYearLabel,
  sheetKey,
  suggestTeacherInitials,
  termOf,
  termRank,
  trimJuryRows,
  type JuryPiece,
  type LessonLogSheet,
  type PayrollMinutes,
  type TermRef,
} from '../lessonLog';
import {
  lessonPayloadsFor, lessonsOffSlot, pendingSlotDates, planHasWork, schoolYearEnd, slotChangePlan,
  slotSentence, WEEKDAY_OPTIONS, type LessonSlot, type SlotChangePlan,
} from '../lessonSchedule';
import { enqueueLessonLogMail } from '../lessonLogMail';
import { todayStr, parseDate, formatTime, formatTimeRange } from '../utils';
import type { Lesson, Student } from '../types';
import { studentMatchesQuery } from '../studentSearch';
import { whenQueued } from '../writeStatus';
import './lessonLog.css';

const EMPTY_IDS: string[] = [];

type LessonPayload = Omit<Lesson, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy' | 'overrideId'>;

/**
 * The family summary is NEVER sent as a side effect of saving (director's
 * call, 2026-09-03 — it may become automatic later, but the teacher decides
 * per line for now). Saving a finished line only OFFERS; the mail leaves on a
 * press, and `Lesson.logMailedAt` records that it did so a second press is a
 * deliberate resend rather than a blind one.
 */
type MailState =
  | { step: 'offer'; lesson: Lesson; name: string }
  | { step: 'sending'; name: string }
  | { step: 'done'; queued: boolean; mailto: string | null; name: string };

/**
 * Applied Teacher world (#roles, #applied): the High School Private Lesson
 * Log, laid out the way the paper form is — header blanks, then a
 * spreadsheet of lessons, then the Jury Repertoire List and signatures.
 *
 * Adding a lesson opens a FULL PAGE rather than a drawer, and that page keeps
 * every earlier row of the term on screen with the new row directly beneath
 * them, column for column: on lesson five the teacher can read all four
 * previous lines before writing this one.
 */
export function MyLessonsView() {
  const me = useCurrentDirector();
  const { director } = useMyDirector(me?.email);
  const { students } = useStudents();
  const { events } = useEvents();
  const { ensembles } = useEnsembles();
  const { overrides, addOverride, deleteOverride } = useRosterOverrides();
  const { lessons, addLesson, updateLesson, deleteLesson, syncLessonMirror } = useLessons();

  const today = todayStr();
  const [editingStudents, setEditingStudents] = useState(false);
  const [sheetStudentId, setSheetStudentId] = useState<string | null>(null);
  const [activeTerm, setActiveTerm] = useState<TermRef>(() => termOf(todayStr()));
  const [editingLesson, setEditingLesson] = useState<Lesson | null | 'new'>(null);
  const [editingSlot, setEditingSlot] = useState(false);
  const [slotBusy, setSlotBusy] = useState(false);
  const [slotAdded, setSlotAdded] = useState<{ count: number; conflicts: number } | null>(null);
  // What a just-saved change to the standing time implies for the lessons
  // already on the calendar, and what happened when the teacher pressed it.
  // Both live here rather than in the panel so switching students clears them.
  const [slotPlan, setSlotPlan] = useState<{ slot: LessonSlot; plan: SlotChangePlan } | null>(null);
  const [slotMoved, setSlotMoved] = useState<{ moved: number; pullouts: number } | null>(null);
  const [confirmDeleteLesson, setConfirmDeleteLesson] = useState<string | null>(null);
  const [mail, setMail] = useState<MailState | null>(null);

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
  const ungraded = myLessons.filter(l => needsGrade(l, today));
  const needsInitial = myLessons.filter(l =>
    l.status !== 'Cancelled' && isLessonGrade(l.grade) && !initialsOk(l.studentInitials) && l.date <= today,
  );

  const summaries = Object.fromEntries(
    assignedStudents.map(s => [s.id, gradeSummary(myLessons.filter(l => l.studentId === s.id), today)]),
  );

  const sheetStudent = sheetStudentId ? studentsById[sheetStudentId] : undefined;
  const sheetLessons = useMemo(
    () => (sheetStudentId ? myLessons.filter(l => l.studentId === sheetStudentId) : []),
    [myLessons, sheetStudentId],
  );

  /** Both terms of the current school year, plus every term this student has
   *  a lesson in, newest first. Both halves matter: the current year so next
   *  term's jury list can be filled in early, and the lessons so switching
   *  terms can never hide a lesson that exists. */
  const termOptions = useMemo(() => {
    const seen = new Map<string, TermRef>();
    for (const term of LESSON_TERMS) {
      const t = { schoolYear: schoolYearLabel(today), term };
      seen.set(termRank(t), t);
    }
    for (const l of sheetLessons) {
      const t = termOf(l.date);
      seen.set(termRank(t), t);
    }
    return [...seen.values()].sort((a, b) => termRank(b).localeCompare(termRank(a)));
  }, [sheetLessons, today]);

  const termLessons = useMemo(
    () => sheetLessons.filter(l => sameTerm(termOf(l.date), activeTerm)),
    [sheetLessons, activeTerm],
  );
  const termSummary = gradeSummary(termLessons, today);

  const activeSheetKey = sheetStudentId
    ? sheetKey(sheetStudentId, activeTerm.schoolYear, activeTerm.term)
    : '';
  const activeSheet = director?.lessonLogSheets?.[activeSheetKey];

  /** Open a student on the sheet their newest lesson is on, so a teacher who
   *  looks in June doesn't land on an empty Fall page. */
  function openStudent(id: string) {
    const last = myLessons.filter(l => l.studentId === id).at(-1);
    setActiveTerm(termOf(last?.date ?? today));
    setSheetStudentId(id);
    clearSlotBanners();
  }

  /** Every banner about the weekly time belongs to ONE student. Leaving one up
   *  across a switch would offer to move somebody else's lessons. */
  function clearSlotBanners() {
    setSlotAdded(null);
    setSlotPlan(null);
    setSlotMoved(null);
  }

  async function saveAssignedStudents(ids: string[]) {
    if (!db || !me) return;
    await updateDoc(doc(db, 'directors', directorEmailId(me.email)), { assignedStudentIds: ids });
  }

  /**
   * The standing weekly time for one student — stored on my own director doc
   * beside the assignment it qualifies (#applied). `null` removes it.
   *
   * Saving the recipe is only half of a CHANGE. The lessons already on the
   * calendar were written from the old one and do not follow it: before this,
   * moving a 2:00 lesson to 3:00 confirmed the edit, changed nothing anybody
   * could see, and — because the year's dates were all still taken — left the
   * panel reporting that every week was already scheduled. So work out what
   * the change implies and OFFER it. Nothing moves without a press: re-timing
   * thirty lessons is not something to do behind somebody's back.
   */
  async function saveSlot(studentId: string, slot: LessonSlot | null) {
    if (!db || !me) return;
    const before = director?.lessonSlots?.[studentId];
    const next = { ...(director?.lessonSlots ?? {}) };
    if (slot) next[studentId] = slot; else delete next[studentId];
    await updateDoc(doc(db, 'directors', directorEmailId(me.email)), { lessonSlots: next });

    setSlotAdded(null);
    setSlotMoved(null);
    if (!slot) { setSlotPlan(null); return; }
    const plan = slotChangePlan(
      before, slot,
      myLessons.filter(l => l.studentId === studentId),
      today, schoolYearEnd(today),
    );
    setSlotPlan(planHasWork(plan) ? { slot, plan } : null);
  }

  /**
   * Move the lessons the old standing time produced onto the new one.
   *
   * Three things travel with a move and are easy to leave behind:
   *  • the public mirror, or the student's own calendar keeps the old time;
   *  • a cleared room, which `updateLesson`'s merge cannot express;
   *  • a confirmed pull-out, which still names the rehearsal the lesson USED
   *    to collide with. That one is dropped rather than re-pointed — the
   *    override is how an ensemble director learns a student will be out, and
   *    only the teacher can confirm the new time with them.
   */
  async function applySlotPlan(slot: LessonSlot, plan: SlotChangePlan) {
    setSlotBusy(true);
    try {
      let pullouts = 0;
      for (const m of plan.move) {
        await updateLesson(m.id, {
          date: m.toDate,
          startTime: slot.startTime,
          endTime: slot.endTime,
          ...(slot.location ? { location: slot.location } : {}),
        });
        const cleared: Record<string, unknown> = {};
        if (!slot.location) cleared.location = deleteField();
        if (m.overrideId) {
          await deleteOverride(m.overrideId);
          cleared.overrideId = deleteField();
          cleared.conflict = deleteField();
          pullouts++;
        }
        if (db && Object.keys(cleared).length > 0) {
          await updateDoc(doc(db, 'lessons', m.id), cleared);
          // Rebuild the mirror from the doc itself: a removed field is the one
          // thing the batched merge in updateLesson cannot say.
          await syncLessonMirror(m.id);
        }
      }
      setSlotMoved({ moved: plan.move.length, pullouts });
      setSlotPlan(null);
    } finally {
      setSlotBusy(false);
    }
  }

  /** The once-a-term half of the form — jury repertoire and signatures. Same
   *  home as `lessonSlots`, keyed by student + school year + term. */
  async function saveSheet(key: string, sheet: LessonLogSheet) {
    if (!db || !me) return;
    const next = { ...(director?.lessonLogSheets ?? {}) };
    next[key] = sheet;
    await updateDoc(doc(db, 'directors', directorEmailId(me.email)), { lessonLogSheets: next });
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
    // OFFER only. Saving a lesson must never put mail in front of a family on
    // its own — the teacher presses send, per line.
    if (isLogCompleteForMail(saved)) {
      setMail({ step: 'offer', lesson: saved, name: studentsById[saved.studentId]?.name ?? 'the student' });
    } else {
      setMail(null);
    }
  }

  /** The only path that queues a family email. Nothing calls it but a press. */
  async function sendLogMail(lesson: Lesson) {
    const name = studentsById[lesson.studentId]?.name ?? 'the student';
    setMail({ step: 'sending', name });
    const result = await enqueueLessonLogMail(lesson, studentsById[lesson.studentId]);
    if (result.queued) await updateLesson(lesson.id, { logMailedAt: Date.now() });
    setMail({ step: 'done', queued: result.queued, mailto: result.mailto, name });
  }

  async function handleDeleteLesson(l: Lesson) {
    if (l.overrideId) await deleteOverride(l.overrideId);
    await deleteLesson(l.id);
    setConfirmDeleteLesson(null);
  }

  if (!me) return null;

  // ── The lesson-log form, as its own page ───────────────────────────
  // Prior rows of this term stay above the row being written, in the same
  // columns — the whole reason this is a page and not a drawer.
  if (sheetStudentId && sheetStudent && editingLesson !== null) {
    const existing = editingLesson === 'new' ? null : editingLesson;
    return (
      <LessonLogPage
        student={sheetStudent}
        term={activeTerm}
        termLessons={termLessons}
        lesson={existing}
        teacherEmail={directorEmailId(me.email)}
        teacherName={me.name}
        defaultPayroll={defaultPayrollMinutes(sheetStudent.grade)}
        events={events}
        students={students}
        overrides={overrides}
        ensembleMap={ensembleMap}
        onSave={async data => {
          await saveLesson(data, existing);
          setEditingLesson(null);
        }}
        onClose={() => setEditingLesson(null)}
      />
    );
  }

  // ── Per-student log sheet ──────────────────────────────────────────
  if (sheetStudentId && sheetStudent) {
    return (
      <div className="dir-tab-page">
        <div style={{ padding: '8px 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            className="dir-tool-btn"
            onClick={() => { setSheetStudentId(null); setEditingLesson(null); clearSlotBanners(); }}
          >
            <ChevronLeft size={14} /> All students
          </button>
        </div>

        <div className="dir-form-section-label" style={{ marginTop: 4 }}>
          High School Private Lesson Log
        </div>
        <SheetHeader
          teacherName={me.name}
          student={sheetStudent}
          term={activeTerm}
          termOptions={termOptions}
          onTermChange={setActiveTerm}
        />
        <div className="dir-page-hint" style={{ marginTop: 0 }}>
          {termSummary
            ? `Term grade ${termSummary.rounded} (average ${termSummary.average.toFixed(1)} over ${termSummary.graded} of ${termSummary.gradable} lessons).`
            : 'No lesson in this term is graded yet.'}
        </div>

        {mail && (
          <MailBanner
            mail={mail}
            onSend={() => { if (mail.step === 'offer') void sendLogMail(mail.lesson); }}
            onDismiss={() => setMail(null)}
          />
        )}

        <WeeklySlotPanel
          student={sheetStudent}
          slot={director?.lessonSlots?.[sheetStudent.id]}
          lessons={sheetLessons}
          today={today}
          busy={slotBusy}
          added={slotAdded}
          plan={slotPlan}
          moved={slotMoved}
          editing={editingSlot}
          onEdit={() => { clearSlotBanners(); setEditingSlot(true); }}
          onCancelEdit={() => setEditingSlot(false)}
          onSave={async slot => { await saveSlot(sheetStudent.id, slot); setEditingSlot(false); }}
          onGenerate={slot => generateFromSlot(sheetStudent, slot)}
          onApplyPlan={(slot, plan) => applySlotPlan(slot, plan)}
          onDismissAdded={clearSlotBanners}
        />

        <div className="dir-form-section-label">
          Lesson log — {activeTerm.term} {activeTerm.schoolYear} ({termLessons.length})
        </div>
        {termLessons.length === 0 ? (
          <div className="dir-empty-inline">
            No lessons on this term’s sheet yet. Tap “Add lesson” after you teach.
          </div>
        ) : (
          <div className="dir-log-scroll">
            <table className="dir-log-table">
              <LogHead withActions />
              <tbody>
                {termLessons.map((l, i) => (
                  <LogReadRow
                    key={l.id}
                    index={i + 1}
                    lesson={l}
                    today={today}
                    confirming={confirmDeleteLesson === l.id}
                    onEdit={() => setEditingLesson(l)}
                    onMail={() => void sendLogMail(l)}
                    onDeleteRequest={() => setConfirmDeleteLesson(l.id)}
                    onDeleteCancel={() => setConfirmDeleteLesson(null)}
                    onDeleteConfirm={() => handleDeleteLesson(l)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ padding: '4px 16px 8px' }}>
          <button className="dir-btn dir-btn-primary" onClick={() => setEditingLesson('new')}>
            <Plus size={14} /> Add lesson
          </button>
        </div>

        <SheetExtrasPanel
          key={activeSheetKey}
          sheet={activeSheet}
          studentName={sheetStudent.name}
          onSave={sheet => saveSheet(activeSheetKey, sheet)}
        />

        <div className="dir-page-hint" style={{ marginBottom: 80 }}>
          Repertoire confirmation deadlines: Fall, Friday October 18; Spring, Friday February 28
          (see the division handbook for details).
        </div>
      </div>
    );
  }

  // ── Student list ───────────────────────────────────────────────────
  return (
    <div className="dir-tab-page">
      <div className="dir-page-hint" style={{ marginTop: 4 }}>
        Open a student to see their lesson log. After each lesson, add a line,
        fill the grade and comments, then have the student type their initials
        on this device. Nothing is emailed on its own — once a line is finished
        you can send that lesson’s summary to the family, one line at a time.
      </div>

      {mail && (
        <MailBanner
          mail={mail}
          onSend={() => { if (mail.step === 'offer') void sendLogMail(mail.lesson); }}
          onDismiss={() => setMail(null)}
        />
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
              || (isLessonGrade(l.grade) && !initialsOk(l.studentInitials) && l.date <= today)
            ),
          ).length;
          return (
            <button
              key={s.id}
              type="button"
              className="dir-ens-row"
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', background: 'transparent' }}
              onClick={() => openStudent(s.id)}
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
                  {g ? ` · average ${g.rounded}` : ' · not graded yet'}
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

/** The blanks printed across the top of the form: Teacher, Student Name,
 *  Grade, Instrument or Voice, Lesson Length, School Year, Term. Term is the
 *  only one the teacher picks — the rest are already known here. */
function SheetHeader({ teacherName, student, term, termOptions, onTermChange }: {
  teacherName?: string;
  student: Student;
  term: TermRef;
  termOptions: TermRef[];
  onTermChange: (t: TermRef) => void;
}) {
  return (
    <dl className="dir-log-header">
      <div>
        <dt>Teacher</dt>
        <dd>{teacherName || '—'}</dd>
      </div>
      <div>
        <dt>Student name</dt>
        <dd>{student.name}</dd>
      </div>
      <div>
        <dt>Grade</dt>
        <dd>{student.grade ?? '—'}</dd>
      </div>
      <div>
        <dt>Instrument or voice</dt>
        <dd>{student.instrument ?? '—'}</dd>
      </div>
      <div>
        <dt>Lesson length</dt>
        <dd>{lessonLengthLabel(student.grade)}</dd>
      </div>
      <div>
        <dt>School year</dt>
        <dd>{term.schoolYear}</dd>
      </div>
      <div>
        <dt><label htmlFor="dir-log-term">Term</label></dt>
        <dd>
          <select
            id="dir-log-term"
            className="dir-select"
            value={termRank(term)}
            onChange={e => {
              const next = termOptions.find(t => termRank(t) === e.target.value);
              if (next) onTermChange(next);
            }}
          >
            {termOptions.map(t => (
              <option key={termRank(t)} value={termRank(t)}>{t.term} {t.schoolYear}</option>
            ))}
          </select>
        </dd>
      </div>
    </dl>
  );
}

/** One definition of the log's columns, in the order the paper form prints
 *  them. Time is ours: the form only has a date, but a lesson log that can't
 *  say when the lesson was is no use for a pull-out or a payroll question. */
function LogHead({ withActions }: { withActions?: boolean }) {
  return (
    <thead>
      <tr>
        <th className="dir-log-num">Lesson</th>
        <th className="dir-log-date">Lesson date</th>
        <th className="dir-log-time">Time</th>
        <th className="dir-log-grade">Lesson grade</th>
        <th className="dir-log-initial">Teacher initial</th>
        <th className="dir-log-initial">Student initial</th>
        <th className="dir-log-composer">Composer</th>
        <th className="dir-log-title">Title</th>
        <th className="dir-log-comments">Technique / comments</th>
        <th className="dir-log-payroll">Payroll</th>
        {withActions && <th className="dir-log-actions">Edit</th>}
      </tr>
    </thead>
  );
}

const mailedLabel = (ms: number) =>
  new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** A grade that isn't a whole 0–100 is shown as-is with a warning rather than
 *  hidden: the A–F letters this replaced are still on older lessons, and the
 *  teacher has to see them to know they need re-entering as numbers. */
function GradeCell({ grade }: { grade?: string }) {
  const n = lessonGradeValue(grade);
  if (n !== null) return <>{n}</>;
  if ((grade ?? '').trim()) return <span className="dir-log-missing">{grade} — re-enter as a number</span>;
  return <span className="dir-log-missing">—</span>;
}

function LogReadRow({
  index, lesson, today, confirming, onEdit, onMail, onDeleteRequest, onDeleteCancel, onDeleteConfirm,
}: {
  index: number;
  lesson: Lesson;
  today: string;
  confirming: boolean;
  onEdit?: () => void;
  onMail?: () => void;
  onDeleteRequest?: () => void;
  onDeleteCancel?: () => void;
  onDeleteConfirm?: () => void;
}) {
  const cancelled = lesson.status === 'Cancelled';
  return (
    <tr className={cancelled ? 'cancelled' : undefined}>
      <td className="dir-log-num">
        <span>{index}</span>
        {cancelled && <div className="dir-log-missing">Cancelled</div>}
        {!cancelled && needsGrade(lesson, today) && <div className="dir-log-missing">Needs a grade</div>}
        {!cancelled && isLessonGrade(lesson.grade) && !initialsOk(lesson.studentInitials) && lesson.date <= today && (
          <div className="dir-log-missing">Needs initials</div>
        )}
        {/* Said in words, not just the button's tooltip: whether a family has
            already had this line is the thing you check before resending. */}
        {lesson.logMailedAt
          ? <div className="dir-log-missing">Emailed {mailedLabel(lesson.logMailedAt)}</div>
          : !cancelled && isLogCompleteForMail(lesson) && <div className="dir-log-missing">Not emailed</div>}
      </td>
      <td>{parseDate(lesson.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
      <td>{formatTimeRange(lesson.startTime, lesson.endTime)}</td>
      <td><GradeCell grade={lesson.grade} /></td>
      <td>{lesson.teacherInitials || <span className="dir-log-missing">—</span>}</td>
      <td>{lesson.studentInitials || <span className="dir-log-missing">—</span>}</td>
      <td className="dir-log-composer">{lesson.repertoireComposer || <span className="dir-log-missing">—</span>}</td>
      <td className="dir-log-title">{lesson.repertoireTitle || <span className="dir-log-missing">—</span>}</td>
      <td className="dir-log-comments">
        {lesson.gradeNote || <span className="dir-log-missing">—</span>}
        {lesson.location && <div className="dir-log-missing"><MapPin size={10} style={{ verticalAlign: '-1px' }} /> {lesson.location}</div>}
        {lesson.conflict && (
          <div style={{ color: 'var(--dir-danger)' }}>
            <AlertTriangle size={11} style={{ verticalAlign: '-1px' }} /> Misses {lesson.conflict.eventLabel} — confirmed
          </div>
        )}
      </td>
      <td>{lesson.payrollMinutes === 60 ? '1 hr' : lesson.payrollMinutes ? '45 min' : <span className="dir-log-missing">—</span>}</td>
      {onEdit && (
        <td className="dir-log-actions">
          {confirming ? (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button className="dir-btn dir-btn-danger dir-sc-small" onClick={onDeleteConfirm}>Delete</button>
              <button className="dir-btn dir-btn-ghost dir-sc-small" onClick={onDeleteCancel}>Keep</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button className="dir-icon-btn" onClick={onEdit} aria-label={`Edit lesson ${index}`}><Pencil size={15} /></button>
              <button className="dir-icon-btn" onClick={onDeleteRequest} aria-label={`Delete lesson ${index}`}><Trash2 size={15} /></button>
              {onMail && isLogCompleteForMail(lesson) && (
                <button
                  className="dir-icon-btn"
                  onClick={onMail}
                  title={lesson.logMailedAt
                    ? `Already emailed ${mailedLabel(lesson.logMailedAt)} — send it again`
                    : 'Email this line to the family'}
                  aria-label={lesson.logMailedAt
                    ? `Email lesson ${index} to the family again`
                    : `Email lesson ${index} to the family`}
                >
                  <Mail size={15} />
                </button>
              )}
            </div>
          )}
        </td>
      )}
    </tr>
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
  student, slot, lessons, today, busy, added, plan, moved, editing,
  onEdit, onCancelEdit, onSave, onGenerate, onApplyPlan, onDismissAdded,
}: {
  student: Student;
  slot?: LessonSlot;
  lessons: Lesson[];
  today: string;
  busy: boolean;
  added: { count: number; conflicts: number } | null;
  plan: { slot: LessonSlot; plan: SlotChangePlan } | null;
  moved: { moved: number; pullouts: number } | null;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (slot: LessonSlot | null) => Promise<void>;
  onGenerate: (slot: LessonSlot) => void;
  onApplyPlan: (slot: LessonSlot, plan: SlotChangePlan) => void;
  onDismissAdded: () => void;
}) {
  const through = schoolYearEnd(today);
  const pending = slot ? pendingSlotDates(slot, lessons, today, through) : [];
  // Lessons still to come that do NOT sit where the standing time says. This
  // is the number the panel used to be blind to: it counted DATES, so a time
  // change on the same weekday left it announcing that the year was handled
  // while every row still read the old time.
  const offSlot = lessonsOffSlot(slot, lessons, today);
  const scheduled = lessons.filter(l => l.date >= today && l.status !== 'Cancelled').length;
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

      {/* The offer made straight after a change is saved. Says what will move
          and what will not, before anything is written. */}
      {plan && (
        <div className="dir-conflict-banner" style={{ margin: '0 16px 8px' }}>
          <strong>Saved — but the lessons already on the calendar have not moved yet.</strong>
          <div style={{ marginTop: 6 }}>
            {plan.plan.move.length > 0 && (
              <>
                {plan.plan.move.length} upcoming lesson{plan.plan.move.length === 1 ? '' : 's'} still
                sit{plan.plan.move.length === 1 ? 's' : ''} at the old time
                {plan.plan.move[0] && (
                  <> (the next on {parseDate(plan.plan.move[0].fromDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {' at '}{formatTime(plan.plan.move[0].fromStartTime)})</>
                )}.
              </>
            )}
            {plan.plan.move.length === 0 && plan.plan.create.length > 0 && (
              <>Nothing on the calendar matches the old time, so there is nothing to move.</>
            )}
          </div>
          {(plan.plan.keptGraded > 0 || plan.plan.keptCancelled > 0 || plan.plan.keptOther > 0) && (
            <div style={{ marginTop: 6 }}>
              Left alone:{' '}
              {[
                plan.plan.keptGraded > 0 ? `${plan.plan.keptGraded} already graded` : '',
                plan.plan.keptCancelled > 0 ? `${plan.plan.keptCancelled} cancelled` : '',
                plan.plan.keptOther > 0 ? `${plan.plan.keptOther} set by hand` : '',
              ].filter(Boolean).join(', ')}. Those stay where they are — change them on their own row.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {plan.plan.move.length > 0 && (
              <button
                className="dir-btn dir-btn-primary dir-sc-small"
                disabled={busy}
                onClick={() => onApplyPlan(plan.slot, plan.plan)}
              >
                {busy ? 'Moving…' : `Move ${plan.plan.move.length} lesson${plan.plan.move.length === 1 ? '' : 's'} to ${slotSentence(plan.slot)}`}
              </button>
            )}
            <button className="dir-tool-btn" disabled={busy} onClick={onDismissAdded}>
              Leave them where they are
            </button>
          </div>
        </div>
      )}

      {moved && (
        <div className="dir-page-hint" style={{ marginTop: 0, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span>
            Moved {moved.moved} lesson{moved.moved === 1 ? '' : 's'} to the new time.
            {' '}{student.name}’s own schedule and your calendar both follow it.
            {moved.pullouts > 0 && (
              <> {moved.pullouts} of them had a confirmed pull-out from a rehearsal at the OLD
              time — that has been withdrawn, so re-open those rows to confirm the new one.
              Confirming is what tells the ensemble director.</>
            )}
          </span>
          <button className="dir-tool-btn" onClick={onDismissAdded}>Dismiss</button>
        </div>
      )}

      {slot && pending.length > 0 && (
        <div style={{ padding: '0 16px 8px' }}>
          {/* The step that is easy to miss, and the likeliest reason a teacher
              finds their own calendar empty after setting a time: the standing
              time is a recipe, and NOTHING is on any calendar until this
              button is pressed. Said out loud only when it is actually true of
              this student, so it does not become wallpaper. */}
          {scheduled === 0 && (
            <div className="dir-page-hint" style={{ margin: '0 0 6px', padding: 0 }}>
              Nothing is on {student.name}’s calendar yet. The weekly time on its own does not
              put lessons anywhere — this button is what does, and it is what makes the lesson
              show on your calendar and on {student.name}’s schedule.
            </div>
          )}
          <button className="dir-btn dir-btn-primary" disabled={busy} onClick={() => onGenerate(slot)}>
            <Plus size={14} />{' '}
            {busy
              ? 'Adding…'
              : `Add the remaining ${pending.length} through ${throughLabel}`}
          </button>
        </div>
      )}
      {/* "Every week is scheduled" and "every week is scheduled at the WRONG
          time" are the same date count, and the panel used to report both as
          the first one. */}
      {slot && pending.length === 0 && !added && !plan && !moved && (
        <div className="dir-page-hint" style={{ marginTop: 0 }}>
          {offSlot.length > 0
            ? <>Every week through {throughLabel} has a lesson, but {offSlot.length} of
              them {offSlot.length === 1 ? 'is' : 'are'} not at {slotSentence(slot)}. Press
              Change and save the time again to be offered the move, or fix one on its own row.</>
            : <>Every week through {throughLabel} is on the calendar at this time.</>}
        </div>
      )}
      {!slot && scheduled === 0 && (
        <div className="dir-page-hint" style={{ marginTop: 0 }}>
          Nothing is on {student.name}’s calendar. Setting the weekly time is step one; the
          Hub then offers to put the individual weeks on, and only then does the lesson reach
          your calendar and {student.name}’s schedule.
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

/**
 * Nothing here sends on its own. After a finished line is saved this offers
 * the family summary and waits; the teacher presses, or dismisses and the
 * mail never goes. The row keeps an "Email family" button either way, so
 * dismissing is not a decision you can't take back.
 */
function MailBanner({ mail, onSend, onDismiss }: {
  mail: MailState;
  onSend: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="dir-page-hint" style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <Mail size={14} />
      {mail.step === 'offer' && (
        <>
          <span>
            Saved. Nothing has been sent — send {mail.name}’s family the summary of this lesson?
          </span>
          <button type="button" className="dir-btn dir-btn-primary dir-sc-small" onClick={onSend}>
            Email the family
          </button>
          <button type="button" className="dir-tool-btn" onClick={onDismiss}>Not now</button>
        </>
      )}
      {mail.step === 'sending' && <span>Sending {mail.name}’s summary…</span>}
      {mail.step === 'done' && (
        <>
          <span>
            {mail.queued
              ? `Summary queued for ${mail.name}'s family email.`
              : mail.mailto
                ? `Not queued — open Mail to send ${mail.name}'s summary yourself.`
                : `No family email on file for ${mail.name}, so nothing was sent.`}
          </span>
          {mail.mailto && <a className="dir-tool-btn" href={mail.mailto}>Open in Mail</a>}
          <button type="button" className="dir-tool-btn" onClick={onDismiss}>Dismiss</button>
        </>
      )}
    </div>
  );
}

/**
 * The foot of the paper form: the five-line Jury Repertoire List and the
 * Faculty / Student / Dean signature-and-date lines. Filled in once a term,
 * so one Save covers the lot rather than a write per keystroke.
 */
function SheetExtrasPanel({ sheet, studentName, onSave }: {
  sheet?: LessonLogSheet;
  studentName: string;
  onSave: (sheet: LessonLogSheet) => Promise<void>;
}) {
  const [rows, setRows] = useState<JuryPiece[]>(() => juryRows(sheet));
  const [faculty, setFaculty] = useState(sheet?.facultySignature ?? '');
  const [facultyDate, setFacultyDate] = useState(sheet?.facultySignedDate ?? '');
  const [studentSig, setStudentSig] = useState(sheet?.studentSignature ?? '');
  const [studentDate, setStudentDate] = useState(sheet?.studentSignedDate ?? '');
  const [dean, setDean] = useState(sheet?.deanSignature ?? '');
  const [deanDate, setDeanDate] = useState(sheet?.deanSignedDate ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function setRow(i: number, patch: Partial<JuryPiece>) {
    setSaved(false);
    setRows(cur => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  const build = (): LessonLogSheet => {
    const jury = trimJuryRows(rows);
    return {
      ...(jury.length ? { juryRepertoire: jury } : {}),
      ...(faculty.trim() ? { facultySignature: faculty.trim() } : {}),
      ...(facultyDate ? { facultySignedDate: facultyDate } : {}),
      ...(studentSig.trim() ? { studentSignature: studentSig.trim() } : {}),
      ...(studentDate ? { studentSignedDate: studentDate } : {}),
      ...(dean.trim() ? { deanSignature: dean.trim() } : {}),
      ...(deanDate ? { deanSignedDate: deanDate } : {}),
    };
  };

  return (
    <>
      <div className="dir-form-section-label">Jury repertoire list</div>
      <div className="dir-page-hint" style={{ marginTop: 0 }}>
        The five pieces {studentName} brings to jury this term. Saved with this term’s sheet,
        so the other term keeps its own list.
      </div>
      {rows.map((r, i) => (
        <div className="dir-jury-row" key={i}>
          <span className="dir-jury-num">{i + 1}.</span>
          <input
            className="dir-input"
            value={r.composer}
            onChange={e => setRow(i, { composer: e.target.value })}
            placeholder="Composer"
            aria-label={`Jury piece ${i + 1} composer`}
          />
          <input
            className="dir-input"
            value={r.title}
            onChange={e => setRow(i, { title: e.target.value })}
            placeholder="Title"
            aria-label={`Jury piece ${i + 1} title`}
          />
        </div>
      ))}

      <div className="dir-form-section-label">Signatures</div>
      <SignatureRow
        label="Faculty signature" name={faculty} date={facultyDate}
        onName={v => { setSaved(false); setFaculty(v); }} onDate={v => { setSaved(false); setFacultyDate(v); }}
      />
      <SignatureRow
        label="Student signature" name={studentSig} date={studentDate}
        onName={v => { setSaved(false); setStudentSig(v); }} onDate={v => { setSaved(false); setStudentDate(v); }}
      />
      <SignatureRow
        label="Dean signature" name={dean} date={deanDate}
        onName={v => { setSaved(false); setDean(v); }} onDate={v => { setSaved(false); setDeanDate(v); }}
      />

      <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          className="dir-btn dir-btn-primary"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(build());
              setSaved(true);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? 'Saving…' : 'Save jury list and signatures'}
        </button>
        {saved && <span className="dir-page-hint" style={{ margin: 0, padding: 0 }}>Saved.</span>}
      </div>
    </>
  );
}

/** A typed name plus the date it was typed — the same signature the sign-up
 *  packets use. Nobody draws on glass here. */
function SignatureRow({ label, name, date, onName, onDate }: {
  label: string;
  name: string;
  date: string;
  onName: (v: string) => void;
  onDate: (v: string) => void;
}) {
  return (
    <div className="dir-sig-row">
      <div className="dir-field" style={{ margin: 0 }}>
        <label className="dir-label">{label}</label>
        <input className="dir-input" value={name} onChange={e => onName(e.target.value)} placeholder="Type full name" />
      </div>
      <div className="dir-field" style={{ margin: 0 }}>
        <label className="dir-label">Date</label>
        <input className="dir-input" type="date" value={date} onChange={e => onDate(e.target.value)} />
      </div>
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
 * The log form as its own page (#applied). Every earlier row of the term sits
 * above the row being filled in, in the same columns — write the fifth lesson
 * with the first four still on screen.
 *
 * Two steps, as before: the teacher fills the official line, then hands the
 * device over and the student types their initials. The table stays visible
 * through both, which is what the student is actually confirming.
 */
function LessonLogPage({
  student, term, termLessons, lesson, teacherEmail, teacherName,
  defaultPayroll, events, students, overrides, ensembleMap, onSave, onClose,
}: {
  student: Student;
  term: TermRef;
  termLessons: Lesson[];
  lesson: Lesson | null;
  teacherEmail: string;
  teacherName?: string;
  defaultPayroll: PayrollMinutes;
  events: import('../types').CalendarEvent[];
  students: Student[];
  overrides: import('../types').RosterOverride[];
  ensembleMap: Record<string, import('../types').Ensemble>;
  onSave: (data: LessonPayload) => Promise<void>;
  onClose: () => void;
}) {
  const rows = logRowsWithDraft(termLessons, lesson?.id);
  const draftIndex = draftRowIndex(rows);
  const rowNumber = draftIndex + 1;
  const above = termLessons.slice(0, draftIndex);
  const last = [...above].filter(l => l.status !== 'Cancelled').at(-1);
  const times0 = lesson
    ? { startTime: lesson.startTime, endTime: lesson.endTime }
    : defaultTimesForPayroll(last?.payrollMinutes ?? defaultPayroll);

  const [date, setDate] = useState(lesson?.date ?? todayStr());
  const [startTime, setStartTime] = useState(times0.startTime);
  const [endTime, setEndTime] = useState(times0.endTime);
  const [location, setLocation] = useState(lesson?.location ?? '');
  const [notes, setNotes] = useState(lesson?.notes ?? '');
  const [grade, setGrade] = useState(lesson?.grade ?? '');
  const [gradeNote, setGradeNote] = useState(lesson?.gradeNote ?? '');
  const [repertoireComposer, setRepertoireComposer] = useState(
    lesson?.repertoireComposer ?? last?.repertoireComposer ?? '',
  );
  const [repertoireTitle, setRepertoireTitle] = useState(lesson?.repertoireTitle ?? last?.repertoireTitle ?? '');
  const [payrollMinutes, setPayrollMinutes] = useState<PayrollMinutes>(
    lesson?.payrollMinutes ?? last?.payrollMinutes ?? defaultPayroll,
  );
  // A teacher's own initials come from their own NAME, not from the last row:
  // carrying the previous line forward meant one wrong value (an honorific
  // that used to leak in) reappeared on every lesson after it.
  const [teacherInitials, setTeacherInitials] = useState(
    lesson?.teacherInitials ?? suggestTeacherInitials(teacherName),
  );
  const [studentInitials, setStudentInitials] = useState(lesson?.studentInitials ?? '');
  const [step, setStep] = useState<'teacher' | 'student'>(
    lesson && isLessonGrade(lesson.grade) && !initialsOk(lesson.studentInitials) ? 'student' : 'teacher',
  );
  const [showMore, setShowMore] = useState(!!(lesson?.location || lesson?.conflict || lesson?.notes));
  const [ackConflict, setAckConflict] = useState(!!lesson?.conflict);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const studentId = student.id;

  const conflicts = useMemo(
    () => findLessonConflicts(studentId, date, startTime, endTime, events, students, overrides),
    [studentId, date, startTime, endTime, events, students, overrides],
  );

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setAckConflict(false);
  }, [studentId, date, startTime, endTime]);

  /** Changing payroll length re-times a BRAND-NEW row (45 min and an hour end
   *  at different times). An existing lesson keeps the times it was taught at
   *  — the log records what happened, not what the length implies. */
  function changePayroll(mins: PayrollMinutes) {
    setPayrollMinutes(mins);
    if (lesson) return;
    const next = defaultTimesForPayroll(mins);
    setStartTime(next.startTime);
    setEndTime(next.endTime);
  }

  const hasConflict = conflicts.length > 0;
  const validTimes = !!startTime && !!endTime && endTime > startTime;
  const teacherReady = !!date && validTimes && (!hasConflict || ackConflict)
    && isLessonGrade(grade) && initialsOk(teacherInitials)
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
      grade: grade.trim() || undefined,
      gradeNote: grade.trim() ? gradeNote.trim() || undefined : undefined,
      repertoireComposer: repertoireComposer.trim() || undefined,
      repertoireTitle: repertoireTitle.trim() || undefined,
      teacherInitials: teacherInitials.trim() || undefined,
      studentInitials: initials.trim() || undefined,
      studentInitialedAt: initials.trim() ? (initialedAt ?? Date.now()) : undefined,
      payrollMinutes,
      instrument: student.instrument,
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
    if (!validTimes) { setError('End time must be after the start time.'); return; }
    if (!teacherReady) {
      setError(
        `Fill every blank first: date, time, a lesson grade from ${LESSON_GRADE_MIN} to ${LESSON_GRADE_MAX}, `
        + 'composer, title, technique/comments, and your initials.',
      );
      return;
    }
    // Material edits void a prior student initial.
    if (lesson && initialsOk(lesson.studentInitials) && logMaterialChanged(lesson, {
      date, startTime, endTime, grade, gradeNote, repertoireComposer, repertoireTitle, payrollMinutes,
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
    <div className="dir-tab-page">
      <div style={{ padding: '8px 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="dir-tool-btn" onClick={onClose} disabled={saving}>
          <ChevronLeft size={14} /> Back to the log
        </button>
      </div>

      <div className="dir-form-section-label" style={{ marginTop: 4 }}>
        {lesson ? `Edit lesson ${rowNumber}` : `Lesson ${rowNumber}`} — {student.name}
      </div>
      <div className="dir-page-hint" style={{ marginTop: 0 }}>
        {term.term} {term.schoolYear} · {lessonLengthLabel(student.grade)} ·{' '}
        {above.length === 0
          ? 'first lesson on this sheet'
          : `${above.length} earlier lesson${above.length === 1 ? '' : 's'} shown above this row`}
      </div>

      <div className="dir-log-scroll">
        <table className="dir-log-table">
          <LogHead />
          <tbody>
            {rows.map((l, i) => l ? (
              <LogReadRow key={l.id} index={i + 1} lesson={l} today={todayStr()} confirming={false} />
            ) : (
            <tr className="editing" key="draft">
              <td className="dir-log-num">
                {rowNumber}
                <div className="dir-log-missing">Now</div>
              </td>
              <td>
                <input
                  className="dir-input" type="date" value={date}
                  onChange={e => setDate(e.target.value)} aria-label="Lesson date"
                />
              </td>
              <td>
                <input
                  className="dir-input" type="time" value={startTime}
                  onChange={e => setStartTime(e.target.value)} aria-label="Start time"
                />
                <input
                  className="dir-input" type="time" value={endTime}
                  onChange={e => setEndTime(e.target.value)} aria-label="End time" style={{ marginTop: 4 }}
                />
              </td>
              <td>
                <input
                  className="dir-input"
                  type="number"
                  inputMode="numeric"
                  min={LESSON_GRADE_MIN}
                  max={LESSON_GRADE_MAX}
                  step={1}
                  value={grade}
                  onChange={e => setGrade(e.target.value)}
                  placeholder="0–100"
                  aria-label="Lesson grade out of 100"
                />
              </td>
              <td>
                <input
                  className="dir-input"
                  value={teacherInitials}
                  onChange={e => setTeacherInitials(e.target.value.toUpperCase())}
                  autoCapitalize="characters"
                  aria-label="Teacher initials"
                />
              </td>
              <td>
                {initialsOk(studentInitials)
                  ? studentInitials
                  : <span className="dir-log-missing">The student types these below</span>}
              </td>
              <td className="dir-log-composer">
                <textarea
                  className="dir-input" rows={3} value={repertoireComposer}
                  onChange={e => setRepertoireComposer(e.target.value)}
                  placeholder={'Composer\nOne per line'} aria-label="Repertoire composer"
                />
              </td>
              <td className="dir-log-title">
                <textarea
                  className="dir-input" rows={3} value={repertoireTitle}
                  onChange={e => setRepertoireTitle(e.target.value)}
                  placeholder={'Title\nOne per line, matching the composers'} aria-label="Repertoire title"
                />
              </td>
              <td className="dir-log-comments">
                <textarea
                  className="dir-input" rows={5} value={gradeNote}
                  onChange={e => setGradeNote(e.target.value)}
                  placeholder={'What you worked on, what to practise, what improved.\nAs many lines as you need — the box grows.'}
                  aria-label="Technique and comments"
                />
              </td>
              <td>
                <select
                  className="dir-select"
                  value={payrollMinutes}
                  onChange={e => changePayroll(Number(e.target.value) as PayrollMinutes)}
                  aria-label="Payroll length"
                >
                  <option value={45}>45 min</option>
                  <option value={60}>1 hr</option>
                </select>
              </td>
            </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ padding: '0 16px' }}>
        <button type="button" className="dir-tool-btn" onClick={() => setShowMore(v => !v)}>
          {showMore ? 'Hide location and notes' : 'More (location, internal notes)'}
        </button>

        {showMore && (
          <>
            <div className="dir-field" style={{ marginTop: 8 }}>
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
            ⚠ <strong>Scheduling conflict</strong> — {student.name} is expected at{' '}
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
              I have confirmed with the classroom teacher or ensemble director that {student.name} will miss this time.
            </label>
          </div>
        )}

        {step === 'student' && (
          <>
            <div className="dir-form-section-label" style={{ paddingLeft: 0 }}>Student initials</div>
            <div className="dir-page-hint" style={{ margin: '0 0 12px', padding: 0 }}>
              Hand the device to {student.name}. The row above is what they are confirming — their
              initials go on this line, beside yours.
            </div>
            <div className="dir-field">
              <input
                className="dir-input"
                value={studentInitials}
                onChange={e => setStudentInitials(e.target.value.toUpperCase())}
                placeholder="Type your initials"
                aria-label="Student initials"
                autoCapitalize="characters"
                autoFocus
                style={{ fontSize: 28, letterSpacing: 4, textAlign: 'center', padding: '16px 12px' }}
              />
            </div>
          </>
        )}

        {error && <div className="dir-sc-error">⚠ {error}</div>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px 0 80px' }}>
          {step === 'teacher' ? (
            <>
              <button className="dir-btn dir-btn-primary" onClick={goToStudentStep} disabled={!teacherReady}>
                Next: student initials
              </button>
              <button className="dir-btn dir-btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
            </>
          ) : (
            <>
              <button
                className="dir-btn dir-btn-primary"
                onClick={handleSaveWithInitials}
                disabled={saving || !initialsOk(studentInitials)}
              >
                {saving ? 'Saving…' : 'Save lesson log'}
              </button>
              <button className="dir-btn dir-btn-ghost" onClick={() => setStep('teacher')} disabled={saving}>
                Back to the line
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
