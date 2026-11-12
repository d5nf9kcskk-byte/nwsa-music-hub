/**
 * Self-check for Ask's understanding half, the staff side (#ask, design 3.8).
 * Run: npx tsx src/director/ask/staffAsk.selfcheck.ts
 * The public side has its own: src/shared/ask/ask.selfcheck.ts
 *
 * Every staff question in the corpus is parsed with the staff tables and
 * must do what its line says: answer, offer, or miss (`expect` in
 * corpus.ts). A confident staff answer comes only from a whole-sentence
 * template, the same as on the public side.
 *
 * A person is answered about only when the name is on the roster the caller
 * passes in. The roster here is made up (PEOPLE in the kit).
 *
 * The run FAILS if any line is wrong with confidence; if a person's name
 * changes an answer, lands in `about`, or matches a thing; if a word that
 * is not on the roster is taken for a person; if a "my own child" template
 * answers on the staff side; if a staff template's own sample is not
 * answered as it says, or is still answered with one more word put in at
 * any position; or if a file in this folder imports anything but
 * src/shared/ask/.
 */

import { fileURLToPath } from 'node:url';
import { ASK_CORPUS } from '../../shared/ask/corpus.ts';
import { askTemplateReadings, type AskParse } from '../../shared/ask/parse.ts';
import { isSlotName } from '../../shared/ask/templates.ts';
import {
  CLASSMATE, FIRST_NAMES, NAMES, PEOPLE, anyFailed, checkImports, fail, fill, judge, runCorpus, show,
} from '../../shared/ask/askKit.selfcheck.ts';
import { STAFF_SIDE, parseStaffAsk } from './staffAsk.ts';

const said = (got: AskParse) =>
  got.confident ? show(got) : got.suggestions.length ? `suggestions: ${got.suggestions.map(show).join(' / ')}` : 'nothing';
/** Every parse goes through here: a typed name is never in `about`. */
const ask = (q: string, people: readonly string[] | null = PEOPLE) => {
  const got = parseStaffAsk(q, NAMES, people ?? undefined);
  for (const r of [got, ...got.suggestions]) {
    if (r.person && r.about && r.about.includes(r.person)) fail(`"${q}": the person is in about ("${r.about}")`);
    if (r.match && r.about !== r.match.name) fail(`"${q}": about "${r.about}" is not the matched name`);
  }
  return got;
};

const staffCases = ASK_CORPUS.filter(c => c.who === 'staff');
runCorpus('Staff side', staffCases, ask);

// A person is left alone, whoever it is, and comes back as typed in
// `person`. "Where is sarah" is a question about a person even though a
// teacher is called Sarah, and "where is james" is not about a room.
let moved = 0;
for (const name of FIRST_NAMES) {
  for (const c of staffCases.filter(x => x.q.includes('{classmate}'))) {
    // The name under test is on the roster for this call, with a made-up surname.
    const got = ask(fill(c.q, name), [`${name} Exampleton`]);
    if (judge(c, got, name) !== 'right') { moved++; fail(`"${fill(c.q, name)}": wanted ${show(c)}, got ${said(got)}`); }
    if (got.person !== name) { moved++; fail(`"${fill(c.q, name)}": the person should come back as "${name}", got "${got.person}"`); }
    if (got.match || got.about) { moved++; fail(`"${fill(c.q, name)}": a person matched a thing or reached about (${got.about})`); }
  }
}
console.log(`\nStaff questions a first name changed: ${moved} (must be 0)`);
if (ask(`where is ${CLASSMATE}`).person !== CLASSMATE.toLowerCase()) fail('a full name should come back whole');
// The roster may hold names either way round ("Last, First M.").
if (ask('where is ottoline pembrook').intent !== 'staffWhereIs') fail('a roster name written "Last, First" should still be found');
if (ask('is okonkwo here today').person !== 'okonkwo') fail('one word of a roster name is enough');
// A name that is not on the roster is a guess by shape: offered with the
// name, never answered. The same with no roster passed at all.
for (const [q, people] of [['where is ignatius blackwood', PEOPLE], [`where is ${CLASSMATE}`, null], ['is sarah here today', null]] as const) {
  const got = ask(q, people);
  if (got.confident) fail(`"${q}" names nobody on the roster and was answered: ${show(got)}`);
  if (!got.suggestions.some(s => s.person)) fail(`"${q}" should be offered with the name as typed; ${said(got)}`);
}
// A name in another script is a name.
if (parseStaffAsk('where is 李娜', NAMES, ['李娜 Wang']).person !== '李娜') fail('a roster name in another script should be found');

