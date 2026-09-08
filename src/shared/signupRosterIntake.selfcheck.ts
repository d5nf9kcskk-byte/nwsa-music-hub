/**
 * Self-check for sign-up → roster intake (#signups).
 * Run: npx tsx src/shared/signupRosterIntake.selfcheck.ts
 *
 * The promises pinned here are the ones that would quietly damage a record if
 * they broke, and none of them is visible from the screen that calls this:
 *
 *   • An import never REMOVES an ensemble, and never blanks a field it has
 *     nothing to say about.
 *   • An ambiguous typed name resolves to nobody rather than to the wrong
 *     person — the one place this could overwrite a real student's record.
 *   • A contact's existing guardians survive; the signed-up one replaces the
 *     entry it matches rather than being added a second time.
 *   • Free-text answers land in `contacts.extra`, never on the `students` doc
 *     — that doc is mirrored to the world-readable `studentsPublic`.
 *   • Two responses from the same person make ONE student.
 *   • `status` and `schoolId` are never written from a response.
 */
import {
  COLLEGE_GRADE, COLLEGE_YEAR_GRADES, answerKey, collegeYearGrade, contactWrite, guardianQuestion,
  intakeSummary, looksLikeYearQuestion, matchStudent, nameKey, planRosterIntake, studentWrite,
  tidyName,
} from './signupRosterIntake.ts';
import type {
  SignupForm, SignupResponse, Student, StudentContact,
} from '../director/types.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const SYMPHONY = 'symphony-orchestra';
const CCO = 'college-chamber-orchestra';

const form: Pick<SignupForm, 'title' | 'questions'> = {
  title: 'College Student Information',
  questions: [
    { id: 'q1', label: 'Major', type: 'short' },
    { id: 'q2', label: 'Anything I should know?', type: 'long' },
  ],
};
const MAJOR = answerKey(form.title, 'Major');
const NOTE = answerKey(form.title, 'Anything I should know?');

const OPTS = { ensembleIds: [SYMPHONY, CCO], form };

function resp(over: Partial<SignupResponse>): SignupResponse {
  return {
    id: 'r1', formId: 'college-info', studentName: 'Ada Lovelace', grade: 'College',
    submittedAt: 1, status: 'submitted', ...over,
  };
}

function student(over: Partial<Student> & { id: string; name: string }): Student {
  return { ensembleIds: [], instrument: '', status: 'Active', ...over };
}

function value(rows: ReturnType<typeof planRosterIntake>, i: number, key: string): string {
  const f = rows[i].fields.find(x => x.key === key);
  if (!f) throw new Error(`no field ${key}`);
  return f.choice === 'incoming' ? f.incoming : f.current;
}

// ── name keys ──────────────────────────────────────────────────────────
assert(nameKey('  Ada   LOVELACE ') === 'ada lovelace', 'case and spacing');
assert(nameKey('Lovelace, Ada') === 'ada lovelace', '"Last, First" reorders');
assert(nameKey("O'Brien, Seán") === 'sen obrien', 'punctuation dropped');
assert(nameKey('   ') === '', 'blank name → no key');
assert(tidyName('Lovelace,  Ada') === 'Ada Lovelace', 'display name reorders');
assert(tidyName('diMaggio Rossi') === 'diMaggio Rossi', 'casing left alone');

