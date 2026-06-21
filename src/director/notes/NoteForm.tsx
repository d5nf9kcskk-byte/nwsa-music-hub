import { useState, useEffect } from 'react';
import type { ProgressNote, Student } from '../types';

interface Props {
  note: ProgressNote | null;
  students: Student[];
  defaultStudentId?: string;
  onSave: (data: Omit<ProgressNote, 'id'>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const CATEGORIES = ['General', 'Technique', 'Intonation', 'Rhythm', 'Sight-reading', 'Performance'];

export function NoteForm({ note, students, defaultStudentId, onSave, onDelete, onClose }: Props) {
  const [form, setForm] = useState<Omit<ProgressNote, 'id'>>({
    studentId: defaultStudentId ?? '',
    date: todayStr(),
    content: '',
    category: 'General',
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (note) {
      const { id: _id, ...rest } = note;
      setForm(rest);
    } else {
      setForm({
        studentId: defaultStudentId ?? students[0]?.id ?? '',
        date: todayStr(),
        content: '',
        category: 'General',
      });
    }
  }, [note, defaultStudentId, students]);

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSave() {
    if (!form.studentId || !form.content.trim()) return;
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setSaving(true);
    try {
      await onDelete();
      onClose();
    } catch {
      setSaving(false);
    }
  }

  const activeStudents = students.filter(s => s.status === 'Active');

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">{note ? 'Edit Note' : 'New Note'}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-field">
            <label className="dir-label">Student *</label>
            <select className="dir-select" value={form.studentId} onChange={e => set('studentId', e.target.value)}>
              <option value="">Select student…</option>
              {activeStudents.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="dir-field">
            <label className="dir-label">Date</label>
            <input className="dir-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>

          <div className="dir-field">
            <label className="dir-label">Category</label>
            <select className="dir-select" value={form.category ?? ''} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="dir-field">
            <label className="dir-label">Note *</label>
            <textarea
              className="dir-textarea"
              style={{ minHeight: 120 }}
              value={form.content}
              onChange={e => set('content', e.target.value)}
              placeholder="Progress observation, goal, or feedback…"
            />
          </div>

          {note && onDelete && (
            confirmDelete ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="dir-btn dir-btn-danger" style={{ flex: 1 }} onClick={handleDelete} disabled={saving}>Confirm Delete</button>
                <button className="dir-btn dir-btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            ) : (
              <button className="dir-btn dir-btn-danger" onClick={() => setConfirmDelete(true)}>Delete</button>
            )
          )}
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="dir-btn dir-btn-primary" onClick={handleSave} disabled={saving || !form.studentId || !form.content.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
