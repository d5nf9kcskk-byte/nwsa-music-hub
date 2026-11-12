/**
 * Self-check for Ask's understanding half, the public side (#ask).
 * Run: npx tsx src/shared/ask/ask.selfcheck.ts
 * The staff side has its own: src/director/ask/staffAsk.selfcheck.ts
 *
 * Ask has three outcomes: a confident answer, a "did you mean", or nothing
 * (the ordinary search results show). A confident answer comes ONLY from a
 * whole-sentence template (templates.ts); the keyword engine may only offer.
 * A miss costs nothing. A confident wrong answer is the one thing that is
 * not allowed, so most of this file is about what must NOT be answered, and
 * it checks CLASSES of question, generated, rather than a list the parser
 * could be fitted to.
 *
 * Four counts are printed for the corpus:
 *   right                  confident, and what the corpus says
 *   suggestion             not confident, something offered
 *   none                   not confident, nothing offered
 *   wrong with confidence  confident, and not what the corpus says
 *
 * The run FAILS if:
 *   - wrong with confidence is above zero
 *   - a corpus line does not do what it is marked to do (`expect` in corpus.ts)
 *   - a staff question is answered
 *   - a question about a named person is answered or offered anything
 *   - any generated question about a person's record, whereabouts or
 *     contact details is answered. The generator crosses every subject it
 *     can think of (pronouns in every case, kin words, a first name, a full
 *     name, a short group name, Spanish el and la, a typo of "son", and NO
 *     subject at all) with states, deeds and word orders in both languages
 *   - a template still answers with one unknown word put in at any position,
 *     or with its "I" or "my" swapped for somebody else
 *   - a template's own sample sentence is not answered as that template says
 *   - `about` ever carries a word that was typed and is not a name from the
 *     kit or a word from a fixed table
 *   - a hostile kit (pieces called Winter, Home, Help!; teachers called
 *     Price, Day, Long) changes or creates a confident answer
 *   - a date phrase the table cannot read in full is answered
 *   - a definition is given for a word the Hub's glossary does not hold
 *   - a file in this folder imports anything but this folder and ../fuzzy.ts,
 *     or the parser mentions a staff intent
 *
 * It also REPORTS (does not fail on) any sentence two templates read
 * differently: that is the only conflict rule, and such a sentence is
 * simply not answered.
 *
 * The names it runs against are public ones only; see askKit.selfcheck.ts.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ASK_CORPUS } from './corpus.ts';
import { askTemplateReadings, parseAsk, type AskName, type AskParse, type AskReading } from './parse.ts';
import { MACROS, PUBLIC_TEMPLATES, compileTemplates, isSlotName } from './templates.ts';
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
// "Right" above counts a refusal that was meant to be one. This is the
// honest share: of the lines that WANT an answer, how many get a confident one.
const fair = publicCases.filter(c => c.intent !== 'none');
const answered = fair.filter(c => ask(fill(c.q)).confident).length;
console.log(`  confident share       ${answered} of the ${fair.length} lines that want an answer (${(answered / fair.length * 100).toFixed(0)}%); ${answered} of all ${publicCases.length} (${(answered / publicCases.length * 100).toFixed(0)}%)`);

// A staff question typed here gets no answer. The exception is a sentence
// that is ALSO a public line ("next concert").
const publicWords = new Set(publicCases.map(c => c.q));
let leaks = 0;
for (const c of staffCases) {
  const got = ask(fill(c.q));
  if (got.intent.startsWith('staff') || got.suggestions.some(s => s.intent.startsWith('staff'))) fail(`"${c.q}": a staff intent on the public side`);
  if (publicWords.has(c.q)) continue;
  if (got.confident) { leaks++; fail(`staff question "${c.q}" answered on the public side: ${show(got)}`); }
}
console.log(`\nStaff questions answered on the public side: ${leaks} (must be 0)`);

/* ── What `about` may hold ────────────────────────────────────────────── */