const expect = (q: string, intent: string, when?: string) => {
  const got = ask(q);
  if (got.intent !== intent || got.when !== when) fail(`"${q}": wanted ${intent}${when ? ` ${when}` : ''}, got ${said(got)}`);
};
expect('call time', 'callTime', 'next');            // not "call somebody"
expect('what time is call', 'callTime', 'next');
expect('whats tmrw', 'staffDay', 'tomorrow');
expect('is rehearsal cancelled', 'cancelled', 'today');
expect('what do i wear', 'dress', 'next');
expect('who is in wind ensemble', 'staffRoster');      // from staff, the roster
// The date stays on a question about the past.
expect(`was ${CLASSMATE} absent yesterday`, 'staffWhosOut', 'yesterday');
expect('who was out last week', 'staffWhosOut', 'lastWeek');
// A pronoun, an article or a thing is not a person, and a staff verb with
// nothing to act on is not a question.
for (const q of [
  'asdf', 'cancel', 'post', 'move', 'add', 'post office', 'cancel culture', 'parent night', 'missing rehearsal tomorrow',
  'call me', 'email parents', 'is rehearsal late today', 'what does zelda have today', 'email', 'new', 'take roll call',
  'the week after next', 'who was out last friday', 'where is the stapler', 'where is my coffee',
  'roster of the 1927 yankees', 'who is in today', 'camerata roster tomorrow', 'where do we meet', 'is my son at rehearsal',
  'teacher email', 'where is him', 'where is her', 'is she here', 'where is he', 'was he absent', 'where is it',
  'where is camerata parents', 'excuse me from the concert', 'call them', 'where is everyone',
  // The code-reading review's: an everyday word, a verb or more of the sentence taken as the name.
  'where is bathroom', 'where is himself', 'is whoever here today', 'where is zelda sitting', 'was zelda marked absent',
  'email mom', 'cancel parents', 'excuse dad', 'call parents', 'call dad', 'call roll', 'where is 李娜 class',
  // "My own child" is a parent's question. Staff have no "he".
  'what does he have today', 'her schedule', 'when is his lesson', 'what does my son have today', 'is she playing friday',
]) {
  const got = ask(q);
  if (got.confident && (got.intent.startsWith('staff') || got.person || /\b(?:he|she|his|her|son)\b/.test(q))) fail(`"${q}" should not be answered: ${show(got)}`);
}

// The staff templates, tried the same way as the public ones.
const SLOT_WORDS: Record<string, string> = {
  DATE: 'tomorrow', GROUP: 'wind ensemble', EVENT: 'midnight ball', ROOM: 'wolfson auditorium', FORM: 'orchestra assistant interview',
  TASK: 'camerata playing exam 2', PERSON: 'zelda quillfeather', INSTRS: 'cellos', DAY: 'tomorrow', EVENTW: 'pops',
};
const slotWord = (w: string) => (isSlotName(w) ? SLOT_WORDS[w.replace(/[+!]$/, '')] : w);
let unreached = 0;
let leaky = 0;
let leakyTotal = 0;
for (const c of STAFF_SIDE.templates) {
  for (const sample of c.samples) {
    const words = sample.words.map(slotWord);
    const q = words.join(' ');
    const readings = askTemplateReadings(q, NAMES, { ...STAFF_SIDE, people: PEOPLE });
    const got = ask(q);
    if (readings.length !== 1 || got.intent !== c.src.intent) { unreached++; fail(`template "${c.src.t}": its sample "${q}" came back ${said(got)}`); }
    // One more word put in, at every position. None is on the roster, so
    // beside a name it cannot be more of the name.
    for (const extra of ['because', 'him', 'bathroom', 'sitting', 'zzyzx', '李娜']) {
      for (let at = 0; at <= words.length; at++) {
        const broken = [...words.slice(0, at), extra, ...words.slice(at)].join(' ');
        leakyTotal++;
        const g = ask(broken);
        if (g.confident) { leaky++; fail(`template "${c.src.t}": "${broken}" still answered: ${show(g)}`); }
      }
    }
  }
}
console.log(`Staff templates: ${STAFF_SIDE.templates.length}. Samples not answered as their template says: ${unreached} (must be 0)`);
console.log(`A staff sample with one more word put in, still answered: ${leaky} of ${leakyTotal} (must be 0)`);

// This folder reads Ask through src/shared/ask/ and nothing else.
const here = new URL('.', import.meta.url);
const folder = fileURLToPath(here);
const shared = fileURLToPath(new URL('../../shared/ask/', here));
checkImports(here, path => path.startsWith(folder) || path.startsWith(shared),
  'src/director/ask/ may import only its own files and src/shared/ask/');

if (anyFailed()) {
  console.error('\nstaffAsk.selfcheck FAILED');
  process.exit(1);
}
console.log('\nstaffAsk.selfcheck passed');
