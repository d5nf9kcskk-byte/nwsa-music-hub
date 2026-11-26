import './personnel.css';
import { useState, useEffect, useMemo, useRef } from 'react';
import { UserPlus, Users, FileText, ClipboardList, Upload, Download, Check, DollarSign, AtSign } from 'lucide-react';
import { deleteField } from 'firebase/firestore';
import { useEnsembles } from '../hooks/useEnsembles';
import { useEvents } from '../hooks/useEvents';
import { useRepertoire } from '../hooks/useRepertoire';
import { usePersonnel } from '../hooks/usePersonnel';
import { usePersonnelContacts } from '../hooks/usePersonnelContacts';
import { useContracts } from '../hooks/useContracts';
import { useContractTemplates } from '../hooks/useContractTemplates';
import { usePayments } from '../hooks/usePayments';
import { useMemberEntries } from '../hooks/useMemberEntries';
import { useConcertPersonnel } from '../hooks/useConcertPersonnel';
import { recordActivity } from '../hooks/useActivityLog';
import { formatDate, todayStr } from '../utils';
import { displayName } from '../../shared/personName';
import { PersonnelForm } from './PersonnelForm';
import { PlayerCard } from './PlayerCard';
import { ContractSheet } from './ContractSheet';
import { ContractForm, type ContractDraftData } from './ContractForm';
import { ContractTemplatesView } from './ContractTemplatesView';
import { ServiceAttendanceSheet } from './ServiceAttendanceSheet';
import { PersonnelImport } from './PersonnelImport';
import { PersonnelEmailBar } from './PersonnelEmailBar';
import { PersonnelReports } from './PersonnelReports';
import { contractTotalCents, paidCents, formatCents, parseCentsInput } from './contractMoney';
import { calledIds } from './personnelOrder';
import { refusedCell, toLastFirst } from './importPlan';
import { useFixtureWrites } from './fixtureWrites';
import { sectionCards, fillLabel, isOpen, nextSeat, contractFor, usualFeeCents, usableEmail, partsFor, type SectionCard } from './concertRoster';
import type { CalendarEvent, Contract, Payment, Personnel, PersonnelContact, SheetLink as SheetLinkDoc } from '../types';

/**
 * The paid roster (#personnel), as an app (#aiso-personnel,
 * docs/aiso-personnel-screen.md). It opens on the next concert, laid out the
 * way the personnel manager's sheet is: one card per section, in the sheet's
 * order, with "seated/needed". Tap a name for the player's card; every field
 * there saves itself. "+ Add player" adds in place and stays open for the
 * next one. The picker's "Whole roster" is everyone, concert or not.
 *
 * Who is on a concert is the contracts that call them (`calledIds`, the
 * service roll's answer). What a contract cannot hold, the chairs each
 * section needs and who said yes, is the concert's `concertPersonnel` doc.
 * A parallel screen to the student roster on purpose, never a flag on it.
 */

type Filter = 'all' | 'unpaid' | 'noemail' | 'unconf' | 'open' | 'subs' | 'archived';
const CONCERT_FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Everyone' }, { id: 'unpaid', label: 'Unpaid' }, { id: 'noemail', label: 'No usable email' },
  { id: 'unconf', label: 'Not confirmed' }, { id: 'open', label: 'Open chairs' },
];
const ROSTER_FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Everyone' }, { id: 'noemail', label: 'No usable email' }, { id: 'subs', label: 'Sub list' }, { id: 'archived', label: 'Archived' },
];
const ROSTER = 'roster';

/** A Firestore patch: a field set to undefined is DELETED, not skipped
 *  (ignoreUndefinedProperties would drop it and the old value would stay). */
function withDeletes<T extends object>(patch: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) out[k] = v === undefined ? deleteField() : v;
  return out as T;
}

const nameKey = (n: string) => toLastFirst(n).toLowerCase();