// A name from the kit, or a word from a fixed table. Never a typed word.
// The fixed words are read out of the templates themselves ({...} groups)
// plus the keyword engine's own closed terms.
const TABLE = new Set<string>();
for (const t of PUBLIC_TEMPLATES) {
  for (const m of t.t.matchAll(/\{([^}]*)\}/g)) {
    for (const alt of m[1].split('|')) for (const w of (MACROS[alt.trim()] ?? alt).split('|')) TABLE.add(w.trim());
  }
}
for (const w of ('playing exams|exams|exam|tests|test|quiz|quizzes|examen|examenes|study guides|study guide|scale|librarian|mdc|' +
  'grading period|vacaciones|sectionals|seccionales|masterclasses|' + MACROS.SEASONS + '|' + MACROS.BREAKS).split('|')) TABLE.add(w);
let typed = 0;
const cleanAbout = (q: string, kit: readonly AskName[], r: AskReading) => {
  if (!r.about) return;
  if (r.match ? r.about === r.match.name && kit.includes(r.match) : TABLE.has(r.about)) return;
  typed++;
  fail(`"${q}": about "${r.about}" is neither a kit name nor a fixed word`);
};
/** Every parse in this file goes through here, so the rule is checked on all of them. */
const look = (q: string, kit: readonly AskName[] = NAMES) => {
  const got = parseAsk(q, kit);
  for (const r of [got, ...got.suggestions]) {
    cleanAbout(q, kit, r);
    if (r.person) fail(`"${q}": a person on the public side`);
  }
  if (!got.confident && got.intent !== 'none') fail(`"${q}": not confident must mean intent none`);
  if (got.confident && got.suggestions.length > 0) fail(`"${q}": a confident answer carries no suggestions`);
  return got;
};
for (const c of ASK_CORPUS) {
  const q = fill(c.q);
  // Pure: the same words give the same answer, and the names are not touched
  // (the lists are frozen, so a write would have thrown).
  if (JSON.stringify(look(q)) !== JSON.stringify(look(q))) fail(`"${c.q}" parsed differently the second time`);
}

/* ── Somebody's name ──────────────────────────────────────────────────── */

// Every line with a person in it, public and staff alike, with each first
// name in turn. None may get an answer OR an offer.
const personLines = ASK_CORPUS.filter(c => c.q.includes('{classmate}'));
let named = 0;
for (const name of FIRST_NAMES) {
  for (const c of personLines) {
    const got = look(fill(c.q, name));
    if (got.confident || got.suggestions.length > 0) { named++; fail(`"${fill(c.q, name)}": ${said(got)}`); }
  }
}
console.log(`Questions about a named person answered or offered anything: ${named} of ${FIRST_NAMES.length * personLines.length} (must be 0)`);

/* ── Records about a person: generated, not listed ────────────────────── */

