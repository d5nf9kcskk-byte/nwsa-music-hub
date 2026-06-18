import { useState, useEffect } from 'react';
import type { Rehearsal, Ensemble } from '../types';

interface Props {
  rehearsal: Rehearsal | null;
  ensembles: Ensemble[];
  onSave: (data: Omit<Rehearsal, 'id'>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const BLANK: Omit<Rehearsal, 'id'> = {
  ensembleId: '',
  date: todayStr(),
  status: 'Scheduled',
  notes: '',
  repertoire: '',
};

export function RehearsalForm({ rehearsal, ensembles, onSave, onDelete, onClose }: Props) {
  const [form, setForm] = useState<Omit<Rehearsal, 'id'>>(BLANK);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (rehearsal) {
      const { id: _id, ...rest } = rehearsal;
      setForm(rest);
    } else {
      setForm({ ...BLANK, ensembleId: ensembles[0]?.id ?? '' });
    }
  }, [rehearsal, ensembles]);

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSave() {
    if (!form.ensembleId) return;
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
          <span className="dir-drawer-title">{rehearsal ? 'Edit Rehearsal' : 'New Rehearsal'}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-field">
            <label className="dir-label">Ensemble *</label>
            <select className="dir-select" value={form.ensembleId} onChange={e => set('ensembleId', e.target.value)}>
              <option value="">Select ensemble…</option>
              {ensembles.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>

          <div className="dir-field">
            <label className="dir-label">Date *</label>
            <input className="dir-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>

          <div className="dir-field">
            <label className="dir-label">Status</label>
            <select className="dir-select" value={form.status} onChange={e => set('status', e.target.value as Rehearsal['status'])}>
              <option value="Scheduled">Scheduled</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          <div className="dir-field">
            <label className="dir-label">Repertoire</label>
            <input className="dir-input" value={form.repertoire ?? ''} onChange={e => set('repertoire', e.target.value)} placeholder="Pieces / focus areas" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Notes</label>
            <textarea className="dir-textarea" value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} placeholder="Planning notes, cancellation reason, etc." />
          </div>

          {rehearsal && onDelete && (
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
          <button className="dir-btn dir-btn-primary" onClick={handleSave} disabled={saving || !form.ensembleId}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
