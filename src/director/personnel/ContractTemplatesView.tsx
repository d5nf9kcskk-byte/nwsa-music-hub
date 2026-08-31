import { useState } from 'react';
import { RichTextArea } from '../components/RichTextArea';
import { FileText, Plus, Trash2 } from 'lucide-react';
import type { ContractTemplate, PositionCategory } from '../types';
import { CONTRACT_TOKENS, STARTER_TEMPLATES } from './contractTerms';
import { useModalA11y } from '../../shared/useModalA11y';
import { whenQueued } from '../writeStatus';

/**
 * Editor for the reusable agreement prose (#personnel — `contractTemplates`).
 * A template is a named body of {{token}}-bearing text plus the category it
 * is written for; contracts are issued FROM one and freeze a copy, so
 * everything here is safely editable at any time — the one subtlety is that
 * saving a text change bumps `version` (the hook's job), which is the number
 * stamped onto contracts as provenance.
 *
 * Ships with neutral STARTER prose only (contractTerms.ts): a real AS
 * agreement as the demo template was considered and declined as too
 * invasive, and real language pastes over `bodyText` later with no schema
 * change.
 */

const CATEGORY_LABEL: Record<PositionCategory, string> = {
  chair: 'Musicians (chair)',
  podium: 'Podium',
  staff: 'Staff',
};

interface Draft {
  name: string;
  category: PositionCategory;
  bodyText: string;
}

interface Props {
  templates: ContractTemplate[];
  onAdd: (data: Draft) => Promise<string | undefined>;
  onUpdate: (id: string, data: Draft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

export function ContractTemplatesView({ templates, onAdd, onUpdate, onDelete, onClose }: Props) {
  const panelRef = useModalA11y<HTMLDivElement>(onClose, true, { closeOnBack: true });
  // null = list; 'new' opens the starter picker; a template id opens its editor.
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: '', category: 'chair', bodyText: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const current = editing !== null && editing !== 'new'
    ? templates.find(t => t.id === editing) ?? null
    : null;

  function openEditor(t: ContractTemplate) {
    setDraft({ name: t.name, category: t.category, bodyText: t.bodyText });
    setEditing(t.id);
    setSaveError('');
    setConfirmDelete(false);
  }

  function startFrom(starter: Pick<ContractTemplate, 'name' | 'category' | 'bodyText'> | null) {
    setDraft(starter
      ? { name: starter.name, category: starter.category, bodyText: starter.bodyText }
      : { name: '', category: 'chair', bodyText: '' });
    setEditing('new');
    setSaveError('');
    setConfirmDelete(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    const data = { ...draft, name: draft.name.trim() };
    try {
      await whenQueued(current ? onUpdate(current.id, data) : onAdd(data).then(() => undefined));
      setEditing(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save — try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!current) return;
    setSaving(true);
    try {
      await onDelete(current.id);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  const inEditor = editing !== null && (editing === 'new' ? true : current !== null);

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Contract templates">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">
            {inEditor ? (current ? 'Edit Template' : 'New Template') : 'Contract Templates'}
          </span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>

        {!inEditor ? (
          <div className="dir-drawer-body">
            <p className="dir-field-hint" style={{ marginTop: 0 }}>
              The reusable agreement text contracts are issued from. Issuing freezes a copy
              onto the contract, so editing a template never changes terms already sent or signed.
            </p>
            {templates.length === 0 && (
              <div className="dir-empty-inline">No templates yet — start from a generic one below.</div>
            )}
            {templates.map(t => (
              <button key={t.id} className="dir-tmpl-row" onClick={() => openEditor(t)}>
                <FileText size={15} />
                <span className="dir-tmpl-name">{t.name}</span>
                <span className="dir-tmpl-meta">{CATEGORY_LABEL[t.category]} · v{t.version}</span>
              </button>
            ))}
            <div className="dir-detail-section-title" style={{ marginTop: 18 }}>
              <Plus size={13} /> New template
            </div>
            <div className="dir-tmpl-starters">
              {STARTER_TEMPLATES.map(s => (
                <button key={s.name} className="dir-tool-btn" onClick={() => startFrom(s)}>
                  {s.name}
                </button>
              ))}
              <button className="dir-tool-btn" onClick={() => startFrom(null)}>Blank</button>
            </div>
          </div>
        ) : (
          <>
            <div className="dir-drawer-body">
              <div className="dir-field-row">
                <div className="dir-field">
                  <label className="dir-label">Name *</label>
                  <input className="dir-input" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="e.g. Per-service musician agreement" />
                </div>
                <div className="dir-field">
                  <label className="dir-label">Written for</label>
                  <select className="dir-select" value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value as PositionCategory }))}>
                    {(Object.keys(CATEGORY_LABEL) as PositionCategory[]).map(c => (
                      <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="dir-field">
                <label className="dir-label">Agreement text *</label>
                <RichTextArea
                  className="dir-input dir-tmpl-body"
                  rows={14}
                  value={draft.bodyText}
                  onChange={v => setDraft(d => ({ ...d, bodyText: v }))}
                  placeholder="The agreement prose. Use the placeholders below for anything that comes from the contract itself."
                />
              </div>

              <details className="dir-tmpl-tokens">
                <summary>Placeholders</summary>
                <p className="dir-field-hint">
                  Filled in from each contract’s own fields when the agreement is shown or
                  printed — rates and dates live on the contract, never in this text.
                </p>
                <dl>
                  {CONTRACT_TOKENS.map(t => (
                    <div key={t.token}>
                      <dt><code>{t.token}</code></dt>
                      <dd>{t.meaning}</dd>
                    </div>
                  ))}
                </dl>
              </details>

              {current && (
                <p className="dir-field-hint">
                  Version {current.version}. Saving a text change bumps the version; contracts
                  already issued keep the copy (and version number) they were issued from.
                </p>
              )}

              {current && (
                confirmDelete ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="dir-btn dir-btn-danger" style={{ flex: 1 }} onClick={handleDelete} disabled={saving}>
                      Confirm Delete
                    </button>
                    <button className="dir-btn dir-btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
                  </div>
                ) : (
                  <button className="dir-btn dir-btn-danger" onClick={() => setConfirmDelete(true)}>
                    <Trash2 size={15} /> Delete Template
                  </button>
                )
              )}
            </div>
            {saveError && (
              <div style={{ padding: '4px 16px 0', fontSize: 13, color: 'var(--dir-danger)' }}>{saveError}</div>
            )}
            <div className="dir-drawer-footer">
              <button className="dir-btn dir-btn-ghost" onClick={() => setEditing(null)}>Back</button>
              <button
                className="dir-btn dir-btn-primary"
                onClick={handleSave}
                disabled={saving || !draft.name.trim() || !draft.bodyText.trim()}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