// The refusal must not depend on who the subject is, the word order, an
// article or the language. Confident answers come only from templates, and
// no template has a where-is, is-at, did, has or state position for
// anybody but a schedule question about a parent's own child. This proves
// it over every subject the reviewers used and more.
const SUBJECTS = [
  // kin
  'my son', 'my daughter', 'my kid', 'my child', 'my student', 'my kids', 'my brother', 'my sister', 'my friend',
  'son', 'daughter', 'kid', 'the kid', 'that boy', 'my sno', 'sno', 'my soon', 'my dauhgter',
  // pronouns, every case
  'he', 'she', 'they', 'him', 'her', 'them', 'his', 'their', 'you', 'u', 'it', 'someone', 'anyone', 'everyone',
  // names: a first name, a full one, a name that is a frame word, a name that is a short group name or a title word
  'sarah', 'zelda quillfeather', 'al', 'will', 'may', 'cam', 'phil', 'so', 'carmen', 'james', 'gilman', 'dr gilman',
  // Spanish
  'mi hijo', 'mi hija', 'el', 'la', 'ella', 'ellos', 'su hijo',
  // names no Latin-letter table knows, and short names that are also little words
  '李娜', 'Иван', '🐻', 'An', 'Ân', 'My', 'Mỹ', 'Su', 'Sú', 'Do', 'He', 'La', 'El', 'Una', 'Mi',
  // nobody at all
  '',
];
const STATES = [
  'at rehearsal', 'in rehearsal', 'in class', 'at school', 'at the concert', 'there', 'here', 'absent', 'late',
  'tardy', 'excused', 'present', 'in camerata', 'ok', 'behind', 'sick', 'ill', 'part of symphony', 'a part of camerata',
  'en el ensayo', 'en clase', 'en la escuela', 'ausente', 'aqui', 'presente', 'enfermo',
];
const DEEDS = [
  ['check in', 'checked in'], ['check out', 'checked out'], ['submit the video', 'submitted the video'],
  ['turn in the exam', 'turned in the exam'], ['turn it in', 'turned it in'], ['upload it', 'uploaded it'],
  ['miss rehearsal', 'missed rehearsal'], ['show up', 'showed up'], ['go to rehearsal', 'gone to rehearsal'],
  ['come to class', 'come to class'], ['pass', 'passed'], ['sign the form', 'signed the form'],
];
const CONTACTS = ['address', 'phone', 'phone number', 'cell', 'email', 'number', 'direccion', 'telefono', 'correo'];
const squash = (q: string) => q.replace(/\s+/g, ' ').trim();
let records = 0;
let recordTotal = 0;
const record = (raw: string) => {
  const q = squash(raw);
  if (!q) return;
  recordTotal++;
  const got = look(q);
  if (got.confident) { records++; if (records <= 40) fail(`"${q}" is about a person and was answered: ${show(got)}`); }
};
for (const s of SUBJECTS) {
  for (const p of STATES) for (const t of ['', ' today', ' right now', '?']) {
    for (const q of [
      `is ${s} ${p}${t}`, `${s} is ${p}${t}`, `${s} ${p}${t}`, `${p} is ${s}${t}`, `was ${s} ${p}${t}`, `${s} was ${p}${t}`,
      `esta ${s} ${p}${t}`, `${s} esta ${p}${t}`, `estuvo ${s} ${p}${t}`, `are ${s} ${p}${t}`,
    ]) record(q);
  }
  for (const t of ['', ' today', ' right now', ' hoy']) {
    for (const q of [`where is ${s}${t}`, `wheres ${s}${t}`, `donde esta ${s}${t}`, `where did ${s} go${t}`, `wheres ${s} at${t}`]) record(q);
    // Has anybody seen them: not a lost-and-found question.
    for (const q of [`has anyone seen ${s}${t}`, `did anyone see ${s}${t}`, `anyone seen ${s}${t}`, `did anyone find ${s}${t}`]) record(q);
  }
  // What somebody did.
  for (const [verb, done] of DEEDS) for (const t of ['', ' today', ' yesterday']) {
    for (const q of [`did ${s} ${verb}${t}`, `has ${s} ${done}${t}`, `${s} ${done}${t}?`, `${s} did ${verb}${t}?`]) record(q);
  }
  // A definition with the rest of the sentence unread.
  for (const q of [`what does pull out mean for ${s}`, `what is a sub for ${s}`, `define downbeat for ${s}`, `what does call time mean ${s}`]) {
    if (s) record(q);
  }
  // Contact details, of anybody.
  for (const c of CONTACTS) {
    for (const q of [`${s} ${c}`, `${c} ${s}`, `${c} for ${s}`, `${c} of ${s}`, `${c} de ${s}`, `what is ${s} ${c}`, `what is the ${c} for ${s}`]) {
      if (s) record(q);
    }
  }
}
// Me, asking for my own roll or whether I did something.
for (const p of ['absent', 'late', 'tardy', 'excused', 'marked absent', 'marked late', 'present']) {
  for (const q of [`am i ${p}`, `am i ${p} today`, `was i ${p}`, `i was ${p}?`, `estoy ${p}`]) record(q);
}
for (const q of ['did i submit my video', 'did my video upload', 'did i check in', 'did my check in count', 'have i turned in the exam']) record(q);
// The past, about a group.
for (const q of [
  'did we have a concert', 'did we have rehearsal', 'did we have rehearsal yesterday', 'did the kids show up',
  'is the concert over', 'the concert is over?', 'is rehearsal over', 'was there rehearsal', 'was there a concert last night',
  'did rehearsal happen', 'how was the concert', 'how did the concert go', 'did camerata rehearse', 'who played last night',
  'what did we play yesterday', 'did symphony meet', 'had rehearsal started', 'has rehearsal started',
]) record(q);
console.log(`Generated questions about a person's record, whereabouts or contact details, answered: ${records} of ${recordTotal} (must be 0)`);
// The same subjects may still ask about what is coming.
for (const [q, intent] of [
  ['what does my son have today', 'myDay'], ['does she have rehearsal saturday', 'myDay'], ['when is her lesson', 'lesson'],
  ['what should my daughter wear', 'dress'], ['what time does he need to be there', 'callTime'],
  ['my daughter will be absent tomorrow', 'howAbsence'], ['is my son playing friday', 'myDay'],
  ['how do i report my son absent', 'howAbsence'], ['my son cant come tomorrow', 'howAbsence'],
] as const) {
  if (look(q).intent !== intent) fail(`"${q}" is about what is coming and must be ${intent}, got ${said(ask(q))}`);
}

