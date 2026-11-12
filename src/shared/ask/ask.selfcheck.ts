/**
 * Self-check for Ask's understanding half, the public side (#ask).
 * Run: npx tsx src/shared/ask/ask.selfcheck.ts
 * The staff side has its own: src/director/ask/staffAsk.selfcheck.ts
 *
 * Every public question in corpus.ts is parsed and must land on the intent,
 * the date and the named thing written beside it. Three counts are printed:
 *   right                  what the corpus says
 *   no answer              the parser said it was not sure
 *   wrong with confidence  it answered, and the answer was not the corpus's
 *
 * The run FAILS if:
 *   - wrong with confidence is above zero
 *   - a line is not right and is not named in MAY_BE_NO_ANSWER below
 *   - a line the corpus marks `answer: 'none'` gets an answer
 *   - a staff question gets an answer
 *   - any `{classmate}` line gets an answer with any of 48 first names in it
 *   - a rule that carries a search topic answers with a person as the topic,
 *     or has no shape in TOPIC_SHAPES
 *   - right is under 95% of the public lines
 *   - a file in this folder imports anything but this folder and ../fuzzy.ts,
 *     or the parser mentions a staff intent
 *
 * The names it runs against are public ones only; see askKit.selfcheck.ts.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ASK_CORPUS } from './corpus.ts';
import { ASK_TOPIC_TRIGGERS, parseAsk, type AskName, type AskParse } from './parse.ts';
import {
  CLASSMATE, FIRST_NAMES, NAMES, anyFailed, checkImports, fail, fill, plain, runCorpus, show,
} from './askKit.selfcheck.ts';

const ask = (q: string) => parseAsk(q, NAMES);

/** Public corpus lines that are allowed to get no answer. Every other line
 *  must be right. Keep it short, and give each one its reason. */
const MAY_BE_NO_ANSWER: string[] = [];

/* ── The corpus ───────────────────────────────────────────────────────── */

const publicCases = ASK_CORPUS.filter(c => c.who !== 'staff');
const staffCases = ASK_CORPUS.filter(c => c.who === 'staff');

const pub = runCorpus('Public side', publicCases, ask, MAY_BE_NO_ANSWER);
const share = pub.right.length / publicCases.length;
console.log(`\nPublic right: ${(share * 100).toFixed(1)}% (must be 95% or more)`);
if (share < 0.95) fail(`public right is ${(share * 100).toFixed(1)}%, under 95%`);

// The honest no: a line the corpus refuses must be refused.
for (const c of ASK_CORPUS.filter(x => x.answer === 'none')) {
  const got = ask(fill(c.q));
  if (got.intent !== 'none') fail(`"${c.q}" must get no answer, got ${show(got)}`);
}

// A staff question typed here gets no answer. The exception is a sentence
// that is ALSO a public line ("next concert"): the same words are a fair
// question from a student, and the public line above decides them.
const publicWords = new Set(publicCases.map(c => c.q));
let leaks = 0;
for (const c of staffCases) {
  const got = ask(fill(c.q));
  if (got.intent.startsWith('staff')) fail(`"${c.q}": a staff intent on the public side`);
  if (publicWords.has(c.q)) continue;
  if (got.intent !== 'none') { leaks++; fail(`staff question "${c.q}" answered on the public side: ${show(got)}`); }
}
console.log(`Staff questions answered on the public side: ${leaks} (must be 0)`);

/* ── Somebody's name ──────────────────────────────────────────────────── */

// Every line with a person in it, public and staff alike, with each first
// name in turn. None may get an answer: not as a group, a room, a concert
// or a piece, and not as the teacher who shares that first name.
const personLines = ASK_CORPUS.filter(c => c.q.includes('{classmate}'));
let named = 0;
for (const name of FIRST_NAMES) {
  for (const c of personLines) {
    const q = fill(c.q, name);
    const got = ask(q);
    if (got.intent !== 'none') { named++; fail(`"${q}" answered: ${show(got)}`); }
  }
}
console.log(`Questions about a named person answered: ${named} of ${FIRST_NAMES.length * personLines.length} (must be 0)`);

// A rule that carries a search topic ("did anyone find ...", "... results")
// lets the leftover words through, so it is where a person's name could
// slip in. Every such rule is tried with a person where the topic goes,
// every first name and the made-up full name alike. A new topic rule with
// no shape here fails the run.
const TOPIC_SHAPES = [
  'results for {classmate}', '{classmate} results', 'did anyone find {classmate}', 'did anyone see {classmate}',
  'has anyone seen {classmate}', 'has anyone found {classmate}', 'does {classmate} have duty',
  'is {classmate} on duty', '{classmate} duty', 'lost and found {classmate}',
];
for (const re of ASK_TOPIC_TRIGGERS) {
  if (!TOPIC_SHAPES.some(q => re.test(plain(fill(q))))) fail(`a topic rule (${re.source.slice(0, 40)}...) has no shape in TOPIC_SHAPES`);
}
let topical = 0;
for (const name of [...FIRST_NAMES, CLASSMATE]) {
  for (const shape of TOPIC_SHAPES) {
    const q = fill(shape, name);
    const got = ask(q);
    if (got.intent !== 'none') { topical++; fail(`"${q}" answered: ${show(got)}`); }
  }
}
console.log(`Search topics that were a person, answered: ${topical} of ${(FIRST_NAMES.length + 1) * TOPIC_SHAPES.length} (must be 0)`);
// A thing still gets through.
for (const q of ['did anyone find a bass bow', 'has anyone seen my folder', 'who has stands and chairs duty', 'all state results']) {
  if (ask(q).intent !== 'news') fail(`"${q}" is a thing to search for and must be news, got ${show(ask(q))}`);
}