// ── a new person, everything they typed ────────────────────────────────
{
  const r = resp({
    instrument: 'Viola', email: 'ada@example.edu', phone: '305-555-0134',
    guardianName: 'Anne Byron', guardianEmail: 'anne@example.com',
    answersJson: JSON.stringify({ q1: 'Music Education', q2: 'I read alto clef' }),
  });
  const rows = planRosterIntake([r], [], OPTS);
  assert(rows.length === 1 && rows[0].action === 'create', 'unknown name → create');
  assert(rows[0].fields.every(f => !f.conflict), 'a new student has nothing to conflict with');

  const s = studentWrite(rows[0], OPTS.ensembleIds);
  assert(s.name === 'Ada Lovelace', 'name tidied');
  assert(s.grade === COLLEGE_GRADE, 'stamped College');
  assert(s.instrument === 'Viola', 'instrument carried');
  assert(JSON.stringify(s.ensembleIds) === JSON.stringify([SYMPHONY, CCO]), 'joins both groups');
  assert(s.status === 'Active', 'new student is Active');
  assert(!('schoolId' in s), 'never writes a school ID from a response');
  // The student doc is mirrored to studentsPublic — nothing personal on it.
  for (const k of ['email', 'phone', 'guardians', 'extra', 'guardianName']) {
    assert(!(k in s), `${k} never reaches the students doc`);
  }

  const c = contactWrite(rows[0], undefined);
  assert(c?.email === 'ada@example.edu', 'student email → contacts');
  assert(c?.phone === '305-555-0134', 'phone → contacts');
  assert(c?.parentEmail === 'anne@example.com', 'guardian address mirrored to parentEmail');
  assert(c?.guardians?.length === 1 && c.guardians[0].name === 'Anne Byron', 'guardian recorded');
  assert(c?.extra?.[MAJOR] === 'Music Education', 'answer filed under its question');
  assert(c?.extra?.[NOTE] === 'I read alto clef', 'every answer kept');
}

// ── a response with nothing but a name writes no contact doc ───────────
{
  const rows = planRosterIntake([resp({})], [], OPTS);
  assert(contactWrite(rows[0], undefined) === null, 'no contact info → no contact write');
}

// ── someone already on the roster: fill blanks, flag conflicts ─────────
{
  const camerata = student({
    id: 's1', name: 'Ada Lovelace', ensembleIds: ['camerata'],
    instrument: 'Violin', grade: '12th',
  });
  const contacts: Record<string, StudentContact> = {
    s1: { id: 's1', email: 'old@example.edu', guardians: [{ name: 'Anne Byron', phone: '305-555-0100' }] },
  };
  const rows = planRosterIntake(
    [resp({
      instrument: 'Viola', email: 'ada.lovelace@example.edu', phone: '305-555-0134',
      guardianName: 'Anne Byron', guardianEmail: 'anne@example.com',
      answersJson: JSON.stringify({ q1: 'Music Education' }),
    })],
    [camerata],
    { ...OPTS, contacts },
  );
  assert(rows[0].action === 'update' && rows[0].match?.id === 's1', 'matched by name');

  const s = studentWrite(rows[0], OPTS.ensembleIds);
  const ids = s.ensembleIds as string[];
  assert(ids.includes('camerata'), 'existing ensemble is KEPT');
  assert(ids.includes(SYMPHONY) && ids.includes(CCO), 'new groups added');
  assert(s.grade === COLLEGE_GRADE, 'grade moves to College');
  assert(!('status' in s), 'status untouched on an existing student');
  assert(!('name' in s), 'never renames a student who is already on the roster');

  // Instrument: both sides say something and they differ → the director's call.
  const instrument = rows[0].fields.find(f => f.key === 'instrument')!;
  assert(instrument.conflict, 'Violin vs Viola is a conflict');
  assert(instrument.choice === 'current', 'a tie on length keeps what the roster says');
  assert(s.instrument === undefined, 'so nothing is written for it');
  assert(studentWrite(rows[0], OPTS.ensembleIds, { instrument: 'incoming' }).instrument === 'Viola',
    'flipping the choice writes the response value');

  // Email: the longer, fuller address is the default.
  const email = rows[0].fields.find(f => f.key === 'email')!;
  assert(email.conflict && email.choice === 'incoming', 'the fuller address wins by default');

  const c = contactWrite(rows[0], contacts.s1)!;
  assert(c.email === 'ada.lovelace@example.edu', 'chosen email written');
  assert(c.guardians?.length === 1, 'the same guardian is not added twice');
  assert(c.guardians?.[0].phone === '305-555-0100', "the guardian's existing phone survives");
  assert(c.guardians?.[0].email === 'anne@example.com', 'and gains the new address');
  assert(!('extra' in c) || c.extra?.[MAJOR] === 'Music Education', 'answers merged in');
}