/* ── The templates themselves ─────────────────────────────────────────── */

// Each template is tried three ways. Its own sample must be answered as it
// says. The sample with one unknown word put in, at every position, must
// not be answered: there are no ignorable words. And the sample with its
// "I" or "my" swapped for somebody else must not be answered, unless that
// somebody is a parent's own child in a schedule question.
const SLOT_WORDS: Record<string, string> = {
  DATE: 'tomorrow', GROUP: 'wind ensemble', EVENT: 'midnight ball', PIECE: 'lincoln portrait', VENUE: 'southwood middle school',
  ROOM: 'wolfson auditorium', PLACE: 'wolfson auditorium', FORM: 'orchestra assistant interview', TASK: 'camerata playing exam 2',
  TERM: 'downbeat', DEADLINE: 'by tomorrow', DAY: 'tomorrow', EVENTW: 'pops',
};
const slotWord = (w: string) => (isSlotName(w) ? SLOT_WORDS[w.replace(/[+!]$/, '')] : w);
const NOT_ME = [
  'him', 'her', 'them', 'his', 'their', 'you', 'u', 'he', 'she', 'they', 'al', 'cam', 'phil', 'el', 'la', 'ella', 'sno',
  'sarah', 'zelda', 'gilman', 'my son', 'my daughter', 'mi hijo',
];
/** Where "my" was, these are not people at all: "when is the rehearsal". */
const ARTICLES = new Set(['el', 'la']);
const MY_WORDS = new Set(MACROS.MY.split('|'));
/** What a parent may ask about their own child: schedule and logistics. */
const LOGISTICS = new Set(['myDay', 'lesson', 'due', 'dress', 'callTime', 'pickup', 'concert', 'cancelled', 'howAbsence', 'required', 'where']);
const KIN_WORDS = new Set([...MACROS.KIN.split('|'), ...MACROS.KINS.split('|'), ...MACROS.KINO.split('|')]);
// A template with a position for a parent's own child is about schedule or
// logistics, and never asks where the child IS, what they did or how they are.
for (const t of PUBLIC_TEMPLATES) {
  if (!/\b(?:KIN|KINS|MYKIN|KINO)\b/.test(t.t)) continue;
  if (!LOGISTICS.has(t.intent)) fail(`template "${t.t}" has a child in it and is ${t.intent}: only schedule and logistics may`);
  if (/where is \[?[^\]]*\bKIN(?!S)|\b(?:is|are|was|were) \[?[^\]]*\bKINO?\b[^\]]*\]? (?:at|in|here|there|absent|late|ok|sick)|\b(?:did|has|was|were) \[?[^\]]*\bKIN(?!S)/.test(t.t)) {
    fail(`template "${t.t}" asks where a child is, what they did or how they are`);
  }
}
const compiled = compileTemplates(PUBLIC_TEMPLATES);
let unreached = 0;
let leaky = 0;
let leakyTotal = 0;
let swapped = 0;
let swappedTotal = 0;
const twoWays: string[] = [];
for (const c of compiled) {
  for (const sample of c.samples) {
    const words = sample.words.map(slotWord);
    const q = words.join(' ');
    const readings = askTemplateReadings(q, NAMES);
    if (readings.length > 1) twoWays.push(`"${q}": ${readings.map(show).join(' | ')}`);
    const got = look(q);
    if (readings.length === 1 && got.intent !== c.src.intent) { unreached++; fail(`template "${c.src.t}": its sample "${q}" came back ${said(got)}`); }
    // A one-word sample may be a word that is not a question by itself
    // ("seat"); the template's longer sample ("my seat") is the reachable one.
    if (readings.length === 0 && words.length === 1 && c.samples.length > 1) continue;
    if (readings.length === 0) { unreached++; fail(`template "${c.src.t}": its sample "${q}" matches no template`); }
    // One unknown word, at every position.
    for (const extra of ['zzyzx', 'sarah', 'him', '李娜', 'An', 'Mỹ', 'WE']) {
      for (let at = 0; at <= words.length; at++) {
        const broken = [...words.slice(0, at), extra, ...words.slice(at)].join(' ');
        leakyTotal++;
        const g = look(broken);
        if (g.confident) { leaky++; if (leaky <= 25) fail(`template "${c.src.t}": "${broken}" still answered: ${show(g)}`); }
      }
    }
    // Somebody else where "I" or "my" was.
    sample.self.forEach((self, at) => {
      if (!self) return;
      for (const who of NOT_ME) {
        if (ARTICLES.has(who) && MY_WORDS.has(words[at])) continue;
        const other = [...words.slice(0, at), who, ...words.slice(at + 1)].join(' ');
        swappedTotal++;
        const g = look(other);
        if (!g.confident) continue;
        if (KIN_WORDS.has(who) && LOGISTICS.has(g.intent)) continue;
        swapped++;
        if (swapped <= 25) fail(`template "${c.src.t}": "${other}" answered for somebody who is not me: ${show(g)}`);
      }
    });
  }
}
console.log(`Templates: ${compiled.length}. Samples not answered as their template says: ${unreached} (must be 0)`);
console.log(`A template sample with one unknown word put in, still answered: ${leaky} of ${leakyTotal} (must be 0)`);
console.log(`A template sample with "I" or "my" swapped for somebody else, answered: ${swapped} of ${swappedTotal} (must be 0)`);
console.log(`\`about\` holding a typed word: ${typed} (must be 0)`);
// Reported, not failed: two templates that read one sentence differently.
for (const c of ASK_CORPUS.filter(x => x.who !== 'staff')) {
  const readings = askTemplateReadings(fill(c.q), NAMES);
  if (readings.length > 1) twoWays.push(`"${c.q}": ${readings.map(show).join(' | ')}`);
}
console.log(`Sentences two templates read differently (not answered): ${twoWays.length}`);
for (const line of twoWays) console.log(`  ${line}`);