export default function PersonnelManager({ initialPersonId, initialEventId }: {
  /** Open this person's card on arrival — a name picked in the staff search. */
  initialPersonId?: string;
  /** Open the roll on this service on arrival — "Attendance" on a Today card. */
  initialEventId?: string;
}) {
  const { ensembles } = useEnsembles();
  const { events } = useEvents();
  const { pieces } = useRepertoire();
  const live = { ...usePersonnel(), ...usePersonnelContacts(), ...useContracts(), ...usePayments() };
  const { loading, deletePersonnel, signContract, countersignContract, setContractNotes } = live;
  const {
    personnel, addPersonnel, updatePersonnel, contacts, savePersonnelContact,
    contracts, addContract, updateContract, voidContract, deleteContract,
    payments, addPayment, deletePayment,
  } = useFixtureWrites(live);
  const { templates, addTemplate, updateTemplate, deleteTemplate } = useContractTemplates();
  const { members, invite, remove: removeSignIn } = useMemberEntries();
  const { concertDocs, sheetLinks, saveSections, setSaidYes, linkSheet } = useConcertPersonnel();

  useEffect(() => { recordActivity('personnel.view'); }, []);

  // ── Which concert ──
  const concerts = useMemo(() => events
    .filter(e => e.type === 'Concert' && e.status !== 'Cancelled')
    .sort((a, b) => a.date.localeCompare(b.date)), [events]);
  const defaultConcertId = (concerts.find(c => c.date >= todayStr()) ?? concerts[concerts.length - 1])?.id ?? ROSTER;
  const [picked, setPicked] = useState<string | null>(null);
  const concertId = picked ?? defaultConcertId;
  const concert: CalendarEvent | null = concerts.find(c => c.id === concertId) ?? null;
  const cdoc = concert ? concertDocs.find(d => d.id === concert.id) : undefined;
  const saidYes = useMemo(() => new Set(cdoc?.saidYes ?? []), [cdoc]);

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [consumedPersonId, setConsumedPersonId] = useState<string | null>(null);
  if (initialPersonId && consumedPersonId !== initialPersonId && personnel.length > 0) {
    setConsumedPersonId(initialPersonId);
    if (personnel.some(p => p.id === initialPersonId)) setOpenId(initialPersonId);
  }
  const [editing, setEditing] = useState<Personnel | null | 'new'>(null);
  const [openContractId, setOpenContractId] = useState<string | null>(null);
  const [contractEdit, setContractEdit] = useState<{ person: Personnel; contract: Contract | null } | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(Boolean(initialEventId));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const openContract = openContractId != null ? contracts.find(c => c.id === openContractId) ?? null : null;

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

  // ── Who is on the screen ──
  const called = useMemo(() => (concert ? calledIds(contracts, concert) : null), [concert, contracts]);
  const concertContract = (pid: string) => (concert ? contractFor(contractsByPerson[pid] ?? [], concert, pid) : undefined);
  /** What this concert still owes them: null with no contract, or no known total. */
  const owed = (pid: string): number | null => {
    const c = concertContract(pid);
    const total = c ? contractTotalCents(c) : null;
    return c && total != null ? Math.max(0, total - paidCents(paymentsByContract[c.id] ?? [])) : null;
  };
  const unpaid = (pid: string) => Boolean(concertContract(pid)) && owed(pid) !== 0;
  const pool = personnel.filter(p => called ? called.has(p.id) : filter === 'archived' ? p.status === 'Inactive' : p.status !== 'Inactive');
  const rosterSections = personnel.filter(p => p.status !== 'Inactive').map(p => p.section ?? '');
  const cards = sectionCards(pool, concert ? cdoc?.sections : undefined, concert ? rosterSections : []);
  const sectionNames = cards.map(c => c.name).filter(Boolean);

  const q = search.trim().toLowerCase();
  const rowShown = (p: Personnel) => {
    if (q && !`${p.name} ${displayName(p.name)} ${p.preferredName ?? ''}`.toLowerCase().includes(q)) return false;
    if (filter === 'unpaid') return unpaid(p.id);
    if (filter === 'noemail') return !usableEmail(contacts[p.id]?.email);
    if (filter === 'unconf') return !saidYes.has(p.id);
    if (filter === 'subs') return p.status === 'SubList';
    return true;
  };
  const count = (f: Filter) => {
    if (f === 'open') return cards.filter(isOpen).length;
    if (f === 'all') return undefined;
    if (f === 'archived') return personnel.filter(p => p.status === 'Inactive').length;
    // Counts ignore the search box and the active filter.
    return pool.filter(p =>
      f === 'unpaid' ? unpaid(p.id) : f === 'noemail' ? !usableEmail(contacts[p.id]?.email)
        : f === 'unconf' ? !saidYes.has(p.id) : f === 'subs' ? p.status === 'SubList' : false).length;
  };
  const filters = concert ? CONCERT_FILTERS : ROSTER_FILTERS;
  const shownCards = cards
    .filter(c => filter !== 'open' || isOpen(c))
    .map(c => ({ card: c, rows: c.people.filter(rowShown) }))
    .filter(({ card, rows }) => rows.length || (!q && (filter === 'all' || filter === 'open') && card.name !== ''));

  // ── Writes ──
  function concertContractData(person: Pick<Personnel, 'name' | 'section' | 'seat'>, personnelId: string, cents: number) {
    return {
      personnelId, personnelName: person.name, category: 'chair' as const, position: 'Section',
      ...(person.section ? { section: person.section } : {}), ...(person.seat != null ? { seat: person.seat } : {}),
      ensembleIds: concert!.ensembleIds, eventIds: [concert!.id], startDate: concert!.date, endDate: concert!.date,
      baseRateCents: cents, baseRateBasis: 'flat' as const, status: 'Draft' as const,
    };
  }

  /** Add-in-place. A name already on the roster exactly once is that person. */
  async function addPlayer(card: SectionCard, rawName: string, email: string, cents: number | null): Promise<string> {
    const name = toLastFirst(rawName);
    const seat = nextSeat(card.people);
    const same = personnel.filter(p => nameKey(p.name) === nameKey(name));
    let id = same.length === 1 ? same[0].id : undefined;
    if (id && called?.has(id)) return `${displayName(name)} is already on this concert.`;
    if (id) {
      const p = same[0];
      await updatePersonnel(id, withDeletes({ section: card.name, seat, ...(p.status === 'Inactive' ? { status: 'SubList' as const } : {}) }));
      if (email && !contacts[id]?.email) await savePersonnelContact(id, { email });
    } else {
      id = await addPersonnel({ name, status: 'Contracted', section: card.name, ...(seat != null ? { seat } : {}), ensembleIds: concert?.ensembleIds ?? [] });
      if (!id) return 'Not saved. Check the connection and try again.';
      if (email) await savePersonnelContact(id, { email });
    }
    if (concert && cents != null) await addContract(concertContractData({ name, section: card.name, seat }, id, cents));
    return same.length === 1 ? `${displayName(name)} was on the roster, and is now in ${card.name}.` : '';
  }

  async function saveNeeded(card: SectionCard, needed: number | undefined) {
    if (!concert) return;
    await saveSections(concert.id, cards.filter(c => c.name).map(c => ({ name: c.name, needed: c.name === card.name ? needed : c.needed })));
  }

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

  // ── Numbers at the top ──
  const tiles = concert ? {
    seated: pool.length,
    yes: pool.filter(p => saidYes.has(p.id)).length,
    toPay: pool.reduce((n, p) => n + (owed(p.id) ?? 0), 0),
    invitable: pool.filter(p => usableEmail(contacts[p.id]?.email)).length,
  } : null;
  const usualFee = useMemo(() => usualFeeCents(contracts.filter(c => c.status !== 'Void' && concert && c.eventIds?.includes(concert.id))), [contracts, concert]);

  const open = openId ? personnel.find(p => p.id === openId) ?? null : null;
  const openCC = open ? concertContract(open.id) : undefined;
  const selectedDrafts = [...selected].map(id => [...(contractsByPerson[id] ?? [])].filter(c => c.status !== 'Void').sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0]).filter((c): c is Contract => c?.status === 'Draft');
  const invitedEmails = new Set(members.map(m => m.email));
  const toInvite = personnel.filter(p => {
    const email = (contacts[p.id]?.email ?? '').trim().toLowerCase();
    return selected.has(p.id) && usableEmail(email) && !invitedEmails.has(email);
  });
  const isEmpty = !loading && personnel.length === 0;

  return (
    <div className="pm">
      <div className="pm-top">
        <label className="pm-concert">
          <span className="pc-field-label">Concert</span>
          <select className="dir-select" value={concertId} onChange={e => { setPicked(e.target.value); setFilter('all'); }}>
            {concerts.map(c => (
              <option key={c.id} value={c.id}>{c.title || 'Concert'} · {formatDate(c.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</option>
            ))}
            <option value={ROSTER}>Whole roster (every player, any concert)</option>
          </select>
        </label>
        <div className="pm-tools">
          <button className="dir-tool-btn" onClick={() => setAttendanceOpen(true)}><ClipboardList size={15} /> Attendance</button>
          {personnel.length > 0 && <button className="dir-tool-btn" onClick={() => setReportsOpen(true)}><Download size={15} /> Reports</button>}
          <button className="dir-tool-btn" onClick={() => setImportOpen(true)}><Upload size={15} /> Import</button>
          <button className="dir-tool-btn" onClick={() => setTemplatesOpen(true)}><FileText size={15} /> Contract templates</button>
        </div>
      </div>

      {tiles && (
        <div className="pm-tiles">
          <div className="pm-tile"><b>{tiles.seated}</b><span>on this concert</span></div>
          <div className="pm-tile"><b>{tiles.yes}/{tiles.seated}</b><span>said yes</span></div>
          <div className="pm-tile"><b>{formatCents(tiles.toPay).replace(/\.00$/, '')}</b><span>still to pay</span></div>
          <div className="pm-tile"><b>{tiles.invitable}/{tiles.seated}</b><span>can be invited to sign in</span></div>
        </div>
      )}

      {concert && (
        <SheetLink
          key={concert.id}
          link={sheetLinks.find(l => l.id === `concertRoster__${concert.id}`)}
          onLink={tab => linkSheet(concert.id, tab)}
        />
      )}

      {personnel.length > 0 && (
        <div className="pm-filterbar">
          <input className="dir-input pm-search" placeholder="Search players…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search players" />
          <div className="pm-filters" role="group" aria-label="Show">
            {filters.map(f => {
              const n = count(f.id);
              return (
                <button key={f.id} className={`pm-chip ${filter === f.id ? 'active' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label}{n != null ? ` · ${n}` : ''}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {shownCards.length > 0 && (
        <div className="pm-grid">
          {shownCards.map(({ card, rows }) => (
            <SectionCardView
              key={card.name || '(none)'} card={card} rows={rows} concert={concert}
              saidYes={saidYes} contacts={contacts} owed={owed} selected={selected} openId={openId}
              usualFeeCents={usualFee}
              onOpen={setOpenId}
              onToggle={id => setSelected(s => { const n = new Set(s); if (!n.delete(id)) n.add(id); return n; })}
              onNeeded={n => saveNeeded(card, n)}
              onAdd={(name, email, cents) => addPlayer(card, name, email, cents)}
            />
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="dir-empty">
          <Users size={40} />
          <h3>No players yet</h3>
          <p>Use “+ Add player” under a section, Import a spreadsheet, or tap + for a conductor or staff member.</p>
        </div>
      )}
      {!isEmpty && personnel.length > 0 && shownCards.length === 0 && (
        <div className="dir-empty">
          <Users size={40} />
          <h3>Nothing to show</h3>
          <p>{q ? `No one matches “${search}”.` : filter === 'open' ? 'Every section with a chair count is full.' : 'Nobody in this view.'}</p>
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
        <button className="dir-fab" onClick={() => setEditing('new')} aria-label="Add a conductor, staff member or player with full details">
          <UserPlus size={22} />
        </button>
      )}

      {open && (
        <PlayerCard
          key={open.id}
          person={open}
          contact={contacts[open.id] ?? null}
          member={members.find(m => m.personnelId === open.id)}
          concert={concert}
          contract={openCC}
          contracts={contractsByPerson[open.id] ?? []}
          payments={payments.filter(p => p.personnelId === open.id)}
          saidYes={saidYes.has(open.id)}
          sections={sectionNames}
          parts={concert ? partsFor(pieces, concert, open) : []}
          usualFeeCents={usualFee}
          onPerson={patch => void updatePersonnel(open.id, withDeletes(patch))}
          onSection={section => {
            const others = personnel.filter(p => p.id !== open.id && p.section === section && (!called || called.has(p.id)));
            void updatePersonnel(open.id, withDeletes({ section, seat: nextSeat(others) }));
          }}
          onContact={patch => void savePersonnelContact(open.id, patch as Omit<PersonnelContact, 'id'>)}
          onSaidYes={yes => { if (concert) void setSaidYes(concert.id, open.id, yes); }}
          onFee={cents => { if (openCC) void updateContract(openCC.id, { baseRateCents: cents }); }}
          onAddToConcert={cents => { if (concert) void addContract(concertContractData(open, open.id, cents)); }}
          onTakeOff={() => {
            if (!concert || !openCC) return;
            void (openCC.status === 'Draft' ? deleteContract(openCC.id) : voidContract(openCC.id));
            void setSaidYes(concert.id, open.id, false);
          }}
          onMarkPaid={() => {
            if (!openCC) return;
            const total = contractTotalCents(openCC);
            const left = total == null ? 0 : total - paidCents(paymentsByContract[openCC.id] ?? []);
            if (left > 0) void addPayment({ contractId: openCC.id, personnelId: open.id, amountCents: left, paidOn: todayStr(), method: contacts[open.id]?.payMethod || 'check' });
          }}
          onDeletePayment={id => void deletePayment(id)}
          onOpenContract={c => setOpenContractId(c.id)}
          onNewContract={() => setContractEdit({ person: open, contract: null })}
          onMoreDetails={() => setEditing(open)}
          onInvite={() => invite(open.id, open.preferredName || open.name, contacts[open.id]?.email ?? '')}
          onRemoveSignIn={async () => { const m = members.find(x => x.personnelId === open.id); return m ? removeSignIn(m.email) : 'They have no sign-in to remove.'; }}
          onClose={() => setOpenId(null)}
        />
      )}

      {/* Contract sheet — stacks over the player card; closing returns there. */}
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

      {attendanceOpen && (
        <ServiceAttendanceSheet personnel={personnel} contracts={contracts} ensembles={ensembles} initialEventId={initialEventId} onClose={() => setAttendanceOpen(false)} />
      )}
      {reportsOpen && (
        <PersonnelReports
          people={personnel.filter(p => p.status !== 'Inactive')}
          contacts={contacts} contracts={contracts} payments={payments}
          onClose={() => setReportsOpen(false)}
        />
      )}
      {importOpen && (
        <PersonnelImport ensembles={ensembles} existingNames={personnel.map(p => p.name)} onClose={() => setImportOpen(false)} />
      )}
      {templatesOpen && (
        <ContractTemplatesView templates={templates} onAdd={addTemplate} onUpdate={updateTemplate} onDelete={deleteTemplate} onClose={() => setTemplatesOpen(false)} />
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
              if (data.seat == null && editing.seat != null) (patch as Record<string, unknown>).seat = deleteField();
              await updatePersonnel(editing.id, patch);
              await savePersonnelContact(editing.id, contact);
            }
          }}
          onDelete={
            // Archive-over-delete once contracts point at someone: the delete
            // option simply doesn't exist then.
            editing !== 'new' && (contractsByPerson[editing.id] ?? []).length === 0
              ? async () => {
                  // Blank the private contact doc first — the roster delete
                  // must not leave an orphaned doc of payroll-adjacent PII.
                  await savePersonnelContact(editing.id, {
                    email: '', phone: '', address: '', emergencyName: '',
                    emergencyPhone: '', unionLocal: '', payMethod: '', payHandle: '', w9Status: 'not-requested',
                  });
                  await deletePersonnel(editing.id);
                  setOpenId(null);
                }
              : undefined
          }
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function SectionCardView({ card, rows, concert, saidYes, contacts, owed, selected, openId, usualFeeCents, onOpen, onToggle, onNeeded, onAdd }: {
  card: SectionCard; rows: Personnel[]; concert: CalendarEvent | null; saidYes: Set<string>;
  contacts: Record<string, PersonnelContact>; owed: (id: string) => number | null; selected: Set<string>; openId: string | null;
  usualFeeCents?: number;
  onOpen: (id: string) => void; onToggle: (id: string) => void;
  onNeeded: (n: number | undefined) => Promise<void>;
  onAdd: (name: string, email: string, cents: number | null) => Promise<string>;
}) {
  const [adding, setAdding] = useState(false);
  const [editNeeded, setEditNeeded] = useState(false);
  const seated = card.people.length;
  const full = card.needed != null && seated >= card.needed;
  const pct = card.needed ? Math.min(100, (seated / card.needed) * 100) : 100;
  return (
    <article className="pm-sec">
      <header className="pm-sec-head">
        <h3>{card.name || 'Podium, staff & unsectioned'}</h3>
        {card.name && (concert && editNeeded ? (
          <input
            className="dir-input pm-needed" type="number" min={0} autoFocus aria-label={`Chairs needed in ${card.name}`}
            defaultValue={card.needed ?? ''}
            onBlur={e => { const v = e.target.value.trim(); setEditNeeded(false); const n = v === '' ? undefined : Number(v); if (n !== card.needed && (n == null || (Number.isInteger(n) && n >= 0))) void onNeeded(n); }}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.stopPropagation(); setEditNeeded(false); } }}
          />
        ) : concert ? (
          <button className={`pm-fill ${card.needed == null ? '' : full ? 'full' : 'short'}`} onClick={() => setEditNeeded(true)} aria-label={`${card.name}: ${fillLabel(card)}. Set the chairs needed.`}>
            {fillLabel(card)}
          </button>
        ) : <span className="pm-fill">{seated}</span>)}
      </header>
      {concert && card.name && <div className="pm-meter" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>}
      <ol className="pm-rows">
        {rows.map(p => {
          const email = contacts[p.id]?.email;
          return (
            <li key={p.id} className={`pm-row ${openId === p.id ? 'sel' : ''}`}>
              <input type="checkbox" className="pers-tick" checked={selected.has(p.id)} aria-label={`Select ${p.name}`} onChange={() => onToggle(p.id)} />
              <button className="pm-row-btn" onClick={() => onOpen(p.id)}>
                <span className="pm-seat">{p.seat ?? '–'}</span>
                <span className="pm-name">{displayName(p.name)}{p.status === 'SubList' ? <small> · sub</small> : null}</span>
                <span className="pm-tags">
                  {concert && saidYes.has(p.id) && <span className="pm-tag ok" title="Said yes"><Check size={12} aria-label="Said yes" /></span>}
                  {concert && owed(p.id) === 0 && <span className="pm-tag paid" title="Paid"><DollarSign size={12} aria-label="Paid" /></span>}
                  {!usableEmail(email) && <span className="pm-tag warn" title="No usable email"><AtSign size={12} aria-label="No usable email" /></span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {card.name && (adding
        ? <AddRow concert={concert} section={card.name} usualFeeCents={usualFeeCents} onAdd={onAdd} onDone={() => setAdding(false)} />
        : <button className="pm-add" onClick={() => setAdding(true)}>+ Add player</button>)}
    </article>
  );
}

/** Name, Tab, Email, Tab, Fee, Enter. Saves and stays open for the next one. */
function AddRow({ concert, section, usualFeeCents, onAdd, onDone }: {
  concert: CalendarEvent | null; section: string; usualFeeCents?: number;
  onAdd: (name: string, email: string, cents: number | null) => Promise<string>; onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [fee, setFee] = useState(usualFeeCents != null ? (usualFeeCents / 100).toFixed(2) : '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  async function submit() {
    const n = name.trim(), e = email.trim();
    if (!n) { onDone(); return; }
    if ([n, e, fee].some(refusedCell)) { setNote('That looks like a Social Security or employer id number. The Hub never stores those.'); return; }
    const cents = concert ? parseCentsInput(fee) : null;
    if (concert && (cents == null || cents < 0)) { setNote('Type the fee as a dollar amount, like 250.'); return; }
    setBusy(true);
    const said = await onAdd(n, e, cents);
    setBusy(false);
    setNote(said || `Added ${n} to ${section}.`);
    setName(''); setEmail('');
    nameRef.current?.focus();
  }
  return (
    <form className="pm-addrow" onSubmit={ev => { ev.preventDefault(); void submit(); }}
      onKeyDown={ev => { if (ev.key === 'Escape') { ev.stopPropagation(); onDone(); } }}>
      <input ref={nameRef} className="dir-input" placeholder="Name" aria-label={`New player's name in ${section}`} value={name} autoFocus onChange={e => setName(e.target.value)} />
      <input className="dir-input" type="email" placeholder="Email" aria-label="Email" value={email} onChange={e => setEmail(e.target.value)} />
      {concert && <input className="dir-input pm-addfee" inputMode="decimal" placeholder="Fee" aria-label="Fee" value={fee} onChange={e => setFee(e.target.value)} />}
      <button className="dir-btn dir-btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
      {note && <p className="pc-note pm-addnote" role="status">{note} Enter adds the next one; Escape closes.</p>}
    </form>
  );
}

/** "Link the personnel sheet": paste the address of the TAB (open it first,
 *  so the address ends in #gid=…). The tab is registered by that gid, never
 *  its name, so renaming it later is harmless. The Hub and the tab then keep
 *  each other up to date (functions/src/sheetPush.ts). The sheet must be
 *  shared, as an Editor, with the Hub's service account, and carry the
 *  workbook script (docs/aiso-sheet-sync.gs) for its edits to reach the Hub. */
function SheetLink({ link, onLink }: {
  link?: SheetLinkDoc;
  onLink: (tab: { spreadsheetId: string; sheetId: number } | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const spreadsheetId = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,100})/.exec(url)?.[1] ?? '';
  // The tab on screen is the one after '#'; '?gid=' can still name the tab the sheet opened on.
  const gid = (/#(?:.*&)?gid=(\d+)/.exec(url) ?? /[?&]gid=(\d+)/.exec(url))?.[1];
  const status = link?.sync;
  const when = status ? new Date(status.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  if (link && !open) return (
    <div className="pm-sheet">
      <span><b>Linked to a Google Sheet</b>{status?.tab ? ` (tab “${status.tab}”)` : ''}. {status ? <span className={status.ok ? '' : 'pm-sheet-bad'}>{when}: {status.note}</span> : 'Waiting for the first sync.'}</span>
      <button className="dir-tool-btn" onClick={() => setOpen(true)}>Change tab</button>
      <button className="dir-tool-btn" onClick={() => { void onLink(null); }}>Unlink</button>
    </div>
  );
  if (!open) return <div className="pm-sheet"><button className="dir-tool-btn" onClick={() => setOpen(true)}>Link the personnel sheet</button></div>;
  return (
    <form className="pm-sheet pm-sheet-form" onSubmit={e => { e.preventDefault(); if (spreadsheetId && gid) { void onLink({ spreadsheetId, sheetId: Number(gid) }); setOpen(false); setUrl(''); } }}>
      <input className="dir-input" placeholder="Paste the tab's address" aria-label="The tab's address" value={url} onChange={e => setUrl(e.target.value)} autoFocus />
      <button className="dir-btn dir-btn-primary" disabled={!spreadsheetId || !gid}>Link</button>
      <button type="button" className="dir-tool-btn" onClick={() => setOpen(false)}>Cancel</button>
      <p className="pc-note">
        Open the tab in Google Sheets and copy the address bar: it ends in “#gid=” and a number, which is how the Hub knows the tab even if it is renamed. Share the sheet (Editor) with the Hub's service account first. For edits made in the sheet to reach the Hub, the workbook also needs the AISO Hub script (Extensions, Apps Script; then AISO Hub, Connect).
        {url && !spreadsheetId ? ' That does not look like a Google Sheets address.' : url && !gid ? ' That address does not say which tab: open the tab, then copy the address again.' : ''}
      </p>
    </form>
  );
}
