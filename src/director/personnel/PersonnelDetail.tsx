import { Pencil, Phone, Mail, Users, MapPin, FileText, ExternalLink, Archive, RotateCcw, ClipboardSignature, Landmark } from 'lucide-react';
import type { Personnel, PersonnelContact, Contract, Ensemble } from '../types';
import { ensembleColor, formatDate } from '../utils';
import { formatCents, basisSuffix, contractTotalCents } from './contractMoney';
import { Linkify } from '../components/Linkify';
import { EditedByLine } from '../components/EditedByLine';
import { useModalA11y } from '../../shared/useModalA11y';

/**
 * Read-only profile sheet for one person on the paid roster (#personnel) —
 * the StudentDetail pattern minus everything student-shaped (attendance,
 * assignments, progress notes) and plus the two things an adult roster
 * carries instead: payroll-adjacent contact details and the person's
 * contracts. Contract rows here are summaries that OPEN the contract sheet
 * (build-plan step 4) — issuing, signing, countersigning, and printing all
 * live there; this sheet never writes a contract itself.
 */

const W9_LABEL: Record<NonNullable<PersonnelContact['w9Status']>, string> = {
  'not-requested': 'W-9 not requested',
  'requested': 'W-9 requested',
  'on-file': 'W-9 on file',
};

const STATUS_LABEL: Record<Personnel['status'], string> = {
  Contracted: 'Contracted',
  SubList: 'Sub list',
  Inactive: 'Archived',
};

interface Props {
  person: Personnel;
  contact: PersonnelContact | null;
  /** This person's contracts only — the manager filters before passing. */
  contracts: Contract[];
  ensembles: Ensemble[];
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  /** Contract surfaces (build-plan step 4) — the manager owns the sheets. */
  onNewContract: () => void;
  onOpenContract: (c: Contract) => void;
  onClose: () => void;
}

