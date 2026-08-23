import { useState } from 'react';
import type { Personnel, PersonnelContact, Ensemble } from '../types';
import { useModalA11y } from '../../shared/useModalA11y';
import { musicEnsembles } from '../utils';
import { whenQueued } from '../writeStatus';

/**
 * Add/edit one person on the paid roster (#personnel) — the StudentForm
 * pattern with the adult fields: no grade, no guardians, self-contact only.
 * Contact details save to the separate Owner/Director-only
 * `personnelContacts` doc, mirroring the students/contacts split.
 */

/** Editable contact draft — every key the rules allowlist accepts except
 *  `extra` (import leftovers are shown read-only via the detail sheet only
 *  once an importer exists; nothing writes them today). All strings stay
 *  defined so saving writes '' and clears a field, matching the hook's
 *  merge-write contract. `w9Status` is always one of the three legal values —
 *  firestore.rules rejects any other string. */
export interface PersonnelContactDraft {
  email: string;
  phone: string;
  address: string;
  emergencyName: string;
  emergencyPhone: string;
  unionLocal: string;
  w9Status: NonNullable<PersonnelContact['w9Status']>;
}

interface FormState {
  name: string;
  preferredName: string;
  pronunciation: string;
  instrument: string;
  /** Comma-separated in the input; split into `doubles: string[]` on save. */
  doubles: string;
  section: string;
  /** Kept as text in the input; a valid 1-based number saves, '' clears. */
  seat: string;
  sectionLeader: boolean;
  ensembleIds: string[];
  status: Personnel['status'];
  notes: string;
}

const BLANK: FormState = {
  name: '', preferredName: '', pronunciation: '', instrument: '', doubles: '',
  section: '', seat: '', sectionLeader: false, ensembleIds: [],
  status: 'Contracted', notes: '',
};

/** Collapse the draft into the stored shape. `seat` is present only when it
 *  is a whole number ≥ 1 — the caller turns an omitted seat into a
 *  deleteField() on edit, since updateDoc keeps keys the patch omits. */
function normalize(form: FormState): Omit<Personnel, 'id'> {
  const seatNum = /^\d+$/.test(form.seat.trim()) ? Number(form.seat.trim()) : undefined;
  return {
    name: form.name.trim(),
    preferredName: form.preferredName.trim(),
    pronunciation: form.pronunciation.trim(),
    instrument: form.instrument.trim(),
    doubles: form.doubles.split(',').map(s => s.trim()).filter(Boolean),
    section: form.section.trim(),
    sectionLeader: form.sectionLeader,
    ensembleIds: form.ensembleIds,
    status: form.status,
    notes: form.notes.trim(),
    ...(seatNum && seatNum >= 1 ? { seat: seatNum } : {}),
  };
}

