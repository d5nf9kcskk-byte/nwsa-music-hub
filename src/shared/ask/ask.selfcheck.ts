/**
 * Self-check for Ask's understanding half, the public side (#ask).
 * Run: npx tsx src/shared/ask/ask.selfcheck.ts
 * The staff side has its own: src/director/ask/staffAsk.selfcheck.ts
 *
 * Ask has three outcomes: a confident answer, a "did you mean", or nothing
 * (the ordinary search results show). A miss costs nothing. A confident
 * wrong answer is the one thing that is not allowed, so most of this file
 * is about what must NOT be answered, and it checks CLASSES of question,
 * generated, rather than a list the parser could be fitted to.
 *
 * Four counts are printed for the corpus:
 *   right                  confident, and what the corpus says
 *   suggestion             not confident, something offered
 *   none                   not confident, nothing offered
 *   wrong with confidence  confident, and not what the corpus says
 *
 * The run FAILS if:
 *   - wrong with confidence is above zero
 *   - a corpus line does not do what it is marked to do (see `expect` in
 *     corpus.ts): answered, offered as a suggestion, or missed
 *   - a staff question is answered
 *   - a question about a named person is answered or offered anything,
 *     with any of 48 first names, in a `{classmate}` line or as a search topic
 *   - any generated question about a person's record, whereabouts or
 *     contact details is answered (subjects x predicates x word orders x
 *     English and Spanish), or any about the past
 *   - a hostile kit (pieces called Winter, Home, Help!; teachers called
 *     Price, Day, Long) changes or creates a confident answer
 *   - a date phrase the table cannot read in full is answered
 *   - a definition is given for a word the Hub's glossary does not hold
 *   - a PRECEDENCE pair has no sentence in which both intents really fire
 *   - a file in this folder imports anything but this folder and ../fuzzy.ts,
 *     or the parser mentions a staff intent
 *
 * The names it runs against are public ones only; see askKit.selfcheck.ts.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ASK_CORPUS } from './corpus.ts';
import {
  ASK_PRECEDENCE, ASK_TOPIC_TRIGGERS, askIntentsFired, parseAsk,
  type AskName, type AskParse,
} from './parse.ts';
import {
  CLASSMATE, FIRST_NAMES, HOSTILE, NAMES, anyFailed, checkImports, fail, fill, plain, runCorpus, show,
} from './askKit.selfcheck.ts';

const ask = (q: string) => parseAsk(q, NAMES);
const said = (got: AskParse) =>
  got.confident ? show(got) : got.suggestions.length ? `suggestions: ${got.suggestions.map(show).join(' / ')}` : 'nothing';

/** Must not be answered. A suggestion is allowed unless `bare` says not. */
const refuse = (q: string, why: string, bare = false) => {
  const got = ask(q);
  if (got.confident) fail(`"${q}" answered (${why}): ${show(got)}`);
  else if (bare && got.suggestions.length > 0) fail(`"${q}" was offered something (${why}): ${said(got)}`);
  return got;
};

/* ── The corpus ───────────────────────────────────────────────────────── */

const publicCases = ASK_CORPUS.filter(c => c.who !== 'staff');
const staffCases = ASK_CORPUS.filter(c => c.who === 'staff');
runCorpus('Public side', publicCases, ask);

// A staff question typed here gets no answer. The exception is a sentence
// that is ALSO a public line ("next concert"): the same words are a fair
// question from a student, and the public line above decides them.
const publicWords = new Set(publicCases.map(c => c.q));
let leaks = 0;
for (const c of staffCases) {
  const got = ask(fill(c.q));
  if (got.intent.startsWith('staff') || got.suggestions.some(s => s.intent.startsWith('staff'))) fail(`"${c.q}": a staff intent on the public side`);
  if (publicWords.has(c.q)) continue;
  if (got.confident) { leaks++; fail(`staff question "${c.q}" answered on the public side: ${show(got)}`); }
}
console.log(`\nStaff questions answered on the public side: ${leaks} (must be 0)`);

/* ── Somebody's name ──────────────────────────────────────────────────── */

// Every line with a person in it, public and staff alike, with each first
// name in turn. None may get an answer OR an offer: not a group, a room, a
// concert or a piece, and not the teacher who shares that first name.
const personLines = ASK_CORPUS.filter(c => c.q.includes('{classmate}'));
let named = 0;
for (const name of FIRST_NAMES) {
  for (const c of personLines) {
    const got = ask(fill(c.q, name));
    if (got.confident || got.suggestions.length > 0) { named++; fail(`"${fill(c.q, name)}": ${said(got)}`); }
  }
}
console.log(`Questions about a named person answered or offered anything: ${named} of ${FIRST_NAMES.length * personLines.length} (must be 0)`);

