/**
 * The "Spanish" box under a change note (#banner-drafter).
 *
 * Renders NOTHING unless `ORG.features.bannerDrafter` is on. The button asks
 * the `draftChangeNoteEs` Cloud Function for a draft of the English note and
 * puts it in the box; the director edits or accepts it, and only the screen's
 * own Save / Confirm writes it (as `changeNoteEs`). The box is a draft until
 * then: nothing here writes to Firestore.
 *
 * Callers clear the box whenever the English note changes, so a Spanish line
 * written for the old note can never ride along with a new one
 * (`reconcileChangeNoteEs` in src/shared/changeNoteEs.ts is the backstop).
 */
import { useId, useState } from 'react';
import { bannerDrafterOn } from './bannerDrafterFlag';
import { auth } from '../firebaseAuth';
import { CHANGE_NOTE_DRAFT_MAX, CHANGE_NOTE_ES_MAX } from '../../shared/changeNoteEs';

function drafterUrl(): string {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  return projectId ? `https://us-central1-${projectId}.cloudfunctions.net/draftChangeNoteEs` : '';
}

/** Ask for a Spanish draft of ONE English note. Sends the note and nothing else. */
async function requestDraft(note: string): Promise<{ ok: true; draft: string } | { ok: false; message: string }> {
  const url = drafterUrl();
  if (!url || !auth?.currentUser) return { ok: false, message: 'Sign in to use the drafter.' };
  try {
    const idToken = await auth.currentUser.getIdToken();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ note }),
    });
    const body = await res.json().catch(() => ({})) as { ok?: boolean; draft?: string; message?: string };
    if (body.ok && typeof body.draft === 'string') return { ok: true, draft: body.draft };
    return { ok: false, message: body.message || `The drafter did not answer (HTTP ${res.status}).` };
  } catch {
    return { ok: false, message: 'That did not reach the Hub. Check the connection, or type the Spanish yourself.' };
  }
}

interface Props {
  /** The English note as it stands in the form. */
  english: string;
  value: string;
  onChange: (es: string) => void;
}

export function ChangeNoteEsField({ english, value, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputId = useId();
  if (!bannerDrafterOn()) return null;

  const note = english.trim();
  const tooLong = note.length > CHANGE_NOTE_DRAFT_MAX;

  async function draft() {
    setBusy(true);
    setError('');
    const r = await requestDraft(note);
    setBusy(false);
    if (r.ok) onChange(r.draft);
    else setError(r.message);
  }

  return (
    <div className="dir-field">
      <label className="dir-label" htmlFor={inputId}>Spanish (shown to families reading in Spanish)</label>
      <textarea
        id={inputId}
        className="dir-input"
        rows={2}
        maxLength={CHANGE_NOTE_ES_MAX}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={note ? 'Draft it, or type it yourself' : 'Write the English note first'}
        disabled={!note}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="dir-tool-btn"
          onClick={draft}
          disabled={busy || !note || tooLong}
        >
          {busy ? 'Drafting…' : value.trim() ? 'Draft again' : 'Draft Spanish'}
        </button>
        {value.trim() && (
          <button type="button" className="dir-tool-btn" onClick={() => onChange('')} disabled={busy}>
            Clear
          </button>
        )}
      </div>
      {error && <div className="dir-field-hint" role="alert">{error}</div>}
      <div className="dir-field-hint">
        {tooLong
          ? `Too long to draft (over ${CHANGE_NOTE_DRAFT_MAX} characters); type the Spanish yourself.`
          : 'A draft is only a suggestion: read it, fix it, then save. Leave it blank and Spanish readers see the English note. Changing the English note clears this box.'}
      </div>
    </div>
  );
}