// ── an existing guardian who is NOT the one signing stays ──────────────
{
  const s1 = student({ id: 's1', name: 'Ada Lovelace' });
  const contacts: Record<string, StudentContact> = {
    s1: { id: 's1', guardians: [{ name: 'William King', email: 'wk@example.com' }] },
  };
  const rows = planRosterIntake(
    [resp({ guardianName: 'Anne Byron', guardianEmail: 'anne@example.com' })],
    [s1],
    { ...OPTS, contacts },
  );
  assert(rows[0].fields.filter(f => f.key.startsWith('guardian')).every(f => !f.conflict),
    'a guardian is a person, never a conflicting value on the student');
  const c = contactWrite(rows[0], contacts.s1)!;
  assert(c.guardians?.length === 2, 'a second guardian is added, not substituted');
  assert(c.guardians?.some(g => g.name === 'William King'), 'the existing guardian survives');
  assert(c.parentEmail === 'wk@example.com', 'parentEmail keeps mirroring guardians[0]');
}

// ── a family with more than one guardian on the form ───────────────────
{
  const many: Pick<SignupForm, 'title' | 'questions'> = {
    title: 'College Student Information',
    questions: [
      { id: 'q1', label: "Mother's name", type: 'short' },
      { id: 'q2', label: "Mother's email", type: 'short' },
      { id: 'q3', label: 'Father — name', type: 'short' },
      { id: 'q4', label: 'Father cell phone', type: 'short' },
      { id: 'q5', label: 'Guardian 2 name', type: 'short' },
      { id: 'q6', label: 'Parent signature', type: 'short' },
      { id: 'q7', label: 'Major', type: 'short' },
    ],
  };
  const rows = planRosterIntake(
    [resp({
      guardianName: 'Anne Byron', guardianEmail: 'anne@example.com',
      answersJson: JSON.stringify({
        q1: 'Judith Blunt', q2: 'judith@example.com',
        q3: 'William King', q4: '305-555-0199',
        q5: 'Ralph Milbanke',
        q6: 'Anne Byron', q7: 'Music Education',
      }),
    })],
    [],
    { ensembleIds: [], form: many },
  );
  assert(rows[0].extraGuardians.length === 3, 'mother, father and a second guardian all read');
  const mother = rows[0].extraGuardians.find(g => g.relation === 'Mother');
  assert(mother?.name === 'Judith Blunt' && mother.email === 'judith@example.com',
    'two questions about one person make ONE guardian');
  const father = rows[0].extraGuardians.find(g => g.relation === 'Father');
  assert(father?.phone === '305-555-0199', 'a phone question lands on the phone');
  assert(rows[0].extraGuardians.some(g => g.relation === 'Guardian 2'), 'a numbered guardian is its own person');

  const c = contactWrite(rows[0], undefined)!;
  assert(c.guardians?.length === 4, 'the signer plus all three');
  assert(c.guardians?.[0].name === 'Anne Byron', 'the person who signed leads the list');
  assert(c.parentEmail === 'anne@example.com', 'parentEmail mirrors guardians[0]');

  // A consent line is not a contact detail, and an ordinary question is still
  // an ordinary answer.
  assert(!rows[0].extraGuardians.some(g => g.name === 'Anne Byron' && g.relation === 'Parent'),
    '"Parent signature" is not read as a guardian');
  assert(rows[0].answers[answerKey(many.title, 'Parent signature')] === 'Anne Byron',
    'and stays an answer');
  assert(rows[0].answers[answerKey(many.title, 'Major')] === 'Music Education', 'unrelated answers untouched');
  for (const label of ["Mother's name", 'Father cell phone']) {
    assert(!(answerKey(many.title, label) in rows[0].answers),
      `${label} left extra — it is a guardian detail now`);
  }
}