// A rule that carries a search topic lets the leftover words through, so it
// is where a person's name could slip in. A new topic rule with no shape
// here fails the run.
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
    if (ask(fill(shape, name)).confident) { topical++; fail(`"${fill(shape, name)}" answered`); }
  }
}
console.log(`Search topics that were a person, answered: ${topical} of ${(FIRST_NAMES.length + 1) * TOPIC_SHAPES.length} (must be 0)`);
for (const q of ['did anyone find a bass bow', 'has anyone seen my folder', 'who has stands and chairs duty', 'all state results']) {
  if (ask(q).intent !== 'news') fail(`"${q}" is a thing to search for and must be news, got ${said(ask(q))}`);
}

/* ── Records about a person: generated, not listed ────────────────────── */

// The refusal must not depend on word order, article or language. So the
// check does not hold a list of sentences: it builds every combination.
const SUBJECTS_EN = ['my son', 'my daughter', 'my kid', 'my child', 'my student', 'he', 'she', 'sarah', 'zelda quillfeather'];
const SUBJECTS_ES = ['mi hijo', 'mi hija', 'ella', 'sarah'];
const STATES_EN = [
  'at rehearsal', 'in rehearsal', 'in class', 'at school', 'at the concert', 'there', 'here', 'absent', 'late',
  'tardy', 'excused', 'present', 'in camerata', 'ok', 'behind',
];
const STATES_ES = ['en el ensayo', 'en clase', 'en la escuela', 'ausente', 'aqui', 'presente'];
const TAILS = ['', ' today', ' right now', '?'];
let records = 0;
let recordTotal = 0;
const record = (q: string) => { recordTotal++; if (ask(q).confident) { records++; fail(`"${q}" is about a person's record and was answered: ${show(ask(q))}`); } };
for (const s of SUBJECTS_EN) for (const p of STATES_EN) for (const t of TAILS) {
  for (const q of [`is ${s} ${p}${t}`, `${s} is ${p}${t}`, `${s} ${p}${t}`, `where is ${s}${t}`, `wheres ${s}${t}`, `${p} is ${s}${t}`, `was ${s} ${p}${t}`, `${s} was ${p}${t}`]) record(q);
}
for (const s of SUBJECTS_ES) for (const p of STATES_ES) for (const t of ['', ' hoy', '?']) {
  for (const q of [`esta ${s} ${p}${t}`, `${s} esta ${p}${t}`, `${s} ${p}${t}`, `donde esta ${s}${t}`, `estuvo ${s} ${p}${t}`]) record(q);
}
// What somebody DID. The how-to may be offered; an answer may not.
const DEEDS = [
  ['check in', 'checked in'], ['check out', 'checked out'], ['submit the video', 'submitted the video'],
  ['turn in the exam', 'turned in the exam'], ['turn it in', 'turned it in'], ['upload it', 'uploaded it'],
  ['miss rehearsal', 'missed rehearsal'], ['show up', 'showed up'], ['go to rehearsal', 'gone to rehearsal'],
  ['come to class', 'come to class'], ['pass', 'passed'], ['sign the form', 'signed the form'],
];
for (const s of SUBJECTS_EN) for (const [verb, done] of DEEDS) for (const t of ['', ' today', ' yesterday']) {
  for (const q of [`did ${s} ${verb}${t}`, `has ${s} ${done}${t}`, `${s} ${done}${t}?`, `${s} did ${verb}${t}?`]) record(q);
}
// Me, asking for my own roll.
for (const p of ['absent', 'late', 'tardy', 'excused', 'marked absent', 'marked late', 'present']) {
  for (const q of [`am i ${p}`, `am i ${p} today`, `was i ${p}`, `i was ${p}?`, `estoy ${p}`]) record(q);
}
// The past, about a group. What happened is a record too.
for (const q of [
  'did we have a concert', 'did we have rehearsal', 'did we have rehearsal yesterday', 'did the kids show up',
  'is the concert over', 'the concert is over?', 'is rehearsal over', 'was there rehearsal', 'was there a concert last night',
  'did rehearsal happen', 'how was the concert', 'how did the concert go', 'did camerata rehearse', 'who played last night',
  'what did we play yesterday', 'did symphony meet', 'had rehearsal started', 'has rehearsal started',
]) record(q);
// Contact details, of anybody, staff included.
const CONTACTS = ['address', 'phone', 'phone number', 'cell', 'email', 'number', 'direccion', 'telefono', 'correo'];
const WHOSE = ['gilman', 'dr gilman', 'cambage', 'sarah', 'zelda quillfeather', 'my teacher', 'the director', 'my son', 'her', 'his'];
for (const c of CONTACTS) for (const w of WHOSE) {
  for (const q of [`${w} ${c}`, `${c} ${w}`, `${c} for ${w}`, `${c} of ${w}`, `${c} de ${w}`, `whats ${w} ${c}`, `what is the ${c} for ${w}`]) record(q);
}
console.log(`Generated questions about a person's record, whereabouts or contact details, answered: ${records} of ${recordTotal} (must be 0)`);
// The same subjects may still ask about what is coming.
for (const [q, intent] of [
  ['what does my son have today', 'myDay'], ['does she have rehearsal saturday', 'myDay'], ['when is her lesson', 'lesson'],
  ['what should my daughter wear', 'dress'], ['what time does he need to be there', 'callTime'], ['my son is sick', 'howAbsence'],
  ['my daughter will be absent tomorrow', 'howAbsence'], ['is my son playing friday', 'myDay'],
] as const) {
  if (ask(q).intent !== intent) fail(`"${q}" is about what is coming and must be ${intent}, got ${said(ask(q))}`);
}
// A record question about one's own child may point at the how-to, as an offer.
if (!ask('did my son check in').suggestions.some(s => s.intent === 'howCheckin')) fail('"did my son check in" should offer the check-in page');

