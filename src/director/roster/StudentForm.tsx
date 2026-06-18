import { useState, useEffect } from 'react';
import type { Student, Ensemble } from '../types';

interface Props {
  student: Student | null;
  ensembles: Ensemble[];
  onSave: (data: Omit<Student, 'id'>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

const BLANK: Omit<Student, 'id'> = {
  name: '',
  ensembleIds: [],
  instrument: '',
  section: '',
  grade: '',
  status: 'Active',
  email: '',
  parentEmail: '',
};

export function StudentForm({ student, ensembles, onSave, onDelete, onClose }: Props) {
  const [form, setForm] = useState<Omit<Student, 'id'>>(BLANK);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (student) {
      const { id: _id, ...rest } = student;
      setForm(rest);
    } else {
      setForm(BLANK);
    }
  }, [student]);

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function toggleEnsemble(id: string) {
    setForm(f => ({
      ...f,
      ensembleIds: f.ensembleIds.includes(id)
        ? f.ensembleIds.filter(e => e !== id)
        : [...f.ensembleIds, id],
    }));
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave(form);
    onClose();
  }

  async function handleDelete() {
    if (!onDelete) return;
    setSaving(true);
    await onDelete();
    onClose();
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">{student ? 'Edit Student' : 'Add Student'}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-field">
            <label className="dir-label">Name *</label>
            <input className="dir-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Full name" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Ensembles</label>
            <div className="dir-checkbox-group">
              {ensembles.map(e => (
                <label
                  key={e.id}
                  className={`dir-checkbox-tag ${form.ensembleIds.includes(e.id) ? 'checked' : ''}`}
                >
                  <input type="checkbox" checked={form.ensembleIds.includes(e.id)} onChange={() => toggleEnsemble(e.id)} />
                  {e.name}
                </label>
              ))}
            </div>
          </div>

          <div className="dir-field">
            <label className="dir-label">Instrument</label>
            <input className="dir-input" value={form.instrument} onChange={e => set('instrument', e.target.value)} placeholder="e.g. Violin" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Section / Role</label>
            <input className="dir-input" value={form.section ?? ''} onChange={e => set('section', e.target.value)} placeholder="e.g. First Chair" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Grade</label>
            <input className="dir-input" value={form.grade ?? ''} onChange={e => set('grade', e.target.value)} placeholder="e.g. 10th" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Status</label>
            <select className="dir-select" value={form.status} onChange={e => set('status', e.target.value as Student['status'])}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Graduated">Graduated</option>
            </select>
          </div>

          <div className="dir-field">
            <label className="dir-label">Student Email</label>
            <input className="dir-input" type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)} placeholder="optional" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Parent Email</label>
            <input className="dir-input" type="email" value={form.parentEmail ?? ''} onChange={e => set('parentEmail', e.target.value)} placeholder="optional" />
          </div>

          {student && onDelete && (
            confirmDelete ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="dir-btn dir-btn-danger" style={{ flex: 1 }} onClick={handleDelete} disabled={saving}>
                  Confirm Delete
                </button>
                <button className="dir-btn dir-btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            ) : (
              <button className="dir-btn dir-btn-danger" onClick={() => setConfirmDelete(true)}>
                Delete Student
              </button>
            )
          )}
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="dir-btn dir-btn-primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