// ── the college YEAR is a grade, one per student ───────────────────────
{
  const withYear: Pick<SignupForm, 'title' | 'questions'> = {
    title: 'College Student Information',
    questions: [{ id: 'yr', label: 'What year are you in?', type: 'short' }],
  };
  const answer = (v: string) => JSON.stringify({ yr: v });
  const rows = planRosterIntake(
    [
      resp({ id: 'a', studentName: 'Ada Lovelace', answersJson: answer('Freshman') }),
      resp({ id: 'b', studentName: 'Ben Britten', answersJson: answer('2nd year') }),
      resp({ id: 'c', studentName: 'Cyd Charisse', answersJson: answer('JR') }),
      resp({ id: 'd', studentName: 'Dai Fujikura', answersJson: answer('Year 4') }),
      resp({ id: 'e', studentName: 'Eva Cassidy', answersJson: answer('transfer, not sure') }),
      resp({ id: 'f', studentName: 'Fay Wray', answersJson: answer('') }),
    ],
    [],
    { ensembleIds: [], form: withYear, yearQuestionId: 'yr' },
  );
  const grades = rows.map(r => studentWrite(r, []).grade);
  assert(grades[0] === 'College Freshman', 'Freshman');
  assert(grades[1] === 'College Sophomore', '"2nd year" is a sophomore');
  assert(grades[2] === 'College Junior', '"JR" is a junior');
  assert(grades[3] === 'College Senior', '"Year 4" is a senior');
  assert(grades[4] === COLLEGE_GRADE, 'an answer nobody anticipated falls back, never guesses');
  assert(grades[5] === COLLEGE_GRADE, 'and so does a blank');
  // Whatever they typed is still on the record — the fallback loses nothing.
  assert(rows[4].answers[answerKey(withYear.title, 'What year are you in?')] === 'transfer, not sure',
    'the raw answer is kept regardless');
  // One import, four different grades: the whole point.
  assert(new Set(grades).size === 5, 'the cohort does not share one grade');
  // Every college grade still reads as College, so the roster search that
  // finds the cohort keeps working.
  for (const g of COLLEGE_YEAR_GRADES) assert(g.startsWith(COLLEGE_GRADE), `${g} starts with College`);
  // And none of them trips the high-school branches.
  for (const g of COLLEGE_YEAR_GRADES) {
    assert(!g.startsWith('12') && !g.startsWith('9'), `${g} is not a high-school grade`);
  }
}

// ── reading the year out of what students actually type ────────────────
{
  const cases: [string, string | null][] = [
    ['freshman', 'College Freshman'], ['1st year', 'College Freshman'],
    ['First Year', 'College Freshman'], ['1', 'College Freshman'],
    ['Sophomore', 'College Sophomore'], ['soph', 'College Sophomore'],
    ['Year 2', 'College Sophomore'], ['2', 'College Sophomore'],
    ['junior', 'College Junior'], ['3rd year', 'College Junior'],
    ['senior', 'College Senior'], ['Sr.', 'College Senior'], ['4', 'College Senior'],
    ['', null], ['n/a', null], ['grad student', null],
  ];
  for (const [input, want] of cases) {
    assert(collegeYearGrade(input) === want, `"${input}" → ${want ?? 'null'}`);
  }
  assert(looksLikeYearQuestion('What year are you in?'), 'a year question is spotted');
  assert(looksLikeYearQuestion('College classification'), 'so is "classification"');
  assert(!looksLikeYearQuestion('What instrument do you play?'), 'an instrument question is not');
}

// ── a year the FIRST response left blank is filled by a later one ──────
{
  const withYear: Pick<SignupForm, 'title' | 'questions'> = {
    title: 'College Student Information',
    questions: [{ id: 'yr', label: 'What year are you in?', type: 'short' }],
  };
  const rows = planRosterIntake(
    [
      resp({ id: 'r1', answersJson: JSON.stringify({ yr: '' }) }),
      resp({ id: 'r2', answersJson: JSON.stringify({ yr: 'Sophomore' }) }),
    ],
    [],
    { ensembleIds: [], form: withYear, yearQuestionId: 'yr' },
  );
  assert(studentWrite(rows[0], []).grade === 'College Sophomore', 'the second send supplies the year');
}

// ── reading a question label ───────────────────────────────────────────
{
  assert(guardianQuestion("Mother's email")?.detail === 'email', 'email detail');
  assert(guardianQuestion('Parent 2 phone')?.person === 'Parent 2', 'numbered person');
  assert(guardianQuestion('Guardian relationship')?.detail === 'relation', 'relation detail');
  assert(guardianQuestion('Emergency contact name')?.person === 'Emergency contact', 'emergency contact');
  // Under-claims on purpose: a person with no detail, or a detail with no
  // person, is an ordinary answer.
  assert(guardianQuestion('Mother') === null, 'a person alone is not enough');
  assert(guardianQuestion('Your email') === null, 'a detail alone is not enough');
  assert(guardianQuestion('Parent consent') === null, 'consent is never a contact detail');
  assert(guardianQuestion('Guardian signature') === null, 'nor is a signature');
}