/* ── Traps that are not corpus lines ──────────────────────────────────── */

const expect = (q: string, wanted: Partial<AskParse>) => {
  const got = ask(q);
  for (const k of ['intent', 'when'] as const) {
    if (got[k] !== wanted[k]) fail(`"${q}": ${k} is ${got[k]}, wanted ${wanted[k]}`);
  }
  if (wanted.about && !(got.about && plain(got.about).includes(plain(wanted.about)))) {
    fail(`"${q}": about is ${got.about}, wanted ${wanted.about}`);
  }
};

// A month in a title is not a date, and midnight is not a time.
expect('radetzky march', { intent: 'piece', about: 'radetzky' });
expect('midnight ball', { intent: 'concert', about: 'midnight ball' });
// A date with a number in it, both ways round, in both languages.
expect('whats on the program 12/9', { intent: 'playing', when: 'date:12-09' });
expect('que tocamos el 9 de diciembre', { intent: 'playing', when: 'date:12-09' });
expect('do i have rehearsal nov 16', { intent: 'myDay', when: 'date:11-16' });
expect('que hay el 16/11', { intent: 'myDay', when: 'date:11-16' });
// Two numbers and a slash with no question about a day are not a date.
expect('12/9', { intent: 'none' });
expect('is 6/8 hard', { intent: 'none' });
// The rest of the date table.
expect('la proxima semana', { intent: 'myDay', when: 'nextWeek' });
expect('tmr', { intent: 'myDay', when: 'tomorrow' });
expect('do i have rehearsal tonight', { intent: 'myDay', when: 'tonight' });
expect('el fin de semana', { intent: 'myDay', when: 'weekend' });
expect('hay ensayo el domingo', { intent: 'myDay', when: 'weekday:sun' });
// Two days in one question, or a day there is no word for: not sure.
expect('do i have rehearsal today or tomorrow', { intent: 'none' });
expect('que tengo pasado mañana', { intent: 'none' });
expect('what did we play yesterday', { intent: 'none' });
expect('do we have rehearsal next friday', { intent: 'none' });
expect('when is the sat', { intent: 'none' });               // the test, not Saturday
expect('what chair am i sat in', { intent: 'seat' });
// Short forms come from a table. Initials of two letters count only when
// typed as capitals, because "we" is also a word.
expect('is WE cancelled', { intent: 'cancelled', when: 'today', about: 'wind ensemble' });
expect('do we have rehearsal', { intent: 'myDay', when: 'today' });
expect('do we have symph thursday', { intent: 'myDay', when: 'weekday:thu', about: 'symphony' });
expect('the Lyric', { intent: 'concert', about: 'lyric' });
expect('4302', { intent: 'where', about: '4302' });
expect('Chapman', { intent: 'where', about: 'chapman' });
// A loose beginning is not a short form.
expect('where is the free concert', { intent: 'none' });     // not "Freedom Tower"
expect('is there a show today', { intent: 'concert', when: 'today' });  // not "Showcase"
// One typo is forgiven; a word that is nobody's name is not skipped over.
expect('is camertaa cancelled', { intent: 'cancelled', when: 'today', about: 'camerata' });
expect('is camerata cancelled for zelda', { intent: 'none' });
expect('what is grace playing', { intent: 'none' });         // five letters is too short to call a typo of "grade"
expect('', { intent: 'none' });
expect('???', { intent: 'none' });
// A first name beside the rest of the title is the title.
expect('carmen suite', { intent: 'piece', about: 'carmen suite' });
expect('souvenir de florence', { intent: 'group', about: 'souvenir de florence' });
// People on a thing are found by surname, never by first name.
expect('gilman', { intent: 'group', about: 'gilman' });
expect('beethoven 7', { intent: 'piece', about: 'symphony 7' });
expect('grant', { intent: 'none' });
// Words that look like part of a name and are not.
expect('whats up', { intent: 'none' });                      // "up" is in "Sign-Up"
expect('what time does school start', { intent: 'none' });   // "school" is in "High School Choir"
expect('can i practice in 4304', { intent: 'none' });        // asking for a room, not for repertoire
expect('how many concerts', { intent: 'none' });
expect('camerata students', { intent: 'none' });             // a second name is a stray word
expect('change rehearsal to 3pm', { intent: 'none' });       // a director's command
expect('whens the next show', { intent: 'concert', when: 'next' });
expect('when is 9th grade theory', { intent: 'myDay', when: 'next', about: '9th grade' });
// A word that picks an intent is not a question word when it is part of the name.
expect('chamber music', { intent: 'group', about: 'chamber music' });
expect('form and analysis', { intent: 'group', about: 'form & analysis' });
expect('pops concert', { intent: 'concert', about: 'pops' });
// "ill" is "I'll" unless something says sick.
expect('im ill', { intent: 'howAbsence', when: 'today' });
expect('my son is ill today', { intent: 'howAbsence', when: 'today' });


