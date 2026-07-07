import { useState } from 'react';
import { ClipboardCheck, Plus } from 'lucide-react';
import { useAssignments, useAssignmentResults } from '../hooks/useAssignments';
import { useStudents } from '../hooks/useStudents';
import { useEnsembles } from '../hooks/useEnsembles';
import { formatDate, todayStr, studentHasAssignment, ASSIGN_COLOR } from '../utils';
import { sortStudents, type StudentSort } from '../scoreOrder';
import { SortToggle } from '../components/SortToggle';
import { RichTextArea } from '../components/RichTextArea';
import { FileUpload } from '../components/FileUpload';
import type { Assignment, AssignmentType, AssignmentResultStatus, Student, Ensemble, Attachment } from '../types';

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
  const [attachments, setAttachments] = useState<Attachment[]>(assignment?.attachments ?? []);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  function toggleEnsemble(id: string) {
    setEnsembleIds(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  }
  function toggleStudent(id: string) {
    setStudentIds(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  }
  const studentMatches = studentQuery.trim()
    ? students.filter(s => s.status === 'Active' && s.name.toLowerCase().includes(studentQuery.toLowerCase())).slice(0, 8)
    : [];

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    setSaveError('');
    try {
      await Promise.race([
        onSave({
          title: title.trim(),
          type,
          description: description.trim(),
          dueDate,
          ensembleIds,
          studentIds: studentIds.length ? studentIds : undefined,
          formUrl: formUrl.trim() || undefined,
          createdAt: assignment?.createdAt ?? Date.now(),
          attachments,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Save timed out — check your connection')), 15_000)
        ),
      ]);
      onClose();
    } catch (err) {
      setSaving(false);
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
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
            <label className="dir-label">Description / Instructions</label>
            <RichTextArea
              value={description}
              onChange={setDescription}
              placeholder="Optional details, rubric, or instructions"
            />
          </div>

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

// ── Grade sheet drawer ────────────────────────────────────────────

interface GradeSheetProps {
  assignment: Assignment;
  students: Student[];
  onEdit: () => void;
  onClose: () => void;
}

function GradeSheet({ assignment, students, onEdit, onClose }: GradeSheetProps) {
  const { resultMap, saveResult, clearResult } = useAssignmentResults(assignment.id);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [gradeError, setGradeError] = useState('');
  const [sort, setSort] = useState<StudentSort>('scoreOrder');

  // Everyone targeted: ensemble members + any specific individuals, ordered so
  // the director can move down the section (score order) or find a name fast.
  const relevant = sortStudents(
    students.filter(s => s.status === 'Active' && studentHasAssignment(assignment, s.id, s.ensembleIds)),
    sort,
  );

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
      // Without finally, a failed write would leave savingId set and disable
      // this row's buttons for the rest of the session.
      setGradeError(e instanceof Error ? e.message : 'Could not save grade — try again.');
    } finally {
      setSavingId(null);
    }
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
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="dir-drawer-title" style={{ fontSize: 16 }}>{assignment.title}</div>
            <div style={{ fontSize: 12, color: 'var(--dir-text-muted)', marginTop: 2 }}>
              {assignment.type} · Due {formatDate(assignment.dueDate, { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="dir-tool-btn" onClick={onEdit}>Edit</button>
            <button className="dir-drawer-close" onClick={onClose}>×</button>
          </div>
        </div>

        {gradeError && (
          <div style={{ padding: '8px 16px', color: 'var(--dir-danger)', fontSize: 13 }}>⚠ {gradeError}</div>
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

        <div style={{ padding: '6px 16px 0' }}>
          <SortToggle value={sort} onChange={setSort} />
        </div>
        <div className="dir-drawer-body" style={{ gap: 6 }}>
          {relevant.length === 0 ? (
            <div className="dir-empty">
              <p>No active students in these ensembles.</p>
            </div>
          ) : (
            relevant.map(s => {
              const result = resultMap[s.id];
              const status: AssignmentResultStatus = result?.status ?? 'Pending';
              return (
                <div key={s.id} className={`dir-assign-row dir-assign-row-${status.toLowerCase()}`}>
                  <div className="dir-assign-stu">
                    <div className="dir-assign-name">{s.name}</div>
                    <div className="dir-assign-instr">{s.instrument}</div>
                  </div>
                  <div className="dir-assign-btns">
                    {(['Pass', 'Fail', 'Exempt'] as const).map(st => (
                      <button
                        key={st}
                        className={`dir-assign-btn dir-assign-btn-${st.toLowerCase()} ${status === st ? 'active' : ''}`}
                        onClick={() => handleStatus(s.id, st)}
                        disabled={savingId === s.id}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────

export function AssignmentsView() {
  const { assignments, loading, addAssignment, updateAssignment, deleteAssignment } = useAssignments();
  const { students } = useStudents();
  const { ensembles } = useEnsembles();

  const [addingNew, setAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [gradingId, setGradingId] = useState<string | null>(null);

  const editingAssignment = assignments.find(a => a.id === editingId) ?? null;
  const gradingAssignment = assignments.find(a => a.id === gradingId) ?? null;

  return (
    <div>
      <div className="dir-section-header">
        <span className="dir-section-title">Assignments &amp; Exams</span>
      </div>

      {!loading && assignments.length === 0 && (
        <div className="dir-empty">
          <ClipboardCheck size={40} />
          <h3>No assignments yet</h3>
          <p>Tap + to create a playing exam, written test, or performance task for your ensembles.</p>
        </div>
      )}

      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {assignments.map(a => {
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
              {ensembleNames && <div className="dir-assign-card-ens">{ensembleNames}</div>}
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
          ensembles={ensembles}
          students={students}
          onSave={addAssignment}
          onClose={() => setAddingNew(false)}
        />
      )}

      {editingAssignment && (
        <AssignmentForm
          assignment={editingAssignment}
          ensembles={ensembles}
          students={students}
          onSave={data => updateAssignment(editingAssignment.id, data)}
          onDelete={() => deleteAssignment(editingAssignment.id)}
          onClose={() => setEditingId(null)}
        />
      )}

      {gradingAssignment && (
        <GradeSheet
          assignment={gradingAssignment}
          students={students}
          onEdit={() => { setEditingId(gradingAssignment.id); setGradingId(null); }}
          onClose={() => setGradingId(null)}
        />
      )}
    </div>
  );
}
