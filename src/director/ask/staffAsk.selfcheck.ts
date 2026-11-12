/**
 * Self-check for Ask's understanding half, the staff side (#ask, design 3.8).
 * Run: npx tsx src/director/ask/staffAsk.selfcheck.ts
 * The public side has its own: src/shared/ask/ask.selfcheck.ts
 *
 * Every staff question in the corpus is parsed with the staff tables and
 * must land on the intent, the date and the named thing written beside it.
 * The run FAILS if any line is wrong with confidence, if a line is not right
 * and is not named in MAY_BE_NO_ANSWER, if a person's first name changes the
 * answer, or if a file in this folder imports anything but src/shared/ask/.
 */

import { fileURLToPath } from 'node:url';
import { ASK_CORPUS } from '../../shared/ask/corpus.ts';
import {
  FIRST_NAMES, NAMES, agrees, anyFailed, checkImports, fail, fill, runCorpus, show,
} from '../../shared/ask/askKit.selfcheck.ts';
import { parseStaffAsk } from './staffAsk.ts';

const ask = (q: string) => parseStaffAsk(q, NAMES);

/** Staff corpus lines that are allowed to get no answer. Every other line
 *  must be right. */
const MAY_BE_NO_ANSWER: string[] = [];

const staffCases = ASK_CORPUS.filter(c => c.who === 'staff');
runCorpus('Staff side', staffCases, ask, MAY_BE_NO_ANSWER);

// A person is left alone, whoever it is. "Where is sarah" is a question
// about a person even though a teacher is called Sarah, and "where is
// james" is not about the James K. Batten Room.
let moved = 0;
for (const name of FIRST_NAMES) {
  for (const c of staffCases.filter(x => x.q.includes('{classmate}'))) {
    const q = fill(c.q, name);
    const got = ask(q);
    if (!agrees(c, got)) { moved++; fail(`"${q}": wanted ${show(c)}, got ${show(got)}`); }
  }
}
console.log(`Staff questions a first name changed: ${moved} (must be 0)`);

// The staff rules come first, and must not swallow the questions staff
// share with everybody else.
const expect = (q: string, intent: string, when?: string) => {
  const got = ask(q);
  if (got.intent !== intent || got.when !== when) fail(`"${q}": wanted ${intent}${when ? ` ${when}` : ''}, got ${show(got)}`);
};
expect('call time', 'callTime', 'next');            // not "call somebody"
expect('whats tmrw', 'staffDay', 'tomorrow');
expect('is rehearsal cancelled', 'cancelled', 'today');
expect('what do i wear', 'dress', 'next');
expect('asdf', 'none');

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
