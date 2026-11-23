import './personnel.css';
import { useState, useEffect, useMemo } from 'react';
import { UserPlus, Users, Star, FileText, ClipboardList, Upload, Download } from 'lucide-react';
import { deleteField } from 'firebase/firestore';
import { useEnsembles } from '../hooks/useEnsembles';
import { usePersonnel } from '../hooks/usePersonnel';
import { usePersonnelContacts } from '../hooks/usePersonnelContacts';
import { useContracts } from '../hooks/useContracts';
import { useContractTemplates } from '../hooks/useContractTemplates';
import { usePayments } from '../hooks/usePayments';
import { useMemberEntries } from '../hooks/useMemberEntries';
import { recordActivity } from '../hooks/useActivityLog';
import { EnsembleFilter } from '../components/EnsembleFilter';
import { scoreOrderRank, lastName } from '../scoreOrder';
import { PersonnelForm } from './PersonnelForm';
import { PersonnelDetail } from './PersonnelDetail';
import { ContractSheet } from './ContractSheet';
import { ContractForm, type ContractDraftData } from './ContractForm';
import { ContractTemplatesView } from './ContractTemplatesView';
import { ServiceAttendanceSheet } from './ServiceAttendanceSheet';
import { PersonnelImport } from './PersonnelImport';
import { PersonnelEmailBar } from './PersonnelEmailBar';
import { PersonnelReports } from './PersonnelReports';
import { contractTotalCents, paidCents, payState, formatCents } from './contractMoney';
import type { Personnel, Contract, Payment } from '../types';

/**
 * The paid roster (#personnel) — the RosterView pattern rebuilt for adults:
 * a PARALLEL screen, deliberately NOT a feature-flagged variant of the
 * student roster (docs/fair-copy/as-build-plan.md step 3). The student
 * screens are saturated with grade/guardian/school-ID assumptions, and one
 * missed flag there would render a pay-adjacent detail on a student screen;
 * separate screens make that structurally impossible.
 *
 * Where RosterView groups by ensemble, this groups by SECTION in score
 * order with seats inside — the shape a personnel manager actually reads a
 * roster in. Contracts appear read-only (a status pill per person, full
 * terms in the detail sheet); issuing and signing are the contract-surfaces
 * step. Everything here rides the Step 2 hooks, which gate subscriptions to
 * Owner/Director in a personnel org and never write what firestore.rules
 * would reject.
 */

type View = '' | 'subs' | 'missing' | 'archived' | 'unsent' | 'sent' | 'signed' | 'unpaid';

/** The saved views, in the order they show. Contract-status views read the
 *  newest live contract, the same one the row's pill shows. */
const VIEWS: { id: Exclude<View, ''>; label: string }[] = [
  { id: 'unsent', label: 'Not sent' },
  { id: 'sent', label: 'Awaiting signature' },
  { id: 'signed', label: 'Signed' },
  { id: 'unpaid', label: 'Unpaid' },
  { id: 'subs', label: 'Sub list' },
  { id: 'missing', label: 'Missing paperwork' },
  { id: 'archived', label: 'Archived' },
];

/** The contract a row stands for: newest non-void, else newest of what is left. */
function newestContract(contracts: Contract[]): Contract | undefined {
  const live = contracts.filter(c => c.status !== 'Void');
  return [...(live.length ? live : contracts)].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
}

const STATUS_ROW_LABEL: Record<Personnel['status'], string | null> = {
  Contracted: null, // the default — unlabeled, like Active students
  SubList: 'Sub list',
  Inactive: 'Archived',
};