interface Props {
  person: Personnel | null;
  contact: PersonnelContact | null;
  ensembles: Ensemble[];
  /** True once any contract points at this person — the roster doc then
   *  archives instead of deleting, so the contract never orphans. */
  hasContracts: boolean;
  onSave: (data: Omit<Personnel, 'id'>, contact: PersonnelContactDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

function draftFromContact(contact: PersonnelContact | null): PersonnelContactDraft {
  return {
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    address: contact?.address ?? '',
    emergencyName: contact?.emergencyName ?? '',
    emergencyPhone: contact?.emergencyPhone ?? '',
    unionLocal: contact?.unionLocal ?? '',
    w9Status: contact?.w9Status ?? 'not-requested',
  };
}

export function PersonnelForm({ person, contact, ensembles, hasContracts, onSave, onDelete, onClose }: Props) {
  const panelRef = useModalA11y<HTMLDivElement>(onClose, true, { closeOnBack: true });
  // The drawer mounts fresh each time it opens (the manager renders it
  // conditionally), so props seed lazy initializers — no state-syncing
  // effect (react-hooks/set-state-in-effect, the same discipline as the
  // Step 2 hooks' derived `loading`).
  const [form, setForm] = useState<FormState>(() => person ? {
    name: person.name,
    preferredName: person.preferredName ?? '',
    pronunciation: person.pronunciation ?? '',
    instrument: person.instrument ?? '',
    doubles: (person.doubles ?? []).join(', '),
    section: person.section ?? '',
    seat: person.seat != null ? String(person.seat) : '',
    sectionLeader: person.sectionLeader ?? false,
    ensembleIds: person.ensembleIds ?? [],
    status: person.status,
    notes: person.notes ?? '',
  } : BLANK);
  const [contactForm, setContactForm] = useState<PersonnelContactDraft>(() => draftFromContact(contact));
  // If the contacts snapshot resolves only after the drawer opened (edit
  // tapped in the first beat after sign-in), seed the contact fields once
  // it lands — React's adjust-state-during-render pattern, guarded so it
  // never overwrites a draft the person's own doc already seeded.
  const [seededContact, setSeededContact] = useState(contact != null);
  if (!seededContact && contact != null) {
    setSeededContact(true);
    setContactForm(draftFromContact(contact));
  }
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }
  function setContact<K extends keyof PersonnelContactDraft>(k: K, v: PersonnelContactDraft[K]) {
    setContactForm(f => ({ ...f, [k]: v }));
  }

  function toggleEnsemble(id: string) {
    setForm(f => ({
      ...f,
      ensembleIds: f.ensembleIds.includes(id)
        ? f.ensembleIds.filter(e => e !== id)
        : [...f.ensembleIds, id],
    }));
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    setSaveError('');
    try {
      await whenQueued(onSave(normalize(form), {
        ...contactForm,
        email: contactForm.email.trim(),
        phone: contactForm.phone.trim(),
        address: contactForm.address.trim(),
        emergencyName: contactForm.emergencyName.trim(),
        emergencyPhone: contactForm.emergencyPhone.trim(),
        unionLocal: contactForm.unionLocal.trim(),
      }));
      onClose();
    } catch (e) {
      setSaving(false);
      setSaveError(e instanceof Error ? e.message : 'Could not save — try again.');
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

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer" role="dialog" aria-modal="true" aria-label={person ? 'Edit person' : 'New person'} tabIndex={-1} ref={panelRef}>
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">{person ? 'Edit Person' : 'Add Person'}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-field">
            <label className="dir-label">Name *</label>
            <input className="dir-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Full name" />
          </div>

          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">Goes by <span className="dir-label-hint">optional</span></label>
              <input className="dir-input" value={form.preferredName} onChange={e => set('preferredName', e.target.value)} placeholder="e.g. Sam" />
            </div>
            <div className="dir-field">
              <label className="dir-label">Pronounced <span className="dir-label-hint">optional</span></label>
              <input className="dir-input" value={form.pronunciation} onChange={e => set('pronunciation', e.target.value)} placeholder="see-oh-MAH-rah" />
            </div>
          </div>

          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">Instrument <span className="dir-label-hint">blank for staff</span></label>
              <input className="dir-input" value={form.instrument} onChange={e => set('instrument', e.target.value)} placeholder="e.g. Violin" />
            </div>
            <div className="dir-field">
              <label className="dir-label">Doubles <span className="dir-label-hint">comma-separated</span></label>
              <input className="dir-input" value={form.doubles} onChange={e => set('doubles', e.target.value)} placeholder="e.g. Piccolo, Alto Flute" />
            </div>
          </div>

          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">Section</label>
              <input className="dir-input" value={form.section} onChange={e => set('section', e.target.value)} placeholder="e.g. Violin I" />
            </div>
            <div className="dir-field">
              <label className="dir-label">Seat <span className="dir-label-hint">1 = principal</span></label>
              <input className="dir-input" inputMode="numeric" value={form.seat} onChange={e => set('seat', e.target.value)} placeholder="e.g. 3" />
            </div>
          </div>

          <div className="dir-field">
            <label className="dir-checkbox-tag" style={{ display: 'inline-flex' }}>
              <input type="checkbox" checked={form.sectionLeader} onChange={e => set('sectionLeader', e.target.checked)} />
              Section leader
            </label>
          </div>

          {musicEnsembles(ensembles).length > 0 && (
            <div className="dir-field">
              <label className="dir-label">Ensembles / series</label>
              <div className="dir-checkbox-group">
                {musicEnsembles(ensembles).map(e => (
                  <label key={e.id} className={`dir-checkbox-tag ${form.ensembleIds.includes(e.id) ? 'checked' : ''}`}>
                    <input type="checkbox" checked={form.ensembleIds.includes(e.id)} onChange={() => toggleEnsemble(e.id)} />
                    {e.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="dir-field">
            <label className="dir-label">Status</label>
            <select className="dir-select" value={form.status} onChange={e => set('status', e.target.value as Personnel['status'])}>
              <option value="Contracted">Contracted</option>
              <option value="SubList">Sub list</option>
              <option value="Inactive">Inactive (archived)</option>
            </select>
          </div>

          <div className="dir-field">
            <label className="dir-label">Notes <span className="dir-label-hint">personnel manager only</span></label>
            <textarea className="dir-input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="e.g. prefers early calls" />
          </div>

          <div className="dir-contact-note">🔒 Contact and paperwork details are visible to signed-in directors only. Nothing on this screen is ever public.</div>

          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">Email</label>
              <input className="dir-input" type="email" inputMode="email" autoComplete="off" value={contactForm.email} onChange={e => setContact('email', e.target.value)} placeholder="optional" />
            </div>
            <div className="dir-field">
              <label className="dir-label">Phone</label>
              <input className="dir-input" type="tel" inputMode="tel" autoComplete="off" value={contactForm.phone} onChange={e => setContact('phone', e.target.value)} placeholder="optional" />
            </div>
          </div>

          <div className="dir-field">
            <label className="dir-label">Mailing address <span className="dir-label-hint">for checks and 1099s</span></label>
            <input className="dir-input" autoComplete="off" value={contactForm.address} onChange={e => setContact('address', e.target.value)} placeholder="optional" />
          </div>

          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">Emergency contact</label>
              <input className="dir-input" value={contactForm.emergencyName} onChange={e => setContact('emergencyName', e.target.value)} placeholder="name — optional" />
            </div>
            <div className="dir-field">
              <label className="dir-label">Emergency phone</label>
              <input className="dir-input" type="tel" inputMode="tel" value={contactForm.emergencyPhone} onChange={e => setContact('emergencyPhone', e.target.value)} placeholder="optional" />
            </div>
          </div>

          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">Union local</label>
              <input className="dir-input" value={contactForm.unionLocal} onChange={e => setContact('unionLocal', e.target.value)} placeholder="e.g. AFM Local 148-462" />
            </div>
            <div className="dir-field">
              {/* A status only, on purpose — the W-9 itself (and the TIN on
                  it) stays with the org's accountant, never in this app. */}
              <label className="dir-label">W-9</label>
              <select className="dir-select" value={contactForm.w9Status} onChange={e => setContact('w9Status', e.target.value as PersonnelContactDraft['w9Status'])}>
                <option value="not-requested">Not requested</option>
                <option value="requested">Requested</option>
                <option value="on-file">On file</option>
              </select>
            </div>
          </div>

          {person && (
            onDelete ? (
              confirmDelete ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="dir-btn dir-btn-danger" style={{ flex: 1 }} onClick={handleDelete} disabled={saving}>
                    Confirm Delete
                  </button>
                  <button className="dir-btn dir-btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
                </div>
              ) : (
                <button className="dir-btn dir-btn-danger" onClick={() => setConfirmDelete(true)}>
                  Delete Person
                </button>
              )
            ) : hasContracts ? (
              <div className="dir-field-hint">
                Contracts point at this person, so the record can’t be deleted — set the status to Inactive to archive them instead.
              </div>
            ) : null
          )}
        </div>
        {saveError && (
          <div style={{ padding: '4px 16px 0', fontSize: 13, color: 'var(--dir-danger)' }}>{saveError}</div>
        )}
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="dir-btn dir-btn-primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
