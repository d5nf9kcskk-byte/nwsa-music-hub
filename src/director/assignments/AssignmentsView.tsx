import { useState } from 'react';
import { ClipboardCheck, Plus } from 'lucide-react';
import { useAssignments, useAssignmentResults } from '../hooks/useAssignments';
import { useStudents } from '../hooks/useStudents';
import { useEnsembles } from '../hooks/useEnsembles';
import { formatDate } from '../utils';
import { RichTextArea } from '../components/RichTextArea';
import { FileUpload } from '../components/FileUpload';
import type { Assignment, AssignmentType, AssignmentResultStatus, Student, Ensemble, Attachment } from '../types';

const ASSIGNMENT_TYPES: AssignmentType[] = ['Playing Exam', 'Written Test', 'Performance', 'Other'];

const TYPE_COLORS: Record<AssignmentType, string> = {
  'Playing Exam': '#7c3aed',
  'Written Test': '#0891b2',
  'Performance':  '#16a34a',
  'Other':        '#64748b',
};

// ── Assignment form drawer ────────────────────────────────────────────

interface FormProps {
  assignment: Assignment | null;
  ensembles: Ensemble[];
  onSave: (data: Omit<Assignment, 'id'>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

function AssignmentForm({ assignment, ensembles, onSave, onDelete, onClose }: FormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState(assignment?.title ?? '');
  const [type, setType] = useState<AssignmentType>(assignment?.type ?? 'Playing Exam');
  const [description, setDescription] = useState(assignment?.description ?? '');
  const [dueDate, setDueDate] = useState(assignment?.dueDate ?? today);
  const [ensembleIds, setEnsembleIds] = useState<string[]>(assignment?.ensembleIds ?? []);
  const [attachments, setAttachments] = useState<Attachment[]>(assignment?.attachments ?? []);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function toggleEnsemble(id: string) {
    setEnsembleIds(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        type,
        description: description.trim(),
        dueDate,
        ensembleIds,
        createdAt: assignment?.createdAt ?? Date.now(),
        attachments,
      });
      onClose();
    } catch {
      setSaving(false);
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
  const { resultMap, saveResult } = useAssignmentResults(assignment.id);
  const [savingId, setSavingId] = useState<string | null>(null);

  const relevant = students.filter(s =>
    s.status === 'Active' &&
    assignment.ensembleIds.some(eid => s.ensembleIds?.includes(eid))
  ).sort((a, b) => a.name.localeCompare(b.name));

  async function handleStatus(studentId: string, status: AssignmentResultStatus) {
    const existing = resultMap[studentId];
    if (existing?.status === status) return;
    setSavingId(studentId);
    await saveResult(studentId, status);
    setSavingId(null);
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
          onSave={addAssignment}
          onClose={() => setAddingNew(false)}
        />
      )}

      {editingAssignment && (
        <AssignmentForm
          assignment={editingAssignment}
          ensembles={ensembles}
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