export function PersonnelDetail({ person, contact, contracts, ensembles, onEdit, onArchive, onRestore, onNewContract, onOpenContract, onClose }: Props) {
  const panelRef = useModalA11y<HTMLDivElement>(onClose, true);
  const homeEnsembles = ensembles.filter(e => person.ensembleIds?.includes(e.id));
  const sorted = [...contracts].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  const extras = contact?.extra ? Object.entries(contact.extra).filter(([, v]) => v) : [];
  const hasContact = Boolean(contact?.email || contact?.phone || contact?.address
    || contact?.emergencyName || contact?.emergencyPhone || contact?.unionLocal || extras.length);

  const subtitle = [
    person.instrument,
    person.section,
    person.seat != null ? `Seat ${person.seat}` : null,
    person.sectionLeader ? 'Section leader' : null,
    person.status !== 'Contracted' ? STATUS_LABEL[person.status] : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={person.name}>
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="dir-drawer-title">
              {person.name}
              {person.preferredName && <span style={{ fontWeight: 400 }}> · goes by {person.preferredName}</span>}
            </div>
            {(subtitle || person.pronunciation) && (
              <div style={{ fontSize: 12, color: 'var(--dir-text-muted)', marginTop: 2 }}>
                {subtitle}
                {person.pronunciation && `${subtitle ? ' · ' : ''}“${person.pronunciation}”`}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {person.status !== 'Inactive' ? (
              <button className="dir-tool-btn" onClick={() => { if (window.confirm(`Archive ${person.name}? They leave the active roster and sub list but stay in the Archived view — their contracts keep pointing at them — and can be restored anytime.`)) { onArchive(); onClose(); } }}>
                <Archive size={13} /> Archive
              </button>
            ) : (
              <button className="dir-tool-btn" onClick={() => { onRestore(); onClose(); }}>
                <RotateCcw size={13} /> Restore
              </button>
            )}
            <button className="dir-tool-btn" onClick={onEdit}>
              <Pencil size={13} /> Edit
            </button>
            <button className="dir-drawer-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="dir-drawer-body">
          <EditedByLine updatedAt={person.updatedAt} updatedBy={person.updatedBy} />

          {/* ── Ensembles / series ── */}
          {homeEnsembles.length > 0 && (
            <div className="dir-detail-section">
              <div className="dir-detail-section-title"><Users size={13} /> Ensembles</div>
              <div className="dir-detail-tags">
                {homeEnsembles.map(e => (
                  <span key={e.id} className="dir-detail-ens-tag" style={{ background: ensembleColor(e) }}>
                    {e.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {person.doubles && person.doubles.length > 0 && (
            <div className="dir-detail-section">
              <div className="dir-detail-section-title"><FileText size={13} /> Doubles</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>{person.doubles.join(', ')}</div>
            </div>
          )}

          {/* ── Contact & paperwork (director-only) ── */}
          <div className="dir-detail-section">
            <div className="dir-detail-section-title"><Mail size={13} /> Contact <span className="dir-detail-private">directors only</span></div>
            {!hasContact ? (
              <button className="dir-btn dir-btn-ghost" style={{ marginTop: 6 }} onClick={onEdit}>
                <Pencil size={13} /> Add contact info
              </button>
            ) : (
              <div className="dir-detail-contact-list">
                {contact?.email && (
                  <a href={`mailto:${contact.email}`} className="dir-detail-contact-row">
                    <Mail size={13} />
                    <span>{contact.email}</span>
                    <ExternalLink size={11} className="dir-detail-ext" />
                  </a>
                )}
                {contact?.phone && (
                  <a href={`tel:${contact.phone}`} className="dir-detail-contact-row">
                    <Phone size={13} />
                    <span>{contact.phone}</span>
                    <ExternalLink size={11} className="dir-detail-ext" />
                  </a>
                )}
                {contact?.address && (
                  <div className="dir-detail-contact-row">
                    <MapPin size={13} />
                    <span>{contact.address}</span>
                  </div>
                )}
                {(contact?.emergencyName || contact?.emergencyPhone) && (
                  <div className="dir-detail-contact-row">
                    <Users size={13} />
                    <span>Emergency: {[contact.emergencyName, contact.emergencyPhone].filter(Boolean).join(' · ')}</span>
                  </div>
                )}
                {contact?.unionLocal && (
                  <div className="dir-detail-contact-row">
                    <Landmark size={13} />
                    <span>{contact.unionLocal}</span>
                  </div>
                )}
                {extras.length > 0 && (
                  <div className="dir-detail-extra">
                    {extras.map(([k, v]) => (
                      <div key={k} className="dir-detail-extra-row">
                        <FileText size={12} />
                        <span className="dir-detail-extra-key">{k}</span>
                        <span className="dir-detail-extra-val"><Linkify text={v} /></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <span className={`dir-w9-chip ${contact?.w9Status ?? 'not-requested'}`}>
                {W9_LABEL[contact?.w9Status ?? 'not-requested']}
              </span>
            </div>
          </div>

          {/* ── Contracts — tap a row for the full sheet ── */}
          <div className="dir-detail-section">
            <div className="dir-detail-section-title">
              <ClipboardSignature size={13} /> Contracts <span className="dir-detail-private">directors only</span>
            </div>
            {sorted.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--dir-text-muted)', marginTop: 6 }}>No contracts on file.</div>
            )}
            {sorted.map(c => {
                const total = contractTotalCents(c);
                return (
                  <button key={c.id} className="dir-pers-contract dir-pers-contract-open" onClick={() => onOpenContract(c)}>
                    <div className="dir-pers-contract-head">
                      <span className={`dir-contract-pill ${c.status}`}>{c.status}</span>
                      <span>{c.position}{c.season ? ` · ${c.season}` : ''}</span>
                    </div>
                    <div className="dir-pers-contract-money">
                      {formatCents(c.baseRateCents)}{basisSuffix(c.baseRateBasis)}
                      {c.baseRateQuantity != null && ` × ${c.baseRateQuantity}`}
                      {total != null && ` — est. total ${formatCents(total)}`}
                    </div>
                    {(c.lineItems ?? []).map(li => (
                      <div key={li.id} className="dir-pers-contract-line">
                        {li.type}{li.label ? ` — ${li.label}` : ''}: {formatCents(li.amountCents)}{basisSuffix(li.basis)}
                        {li.quantity != null && ` × ${li.quantity}`}
                      </div>
                    ))}
                    {(c.startDate || c.endDate) && (
                      <div className="dir-field-hint">
                        {[c.startDate, c.endDate].filter((d): d is string => Boolean(d))
                          .map(d => formatDate(d, { month: 'short', day: 'numeric', year: 'numeric' }))
                          .join(' – ')}
                      </div>
                    )}
                  </button>
                );
            })}
            <button className="dir-tool-btn" style={{ marginTop: 8 }} onClick={onNewContract}>
              <ClipboardSignature size={13} /> New contract
            </button>
          </div>

          {/* ── Notes ── */}
          {person.notes && (
            <div className="dir-detail-section">
              <div className="dir-detail-section-title"><FileText size={13} /> Notes</div>
              <div style={{ fontSize: 13, marginTop: 4 }}><Linkify text={person.notes} /></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