/* ── A hostile kit ────────────────────────────────────────────────────── */

// Titles and teachers made of the words people type for other reasons.
// Adding them must not change one confident answer, and must not create one
// where there was none: every such word is one word, or a person.
const hostile: readonly AskName[] = [...NAMES, ...HOSTILE];
const HOSTILE_SAID = [
  'i need help', 'help', 'help me', 'can you help', 'home', 'what time do i get home', 'can i go home', 'go home',
  'one', 'which one', 'the first one', 'winter', 'spring', 'march', 'is it spring yet', 'tonight', 'friday', 'late',
  'am i late', 'will it run late', 'away', 'black', 'do we wear black', 'lost', 'i lost my music', 'im lost',
  'time', 'what time', 'yesterday', 'changes', 'any changes', 'today', 'lunch', 'whats for lunch', 'office',
  'where is the office', 'front desk', 'parking', 'where do i park', 'price', 'ticket price', 'how much is the price',
  'what is price playing', 'where is price', 'is price here', 'long', 'how long is the concert', 'how long',
  'day', 'what day', 'what day is rehearsal', 'which day', 'parks', 'may', 'will', 'rose', 'april', 'grace',
  'where is day', 'when is long', 'long rehearsal', 'the lesson', 'my lesson', 'rehearsal', 'the show', 'show',
  'open house', 'family night', 'address update', 'my address', 'phone number change', 'take five', 'take a break',
  'night and day', 'day and night', 'song', 'fanfare for the common man', 'composition', 'business',
  'guitar', 'guitar lesson', 'percussion', 'office hours', 'what are office hours', 'when is lunch',
  'where is the bell', 'is bell cancelled', 'when is bell', 'where are the fields', 'is fields cancelled',
  'where is banks', 'is banks open today',
];
let fooled = 0;
const same = (a: AskParse, b: AskParse) => a.confident === b.confident && a.intent === b.intent && a.when === b.when && a.about === b.about;
for (const q of [...publicCases.map(c => fill(c.q)), ...HOSTILE_SAID]) {
  const plainKit = ask(q);
  const got = parseAsk(q, hostile);
  if (got.confident && !same(got, plainKit)) { fooled++; fail(`hostile kit: "${q}" became ${show(got)} (was ${said(plainKit)})`); }
}
console.log(`Confident answers the hostile kit changed or created: ${fooled} (must be 0)`);
// Not deaf either: a hostile thing asked for by its whole name is found.
for (const [q, name] of [['is composition cancelled', 'Composition'], ['when is office hours', 'Office Hours'], ['program notes for night and day', 'Night and Day']]) {
  const got = parseAsk(q, hostile);
  if (got.match?.name !== name) fail(`hostile kit: "${q}" should find ${name}, got ${said(got)}`);
}

