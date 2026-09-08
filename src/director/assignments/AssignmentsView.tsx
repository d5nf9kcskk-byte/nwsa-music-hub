import { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, Download, Plus, Clock, Video, Music } from 'lucide-react';
import { useAssignments, useAssignmentResults } from '../hooks/useAssignments';
import { useMyDirector, saveMyExamRubric } from '../hooks/useDirectors';
import { useCurrentDirector } from '../currentDirector';
import { useRepertoire } from '../hooks/useRepertoire';
import { useAssignmentSubmissions } from '../hooks/useAssignmentSubmissions';
import { useGoogleDrive } from '../hooks/useGoogleDrive';
import { useStudents } from '../hooks/useStudents';
import { useEnsembles } from '../hooks/useEnsembles';
import { useMinuteTick } from '../hooks/useAnnouncements';
import { formatDate, todayStr, studentHasAssignment, musicEnsembles, ASSIGN_COLOR } from '../utils';
import { sortStudents, type StudentSort } from '../scoreOrder';
import { SortToggle } from '../components/SortToggle';
import { EnsembleFilter } from '../components/EnsembleFilter';
import { RichTextArea } from '../components/RichTextArea';
import { PiecePicker } from '../repertoire/PiecePicker';
import { FileUpload } from '../components/FileUpload';
import { SchedulePublishField } from '../components/SchedulePublishField';
import { useModalA11y } from '../../shared/useModalA11y';
import { whenQueued } from '../writeStatus';
import { NotesText } from '../../public/components/NotesText';
import { richTextToPlain } from '../../shared/richTextParse';
import { DEFAULT_VIDEO_MAX_MB } from '../types';
import type { Assignment, AssignmentType, AssignmentResultStatus, Student, Ensemble, Attachment } from '../types';
import { normalizeRubric, rubricForAssignment, rubricProblem, type RubricCriterion } from '../examRubric';
import { downloadCsv } from '../attendance/attendanceCsv';
import {
  assignmentGradesToCsv, gradesCsvFilename, type GradeCsvPerson,
} from './assignmentGradesCsv';
import { RubricEditor } from './RubricEditor';
import { GradeRow, type ConfirmArgs } from './GradeRow';
import { describeDuration, formatClock, formatFileSize, minutesToSeconds, secondsToMinutes } from '../../shared/duration';
import { ORG } from '../../org';
import { studentMatchesQuery } from '../studentSearch';
import { currentTerm, termIdForDate, termsNewestFirst } from '../../shared/concertCheckin';
import { useCheckinSettings } from '../../public/hooks/useCheckinSettings';

const ASSIGNMENT_TYPES: AssignmentType[] = ['Playing Exam', 'Written Test', 'Performance', 'Other'];

const TYPE_COLORS: Record<AssignmentType, string> = {
  'Playing Exam': ASSIGN_COLOR,
  'Written Test': '#0891b2',
  'Performance':  '#16a34a',
  'Other':        '#64748b',
};

// ── Assignment form drawer ────────────────────────────────────────────