/* ── A hostile kit ────────────────────────────────────────────────────── */

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
  'where is banks', 'is banks open today', 'when is home', 'what time is home', 'when is one', 'what time is the show',
  'when is time', 'when is the lesson', 'what time is rehearsal', 'when is winter', 'what time is go home',
  'when is night and day', 'what time is family night', 'lost part', 'recording of rehearsal',
  'program notes for spring', 'my lost part', 'who wrote home', 'recording of one',
];
let fooled = 0;
const same = (a: AskParse, b: AskParse) => a.confident === b.confident && a.intent === b.intent && a.when === b.when && a.about === b.about;
for (const q of [...publicCases.map(c => fill(c.q)), ...HOSTILE_SAID]) {
  const plainKit = ask(q);
  const got = look(q, hostile);
  if (got.confident && !same(got, plainKit)) { fooled++; fail(`hostile kit: "${q}" became ${show(got)} (was ${said(plainKit)})`); }
}
console.log(`Confident answers the hostile kit changed or created: ${fooled} (must be 0)`);
// Not deaf either: a hostile thing is found where the template names its kind.
for (const [q, name] of [['is composition cancelled', 'Composition'], ['program notes for night and day', 'Night and Day'], ['who wrote take five', 'Take Five']]) {
  const got = look(q, hostile);
  if (got.match?.name !== name) fail(`hostile kit: "${q}" should find ${name}, got ${said(got)}`);
}