/* ── Dates: read in full, or not at all ───────────────────────────────── */

for (const q of [
  'the week after next', 'rehearsal the week after next', 'the week of the concert', 'what do i have the week of the concert',
  'sat test', 'sat prep class', "we'd like tickets", 'wed like to know', 'nxt friday', 'upcoming friday', 'this coming friday',
  'do we have rehearsal next friday', 'feb 30', 'rehearsal 2/30', 'whats due 4/31', 'the day after the concert',
  'two weeks from friday', 'every friday', 'fridays', 'last friday', 'friday next week', 'end of the month',
  'the friday after thanksgiving', 'what is due before friday', 'rehearsal until friday', 'in two days', 'in 3 weeks',
  'later today', 'next month', 'first day of school', 'last day of school', 'the last concert', 'the first concert',
  'the day of the concert', 'monday through friday', 'do i have rehearsal today or tomorrow', 'que tengo pasado mañana',
  'what did we play yesterday', 'when is the sat', 'next to chapman', 'the room next to 4302',
]) refuse(q, 'a date phrase the table cannot read in full');

/* ── Definitions: only the glossary's own words ───────────────────────── */

for (const q of [
  'what does zelda mean', 'what is a zelda quillfeather', 'define sarah', 'what does phone number for sarah mean',
  'what is a fugue', 'what is a concert', 'whats a rehearsal', 'what is a lesson', 'define camerata',
  'what does gilman mean', 'que es un seccional', 'what is an absence', 'what does it mean',
]) refuse(q, 'not a word the glossary defines', true);

/* ── Traps that are not corpus lines ──────────────────────────────────── */

