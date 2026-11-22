import { useMemo, useState } from 'react';
import { Upload } from 'lucide-react';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { currentDirectorName, currentDirectorRole } from '../currentDirector';
import { trackWrite } from '../writeStatus';
import { useModalA11y } from '../../shared/useModalA11y';
import { backdropClose } from '../../shared/backdropClose';
import { looksBinary } from '../roster/rosterCsv';
import { musicEnsembles } from '../utils';
import type { Ensemble } from '../types';
import { planPersonnelImport, draftContractFor } from './importPlan';
import { formatCents } from './contractMoney';

/**
 * Bring a spreadsheet of players in (#personnel): personnel doc, private
 * contact doc, and a Draft contract for every row that has a fee. Paste or
 * choose a file, read the preview, then import. What is refused and why is
 * importPlan.ts's job; this file only shows it and writes the plan.
 *
 * Writes go in batches of 150 people (three docs each, under the 500-write
 * cap) so 85 players are one round trip, not 255.
 */

const PER_BATCH = 150;

interface Props {
  ensembles: Ensemble[];
  existingNames: string[];
  onClose: () => void;
}

export function PersonnelImport({ ensembles, existingNames, onClose }: Props) {
  const panelRef = useModalA11y<HTMLDivElement>(onClose, true, { closeOnBack: true });
  const choices = musicEnsembles(ensembles);
  const [text, setText] = useState('');
  const [ensembleId, setEnsembleId] = useState(choices[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [error, setError] = useState('');

  const plan = useMemo(() => (text.trim() && !looksBinary(text) ? planPersonnelImport(text, existingNames) : null), [text, existingNames]);
  const drafts = plan?.people.filter(p => p.feeCents != null).length ?? 0;

  async function readFile(f: File | undefined) {
    if (!f) return;
    const t = await f.text();
    if (looksBinary(t)) { setError('That looks like an Excel or Numbers file. Export it as CSV first.'); return; }
    setError('');
    setText(t);
  }

  async function run() {
    if (!plan || plan.refused || plan.people.length === 0) return;
    if (!db) { setError('Importing needs a connection to the database.'); return; }
    const dbRef = db;
    setBusy(true);
    setError('');
    const stamp = { updatedAt: Date.now(), updatedBy: currentDirectorName(), updatedByRole: currentDirectorRole() };
    try {
      for (let i = 0; i < plan.people.length; i += PER_BATCH) {
        const batch = writeBatch(dbRef);
        for (const p of plan.people.slice(i, i + PER_BATCH)) {
          const ref = doc(collection(dbRef, 'personnel'));
          const section = p.section ?? p.instrument;
          const ensembleIds = ensembleId ? [ensembleId] : [];
          batch.set(ref, {
            name: p.name, status: p.status, ensembleIds, ...stamp,
            ...(p.instrument ? { instrument: p.instrument } : {}),
            ...(section ? { section } : {}),
            ...(p.seat ? { seat: p.seat } : {}),
          });
          const contact = {
            ...(p.email ? { email: p.email } : {}), ...(p.phone ? { phone: p.phone } : {}),
            ...(p.address ? { address: p.address } : {}), ...(p.payMethod ? { payMethod: p.payMethod } : {}),
            ...(p.payHandle ? { payHandle: p.payHandle } : {}), ...(p.w9Status ? { w9Status: p.w9Status } : {}),
            ...(Object.keys(p.extra).length ? { extra: p.extra } : {}),
          };
          if (Object.keys(contact).length) batch.set(doc(dbRef, 'personnelContacts', ref.id), contact);
          const d = draftContractFor(p);
          if (d) {
            batch.set(doc(collection(dbRef, 'contracts')), {
              personnelId: ref.id, personnelName: p.name, ...d, status: 'Draft',
              ...(section && d.category === 'chair' ? { section } : {}),
              ...(p.seat && d.category === 'chair' ? { seat: p.seat } : {}),
              ensembleIds, createdAt: Date.now(), ...stamp,
            });
          }
        }
        await trackWrite('Roster import', () => batch.commit());
      }
      setDone(`Imported ${plan.people.length} ${plan.people.length === 1 ? 'person' : 'people'}${drafts ? ` and ${drafts} draft contracts` : ''}.`);
      setText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed, nothing more was written.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dir-drawer-overlay" {...backdropClose(onClose)}>
      <div className="dir-drawer" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Import players">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">Import players</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <p className="dir-field-hint">
            A CSV with a heading row. Recognized: Name (or First and Last), Instrument, Section, Seat, Status (“sub”),
            Email, Phone, Address, Pay method, Zelle / Venmo / PayPal / Handle, W-9, Position, Fee, Services. Any other
            column is kept as a note. A Fee makes a Draft contract: per service when Services is given, otherwise one flat sum.
            Never put a Social Security, tax id or bank number in the file: those are refused.
          </p>
          {choices.length > 0 && (
            <div className="dir-field">
              <label className="dir-label">Put everyone in</label>
              <select className="dir-select" value={ensembleId} onChange={e => setEnsembleId(e.target.value)}>
                <option value="">No ensemble yet</option>
                {choices.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}
          <div className="dir-field">
            <label className="dir-tool-btn" style={{ display: 'inline-flex' }}>
              <Upload size={14} /> Choose a CSV file
              <input type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={e => void readFile(e.target.files?.[0])} />
            </label>
          </div>
          <div className="dir-field">
            <label className="dir-label" htmlFor="pers-import-text">…or paste it here</label>
            <textarea id="pers-import-text" className="dir-input" rows={6} value={text} onChange={e => setText(e.target.value)} placeholder={'Name,Instrument,Seat,Email,Fee,Services\nRania Khoury,Flute,1,rania@example.org,110,4'} />
          </div>

          {plan?.refused && <p className="pers-import-refused" role="alert">{plan.refused}</p>}
          {plan && !plan.refused && (
            <div className="pers-import-preview">
              <p><strong>{plan.people.length}</strong> to add{drafts > 0 && <> · <strong>{drafts}</strong> draft contracts</>}{plan.skipped.length > 0 && <> · <strong>{plan.skipped.length}</strong> left out</>}</p>
              <ul>
                {plan.people.slice(0, 8).map(p => (
                  <li key={p.name}>{p.name} · {[p.instrument, p.seat ? `Seat ${p.seat}` : null, p.status === 'SubList' ? 'Sub list' : null, p.feeCents != null ? `${formatCents(p.feeCents)}${p.services ? ` × ${p.services}` : ''}` : null].filter(Boolean).join(' · ')}</li>
                ))}
                {plan.people.length > 8 && <li>…and {plan.people.length - 8} more</li>}
              </ul>
              {[...plan.skipped, ...plan.notes].map(n => <p key={n} className="dir-field-hint">{n}</p>)}
            </div>
          )}
          {done && <p role="status">{done}</p>}
          {error && <p className="pers-import-refused" role="alert">{error}</p>}
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose}>{done ? 'Close' : 'Cancel'}</button>
          <button className="dir-btn dir-btn-primary" disabled={busy || !plan || Boolean(plan.refused) || plan.people.length === 0} onClick={() => void run()}>
            {busy ? 'Importing…' : `Import ${plan && !plan.refused ? plan.people.length : ''}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
