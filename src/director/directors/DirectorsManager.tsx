import { useState } from 'react';
import { Plus, Trash2, ShieldCheck } from 'lucide-react';
import { useDirectors, directorEmailId } from '../hooks/useDirectors';

interface Props {
  /** Email of the signed-in director, so we can flag "you" and block self-removal. */
  currentEmail: string | null;
  onClose: () => void;
}

// Deliberately loose — just enough to catch typos, not to police valid addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Manage who can sign in and edit (#deploy-hang fix). Adding a director here is
 * a live data change — the moment you add someone, Firestore accepts their
 * saves; no code change, no rules redeploy, no waiting. Replaces the old flow
 * where a director could only be added by editing firestore.rules by hand.
 */
export function DirectorsManager({ currentEmail, onClose }: Props) {
  const { directors, loading, addDirector, removeDirector } = useDirectors();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const meId = currentEmail ? directorEmailId(currentEmail) : null;

  async function handleAdd() {
    const id = directorEmailId(email);
    if (!EMAIL_RE.test(id)) { setError('Enter a valid email address.'); return; }
    if (directors.some(d => d.email === id)) { setError('That person is already a director.'); return; }
    setError('');
    setBusy(true);
    try {
      await addDirector(id, currentEmail ?? undefined);
      setEmail('');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: string) {
    setBusy(true);
    try {
      await removeDirector(id);
      setConfirmRemove(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">Directors</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <p className="dir-loc-hint" style={{ marginTop: 0 }}>
            Anyone listed here can sign in with their Google account and edit the
            Hub. Add a director and they can start right away — nothing needs to
            be deployed. Use each person's exact Google sign-in email.
          </p>

          {loading && directors.length === 0 && <div className="dir-loc-empty">Loading…</div>}
          {!loading && directors.length === 0 && (
            <div className="dir-loc-empty">
              No directors listed yet. Add the first one below.
            </div>
          )}

          {directors.map(d => {
            const isSelf = d.email === meId;
            return (
              <div key={d.email} className="dir-loc-row" style={{ cursor: 'default' }}>
                <ShieldCheck size={16} className="dir-loc-pin" />
                <div className="dir-loc-info">
                  <div className="dir-loc-name">
                    {d.email}
                    {isSelf && <span className="dir-loc-label"> — you</span>}
                  </div>
                </div>
                {confirmRemove === d.email ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="dir-btn dir-btn-danger" onClick={() => handleRemove(d.email)} disabled={busy}>
                      Remove
                    </button>
                    <button className="dir-btn dir-btn-ghost" onClick={() => setConfirmRemove(null)} disabled={busy}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    className="dir-icon-btn"
                    onClick={() => setConfirmRemove(d.email)}
                    disabled={isSelf}
                    title={isSelf ? "You can't remove yourself" : `Remove ${d.email}`}
                    aria-label={isSelf ? "You can't remove yourself" : `Remove ${d.email}`}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="dir-drawer-footer" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          {error && <div style={{ color: '#b91c1c', fontSize: 14 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="dir-input"
              style={{ flex: 1 }}
              type="email"
              value={email}
              placeholder="new.director@gmail.com"
              onChange={e => { setEmail(e.target.value); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            />
            <button className="dir-btn dir-btn-primary" onClick={handleAdd} disabled={busy || !email.trim()}>
              <Plus size={16} style={{ verticalAlign: '-3px' }} /> Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
