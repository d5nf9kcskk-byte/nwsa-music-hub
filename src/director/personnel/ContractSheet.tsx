import { useRef, useState } from 'react';
import { Pencil, Printer, Trash2, Send, ClipboardSignature, Ban, FileText } from 'lucide-react';
import type { Contract, ContractTemplate } from '../types';
import { formatCents, basisSuffix, lineItemTotalCents, contractTotalCents } from './contractMoney';
import { resolveContractTokens } from './contractTerms';
import { printViaPopup } from '../../shared/printPopup';
import { useModalA11y } from '../../shared/useModalA11y';
import { ORG } from '../../org';

/**
 * One contract (#personnel): the rendered agreement, the lifecycle actions,
 * and print. The lifecycle here only OFFERS what firestore.rules would
 * accept (the useContracts doc): edit and delete exist for Draft/Sent only,
 * signing freezes the terms, countersign follows a signature, Void is
 * terminal, and the internal note is the one field alive in every state.
 *
 * The agreement text renders from the FROZEN `termsText` with {{tokens}}
 * resolved from the structured fields at display time (contractTerms.ts) —
 * the same fields the rules freeze at signing, so what a signed contract
 * shows can never drift from what was signed.
 *
 * Print reuses the sign-up module's path wholesale: a typed-name signature,
 * `printViaPopup` over an off-screen host, no PDF dependency. The host is
 * positioned off-screen rather than display:none ON PURPOSE — print engines
 * skip display:none, and printViaPopup serializes the node's markup (see
 * `.dir-signup-print-host` in signups.css, same comment).
 */

interface Props {
  contract: Contract;
  templates: ContractTemplate[];
  onEdit: () => void;
  onMarkSent: () => void;
  onSign: (signature: string) => Promise<void>;
  onCountersign: () => Promise<void>;
  onVoid: () => Promise<void>;
  onDeleteDraft: () => Promise<void>;
  onSaveNotes: (notes: string) => Promise<void>;
  onClose: () => void;
}

/** Base-plus-line-items breakdown — one source of arithmetic (contractMoney,
 *  integer cents) rendered identically on screen and on the printed page. */