const expect = (q: string, wanted: { intent: string; when?: string; about?: string }) => {
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
expect('whats due feb 29', { intent: 'due', when: 'date:02-29' });
// Two numbers and a slash with no question about a day are not a date.
refuse('12/9', 'no question about a day');
refuse('is 6/8 hard', 'a time signature');
// The rest of the date table.
expect('la proxima semana', { intent: 'myDay', when: 'nextWeek' });
expect('tmr', { intent: 'myDay', when: 'tomorrow' });
expect('do i have rehearsal tonight', { intent: 'myDay', when: 'tonight' });
expect('el fin de semana', { intent: 'myDay', when: 'weekend' });
expect('hay ensayo el domingo', { intent: 'myDay', when: 'weekday:sun' });
expect('call time sat', { intent: 'callTime', when: 'weekday:sat' });        // "sat" last is the day
expect('is rehearsal at 3', { intent: 'myDay', when: 'today' });
expect('rehearsal saturday morning', { intent: 'myDay', when: 'weekday:sat' });
expect('mañana por la tarde', { intent: 'myDay', when: 'tomorrow' });
expect('what do i have on the 3rd', { intent: 'myDay', when: 'day:03' });
expect('15th of december', { intent: 'myDay', when: 'date:12-15' });
refuse('the 5th symphony', 'not the 5th of the month');
refuse('exam 2 may be late', 'not May 2');
// A short name the kit vouches for, in a question about that kind of thing.
expect('is camerata cancelled', { intent: 'cancelled', when: 'today', about: 'camerata string orchestra' });
expect('is WE cancelled', { intent: 'cancelled', when: 'today', about: 'wind ensemble' });
expect('do we have rehearsal', { intent: 'myDay', when: 'today' });          // "we", not Wind Ensemble
expect('is phil cancelled', { intent: 'cancelled', when: 'today', about: 'philharmonic' });
expect('wheres 4304', { intent: 'where', about: '4304' });
expect('are we in chapman', { intent: 'where', when: 'today', about: 'chapman' });
// The same names with no question around them are an offer, not an answer.
for (const q of ['camerata', 'symphony', '4302', 'Chapman', 'cco', 'dance']) {
  const got = refuse(q, 'a bare one-word name');
  if (got.suggestions.length !== 1) fail(`"${q}" should offer exactly the one thing it names, offered ${said(got)}`);
}
// One word out of a longer title, a surname, a typo, a number: offers.
for (const q of ['when is the nutcracker', 'where is the lyric', 'holberg part', 'gilman', 'tchaik 5', 'nutcraker', 'is camertaa cancelled', 'beethoven 7', 'fleischmann']) {
  const got = refuse(q, 'weak evidence for a name');
  if (got.suggestions.length === 0) fail(`"${q}" should offer what it might mean`);
}
// A person on a thing is found by surname and only ever offered, even when
// that surname is on one thing only and the question has a shape.
for (const q of ['where is pena', 'is marcano cancelled', 'when is albornoz', 'what is andai playing', 'is gasior cancelled today']) {
  refuse(q, 'a surname alone');
}
// A whole name, or two distinctive words of one, is believed with no question.
expect('wind ensemble', { intent: 'group', about: 'wind ensemble' });
expect('lincoln portrait', { intent: 'piece', about: 'lincoln portrait' });
expect('jazz combos concert', { intent: 'concert', about: 'jazz combos' });
expect('chamber music', { intent: 'group', about: 'chamber music' });       // "music" is part of the name
expect('form and analysis', { intent: 'group', about: 'form & analysis' }); // so is "form"
expect('when is jazz combo', { intent: 'myDay', when: 'next', about: 'jazz combo' });
// Words that are not frame, so nothing may skip them.
for (const q of [
  'show me my schedule', 'what time do we show up', 'how do i sign in', 'sign out my son', 'can i sit out today',
  'how do i get there', 'calendar this week', 'whats on my calendar', 'i need a break', 'can i play in symphony',
  'can i wear jeans', 'what if i miss the concert', 'is the exam late if i send it tonight', 'what is the concert about',
  'whats up', 'what time does school start', 'can i practice in 4304', 'how many concerts', 'camerata students',
  'change rehearsal to 3pm', 'is camerata cancelled for zelda', 'where is the free concert', 'ill be there',
  'what do we do after the concert', 'rehearsal with gilman', 'who do i ask about seating',
]) refuse(q, 'a word nothing accounts for');
// Two questions in one sentence: neither is answered, both are offered.
for (const [q, a, b] of [
  ['is there school on black friday', 'noSchool', 'dress'], ['pick up my part', 'pickup', 'parts'],
  ['where do we change', 'where', 'cancelled'], ['do i have rehearsal over break', '', ''],
  ['holiday schedule', 'noSchool', 'myDay'], ['is there a form for the concert', 'forms', 'concert'],
] as const) {
  const got = refuse(q, 'two different questions');
  for (const i of [a, b]) if (i && !got.suggestions.some(s => s.intent === i)) fail(`"${q}" should offer ${i}; ${said(got)}`);
}
// A pasted page is not answered from its first line.
refuse('what do i have today '.repeat(40), 'longer than a question', true);
expect('', { intent: 'none' });
expect('???', { intent: 'none' });

/* ── The shape of what comes back ─────────────────────────────────────── */

for (const c of ASK_CORPUS) {
  const q = fill(c.q);
  const got = ask(q);
  // Pure: the same words give the same answer, and the names are not touched
  // (the lists are frozen, so a write would have thrown).
  if (JSON.stringify(got) !== JSON.stringify(ask(q))) fail(`"${c.q}" parsed differently the second time`);
  for (const r of [got, ...got.suggestions]) {
    // `about` is clean: the matched thing's own name, never scraps of the sentence.
    if (r.match && r.about !== r.match.name) fail(`"${c.q}": about "${r.about}" is not the matched name "${r.match.name}"`);
    if (r.person) fail(`"${c.q}": a person on the public side`);
  }
  if (!got.confident && got.intent !== 'none') fail(`"${c.q}": not confident must mean intent none`);
}
if (ask('is camerata cancelled').match?.name !== 'Camerata String Orchestra') fail('"camerata" must hand back the one group it names');

/* ── Precedence: every pair is a real pair, with its reason ───────────── */

for (const [winner, loser, example] of ASK_PRECEDENCE) {
  const fired = askIntentsFired(example, NAMES);
  if (!fired.includes(winner) || !fired.includes(loser)) fail(`precedence ${winner} over ${loser}: "${example}" fires ${fired.join(', ') || 'nothing'}, not both`);
  const got = ask(example);
  if (got.intent !== winner) fail(`precedence ${winner} over ${loser}: "${example}" came back ${said(got)}`);
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
for (const file of ['parse.ts', 'givenNames.ts', 'commonWords.ts']) {
  const src = readFileSync(new URL(file, here), 'utf8');
  const hits = [...src.matchAll(/['"`]staff\w*['"`]/g)].map(m => m[0]);
  if (hits.some(h => h !== "'staff'")) fail(`${file} names a staff intent (${hits.join(', ')}); those belong in src/director/ask/`);
}

if (anyFailed()) {
  console.error('\nask.selfcheck FAILED');
  process.exit(1);
}
console.log('\nask.selfcheck passed');
