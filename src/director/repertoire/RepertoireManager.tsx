import { useState, useMemo } from 'react';
import { Plus, Pencil, Music } from 'lucide-react';
import { useRepertoire } from '../hooks/useRepertoire';
import { useEnsembles } from '../hooks/useEnsembles';
import { useEvents } from '../hooks/useEvents';
import { ensembleColor, parseDate } from '../utils';
import type { RepertoirePiece, CalendarEvent, Ensemble } from '../types';

interface Props {
  onClose: () => void;
  /** Pre-scope the manager to one ensemble (from its editor). */
  ensembleId?: string;
}

export function RepertoireManager({ onClose, ensembleId }: Props) {
  const { pieces, addPiece, updatePiece, deletePiece } = useRepertoire();
  const { ensembles } = useEnsembles();
  const { events } = useEvents();
  const [editing, setEditing] = useState<RepertoirePiece | 'new' | null>(null);

  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);
  const shown = ensembleId ? pieces.filter(p => p.ensembleId === ensembleId) : pieces;

  if (editing) {
    const piece = editing === 'new' ? null : editing;
    const scopedEnsemble = piece?.ensembleId ?? ensembleId;
    const nextOrder = (pieces.filter(p => p.ensembleId === (scopedEnsemble ?? p.ensembleId)).reduce((m, p) => Math.max(m, p.order ?? 0), 0)) + 1;
    return (
      <RepertoireForm
        piece={piece}
        ensembles={ensembles}
        events={events}
        lockedEnsembleId={ensembleId}
        nextOrder={nextOrder}
        onSave={async data => {
          if (editing === 'new') await addPiece(data);
          else await updatePiece(editing.id, data);
        }}
        onDelete={editing !== 'new' ? async () => deletePiece(editing.id) : undefined}
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
          <span className="dir-drawer-title">Repertoire{ensembleId ? ` · ${ensembleMap[ensembleId]?.name ?? ''}` : ''}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          {shown.length === 0 ? (
            <div className="dir-empty-inline">No repertoire yet. Add a piece and link it to a concert.</div>
          ) : (
            shown.map(p => (
              <div key={p.id} className="dir-ens-row" onClick={() => setEditing(p)}>
                <span className="dir-ens-swatch" style={{ background: ensembleColor(ensembleMap[p.ensembleId]) }} />
                <div className="dir-ens-info">
                  <div className="dir-ens-name"><Music size={12} style={{ verticalAlign: '-1px', marginRight: 4 }} />{p.title}</div>
                  <div className="dir-ens-sub">
                    {[p.composer, ensembleId ? null : ensembleMap[p.ensembleId]?.name].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                <button className="dir-icon-btn" onClick={e => { e.stopPropagation(); setEditing(p); }} aria-label="Edit">
                  <Pencil size={16} />
                </button>
              </div>
            ))
          )}
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-primary" onClick={() => setEditing('new')}>
            <Plus size={16} style={{ verticalAlign: '-3px' }} /> Add Piece
          </button>
        </div>
      </div>
    </div>
  );
}

interface FormProps {
  piece: RepertoirePiece | null;
  ensembles: Ensemble[];
  events: CalendarEvent[];
  lockedEnsembleId?: string;
  nextOrder: number;
  onSave: (data: Omit<RepertoirePiece, 'id'>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onBack: () => void;
  onClose: () => void;
}

function RepertoireForm({ piece, ensembles, events, lockedEnsembleId, nextOrder, onSave, onDelete, onBack, onClose }: FormProps) {
  const [ensembleId, setEnsembleId] = useState(piece?.ensembleId ?? lockedEnsembleId ?? ensembles[0]?.id ?? '');
  const [title, setTitle] = useState(piece?.title ?? '');
  const [composer, setComposer] = useState(piece?.composer ?? '');
  const [arranger, setArranger] = useState(piece?.arranger ?? '');
  const [notes, setNotes] = useState(piece?.notes ?? '');
  const [partsUrl, setPartsUrl] = useState(piece?.partsUrl ?? '');
  const [eventIds, setEventIds] = useState<string[]>(piece?.eventIds ?? []);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Concerts/events for the chosen ensemble that this piece can be programmed on.
  const linkableEvents = useMemo(
    () => events
      .filter(e => e.ensembleIds.includes(ensembleId) && (e.type === 'Concert' || e.type === 'Event'))
      .sort((a, b) => a.date.localeCompare(b.date)),
    [events, ensembleId],
  );

  function toggleEvent(id: string) {
    setEventIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }

  async function handleSave() {
    if (!title.trim() || !ensembleId) return;
    setSaving(true);
    await onSave({
      ensembleId,
      title: title.trim(),
      composer: composer.trim() || undefined,
      arranger: arranger.trim() || undefined,
      notes: notes.trim() || undefined,
      partsUrl: partsUrl.trim() || undefined,
      eventIds: eventIds.length ? eventIds : undefined,
      order: piece?.order ?? nextOrder,
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
          <span className="dir-drawer-title">{piece ? 'Edit Piece' : 'New Piece'}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          {!lockedEnsembleId && (
            <div className="dir-field">
              <label className="dir-label">Ensemble *</label>
              <select className="dir-input" value={ensembleId} onChange={e => setEnsembleId(e.target.value)}>
                {ensembles.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}

          <div className="dir-field">
            <label className="dir-label">Title *</label>
            <input className="dir-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Symphony No. 5" />
          </div>

          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">Composer</label>
              <input className="dir-input" value={composer} onChange={e => setComposer(e.target.value)} placeholder="e.g. Beethoven" />
            </div>
            <div className="dir-field">
              <label className="dir-label">Arranger</label>
              <input className="dir-input" value={arranger} onChange={e => setArranger(e.target.value)} placeholder="optional" />
            </div>
          </div>

          <div className="dir-field">
            <label className="dir-label">Parts / sheet music link</label>
            <input className="dir-input" value={partsUrl} onChange={e => setPartsUrl(e.target.value)} placeholder="https://drive.google.com/…" inputMode="url" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Notes</label>
            <textarea className="dir-input dir-textarea" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Movement, edition, etc." />
          </div>

          <div className="dir-field">
            <label className="dir-label">Programmed for</label>
            {linkableEvents.length === 0 ? (
              <div className="dir-empty-inline">No concerts/events for this ensemble yet. Create one in Schedule first.</div>
            ) : (
              <div className="dir-checklist">
                {linkableEvents.map(ev => (
                  <label key={ev.id} className="dir-check-row">
                    <input type="checkbox" checked={eventIds.includes(ev.id)} onChange={() => toggleEvent(ev.id)} />
                    <span>{ev.title || ev.type} · {parseDate(ev.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {piece && onDelete && (
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
          <button className="dir-btn dir-btn-ghost" onClick={onBack}>Back</button>
          <button className="dir-btn dir-btn-primary" onClick={handleSave} disabled={saving || !title.trim() || !ensembleId}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
