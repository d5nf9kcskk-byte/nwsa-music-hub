import { useState, type ReactNode } from 'react';
import { ClipboardSignature, KeyRound, Mail, Pencil } from 'lucide-react';
import type { MemberEntry } from '../hooks/useMemberEntries';
import type { CalendarEvent, Contract, Payment, Personnel, PersonnelContact, PayMethod } from '../types';
import { PAY_METHODS, PAY_METHOD_LABEL } from '../types';
import { formatDate } from '../utils';
import { displayName } from '../../shared/personName';
import { useModalA11y } from '../../shared/useModalA11y';
import { backdropClose } from '../../shared/backdropClose';
import { formatCents, basisSuffix, contractTotalCents, paidCents, parseCentsInput } from './contractMoney';
import { refusedCell } from './importPlan';
import { usableEmail } from './concertRoster';

/**
 * One player's card (#aiso-personnel, docs/aiso-personnel-screen.md): slides
 * in over the section cards. Every field saves itself on Enter or when focus
 * leaves it; Escape puts the old value back. Writes go through the
 * manager's hooks, so the rules judge each one exactly as before.
 */

type Tab = 'info' | 'pay' | 'parts' | 'history';

const TAX_ID = 'That looks like a Social Security or employer id number. The Hub never stores those.';
const noTaxId = (v: string) => (refusedCell(v) ? TAX_ID : null);
/** 8 to 17 bare digits that are not a phone number: a bank account's shape. */
const looksLikeAccount = (v: string) => { const d = v.replace(/[\s-]/g, ''); return /^\d{8,17}$/.test(d) && !/^1?\d{10}$/.test(d); };

/** A field that saves itself. `onSave` gets the trimmed text; a `check` that
 *  answers a sentence refuses the value and says why. */
function AutoField({ label, value, onSave, type = 'text', check = noTaxId, className, hint }: {
  label: string; value: string; onSave: (v: string) => void; type?: string;
  check?: (v: string) => string | null; className?: string; hint?: ReactNode;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [err, setErr] = useState('');
  function commit() {
    if (draft == null) return;
    const v = draft.trim();
    setDraft(null);
    if (v === value) return;
    const why = check(v);
    setErr(why ?? '');
    if (!why) onSave(v);
  }
  return (
    <label className={`pc-field ${className ?? ''}`}>
      <span className="pc-field-label">{label}</span>
      <input
        className="dir-input" type={type} value={draft ?? value} aria-label={label}
        onChange={e => { setDraft(e.target.value); setErr(''); }}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape' && draft != null) { e.stopPropagation(); setDraft(null); setErr(''); }
        }}
      />
      {err ? <span className="pc-field-err" role="alert">{err}</span> : hint}
    </label>
  );
}

export interface PlayerCardProps {
  person: Personnel;
  contact: PersonnelContact | null;
  member?: MemberEntry;
  /** null on the whole-roster view. */
  concert: CalendarEvent | null;
  /** This concert's contract, if they are on it. */
  contract?: Contract;
  /** Every contract of theirs, any concert or season. */
  contracts: Contract[];
  payments: Payment[];
  saidYes: boolean;
  sections: string[];
  parts: { piece: string; label: string }[];
  usualFeeCents?: number;
  onPerson: (patch: Partial<Personnel>) => void;
  /** A new section: the manager also moves them to its next free chair. */
  onSection: (section: string) => void;
  onContact: (patch: Partial<PersonnelContact>) => void;
  onSaidYes: (yes: boolean) => void;
  onFee: (cents: number) => void;
  onAddToConcert: (cents: number) => void;
  onTakeOff: () => void;
  onMarkPaid: () => void;
  onDeletePayment: (id: string) => void;
  onOpenContract: (c: Contract) => void;
  onNewContract: () => void;
  onMoreDetails: () => void;
  onInvite: () => Promise<string>;
  onRemoveSignIn: () => Promise<string>;
  onClose: () => void;
}

