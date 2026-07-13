import { useState } from 'react';
import { Plus, Pencil, Pin, ChevronLeft } from 'lucide-react';
import { useAnnouncements } from '../hooks/useAnnouncements';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useEnsembles } from '../hooks/useEnsembles';
import { ensembleColor, parseDate, musicEnsembles } from '../utils';
import { NotesText } from '../../public/components/NotesText';
import type { Announcement } from '../types';

interface Props {
  onClose: () => void;
  /** Render as a full page (menu tab) instead of a bottom-sheet overlay. */
  asTab?: boolean;
  /** Open this announcement's editor as soon as the list loads (dashboard tap-to-edit). */
  initialId?: string;
}

export function AnnouncementManager({ onClose, asTab, initialId }: Props) {
  const { announcements, addAnnouncement, updateAnnouncement, deleteAnnouncement } = useAnnouncements();
  const { ensembles } = useEnsembles();
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null);
  const musicEns = musicEnsembles(ensembles);
  const [filterEns, setFilterEns] = useState(() => {
    try { return localStorage.getItem('dir.announcements.ensemble') ?? ''; } catch { return ''; }
  });
  function pickEns(id: string) {
    const next = filterEns === id ? '' : id;
    setFilterEns(next);
    try { localStorage.setItem('dir.announcements.ensemble', next); } catch { /* private mode */ }
  }
  // Per-ensemble filter; school-wide posts (ensembleId null) always show.
  const shown = filterEns
    ? announcements.filter(a => a.ensembleId === filterEns || a.ensembleId === null)
    : announcements;

  // Deep link from the Today dashboard: jump straight into that announcement
  // (adjust-state-during-render, guarded by the consumed id).
  const [consumedId, setConsumedId] = useState<string | null>(null);
  if (initialId && consumedId !== initialId && announcements.length > 0) {
    setConsumedId(initialId);
    const target = announcements.find(a => a.id === initialId);
    if (target) setEditing(target);
  }

  const ensembleName = (id: string | null) =>
    id === null ? 'All ensembles' : ensembles.find(e => e.id === id)?.name ?? 'Unknown';

  if (editing) {
    return (
      <AnnouncementForm
        announcement={editing === 'new' ? null : editing}
        ensembles={musicEns}
        onSave={async data => {
          if (editing === 'new') await addAnnouncement(data);
          else await updateAnnouncement(editing.id, data);
        }}
        onDelete={editing !== 'new' ? async () => deleteAnnouncement(editing.id) : undefined}
        onBack={() => setEditing(null)}
        onClose={asTab ? () => setEditing(null) : onClose}
        asTab={asTab}
      />
    );
  }

  const inner = (
    <>
        {musicEns.length > 0 && announcements.length > 0 && (
          <div className="dir-tabs">
            <button className={`dir-tab ${!filterEns ? 'active' : ''}`} onClick={() => pickEns('')}>All</button>
            {musicEns.map(e => (
              <button key={e.id} className={`dir-tab ${filterEns === e.id ? 'active' : ''}`} onClick={() => pickEns(e.id)}>
                {e.name}
              </button>
            ))}
          </div>
        )}
        <div className="dir-drawer-body">
          {announcements.length === 0 ? (
            <div className="dir-empty-inline">No announcements yet. Post one to show it on the public site.</div>
          ) : shown.length === 0 ? (
            <div className="dir-empty-inline">No announcements for this ensemble.</div>
          ) : (
            shown.map(a => (
              <div key={a.id} className="dir-ens-row" onClick={() => setEditing(a)}>
                <span className="dir-ens-swatch" style={{ background: a.ensembleId ? ensembleColor(ensembles.find(e => e.id === a.ensembleId)) : '#64748b' }} />
                <div className="dir-ens-info">
                  <div className="dir-ens-name">
                    {a.pinned && <Pin size={12} style={{ verticalAlign: '-1px', marginRight: 4 }} />}
                    {a.title}
                  </div>
                  <div className="dir-ens-sub">
                    {ensembleName(a.ensembleId)}
                    {a.expiresOn ? ` · through ${parseDate(a.expiresOn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                  </div>
                  {a.body && <div className="dir-ann-body"><NotesText text={a.body} /></div>}
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
    </>
  );

  if (asTab) {
    return <div className="dir-tab-page">{inner}</div>;
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">Announcements</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        {inner}
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
  asTab?: boolean;
}

function AnnouncementForm({ announcement, ensembles, onSave, onDelete, onBack, onClose, asTab }: FormProps) {
  const [title, setTitle] = useState(announcement?.title ?? '');
  const [body, setBody] = useState(announcement?.body ?? '');
  const [ensembleId, setEnsembleId] = useState<string | null>(announcement?.ensembleId ?? null);
  const [titleEs, setTitleEs] = useState(announcement?.titleEs ?? '');
  const [bodyEs, setBodyEs] = useState(announcement?.bodyEs ?? '');
  const [pinned, setPinned] = useState(announcement?.pinned ?? false);
  const [priority, setPriority] = useState<'info' | 'important' | 'urgent'>(announcement?.priority ?? 'info');
  const [expiresOn, setExpiresOn] = useState(announcement?.expiresOn ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    setSaveError('');
    try {
      await onSave({
        title: title.trim(),
        body: body.trim() || undefined,
        ensembleId,
        priority: priority === 'info' ? undefined : priority,
        titleEs: titleEs.trim() || undefined,
        bodyEs: bodyEs.trim() || undefined,
        pinned: pinned || undefined,
        expiresOn: expiresOn || undefined,
        createdAt: announcement?.createdAt ?? Date.now(),
      });
      // Urgent announcements also enter the notification relay queue (#21):
      // a scheduled Power Automate flow posts them to Teams / parent email.
      // Only on the FIRST urgent save — editing a typo must not re-notify.
      const wasUrgent = announcement?.priority === 'urgent';
      if (priority === 'urgent' && !wasUrgent && db) {
        try {
          await addDoc(collection(db, 'notifyQueue'), {
            kind: 'urgent-announcement',
            title: title.trim(),
            body: body.trim() || undefined,
            ensembleIds: ensembleId ? [ensembleId] : [],
            createdAt: Date.now(),
            processedAt: null,
          });
        } catch { /* relay is best-effort; the announcement itself saved */ }
      }
      onBack();
    } catch (e) {
      setSaving(false);
      setSaveError(e instanceof Error ? e.message : 'Could not post — try again.');
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

  const formInner = (
    <>
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
            <label className="dir-label">Spanish translation (optional)</label>
            <input className="dir-input" value={titleEs} onChange={e => setTitleEs(e.target.value)} placeholder="Título en español" />
            <textarea className="dir-input dir-textarea" style={{ marginTop: 6 }} value={bodyEs} onChange={e => setBodyEs(e.target.value)} rows={3} placeholder="Mensaje en español (opcional)" />
            <div className="dir-field-hint">Families reading in Español see this version; posts with a translation show an ES button.</div>
          </div>

          <div className="dir-field">
            <label className="dir-label">Show to</label>
            <select className="dir-input" value={ensembleId ?? ''} onChange={e => setEnsembleId(e.target.value || null)}>
              <option value="">All ensembles (school-wide)</option>
              {ensembles.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>

          <div className="dir-field">
            <label className="dir-label">Urgency</label>
            <div className="dir-segment">
              <button type="button" className={`dir-segment-btn ${priority === 'info' ? 'active' : ''}`} onClick={() => setPriority('info')}>Info</button>
              <button type="button" className={`dir-segment-btn ${priority === 'important' ? 'active' : ''}`} onClick={() => setPriority('important')}>Important</button>
              <button type="button" className={`dir-segment-btn ${priority === 'urgent' ? 'active' : ''}`} onClick={() => setPriority('urgent')}>🚨 Urgent</button>
            </div>
            <div className="dir-field-hint">Urgent shows as a red banner on every public page. Important gets a gold edge.</div>
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
        {saveError && (
          <div style={{ padding: '4px 16px 0', fontSize: 13, color: 'var(--dir-danger)' }}>{saveError}</div>
        )}
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onBack}>Back</button>
          <button className="dir-btn dir-btn-primary" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? 'Saving…' : 'Post'}
          </button>
        </div>
    </>
  );

  if (asTab) {
    return (
      <div className="dir-tab-page">
        <div className="dir-sc-panel-head">
          <button className="dir-drawer-back" onClick={onBack}><ChevronLeft size={18} /> Back</button>
          <div className="dir-sc-student">
            <div className="dir-sc-student-name">{announcement ? 'Edit Announcement' : 'New Announcement'}</div>
          </div>
        </div>
        {formInner}
      </div>
    );
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <button className="dir-drawer-back" onClick={onBack}><ChevronLeft size={18} /> Back</button>
          <span className="dir-drawer-title">{announcement ? 'Edit Announcement' : 'New Announcement'}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        {formInner}
      </div>
    </div>
  );
}