export default function PersonnelManager({ initialPersonId, initialEventId }: {
  /** Open this person's detail on arrival — a name picked in the staff search. */
  initialPersonId?: string;
  /** Open the roll on this service on arrival — "Attendance" on a Today card. */
  initialEventId?: string;
}) {
  const { ensembles } = useEnsembles();
  const { personnel, loading, addPersonnel, updatePersonnel, deletePersonnel, archivePersonnel, restorePersonnel } = usePersonnel();
  const { contacts, savePersonnelContact } = usePersonnelContacts();
  const {
    contracts, addContract, updateContract,
    signContract, countersignContract, voidContract, setContractNotes, deleteContract,
  } = useContracts();
  const { templates, addTemplate, updateTemplate, deleteTemplate } = useContractTemplates();
  const { payments, addPayment, deletePayment } = usePayments();
  const { members, invite, remove: removeSignIn } = useMemberEntries();

  useEffect(() => { recordActivity('personnel.view'); }, []);

  const [viewing, setViewing] = useState<Personnel | null>(null);
  const [editing, setEditing] = useState<Personnel | null | 'new'>(null);
  // Deep-link from search: open the person's detail once the roster loads
  // (the RosterView pattern: adjust state during render, guarded by the
  // consumed id).
  const [consumedPersonId, setConsumedPersonId] = useState<string | null>(null);
  if (initialPersonId && consumedPersonId !== initialPersonId && personnel.length > 0) {
    setConsumedPersonId(initialPersonId);
    const target = personnel.find(x => x.id === initialPersonId);
    if (target) setViewing(target);
  }
  // Contract surfaces (build-plan step 4). The open sheet tracks an ID and
  // derives the live doc, so a sign or countersign refreshes it in place.
  const [openContractId, setOpenContractId] = useState<string | null>(null);
  const [contractEdit, setContractEdit] = useState<{ person: Personnel; contract: Contract | null } | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(Boolean(initialEventId));
  const openContract = openContractId != null
    ? contracts.find(c => c.id === openContractId) ?? null
    : null;
  const [search, setSearch] = useState('');
  const [filterEnsembleId, setFilterEnsembleId] = useState('');
  // Saved views, the RosterView pattern: '' = working roster (Contracted +
  // Sub list), 'subs' = sub list only, 'missing' = contact or W-9 paperwork
  // to chase, 'archived' = Inactive.
  const [view, setView] = useState<View>('');
  // Ticked rows (the email/text bar). Ids, so a filter change keeps them.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const contractsByPerson = useMemo(() => {
    const m: Record<string, Contract[]> = {};
    for (const c of contracts) (m[c.personnelId] ??= []).push(c);
    return m;
  }, [contracts]);

  const paymentsByContract = useMemo(() => {
    const m: Record<string, Payment[]> = {};
    for (const p of payments) (m[p.contractId] ??= []).push(p);
    return m;
  }, [payments]);

  // Roster-wide money: what the agreed (signed) contracts come to, what has
  // gone out against them, and what is still owed. Void contracts and
  // estimates with no quantity yet are left out, not guessed at.
  const ledger = useMemo(() => {
    let owed = 0, paid = 0;
    for (const c of contracts) {
      if (c.status !== 'Signed' && c.status !== 'Countersigned') continue;
      const t = contractTotalCents(c);
      if (t == null) continue;
      owed += t;
      paid += paidCents(paymentsByContract[c.id] ?? []);
    }
    return { owed, paid };
  }, [contracts, paymentsByContract]);

  // Newest contract is a Draft, for the ticked people: what "Mark sent" acts on.
  const selectedDrafts = [...selected].map(id => newestContract(contractsByPerson[id] ?? [])).filter((c): c is Contract => c?.status === 'Draft');
  const invitedEmails = new Set(members.map(m => m.email));
  const toInvite = personnel.filter(p => {
    const email = (contacts[p.id]?.email ?? '').trim().toLowerCase();
    return selected.has(p.id) && email.includes('@') && !invitedEmails.has(email);
  });

  const isEmpty = !loading && personnel.length === 0;

  const q = search.trim().toLowerCase();
  const filtered = personnel.filter(p => {
    if (q) {
      const hay = [p.name, p.preferredName, p.instrument, p.section, ...(p.doubles ?? [])]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filterEnsembleId && !p.ensembleIds?.includes(filterEnsembleId)) return false;
    if (view === 'archived') return p.status === 'Inactive';
    if (p.status === 'Inactive') return false;
    if (view === 'subs') return p.status === 'SubList';
    if (view === 'missing') {
      const c = contacts[p.id];
      return !c || (!c.email && !c.phone) || (c.w9Status ?? 'not-requested') !== 'on-file';
    }
    if (view) {
      const n = newestContract(contractsByPerson[p.id] ?? []);
      if (view === 'unsent') return n ? n.status === 'Draft' || n.status === 'Void' : p.status === 'Contracted';
      if (view === 'sent') return n?.status === 'Sent';
      if (view === 'signed') return n?.status === 'Signed' || n?.status === 'Countersigned';
      if (view === 'unpaid') {
        const s = n ? payState(n, paymentsByContract[n.id] ?? []) : null;
        return s === 'unpaid' || s === 'part';
      }
    }
    return true;
  });

  // Sections in score order (by the section's instruments), seats inside —
  // seatless members after seated ones, then by last name. People with no
  // section (podium, staff, unplaced players) close the list.
  const groups = useMemo(() => {
    const bySection = new Map<string, Personnel[]>();
    for (const p of filtered) {
      const key = p.section?.trim() ?? '';
      const list = bySection.get(key);
      if (list) list.push(p);
      else bySection.set(key, [p]);
    }
    const sortPeople = (people: Personnel[]) => [...people].sort((a, b) =>
      (a.seat ?? Number.MAX_SAFE_INTEGER) - (b.seat ?? Number.MAX_SAFE_INTEGER)
      || lastName(a.name).localeCompare(lastName(b.name))
      || a.name.localeCompare(b.name));
    return [...bySection.entries()]
      .map(([key, people]) => ({
        key: key || '(none)',
        label: key || 'Podium, staff & unsectioned',
        rank: key ? Math.min(...people.map(p => scoreOrderRank(p.instrument))) : Number.POSITIVE_INFINITY,
        people: sortPeople(people),
      }))
      .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
  }, [filtered]);

  /** Draft/Sent save from the ContractForm. Cleared optional numbers become
   *  deleteField() — updateDoc keeps keys the patch omits (the PersonnelForm
   *  seat precedent). */
  async function saveContract(data: ContractDraftData) {
    if (!contractEdit) return;
    const prior = contractEdit.contract;
    if (prior) {
      const patch: Record<string, unknown> = { ...data };
      if (data.seat == null && prior.seat != null) patch.seat = deleteField();
      if (data.baseRateQuantity == null && prior.baseRateQuantity != null) patch.baseRateQuantity = deleteField();
      await updateContract(prior.id, patch as Partial<Contract>);
    } else {
      const id = await addContract({ ...data, status: 'Draft' });
      if (id) setOpenContractId(id);
    }
  }

  return (
    <div>
      <div className="dir-filter-bar">
        {personnel.length > 0 && (
          <input
            className="dir-input"
            placeholder="Search personnel…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        )}
        <button className="dir-tool-btn" onClick={() => setAttendanceOpen(true)}>
          <ClipboardList size={15} /> Attendance
        </button>
        {personnel.length > 0 && (
          <button className="dir-tool-btn" onClick={() => setReportsOpen(true)}>
            <Download size={15} /> Reports
          </button>
        )}
        <button className="dir-tool-btn" onClick={() => setImportOpen(true)}>
          <Upload size={15} /> Import
        </button>
        <button className="dir-tool-btn" onClick={() => setTemplatesOpen(true)}>
          <FileText size={15} /> Contract templates
        </button>
      </div>

      {ensembles.length > 0 && personnel.length > 0 && (
        <EnsembleFilter ensembles={ensembles} value={filterEnsembleId} onChange={setFilterEnsembleId} />
      )}
      {personnel.length > 0 && (
        <div className="dir-tabs">
          {VIEWS.map(v => (
            <button key={v.id} className={`dir-tab dir-tab-view ${view === v.id ? 'active' : ''}`} onClick={() => setView(cur => cur === v.id ? '' : v.id)}>
              {v.label}
            </button>
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <button className="dir-tool-btn pers-select-all" onClick={() => setSelected(s => filtered.every(p => s.has(p.id)) ? new Set([...s].filter(id => !filtered.some(p => p.id === id))) : new Set([...s, ...filtered.map(p => p.id)]))}>
          {filtered.every(p => selected.has(p.id)) ? 'Untick everyone shown' : `Tick everyone shown (${filtered.length})`}
        </button>
      )}

      {ledger.owed > 0 && (
        <p className="dir-pay-summary">
          Signed contracts <strong>{formatCents(ledger.owed)}</strong> · paid <strong>{formatCents(ledger.paid)}</strong> · still owed <strong>{formatCents(Math.max(0, ledger.owed - ledger.paid))}</strong>
        </p>
      )}

      {groups.map(({ key, label, people }) => (
        <div key={key} className="dir-roster-group">
          <div className="dir-roster-group-header">
            {label}
            <span className="dir-roster-count">{people.length}</span>
          </div>
          <div className="dir-roster-list">
            {people.map(p => (
              <PersonnelRow
                key={p.id}
                person={p}
                contracts={contractsByPerson[p.id] ?? []}
                paymentsByContract={paymentsByContract}
                selected={selected.has(p.id)}
                onToggle={() => setSelected(s => { const n = new Set(s); if (!n.delete(p.id)) n.add(p.id); return n; })}
                onOpen={() => setViewing(p)}
              />
            ))}
          </div>
        </div>
      ))}

      {isEmpty && (
        <div className="dir-empty">
          <Users size={40} />
          <h3>No personnel yet</h3>
          <p>Tap + to add your first musician, conductor, or staff member.</p>
        </div>
      )}

      {!isEmpty && personnel.length > 0 && filtered.length === 0 && (
        <div className="dir-empty">
          <Users size={40} />
          <h3>No matches</h3>
          <p>{q ? `No one matches "${search}".` : 'Nothing in this view.'}</p>
        </div>
      )}

      {selected.size > 0 && (
        <PersonnelEmailBar
          people={personnel.filter(p => selected.has(p.id))}
          contacts={contacts}
          draftCount={selectedDrafts.length}
          onMarkSent={() => {
            if (!window.confirm(`Mark ${selectedDrafts.length} draft contract${selectedDrafts.length === 1 ? '' : 's'} as sent? This only records it. Send them from your own email first.`)) return;
            selectedDrafts.forEach(c => void updateContract(c.id, { status: 'Sent' }));
          }}
          inviteCount={toInvite.length}
          onInvite={async () => {
            if (!window.confirm(`Email a Hub invitation to ${toInvite.length} ${toInvite.length === 1 ? 'person' : 'people'}? Each gets a link to choose a password.`)) return '';
            let sent = 0; const failed: string[] = [];
            // One at a time: the server's mailbox cap is per hour, and a tally beats 80 parallel calls.
            for (const p of toInvite) {
              const note = await invite(p.id, p.preferredName || p.name, contacts[p.id]?.email ?? '').catch(() => 'failed');
              if (note.startsWith('Invitation sent')) sent++; else failed.push(`${p.name}: ${note}`);
            }
            return failed.length ? `${sent} sent. Not sent: ${failed.join('; ')}` : `${sent} invitations sent. Each link works for three days.`;
          }}
          onClear={() => setSelected(new Set())}
        />
      )}

      {selected.size === 0 && (
        <button className="dir-fab" onClick={() => setEditing('new')} aria-label="Add person">
          <UserPlus size={22} />
        </button>
      )}

      {viewing !== null && (
        <PersonnelDetail
          person={viewing}
          contact={contacts[viewing.id] ?? null}
          contracts={contractsByPerson[viewing.id] ?? []}
          ensembles={ensembles}
          onEdit={() => { setEditing(viewing); setViewing(null); }}
          onArchive={() => { void archivePersonnel(viewing.id); }}
          onRestore={() => { void restorePersonnel(viewing.id); }}
          onNewContract={() => setContractEdit({ person: viewing, contract: null })}
          onOpenContract={c => setOpenContractId(c.id)}
          onClose={() => setViewing(null)}
          member={members.find(m => m.personnelId === viewing.id)}
          onInvite={() => invite(viewing.id, viewing.preferredName || viewing.name, contacts[viewing.id]?.email ?? '')}
          onRemoveSignIn={() => { const m = members.find(x => x.personnelId === viewing.id); if (m) void removeSignIn(m.email); }}
        />
      )}

      {/* Contract sheet — stacks over the person detail; closing returns there. */}
      {openContract && contractEdit === null && (
        <ContractSheet
          contract={openContract}
          templates={templates}
          onEdit={() => {
            const p = personnel.find(pp => pp.id === openContract.personnelId);
            if (p) setContractEdit({ person: p, contract: openContract });
          }}
          onMarkSent={() => void updateContract(openContract.id, { status: 'Sent' })}
          onSign={sig => signContract(openContract.id, sig)}
          onCountersign={() => countersignContract(openContract.id)}
          onVoid={() => voidContract(openContract.id)}
          onDeleteDraft={() => deleteContract(openContract.id)}
          onSaveNotes={n => setContractNotes(openContract.id, n)}
          payments={paymentsByContract[openContract.id] ?? []}
          defaultMethod={contacts[openContract.personnelId]?.payMethod}
          onMarkPaid={p => addPayment({ contractId: openContract.id, personnelId: openContract.personnelId, ...p })}
          onDeletePayment={deletePayment}
          onClose={() => setOpenContractId(null)}
        />
      )}

      {contractEdit !== null && (
        <ContractForm
          person={contractEdit.person}
          contract={contractEdit.contract}
          templates={templates}
          onSave={saveContract}
          onClose={() => setContractEdit(null)}
        />
      )}

      {/* Per-service roll (#personnel, build-plan step 5). */}
      {attendanceOpen && (
        <ServiceAttendanceSheet
          personnel={personnel}
          contracts={contracts}
          ensembles={ensembles}
          initialEventId={initialEventId}
          onClose={() => setAttendanceOpen(false)}
        />
      )}

      {reportsOpen && (
        <PersonnelReports
          people={personnel.filter(p => p.status !== 'Inactive' && (!filterEnsembleId || p.ensembleIds?.includes(filterEnsembleId)))}
          contacts={contacts} contracts={contracts} payments={payments}
          onClose={() => setReportsOpen(false)}
        />
      )}

      {importOpen && (
        <PersonnelImport ensembles={ensembles} existingNames={personnel.map(p => p.name)} onClose={() => setImportOpen(false)} />
      )}

      {templatesOpen && (
        <ContractTemplatesView
          templates={templates}
          onAdd={addTemplate}
          onUpdate={updateTemplate}
          onDelete={deleteTemplate}
          onClose={() => setTemplatesOpen(false)}
        />
      )}

      {editing !== null && (
        <PersonnelForm
          person={editing === 'new' ? null : editing}
          contact={editing !== 'new' ? contacts[editing.id] ?? null : null}
          ensembles={ensembles}
          hasContracts={editing !== 'new' && (contractsByPerson[editing.id] ?? []).length > 0}
          onSave={async (data, contact) => {
            if (editing === 'new') {
              const newId = await addPersonnel(data);
              if (newId) await savePersonnelContact(newId, contact);
            } else {
              // updateDoc keeps keys the patch omits, so an emptied seat has
              // to be deleted explicitly — the one field the form clears by
              // omission rather than by writing ''.
              const patch: Partial<Omit<Personnel, 'id'>> = { ...data };
              if (data.seat == null && editing.seat != null) {
                (patch as Record<string, unknown>).seat = deleteField();
              }
              await updatePersonnel(editing.id, patch);
              await savePersonnelContact(editing.id, contact);
            }
          }}
          onDelete={
            // Archive-over-delete once contracts point at someone (the hook's
            // own guidance): the delete option simply doesn't exist then.
            editing !== 'new' && (contractsByPerson[editing.id] ?? []).length === 0
              ? async () => {
                  // Blank the private contact doc first, the RosterView
                  // pattern — the roster delete must not leave an orphaned
                  // doc of payroll-adjacent PII behind.
                  await savePersonnelContact(editing.id, {
                    email: '', phone: '', address: '', emergencyName: '',
                    emergencyPhone: '', unionLocal: '', payMethod: '', payHandle: '', w9Status: 'not-requested',
                  });
                  await deletePersonnel(editing.id);
                }
              : undefined
          }
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function PersonnelRow({ person, contracts, paymentsByContract, selected, onToggle, onOpen }: { person: Personnel; contracts: Contract[]; paymentsByContract: Record<string, Payment[]>; selected: boolean; onToggle: () => void; onOpen: () => void }) {
  // The row's pill mirrors the person's paperwork state: the newest
  // non-void contract's status, Void if that's all there is, or a nudge
  // that a contracted member has no contract at all.
  const newest = newestContract(contracts);
  const statusLabel = STATUS_ROW_LABEL[person.status];
  const pay = newest ? payState(newest, paymentsByContract[newest.id] ?? []) : null;
  return (
    <div className="dir-roster-card" onClick={onOpen}>
      <input
        type="checkbox" className="pers-tick" checked={selected} aria-label={`Select ${person.name}`}
        onClick={e => e.stopPropagation()} onChange={onToggle}
      />
      <div className={`dir-status-dot ${person.status}`} />
      <div className="dir-roster-info">
        <div className="dir-roster-name">
          {person.name}
          {person.sectionLeader && (
            <span className="dir-pers-leader" title="Section leader"> <Star size={12} /></span>
          )}
        </div>
        <div className="dir-roster-detail">
          {[
            person.instrument,
            person.seat != null ? `Seat ${person.seat}` : null,
            person.doubles?.length ? `+ ${person.doubles.join(', ')}` : null,
            statusLabel,
          ].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div className="pers-pills">
        {pay && <span className={`dir-pay-pill ${pay}`}>{pay === 'part' ? 'Part paid' : pay === 'paid' ? 'Paid' : 'Unpaid'}</span>}
        {newest ? (
          <span className={`dir-contract-pill ${newest.status}`}>{newest.status}</span>
        ) : person.status === 'Contracted' ? (
          <span className="dir-contract-pill none">No contract</span>
        ) : null}
      </div>
    </div>
  );
}
