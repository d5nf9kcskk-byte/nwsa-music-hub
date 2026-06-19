import { useState } from 'react';
import { ChevronUp, ChevronDown, Pencil, Plus } from 'lucide-react';
import { useEnsembles } from '../hooks/useEnsembles';
import { ensembleColor, ENSEMBLE_PALETTE } from '../utils';
import type { Ensemble } from '../types';

interface Props {
  onClose: () => void;
}

export function EnsembleManager({ onClose }: Props) {
  const { ensembles, addEnsemble, updateEnsemble, deleteEnsemble } = useEnsembles();
  const [editing, setEditing] = useState<Ensemble | 'new' | null>(null);

  async function move(e: Ensemble, dir: -1 | 1) {
    const sorted = [...ensembles].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex(x => x.id === e.id);
    const swapWith = sorted[idx + dir];
    if (!swapWith) return;
    await Promise.all([
      updateEnsemble(e.id, { order: swapWith.order }),
      updateEnsemble(swapWith.id, { order: e.order }),
    ]);
  }

  if (editing) {
    return (
      <EnsembleForm
        ensemble={editing === 'new' ? null : editing}
        nextOrder={(ensembles.reduce((m, e) => Math.max(m, e.order), 0)) + 1}
        onSave={async data => {
          if (editing === 'new') await addEnsemble(data);
          else await updateEnsemble(editing.id, data);
        }}
        onDelete={editing !== 'new' ? async () => deleteEnsemble(editing.id) : undefined}
        onBack={() => setEditing(null)}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">Manage Ensembles</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          {ensembles.map((e, i) => (
            <div key={e.id} className="dir-ens-row">
              <span className="dir-ens-swatch" style={{ background: ensembleColor(e) }} />
              <div className="dir-ens-info" onClick={() => setEditing(e)}>
                <div className="dir-ens-name">{e.name}</div>
                {e.defaultLocation && <div className="dir-ens-sub">{e.defaultLocation}</div>}
              </div>
              <button className="dir-icon-btn" disabled={i === 0} onClick={() => move(e, -1)} aria-label="Move up">
                <ChevronUp size={18} />
              </button>
              <button className="dir-icon-btn" disabled={i === ensembles.length - 1} onClick={() => move(e, 1)} aria-label="Move down">
                <ChevronDown size={18} />
              </button>
              <button className="dir-icon-btn" onClick={() => setEditing(e)} aria-label="Edit">
                <Pencil size={16} />
              </button>
            </div>
          ))}
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-primary" onClick={() => setEditing('new')}>
            <Plus size={16} style={{ verticalAlign: '-3px' }} /> Add Ensemble
          </button>
        </div>
      </div>
    </div>
  );
}

interface FormProps {
  ensemble: Ensemble | null;
  nextOrder: number;
  onSave: (data: Omit<Ensemble, 'id'>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onBack: () => void;
  onClose: () => void;
}

function EnsembleForm({ ensemble, nextOrder, onSave, onDelete, onBack, onClose }: FormProps) {
  const [name, setName] = useState(ensemble?.name ?? '');
  const [color, setColor] = useState(ensemble?.color ?? '');
  const [location, setLocation] = useState(ensemble?.defaultLocation ?? '');
  const [startTime, setStartTime] = useState(ensemble?.defaultStartTime ?? '');
  const [endTime, setEndTime] = useState(ensemble?.defaultEndTime ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({
      name: name.trim(),
      order: ensemble?.order ?? nextOrder,
      color: color || undefined,
      defaultLocation: location || undefined,
      defaultStartTime: startTime || undefined,
      defaultEndTime: endTime || undefined,
      meetingDays: ensemble?.meetingDays,
    });
    onBack();
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
          <button className="dir-drawer-back" onClick={onBack}>‹</button>
          <span className="dir-drawer-title">{ensemble ? 'Edit Ensemble' : 'New Ensemble'}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-field">
            <label className="dir-label">Name *</label>
            <input className="dir-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Jazz Ensemble" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Color</label>
            <div className="dir-swatch-group">
              {ENSEMBLE_PALETTE.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`dir-swatch ${color === c ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="dir-field">
            <label className="dir-label">Default Location</label>
            <input className="dir-input" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Band Room" />
          </div>

          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">Default Start</label>
              <input className="dir-input" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="dir-field">
              <label className="dir-label">Default End</label>
              <input className="dir-input" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>

          {ensemble && onDelete && (
            confirmDelete ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="dir-btn dir-btn-danger" style={{ flex: 1 }} onClick={handleDelete} disabled={saving}>Confirm Delete</button>
                <button className="dir-btn dir-btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            ) : (
              <button className="dir-btn dir-btn-danger" onClick={() => setConfirmDelete(true)}>Delete Ensemble</button>
            )
          )}
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onBack}>Back</button>
          <button className="dir-btn dir-btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
