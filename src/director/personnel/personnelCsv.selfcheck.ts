/**
 * Runnable self-check:
 *   npx tsx --tsconfig tsconfig.app.json src/director/personnel/personnelCsv.selfcheck.ts
 * Pins the payroll arithmetic (integer cents to plain dollars), that a name
 * which looks like a formula is neutralized, that a Void contract is left out,
 * and the stand and inside/outside wording.
 */
import { payrollCsv, rosterCsv } from './personnelCsv.ts';
import { seatLabel, calledIds } from './personnelOrder.ts';
import type { Contract, Payment } from '../types.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const c = (id: string, name: string, status: Contract['status']): Contract => ({
  id, personnelId: `p-${id}`, personnelName: name, category: 'chair', position: 'Section', section: 'Violin I',
  baseRateCents: 11000, baseRateBasis: 'per-service', baseRateQuantity: 4,
  lineItems: [{ id: 'l', type: 'Cartage', amountCents: 2550, basis: 'per-service', quantity: 4 }], status,
});
const pay = (contractId: string, amountCents: number, paidOn: string): Payment =>
  ({ id: `${contractId}${paidOn}`, contractId, personnelId: `p-${contractId}`, amountCents, paidOn, method: 'zelle' });

const csv = payrollCsv(
  [c('a', 'Khoury, Rania', 'Countersigned'), c('b', '=HYPERLINK("x")', 'Signed'), c('v', 'Void, Vic', 'Void')],
  [pay('a', 20000, '2027-01-01'), pay('a', 24200, '2027-01-03')],
  { 'p-a': { id: 'p-a', payMethod: 'zelle', payHandle: 'r@example.org', w9Status: 'on-file' } },
);
const lines = csv.split('\r\n');
assert(lines.length === 3, `header + 2 rows (void left out), got ${lines.length}`);
assert(lines[1].includes('542.00,442.00,100.00,2027-01-03'), `total 542.00, paid 442.00, owed 100.00, last paid: ${lines[1]}`);
assert(lines[1].includes('Zelle,r@example.org,on-file'), 'pay method and handle ride along');
assert(lines[2].startsWith(`"'=HYPERLINK`), `a formula-shaped name is neutralized: ${lines[2]}`);
assert(lines[2].includes('542.00,0.00,542.00'), 'unpaid contract owes the full total');

assert(seatLabel({ section: 'Violin I', seat: 3 }) === 'Stand 2, outside', 'seat 3 is stand 2 outside');
assert(seatLabel({ section: 'Violin II', seat: 4 }) === 'Stand 2, inside', 'seat 4 is stand 2 inside');
assert(seatLabel({ section: 'Oboe', seat: 2 }) === 'Part 2', 'winds have parts, not stands');
assert(seatLabel({ section: 'Harp' }) === '', 'no seat, no label');
assert(rosterCsv([{ id: 'x', name: 'A, B', status: 'SubList', section: 'Cello', seat: 1 }], {}).includes('"Stand 1, outside",,Sub list'), 'roster row');
const svc = { id: 'e2', date: '2027-01-02', ensembleIds: ['orch'] };
const base = { category: 'chair' as const, position: 'Section', baseRateCents: 0, baseRateBasis: 'flat' as const, status: 'Draft' as const };
const called = calledIds([
  { ...base, id: '1', personnelId: 'named', personnelName: 'n', eventIds: ['e2'] },
  { ...base, id: '2', personnelId: 'other-service', personnelName: 'o', eventIds: ['e9'], ensembleIds: ['orch'] },
  { ...base, id: '3', personnelId: 'season', personnelName: 's', ensembleIds: ['orch'], startDate: '2027-01-01', endDate: '2027-01-03' },
  { ...base, id: '4', personnelId: 'too-early', personnelName: 't', ensembleIds: ['orch'], endDate: '2026-12-31' },
  { ...base, id: '5', personnelId: 'void', personnelName: 'v', ensembleIds: ['orch'], status: 'Void' as const },
  { ...base, id: '6', personnelId: 'no-ensemble', personnelName: 'x' },
], svc);
assert([...called].sort().join() === 'named,season', `called: ${[...called]}`);
console.log('personnelCsv self-check: ok');
