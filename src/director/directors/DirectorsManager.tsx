import { useMemo, useState } from 'react';
import { Plus, Trash2, ShieldCheck, GraduationCap, UserCog, ClipboardList, Pencil, Lock, History, ChevronDown, ChevronUp } from 'lucide-react';
import { useDirectors, directorEmailId } from '../hooks/useDirectors';
import type { Director, DirectorRole } from '../hooks/useDirectors';
import { useLoginEvents, LOGIN_LOG_LIMIT } from '../hooks/useLoginEvents';
import { useStudents } from '../hooks/useStudents';
import { useEnsembles } from '../hooks/useEnsembles';
import { useModalA11y } from '../../shared/useModalA11y';
import { musicEnsembles } from '../utils';

interface Props {
  /** Email of the signed-in director, so we can flag "you" and block self-removal. */
  currentEmail: string | null;
  /** Only the Owner may open this screen at all — DirectorApp already hides
   *  the nav entry for everyone else, but the component re-checks itself
   *  (defense in depth: this is the one screen that decides who else has
   *  access to the whole app). */
  currentRole: DirectorRole;
  onClose: () => void;
}

// Deliberately loose — just enough to catch typos, not to police valid addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_LABEL: Record<DirectorRole, string> = { owner: 'Owner', director: 'Director', teacher: 'Teacher', assistant: 'Personnel Assistant' };
const ROLE_ICON: Record<DirectorRole, typeof ShieldCheck> = { owner: ShieldCheck, director: UserCog, teacher: GraduationCap, assistant: ClipboardList };

/**
 * Manage who can sign in and edit the Hub, and at what level (#roles).
 * Owner-only — the app hides this screen's nav entry for everyone else, and
 * firestore.rules independently refuses any write here from a non-Owner, so
 * this is enforcement-grade, not just a UI nicety.
 */