function CompensationTable({ contract: c }: { contract: Contract }) {
  const baseTotal = lineItemTotalCents({
    id: 'base', type: 'Base', amountCents: c.baseRateCents,
    basis: c.baseRateBasis, quantity: c.baseRateQuantity,
  });
  const total = contractTotalCents(c);
  return (
    <table className="contract-comp">
      <tbody>
        <tr>
          <td>Base — {c.position}</td>
          <td>{formatCents(c.baseRateCents)}{basisSuffix(c.baseRateBasis)}</td>
          <td>{c.baseRateQuantity != null ? `× ${c.baseRateQuantity}` : ''}</td>
          <td>{baseTotal != null ? formatCents(baseTotal) : '—'}</td>
        </tr>
        {(c.lineItems ?? []).map(li => {
          const t = lineItemTotalCents(li);
          return (
            <tr key={li.id}>
              <td>{li.type}{li.label ? ` — ${li.label}` : ''}</td>
              <td>{formatCents(li.amountCents)}{basisSuffix(li.basis)}</td>
              <td>{li.quantity != null ? `× ${li.quantity}` : ''}</td>
              <td>{t != null ? formatCents(t) : '—'}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={3}>Estimated total{c.baseRateBasis !== 'flat' ? ' (settled against services performed)' : ''}</td>
          <td>{total != null ? formatCents(total) : '—'}</td>
        </tr>
      </tfoot>
    </table>
  );
}

/** The printable one-page agreement (the signup-sheet pattern). Exported
 *  so tooling can render it headlessly (react-dom/server) and check the
 *  arithmetic and token resolution on the printed page. */
export function ContractPrintSheet({ contract: c }: { contract: Contract }) {
  const terms = c.termsText ? resolveContractTokens(c.termsText, c, ORG.orgFullName) : '';
  return (
    <section className="contract-sheet">
      <header className="signup-sheet-head">
        <div className="signup-sheet-org">{ORG.orgFullName}</div>
        <h1>Agreement of Engagement{c.status === 'Void' ? ' — VOID' : ''}</h1>
      </header>
      <dl className="signup-sheet-fields">
        <dt>Engaged</dt><dd>{c.personnelName}</dd>
        <dt>Position</dt>
        <dd>
          {c.position}
          {c.section ? ` — ${c.section}` : ''}
          {c.seat != null ? `, seat ${c.seat}` : ''}
        </dd>
        {c.season && <><dt>Season</dt><dd>{c.season}</dd></>}
        {(c.startDate || c.endDate) && (
          <><dt>Term</dt><dd>{[c.startDate, c.endDate].filter(Boolean).join(' through ')}</dd></>
        )}
      </dl>
      {terms && (
        <div className="contract-sheet-terms">
          {terms.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
        </div>
      )}
      <div className="contract-sheet-comp">
        <div className="contract-sheet-comp-title">Compensation</div>
        <CompensationTable contract={c} />
      </div>
      <div className="signup-sheet-sign">
        <div className="signup-sheet-line">
          <span className="signup-sheet-sig">{c.signature ?? ' '}</span>
          <span className="signup-sheet-cap">
            {c.signature
              ? `Signature (typed) · ${new Date(c.signedAt ?? 0).toLocaleString()}`
              : 'Signature · date'}
          </span>
        </div>
      </div>
      <div className="signup-sheet-sign">
        <div className="signup-sheet-line">
          <span className="signup-sheet-sig">{c.countersignedBy ?? ' '}</span>
          <span className="signup-sheet-cap">
            {c.countersignedBy
              ? `Countersigned for ${ORG.orgFullName} · ${new Date(c.countersignedAt ?? 0).toLocaleString()}`
              : `Countersigned for ${ORG.orgFullName} · date`}
          </span>
        </div>
      </div>
    </section>
  );
}

export function ContractSheet({
  contract: c, templates,
  onEdit, onMarkSent, onSign, onCountersign, onVoid, onDeleteDraft, onSaveNotes, onClose,
}: Props) {
  const panelRef = useModalA11y<HTMLDivElement>(onClose, true, { closeOnBack: true });
  const printRef = useRef<HTMLDivElement>(null);
  const [signature, setSignature] = useState('');
  const [notes, setNotes] = useState(c.notes ?? '');
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const editable = c.status === 'Draft' || c.status === 'Sent';
  const template = c.templateId ? templates.find(t => t.id === c.templateId) : undefined;
  const terms = c.termsText ? resolveContractTokens(c.termsText, c, ORG.orgFullName) : '';

  function printContract() {
    if (printRef.current) printViaPopup(`${ORG.brandName} — Contract — ${c.personnelName}`, printRef.current.outerHTML);
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Contract — ${c.personnelName}`}>
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="dir-drawer-title">{c.personnelName}</div>
            <div style={{ fontSize: 12, color: 'var(--dir-text-muted)', marginTop: 2 }}>
              {[c.position, c.section, c.season].filter(Boolean).join(' · ')}
            </div>
          </div>
          <span className={`dir-contract-pill ${c.status}`}>{c.status}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>

        <div className="dir-drawer-body">
          {/* ── Actions for the current lifecycle state ── */}
          <div className="dir-contract-actions">
            {editable && (
              <button className="dir-tool-btn" onClick={onEdit}><Pencil size={14} /> Edit</button>
            )}
            {c.status === 'Draft' && (
              <button className="dir-tool-btn" onClick={onMarkSent}><Send size={14} /> Mark sent</button>
            )}
            {c.status === 'Signed' && (
              <button className="dir-tool-btn" disabled={busy} onClick={() => void run(onCountersign)}>
                <ClipboardSignature size={14} /> Countersign
              </button>
            )}
            <button className="dir-tool-btn" onClick={printContract}><Printer size={14} /> Print / save PDF</button>
            {c.status !== 'Void' && (
              confirmVoid ? (
                <>
                  <button className="dir-tool-btn dir-btn-danger" disabled={busy} onClick={() => void run(onVoid).then(() => setConfirmVoid(false))}>
                    Confirm void
                  </button>
                  <button className="dir-tool-btn" onClick={() => setConfirmVoid(false)}>Cancel</button>
                </>
              ) : (
                <button className="dir-tool-btn" onClick={() => setConfirmVoid(true)}><Ban size={14} /> Void</button>
              )
            )}
            {c.status === 'Draft' && (
              confirmDelete ? (
                <>
                  <button className="dir-tool-btn dir-btn-danger" disabled={busy} onClick={() => void run(onDeleteDraft).then(onClose)}>
                    Confirm delete
                  </button>
                  <button className="dir-tool-btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
                </>
              ) : (
                <button className="dir-tool-btn" onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Delete draft</button>
              )
            )}
          </div>
          {c.status === 'Void' && (
            <p className="dir-field-hint">Void is terminal — the record stays for the season’s history; only the internal note can change.</p>
          )}

          {/* ── Compensation ── */}
          <div className="dir-detail-section">
            <div className="dir-detail-section-title">Compensation</div>
            <CompensationTable contract={c} />
          </div>

          {/* ── Agreement text ── */}
          <div className="dir-detail-section">
            <div className="dir-detail-section-title"><FileText size={13} /> Agreement</div>
            {terms ? (
              <div className="dir-contract-terms">
                {terms.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--dir-text-muted)', marginTop: 6 }}>
                No agreement text attached{editable ? ' — Edit and insert a template.' : '.'}
              </div>
            )}
            {c.templateId && (
              <p className="dir-field-hint">
                Issued from “{template?.name ?? 'a deleted template'}”
                {c.templateVersion != null ? ` v${c.templateVersion}` : ''} — the text above is this
                contract’s own frozen copy{editable ? '' : '; it cannot change now that it is signed'}.
              </p>
            )}
          </div>

          {/* ── Signatures ── */}
          <div className="dir-detail-section">
            <div className="dir-detail-section-title"><ClipboardSignature size={13} /> Signatures</div>
            {c.signature ? (
              <div className="dir-signup-answer">
                <div className="dir-signup-sig">{c.signature}</div>
                <div className="dir-field-hint">Signed (typed) · {new Date(c.signedAt ?? 0).toLocaleString()}</div>
              </div>
            ) : editable ? (
              <>
                <p className="dir-field-hint">
                  The typed full name is the signature, stamped with the moment it’s saved —
                  the same as the sign-up forms. Signing freezes the terms above.
                </p>
                <div className="dir-signup-qedit-row" style={{ marginTop: 6 }}>
                  <input
                    className="dir-input"
                    value={signature}
                    onChange={e => setSignature(e.target.value)}
                    placeholder="Type full name to sign"
                  />
                  <button
                    className="dir-btn dir-btn-primary"
                    disabled={busy || !signature.trim()}
                    onClick={() => void run(() => onSign(signature.trim()))}
                  >
                    Record signature
                  </button>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--dir-text-muted)', marginTop: 6 }}>Not signed.</div>
            )}
            {c.countersignedBy && (
              <div className="dir-signup-answer">
                <div className="dir-signup-sig">{c.countersignedBy}</div>
                <div className="dir-field-hint">Countersigned for {ORG.orgFullName} · {new Date(c.countersignedAt ?? 0).toLocaleString()}</div>
              </div>
            )}
          </div>

          {/* ── Internal note — editable in every state, Void included ── */}
          <div className="dir-detail-section">
            <div className="dir-detail-section-title">Internal note <span className="dir-detail-private">never shown to the signer</span></div>
            <textarea className="dir-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. superseded by the revised offer" />
            {notes !== (c.notes ?? '') && (
              <button className="dir-tool-btn" style={{ marginTop: 6 }} disabled={busy} onClick={() => void run(() => onSaveNotes(notes))}>
                Save note
              </button>
            )}
          </div>
        </div>

        {/* Off-screen print host — position, not display:none, on purpose
            (the .dir-signup-print-host contract; print engines skip
            display:none and printViaPopup serializes this node). */}
        <div className="dir-signup-print-host" aria-hidden="true">
          <div ref={printRef}>
            <ContractPrintSheet contract={c} />
          </div>
        </div>
      </div>
    </div>
  );
}
