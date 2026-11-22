/**
 * What a player sees of their own records (#member-sign-in). Run:
 *   node --experimental-strip-types src/shared/memberView.selfcheck.ts
 */
import { memberView, partIsMine, MEMBER_CONTRACT_KEYS, MEMBER_PAYMENT_KEYS, MEMBER_PERSON_KEYS, MEMBER_CONTACT_KEYS } from './memberView.ts';

let failures = 0;
const check = (c: unknown, m: string) => { if (!c) { failures++; console.error(`  ✗ ${m}`); } };

// ── Internal notes never leave ──
for (const keys of [MEMBER_PERSON_KEYS, MEMBER_CONTRACT_KEYS, MEMBER_PAYMENT_KEYS, MEMBER_CONTACT_KEYS] as readonly (readonly string[])[]) {
  for (const k of ['notes', 'note', 'pronunciation', 'updatedBy', 'updatedByRole', 'address', 'w9Status', 'email', 'phone', 'extra']) {
    check(!keys.includes(k), `allowlist never carries "${k}"`);
  }
}
const v = memberView('p1',
  { name: 'Ana Ruiz', section: 'Violin I', seat: 3, notes: 'late twice', pronunciation: 'AH-na' },
  { payMethod: 'zelle', payHandle: 'ana@x.test', address: '1 Main', w9Status: 'on-file' },
  [
    { id: 'c1', data: { personnelId: 'p1', status: 'Signed', baseRateCents: 15000, notes: 'do not rehire', updatedBy: 'x@y' } },
    { id: 'c2', data: { personnelId: 'p1', status: 'Draft', baseRateCents: 1 } },
    { id: 'c3', data: { personnelId: 'p2', status: 'Signed', baseRateCents: 99999 } },
  ],
  [
    { id: 'y1', data: { personnelId: 'p1', contractId: 'c1', amountCents: 5000, note: 'short paid, ask', paidOn: '2026-12-01', method: 'zelle' } },
    { id: 'y2', data: { personnelId: 'p1', contractId: 'c2', amountCents: 1 } },
    { id: 'y3', data: { personnelId: 'p2', contractId: 'c3', amountCents: 2 } },
  ]);
const text = JSON.stringify(v);
for (const secret of ['late twice', 'AH-na', 'do not rehire', 'x@y', 'short paid', '1 Main', 'on-file', '99999']) check(!text.includes(secret), `"${secret}" is not in the view`);
check(v.contracts.length === 1 && v.contracts[0].id === 'c1', 'only the player\'s own contracts, and never a Draft');
check(v.payments.length === 1 && v.payments[0].id === 'y1', 'only payments against a contract the player can see');
check(v.person?.name === 'Ana Ruiz' && v.contact.payHandle === 'ana@x.test', 'name and their own pay handle come through');
check(memberView('p1', undefined, undefined, [], []).person === null, 'no roster row: person is null');

// ── Which part is mine ──
const me = (section: string, seat?: number, instrument?: string) => ({ section, seat, instrument });
check(partIsMine({ label: 'Violins I' }, me('Violin I', 5)), 'Violins I is a Violin I player\'s');
check(!partIsMine({ label: 'Violins II' }, me('Violin I', 5)), 'Violins II is not');
check(partIsMine({ label: 'Violins II' }, me('Violin II', 1)), 'Violins II is a Violin II player\'s');
check(partIsMine({ label: 'Basses' }, me('Bass', 2)), 'Basses is a bassist\'s');
check(partIsMine({ label: 'Basses' }, me('Double Bass', 2)), 'Basses is a double bassist\'s');
check(partIsMine({ label: 'Cellos' }, me('Cello', 4)), 'Cellos');
check(!partIsMine({ label: 'Violas' }, me('Violin I', 1)), 'Violas is not a violinist\'s');
check(partIsMine({ label: 'Flute 2' }, me('Flute', 2)), 'Flute 2 is the second flute\'s');
check(!partIsMine({ label: 'Flute 1' }, me('Flute', 2)), 'Flute 1 is not');
check(partIsMine({ label: 'Horn 3-4' }, me('Horn', 4)), 'Horn 3-4 is the fourth horn\'s');
check(partIsMine({ label: 'Harp' }, me('Harp', 1)), 'Harp');
check(!partIsMine({ label: 'Bassoon 1' }, me('Bass', 1)), 'a bassist does not get the bassoon part');
check(!partIsMine({ label: 'Score', role: 'score' }, me('Violin I', 1)), 'the score is nobody\'s chair');
check(partIsMine({ label: 'Trumpet 1' }, me('', 1, 'Trumpet')), 'no section: the instrument decides');

if (failures) { console.error(`member view self-check: ${failures} failure(s)`); process.exit(1); }
console.log('member view self-check: ok');