/* ── Dates: read in full, or not at all ───────────────────────────────── */

for (const q of [
  'the week after next', 'rehearsal the week after next', 'the week of the concert', 'what do i have the week of the concert',
  'sat test', 'sat prep class', "we'd like tickets", 'wed like to know', 'nxt friday', 'upcoming friday',
  'do we have rehearsal next friday', 'feb 30', 'rehearsal 2/30', 'whats due 4/31', 'the day after the concert',
  'two weeks from friday', 'every friday', 'fridays', 'last friday', 'friday next week', 'end of the month',
  'the friday after thanksgiving', 'what is due before friday', 'rehearsal until friday', 'in two days', 'in 3 weeks',
  'next month', 'first day of school', 'last day of school', 'the last concert', 'the first concert',
  'the day of the concert', 'monday through friday', 'do i have rehearsal today or tomorrow', 'que tengo pasado mañana',
  'what did we play yesterday', 'when is the sat', 'next to chapman', 'the room next to 4302',
  'what do i have 11/12/13', 'rehearsal 12/9/2025', 'concert dec 9 2026', 'concerts in the spring',
  'what is happening in the fall', 'que tengo el viernes que viene',
  // A slash pair is a date only where a date is announced.
  'what are we playing in 6/8', 'is the sectional in 6/8', '12/9', '2/4', 'what is 4/4', '3/4 time', 'is 6/8 hard',
  'do we rehearse 24/7', 'rehearsal 24/7', 'next weekend', 'what do i have next weekend', 'the weekend after next',
  'are we playing the 5th', 'the 5th symphony', 'exam 2 may be late', 'is there rehearsal the 20th',
]) refuse(q, 'a date phrase the table cannot read in full');

/* ── Definitions: only the glossary's own words ───────────────────────── */

for (const q of [
  'what does zelda mean', 'what is a zelda quillfeather', 'define sarah', 'what does phone number for sarah mean',
  'what is a fugue', 'what is a concert', 'whats a rehearsal', 'what is a lesson', 'define camerata',
  'what does gilman mean', 'que es un seccional', 'what is an absence', 'what does it mean',
  'what does pull out mean for sarah', 'what does call time mean for my son', 'define downbeat please sarah',
]) refuse(q, 'not a word the glossary defines, or more than the definition asked');

/* ── Traps that are not corpus lines ──────────────────────────────────── */