// Found by the second review. A typo is forgiven only on a long word, only
// past its first letter, and never on a word that is something else first.
expect('nutcraker', { intent: 'concert', about: 'nutcracker' });
expect('simphony', { intent: 'group', about: 'symphony' });
expect('fleischmann', { intent: 'group', about: 'fleischman' });   // a long surname, one letter over
expect('when is the fall concert', { intent: 'concert', about: 'fall' });
expect('is the theater open', { intent: 'none' });
expect('where is the dance theater', { intent: 'where', about: 'dance theater' });  // two words settle it
expect('where is dance', { intent: 'where', when: 'next', about: 'dance' });        // the class, by its whole name
// The past, and other people's records, however they are asked.
for (const q of [
  'is my daughter late', 'has he been absent', 'did she go to rehearsal', 'how is my son doing',
  'what did my son get on the exam', 'test results', 'whats his email', 'were we late', 'how was rehearsal',
]) expect(q, { intent: 'none' });
expect('my son is absent today', { intent: 'howAbsence', when: 'today' });    // a report, not a question
// A clock time or a time of day beside a day says nothing more than the day.
expect('is rehearsal at 3', { intent: 'myDay', when: 'today' });
expect('rehearsal saturday morning', { intent: 'myDay', when: 'weekday:sat' });
expect('mañana por la tarde', { intent: 'myDay', when: 'tomorrow' });
expect('what do i have on the 3rd', { intent: 'myDay', when: 'day:03' });
expect('15th of december', { intent: 'myDay', when: 'date:12-15' });
expect('the 5th symphony', { intent: 'none' });               // not the 5th of the month
expect('exam 2 may be late', { intent: 'none' });             // not May 2
expect('march', { intent: 'none' });                          // the month or a piece: no telling
expect('black', { intent: 'dress', when: 'next' });
expect('black box', { intent: 'where', about: 'black box' });
expect('call', { intent: 'callTime', when: 'next' });
expect('lyric address', { intent: 'concert', about: 'lyric' });
expect('the address', { intent: 'none' });
// The reviewer's list had a piece called "October" and one with "night" in
// it. Ours has neither, so they are added here.
const more: AskName[] = [...NAMES, { kind: 'piece', name: 'October' }, { kind: 'piece', name: 'Night on Bald Mountain' }];
const withMore = (q: string, intent: string, when?: string) => {
  const got = parseAsk(q, more);
  if (got.intent !== intent || got.when !== when) fail(`"${q}" (with two more pieces): wanted ${intent}${when ? ` ${when}` : ''}, got ${show(got)}`);
};
withMore('concerts in october', 'concert', 'month:10');
withMore('concert friday night', 'concert', 'weekday:fri');
withMore('october', 'piece');                                 // its whole name
withMore('night', 'none');
withMore('night on bald mountain', 'piece');
// A pasted page is cut off, not read.
const t0 = performance.now();
if (ask('what do i have today '.repeat(2500)).intent !== 'none' && performance.now() - t0 > 50) fail('a 50,000 character question took too long');

// Exactly one name gives the caller its own record back; several do not.
if (ask('camerata').match?.name !== 'Camerata String Orchestra') fail('"camerata" must hand back the one group it names');
if (ask('when is theory').match) fail('"theory" fits several classes, so no single match');

// Pure: the same words give the same answer, and the names are not touched
// (the list is frozen, so a write would have thrown).
for (const c of ASK_CORPUS) {
  const q = fill(c.q);
  if (JSON.stringify(ask(q)) !== JSON.stringify(ask(q))) fail(`"${c.q}" parsed differently the second time`);
}

/* ── The boundary (design 3.7 and 3.8) ────────────────────────────────── */

// An allowlist, not a blocklist: this folder and ../fuzzy.ts, nothing else.
const here = new URL('.', import.meta.url);
const folder = fileURLToPath(here);
const fuzzy = fileURLToPath(new URL('../fuzzy.ts', here));
checkImports(here, path => path.startsWith(folder) || path === fuzzy,
  'src/shared/ask/ may import only its own files and src/shared/fuzzy.ts');

// The public bundle carries no staff phrasing. The staff tables live in
// src/director/ask/; the only staff word allowed here is the one guard.
for (const file of ['parse.ts', 'givenNames.ts']) {
  const src = readFileSync(new URL(file, here), 'utf8');
  const hits = [...src.matchAll(/['"`]staff\w*['"`]/g)].map(m => m[0]);
  if (hits.some(h => h !== "'staff'")) fail(`${file} names a staff intent (${hits.join(', ')}); those belong in src/director/ask/`);
}

if (anyFailed()) {
  console.error('\nask.selfcheck FAILED');
  process.exit(1);
}
console.log('\nask.selfcheck passed');
