import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Student, StudentContact, Guardian, Ensemble } from '../types';
import { useModalA11y } from '../../shared/useModalA11y';
import { musicEnsembles } from '../utils';

/** Editable contact: the student email plus an unlimited list of guardians and
 *  any extra columns carried over from the spreadsheet import. */
export interface ContactDraft {
  email: string;
  guardians: Guardian[];
  extra: Record<string, string>;
}

/** Collapse a draft into the stored shape: trim, drop empty guardians, and keep
 *  the flat parentEmail/phone in sync with guardian #1 so the many readers of
 *  those back-compat fields (search, checklists, "missing info" view) keep
 *  working. Never emits `undefined` values (Firestore rejects them). */
function normalizeContact(draft: ContactDraft): Omit<StudentContact, 'id'> {
  const guardians: Guardian[] = draft.guardians
    .map(g => {
      const o: Guardian = {};
      if (g.name?.trim()) o.name = g.name.trim();
      if (g.relation?.trim()) o.relation = g.relation.trim();
      if (g.email?.trim()) o.email = g.email.trim();
      if (g.phone?.trim()) o.phone = g.phone.trim();
      return o;
    })
    .filter(g => g.name || g.relation || g.email || g.phone);
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(draft.extra)) {
    if (v.trim()) extra[k] = v.trim();
  }
  const g0 = guardians[0];
  return {
    email: draft.email.trim(),
    parentEmail: g0?.email ?? '',
    phone: g0?.phone ?? '',
    guardians,
    extra,
  };
}

interface Props {
  student: Student | null;
  contact: StudentContact | null;
  ensembles: Ensemble[];
  onSave: (data: Omit<Student, 'id'>, contact: Omit<StudentContact, 'id'>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

const BLANK: Omit<Student, 'id'> = {
  name: '',
  preferredName: '',
  pronunciation: '',
  ensembleIds: [],
  instrument: '',
  section: '',
  grade: '',
  status: 'Active',
};

const BLANK_CONTACT: ContactDraft = { email: '', guardians: [], extra: {} };

export function StudentForm({ student, contact, ensembles, onSave, onDelete, onClose }: Props) {
  const panelRef = useModalA11y<HTMLDivElement>(onClose);
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
      // Prefer the imported guardians[]; fall back to synthesizing one guardian
      // from the legacy flat parentEmail/phone for pre-import records.
      guardians: contact?.guardians?.length
        ? contact.guardians.map(g => ({ ...g }))
        : (contact?.parentEmail || contact?.phone)
          ? [{ email: contact.parentEmail ?? '', phone: contact.phone ?? '' }]
          : [],
      extra: contact?.extra ? { ...contact.extra } : {},
    });
  }, [student, contact]);

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function setGuardian(i: number, k: keyof Guardian, v: string) {
    setContactForm(f => ({ ...f, guardians: f.guardians.map((g, gi) => gi === i ? { ...g, [k]: v } : g) }));
  }
  function addGuardian() {
    setContactForm(f => ({ ...f, guardians: [...f.guardians, {}] }));
  }
  function removeGuardian(i: number) {
    setContactForm(f => ({ ...f, guardians: f.guardians.filter((_, gi) => gi !== i) }));
  }
  function setExtra(key: string, v: string) {
    setContactForm(f => ({ ...f, extra: { ...f.extra, [key]: v } }));
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
      await onSave(form, normalizeContact(contactForm));
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
      <div className="dir-drawer" role="dialog" aria-modal="true" aria-label={student ? 'Edit student' : 'New student'} tabIndex={-1} ref={panelRef}>
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
              {musicEnsembles(ensembles).map(e => (
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

          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">Goes by <span className="dir-label-hint">optional</span></label>
              <input className="dir-input" value={form.preferredName ?? ''} onChange={e => set('preferredName', e.target.value)} placeholder="e.g. Alex" />
            </div>
            <div className="dir-field">
              <label className="dir-label">Pronounced <span className="dir-label-hint">optional</span></label>
              <input className="dir-input" value={form.pronunciation ?? ''} onChange={e => set('pronunciation', e.target.value)} placeholder="see-oh-MAH-rah" />
            </div>
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
            <input className="dir-input" type="email" inputMode="email" autoComplete="email" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} placeholder="optional" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Parents / Guardians</label>
            {contactForm.guardians.length === 0 && (
              <div className="dir-field-hint" style={{ marginBottom: 6 }}>No parents or guardians on file yet.</div>
            )}
            {contactForm.guardians.map((g, i) => (
              <div key={i} className="dir-guardian-edit">
                <div className="dir-guardian-edit-head">
                  <span className="dir-guardian-edit-num">Parent / Guardian {i + 1}</span>
                  <button type="button" className="dir-guardian-remove" onClick={() => removeGuardian(i)} aria-label={`Remove parent or guardian ${i + 1}`}>
                    <Trash2 size={13} /> Remove
                  </button>
                </div>
                <div className="dir-field-row">
                  <div className="dir-field">
                    <label className="dir-label">Name</label>
                    <input className="dir-input" value={g.name ?? ''} onChange={e => setGuardian(i, 'name', e.target.value)} placeholder="e.g. Maria Alvarez" />
                  </div>
                  <div className="dir-field">
                    <label className="dir-label">Relationship</label>
                    <input className="dir-input" value={g.relation ?? ''} onChange={e => setGuardian(i, 'relation', e.target.value)} placeholder="e.g. Mother" />
                  </div>
                </div>
                <div className="dir-field-row">
                  <div className="dir-field">
                    <label className="dir-label">Email</label>
                    <input className="dir-input" type="email" inputMode="email" value={g.email ?? ''} onChange={e => setGuardian(i, 'email', e.target.value)} placeholder="optional" />
                  </div>
                  <div className="dir-field">
                    <label className="dir-label">Phone</label>
                    <input className="dir-input" type="tel" inputMode="tel" value={g.phone ?? ''} onChange={e => setGuardian(i, 'phone', e.target.value)} placeholder="optional" />
                  </div>
                </div>
              </div>
            ))}
            <button type="button" className="dir-btn dir-btn-ghost dir-guardian-add" onClick={addGuardian}>
              <Plus size={14} /> Add parent / guardian
            </button>
          </div>

          {Object.keys(contactForm.extra).length > 0 && (
            <div className="dir-field">
              <label className="dir-label">Other imported details</label>
              {Object.entries(contactForm.extra).map(([k, v]) => (
                <div key={k} className="dir-field dir-extra-field">
                  <label className="dir-label dir-label-hint">{k}</label>
                  <input className="dir-input" value={v} onChange={e => setExtra(k, e.target.value)} />
                </div>
              ))}
            </div>
          )}

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
