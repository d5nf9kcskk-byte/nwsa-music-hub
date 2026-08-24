import { useState } from 'react';
import type {
  Contract, ContractTemplate, ContractLineItem, Personnel, PositionCategory, RateBasis,
} from '../types';
import {
  CHAIR_POSITIONS, PODIUM_POSITIONS, STAFF_POSITIONS, LINE_ITEM_TYPES,
} from '../types';
import { parseCentsInput, formatCents } from './contractMoney';
import { useModalA11y } from '../../shared/useModalA11y';
import { whenQueued } from '../writeStatus';

/**
 * Draft/edit one contract (#personnel) — the working document, editable only
 * while the lifecycle says Draft or Sent (the hook refuses anything past
 * that; firestore.rules refuses it server-side). Money is typed as dollars
 * and STORED as integer cents: `parseCentsInput` is the only door between
 * the text field and `*Cents`, and it rejects fractional cents outright.
 *
 * Choosing a template copies its prose into `termsText` and stamps
 * `templateId`/`templateVersion` — the copy is what freezes when the
 * contract is signed, so a template edited later never reaches this
 * contract. The prose keeps its {{tokens}} here; they resolve from the
 * structured fields at render/print time (contractTerms.ts), so the numbers
 * never live in two places.
 */

const POSITIONS_BY_CATEGORY: Record<PositionCategory, readonly string[]> = {
  chair: CHAIR_POSITIONS,
  podium: PODIUM_POSITIONS,
  staff: STAFF_POSITIONS,
};

const BASES: { value: RateBasis; label: string }[] = [
  { value: 'per-service', label: 'Per service' },
  { value: 'per-week',    label: 'Per week' },
  { value: 'hourly',      label: 'Hourly' },
  { value: 'flat',        label: 'Flat (one sum)' },
];

interface LineDraft {
  id: string;
  type: string;
  label: string;
  /** Dollars as typed; parsed to integer cents on save. */
  amount: string;
  basis: ContractLineItem['basis'];
  quantity: string;
}

interface FormState {
  category: PositionCategory;
  position: string;
  section: string;
  seat: string;
  season: string;
  startDate: string;
  endDate: string;
  baseRate: string;
  baseRateBasis: RateBasis;
  baseRateQuantity: string;
  lineItems: LineDraft[];
  termsText: string;
  templateId: string;
  templateVersion?: number;
}

let lineSeq = 0;
const newLineId = () => `li-${Date.now().toString(36)}-${++lineSeq}`;

/** Dollars for the input from stored cents — plain "150" / "82.50", no $ or commas. */
function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(/\.00$/, '');
}

function stateFrom(contract: Contract | null, person: Personnel): FormState {
  if (!contract) {
    return {
      category: person.instrument ? 'chair' : 'staff',
      position: '',
      section: person.section ?? '',
      seat: person.seat != null ? String(person.seat) : '',
      season: '',
      startDate: '',
      endDate: '',
      baseRate: '',
      baseRateBasis: 'per-service',
      baseRateQuantity: '',
      lineItems: [],
      termsText: '',
      templateId: '',
    };
  }
  return {
    category: contract.category,
    position: contract.position,
    section: contract.section ?? '',
    seat: contract.seat != null ? String(contract.seat) : '',
    season: contract.season ?? '',
    startDate: contract.startDate ?? '',
    endDate: contract.endDate ?? '',
    baseRate: centsToInput(contract.baseRateCents),
    baseRateBasis: contract.baseRateBasis,
    baseRateQuantity: contract.baseRateQuantity != null ? String(contract.baseRateQuantity) : '',
    lineItems: (contract.lineItems ?? []).map(li => ({
      id: li.id,
      type: li.type,
      label: li.label ?? '',
      amount: centsToInput(li.amountCents),
      basis: li.basis,
      quantity: li.quantity != null ? String(li.quantity) : '',
    })),
    termsText: contract.termsText ?? '',
    templateId: contract.templateId ?? '',
    templateVersion: contract.templateVersion,
  };
}

export type ContractDraftData = Omit<Contract,
  'id' | 'status' | 'signature' | 'signedAt' | 'countersignedBy' | 'countersignedAt'
  | 'createdAt' | 'updatedAt' | 'updatedBy' | 'updatedByRole'>;

