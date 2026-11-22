import { csvEscape } from '../../shared/csv.ts';
import { seatLabel } from './personnelOrder.ts';
import { contractTotalCents, paidCents } from './contractMoney.ts';
import { PAY_METHOD_LABEL } from '../types.ts';
import type { Contract, Payment, Personnel, PersonnelContact } from '../types.ts';

/**
 * The two spreadsheets a personnel manager hands a bookkeeper (#personnel).
 * Pure: text out, so the download is one line in the screen and the
 * self-check can run it under plain node. Amounts are plain dollars ("110.00",
 * no $ or commas) so a spreadsheet reads them as numbers.
 */

const line = (cells: unknown[]) => cells.map(csvEscape).join(',');
const dollars = (cents: number | null) => (cents == null ? '' : (cents / 100).toFixed(2));

export function rosterCsv(people: Personnel[], contacts: Record<string, PersonnelContact>): string {
  const head = ['Name', 'Goes by', 'Instrument', 'Section', 'Seat', 'Doubles', 'Status', 'Email', 'Phone',
    'Emergency contact', 'Emergency phone', 'W-9', 'Paid by', 'Pay handle'];
  const rows = people.map(p => {
    const c = contacts[p.id];
    return line([
      p.name, p.preferredName, p.instrument, p.section, seatLabel(p), (p.doubles ?? []).join('; '),
      p.status === 'SubList' ? 'Sub list' : p.status === 'Inactive' ? 'Archived' : 'Contracted',
      c?.email, c?.phone, c?.emergencyName, c?.emergencyPhone, c?.w9Status ?? 'not-requested',
      c?.payMethod ? PAY_METHOD_LABEL[c.payMethod] : '', c?.payHandle,
    ]);
  });
  return [line(head), ...rows].join('\r\n');
}

/** One row per non-void contract: what is owed, what has been paid, and how
 *  to pay it. The mailing address rides along for checks and 1099s. */
export function payrollCsv(
  contracts: Contract[], payments: Payment[], contacts: Record<string, PersonnelContact>,
): string {
  const head = ['Name', 'Position', 'Section', 'Contract', 'Estimated total', 'Paid', 'Balance', 'Last paid',
    'Paid by', 'Pay handle', 'W-9', 'Email', 'Mailing address'];
  const rows = contracts.filter(c => c.status !== 'Void').map(c => {
    const mine = payments.filter(p => p.contractId === c.id);
    const total = contractTotalCents(c);
    const paid = paidCents(mine);
    const k = contacts[c.personnelId];
    return line([
      c.personnelName, c.position, c.section, c.status, dollars(total), dollars(paid),
      dollars(total == null ? null : total - paid),
      mine.map(p => p.paidOn).sort().pop(),
      k?.payMethod ? PAY_METHOD_LABEL[k.payMethod] : '', k?.payHandle, k?.w9Status ?? 'not-requested', k?.email, k?.address,
    ]);
  });
  return [line(head), ...rows].join('\r\n');
}
