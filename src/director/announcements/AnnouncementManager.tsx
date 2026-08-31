import { useState } from 'react';
import { Plus, Pencil, Pin, ChevronLeft, Clock, Printer, Archive, Inbox, Link2, X } from 'lucide-react';
import { useAnnouncements, useMinuteTick, isArchived } from '../hooks/useAnnouncements';
import { queueUrgentRelay, markRelayHandled } from './urgentRelay';
import { useEnsembles } from '../hooks/useEnsembles';
import { ensembleColor, parseDate, musicEnsembles, toDateStr } from '../utils';
import { NotesText } from '../../public/components/NotesText';
import { EnsembleFilter } from '../components/EnsembleFilter';
import { PrintableUpdates } from './PrintableUpdates';
import { useModalA11y } from '../../shared/useModalA11y';
import { MAX_ANNOUNCEMENT_LINKS, type Announcement, type AnnouncementLink } from '../types';
import { RichTextArea } from '../components/RichTextArea';
import { LinkPicker } from '../components/LinkPicker';
import { whenQueued } from '../writeStatus';
import { useCurrentDirector } from '../currentDirector';

interface Props {
  onClose: () => void;
  /** Render as a full page (menu tab) instead of a bottom-sheet overlay. */
  asTab?: boolean;
  /** Open this announcement's editor as soon as the list loads (dashboard tap-to-edit). */
  initialId?: string;
  /** Preselect ensemble filter (from ensemble/class hub). */
  initialEnsembleId?: string;
}

