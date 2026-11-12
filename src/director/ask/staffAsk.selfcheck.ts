/**
 * Self-check for Ask's understanding half, the staff side (#ask, design 3.8).
 * Run: npx tsx src/director/ask/staffAsk.selfcheck.ts
 * The public side has its own: src/shared/ask/ask.selfcheck.ts
 *
 * Every staff question in the corpus is parsed with the staff tables and
 * must do what its line says: answer, offer, or miss (`expect` in
 * corpus.ts). The run FAILS if any line is wrong with confidence, if a
 * person's first name changes an answer, if a staff rule fires on a word
 * with nothing to act on, if a precedence pair has no sentence in which
 * both intents really fire, or if a file in this folder imports anything
 * but src/shared/ask/.
 */

import { fileURLToPath } from 'node:url';
import { ASK_CORPUS } from '../../shared/ask/corpus.ts';
import { askIntentsFired, type AskParse } from '../../shared/ask/parse.ts';
import {
  CLASSMATE, FIRST_NAMES, NAMES, anyFailed, checkImports, fail, fill, judge, runCorpus, show,
} from '../../shared/ask/askKit.selfcheck.ts';
import { STAFF_SIDE, parseStaffAsk } from './staffAsk.ts';

const ask = (q: string) => parseStaffAsk(q, NAMES);
const said = (got: AskParse) =>
  got.confident ? show(got) : got.suggestions.length ? `suggestions: ${got.suggestions.map(show).join(' / ')}` : 'nothing';

const staffCases = ASK_CORPUS.filter(c => c.who === 'staff');
runCorpus('Staff side', staffCases, ask);

// A person is left alone, whoever it is, and comes back as typed. "Where is
// sarah" is a question about a person even though a teacher is called
// Sarah, and "where is james" is not about the James K. Batten Room.
let moved = 0;
for (const name of FIRST_NAMES) {
  for (const c of staffCases.filter(x => x.q.includes('{classmate}'))) {
    const got = ask(fill(c.q, name));
    if (judge(c, got, name) !== 'right') { moved++; fail(`"${fill(c.q, name)}": wanted ${show(c)}, got ${said(got)}`); }
    if (got.person !== name) { moved++; fail(`"${fill(c.q, name)}": the person should come back as "${name}", got "${got.person}"`); }
    if (got.match) { moved++; fail(`"${fill(c.q, name)}": a person matched a thing (${got.match.name})`); }
  }
}
console.log(`\nStaff questions a first name changed: ${moved} (must be 0)`);
if (ask(`where is ${CLASSMATE}`).person !== CLASSMATE.toLowerCase()) fail('a full name should come back whole');

// The staff rules must not swallow the questions staff share with everybody
// else, and must not fire on a word with nothing to act on.
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
for (const q of [
  'asdf', 'cancel', 'post', 'move', 'add', 'post office', 'cancel culture', 'parent night', 'missing rehearsal tomorrow',
  'call me', 'email parents', 'is rehearsal late today', 'what does zelda have today', 'email', 'new', 'take roll call',
  'the week after next', 'who was out last friday', 'where is the stapler', 'where is my coffee',
  'roster of the 1927 yankees', 'who is in today', 'camerata roster tomorrow', 'where do we meet', 'is my son at rehearsal', 'teacher email',
]) {
  const got = ask(q);
  if (got.confident) fail(`"${q}" should not be answered: ${show(got)}`);
}

// Every precedence pair is a real pair, with its reason.
for (const [winner, loser, example] of STAFF_SIDE.precedence) {
  const fired = askIntentsFired(example, NAMES, STAFF_SIDE);
  if (!fired.includes(winner) || !fired.includes(loser)) fail(`precedence ${winner} over ${loser}: "${example}" fires ${fired.join(', ') || 'nothing'}, not both`);
  if (ask(example).intent !== winner) fail(`precedence ${winner} over ${loser}: "${example}" came back ${said(ask(example))}`);
}

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