// ── the same guardian arriving twice is still one person ───────────────
{
  const dup: Pick<SignupForm, 'title' | 'questions'> = {
    title: 'College Student Information',
    questions: [{ id: 'q1', label: 'Parent name', type: 'short' }],
  };
  const rows = planRosterIntake(
    [resp({
      guardianName: 'Anne Byron', guardianEmail: 'anne@example.com',
      answersJson: JSON.stringify({ q1: 'Anne  BYRON' }),
    })],
    [],
    { ensembleIds: [], form: dup },
  );
  const c = contactWrite(rows[0], undefined)!;
  assert(c.guardians?.length === 1, 'the signature block and the question are the same person');
  assert(c.guardians?.[0].email === 'anne@example.com', 'and the details are pooled');
}

// ── an existing answer is only overwritten when it actually differs ────
{
  const s1 = student({ id: 's1', name: 'Ada Lovelace' });
  const contacts: Record<string, StudentContact> = {
    s1: { id: 's1', extra: { [MAJOR]: 'Undecided', 'Spreadsheet note': 'keep me' } },
  };
  const rows = planRosterIntake(
    [resp({ answersJson: JSON.stringify({ q1: 'Music Education' }) })],
    [s1],
    { ...OPTS, contacts },
  );
  assert(rows[0].answersOverwritten.includes(MAJOR), 'the screen is told which answer changes');
  const c = contactWrite(rows[0], contacts.s1)!;
  assert(c.extra?.['Spreadsheet note'] === 'keep me', 'unrelated extra keys survive');
  assert(c.extra?.[MAJOR] === 'Music Education', 'the newer answer wins');
}

// ── nothing left to do ─────────────────────────────────────────────────
{
  const done = student({
    id: 's1', name: 'Ada Lovelace', ensembleIds: [SYMPHONY, CCO],
    grade: COLLEGE_GRADE, instrument: 'Viola',
  });
  const rows = planRosterIntake([resp({ instrument: 'Viola' })], [done], OPTS);
  assert(rows[0].action === 'same', 're-import is a no-op');
  assert(Object.keys(studentWrite(rows[0], OPTS.ensembleIds)).length === 0, 'and writes nothing');
  assert(contactWrite(rows[0], undefined) === null, 'and no contact either');
}

// ── an ambiguous name never picks a victim ─────────────────────────────
{
  const twins = [
    student({ id: 's1', name: 'Ada Lovelace', ensembleIds: ['camerata'] }),
    student({ id: 's2', name: 'ada  lovelace', ensembleIds: ['jazz'] }),
  ];
  assert(matchStudent(resp({}), twins) === undefined, 'two matches → no match');
  assert(planRosterIntake([resp({})], twins, OPTS)[0].action === 'create',
    'ambiguity proposes a new student for a human to settle');
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
    [
      resp({ id: 'r1', email: 'ada@example.edu' }),
      resp({ id: 'r2', instrument: 'Cello', answersJson: JSON.stringify({ q1: 'Performance' }) }),
    ],
    [],
    OPTS,
  );
  assert(rows[0].action === 'create' && rows[1].action === 'same', 'the second response makes no second student');
  assert(value(rows, 0, 'instrument') === 'Cello', 'the later answer fills the blank');
  assert(value(rows, 0, 'email') === 'ada@example.edu', 'and leaves the earlier one alone');
  assert(rows[0].answers[answerKey(form.title, 'Major')] === 'Performance', 'later answers are picked up');
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
  const s = studentWrite(rows[0], []);
  assert(rows[0].action === 'create' && s.grade === '9th', 'grade is overridable');
  assert(JSON.stringify(s.ensembleIds) === '[]', 'no groups → empty list, not undefined');
}

// ── malformed answers never take the import down ───────────────────────
{
  const rows = planRosterIntake([resp({ answersJson: 'not json' })], [], OPTS);
  assert(Object.keys(rows[0].answers).length === 0, 'unparseable answers are simply absent');
}

console.log('signupRosterIntake.selfcheck: OK');