export function AnnouncementManager({ onClose, asTab, initialId, initialEnsembleId }: Props) {
  const { announcements, addAnnouncement, updateAnnouncement, deleteAnnouncement, archiveAnnouncement, restoreAnnouncement } = useAnnouncements();
  const me = useCurrentDirector();
  const isOwner = me?.role === 'owner';
  const { ensembles } = useEnsembles();
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null);
  const [printing, setPrinting] = useState(false);
  const [view, setView] = useState<'active' | 'archived'>('active');
  const musicEns = musicEnsembles(ensembles);
  const [filterEns, setFilterEns] = useState(() => {
    if (initialEnsembleId) return initialEnsembleId;
    try { return localStorage.getItem('dir.announcements.ensemble') ?? ''; } catch { return ''; }
  });
  function pickEns(id: string) {
    setFilterEns(id);
    try { localStorage.setItem('dir.announcements.ensemble', id); } catch { /* private mode */ }
  }
  // Per-ensemble filter; school-wide posts (ensembleId null) always show.
  const byView = announcements.filter(a => {
    const archived = isArchived(a);
    if (view === 'archived') {
      if (!archived) return false;
      // Owner sees everyone's archive; other staff see only their own.
      return isOwner || a.createdByEmail === me?.email;
    }
    return !archived;
  });
  const shown = filterEns
    ? byView.filter(a => a.ensembleId === filterEns || a.ensembleId === null)
    : byView;
  const archivedCount = announcements.filter(a =>
    isArchived(a) && (isOwner || a.createdByEmail === me?.email)).length;

  // Deep link from the Today dashboard: jump straight into that announcement
  // (adjust-state-during-render, guarded by the consumed id).
  const [consumedId, setConsumedId] = useState<string | null>(null);
  if (initialId && consumedId !== initialId && announcements.length > 0) {
    setConsumedId(initialId);
    const target = announcements.find(a => a.id === initialId);
    if (target) setEditing(target);
  }

  // (The publish-time relay sweep for scheduled urgent posts lives in
  // useUrgentRelaySweep, mounted by the DirectorApp shell — so it runs
  // whenever any director has the Hub open, not just this screen.)
  const now = useMinuteTick(); // drives the "Scheduled · posts …" chips below

  const ensembleName = (id: string | null) =>
    id === null ? 'All ensembles' : ensembles.find(e => e.id === id)?.name ?? 'Unknown';

  if (editing) {
    return (
      <AnnouncementForm
        announcement={editing === 'new' ? null : editing}
        ensembles={musicEns}
        onSave={async data => {
          let id: string | undefined;
          if (editing === 'new') id = await addAnnouncement(data);
          else { await updateAnnouncement(editing.id, data); id = editing.id; }
          // Urgent announcements enter the notification relay queue (#21).
          // Queue now unless the post is scheduled for later (the sweep in
          // urgentRelay.ts handles those when they go live). Guards:
          //   • wasLiveUrgent — the post already went out as urgent (editing a
          //     typo must not re-notify). A post still WAITING to publish
          //     (publishAt set, relay not yet queued) is NOT live — clearing
          //     its schedule to "post now" must send the relay it never got.
          //   • queueUrgentRelay itself never overwrites an existing entry,
          //     so even a mistaken second call can't re-send the blast.
          const scheduledLater = !!data.publishAt && data.publishAt > Date.now();
          const wasLiveUrgent = editing !== 'new' && editing.priority === 'urgent'
            && !(editing.publishAt && !editing.relayQueuedAt);
          if (id && data.priority === 'urgent' && !scheduledLater && !wasLiveUrgent) {
            try {
              await queueUrgentRelay({
                id, title: data.title, body: data.body, ensembleId: data.ensembleId, links: data.links,
              });
              await markRelayHandled(id);
            } catch { /* relay is best-effort; the announcement itself saved */ }
          }
        }}
        onDelete={editing !== 'new' ? async () => deleteAnnouncement(editing.id) : undefined}
        onArchive={editing !== 'new' && !isArchived(editing) ? async () => archiveAnnouncement(editing.id) : undefined}
        onRestore={editing !== 'new' && isArchived(editing) ? async () => restoreAnnouncement(editing.id) : undefined}
        onBack={() => setEditing(null)}
        onClose={asTab ? () => setEditing(null) : onClose}
        asTab={asTab}
      />
    );
  }

  const inner = (
    <>
        {asTab && (
          <div className="dir-section-header">
            <span className="dir-section-title">Announcements</span>
            <button className="dir-tool-btn" onClick={() => setPrinting(true)}>
              <Printer size={14} /> Print
            </button>
          </div>
        )}
        {announcements.length > 0 && (
          <div className="dir-messages-toolbar" style={{ marginBottom: 8 }}>
            <button
              className={`dir-tool-btn${view === 'active' ? ' active' : ''}`}
              onClick={() => setView('active')}
            >
              <Inbox size={15} /> Active
            </button>
            <button
              className={`dir-tool-btn${view === 'archived' ? ' active' : ''}`}
              onClick={() => setView('archived')}
            >
              <Archive size={15} /> Archived{archivedCount > 0 ? ` (${archivedCount})` : ''}
            </button>
          </div>
        )}
        {announcements.length > 0 && (
          <EnsembleFilter ensembles={ensembles} value={filterEns} onChange={pickEns} />
        )}
        <div className="dir-drawer-body">
          {announcements.length === 0 ? (
            <div className="dir-empty-inline">No announcements yet. Post one to show it on the public site.</div>
          ) : shown.length === 0 ? (
            <div className="dir-empty-inline">
              {view === 'archived'
                ? 'Nothing archived yet. Archive a post to keep it here instead of deleting it.'
                : 'No announcements for this ensemble.'}
            </div>
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
                    {a.publishAt && a.publishAt > now && (
                      <span className="dir-ann-scheduled">
                        <Clock size={11} style={{ verticalAlign: '-1.5px' }} /> Scheduled · posts{' '}
                        {new Date(a.publishAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        {' · '}
                      </span>
                    )}
                    {isOwner && a.createdBy && (
                      <span>{a.createdBy}{a.createdByEmail === me?.email ? ' (you)' : ''}{' · '}</span>
                    )}
                    {ensembleName(a.ensembleId)}
                    {a.expiresOn ? ` · through ${parseDate(a.expiresOn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                    {isArchived(a) && a.archivedAt ? ` · archived ${new Date(a.archivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
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
    return (
      <>
        <div className="dir-tab-page">{inner}</div>
        {printing && <PrintableUpdates onClose={() => setPrinting(false)} />}
      </>
    );
  }

  return (
    <>
      <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="dir-drawer">
          <div className="dir-drawer-handle" />
          <div className="dir-drawer-header">
            <span className="dir-drawer-title">Announcements</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="dir-icon-btn" onClick={() => setPrinting(true)} aria-label="Print updates" title="Print updates">
                <Printer size={16} />
              </button>
              <button className="dir-drawer-close" onClick={onClose}>×</button>
            </div>
          </div>
          {inner}
        </div>
      </div>
      {printing && <PrintableUpdates onClose={() => setPrinting(false)} />}
    </>
  );
}

interface FormProps {
  announcement: Announcement | null;
  ensembles: { id: string; name: string }[];
  onSave: (data: Omit<Announcement, 'id'>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onArchive?: () => Promise<void>;
  onRestore?: () => Promise<void>;
  onBack: () => void;
  onClose: () => void;
  asTab?: boolean;
}

function AnnouncementForm({ announcement, ensembles, onSave, onDelete, onArchive, onRestore, onBack, onClose, asTab }: FormProps) {
  // Drawer mode only — asTab renders as ordinary page content, not an
  // overlay, so there's no back-gesture-closes-overlay behavior to wire up.
  const panelRef = useModalA11y<HTMLDivElement>(onBack, !asTab, { closeOnBack: true });
  const [title, setTitle] = useState(announcement?.title ?? '');
  const [body, setBody] = useState(announcement?.body ?? '');
  const [ensembleId, setEnsembleId] = useState<string | null>(announcement?.ensembleId ?? null);
  const [titleEs, setTitleEs] = useState(announcement?.titleEs ?? '');
  const [bodyEs, setBodyEs] = useState(announcement?.bodyEs ?? '');
  const [pinned, setPinned] = useState(announcement?.pinned ?? false);
  const [links, setLinks] = useState<AnnouncementLink[]>(announcement?.links ?? []);
  const [pickingLink, setPickingLink] = useState(false);
  const [priority, setPriority] = useState<'info' | 'important' | 'urgent'>(announcement?.priority ?? 'info');
  const [expiresOn, setExpiresOn] = useState(announcement?.expiresOn ?? '');
  // Scheduled publishing: a date + time pair the post stays hidden until.
  const [publishDate, setPublishDate] = useState(() =>
    announcement?.publishAt ? toDateStr(new Date(announcement.publishAt)) : '');
  const [publishTime, setPublishTime] = useState(() => {
    if (!announcement?.publishAt) return '';
    const d = new Date(announcement.publishAt);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  // The date/time fields only exist while this is on — off means "post now".
  const [scheduleOn, setScheduleOn] = useState(!!announcement?.publishAt);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  /** Turning the toggle on prefills tomorrow at 8:00 AM so the fields are
   *  never blank white boxes; turning it off clears the schedule. */
  function toggleSchedule() {
    if (scheduleOn) {
      setScheduleOn(false);
      setPublishDate('');
      setPublishTime('');
    } else {
      setScheduleOn(true);
      if (!publishDate) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setPublishDate(toDateStr(tomorrow));
        setPublishTime('08:00');
      }
    }
  }

  /** Combine the schedule inputs into epoch ms (local time). Date with no
   *  time means midnight — visible all that day. Toggle off = post now.
   *  (The urgent Teams/email relay is queued by the manager: immediately for
   *  live posts, at publish time for scheduled ones.) */
  function publishAtValue(): number | undefined {
    if (!scheduleOn || !publishDate) return undefined;
    const [y, mo, d] = publishDate.split('-').map(Number);
    const [h, mi] = (publishTime || '00:00').split(':').map(Number);
    return new Date(y, mo - 1, d, h || 0, mi || 0).getTime();
  }
  const scheduledPreview = publishAtValue();
  const nowTick = useMinuteTick();
  const isScheduling = !!scheduledPreview && scheduledPreview > nowTick;

  async function handleSave() {
    if (!title.trim()) return;
    // A post scheduled to publish after its own "Hide after" date would never
    // show anywhere — catch the crossed dates instead of saving a ghost.
    if (isScheduling && expiresOn && publishDate > expiresOn) {
      setSaveError('The publish date is after the "Hide after" date — this post would never appear. Adjust one of the dates.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      await whenQueued(onSave({
        title: title.trim(),
        body: body.trim() || undefined,
        ensembleId,
        priority: priority === 'info' ? undefined : priority,
        titleEs: titleEs.trim() || undefined,
        bodyEs: bodyEs.trim() || undefined,
        pinned: pinned || undefined,
        // Undefined, not [] — Firestore stores an empty array as a real field,
        // and every other optional here follows the same rule.
        links: links.length ? links.slice(0, MAX_ANNOUNCEMENT_LINKS) : undefined,
        expiresOn: expiresOn || undefined,
        publishAt: publishAtValue(),
        createdAt: announcement?.createdAt ?? Date.now(),
      }));
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

  async function handleArchive() {
    if (!onArchive) return;
    setSaving(true);
    setSaveError('');
    try {
      await onArchive();
      onBack();
    } catch (e) {
      setSaving(false);
      setSaveError(e instanceof Error ? e.message : 'Could not archive — try again.');
    }
  }

  async function handleRestore() {
    if (!onRestore) return;
    setSaving(true);
    setSaveError('');
    try {
      await onRestore();
      onBack();
    } catch (e) {
      setSaving(false);
      setSaveError(e instanceof Error ? e.message : 'Could not restore — try again.');
    }
  }

  const formInner = (
    <>
        {pickingLink && (
          <LinkPicker
            onClose={() => setPickingLink(false)}
            onPick={(label, url) => {
              setPickingLink(false);
              // Same address twice adds nothing but clutter.
              setLinks(ls => (ls.some(l => l.url === url) ? ls : [...ls, { label, url }]));
            }}
          />
        )}
        <div className="dir-drawer-body">
          <div className="dir-field">
            <label className="dir-label">Title *</label>
            <input className="dir-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Bring your folder Friday" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Message</label>
            <RichTextArea value={body} onChange={setBody} rows={4} placeholder="Optional details…" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Related links</label>
            {links.length > 0 && (
              <div className="dir-ann-linkrow">
                {links.map((l, i) => (
                  <span key={`${l.url}-${i}`} className="dir-ann-linkchip">
                    <Link2 size={12} />
                    <span className="dir-ann-linkchip-label">{l.label}</span>
                    <button
                      type="button"
                      onClick={() => setLinks(ls => ls.filter((_, j) => j !== i))}
                      aria-label={`Remove ${l.label}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <button
              type="button"
              className="dir-btn dir-btn-ghost"
              style={{ marginTop: links.length ? 8 : 0 }}
              disabled={links.length >= MAX_ANNOUNCEMENT_LINKS}
              onClick={() => setPickingLink(true)}
            >
              <Link2 size={13} /> Add a link
            </button>
            <div className="dir-field-hint">
              {links.length >= MAX_ANNOUNCEMENT_LINKS
                ? `That is the limit of ${MAX_ANNOUNCEMENT_LINKS} — remove one to add another.`
                : 'Shown as buttons under the message. Use these for “here is the thing I am talking about”; links inside the message itself go in with the toolbar’s link button.'}
            </div>
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

          <div className={`dir-field dir-schedule ${scheduleOn ? 'open' : ''}`}>
            <button type="button" className={`dir-toggle dir-schedule-toggle ${scheduleOn ? 'on' : ''}`} onClick={toggleSchedule} aria-pressed={scheduleOn}>
              <span className={`dir-schedule-check ${scheduleOn ? 'checked' : ''}`} aria-hidden="true">{scheduleOn ? '✓' : ''}</span>
              <Clock size={15} /> Send later
            </button>
            {scheduleOn ? (
              <>
                <div className="dir-field-row" style={{ marginTop: 10 }}>
                  <div className="dir-field">
                    <label className="dir-label">Date</label>
                    <input className="dir-input" type="date" value={publishDate} onChange={e => setPublishDate(e.target.value)} aria-label="Publish date" />
                  </div>
                  <div className="dir-field">
                    <label className="dir-label">Time</label>
                    <input className="dir-input" type="time" value={publishTime} onChange={e => setPublishTime(e.target.value)} aria-label="Publish time" />
                  </div>
                </div>
                <div className="dir-field-hint">
                  {isScheduling && scheduledPreview
                    ? `Stays hidden from families until ${new Date(scheduledPreview).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} — it posts itself then. For urgent posts, the Teams/email relay is queued around that moment (whenever a director next has the Hub open).`
                    : 'Pick a future date and time — this announcement stays hidden until then.'}
                </div>
              </>
            ) : (
              <div className="dir-field-hint">Posts immediately. Tap “Send later” to schedule it for a future date and time instead.</div>
            )}
          </div>

          {announcement && onRestore && (
            <button className="dir-btn dir-btn-ghost" onClick={handleRestore} disabled={saving}>
              <Inbox size={14} style={{ verticalAlign: '-2px' }} /> Restore to active
            </button>
          )}

          {announcement && onArchive && (
            <button className="dir-btn dir-btn-ghost" onClick={handleArchive} disabled={saving}>
              <Archive size={14} style={{ verticalAlign: '-2px' }} /> Archive
            </button>
          )}

          {announcement && onDelete && (
            confirmDelete ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="dir-btn dir-btn-danger" style={{ flex: 1 }} onClick={handleDelete} disabled={saving}>Confirm Delete</button>
                <button className="dir-btn dir-btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            ) : (
              <button className="dir-btn dir-btn-danger" onClick={() => setConfirmDelete(true)}>Delete permanently</button>
            )
          )}
        </div>
        {saveError && (
          <div style={{ padding: '4px 16px 0', fontSize: 13, color: 'var(--dir-danger)' }}>{saveError}</div>
        )}
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onBack}>Back</button>
          <button className="dir-btn dir-btn-primary" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? 'Saving…' : isScheduling ? 'Schedule' : 'Post'}
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
      <div className="dir-drawer" role="dialog" aria-modal="true" aria-label={announcement ? 'Edit Announcement' : 'New Announcement'} tabIndex={-1} ref={panelRef}>
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