const expect = (q: string, wanted: { intent: string; when?: string; about?: string }) => {
  const got = look(q);
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
expect('whats on the program on 12/9', { intent: 'playing', when: 'date:12-09' });
expect('que tocamos el 9 de diciembre', { intent: 'playing', when: 'date:12-09' });
expect('do i have rehearsal nov 16', { intent: 'myDay', when: 'date:11-16' });
expect('que hay el 16/11', { intent: 'myDay', when: 'date:11-16' });
expect('whats due feb 29', { intent: 'due', when: 'date:02-29' });
// The rest of the date table.
expect('la proxima semana', { intent: 'myDay', when: 'nextWeek' });
expect('tmr', { intent: 'myDay', when: 'tomorrow' });
expect('do i have rehearsal tonight', { intent: 'myDay', when: 'tonight' });
expect('el fin de semana', { intent: 'myDay', when: 'weekend' });
expect('hay ensayo el domingo', { intent: 'myDay', when: 'weekday:sun' });
expect('call time sat', { intent: 'callTime', when: 'weekday:sat' });        // "sat" last is the day
expect('rehearsal saturday morning', { intent: 'myDay', when: 'weekday:sat' });
expect('mañana por la tarde', { intent: 'myDay', when: 'tomorrow' });
expect('what do i have on the 3rd', { intent: 'myDay', when: 'day:03' });
expect('15th of december', { intent: 'myDay', when: 'date:12-15' });
// A short name the kit vouches for, four letters or more and not a first
// name, in a question about that kind of thing.
expect('is camerata cancelled', { intent: 'cancelled', when: 'today', about: 'camerata string orchestra' });
expect('do we have rehearsal', { intent: 'myDay', when: 'today' });          // "we", not Wind Ensemble
expect('are we in chapman', { intent: 'where', when: 'today', about: 'chapman' });
// A short name of three letters or fewer, or one that is also a first
// name, is only ever offered: "where is cam", "is phil at rehearsal".
for (const q of ['is WE cancelled', 'is phil cancelled', 'when is cam', 'is cco cancelled', 'where is cam', 'is phil at rehearsal', 'where is so']) {
  refuse(q, 'a short name that is three letters or a first name');
}
// The same names with no question around them are an offer, not an answer.
for (const q of ['camerata', 'symphony', '4302', 'Chapman', 'dance']) {
  const got = refuse(q, 'a bare one-word name');
  if (got.suggestions.length !== 1) fail(`"${q}" should offer exactly the one thing it names, offered ${said(got)}`);
}
// One word out of a longer title, a surname, a typo, a number: offers.
for (const q of ['when is the nutcracker', 'where is the lyric', 'holberg part', 'gilman', 'tchaik 5', 'nutcraker', 'is camertaa cancelled', 'beethoven 7', 'fleischmann']) {
  const got = refuse(q, 'weak evidence for a name');
  if (got.suggestions.length === 0) fail(`"${q}" should offer what it might mean`);
}
for (const q of ['where is pena', 'is marcano cancelled', 'when is albornoz', 'what is andai playing', 'is gasior cancelled today']) {
  refuse(q, 'a surname alone');
}
// A name made entirely of ordinary words fills only a slot whose template
// names its kind: never a bare "when is" or "what time is".
for (const q of ['when is violin masterclass', 'what time is violin masterclass', 'when is class piano']) refuse(q, 'an all-ordinary name in a bare when');
// A whole name, or two distinctive words of one, is believed with no question.
expect('wind ensemble', { intent: 'group', about: 'wind ensemble' });
expect('lincoln portrait', { intent: 'piece', about: 'lincoln portrait' });
expect('chamber music', { intent: 'group', about: 'chamber music' });       // "music" is part of the name
expect('form and analysis', { intent: 'group', about: 'form & analysis' }); // so is "form"
expect('whats due by friday', { intent: 'due', when: 'weekday:fri' });       // a deadline, in a question about what is due
// Two words out of a longer title are not the title. They may be two other
// things ("philharmonic and camerata" are two groups, not their concert).
for (const q of [
  'jazz combos concert', 'when is jazz combo', 'is philharmonic and camerata cancelled', 'when is nwsa symphony orchestra',
  'string quartet', 'when is the concerto competition', 'side by side', 'field trip',
]) refuse(q, 'part of a longer title');
// A thing named after a person is not where that person is.
const namedAfter: readonly AskName[] = [
  ...NAMES, { kind: 'concert', name: 'Senior Recital: Malik Johnson' }, { kind: 'group', name: 'Malik Johnson Studio' },
  { kind: 'venue', name: 'Imani Brooks Hall' }, { kind: 'form', name: 'Priya Raman Scholarship' },
];
for (const q of [
  'where is malik johnson', 'address for malik johnson', 'what does malik johnson have today', 'is imani brooks here',
  'where is imani brooks', 'when is priya raman', 'is malik johnson cancelled', 'malik johnson',
]) {
  const got = look(q, namedAfter);
  if (got.confident) fail(`"${q}" names a person a thing is called after, and was answered: ${show(got)}`);
}
expect('where is the freedom tower concert', { intent: 'concert', about: 'freedom tower concert' });
// Words no template has a position for.
for (const q of [
  'show me my schedule', 'what time do we show up', 'how do i sign in', 'sign out my son', 'can i sit out today',
  'how do i get there', 'calendar this week', 'whats on my calendar', 'i need a break', 'can i play in symphony',
  'can i wear jeans', 'what if i miss the concert', 'is the exam late if i send it tonight', 'what is the concert about',
  'whats up', 'what time does school start', 'can i practice in 4304', 'how many concerts', 'camerata students',
  'change rehearsal to 3pm', 'is camerata cancelled for zelda', 'where is the free concert', 'ill be there',
  'what do we do after the concert', 'rehearsal with gilman', 'who do i ask about seating',
  // The fourth review's: a keyword with the words around it unread.
  'when do i turn in my playing exam', 'when is my appointment', 'when is form class', 'when is music class',
  'do we change for the concert', 'when is the concert rehearsal', 'pick up tickets', 'the play', 'the sign', 'is black',
  'a break', 'is she sick', 'has anyone seen my son', 'is my daughter part of symphony',
  'may i leave early', 'can i leave early', 'can i miss rehearsal', 'can i be absent friday',
  // The code-reading review's: silent trimming, a short name read as a pronoun, single keywords.
  'what are we playing this year', 'what is my schedule this year', 'what should i practice this year',
  'what is WE playing friday', 'does WE have rehearsal today', 'what room is WE in',
  'que hay el 9/12', 'que tengo el 5/11', 'what do i have by friday', 'is there school by friday', 'voy a faltar los viernes',
  'the 5th', 'the 15th', 'practice', 'show', 'program', 'thanksgiving', 'documents', 'seat', 'class', 'recital',
  'what time is the concert and what do i wear', 'cuando es el concierto y que me pongo',
  'is there school on black friday', 'pick up my part', 'where do we change', 'do i have rehearsal over break',
]) refuse(q, 'a word no template has a position for');
expect('when and where do i pick up my student after the concert', { intent: 'pickup', when: 'next' });
// A pasted page is not answered from its first line.
refuse('what do i have today '.repeat(40), 'longer than a question', true);
expect('', { intent: 'none' });
expect('???', { intent: 'none' });

/* ── The boundary (design 3.7 and 3.8) ────────────────────────────────── */

// An allowlist, not a blocklist: this folder and ../fuzzy.ts, nothing else.
const here = new URL('.', import.meta.url);
const folder = fileURLToPath(here);
const fuzzy = fileURLToPath(new URL('../fuzzy.ts', here));
checkImports(here, path => path.startsWith(folder) || path === fuzzy,
  'src/shared/ask/ may import only its own files and src/shared/fuzzy.ts');

// The public bundle carries no staff phrasing. The staff tables live in
// src/director/ask/; the only staff word allowed here is the one guard.
for (const file of ['parse.ts', 'templates.ts', 'givenNames.ts', 'commonWords.ts']) {
  const src = readFileSync(new URL(file, here), 'utf8');
  const hits = [...src.matchAll(/['"`]staff\w*['"`]/g)].map(m => m[0]);
  if (hits.some(h => h !== "'staff'")) fail(`${file} names a staff intent (${hits.join(', ')}); those belong in src/director/ask/`);
}
void CLASSMATE;

if (anyFailed()) {
  console.error('\nask.selfcheck FAILED');
  process.exit(1);
}
console.log('\nask.selfcheck passed');