/** Collapse the draft to the stored shape, or an error string. */
function normalize(form: FormState, person: Personnel): ContractDraftData | string {
  if (!form.position.trim()) return 'A contract needs a position.';
  const baseRateCents = parseCentsInput(form.baseRate);
  if (baseRateCents == null) return 'Base rate must be a dollar amount in whole cents, e.g. 150 or 82.50.';
  const quantity = form.baseRateQuantity.trim();
  if (quantity && !/^\d+$/.test(quantity)) return 'Expected services / weeks / hours must be a whole number.';
  const lineItems: ContractLineItem[] = [];
  for (const li of form.lineItems) {
    const amountCents = parseCentsInput(li.amount);
    if (amountCents == null) return `“${li.type}” line: amount must be a dollar amount in whole cents.`;
    const q = li.quantity.trim();
    if (q && !/^\d+$/.test(q)) return `“${li.type}” line: quantity must be a whole number.`;
    lineItems.push({
      id: li.id,
      type: li.type,
      label: li.label.trim(),
      amountCents,
      basis: li.basis,
      ...(li.basis !== 'one-time' && li.basis !== 'flat' && q ? { quantity: Number(q) } : {}),
    });
  }
  const seatNum = /^\d+$/.test(form.seat.trim()) ? Number(form.seat.trim()) : undefined;
  return {
    personnelId: person.id,
    personnelName: person.name,
    category: form.category,
    position: form.position.trim(),
    section: form.category === 'chair' ? form.section.trim() : '',
    season: form.season.trim(),
    startDate: form.startDate,
    endDate: form.endDate,
    baseRateCents,
    baseRateBasis: form.baseRateBasis,
    lineItems,
    termsText: form.termsText,
    ...(form.category === 'chair' && seatNum && seatNum >= 1 ? { seat: seatNum } : {}),
    ...(form.baseRateBasis !== 'flat' && quantity ? { baseRateQuantity: Number(quantity) } : {}),
    ...(form.templateId ? { templateId: form.templateId } : {}),
    ...(form.templateVersion != null ? { templateVersion: form.templateVersion } : {}),
  };
}

interface Props {
  person: Personnel;
  /** null = new Draft; otherwise an existing Draft/Sent contract to edit. */
  contract: Contract | null;
  templates: ContractTemplate[];
  onSave: (data: ContractDraftData) => Promise<void>;
  onClose: () => void;
}