const dateOf = (ms: number) => formatDate(new Date(ms).toISOString().slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' });

export function PlayerCard(props: PlayerCardProps) {
  const { person, contact, concert, contract, saidYes, onClose } = props;
  const [tab, setTab] = useState<Tab>('info');
  const panelRef = useModalA11y<HTMLDivElement>(onClose, true);
  const email = contact?.email ?? '';
  const total = contract ? contractTotalCents(contract) : null;
  const paid = contract ? paidCents(props.payments.filter(p => p.contractId === contract.id)) : 0;
  const initials = displayName(person.name).split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const sectionOptions = [...new Set([...props.sections, person.section ?? ''].filter(Boolean))];

  return (
    <div className="dir-drawer-overlay" {...backdropClose(onClose)}>
      <div className="dir-drawer pc-drawer" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={person.name}>
        <div className="dir-drawer-handle" />
        <div className="pc-head">
          <div className="pc-avatar" aria-hidden="true">{initials}</div>
          <div className="pc-who">
            <AutoField label="Name" className="pc-name" value={person.name}
              check={v => (!v ? 'A player needs a name.' : noTaxId(v))}
              onSave={v => props.onPerson({ name: v })} />
            <div className="pc-where">
              <label className="pc-field">
                <span className="pc-field-label">Section</span>
                <select className="dir-select" value={person.section ?? ''} onChange={e => props.onSection(e.target.value)}>
                  {!person.section && <option value="">No section</option>}
                  {sectionOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <AutoField label="Seat" type="number" className="pc-seat" value={person.seat != null ? String(person.seat) : ''}
                check={v => (v && !/^\d+$/.test(v) ? 'A seat is a whole number.' : null)}
                onSave={v => props.onPerson({ seat: v ? Number(v) : undefined })} />
            </div>
          </div>
          <button className="dir-drawer-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="pc-pills">
          {concert && <span className={`pc-pill ${saidYes ? 'ok' : ''}`}>{saidYes ? 'Said yes' : 'Not confirmed'}</span>}
          {contract && total != null && <span className={`pc-pill ${paid >= total && total > 0 ? 'ok' : ''}`}>{paid >= total && total > 0 ? 'Paid' : paid > 0 ? 'Part paid' : 'Unpaid'}</span>}
          <span className={`pc-pill ${usableEmail(email) ? '' : 'warn'}`}>{usableEmail(email) ? 'Can be invited' : 'No usable email'}</span>
          {person.status !== 'Contracted' && <span className="pc-pill">{person.status === 'SubList' ? 'Sub list' : 'Archived'}</span>}
        </div>

        <div className="dir-tabs pc-tabs" role="tablist">
          {([['info', 'Info'], ['pay', 'Pay'], ['parts', 'Parts'], ['history', 'History']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`dir-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
              {l}{k === 'pay' && <small className="pc-staff"> staff</small>}
            </button>
          ))}
        </div>

        <div className="dir-drawer-body pc-body">
          {tab === 'info' && <InfoTab {...props} email={email} />}
          {tab === 'pay' && <PayTab {...props} total={total} paid={paid} />}
          {tab === 'parts' && (
            !concert ? <p className="pc-note">Pick a concert to see the parts it gives them.</p>
              : props.parts.length === 0 ? <p className="pc-note">No parts match {person.section ?? 'their section'}{person.seat != null ? ` seat ${person.seat}` : ''} on this concert yet. Parts come from the library; a part is theirs when its name matches their section, and for winds and brass their seat.</p>
              : <>
                  <p className="pc-note">Matched from <b>{person.section}{person.seat != null ? ` · seat ${person.seat}` : ''}</b>. Change the section or seat above and this list, and their phone, change with it.</p>
                  <ul className="pc-list">{props.parts.map((p, i) => <li key={i}><b>{p.piece}</b> · {p.label}</li>)}</ul>
                </>
          )}
          {tab === 'history' && <HistoryTab {...props} />}
        </div>
        <p className="pc-saved">Saves as you type: press Enter, or move to the next field.</p>
      </div>
    </div>
  );
}

function InfoTab(props: PlayerCardProps & { email: string }) {
  const { person, contact, concert, member, email } = props;
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  return (
    <>
      <AutoField label="Email" type="email" value={email} onSave={v => props.onContact({ email: v })}
        hint={email && !usableEmail(email) ? <span className="pc-field-err">Not an email address, so no sign-in invitation can go out.</span> : null} />
      <AutoField label="Phone" type="tel" value={contact?.phone ?? ''} onSave={v => props.onContact({ phone: v })} />
      <label className="pc-field">
        <span className="pc-field-label">How we pay them</span>
        <select className="dir-select" value={contact?.payMethod ?? ''} onChange={e => props.onContact({ payMethod: e.target.value as PayMethod | '' })}>
          <option value="">Not set</option>
          {PAY_METHODS.map(m => <option key={m} value={m}>{PAY_METHOD_LABEL[m]}</option>)}
        </select>
      </label>
      <AutoField label="Pay to (a handle, never a bank number)" value={contact?.payHandle ?? ''}
        check={v => (v.length > 120 ? 'Keep it under 120 characters.' : looksLikeAccount(v) ? 'That looks like an account number. Use a Zelle email or phone, or a Venmo or PayPal name.' : noTaxId(v))}
        onSave={v => props.onContact({ payHandle: v })} />
      {concert && (
        <label className="pc-check">
          <input type="checkbox" checked={props.saidYes} onChange={e => props.onSaidYes(e.target.checked)} />
          Said yes to {concert.title || 'this concert'}
        </label>
      )}
      <label className="pc-field">
        <span className="pc-field-label">On the roster as</span>
        <select className="dir-select" value={person.status} onChange={e => props.onPerson({ status: e.target.value as Personnel['status'] })}>
          <option value="Contracted">Contracted</option>
          <option value="SubList">Sub list</option>
          <option value="Inactive">Archived (kept for history)</option>
        </select>
      </label>

      <div className="pc-block">
        <div className="pc-block-title"><KeyRound size={13} /> Hub sign-in</div>
        <p className="pc-note">
          {!member ? 'Not invited yet. Once invited they see their calls, their parts, their contract and whether they have been paid.'
            : member.passwordSet ? `Signs in as ${member.email} with a password of their own.`
            : `Invited as ${member.email}${member.invitedAt ? ` on ${dateOf(member.invitedAt)}` : ''}. Waiting for them to choose a password.`}
        </p>
        <div className="pc-row">
          {usableEmail(email) && (
            <button className="dir-tool-btn" disabled={busy} onClick={async () => { setBusy(true); setNote(await props.onInvite()); setBusy(false); }}>
              <Mail size={13} /> {busy ? 'Sending…' : !member ? 'Invite to the Hub' : member.passwordSet ? 'Email a new password link' : 'Send the invitation again'}
            </button>
          )}
          {member && !confirmRemove && <button className="dir-tool-btn" onClick={() => setConfirmRemove(true)}>Remove sign-in</button>}
          {member && confirmRemove && (
            <>
              <span className="pc-note">Remove {member.email}'s sign-in? Their roster row and contracts stay.</span>
              <button className="dir-tool-btn" disabled={busy} onClick={async () => { setBusy(true); setNote(await props.onRemoveSignIn()); setBusy(false); setConfirmRemove(false); }}>Remove</button>
              <button className="dir-tool-btn" onClick={() => setConfirmRemove(false)}>Cancel</button>
            </>
          )}
        </div>
        {note && <p className="pc-note" role="status">{note}</p>}
      </div>

      <button className="dir-tool-btn" onClick={props.onMoreDetails}><Pencil size={13} /> More details (instrument, address, W-9, notes…)</button>
    </>
  );
}

function PayTab(props: PlayerCardProps & { total: number | null; paid: number }) {
  const { concert, contract, total, paid } = props;
  const [fee, setFee] = useState(props.usualFeeCents != null ? (props.usualFeeCents / 100).toFixed(2) : '');
  const [confirmOff, setConfirmOff] = useState(false);
  const editable = contract && (contract.status === 'Draft' || contract.status === 'Sent');
  const mine = contract ? props.payments.filter(p => p.contractId === contract.id) : [];
  const feeCheck = (v: string) => (parseCentsInput(v) == null || (parseCentsInput(v) ?? 0) < 0 ? 'Type a dollar amount, like 250 or 250.00.' : null);
  return (
    <>
      <p className="pc-lock">Staff only. A player sees their own fee and whether they have been paid, never anyone else's.</p>
      {concert && !contract && (
        <div className="pc-block">
          <p className="pc-note">Not on {concert.title || 'this concert'}. Adding them drafts a contract for it at this fee.</p>
          <div className="pc-row">
            <input className="dir-input pc-fee" inputMode="decimal" aria-label="Fee" value={fee} onChange={e => setFee(e.target.value)} />
            <button className="dir-btn dir-btn-primary" disabled={feeCheck(fee) != null} onClick={() => props.onAddToConcert(parseCentsInput(fee)!)}>Add to this concert</button>
          </div>
        </div>
      )}
      {contract && (
        <div className="pc-block">
          {editable && contract.baseRateBasis === 'flat' ? (
            <AutoField label="Fee for this concert" value={(contract.baseRateCents / 100).toFixed(2)} check={feeCheck}
              onSave={v => props.onFee(parseCentsInput(v)!)} />
          ) : (
            <div className="pc-field">
              <span className="pc-field-label">Fee for this concert</span>
              <b>
                {formatCents(contract.baseRateCents)}{basisSuffix(contract.baseRateBasis)}
                {contract.baseRateQuantity != null && ` × ${contract.baseRateQuantity}`}
                {total != null && contract.baseRateBasis !== 'flat' && ` = ${formatCents(total)}`}
              </b>
              <span className="pc-note">{editable ? 'Change a per-service rate in the contract.' : 'Signed terms are frozen. Void and reissue to change them.'}</span>
            </div>
          )}
          {(contract.lineItems ?? []).map(li => (
            <div key={li.id} className="pc-note">Extra: {li.type}{li.label ? ` (${li.label})` : ''}: {formatCents(li.amountCents)}{basisSuffix(li.basis)}{li.quantity != null ? ` × ${li.quantity}` : ''}</div>
          ))}
          <div className="pc-paid">
            {total == null ? <span className="pc-note">The total is not known until the contract has its service count.</span>
              : paid >= total && total > 0 ? <b className="pc-yes">Paid {formatCents(paid)}</b>
              : <b>{paid > 0 ? `Paid ${formatCents(paid)} of ${formatCents(total)}` : `Not paid yet · ${formatCents(total)}`}</b>}
            {total != null && paid < total && <button className="dir-btn dir-btn-primary" onClick={props.onMarkPaid}>Mark paid</button>}
          </div>
          {mine.map(p => (
            <div key={p.id} className="pc-row pc-payment">
              <span>{formatCents(p.amountCents)} · {formatDate(p.paidOn, { month: 'short', day: 'numeric' })} · {PAY_METHOD_LABEL[p.method]}</span>
              <button className="dir-tool-btn" onClick={() => props.onDeletePayment(p.id)}>Undo</button>
            </div>
          ))}
          <div className="pc-row">
            <span className={`dir-contract-pill ${contract.status}`}>{contract.status}</span>
            <button className="dir-tool-btn" onClick={() => props.onOpenContract(contract)}><ClipboardSignature size={13} /> Open the contract</button>
          </div>
          {concert && !confirmOff && <button className="dir-tool-btn" onClick={() => setConfirmOff(true)}>Take off this concert</button>}
          {concert && confirmOff && (
            <div className="pc-row">
              <span className="pc-note">
                {contract.status === 'Draft' ? 'Their draft contract for it is deleted' : 'Their contract for it is voided'}
                {contract.eventIds?.length ? '' : ', and it is a season contract, so that takes them off every service it covers'}. They stay on the roster.
              </span>
              <button className="dir-tool-btn" onClick={() => { setConfirmOff(false); props.onTakeOff(); }}>Take off</button>
              <button className="dir-tool-btn" onClick={() => setConfirmOff(false)}>Cancel</button>
            </div>
          )}
        </div>
      )}
      <div className="pc-block">
        <div className="pc-block-title">All their contracts</div>
        {props.contracts.length === 0 && <p className="pc-note">None on file.</p>}
        {[...props.contracts].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).map(c => (
          <button key={c.id} className="dir-pers-contract dir-pers-contract-open" onClick={() => props.onOpenContract(c)}>
            <div className="dir-pers-contract-head">
              <span className={`dir-contract-pill ${c.status}`}>{c.status}</span>
              <span>{c.position}{c.startDate ? ` · ${formatDate(c.startDate, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}</span>
            </div>
          </button>
        ))}
        <button className="dir-tool-btn" onClick={props.onNewContract}><ClipboardSignature size={13} /> New contract</button>
      </div>
    </>
  );
}

/** What the records already say happened, newest first. Field-by-field
 *  changes arrive with the sheet link, which is what writes them. */
function HistoryTab({ person, contracts, payments, member }: PlayerCardProps) {
  const rows: { at: number; what: string; who?: string }[] = [];
  if (person.updatedAt) rows.push({ at: person.updatedAt, what: 'Roster record changed', who: person.updatedBy });
  for (const c of contracts) {
    if (c.createdAt) rows.push({ at: c.createdAt, what: `Contract drafted: ${c.position}`, who: undefined });
    if (c.signedAt) rows.push({ at: c.signedAt, what: 'Signed the contract' });
    if (c.countersignedAt) rows.push({ at: c.countersignedAt, what: 'Contract countersigned', who: c.countersignedBy });
    if (c.status === 'Void' && c.updatedAt) rows.push({ at: c.updatedAt, what: 'Contract voided', who: c.updatedBy });
  }
  for (const p of payments) rows.push({ at: Date.parse(`${p.paidOn}T12:00:00`), what: `Paid ${formatCents(p.amountCents)} by ${PAY_METHOD_LABEL[p.method]}`, who: p.updatedBy });
  if (member?.invitedAt) rows.push({ at: member.invitedAt, what: 'Invited to sign in to the Hub' });
  rows.sort((a, b) => b.at - a.at);
  if (!rows.length) return <p className="pc-note">Nothing recorded yet.</p>;
  return (
    <ul className="pc-list pc-history">
      {rows.map((r, i) => <li key={i}><b>{r.what}</b><span>{[r.who, dateOf(r.at)].filter(Boolean).join(' · ')}</span></li>)}
    </ul>
  );
}
