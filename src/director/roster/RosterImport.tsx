import { useMemo, useState } from 'react';
import { Upload, FileSpreadsheet } from 'lucide-react';
import { useStudents } from '../hooks/useStudents';
import { useContacts } from '../hooks/useContacts';
import { useEnsembles } from '../hooks/useEnsembles';
import { useModalA11y } from '../../shared/useModalA11y';
import {
  parseDelimited, looksBinary, autoMapHeaders, buildImportRows, planMerge, contactFromRow,
  type ColMap, type MergePlan,
} from './rosterCsv';

/**
 * Roster spreadsheet import (beta). Parses a CSV/TSV of students + parent
 * guardians, shows a DRY-RUN preview (create / update / unchanged) before any
 * write, then merges: matched students are updated field-by-field and unmatched
 * rows are added. Never deletes. Contacts keep the flat email/phone in sync with
 * the primary guardian for back-compat.
 */
export function RosterImport({ onClose }: { onClose: () => void }) {
  const panelRef = useModalA11y<HTMLDivElement>(onClose, true);
  const { students, addStudent, updateStudent } = useStudents();
  const { contacts, saveContact } = useContacts();
  const { ensembles } = useEnsembles();

  const [text, setText] = useState('');
  const [mergeMode, setMergeMode] = useState<'merge' | 'add'>('merge');
  const [defaultEnsembleId, setDefaultEnsembleId] = useState('');
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const [map, setMap] = useState<ColMap[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'idle' | 'writing' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<{ added: number; updated: number; skipped: number } | null>(null);

  const orderedEnsembles = useMemo(() => [...ensembles].sort((a, b) => a.order - b.order), [ensembles]);

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => { setText(String(reader.result ?? '')); setPlan(null); setError(''); };
    reader.readAsText(file);
  }

  function preview() {
    setError('');
    if (looksBinary(text)) {
      setError('That looks like an Excel/Numbers file. In your spreadsheet, choose File → Export/Save As → CSV, then upload or paste that.');
      return;
    }
    const rows = parseDelimited(text);
    if (rows.length < 2) { setError('No rows found. Include a header row plus at least one student.'); return; }
    const cols = autoMapHeaders(rows[0]);
    if (!cols.some(c => c.kind === 'student' && (c.field === 'name' || c.field === 'first' || c.field === 'last'))) {
      setError('No student-name column detected. Add a "Name" (or "First"/"Last") column header.');
      return;
    }
    const imported = buildImportRows(rows, cols, ensembles, defaultEnsembleId);
    if (imported.length === 0) { setError('No student names found in the rows.'); return; }
    setHeaders(rows[0]);
    setMap(cols);
    setPlan(planMerge(imported, students, contacts, mergeMode));
  }

  async function runImport() {
    if (!plan) return;
    setStatus('writing');
    let added = 0, updated = 0;
    try {
      for (const row of plan.creates) {
        const id = await addStudent({
          name: row.name,
          instrument: row.instrument || '',
          grade: row.grade || undefined,
          section: row.section || undefined,
          ensembleIds: row.ensembleIds,
          status: 'Active',
        });
        const contact = contactFromRow(row);
        if (id && contact) await saveContact(id, contact);
        added++; setProgress(added + updated);
      }
      for (const { row, student, changes } of plan.updates) {
        const patch: { instrument?: string; grade?: string; section?: string } = {};
        if (changes.includes('instrument') && row.instrument) patch.instrument = row.instrument;
        if (changes.includes('grade') && row.grade) patch.grade = row.grade;
        if (changes.includes('section') && row.section) patch.section = row.section;
        if (Object.keys(patch).length) await updateStudent(student.id, patch);
        if (changes.includes('contacts')) {
          const contact = contactFromRow(row);
          if (contact) await saveContact(student.id, contact);
        }
        updated++; setProgress(added + updated);
      }
      setReport({ added, updated, skipped: plan.unchanged + plan.ambiguous.length });
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed partway through. Some rows may have been written.');
      setStatus('idle');
    }
  }

  const columnSummary = map
    .map((c, i) => c.kind === 'extra' ? null
      : c.kind === 'guardian' ? `${headers[i]} → guardian ${c.idx} ${c.field}`
      : `${headers[i]} → ${c.field}`)
    .filter(Boolean);

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Import roster">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title"><FileSpreadsheet size={16} style={{ verticalAlign: '-3px' }} /> Import roster <span className="dir-beta-tag">beta</span></span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>

        <div className="dir-drawer-body">
          {status === 'done' && report ? (
            <div className="dir-gen-preview">
              <div className="dir-gen-preview-count">Done ✓ — added {report.added}, updated {report.updated}{report.skipped ? `, left ${report.skipped} unchanged` : ''}.</div>
            </div>
          ) : (
            <>
              <div className="dir-field-hint" style={{ marginBottom: 8 }}>
                Upload or paste a CSV with a <strong>Name</strong> column (plus optional Instrument, Grade, Section, and
                Parent/Guardian Name/Email/Phone columns). Nothing is written until you review the preview. Existing
                students are matched by name and updated; new names are added. It never deletes.
              </div>

              <div className="dir-field">
                <label className="dir-label"><Upload size={12} /> Spreadsheet file (.csv / .tsv)</label>
                <input className="dir-input" type="file" accept=".csv,.tsv,.txt" onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f); }} />
              </div>
              <div className="dir-field">
                <label className="dir-label">…or paste rows</label>
                <textarea className="dir-input dir-textarea" rows={4} value={text} onChange={e => { setText(e.target.value); setPlan(null); }} placeholder="Name,Instrument,Grade,Parent Name,Parent Email,Parent Phone" />
              </div>

              <div className="dir-field-row">
                <div className="dir-field">
                  <label className="dir-label">Mode</label>
                  <select className="dir-input" value={mergeMode} onChange={e => { setMergeMode(e.target.value as 'merge' | 'add'); setPlan(null); }}>
                    <option value="merge">Update &amp; add (recommended)</option>
                    <option value="add">Add new only</option>
                  </select>
                </div>
                <div className="dir-field">
                  <label className="dir-label">New students join</label>
                  <select className="dir-input" value={defaultEnsembleId} onChange={e => { setDefaultEnsembleId(e.target.value); setPlan(null); }}>
                    <option value="">— no ensemble —</option>
                    {orderedEnsembles.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
              </div>

              {error && <div className="dir-import-error">{error}</div>}

              {plan && (
                <div className="dir-gen-preview">
                  <div className="dir-gen-preview-count">
                    Create {plan.creates.length} · Update {plan.updates.length} · Unchanged {plan.unchanged}
                    {plan.ambiguous.length > 0 ? ` · ${plan.ambiguous.length} ambiguous (skipped)` : ''}
                  </div>
                  <div className="dir-gen-preview-dates">
                    {columnSummary.slice(0, 8).map((s, i) => <span key={i} className="dir-gen-preview-date">{s}</span>)}
                  </div>
                  {plan.creates.slice(0, 4).map((r, i) => <div key={`c${i}`} className="dir-field-hint">＋ {r.name}{r.instrument ? ` · ${r.instrument}` : ''}{r.guardians.length ? ` · ${r.guardians.length} guardian(s)` : ''}</div>)}
                  {plan.updates.slice(0, 4).map((u, i) => <div key={`u${i}`} className="dir-field-hint">✎ {u.student.name} — {u.changes.join(', ')}</div>)}
                  {plan.ambiguous.length > 0 && <div className="dir-import-error" style={{ marginTop: 6 }}>Skipped {plan.ambiguous.length} row(s) whose name matches more than one student — fix those by hand.</div>}
                </div>
              )}
            </>
          )}
        </div>

        {status !== 'done' && (
          <div className="dir-drawer-footer">
            <button className="dir-btn dir-btn-ghost" onClick={onClose}>Cancel</button>
            {!plan ? (
              <button className="dir-btn dir-btn-primary" onClick={preview} disabled={!text.trim()}>Preview</button>
            ) : (
              <button className="dir-btn dir-btn-primary" onClick={runImport} disabled={status === 'writing' || (plan.creates.length + plan.updates.length === 0)}>
                {status === 'writing' ? `Importing… ${progress}` : `Import ${plan.creates.length + plan.updates.length}`}
              </button>
            )}
          </div>
        )}
        {status === 'done' && (
          <div className="dir-drawer-footer">
            <button className="dir-btn dir-btn-primary" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