export function DirectorsManager({ currentEmail, currentRole, onClose }: Props) {
  const { directors, loading, addDirector, updateDirector, removeDirector } = useDirectors();
  const { ensembles } = useEnsembles();
  const ensembleName = (id: string) => ensembles.find(e => e.id === id)?.name ?? id;
  const [adding, setAdding] = useState(false);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const panelRef = useModalA11y<HTMLDivElement>(onClose, true, { closeOnBack: true });

  const meId = currentEmail ? directorEmailId(currentEmail) : null;

  async function handleRemove(id: string) {
    setBusy(true);
    try {
      await removeDirector(id);
      setConfirmRemove(null);
    } finally {
      setBusy(false);
    }
  }

  if (currentRole !== 'owner') {
    // Defense in depth: DirectorApp already hides the nav entry that opens
    // this, so reaching here means a stale tab/role change — say so plainly
    // rather than silently no-op'ing.
    return (
      <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="dir-drawer" role="dialog" aria-modal="true" aria-label="Directors" tabIndex={-1} ref={panelRef}>
          <div className="dir-drawer-handle" />
          <div className="dir-drawer-header">
            <span className="dir-drawer-title"><Lock size={16} style={{ verticalAlign: '-2px' }} /> Directors</span>
            <button className="dir-drawer-close" onClick={onClose}>×</button>
          </div>
          <div className="dir-drawer-body">
            <div className="dir-loc-empty">Only the Owner can view or change who has access.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer" role="dialog" aria-modal="true" aria-label="Directors" tabIndex={-1} ref={panelRef}>
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">Directors</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <p className="dir-loc-hint" style={{ marginTop: 0 }}>
            Only you (the Owner) can see or change this list. Directors get full
            edit access everywhere except here; Teachers can only schedule
            private lessons for the students assigned to them; Personnel
            Assistants can only take roll for the ensembles assigned to them.
          </p>

          {loading && directors.length === 0 && <div className="dir-loc-empty">Loading…</div>}
          {!loading && directors.length === 0 && (
            <div className="dir-loc-empty">No directors listed yet. Add the first one below.</div>
          )}

          {directors.map(d => {
            const role = d.role ?? 'director';
            const isSelf = d.email === meId;
            const Icon = ROLE_ICON[role];
            return (
              <div key={d.email}>
                <div className="dir-loc-row" style={{ cursor: 'default' }}>
                  <Icon size={16} className="dir-loc-pin" />
                  <div className="dir-loc-info">
                    <div className="dir-loc-name">
                      {d.name || d.email}
                      {isSelf && <span className="dir-loc-label"> — you</span>}
                    </div>
                    <div className="dir-ens-sub">
                      {d.name ? `${d.email} · ` : ''}{ROLE_LABEL[role]}
                      {role === 'teacher' && d.instruments?.length ? ` · ${d.instruments.join(', ')}` : ''}
                      {role === 'assistant' && d.assignedEnsembleIds?.length
                        ? ` · ${d.assignedEnsembleIds.map(ensembleName).join(', ')}`
                        : ''}
                    </div>
                  </div>
                  {confirmRemove === d.email ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="dir-btn dir-btn-danger" onClick={() => handleRemove(d.email)} disabled={busy}>Remove</button>
                      <button className="dir-btn dir-btn-ghost" onClick={() => setConfirmRemove(null)} disabled={busy}>Cancel</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 4 }}>
                      {role !== 'owner' && (
                        <button className="dir-icon-btn" onClick={() => setEditingEmail(d.email)} aria-label={`Edit ${d.email}`}>
                          <Pencil size={15} />
                        </button>
                      )}
                      <button
                        className="dir-icon-btn"
                        onClick={() => setConfirmRemove(d.email)}
                        disabled={isSelf || role === 'owner'}
                        title={isSelf ? "You can't remove yourself" : role === 'owner' ? 'The Owner can’t be removed' : `Remove ${d.email}`}
                        aria-label={isSelf ? "You can't remove yourself" : `Remove ${d.email}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>
                {editingEmail === d.email && (
                  <DirectorEditor
                    director={d}
                    onSave={async patch => { await updateDirector(d.email, patch); setEditingEmail(null); }}
                    onClose={() => setEditingEmail(null)}
                  />
                )}
              </div>
            );
          })}

          {/* Sign-in history (#login-history): Owner-only record of who signed
              in and when — every role: directors, teachers, assistants. */}
          <div className="dir-menu-divider" style={{ margin: '16px 0 10px' }} />
          <button
            className="dir-btn dir-btn-ghost"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            onClick={() => setShowLog(s => !s)}
            aria-expanded={showLog}
          >
            <History size={15} /> Sign-in history
            {showLog ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showLog && <LoginHistory />}
        </div>

        <div className="dir-drawer-footer" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          {!adding ? (
            <button className="dir-btn dir-btn-primary" onClick={() => setAdding(true)}>
              <Plus size={16} style={{ verticalAlign: '-3px' }} /> Add a director, teacher, or assistant
            </button>
          ) : (
            <DirectorEditor
              onSave={async data => {
                await addDirector(data.email!, currentEmail ?? undefined, {
                  name: data.name, role: data.role as Exclude<DirectorRole, 'owner'>,
                  instruments: data.instruments, assignedStudentIds: data.assignedStudentIds,
                  assignedEnsembleIds: data.assignedEnsembleIds,
                });
                setAdding(false);
              }}
              onClose={() => setAdding(false)}
              existingEmails={directors.map(d => d.email)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** "Jul 28, 9:14 AM" — with the year added once it isn't this year's entry. */
function fmtLoginTime(at: number): string {
  const d = new Date(at);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** Recent sign-ins, newest first (#login-history). Mounted only while the
 *  section is expanded so the log isn't read on every Directors open. */
function LoginHistory() {
  const { events, state } = useLoginEvents(true);
  if (state === 'error') return <div className="dir-loc-empty">Couldn’t load the sign-in log — check your connection and reopen.</div>;
  if (state === 'loading' && events.length === 0) return <div className="dir-loc-empty">Loading sign-ins…</div>;
  if (events.length === 0) {
    return (
      <div className="dir-loc-empty">
        Nothing recorded yet. A sign-in is logged each time a director, teacher,
        or personnel assistant opens the Hub from now on.
      </div>
    );
  }
  return (
    <div>
      {events.map(ev => (
        <div key={ev.id} className="dir-loc-row" style={{ cursor: 'default' }}>
          <div className="dir-loc-info">
            <div className="dir-loc-name">{ev.name || ev.email}</div>
            <div className="dir-ens-sub">
              {ev.name ? `${ev.email} · ` : ''}{ROLE_LABEL[ev.role] ?? ev.role}
            </div>
          </div>
          <span className="dir-ens-sub" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{fmtLoginTime(ev.at)}</span>
        </div>
      ))}
      <div className="dir-field-hint" style={{ marginTop: 6 }}>
        One entry per sign-in session · showing the most recent {LOGIN_LOG_LIMIT}.
      </div>
    </div>
  );
}

/** Add/edit form: email (add only) + name + role + (Teacher) instruments &
 *  assigned students + (Personnel Assistant) assigned ensembles. One shared
 *  shape so adding and editing stay consistent. */
function DirectorEditor({ director, onSave, onClose, existingEmails }: {
  director?: Director;
  onSave: (data: Partial<Director> & { email?: string }) => Promise<void>;
  onClose: () => void;
  existingEmails?: string[];
}) {
  const { students } = useStudents();
  const { ensembles } = useEnsembles();
  const [email, setEmail] = useState(director?.email ?? '');
  const [name, setName] = useState(director?.name ?? '');
  const [role, setRole] = useState<Exclude<DirectorRole, 'owner'>>(
    director?.role === 'teacher' || director?.role === 'assistant' ? director.role : 'director',
  );
  const [instruments, setInstruments] = useState((director?.instruments ?? []).join(', '));
  const [assignedIds, setAssignedIds] = useState<string[]>(director?.assignedStudentIds ?? []);
  const [assignedEnsIds, setAssignedEnsIds] = useState<string[]>(director?.assignedEnsembleIds ?? []);
  const [studentQuery, setStudentQuery] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const activeStudents = useMemo(
    () => students.filter(s => s.status === 'Active').sort((a, b) => a.name.localeCompare(b.name)),
    [students],
  );
  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return activeStudents;
    return activeStudents.filter(s => s.name.toLowerCase().includes(q) || s.instrument?.toLowerCase().includes(q));
  }, [activeStudents, studentQuery]);

  function toggleStudent(id: string) {
    setAssignedIds(cur => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  }
  function toggleEnsemble(id: string) {
    setAssignedEnsIds(cur => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  }

  async function handleSave() {
    setError('');
    const id = directorEmailId(email);
    if (!director) {
      if (!EMAIL_RE.test(id)) { setError('Enter a valid email address.'); return; }
      if (existingEmails?.includes(id)) { setError('That person is already listed.'); return; }
    }
    if (role === 'assistant' && assignedEnsIds.length === 0) {
      setError('Pick at least one ensemble the assistant takes roll for.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        email: id,
        name: name.trim() || undefined,
        role,
        instruments: role === 'teacher'
          ? instruments.split(',').map(s => s.trim()).filter(Boolean)
          : undefined,
        assignedStudentIds: role === 'teacher' ? assignedIds : undefined,
        assignedEnsembleIds: role === 'assistant' ? assignedEnsIds : undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save — try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dir-drawer-body" style={{ background: 'var(--dir-panel-alt, rgba(0,0,0,0.03))', borderRadius: 10, padding: 12, marginTop: director ? 0 : 8, marginBottom: 8 }}>
      {!director && (
        <div className="dir-field">
          <label className="dir-label">Google sign-in email</label>
          <input className="dir-input" type="email" value={email} placeholder="person@gmail.com" onChange={e => setEmail(e.target.value)} />
        </div>
      )}
      <div className="dir-field">
        <label className="dir-label">Name</label>
        <input className="dir-input" value={name} placeholder="First captured automatically when they sign in" onChange={e => setName(e.target.value)} />
      </div>
      <div className="dir-field">
        <label className="dir-label">Access level</label>
        <div className="dir-segment">
          <button type="button" className={`dir-segment-btn ${role === 'director' ? 'active' : ''}`} onClick={() => setRole('director')}>
            <UserCog size={14} /> Director
          </button>
          <button type="button" className={`dir-segment-btn ${role === 'teacher' ? 'active' : ''}`} onClick={() => setRole('teacher')}>
            <GraduationCap size={14} /> Teacher
          </button>
          <button type="button" className={`dir-segment-btn ${role === 'assistant' ? 'active' : ''}`} onClick={() => setRole('assistant')}>
            <ClipboardList size={14} /> Personnel Asst.
          </button>
        </div>
        <div className="dir-field-hint">
          {role === 'director'
            ? 'Full edit access everywhere except this Directors screen.'
            : role === 'teacher'
              ? 'Can only schedule private lessons for the students assigned below — nothing else in the Hub.'
              : 'Can only take roll (attendance) for the ensembles selected below — nothing else in the Hub. Every mark they make is labelled with their name on the director side.'}
        </div>
      </div>

      {role === 'assistant' && (
        <div className="dir-field">
          <label className="dir-label">Ensembles they take roll for ({assignedEnsIds.length})</label>
          <div className="dir-checkbox-group">
            {musicEnsembles([...ensembles].sort((a, b) => a.order - b.order)).map(e => (
              <label key={e.id} className={`dir-checkbox-tag ${assignedEnsIds.includes(e.id) ? 'checked' : ''}`}>
                <input type="checkbox" checked={assignedEnsIds.includes(e.id)} onChange={() => toggleEnsemble(e.id)} />
                {e.name}
              </label>
            ))}
          </div>
          <div className="dir-field-hint">
            e.g. the Orchestra Personnel Assistant covers Camerata, Symphony, Philharmonic, and Opera Orchestra.
          </div>
        </div>
      )}

      {role === 'teacher' && (
        <>
          <div className="dir-field">
            <label className="dir-label">Instrument(s) taught</label>
            <input className="dir-input" value={instruments} placeholder="e.g. Violin, Viola" onChange={e => setInstruments(e.target.value)} />
          </div>
          <div className="dir-field">
            <label className="dir-label">Assigned students ({assignedIds.length})</label>
            <input
              className="dir-input"
              style={{ marginBottom: 6 }}
              placeholder="Search students…"
              value={studentQuery}
              onChange={e => setStudentQuery(e.target.value)}
            />
            <div className="dir-checkbox-group" style={{ maxHeight: 220, overflowY: 'auto' }}>
              {filteredStudents.map(s => (
                <label key={s.id} className={`dir-checkbox-tag ${assignedIds.includes(s.id) ? 'checked' : ''}`}>
                  <input type="checkbox" checked={assignedIds.includes(s.id)} onChange={() => toggleStudent(s.id)} />
                  {s.name}{s.instrument ? ` — ${s.instrument}` : ''}
                </label>
              ))}
              {filteredStudents.length === 0 && <div className="dir-loc-empty">No students match.</div>}
            </div>
            <div className="dir-field-hint">
              The teacher can adjust this list themselves later from their own lesson screen.
            </div>
          </div>
        </>
      )}

      {error && <div className="dir-sc-error">⚠ {error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button className="dir-btn dir-btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="dir-btn dir-btn-primary" onClick={handleSave} disabled={saving || (!director && !email.trim())}>
          {saving ? 'Saving…' : director ? 'Save changes' : 'Add'}
        </button>
      </div>
    </div>
  );
}