export function ContractForm({ person, contract, templates, onSave, onClose }: Props) {
  const panelRef = useModalA11y<HTMLDivElement>(onClose, true, { closeOnBack: true });
  const [form, setForm] = useState<FormState>(() => stateFrom(contract, person));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }
  function setLine(i: number, patch: Partial<LineDraft>) {
    setForm(f => ({ ...f, lineItems: f.lineItems.map((li, n) => (n === i ? { ...li, ...patch } : li)) }));
  }

  function applyTemplate(id: string) {
    const t = templates.find(x => x.id === id);
    if (!t) return;
    if (form.termsText.trim() && form.termsText !== templates.find(x => x.id === form.templateId)?.bodyText) {
      if (!window.confirm('Replace the current agreement text with this template?')) return;
    }
    setForm(f => ({ ...f, termsText: t.bodyText, templateId: t.id, templateVersion: t.version }));
  }

  async function handleSave() {
    const data = normalize(form, person);
    if (typeof data === 'string') { setSaveError(data); return; }
    setSaving(true);
    setSaveError('');
    try {
      await whenQueued(onSave(data));
      onClose();
    } catch (e) {
      setSaving(false);
      setSaveError(e instanceof Error ? e.message : 'Could not save — try again.');
    }
  }

  const knownPositions = POSITIONS_BY_CATEGORY[form.category];
  const templateChoices = templates; // all categories — the tag says which it's written for

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={contract ? 'Edit contract' : 'New contract'}>
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">{contract ? 'Edit Contract' : `New Contract — ${person.name}`}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">Engaged as</label>
              <select className="dir-select" value={form.category} onChange={e => set('category', e.target.value as PositionCategory)}>
                <option value="chair">Musician (chair)</option>
                <option value="podium">Podium</option>
                <option value="staff">Staff</option>
              </select>
            </div>
            <div className="dir-field">
              <label className="dir-label">Position *</label>
              <input
                className="dir-input"
                list="dir-contract-positions"
                value={form.position}
                onChange={e => set('position', e.target.value)}
                placeholder={form.category === 'chair' ? 'e.g. Principal' : form.category === 'podium' ? 'e.g. Conductor' : 'e.g. Librarian'}
              />
              <datalist id="dir-contract-positions">
                {knownPositions.map(p => <option key={p} value={p} />)}
              </datalist>
            </div>
          </div>

          {form.category === 'chair' && (
            <div className="dir-field-row">
              <div className="dir-field">
                <label className="dir-label">Section</label>
                <input className="dir-input" value={form.section} onChange={e => set('section', e.target.value)} placeholder="e.g. Violin I" />
              </div>
              <div className="dir-field">
                <label className="dir-label">Seat <span className="dir-label-hint">1 = principal</span></label>
                <input className="dir-input" inputMode="numeric" value={form.seat} onChange={e => set('seat', e.target.value)} placeholder="optional" />
              </div>
            </div>
          )}

          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">Season</label>
              <input className="dir-input" value={form.season} onChange={e => set('season', e.target.value)} placeholder="e.g. 2026-27" />
            </div>
          </div>
          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">From</label>
              <input className="dir-input" type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
            </div>
            <div className="dir-field">
              <label className="dir-label">Through</label>
              <input className="dir-input" type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} />
            </div>
          </div>

          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">Base rate ($) *</label>
              <input className="dir-input" inputMode="decimal" value={form.baseRate} onChange={e => set('baseRate', e.target.value)} placeholder="e.g. 150 or 82.50" />
            </div>
            <div className="dir-field">
              <label className="dir-label">Basis</label>
              <select className="dir-select" value={form.baseRateBasis} onChange={e => set('baseRateBasis', e.target.value as RateBasis)}>
                {BASES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
            {form.baseRateBasis !== 'flat' && (
              <div className="dir-field">
                <label className="dir-label">Expected # <span className="dir-label-hint">services/weeks/hours</span></label>
                <input className="dir-input" inputMode="numeric" value={form.baseRateQuantity} onChange={e => set('baseRateQuantity', e.target.value)} placeholder="e.g. 40" />
              </div>
            )}
          </div>

          <div className="dir-field">
            <label className="dir-label">Additional amounts <span className="dir-label-hint">cartage, doubling, per diem, deductions</span></label>
            {form.lineItems.map((li, i) => (
              <div key={li.id} className="dir-contract-line-edit">
                <div className="dir-signup-qedit-row">
                  <select className="dir-select" value={li.type} onChange={e => setLine(i, { type: e.target.value })}>
                    {LINE_ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input className="dir-input" value={li.label} onChange={e => setLine(i, { label: e.target.value })} placeholder="what for — e.g. Harp cartage, both concerts" />
                </div>
                <div className="dir-signup-qedit-row">
                  <input className="dir-input" inputMode="decimal" value={li.amount} onChange={e => setLine(i, { amount: e.target.value })} placeholder="$ — negative for a deduction" />
                  <select className="dir-select" value={li.basis} onChange={e => setLine(i, { basis: e.target.value as LineDraft['basis'] })}>
                    <option value="one-time">One-time</option>
                    <option value="per-service">Per service</option>
                    <option value="per-week">Per week</option>
                    <option value="hourly">Hourly</option>
                  </select>
                  {li.basis !== 'one-time' && li.basis !== 'flat' && (
                    <input className="dir-input" inputMode="numeric" value={li.quantity} onChange={e => setLine(i, { quantity: e.target.value })} placeholder="×" style={{ maxWidth: 70 }} />
                  )}
                  <button className="dir-tool-btn" onClick={() => setForm(f => ({ ...f, lineItems: f.lineItems.filter((_, n) => n !== i) }))}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button
              className="dir-tool-btn"
              onClick={() => setForm(f => ({
                ...f,
                lineItems: [...f.lineItems, { id: newLineId(), type: 'Cartage', label: '', amount: '', basis: 'one-time', quantity: '' }],
              }))}
            >
              + Add line item
            </button>
          </div>

          <div className="dir-field">
            <label className="dir-label">Agreement text <span className="dir-label-hint">frozen once signed</span></label>
            {templateChoices.length > 0 && (
              <select
                className="dir-select"
                value=""
                onChange={e => { if (e.target.value) applyTemplate(e.target.value); e.target.value = ''; }}
                style={{ marginBottom: 6 }}
              >
                <option value="">Insert from template…</option>
                {templateChoices.map(t => (
                  <option key={t.id} value={t.id}>{t.name} (v{t.version})</option>
                ))}
              </select>
            )}
            <textarea
              className="dir-input dir-tmpl-body"
              rows={8}
              value={form.termsText}
              onChange={e => set('termsText', e.target.value)}
              placeholder="The agreement prose this person signs. Insert a template above, or write it here. {{placeholders}} fill in from the fields on this form."
            />
            {form.templateId && (
              <p className="dir-field-hint">
                From “{templates.find(t => t.id === form.templateId)?.name ?? 'a deleted template'}”
                {form.templateVersion != null ? ` v${form.templateVersion}` : ''} — this contract keeps its own copy.
              </p>
            )}
          </div>

          {(() => {
            const cents = parseCentsInput(form.baseRate);
            return cents != null && (
              <p className="dir-field-hint">
                Base rate stores as {cents.toLocaleString('en-US')} cents ({formatCents(cents)}).
              </p>
            );
          })()}
        </div>
        {saveError && (
          <div style={{ padding: '4px 16px 0', fontSize: 13, color: 'var(--dir-danger)' }}>{saveError}</div>
        )}
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="dir-btn dir-btn-primary" onClick={handleSave} disabled={saving || !form.position.trim() || !form.baseRate.trim()}>
            {saving ? 'Saving…' : contract ? 'Save' : 'Save Draft'}
          </button>
        </div>
      </div>
    </div>
  );
}
