/**
 * Pins roster email (#roster-email). Five promises, each of which fails
 * SILENTLY if broken — nothing throws, no test goes red, the director just
 * reaches fewer people than they think, or more people than they meant.
 */
import {
  rosterRecipients, rosterNumbers, mailtoBatches, smsLink, copyList, copyNumbers,
  isEmailish, isPhonish, MAILTO_MAX,
} from './rosterEmail';
import { isAdultStudent } from './utils';
import { lastFirst } from '../shared/personName';
import type { Ensemble, Student, StudentContact } from './types';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const student = (id: string, name: string): Student =>
  ({ id, name, status: 'Active' } as Student);
const contact = (id: string, c: Partial<StudentContact>): StudentContact =>
  ({ id, ...c } as StudentContact);

// ---------------------------------------------------------------- addresses
assert(isEmailish('a@b.org'), 'a plain address is usable');
assert(!isEmailish('') && !isEmailish(undefined) && !isEmailish('   '), 'blank is not an address');
assert(!isEmailish('not an email') && !isEmailish('a@b') && !isEmailish('a b@c.org'), 'junk is not an address');
assert(!isEmailish('a@b.org, c@d.org'), 'two addresses in one field is not one address');

// 1. One guardian with three children is ONE recipient.
const siblings = [student('s1', 'A Ramos'), student('s2', 'B Ramos'), student('s3', 'C Ramos')];
const shared: Record<string, StudentContact> = {
  s1: contact('s1', { parentEmail: 'parent@ramos.test' }),
  s2: contact('s2', { parentEmail: 'Parent@Ramos.test' }), // same person, different case
  s3: contact('s3', { guardians: [{ email: 'parent@ramos.test' }] }),
};
const dedup = rosterRecipients(siblings, shared, 'guardians');
assert(dedup.addresses.length === 1, 'one guardian across three students is one address');
assert(dedup.missing.length === 0, 'a student whose guardian was already listed is not "missing"');

// 2. A student with no address is REPORTED, never silently dropped.
const mixed = [student('s1', 'Has One'), student('s2', 'Has None'), student('s3', 'Not In Contacts')];
const sparse: Record<string, StudentContact> = {
  s1: contact('s1', { email: 'one@x.test' }),
  s2: contact('s2', { email: '', parentEmail: '', phone: '305-555-0100' }),
};
const sparseOut = rosterRecipients(mixed, sparse, 'both');
assert(sparseOut.addresses.length === 1, 'only the real address is a recipient');
assert(sparseOut.missing.map(s => s.id).join(',') === 's2,s3', 'both unreachable students are named');

// 3. The audience decides whose address is used, and it never leaks the other.
const one = [student('s1', 'One')];
const both: Record<string, StudentContact> = {
  s1: contact('s1', { email: 'kid@x.test', parentEmail: 'mom@x.test', guardians: [{ email: 'mom@x.test' }, { email: 'dad@x.test' }] }),
};
assert(rosterRecipients(one, both, 'students').addresses.join() === 'kid@x.test', 'students audience is the student only');
assert(rosterRecipients(one, both, 'guardians').addresses.join() === 'mom@x.test,dad@x.test', 'guardians audience is every guardian, deduped against the parentEmail mirror');
assert(rosterRecipients(one, both, 'both').addresses.length === 3, 'both audiences is the union');

// 4. BCC, never TO — a roster's addresses are never shown to the roster.
const many = Array.from({ length: 200 }, (_, i) => `family${i}@someschooldomain.test`);
const links = mailtoBatches(many, 'Concert Friday');
assert(links.length > 1, '200 addresses do not fit in one mailto — the batching must actually engage');
for (const l of links) {
  assert(l.startsWith('mailto:?bcc='), 'every link addresses bcc and nothing else');
  assert(!/[?&]to=/.test(l) && !/[?&]cc=/.test(l), 'no to= and no cc= anywhere');
  // 5. Every batch is under the cap a mail handler will silently truncate at.
  assert(l.length <= MAILTO_MAX, `batch is within MAILTO_MAX (${l.length})`);
}

// ...and the batches together carry every address exactly once, in order.
const carried = links.flatMap(l =>
  decodeURIComponent(l.slice('mailto:?bcc='.length).split('&')[0]).split(','));
assert(carried.join(',') === many.join(','), 'batching loses nobody and reorders nobody');

// A short list is one link; an empty list is no link at all (nothing to open).
assert(mailtoBatches(['a@b.test']).length === 1, 'a short list is one link');
assert(mailtoBatches([]).length === 0, 'no addresses means no mail window');
// A single address past the cap still gets a link rather than vanishing.
assert(mailtoBatches([`${'x'.repeat(MAILTO_MAX)}@y.test`]).length === 1, 'an over-long single address is still sent, not dropped');

