/**
 * Runnable self-check:
 *   npx tsx --tsconfig tsconfig.app.json src/director/personnel/importPlan.selfcheck.ts
 *
 * The importer is the only thing standing between a spreadsheet and
 * personnelContacts.extra, which firestore.rules cannot look inside. Pins:
 * a taxpayer or bank column is refused, an SSN-shaped cell is refused, names
 * come out "Last, First", duplicates are skipped, money is whole cents, and
 * unknown columns survive as `extra`.
 */
import { planPersonnelImport, draftContractFor } from './importPlan.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const ok = planPersonnelImport(
  'Name,Instrument,Section,Seat,Email,Phone,Zelle,W-9,Fee,Services,Locker\n'
  + 'Rania Khoury,Flute,Flute,1,r@example.org,555-0101,r@example.org,yes,$110,4,12\n'
  + '"Okwuosa, Amara",Violin,Violin I,1,,,,no,150.50,,\n'
  + 'Rania Khoury,Flute,,,,,,,,,\n'
  + ',Oboe,,,,,,,,,\n'
  + 'Tobi Oyelaran,Oboe,,2,,,,,ten,,\n',
  ['Seo, Minjun'],
);
assert(!ok.refused, 'a clean file is not refused');
assert(ok.people.length === 3, `3 people, got ${ok.people.length}`);
const [r, a, t] = ok.people;
assert(r.name === 'Khoury, Rania', 'First Last becomes Last, First');
assert(a.name === 'Okwuosa, Amara', 'Last, First is left alone');
assert(r.payMethod === 'zelle' && r.payHandle === 'r@example.org', 'a Zelle column is a handle with the method implied');
assert(r.w9Status === 'on-file' && a.w9Status === 'not-requested', 'W-9 is a status');
assert(r.extra.Locker === '12', 'an unknown column is kept as extra');
assert(r.feeCents === 11000 && r.services === 4, 'fee in cents and services');
assert(a.feeCents === 15050, '150.50 is 15050 cents');
const d = draftContractFor(r)!;
assert(d.baseRateBasis === 'per-service' && d.baseRateQuantity === 4 && d.category === 'chair', 'fee with services is a per-service chair contract');
assert(draftContractFor(a)!.baseRateBasis === 'flat', 'fee with no services is flat');
assert(draftContractFor(t) === null && ok.notes.length === 1, 'an unreadable fee makes no draft and says so');
assert(ok.skipped.length === 2, 'a repeat and a blank name are skipped');

for (const header of ['SSN', 'Tax ID', 'EIN', 'Bank account number', 'Routing number', 'Taxpayer ID']) {
  const p = planPersonnelImport(`Name,${header}\nA B,x`, []);
  assert(p.refused && p.people.length === 0, `${header} column must be refused`);
}
assert(planPersonnelImport('Name,Notes\nA B,078-05-1120', []).refused, 'an SSN-shaped cell is refused');
assert(planPersonnelImport('Name,Notes\nA B,12-3456789', []).refused, 'an EIN-shaped cell is refused');
assert(!planPersonnelImport('Name,Phone\nA B,555-0101', []).refused, 'a phone number is not an SSN');
assert(planPersonnelImport('Instrument\nFlute', []).refused, 'no name column is refused');
console.log('importPlan self-check: ok');
