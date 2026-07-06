import { useState, useEffect } from 'react';
import type { Student, StudentContact, Ensemble } from '../types';

export interface ContactDraft { email: string; parentEmail: string; phone: string; }

interface Props {
  student: Student | null;
  contact: StudentContact | null;
  ensembles: Ensemble[];
  onSave: (data: Omit<Student, 'id'>, contact: ContactDraft) => Promise<void>;
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
};

const BLANK_CONTACT: ContactDraft = { email: '', parentEmail: '', phone: '' };

export function StudentForm({ student, contact, ensembles, onSave, onDelete, onClose }: Props) {
  const [form, setForm] = useState<Omit<Student, 'id'>>(BLANK);
  const [contactForm, setContactForm] = useState<ContactDraft>(BLANK_CONTACT);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (student) {
      const { id: _id, ...rest } = student;
      setForm({ ...BLANK, ...rest });
    } else {
      setForm(BLANK);
    }
    setContactForm({
      email: contact?.email ?? '',
      parentEmail: contact?.parentEmail ?? '',
      phone: contact?.phone ?? '',
    });
  }, [student, contact]);

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function setContact<K extends keyof ContactDraft>(k: K, v: string) {
    setContactForm(f => ({ ...f, [k]: v }));
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
    setSaveError('');
    try {
      await onSave(form, contactForm);
      onClose();
    } catch (e) {
      setSaving(false);
      setSaveError(e instanceof Error ? e.message : 'Could not save — try again.');
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setSaving(true);
    setSaveError('');
    try {
      await onDelete();
      onClose();
    } catch (e) {
      setSaving(false);
      setSaveError(e instanceof Error ? e.message : 'Could not delete — try again.');
    }
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

          <div className="dir-contact-note">🔒 Visible to signed-in directors here in the roster. Never shown on the public site.</div>

          <div className="dir-field">
            <label className="dir-label">Student Email</label>
            <input className="dir-input" type="email" value={contactForm.email} onChange={e => setContact('email', e.target.value)} placeholder="optional" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Parent Email</label>
            <input className="dir-input" type="email" value={contactForm.parentEmail} onChange={e => setContact('parentEmail', e.target.value)} placeholder="optional" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Phone</label>
            <input className="dir-input" type="tel" value={contactForm.phone} onChange={e => setContact('phone', e.target.value)} placeholder="optional" />
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
        {saveError && (
          <div style={{ padding: '4px 16px 0', fontSize: 13, color: 'var(--dir-danger)' }}>{saveError}</div>
        )}
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
