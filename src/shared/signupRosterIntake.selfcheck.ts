/**
 * Self-check for sign-up → roster intake (#signups).
 * Run: npx tsx src/shared/signupRosterIntake.selfcheck.ts
 *
 * The promises pinned here are the ones that would quietly damage a roster if
 * they broke, and none of them is visible from the screen that calls this:
 *
 *   • An import never REMOVES an ensemble. The college intake adds Symphony
 *     and College Chamber; a student already in Camerata keeps Camerata.
 *   • An ambiguous typed name resolves to nobody rather than to the wrong
 *     person — the one place this could overwrite a real student's record.
 *   • Two responses from the same person make ONE student, because an open
 *     sign-up has no public update rule and a re-send is a second doc.
 *   • `status` and `schoolId` are never written from a response.
 */
import {
  COLLEGE_GRADE, intakeSummary, matchStudent, nameKey, planRosterIntake, tidyName,
} from './signupRosterIntake.ts';
import type { SignupResponse, Student } from '../director/types.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const SYMPHONY = 'symphony-orchestra';
const CCO = 'college-chamber-orchestra';
const OPTS = { ensembleIds: [SYMPHONY, CCO] };

function resp(over: Partial<SignupResponse>): SignupResponse {
  return {
    id: 'r1', formId: 'college-info', studentName: 'Ada Lovelace', grade: 'College',
    submittedAt: 1, status: 'submitted', ...over,
  };
}

function student(over: Partial<Student> & { id: string; name: string }): Student {
  return { ensembleIds: [], instrument: '', status: 'Active', ...over };
}

// ── name keys ──────────────────────────────────────────────────────────
assert(nameKey('  Ada   LOVELACE ') === 'ada lovelace', 'case and spacing');
assert(nameKey('Lovelace, Ada') === 'ada lovelace', '"Last, First" reorders');
assert(nameKey("O'Brien, Seán") === 'sen obrien', 'punctuation dropped');
assert(nameKey('   ') === '', 'blank name → no key');
assert(tidyName('Lovelace,  Ada') === 'Ada Lovelace', 'display name reorders');
assert(tidyName('diMaggio Rossi') === 'diMaggio Rossi', 'casing left alone');

// ── new people ─────────────────────────────────────────────────────────
{
  const rows = planRosterIntake([resp({ instrument: 'Viola' })], [], OPTS);
  assert(rows.length === 1 && rows[0].action === 'create', 'unknown name → create');
  const f = rows[0].fields;
  assert(f.name === 'Ada Lovelace', 'name tidied');
  assert(f.grade === COLLEGE_GRADE, 'stamped College');
  assert(f.instrument === 'Viola', 'instrument carried');
  assert(JSON.stringify(f.ensembleIds) === JSON.stringify([SYMPHONY, CCO]), 'joins both groups');
  assert(f.status === 'Active', 'new student is Active');
  assert(!('schoolId' in f), 'never writes a school ID from a response');
}

// ── someone already on the roster ──────────────────────────────────────
{
  const camerata = student({ id: 's1', name: 'Ada Lovelace', ensembleIds: ['camerata'], instrument: 'Violin', grade: '12th' });
  const rows = planRosterIntake([resp({ instrument: 'Viola' })], [camerata], OPTS);
  assert(rows[0].action === 'update' && rows[0].match?.id === 's1', 'matched by name');
  const ids = rows[0].fields.ensembleIds as string[];
  assert(ids.includes('camerata'), 'existing ensemble is KEPT');
  assert(ids.includes(SYMPHONY) && ids.includes(CCO), 'new groups added');
  assert(rows[0].fields.grade === COLLEGE_GRADE, 'grade moves to College');
  assert(rows[0].fields.instrument === undefined, "never overwrites the roster's instrument");
  assert(!('status' in rows[0].fields), 'status untouched on an existing student');
}

// ── nothing left to do ─────────────────────────────────────────────────
{
  const done = student({ id: 's1', name: 'Ada Lovelace', ensembleIds: [SYMPHONY, CCO], grade: COLLEGE_GRADE, instrument: 'Viola' });
  const rows = planRosterIntake([resp({ instrument: 'Viola' })], [done], OPTS);
  assert(rows[0].action === 'same' && Object.keys(rows[0].fields).length === 0, 're-import is a no-op');
}

// ── an ambiguous name never picks a victim ─────────────────────────────
{
  const twins = [
    student({ id: 's1', name: 'Ada Lovelace', ensembleIds: ['camerata'] }),
    student({ id: 's2', name: 'ada  lovelace', ensembleIds: ['jazz'] }),
  ];
  assert(matchStudent(resp({}), twins) === undefined, 'two matches → no match');
  const rows = planRosterIntake([resp({})], twins, OPTS);
  assert(rows[0].action === 'create', 'ambiguity proposes a new student for a human to settle');
}

// ── studentId wins when the sign-up had one ────────────────────────────
{
  const roster = [
    student({ id: 's1', name: 'Ada Lovelace' }),
    student({ id: 's2', name: 'Someone Else' }),
  ];
  assert(matchStudent(resp({ studentId: 's2', studentName: 'Ada Lovelace' }), roster)?.id === 's2', 'id beats name');
  // A stale id (the student was deleted) falls back to the name rather than
  // erroring out mid-import.
  assert(matchStudent(resp({ studentId: 'gone' }), roster)?.id === 's1', 'stale id falls back to name');
}

// ── one person, two responses ──────────────────────────────────────────
{
  const rows = planRosterIntake(
    [resp({ id: 'r1', instrument: '' }), resp({ id: 'r2', instrument: 'Cello' })],
    [],
    OPTS,
  );
  assert(rows[0].action === 'create' && rows[1].action === 'same', 'second response makes no second student');
  assert(rows[0].fields.instrument === 'Cello', 'the later answer fills the blank');
  assert(intakeSummary(rows).create === 1, 'summary counts one person, not two');
}

// ── a blank name is its own person every time, never folded together ───
{
  const rows = planRosterIntake([resp({ id: 'r1', studentName: '  ' }), resp({ id: 'r2', studentName: '' })], [], OPTS);
  assert(rows.every(r => r.action === 'create'), 'blank names are not the same person');
}

// ── no groups picked is still a legal import ───────────────────────────
{
  const rows = planRosterIntake([resp({})], [], { ensembleIds: [], grade: '9th' });
  assert(rows[0].action === 'create' && rows[0].fields.grade === '9th', 'grade is overridable');
  assert(JSON.stringify(rows[0].fields.ensembleIds) === '[]', 'no groups → empty list, not undefined');
}

console.log('signupRosterIntake.selfcheck: OK');
