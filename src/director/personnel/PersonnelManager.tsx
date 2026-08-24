import './personnel.css';
import { useState, useEffect, useMemo } from 'react';
import { UserPlus, Users, Star, FileText } from 'lucide-react';
import { deleteField } from 'firebase/firestore';
import { useEnsembles } from '../hooks/useEnsembles';
import { usePersonnel } from '../hooks/usePersonnel';
import { usePersonnelContacts } from '../hooks/usePersonnelContacts';
import { useContracts } from '../hooks/useContracts';
import { useContractTemplates } from '../hooks/useContractTemplates';
import { recordActivity } from '../hooks/useActivityLog';
import { EnsembleFilter } from '../components/EnsembleFilter';
import { scoreOrderRank, lastName } from '../scoreOrder';
import { PersonnelForm } from './PersonnelForm';
import { PersonnelDetail } from './PersonnelDetail';
import { ContractSheet } from './ContractSheet';
import { ContractForm, type ContractDraftData } from './ContractForm';
import { ContractTemplatesView } from './ContractTemplatesView';
import type { Personnel, Contract } from '../types';

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

const STATUS_ROW_LABEL: Record<Personnel['status'], string | null> = {
  Contracted: null, // the default — unlabeled, like Active students
  SubList: 'Sub list',
  Inactive: 'Archived',
};

export default function PersonnelManager() {
  const { ensembles } = useEnsembles();
  const { personnel, loading, addPersonnel, updatePersonnel, deletePersonnel, archivePersonnel, restorePersonnel } = usePersonnel();
  const { contacts, savePersonnelContact } = usePersonnelContacts();
  const {
    contracts, addContract, updateContract,
    signContract, countersignContract, voidContract, setContractNotes, deleteContract,
  } = useContracts();
  const { templates, addTemplate, updateTemplate, deleteTemplate } = useContractTemplates();

  useEffect(() => { recordActivity('personnel.view'); }, []);

  const [viewing, setViewing] = useState<Personnel | null>(null);
  const [editing, setEditing] = useState<Personnel | null | 'new'>(null);
  // Contract surfaces (build-plan step 4). The open sheet tracks an ID and
  // derives the live doc, so a sign or countersign refreshes it in place.
  const [openContractId, setOpenContractId] = useState<string | null>(null);
  const [contractEdit, setContractEdit] = useState<{ person: Personnel; contract: Contract | null } | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const openContract = openContractId != null
    ? contracts.find(c => c.id === openContractId) ?? null
    : null;
  const [search, setSearch] = useState('');
  const [filterEnsembleId, setFilterEnsembleId] = useState('');
  // Saved views, the RosterView pattern: '' = working roster (Contracted +
  // Sub list), 'subs' = sub list only, 'missing' = contact or W-9 paperwork
  // to chase, 'archived' = Inactive.
  const [view, setView] = useState<'' | 'subs' | 'missing' | 'archived'>('');

  const contractsByPerson = useMemo(() => {
    const m: Record<string, Contract[]> = {};
    for (const c of contracts) (m[c.personnelId] ??= []).push(c);
    return m;
  }, [contracts]);

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
        <button className="dir-tool-btn" onClick={() => setTemplatesOpen(true)}>
          <FileText size={15} /> Contract templates
        </button>
      </div>

      {ensembles.length > 0 && personnel.length > 0 && (
        <EnsembleFilter ensembles={ensembles} value={filterEnsembleId} onChange={setFilterEnsembleId} />
      )}
      {personnel.length > 0 && (
        <div className="dir-tabs">
          <button className={`dir-tab dir-tab-view ${view === 'subs' ? 'active' : ''}`} onClick={() => setView(v => v === 'subs' ? '' : 'subs')}>
            Sub list
          </button>
          <button className={`dir-tab dir-tab-view ${view === 'missing' ? 'active' : ''}`} onClick={() => setView(v => v === 'missing' ? '' : 'missing')}>
            Missing paperwork
          </button>
          <button className={`dir-tab dir-tab-view ${view === 'archived' ? 'active' : ''}`} onClick={() => setView(v => v === 'archived' ? '' : 'archived')}>
            Archived
          </button>
        </div>
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

      <button className="dir-fab" onClick={() => setEditing('new')} aria-label="Add person">
        <UserPlus size={22} />
      </button>

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
                    emergencyPhone: '', unionLocal: '', w9Status: 'not-requested',
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

function PersonnelRow({ person, contracts, onOpen }: { person: Personnel; contracts: Contract[]; onOpen: () => void }) {
  // The row's pill mirrors the person's paperwork state: the newest
  // non-void contract's status, Void if that's all there is, or a nudge
  // that a contracted member has no contract at all.
  const live = contracts.filter(c => c.status !== 'Void');
  const newest = [...(live.length ? live : contracts)].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
  const statusLabel = STATUS_ROW_LABEL[person.status];
  return (
    <div className="dir-roster-card" onClick={onOpen}>
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
      {newest ? (
        <span className={`dir-contract-pill ${newest.status}`}>{newest.status}</span>
      ) : person.status === 'Contracted' ? (
        <span className="dir-contract-pill none">No contract</span>
      ) : null}
    </div>
  );
}