interface FormProps {
  assignment: Assignment | null;
  ensembles: Ensemble[];
  students: Student[];
  onSave: (data: Omit<Assignment, 'id'>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

function AssignmentForm({ assignment, ensembles, students, onSave, onDelete, onClose }: FormProps) {
  const today = todayStr();
  const [title, setTitle] = useState(assignment?.title ?? '');
  const [type, setType] = useState<AssignmentType>(assignment?.type ?? 'Playing Exam');
  const [description, setDescription] = useState(assignment?.description ?? '');
  const [dueDate, setDueDate] = useState(assignment?.dueDate ?? today);
  const [ensembleIds, setEnsembleIds] = useState<string[]>(assignment?.ensembleIds ?? []);
  const [studentIds, setStudentIds] = useState<string[]>(assignment?.studentIds ?? []);
  const [studentQuery, setStudentQuery] = useState('');
  const [formUrl, setFormUrl] = useState(assignment?.formUrl ?? '');
  const [acceptsVideo, setAcceptsVideo] = useState(assignment?.acceptsVideoSubmissions ?? false);
  const [maxVideoMinutes, setMaxVideoMinutes] = useState(
    secondsToMinutes(assignment?.maxVideoDurationSeconds ?? 300),
  );
  const [maxVideoSizeMB, setMaxVideoSizeMB] = useState(assignment?.maxVideoSizeMB ?? DEFAULT_VIDEO_MAX_MB);
  const [googleDriveFolderId, setGoogleDriveFolderId] = useState(assignment?.googleDriveFolderId ?? '');
  const [pieceIds, setPieceIds] = useState<string[]>(assignment?.pieceIds ?? []);
  const [attachments, setAttachments] = useState<Attachment[]>(assignment?.attachments ?? []);
  const [publishAt, setPublishAt] = useState<number | undefined>(assignment?.publishAt);
  // null = this exam's rubric has not been chosen HERE, so the editor shows
  // whatever it would actually grade with (this director's default, for a
  // Playing Exam). It becomes a real value the moment the editor is touched,
  // and only then does saving write the field — so opening someone else's
  // exam to fix a typo never quietly stamps your rubric onto it.
  const [rubricEdit, setRubricEdit] = useState<RubricCriterion[] | null>(assignment?.rubric ?? null);
  const [savingDefault, setSavingDefault] = useState(false);
  const [savedDefault, setSavedDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const panelRef = useModalA11y<HTMLDivElement>(onClose, true, { closeOnBack: true });
  const drive = useGoogleDrive();
  const me = useCurrentDirector();
  const { director } = useMyDirector(me?.email);
  const rubric = rubricEdit ?? rubricForAssignment({ type }, director?.examRubric);

  function toggleEnsemble(id: string) {
    setEnsembleIds(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  }
  function toggleStudent(id: string) {
    setStudentIds(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  }
  const studentMatches = studentQuery.trim()
    ? students.filter(s => s.status === 'Active' && studentMatchesQuery(s, studentQuery)).slice(0, 8)
    : [];

  async function handleSave() {
    if (!title.trim()) return;
    const badRubric = rubricProblem(rubric);
    if (badRubric) { setSaveError(badRubric); return; }
    setSaving(true);
    setSaveError('');
    try {
      await whenQueued(onSave({
          title: title.trim(),
          type,
          description: description.trim(),
          dueDate,
          ensembleIds,
          studentIds: studentIds.length ? studentIds : undefined,
          formUrl: formUrl.trim() || undefined,
          acceptsVideoSubmissions: acceptsVideo || undefined,
          // The limits are stored unconditionally, so turning submissions off
          // clears only the flag it owns. storage.rules reads maxVideoSizeMB
          // straight off this doc and falls back to 500 MB when it is ABSENT —
          // and its upload rule only requires the assignment to exist — so
          // deleting the ceiling here would quietly raise the unauthenticated
          // upload limit on that assignment. Keeping it also preserves the
          // director's setting if they switch submissions back on.
          maxVideoDurationSeconds: minutesToSeconds(maxVideoMinutes),
          maxVideoSizeMB,
          googleDriveFolderId: googleDriveFolderId || undefined,
          pieceIds: pieceIds.length ? pieceIds : undefined,
          // Untouched stays untouched: undefined here means the key is
          // cleared, and an exam with no stored rubric has nothing to clear.
          rubric: rubricEdit !== null ? normalizeRubric(rubricEdit) : undefined,
          createdAt: assignment?.createdAt ?? Date.now(),
          attachments,
          publishAt,
        // Closes once the write is queued rather than acknowledged: the old
        // 15-second race reported "Save timed out" for saves that synced
        // fine a moment later (audit rec #4).
        }));
      onClose();
    } catch (err) {
      setSaving(false);
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer" role="dialog" aria-modal="true" aria-label={assignment ? 'Edit Assignment' : 'New Assignment'} tabIndex={-1} ref={panelRef}>
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">{assignment ? 'Edit Assignment' : 'New Assignment'}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-field">
            <label className="dir-label">Title *</label>
            <input
              className="dir-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Scale Proficiency — Fall"
              autoFocus
            />
          </div>

          <div className="dir-field">
            <label className="dir-label">Type</label>
            <select className="dir-select" value={type} onChange={e => setType(e.target.value as AssignmentType)}>
              {ASSIGNMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="dir-field">
            <label className="dir-label">Due Date</label>
            <input className="dir-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>

          <div className="dir-field">
            <label className="dir-label">Ensembles</label>
            <div className="dir-checkbox-group">
              {ensembles.map(e => (
                <label key={e.id} className={`dir-checkbox-tag ${ensembleIds.includes(e.id) ? 'checked' : ''}`}>
                  <input type="checkbox" checked={ensembleIds.includes(e.id)} onChange={() => toggleEnsemble(e.id)} />
                  {e.name}
                </label>
              ))}
            </div>
          </div>

          <div className="dir-field">
            <label className="dir-label">Or specific students <span className="dir-label-hint">optional — for individual assignments</span></label>
            {studentIds.length > 0 && (
              <div className="dir-checkbox-group" style={{ marginBottom: 8 }}>
                {studentIds.map(id => {
                  const s = students.find(x => x.id === id);
                  return (
                    <label key={id} className="dir-checkbox-tag checked" onClick={() => toggleStudent(id)}>
                      {s?.name ?? id} ✕
                    </label>
                  );
                })}
              </div>
            )}
            <input className="dir-input" value={studentQuery} onChange={e => setStudentQuery(e.target.value)} placeholder="Search a student to add…" />
            {studentMatches.length > 0 && (
              <div className="dir-add-sub-list" style={{ marginTop: 6 }}>
                {studentMatches.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className="dir-ens-row dir-sc-pick"
                    onClick={() => { toggleStudent(s.id); setStudentQuery(''); }}
                  >
                    <div className="dir-ens-info">
                      <div className="dir-ens-name">{s.name}</div>
                      <div className="dir-ens-sub">{s.instrument}</div>
                    </div>
                    {studentIds.includes(s.id) ? <span className="dir-sub-badge">Added</span> : <Plus size={16} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="dir-field">
            <label className="dir-label">Google Form link <span className="dir-label-hint">exams are taken through this form</span></label>
            <input className="dir-input" type="url" value={formUrl} onChange={e => setFormUrl(e.target.value)} placeholder="https://forms.gle/…" />
          </div>

          <div className="dir-field">
            <label className="dir-checkbox-tag" style={{ display: 'inline-flex', cursor: 'pointer', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={acceptsVideo} onChange={e => setAcceptsVideo(e.target.checked)} />
              <Video size={14} /> Accept video submissions in-app
            </label>
            <div className="dir-field-hint">Students can record or upload a video directly on the assignment page. Videos are stored in Firebase Storage and synced to Google Drive.</div>
            {acceptsVideo && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Minutes and megabytes, not seconds and bytes — the stored
                    fields stay in seconds/MB so old assignments still work. */}
                <label className="dir-label" htmlFor="dir-video-minutes">Longest recording (minutes)</label>
                <input
                  id="dir-video-minutes"
                  className="dir-input"
                  type="number"
                  value={maxVideoMinutes}
                  onChange={e => setMaxVideoMinutes(Math.max(1, Math.min(60, Number(e.target.value) || 5)))}
                  min={1}
                  max={60}
                  step={1}
                  style={{ width: 120 }}
                />
                <div className="dir-field-hint">
                  1–60 minutes. Default: 5. In-app recording stops on its own at this limit, and an
                  uploaded video longer than {describeDuration(minutesToSeconds(maxVideoMinutes))} is turned away.
                </div>

                <label className="dir-label" htmlFor="dir-video-size">Largest upload (MB)</label>
                <input
                  id="dir-video-size"
                  className="dir-input"
                  type="number"
                  value={maxVideoSizeMB}
                  onChange={e => setMaxVideoSizeMB(Math.max(10, Math.min(DEFAULT_VIDEO_MAX_MB, Number(e.target.value) || DEFAULT_VIDEO_MAX_MB)))}
                  min={10}
                  max={DEFAULT_VIDEO_MAX_MB}
                  step={10}
                  style={{ width: 120 }}
                />
                <div className="dir-field-hint">
                  10–{DEFAULT_VIDEO_MAX_MB} MB. A phone video runs roughly 60–100 MB per minute at
                  full quality, so {maxVideoSizeMB} MB is about {Math.max(1, Math.round(maxVideoSizeMB / 80))} minute
                  {Math.max(1, Math.round(maxVideoSizeMB / 80)) === 1 ? '' : 's'} of phone footage.
                </div>

                {googleDriveFolderId ? (
                  <div style={{ fontSize: 13, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 6 }}>
                    ✓ Google Drive connected
                    <button type="button" className="dir-tool-btn" style={{ fontSize: 11 }} onClick={async () => {
                      const result = await drive.connectAndCreateFolder(title || 'Untitled Assignment');
                      if (result) setGoogleDriveFolderId(result.folderId);
                    }}>
                      Change folder
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="dir-btn dir-btn-primary"
                    style={{ fontSize: 13, padding: '8px 16px' }}
                    onClick={async () => {
                      const result = await drive.connectAndCreateFolder(title || 'Untitled Assignment');
                      if (result) setGoogleDriveFolderId(result.folderId);
                    }}
                    disabled={drive.loading}
                  >
                    {drive.loading ? 'Connecting…' : 'Connect Google Drive'}
                  </button>
                )}
                {drive.error && <div style={{ fontSize: 12, color: 'var(--dir-danger)' }}>{drive.error}</div>}
                <div className="dir-field-hint">
                  Videos will sync every 15 minutes to your Drive in:
                  <br />
                  <strong>My Drive → {ORG.appName} → {title || 'Assignment Name'}</strong>
                </div>
              </div>
            )}
          </div>

          {/* How this exam is scored. Per-assignment on purpose: another
              director weights a playing exam their own way, and a scale check
              is not weighted like a concerto jury. */}
          <RubricEditor
            value={rubric}
            onChange={setRubricEdit}
            myDefault={director?.examRubric}
            savingDefault={savingDefault}
            savedDefault={savedDefault}
            onSaveDefault={me?.email ? async criteria => {
              setSavingDefault(true);
              setSaveError('');
              try {
                await saveMyExamRubric(me.email, normalizeRubric(criteria));
                setSavedDefault(true);
              } catch (err) {
                setSaveError(err instanceof Error ? err.message : 'Could not save your default rubric.');
              } finally {
                setSavingDefault(false);
              }
            } : undefined}
          />

          <div className="dir-field">
            <label className="dir-label">Description / Instructions</label>
            <RichTextArea
              value={description}
              onChange={setDescription}
              placeholder="Optional details, rubric, or instructions"
            />
          </div>

          {/* Music this assignment is on. Students open the piece from the
              assignment page, download their part, and come back to record —
              so the excerpt and the part are never two separate hunts. */}
          <div className="dir-field">
            <label className="dir-label">
              Music <span className="dir-label-hint">optional — links the parts to this assignment</span>
            </label>
            <PiecePicker
              ensembleIds={ensembleIds}
              ensembles={ensembles}
              value={pieceIds}
              onChange={setPieceIds}
            />
            <div className="dir-field-hint">
              Whatever you pick shows on the student's assignment page with a link straight to the
              piece, where their part is waiting.
            </div>
          </div>

          <SchedulePublishField publishAt={publishAt} onChange={setPublishAt} />

          {assignment && (
            <div className="dir-field">
              <label className="dir-label">Attachments</label>
              <FileUpload
                assignmentId={assignment.id}
                attachments={attachments}
                onChange={setAttachments}
              />
            </div>
          )}

          {assignment && onDelete && (
            confirmDelete ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="dir-btn dir-btn-danger"
                  style={{ flex: 1 }}
                  onClick={async () => { await onDelete(); onClose(); }}
                  disabled={saving}
                >
                  Confirm Delete
                </button>
                <button className="dir-btn dir-btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            ) : (
              <button className="dir-btn dir-btn-danger" onClick={() => setConfirmDelete(true)}>
                Delete Assignment
              </button>
            )
          )}
        </div>
        {saveError && (
          <div style={{ padding: '4px 16px 0', fontSize: 13, color: 'var(--dir-danger)' }}>{saveError}</div>
        )}
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="dir-btn dir-btn-primary"
            onClick={handleSave}
            disabled={saving || !title.trim()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Grade sheet (full page) ───────────────────────────────────

interface GradeSheetProps {
  assignment: Assignment;
  students: Student[];
  onEdit: () => void;
  onClose: () => void;
}

function GradeSheet({ assignment, students, onEdit, onClose }: GradeSheetProps) {
  const { resultMap, saveResult, clearResult } = useAssignmentResults(assignment.id);
  const { pieces } = useRepertoire();
  const me = useCurrentDirector();
  const { director } = useMyDirector(me?.email);
  const linkedPieces = (assignment.pieceIds ?? [])
    .map(pid => pieces.find(p => p.id === pid))
    .filter(p => !!p);
  const {
    submissions, loading: subLoading, loadError: subLoadError,
    setReviewStatus, deleteSubmission,
  } = useAssignmentSubmissions(assignment.id);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [gradeError, setGradeError] = useState('');
  const [sort, setSort] = useState<StudentSort>('scoreOrder');
  const [openId, setOpenId] = useState<string | null>(null);
  const [showStrays, setShowStrays] = useState(false);

  // The rubric this exam grades with. An exam that never chose one falls back
  // to THIS director's default, which is what lets every playing exam that
  // predates the feature grade with a rubric and needs no migration.
  const criteria = rubricForAssignment(assignment, director?.examRubric);

  // Every take a student sent, newest first — one line per student, not one
  // line per upload. `submissions` is already sorted newest-first.
  const takesByStudent = new Map<string, typeof submissions>();
  for (const sub of submissions) {
    const list = takesByStudent.get(sub.studentId);
    if (list) list.push(sub);
    else takesByStudent.set(sub.studentId, [sub]);
  }

  const relevant = sortStudents(
    students.filter(s => s.status === 'Active' && studentHasAssignment(assignment, s.id, s.ensembleIds)),
    sort,
  );
  const submittedCount = relevant.filter(s => takesByStudent.has(s.id)).length;
  const gradedCount = relevant.filter(s => {
    const r = resultMap[s.id];
    return !!r && (r.status !== 'Pending' || !!r.score);
  }).length;

  // A video from someone the roster no longer offers — a student who went
  // Inactive, or was moved out of the ensemble after submitting. Merging the
  // old submissions list into the roster is exactly where those would have
  // vanished, so they get their own small fold instead.
  const onRoster = new Set(relevant.map(s => s.id));
  const strays = submissions.filter(sub => !onRoster.has(sub.studentId));

  /**
   * The export's rows: the roster in the order shown, then the people behind
   * that fold. A stray gets a row from the name on their OWN submission —
   * they have no roster record to read one out of, and inventing a roster row
   * for someone who is not on the roster would be worse than leaving them out.
   * `submissions` is newest-first, so a student who re-recorded under a
   * corrected name is carried by their latest take.
   */
  const strayPeople: GradeCsvPerson[] = [];
  const straySeen = new Set<string>();
  for (const sub of strays) {
    if (straySeen.has(sub.studentId)) continue;
    straySeen.add(sub.studentId);
    strayPeople.push({
      studentId: sub.studentId,
      name: sub.studentName,
      instrument: '',
      onRoster: false,
    });
  }

  /** Download the sheet as a CSV for the district gradebook. A browser
   *  download and nothing else — grades are staff-only and never published. */
  function handleExport() {
    const csv = assignmentGradesToCsv({
      criteria,
      people: [
        ...relevant.map(s => ({
          studentId: s.id,
          name: s.name,
          instrument: s.instrument,
          onRoster: true,
        })),
        ...strayPeople,
      ],
      resultMap,
    });
    downloadCsv(gradesCsvFilename(assignment.title, todayStr()), csv);
  }

  async function handleStatus(studentId: string, status: AssignmentResultStatus) {
    const existing = resultMap[studentId];
    // Tapping the active grade again clears it back to Pending — same
    // toggle-off convention as the attendance screen.
    const clearing = existing?.status === status;
    setSavingId(studentId);
    setGradeError('');
    try {
      if (clearing) await clearResult(studentId);
      else await saveResult(studentId, status);
    } catch (e) {
      setGradeError(e instanceof Error ? e.message : 'Could not save grade — try again.');
    } finally {
      setSavingId(null);
    }
  }

  async function handleScore(studentId: string, raw: string) {
    const existing = resultMap[studentId];
    const prev = existing?.score ?? '';
    if (raw === prev) return;
    setSavingId(studentId);
    setGradeError('');
    try {
      if (!raw) {
        if (!existing) return;
        // Clearing the number keeps Pass/Fail/Exempt; a Pending-only row goes away.
        if (existing.status === 'Pending') await clearResult(studentId);
        else await saveResult(studentId, existing.status, { score: null });
        return;
      }
      // A typed score grades the row — default status Pass when nothing was set.
      const status = existing?.status && existing.status !== 'Pending' ? existing.status : 'Pass';
      await saveResult(studentId, status, { score: raw });
    } catch (e) {
      setGradeError(e instanceof Error ? e.message : 'Could not save score — try again.');
    } finally {
      setSavingId(null);
    }
  }

  /** Confirm a rubric grade: file the score and the breakdown together, mark
   *  the take watched so that is not a second press, and move to the next
   *  student still owed a grade. */
  async function handleConfirm(student: Student, args: ConfirmArgs) {
    const existing = resultMap[student.id];
    // A comment on its own is not a grade. Only a rubric or a score defaults a
    // Pending row to Pass — otherwise jotting "watch the shifting" on a
    // student nobody has heard yet would file them as passing.
    const grading = args.rubric.length > 0 || !!args.score;
    const status = existing?.status && existing.status !== 'Pending'
      ? existing.status
      : grading ? 'Pass' : 'Pending';
    setSavingId(student.id);
    setGradeError('');
    try {
      await saveResult(student.id, status, {
        score: args.score || null,
        rubric: args.rubric.length ? args.rubric : null,
        notes: args.notes,
      });
      const take = takesByStudent.get(student.id)?.[0];
      if (take && take.status !== 'reviewed' && args.rubric.length) {
        await setReviewStatus(take.id, 'reviewed');
      }
      if (args.rubric.length) setOpenId(nextToGrade(student.id));
    } catch (e) {
      setGradeError(e instanceof Error ? e.message : 'Could not save grade — try again.');
    } finally {
      setSavingId(null);
    }
  }

  /** The next student after this one with a video and no grade yet — so a
   *  Confirm lands you on the next exam instead of back at the top. */
  function nextToGrade(afterId: string): string | null {
    const from = relevant.findIndex(s => s.id === afterId);
    for (let i = from + 1; i < relevant.length; i++) {
      const s = relevant[i];
      const r = resultMap[s.id];
      const graded = !!r && (r.status !== 'Pending' || !!r.score);
      if (!graded && takesByStudent.has(s.id)) return s.id;
    }
    return null;
  }

  const counts = relevant.reduce(
    (acc, s) => {
      const st = resultMap[s.id]?.status ?? 'Pending';
      acc[st] = (acc[st] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="dir-tab-page dir-assign-page">
      <div className="dir-assign-page-top">
        <button type="button" className="dir-drawer-back" onClick={onClose}>
          <ChevronLeft size={16} /> All assignments
        </button>
        <div className="dir-assign-page-tools">
          {/* Hidden rather than disabled when there is nobody on the sheet:
              `.dir-tool-btn` has no disabled styling, so a greyed-out button
              would look pressable and do nothing. */}
          {(relevant.length > 0 || strayPeople.length > 0) && (
            <button
              type="button"
              className="dir-tool-btn"
              onClick={handleExport}
              title="Download this grade sheet as a CSV"
            >
              <Download size={15} /> CSV
            </button>
          )}
          <button type="button" className="dir-tool-btn" onClick={onEdit}>Edit</button>
        </div>
      </div>

      <header className="dir-assign-page-head">
        <div className="dir-assign-page-title">{assignment.title}</div>
        <div className="dir-assign-page-meta">
          {assignment.type} · Due {formatDate(assignment.dueDate, { month: 'short', day: 'numeric', year: 'numeric' })}
          {assignment.acceptsVideoSubmissions && (
            <> · {submittedCount} of {relevant.length} submitted</>
          )}
          {' · '}{gradedCount} of {relevant.length} graded
        </div>
      </header>

      {gradeError && (
        <div className="dir-assign-page-error">⚠ {gradeError}</div>
      )}

      {(assignment.description || linkedPieces.length > 0 || assignment.formUrl) && (
        <div className="dir-assign-brief dir-assign-brief-page">
          {assignment.description && <NotesText text={assignment.description} />}
          {linkedPieces.length > 0 && (
            <div className="dir-assign-brief-music">
              <Music size={13} /> {linkedPieces.map(p => p.title).join(' · ')}
            </div>
          )}
          {assignment.formUrl && (
            <a
              className="dir-assign-card-form"
              href={assignment.formUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open form ↗
            </a>
          )}
        </div>
      )}

      <div className="dir-assign-summary-bar">
        {[
          { key: 'Pass',    label: 'Pass',    cls: 'pass' },
          { key: 'Fail',    label: 'Fail',    cls: 'fail' },
          { key: 'Exempt',  label: 'Exempt',  cls: 'exempt' },
          { key: 'Pending', label: 'Pending', cls: 'pending' },
        ].map(({ key, label, cls }) => (
          <div key={key} className={`dir-assign-stat dir-assign-stat-${cls}`}>
            <span className="dir-assign-stat-num">{counts[key] ?? 0}</span>
            <span className="dir-assign-stat-lbl">{label}</span>
          </div>
        ))}
      </div>

      {/* ONE list. The roster row and the video row used to be two sections
          over the same people — you read a name in the top half to find out
          they had submitted, then found the same name again in the bottom half
          to watch it. Now the row is the submission, and opening it grades in
          place. */}
      <div className="dir-assign-sort-row">
        <SortToggle value={sort} onChange={setSort} />
        {assignment.acceptsVideoSubmissions && subLoadError && submissions.length === 0 && (
          <span className="dir-grade-loadfail">
            Videos didn’t load — check your connection.
          </span>
        )}
      </div>

      {relevant.length === 0 ? (
        <div className="dir-empty">
          <p>No active students in these ensembles.</p>
        </div>
      ) : (
        <div className="dir-grade-list">
          {relevant.map(s => (
            <GradeRow
              key={s.id}
              student={s}
              result={resultMap[s.id]}
              criteria={criteria}
              takes={assignment.acceptsVideoSubmissions ? (takesByStudent.get(s.id) ?? []) : []}
              open={openId === s.id}
              onToggle={() => setOpenId(openId === s.id ? null : s.id)}
              saving={savingId === s.id}
              onConfirm={args => handleConfirm(s, args)}
              onStatus={st => handleStatus(s.id, st)}
              onScore={raw => handleScore(s.id, raw)}
              onSetReviewed={(sub, reviewed) => setReviewStatus(sub.id, reviewed ? 'reviewed' : 'submitted')}
              onDeleteTake={sub => deleteSubmission(sub.id)}
            />
          ))}
        </div>
      )}

      {assignment.acceptsVideoSubmissions && subLoading && submissions.length === 0 && (
        <div className="dir-assign-fold-muted">Loading videos…</div>
      )}

      {strays.length > 0 && (
        <section className="dir-assign-fold">
          <button
            type="button"
            className="dir-assign-fold-btn"
            aria-expanded={showStrays}
            onClick={() => setShowStrays(v => !v)}
          >
            {showStrays ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            <span className="dir-assign-fold-label">Videos from students not on this list</span>
            <span className="dir-assign-fold-count">{strays.length}</span>
          </button>
          {showStrays && (
            <div className="dir-assign-fold-body">
              <div className="dir-field-hint" style={{ marginBottom: 8 }}>
                Sent by someone who has since left this ensemble or gone inactive. Kept here so a
                video is never lost just because a roster changed.
              </div>
              {strays.map(sub => (
                <div key={sub.id} className="dir-submission-row">
                  <div className="dir-submission-info">
                    <div className="dir-submission-name">{sub.studentName}</div>
                    <div className="dir-submission-meta">
                      {sub.videoDurationSeconds > 0 ? formatClock(sub.videoDurationSeconds) : 'length unknown'}
                      {' · '}{formatFileSize(sub.fileSize)}
                      {' · '}{new Date(sub.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                    {sub.notes && <div className="dir-submission-notes">{sub.notes}</div>}
                  </div>
                  <div className="dir-submission-actions">
                    <a
                      className="dir-tool-btn"
                      href={sub.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 12, textDecoration: 'none' }}
                    >
                      Watch
                    </a>
                    <button
                      type="button"
                      className="dir-tool-btn"
                      style={{ fontSize: 12 }}
                      onClick={() => { void deleteSubmission(sub.id); }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}


// ── Main view ─────────────────────────────────────────────────

export function AssignmentsView({ initialAssignmentId, initialEnsembleId, allowedEnsembleIds }: {
  /** Opened straight onto one assignment — Today's "coming up" list, search,
   *  an ensemble hub. The assignment is editable from wherever it is shown. */
  initialAssignmentId?: string;
  initialEnsembleId?: string;
  /** Classroom-teacher scope: only these ensembles appear and only their assignments. */
  allowedEnsembleIds?: string[];
} = {}) {
  const { assignments, loading, addAssignment, updateAssignment, deleteAssignment } = useAssignments();
  const { students } = useStudents();
  const { ensembles: allEnsembles } = useEnsembles();
  const ensembles = allowedEnsembleIds
    ? allEnsembles.filter(e => allowedEnsembleIds.includes(e.id))
    : allEnsembles;
  const scopedAssignments = allowedEnsembleIds
    ? assignments.filter(a => a.ensembleIds.some(id => allowedEnsembleIds.includes(id)))
    : assignments;
  const musicEns = musicEnsembles(ensembles);
  const now = useMinuteTick(); // drives the "Scheduled · posts …" chip below

  // Which semester the list opens on. The term list is the school's own
  // (org config, editable in Settings) rather than month arithmetic, because
  // Fall does not start on the first of August — at NWSA it starts Aug 17.
  // An org that configures no terms gets no filter and sees everything.
  const { terms } = useCheckinSettings();
  const today = todayStr();
  const thisTerm = currentTerm(terms, today);
  // Deliberately NOT remembered across visits, unlike the ensemble filter
  // beside it: "default to the semester we are in" is the whole request, and
  // a remembered Spring would quietly defeat it every August.
  // '' = untouched, so the current semester answers. 'all' is the explicit
  // escape hatch, and has to be its own value: an empty string would be read
  // as "untouched" and snap straight back to the current term.
  const [termId, setTermId] = useState<string>('');
  const activeTermId = termId === 'all' ? '' : (termId || thisTerm?.id || '');

  // Remember the director's last ensemble filter so Repertoire/Assignments/
  // Announcements each reopen scoped the way they left them.
  const [filterEns, setFilterEns] = useState(() => {
    if (initialEnsembleId) return initialEnsembleId;
    try { return localStorage.getItem('dir.assignments.ensemble') ?? ''; } catch { return ''; }
  });
  function pickEns(id: string) {
    setFilterEns(id);
    try { localStorage.setItem('dir.assignments.ensemble', id); } catch { /* private mode */ }
  }
  // Individual-only assignments (no ensembleIds) show only under "All".
  const byEnsemble = filterEns
    ? scopedAssignments.filter(a => a.ensembleIds.includes(filterEns))
    : scopedAssignments;
  // An assignment due outside every term (summer) belongs to no semester and
  // shows under "All terms" only — it is not silently filed into the nearest
  // one, which would put a July make-up exam in a term nobody gave it in.
  const shownAssignments = activeTermId
    ? byEnsemble.filter(a => termIdForDate(a.dueDate, terms) === activeTermId)
    : byEnsemble;
  const hiddenByTerm = byEnsemble.length - shownAssignments.length;

  const [addingNew, setAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [gradingId, setGradingId] = useState<string | null>(initialAssignmentId ?? null);

  const editingAssignment = scopedAssignments.find(a => a.id === editingId) ?? null;
  const gradingAssignment = scopedAssignments.find(a => a.id === gradingId) ?? null;

  // Full page replaces the list — no side drawer fighting for vertical space.
  if (gradingAssignment) {
    return (
      <>
        <GradeSheet
          assignment={gradingAssignment}
          students={students}
          onEdit={() => setEditingId(gradingAssignment.id)}
          onClose={() => setGradingId(null)}
        />
        {editingAssignment && (
          <AssignmentForm
            assignment={editingAssignment}
            ensembles={musicEns}
            students={students}
            onSave={async data => {
              await updateAssignment(editingAssignment.id, data);
            }}
            onDelete={async () => {
              await deleteAssignment(editingAssignment.id);
              setGradingId(null);
            }}
            onClose={() => setEditingId(null)}
          />
        )}
      </>
    );
  }

  return (
    <div>
      <div className="dir-section-header">
        <span className="dir-section-title">Assignments &amp; Exams</span>
      </div>

      {!loading && scopedAssignments.length === 0 && (
        <div className="dir-empty">
          <ClipboardCheck size={40} />
          <h3>No assignments yet</h3>
          <p>Tap + to create a playing exam, written test, or performance task for your ensembles.</p>
        </div>
      )}

      {scopedAssignments.length > 0 && (
        <EnsembleFilter ensembles={ensembles} value={filterEns} onChange={pickEns} />
      )}

      {scopedAssignments.length > 0 && terms.length > 0 && (
        <div className="dir-assign-term-row">
          <label className="dir-assign-term-label" htmlFor="dir-assign-term">Semester</label>
          <select
            id="dir-assign-term"
            className="dir-select dir-assign-term-select"
            value={termId === 'all' ? 'all' : activeTermId}
            onChange={e => setTermId(e.target.value)}
          >
            {termsNewestFirst(terms).map(t => (
              <option key={t.id} value={t.id}>
                {t.name}{t.id === thisTerm?.id ? ' · now' : ''}
              </option>
            ))}
            <option value="all">All semesters</option>
          </select>
          {hiddenByTerm > 0 && (
            <span className="dir-assign-term-hidden">
              {hiddenByTerm} from other semesters hidden
            </span>
          )}
        </div>
      )}

      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {scopedAssignments.length > 0 && shownAssignments.length === 0 && (
          <div className="dir-empty-inline">
            {byEnsemble.length > 0
              ? 'No assignments this semester — pick another above, or “All semesters”.'
              : 'No assignments for this ensemble.'}
          </div>
        )}
        {shownAssignments.map(a => {
          const ensembleNames = a.ensembleIds
            .map(eid => ensembles.find(e => e.id === eid)?.name)
            .filter(Boolean)
            .join(', ');
          return (
            <div key={a.id} className="dir-assign-card" onClick={() => setGradingId(a.id)}>
              <div className="dir-assign-card-top">
                <span
                  className="dir-assign-type-badge"
                  style={{ background: TYPE_COLORS[a.type] + '22', color: TYPE_COLORS[a.type] }}
                >
                  {a.type}
                </span>
                <span className="dir-assign-card-due">
                  Due {formatDate(a.dueDate, { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <div className="dir-assign-card-title">{a.title}</div>
              {a.publishAt && a.publishAt > now && (
                <div className="dir-ann-scheduled">
                  <Clock size={11} style={{ verticalAlign: '-1.5px' }} /> Scheduled · posts{' '}
                  {new Date(a.publishAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </div>
              )}
              {ensembleNames && <div className="dir-assign-card-ens">{ensembleNames}</div>}
              {/* Summary card, same as the student's: the instructions are a
                  page of text for a playing exam and belong on the sheet you
                  open, not stacked three deep in a list. */}
              {a.description && (
                <div className="dir-assign-card-desc">{richTextToPlain(a.description).replace(/\s+/g, ' ').trim()}</div>
              )}
            </div>
          );
        })}
      </div>

      <button className="dir-fab" onClick={() => setAddingNew(true)} aria-label="New assignment">
        <Plus size={22} />
      </button>

      {addingNew && (
        <AssignmentForm
          assignment={null}
          ensembles={musicEns}
          students={students}
          onSave={addAssignment}
          onClose={() => setAddingNew(false)}
        />
      )}

      {editingAssignment && (
        <AssignmentForm
          assignment={editingAssignment}
          ensembles={musicEns}
          students={students}
          onSave={data => updateAssignment(editingAssignment.id, data)}
          onDelete={() => deleteAssignment(editingAssignment.id)}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
