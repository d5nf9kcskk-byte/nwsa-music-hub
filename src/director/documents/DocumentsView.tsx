import { useMemo, useState } from 'react';
import { FileText, Plus, ExternalLink, Paperclip } from 'lucide-react';
import './documents.css';
import { useDocuments } from '../hooks/useDocuments';
import { useEnsembles } from '../hooks/useEnsembles';
import { EnsembleFilter } from '../components/EnsembleFilter';
import { FileUpload } from '../components/FileUpload';
import { RichTextArea } from '../components/RichTextArea';
import { EditedByLine } from '../components/EditedByLine';
import { musicEnsembles } from '../utils';
import { DOC_CATEGORIES, DOC_AUDIENCES, DOC_CATEGORY_COLOR } from '../../shared/docMeta';
import type {
  LibraryDocument, DocumentCategory, DocumentAudience, Ensemble, Attachment,
} from '../types';

const CATEGORY_COLOR = DOC_CATEGORY_COLOR;

// Sentinel for the "General (school-wide)" pick in the ensemble filter.
const GENERAL = '__general__';

// ── Document form drawer ──────────────────────────────────────────────

interface FormProps {
  document: LibraryDocument | null;
  ensembles: Ensemble[];
  onSave: (data: Omit<LibraryDocument, 'id'>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

function DocumentForm({ document, ensembles, onSave, onDelete, onClose }: FormProps) {
  const [title, setTitle] = useState(document?.title ?? '');
  const [category, setCategory] = useState<DocumentCategory>(document?.category ?? 'Handbook');
  const [audience, setAudience] = useState<DocumentAudience>(document?.audience ?? 'All');
  const [ensembleIds, setEnsembleIds] = useState<string[]>(document?.ensembleIds ?? []);
  const [url, setUrl] = useState(document?.url ?? '');
  const [description, setDescription] = useState(document?.description ?? '');
  const [attachments, setAttachments] = useState<Attachment[]>(document?.file ? [document.file] : []);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Stable folder for uploads so a file can be attached while still creating the
  // doc — the folder id is independent of the Firestore document id.
  const [uploadId] = useState(() => document?.id ?? `new-${Date.now()}`);

  function toggleEnsemble(id: string) {
    setEnsembleIds(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  }

  async function handleSave() {
    if (!title.trim()) { setSaveError('Give the document a title.'); return; }
    if (attachments.length === 0 && !url.trim()) {
      setSaveError('Add a file or a link.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      await Promise.race([
        onSave({
          title: title.trim(),
          category,
          audience: audience === 'All' ? undefined : audience,
          ensembleIds,
          file: attachments[0] ?? undefined,
          url: url.trim() || undefined,
          description: description.trim() || undefined,
          createdAt: document?.createdAt ?? Date.now(),
          order: document?.order ?? 0,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Save timed out — check your connection')), 20_000)
        ),
      ]);
      onClose();
    } catch (err) {
      setSaving(false);
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">{document ? 'Edit Document' : 'New Document'}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          {document && <EditedByLine updatedAt={document.updatedAt} updatedBy={document.updatedBy} />}
          <div className="dir-field">
            <label className="dir-label">Title *</label>
            <input
              className="dir-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Student Handbook 2025–26"
              autoFocus
            />
          </div>

          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">Type</label>
              <select className="dir-select" value={category} onChange={e => setCategory(e.target.value as DocumentCategory)}>
                {DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="dir-field">
              <label className="dir-label">Audience</label>
              <select className="dir-select" value={audience} onChange={e => setAudience(e.target.value as DocumentAudience)}>
                {DOC_AUDIENCES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          <div className="dir-field">
            <label className="dir-label">
              Ensembles <span className="dir-label-hint">leave empty for a General (school-wide) document</span>
            </label>
            <div className="dir-checkbox-group">
              {ensembles.map(e => (
                <label key={e.id} className={`dir-checkbox-tag ${ensembleIds.includes(e.id) ? 'checked' : ''}`}>
                  <input type="checkbox" checked={ensembleIds.includes(e.id)} onChange={() => toggleEnsemble(e.id)} />
                  {e.name}
                </label>
              ))}
            </div>
            {ensembleIds.length === 0 && (
              <div className="dir-field-hint">Tagged <strong>General</strong> — shown to everyone under General documents.</div>
            )}
          </div>

          <div className="dir-field">
            <label className="dir-label">File</label>
            <FileUpload
              attachments={attachments}
              onChange={setAttachments}
              folder={`documents/${uploadId}`}
              single
              label="Upload file (PDF, image, …)"
            />
          </div>

          <div className="dir-field">
            <label className="dir-label">
              Or link <span className="dir-label-hint">Google Drive, district site, etc.</span>
            </label>
            <input
              className="dir-input"
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>

          <div className="dir-field">
            <label className="dir-label">Description</label>
            <RichTextArea
              value={description}
              onChange={setDescription}
              placeholder="Optional — what this is, who it's for"
            />
          </div>

          {document && onDelete && (
            confirmDelete ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="dir-btn dir-btn-danger"
                  style={{ flex: 1 }}
                  onClick={async () => { await onDelete(); onClose(); }}
                  disabled={saving}
                >
                  Confirm Delete
                </button>
                <button className="dir-btn dir-btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            ) : (
              <button className="dir-btn dir-btn-danger" onClick={() => setConfirmDelete(true)}>
                Delete Document
              </button>
            )
          )}
        </div>
        {saveError && (
          <div style={{ padding: '4px 16px 0', fontSize: 13, color: 'var(--dir-danger)' }}>{saveError}</div>
        )}
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="dir-btn dir-btn-primary" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────

export function DocumentsView({ initialEnsembleId = '' }: { initialEnsembleId?: string }) {
  const { documents, loading, addDocument, updateDocument, deleteDocument } = useDocuments();
  const { ensembles } = useEnsembles();
  const musicEns = musicEnsembles(ensembles);

  const [filterEns, setFilterEns] = useState(initialEnsembleId);
  const [filterCat, setFilterCat] = useState<DocumentCategory | ''>('');
  const [addingNew, setAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const ensName = (id: string) => ensembles.find(e => e.id === id)?.name ?? id;

  const shown = useMemo(() => documents.filter(d => {
    if (filterCat && d.category !== filterCat) return false;
    if (!filterEns) return true;
    if (filterEns === GENERAL) return d.ensembleIds.length === 0;
    return d.ensembleIds.includes(filterEns);
  }), [documents, filterEns, filterCat]);

  const editing = documents.find(d => d.id === editingId) ?? null;

  return (
    <div>
      <div className="dir-section-header">
        <span className="dir-section-title">Document Repository</span>
      </div>

      {!loading && documents.length === 0 && (
        <div className="dir-empty">
          <FileText size={40} />
          <h3>No documents yet</h3>
          <p>Tap + to upload a syllabus, handbook, form, or other resource — tag it with an ensemble, or leave it General for the whole program.</p>
        </div>
      )}

      {documents.length > 0 && (
        <div className="dir-doc-filters">
          <EnsembleFilter
            ensembles={ensembles}
            value={filterEns}
            onChange={setFilterEns}
            allLabel="All ensembles"
            extraOptions={[{ value: GENERAL, label: 'General (school-wide)' }]}
          />
          <div className="dir-ens-filter">
            <label className="dir-ens-filter-label">Type</label>
            <select className="dir-select dir-ens-filter-select" value={filterCat} onChange={e => setFilterCat(e.target.value as DocumentCategory | '')} aria-label="Filter by type">
              <option value="">All types</option>
              {DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className="dir-doc-list">
        {documents.length > 0 && shown.length === 0 && (
          <div className="dir-empty-inline">No documents match this filter.</div>
        )}
        {shown.map(d => (
          <div key={d.id} className="dir-doc-card" onClick={() => setEditingId(d.id)}>
            <div className="dir-doc-card-top">
              <span
                className="dir-doc-badge"
                style={{ background: CATEGORY_COLOR[d.category] + '22', color: CATEGORY_COLOR[d.category] }}
              >
                {d.category}
              </span>
              {d.audience && d.audience !== 'All' && <span className="dir-doc-aud">{d.audience}</span>}
              <span className="dir-doc-source">
                {d.file ? <><Paperclip size={12} /> File</> : <><ExternalLink size={12} /> Link</>}
              </span>
            </div>
            <div className="dir-doc-title">{d.title}</div>
            <div className="dir-doc-ens">
              {d.ensembleIds.length === 0
                ? 'General'
                : d.ensembleIds.map(ensName).join(', ')}
            </div>
          </div>
        ))}
      </div>

      <button className="dir-fab" onClick={() => setAddingNew(true)} aria-label="New document">
        <Plus size={22} />
      </button>

      {addingNew && (
        <DocumentForm
          document={null}
          ensembles={musicEns}
          onSave={addDocument}
          onClose={() => setAddingNew(false)}
        />
      )}

      {editing && (
        <DocumentForm
          document={editing}
          ensembles={musicEns}
          onSave={data => updateDocument(editing.id, data)}
          onDelete={() => deleteDocument(editing.id)}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
