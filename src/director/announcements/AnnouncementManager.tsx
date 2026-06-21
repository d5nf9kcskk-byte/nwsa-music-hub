import { useState } from 'react';
import { Plus, Pencil, Pin } from 'lucide-react';
import { useAnnouncements } from '../hooks/useAnnouncements';
import { useEnsembles } from '../hooks/useEnsembles';
import { ensembleColor } from '../utils';
import type { Announcement } from '../types';

interface Props {
  onClose: () => void;
}

export function AnnouncementManager({ onClose }: Props) {
  const { announcements, addAnnouncement, updateAnnouncement, deleteAnnouncement } = useAnnouncements();
  const { ensembles } = useEnsembles();
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null);

  const ensembleName = (id: string | null) =>
    id === null ? 'All ensembles' : ensembles.find(e => e.id === id)?.name ?? 'Unknown';

  if (editing) {
    return (
      <AnnouncementForm
        announcement={editing === 'new' ? null : editing}
        ensembles={ensembles}
        onSave={async data => {
          if (editing === 'new') await addAnnouncement(data);
          else await updateAnnouncement(editing.id, data);
        }}
        onDelete={editing !== 'new' ? async () => deleteAnnouncement(editing.id) : undefined}
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
          <span className="dir-drawer-title">Announcements</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          {announcements.length === 0 ? (
            <div className="dir-empty-inline">No announcements yet. Post one to show it on the public site.</div>
          ) : (
            announcements.map(a => (
              <div key={a.id} className="dir-ens-row" onClick={() => setEditing(a)}>
                <span className="dir-ens-swatch" style={{ background: a.ensembleId ? ensembleColor(ensembles.find(e => e.id === a.ensembleId)) : '#64748b' }} />
                <div className="dir-ens-info">
                  <div className="dir-ens-name">
                    {a.pinned && <Pin size={12} style={{ verticalAlign: '-1px', marginRight: 4 }} />}
                    {a.title}
                  </div>
                  <div className="dir-ens-sub">
                    {ensembleName(a.ensembleId)}
                    {a.expiresOn ? ` · until ${a.expiresOn}` : ''}
                  </div>
                </div>
                <button className="dir-icon-btn" onClick={e => { e.stopPropagation(); setEditing(a); }} aria-label="Edit">
                  <Pencil size={16} />
                </button>
              </div>
            ))
          )}
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-primary" onClick={() => setEditing('new')}>
            <Plus size={16} style={{ verticalAlign: '-3px' }} /> New Announcement
          </button>
        </div>
      </div>
    </div>
  );
}

interface FormProps {
  announcement: Announcement | null;
  ensembles: { id: string; name: string }[];
  onSave: (data: Omit<Announcement, 'id'>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onBack: () => void;
  onClose: () => void;
}

function AnnouncementForm({ announcement, ensembles, onSave, onDelete, onBack, onClose }: FormProps) {
  const [title, setTitle] = useState(announcement?.title ?? '');
  const [body, setBody] = useState(announcement?.body ?? '');
  const [ensembleId, setEnsembleId] = useState<string | null>(announcement?.ensembleId ?? null);
  const [pinned, setPinned] = useState(announcement?.pinned ?? false);
  const [expiresOn, setExpiresOn] = useState(announcement?.expiresOn ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        body: body.trim() || undefined,
        ensembleId,
        pinned: pinned || undefined,
        expiresOn: expiresOn || undefined,
        createdAt: announcement?.createdAt ?? Date.now(),
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
          <button className="dir-drawer-back" onClick={onBack}>‹</button>
          <span className="dir-drawer-title">{announcement ? 'Edit Announcement' : 'New Announcement'}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-field">
            <label className="dir-label">Title *</label>
            <input className="dir-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Bring your folder Friday" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Message</label>
            <textarea className="dir-input dir-textarea" value={body} onChange={e => setBody(e.target.value)} rows={4} placeholder="Optional details…" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Show to</label>
            <select className="dir-input" value={ensembleId ?? ''} onChange={e => setEnsembleId(e.target.value || null)}>
              <option value="">All ensembles (school-wide)</option>
              {ensembles.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>

          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">Hide after</label>
              <input className="dir-input" type="date" value={expiresOn} onChange={e => setExpiresOn(e.target.value)} />
            </div>
            <div className="dir-field">
              <label className="dir-label">Pinned</label>
              <button
                type="button"
                className={`dir-toggle ${pinned ? 'on' : ''}`}
                onClick={() => setPinned(p => !p)}
              >
                <Pin size={14} /> {pinned ? 'Pinned' : 'Pin to top'}
              </button>
            </div>
          </div>

          {announcement && onDelete && (
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
          <button className="dir-btn dir-btn-primary" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? 'Saving…' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}