assert(copyList(['a@b.test', 'c@d.test']) === 'a@b.test, c@d.test', 'the clipboard fallback is a plain list');

/* ─────────────────── adults are their own contact (#roster-contact) ─────── */

/**
 * 6. The bug this was written for: a college class where every student had an
 *    email on file reported "nobody has an address", because the bar opens on
 *    "Parents / guardians" and college students have none.
 */
const ensembles = [
  { id: 'symphony', collegeLevel: false },
  { id: 'college-chamber', collegeLevel: true },
] as Pick<Ensemble, 'id' | 'collegeLevel'>[];

const collegian = {
  id: 'c1', name: 'Rose, William F.', ensembleIds: ['symphony', 'college-chamber'], status: 'Active',
} as Student;
const teen = { id: 't1', name: 'Emily Block', ensembleIds: ['symphony'], status: 'Active' } as Student;

assert(isAdultStudent(collegian, ensembles), 'a college group makes an adult');
assert(!isAdultStudent(teen, ensembles), 'a high-school student is not an adult');
assert(isAdultStudent({ adult: true, ensembleIds: [] }, ensembles), 'the checkbox alone makes an adult');
assert(
  !isAdultStudent({ adult: false, ensembleIds: ['college-chamber'] }, ensembles),
  'an explicit false OVERRIDES the derivation — the director gets the last word',
);

const adultContacts: Record<string, StudentContact> = {
  c1: contact('c1', {
    email: 'william@mdc.edu',
    studentPhone: '(305) 555-0142',
    // Left on the record by an old import. It must never be written to.
    parentEmail: 'someone@family.test',
    phone: '305-555-0000',
    guardians: [{ name: 'Not A Parent', email: 'someone@family.test', phone: '305-555-0000' }],
  }),
};
for (const audience of ['guardians', 'students', 'both'] as const) {
  const r = rosterRecipients([collegian], adultContacts, audience, ensembles);
  assert(
    r.addresses.join() === 'william@mdc.edu',
    `an adult is reached at their OWN address on the "${audience}" audience, and nowhere else`,
  );
  assert(r.missing.length === 0, `an adult with an address is never "missing" on "${audience}"`);
  const p = rosterNumbers([collegian], adultContacts, audience, ensembles);
  assert(
    p.numbers.join() === '(305) 555-0142',
    `an adult's number is their own studentPhone on "${audience}", never the guardian mirror`,
  );
}

// Without the ensembles list nothing is derivable — the old behaviour, which
// every caller that has not been taught about groups still gets.
assert(
  rosterRecipients([collegian], adultContacts, 'guardians').addresses.join() === 'someone@family.test',
  'the ensembles argument is what makes adulthood visible; omitting it is the old behaviour',
);

/* ────────────────────────────── numbers and texts ───────────────────────── */

assert(isPhonish('305-555-0142') && isPhonish('+13055550142'), 'a real number is usable');
assert(!isPhonish('') && !isPhonish(undefined) && !isPhonish('n/a') && !isPhonish('555'),
  'blanks and junk are not numbers');

const teenContacts: Record<string, StudentContact> = {
  t1: contact('t1', {
    email: 'emily@student.test',
    studentPhone: '305-555-0101',
    parentEmail: 'mom@family.test',
    phone: '305-555-0199',
    guardians: [{ name: 'Ana Block', email: 'mom@family.test', phone: '(305) 555-0199' }],
  }),
};
assert(
  rosterNumbers([teen], teenContacts, 'students', ensembles).numbers.join() === '305-555-0101',
  'a minor on the students audience is their own number',
);
assert(
  rosterNumbers([teen], teenContacts, 'guardians', ensembles).numbers.join() === '305-555-0199',
  'a minor on the guardians audience is the family number, deduped across the mirror and the '
  + 'guardian entry even though they are punctuated differently',
);

const groupText = smsLink(
  rosterNumbers([teen, collegian], { ...teenContacts, ...adultContacts }, 'both', ensembles).numbers,
  'No class Friday',
);
assert(
  groupText === 'sms:3055550101,3055550199,3055550142?&body=No%20class%20Friday',
  `a group text is digits, comma-joined, with the iOS-and-Android body spelling (got ${groupText})`,
);
assert(smsLink([]) === null, 'no numbers means no link at all, rather than one that opens a blank text');
assert(copyNumbers(['(305) 555-0142']) === '3055550142', 'the clipboard fallback is dialable digits');

/* ───────────────────── a name in a list reads surname-first ─────────────── */

assert(lastFirst('Emily Block') === 'Block, Emily', 'a stored "First Last" flips');
assert(lastFirst('Rose, William F.') === 'Rose, William F.', 'a stored "Last, First" stays put');
assert(lastFirst('Prince') === 'Prince', 'a one-word name keeps all of itself');
assert(lastFirst('') === '', 'an empty name never throws');

console.log('rosterEmail.selfcheck: OK');
