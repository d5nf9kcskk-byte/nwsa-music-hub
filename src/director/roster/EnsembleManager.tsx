import { useState } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, Pencil, Plus, CalendarDays } from 'lucide-react';
import { useEnsembles } from '../hooks/useEnsembles';
import { useEvents } from '../hooks/useEvents';
import { ensembleColor, ENSEMBLE_PALETTE, toDateStr, parseDate } from '../utils';
import type { Ensemble } from '../types';

interface Props {
  onClose: () => void;
}

export function EnsembleManager({ onClose }: Props) {
  const { ensembles, addEnsemble, updateEnsemble, deleteEnsemble } = useEnsembles();
  const { addEvent } = useEvents();
  const [editing, setEditing] = useState<Ensemble | 'new' | null>(null);
  const [generating, setGenerating] = useState<Ensemble | null>(null);

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

  if (generating) {
    return (
      <GenerateRehearsalsForm
        ensemble={generating}
        onGenerate={async events => {
          await Promise.all(events.map(e => addEvent(e)));
          setGenerating(null);
        }}
        onBack={() => setGenerating(null)}
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
              <button className="dir-icon-btn" onClick={() => setGenerating(e)} aria-label="Generate rehearsals" title="Generate rehearsals">
                <CalendarDays size={16} />
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
    try {
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

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <button className="dir-drawer-back" onClick={onBack}><ChevronLeft size={18} /> Back</button>
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

// ─── Rehearsal generator ─────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

import type { CalendarEvent } from '../types';

function GenerateRehearsalsForm({ ensemble, onGenerate, onBack, onClose }: {
  ensemble: Ensemble;
  onGenerate: (events: Omit<CalendarEvent, 'id'>[]) => Promise<void>;
  onBack: () => void;
  onClose: () => void;
}) {
  const today = toDateStr(new Date());
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState('');
  const [days, setDays] = useState<number[]>(ensemble.meetingDays ?? []);
  const [startTime, setStartTime] = useState(ensemble.defaultStartTime ?? '');
  const [endTime, setEndTime] = useState(ensemble.defaultEndTime ?? '');
  const [location, setLocation] = useState(ensemble.defaultLocation ?? '');
  const [saving, setSaving] = useState(false);

  function toggleDay(d: number) {
    setDays(ds => ds.includes(d) ? ds.filter(x => x !== d) : [...ds, d]);
  }

  /** Preview: list of dates that would be generated. */
  function previewDates(): string[] {
    if (!fromDate || !toDate || days.length === 0) return [];
    const result: string[] = [];
    const cursor = parseDate(fromDate);
    const end = parseDate(toDate);
    while (cursor <= end) {
      if (days.includes(cursor.getDay())) result.push(toDateStr(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }

  const preview = previewDates();

  async function handleGenerate() {
    if (preview.length === 0) return;
    setSaving(true);
    try {
      const events: Omit<CalendarEvent, 'id'>[] = preview.map(date => ({
        type: 'Rehearsal',
        ensembleIds: [ensemble.id],
        date,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        location: location || undefined,
        status: 'Scheduled',
      }));
      await onGenerate(events);
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <button className="dir-drawer-back" onClick={onBack}><ChevronLeft size={18} /> Back</button>
          <span className="dir-drawer-title">Generate Rehearsals · {ensemble.name}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">From *</label>
              <input className="dir-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
            </div>
            <div className="dir-field">
              <label className="dir-label">To *</label>
              <input className="dir-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
            </div>
          </div>

          <div className="dir-field">
            <label className="dir-label">Rehearsal days *</label>
            <div className="dir-day-row">
              {DAY_NAMES.map((name, d) => (
                <button
                  key={d} type="button"
                  className={`dir-day-btn ${days.includes(d) ? 'active' : ''}`}
                  onClick={() => toggleDay(d)}
                >
                  {name.slice(0, 1)}
                </button>
              ))}
            </div>
          </div>

          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">Start time</label>
              <input className="dir-input" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="dir-field">
              <label className="dir-label">End time</label>
              <input className="dir-input" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>

          <div className="dir-field">
            <label className="dir-label">Location</label>
            <input className="dir-input" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Band Room" />
          </div>

          {preview.length > 0 && (
            <div className="dir-gen-preview">
              <div className="dir-gen-preview-count">{preview.length} rehearsals will be created</div>
              <div className="dir-gen-preview-dates">
                {preview.slice(0, 6).map(d => (
                  <span key={d} className="dir-gen-preview-date">
                    {parseDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                ))}
                {preview.length > 6 && <span className="dir-gen-preview-date dir-muted">+{preview.length - 6} more</span>}
              </div>
            </div>
          )}

          {fromDate && toDate && days.length > 0 && preview.length === 0 && (
            <div className="dir-empty-inline">No rehearsals fall on the selected days in this range.</div>
          )}
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onBack}>Back</button>
          <button
            className="dir-btn dir-btn-primary"
            onClick={handleGenerate}
            disabled={saving || preview.length === 0}
          >
            {saving ? 'Generating…' : `Generate ${preview.length > 0 ? preview.length : ''} Rehearsals`}
          </button>
        </div>
      </div>
    </div>
  );
}
