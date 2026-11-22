import { useRef } from 'react';
import { Download, Printer } from 'lucide-react';
import { downloadCsv } from '../attendance/attendanceCsv';
import { printViaPopup } from '../../shared/printPopup';
import { useModalA11y } from '../../shared/useModalA11y';
import { backdropClose } from '../../shared/backdropClose';
import { ORG } from '../../org';
import { todayStr } from '../utils';
import type { Contract, Payment, Personnel, PersonnelContact } from '../types';
import { byScoreSectionSeat, sectionIsInstrument, seatLabel } from './personnelOrder';
import { payrollCsv, rosterCsv } from './personnelCsv';

/**
 * What a personnel manager takes away (#personnel): the payroll sheet and the
 * roster as CSV, and two printable pages, the sign-in sheet and the seating
 * list. Printing is the contract sheet's path: an off-screen host (position,
 * not display:none, on purpose) and printViaPopup, no PDF dependency.
 */

interface Props {
  /** The people to print and list: active, in whatever ensemble the manager is showing. */
  people: Personnel[];
  contacts: Record<string, PersonnelContact>;
  contracts: Contract[];
  payments: Payment[];
  onClose: () => void;
}

/** Players grouped by section, in score order with seats inside. */
function bySection(people: Personnel[]) {
  const groups: { section: string; people: Personnel[] }[] = [];
  for (const p of [...people].sort(byScoreSectionSeat)) {
    const section = p.section?.trim() || p.instrument?.trim() || 'Staff';
    const last = groups[groups.length - 1];
    if (last?.section === section) last.people.push(p);
    else groups.push({ section, people: [p] });
  }
  return groups;
}

export function SignInSheet({ people }: { people: Personnel[] }) {
  return (
    <section className="signup-sheet pers-print">
      <header className="signup-sheet-head">
        <div className="signup-sheet-org">{ORG.orgFullName}</div>
        <h1>Sign-in sheet</h1>
      </header>
      <p className="pers-print-line">Service: ______________________ &nbsp; Date: ______________</p>
      {bySection(people).map(g => (
        <table key={g.section} className="pers-print-table">
          <caption>{g.section}</caption>
          <tbody>
            {g.people.map(p => (
              <tr key={p.id}>
                <td className="pers-print-name">{p.name}{p.status === 'SubList' ? ' (sub)' : ''}</td>
                <td className="pers-print-seat">{seatLabel(p)}</td>
                <td className="pers-print-sign" />
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </section>
  );
}

export function SeatingList({ people }: { people: Personnel[] }) {
  return (
    <section className="signup-sheet pers-print">
      <header className="signup-sheet-head">
        <div className="signup-sheet-org">{ORG.orgFullName}</div>
        <h1>Seating</h1>
      </header>
      {bySection(people).map(g => (
        <div key={g.section} className="pers-print-section">
          <h2>{g.section}</h2>
          <ol>
            {g.people.map(p => (
              <li key={p.id}>
                {seatLabel(p) && <span className="pers-print-seat">{seatLabel(p)}</span>}
                {p.name}
                {p.sectionLeader ? ' ★' : ''}
                {p.doubles?.length ? ` (+ ${p.doubles.join(', ')})` : ''}
                {p.instrument && !sectionIsInstrument(p) && p.section ? ` · ${p.instrument}` : ''}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}

export function PersonnelReports({ people, contacts, contracts, payments, onClose }: Props) {
  const panelRef = useModalA11y<HTMLDivElement>(onClose, true, { closeOnBack: true });
  const signInRef = useRef<HTMLDivElement>(null);
  const seatingRef = useRef<HTMLDivElement>(null);
  // Players only: anyone with a section or an instrument. Conductor and staff are not on a stand.
  const players = people.filter(p => p.section || p.instrument);

  return (
    <div className="dir-drawer-overlay" {...backdropClose(onClose)}>
      <div className="dir-drawer" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Reports">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">Reports</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-detail-section">
            <div className="dir-detail-section-title">Spreadsheets</div>
            <p className="dir-field-hint">Open in Excel or Sheets. The payroll sheet has what each contract is worth, what has been paid, and how to pay the rest. Directors only, so keep the file private.</p>
            <div className="dir-contract-actions">
              <button className="dir-tool-btn" onClick={() => downloadCsv(`payroll-${todayStr()}.csv`, payrollCsv(contracts, payments, contacts))}>
                <Download size={14} /> Payroll CSV
              </button>
              <button className="dir-tool-btn" onClick={() => downloadCsv(`roster-${todayStr()}.csv`, rosterCsv(people, contacts))}>
                <Download size={14} /> Roster CSV
              </button>
            </div>
          </div>
          <div className="dir-detail-section">
            <div className="dir-detail-section-title">Print or save as PDF</div>
            <p className="dir-field-hint">{players.length} players, in score order. Follows the ensemble filter on the roster.</p>
            <div className="dir-contract-actions">
              <button className="dir-tool-btn" onClick={() => signInRef.current && printViaPopup(`${ORG.brandName} sign-in sheet`, signInRef.current.outerHTML)}>
                <Printer size={14} /> Sign-in sheet
              </button>
              <button className="dir-tool-btn" onClick={() => seatingRef.current && printViaPopup(`${ORG.brandName} seating`, seatingRef.current.outerHTML)}>
                <Printer size={14} /> Seating list
              </button>
            </div>
          </div>
        </div>
        <div className="dir-signup-print-host" aria-hidden="true">
          <div ref={signInRef}><SignInSheet people={players} /></div>
          <div ref={seatingRef}><SeatingList people={players} /></div>
        </div>
      </div>
    </div>
  );
}
