/**
 * Self-check for Ask's understanding half (#ask). Run: npx tsx src/shared/ask/ask.selfcheck.ts
 *
 * Every question in corpus.ts is parsed and must land on the intent, the date
 * and the named thing written beside it. Three counts are printed for the
 * public side and for the staff side:
 *   right                  what the corpus says
 *   no answer              the parser said it was not sure
 *   wrong with confidence  it answered, and the answer was not the corpus's
 * The run FAILS if wrong with confidence is above zero, if any line the
 * corpus marks `answer: 'none'` gets an answer, if a staff question gets an
 * answer on the public side, or if right is under 95% of the public lines.
 *
 * THE NAMES BELOW ARE PUBLIC ONES ONLY. They were read on 2026-11-11 from
 * the world-readable `ensembles`, `events`, `repertoire`, `signupForms` and
 * `assignments` collections (titles, rooms, course codes and the conductor
 * printed on a group's public page). No collection of people was read and no
 * student is named here. `{classmate}` is filled with a made-up name. When
 * you refresh this list, keep it that way (#privacy).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { ASK_CORPUS, type AskCase } from './corpus.ts';
import { askWords, parseAsk, type AskName, type AskNameKind, type AskParse } from './parse.ts';

const of = (kind: AskNameKind, rows: (string | string[])[]): AskName[] =>
  rows.map(r => (typeof r === 'string' ? { kind, name: r } : { kind, name: r[0], also: r.slice(1) }));

export const NAMES: readonly AskName[] = Object.freeze([
  ...of('group', [
    'Camerata String Orchestra', 'Chamber Winds', 'AP Theory', 'Symphony Orchestra', 'Philharmonic',
    'Wind Ensemble', 'Jazz Ensemble', 'Opera Orchestra', 'High School Choir', 'College Vocal Ensemble',
    'Jazz Theory', 'Music History — 11th–12th', 'Theory — 10th Grade', 'Theory — 9th Grade',
    'Vocal Forum', 'Vocal Lit', 'Dance', 'Theatre', 'Visual Arts',
    ['Chamber Music', 'Grant Gilman'],
    ['College Chamber Orchestra', 'Grant Gilman'],
    ['College Forum', 'Sarah Cambage'],
    ['Diction / Singing 1', 'MUS 1211', 'Sarah Cambage'],
    ['Form & Analysis', 'MUT 3611', 'Susan Epstein'],
    ['French for Singers', 'MUS 3225', 'Sarah Cambage'],
    ['MIDI Electronic Music 1', 'MUM 2623C', 'Albornoz'],
    ['Music from 1900–1945', 'MUC 4572', 'Richard Fleischman'],
    ['History and Literature of the Opera', 'MUL 4662', 'Richard Fleischman'],
    ['Opera Workshop / Theater', 'MUO 1501', 'MUO 3652', 'Sarah Cambage'],
    ['Class Piano 1', 'MVK 1111', 'Ron Cowler'],
    ['Class Piano 3', 'MVK 2121', 'Ron Cowler'],
    ['Sight Singing & Ear Training 1', 'MUT 1241', 'Susan Epstein'],
    ['Sight Singing & Ear Training 3', 'MUT 2246', 'Susan Epstein'],
    ['String Pedagogy', 'MVS 4640', 'Grant Gilman'],
    ['Survey Music History 1', 'MUH 3211', 'Grant Gilman'],
    ['Music Theory 1', 'MUT 1111', 'Susan Epstein'],
    ['Music Theory 3', 'MUT 2116', 'Susan Epstein'],
    ['Souvenir de Florence', 'Dr. Daniel Andai'],
    ['Bass Masterclass', 'Juan Pena'],
    ['Cello Masterclass', 'Germán Marcano'],
    ['Viola Masterclass', 'Richard Fleischman'],
    ['Violin Masterclass', 'Dr. Grant Gilman'],
    ['Jazz Combo #1', 'The Great Gasior'],
  ]),
  ...of('concert', [
    'Christmas Concert at Southwood Middle School', 'College Chamber Orchestra Concert',
    'College Chamber, Composition & Piano Recital', "Concerto Competition Winners' Concert",
    'Festival I — The Nutcracker Project', 'Freedom Tower Concert', 'High School Choir Concert',
    'High School Choir Holiday Concert', 'High School Jazz Combos Concert',
    'High School Philharmonic & Camerata Concert', 'High School Voice Concert',
    'High School Wind Ensemble & Jazz Ensemble Concert', 'Midnight Ball',
    'NWSA + MDC Side by Side Ensemble Concert', 'NWSA Music Faculty Recital',
    'NWSA Music Showcase Concert', 'NWSA Pops Concert', 'NWSA Symphony Orchestra Concert',
    'Opera Scenes', 'Opera: Cendrillon', 'The Nutcracker — Two Performances', 'Workshop II — Kendall',
  ]),
  ...of('venue', [
    'Black Archives Historic Lyric Theater', 'Adrienne Arsht Center — Knight Concert Hall',
    'The Fillmore Miami Beach at the Jackie Gleason Theater', 'MOAD Freedom Tower',
    'Southwood Middle School', 'Trinity Episcopal Cathedral', 'MDC North Campus Lehman Theater',
    'MDC Kendall Campus',
  ]),
  ...of('room', [
    ['Room 4302', '4302'], ['Room 4304', '4304'], ['Room 4309', '4309'], ['Room 4204', '4204'],
    ['Room 4210', '4210'], ['Room 4213', '4213'], ['Room 4214', '4214'], ['Room 4103', '4103'],
    ['Room 4105', '4105'], ['Room 3210', '3210'],
    ['MDC Wolfson Chapman Conference Center', 'Chapman Conference Center', 'Chapman'],
    ['MDC Wolfson Auditorium', 'Wolfson Auditorium'],
    'MDC Wolfson James K. Batten Room',
    'NWSA Building 5, Ballet Black Box (8th Floor)',
    'Louise O. Gerrits Theater', 'New World Dance Theater', 'New World Gallery',
  ]),
  ...of('piece', [
    ['"Bella figlia dell\'amore" from Rigoletto', 'Verdi, Giuseppe'],
    ['"Under the Willow Tree" from Vanessa', 'Barber, Samuel'],
    ['"We\'ll go away together" (Laurie and Martin, Reh. 73-77) from The Tender Land', 'Copland, Aaron'],
    ['1812 Overture — Finale (modified)', 'Pyotr Ilyich Tchaikovsky'],
    ['4′33″', 'John Cage'],
    ['Adagio of Spartacus and Phrygia', 'Aram Khachaturian'],
    ['American Salute', 'Morton Gould'],
    ['Battle Hymn of the Republic', 'William Steffe / Julia Ward Howe'],
    ['Capriol Suite', 'Peter Warlock'],
    ['Carmen Suite No. 1', 'Georges Bizet'],
    ['Cello Concerto No. 2 in D, I. Allegro moderato', 'Joseph Haydn'],
    ['Cendrillon', 'Jules Massenet'],
    ['Cortège de Bacchus', 'Léo Delibes'],
    ['Danse sacrée', 'Claude Debussy'],
    ['Danzas de Panamá', 'William Grant Still'],
    ['Divertimento in F for Viola and String Quartet, BI 330', 'Alessandro Rolla'],
    ['Down a Country Lane', 'Aaron Copland'],
    ["Ging heut' morgen übers Feld", 'Gustav Mahler'],
    ['Hoe-Down', 'Aaron Copland'],
    ['Holberg Suite', 'Edvard Grieg'],
    ['Intermezzo', 'Pietro Mascagni'],
    ['La Forza del Destino - Overture', 'Giuseppe Verdi'],
    ['La Musica Notturna delle Strade di Madrid', 'Luigi Boccherini'],
    ['Lincoln Portrait', 'Aaron Copland'],
    ['Marche des Princesses', 'Jules Massenet'],
    ['Marche from the Love of Three Oranges', 'Prokofiev'],
    ['Nutcracker ballet', 'Pyotr Ilyich Tchaikovsky'],
    ['O mio babbino caro', 'Giacomo Puccini'],
    ['Overture to Rip Van Winkle', 'George Whitefield Chadwick'],
    ['Piano Quartet in G minor', 'Johannes Brahms'],
    ['Polovtsian Dances - 1st Theme', 'Borodin'],
    ['Prelude to Act I from La traviata', 'Verdi, Giuseppe'],
    ['Rhapsody in Blue', 'George Gershwin'],
    ['Ritual Fire Dance', 'Manuel de Falla'],
    ['Sospiri', 'Edward Elgar'],
    ['Souvenir de Florence', 'Pyotr Ilyich Tchaikovsky'],
    ['Symphony 7 - II. Allegretto', 'Beethoven'],
    ['Symphony No. 33', 'Wolfgang Amadeus Mozart'],
    ['Symphony No. 5', 'Pyotr Ilyich Tchaikovsky'],
    ['Symphony No. 8 ‘Unfinished’', 'Franz Schubert'],
    ['The Star-Spangled Banner', 'John Stafford Smith'],
    ['The Stars and Stripes Forever', 'John Philip Sousa'],
    ['Tuba Concerto, I. Allegro moderato', 'Bruce Broughton'],
    ['Wood-Sprites scene (“Hou, hou, hou / Stojí měsíc nad vodou”) from Rusalka, Op. 114', 'Dvořák, Antonín'],
    ['“Au fond du temple saint” from Les Pêcheurs de perles', 'Bizet, Georges'],
    ['“Eccovi il medico, signore belle” from Così fan tutte, K. 588', 'Mozart, Wolfgang'],
    ['“Epiphany” (No. 17, original key) from Sweeney Todd', 'Sondheim, Stephen'],
    ['“Glück, das mir verblieb” (Marietta’s Lied / Lute Song) from Die tote Stadt', 'Korngold, Erich'],
    ['“Si colmi il calice” from Macbeth', 'Verdi, Giuseppe'],
    // Not in the live library today. Here because the design names it as the
    // trap a date library fell into: the month in a title is not a date.
    ['Radetzky March', 'Johann Strauss'],
  ]),
  ...of('form', [
    'All-State auditions — who’s in?', 'College Student Information',
    'Concerto competition winners meeting with Dr. Gilman', 'Freedom Tower Field Trip — Permission Form',
    'Gilman Violin Lessons', 'Orchestra Assistant Interview',
    'Subway sandwich order — Lyric concert day, Mon Nov 16', 'Violin Masterclass Sign-Up',
  ]),
  ...of('assignment', [
    'Camerata Playing Exam #1', 'Camerata Playing Exam #2', 'Symphony Playing Exam #1',
    'Symphony Playing Exam #2', 'Symphony Playing Exam #3', 'Survey Music History 1 - Exam 1',
    'Survey Music History 1 - Exam 2',
  ]),
]);

/** Nobody. Stands in for `{classmate}`. */
const CLASSMATE = 'Zelda Quillfeather';

let failed = false;
const fail = (msg: string) => { failed = true; console.error(`FAIL  ${msg}`); };
const plain = (s: string) => askWords(s).replace(/[:/]/g, ' ').replace(/\s+/g, ' ').trim();
const show = (p: AskParse) =>
  `${p.intent}${p.when ? ` ${p.when}` : ''}${p.about ? ` about "${p.about}"` : ''}`;
const want = (c: AskCase) =>
  `${c.intent}${c.when ? ` ${c.when}` : ''}${c.about ? ` about "${c.about}"` : ''}`;

type Verdict = 'right' | 'no answer' | 'wrong';
function judge(c: AskCase, side: 'public' | 'staff'): { verdict: Verdict; got: AskParse } {
  const got = parseAsk(c.q.replace('{classmate}', CLASSMATE), NAMES, { side });
  if (got.confident !== (got.intent !== 'none')) fail(`"${c.q}": confident must mean "has an intent"`);
  if (side === 'public' && got.intent.startsWith('staff')) fail(`"${c.q}": a staff intent on the public side`);
  // `about` in the corpus is a plain word the matcher must find, so the
  // parser's fuller name ("Symphony No. 5") passes when it contains it.
  const about = c.about ? !!got.about && plain(got.about).includes(plain(c.about)) : !got.about;
  if (got.intent === c.intent && got.when === c.when && about) return { verdict: 'right', got };
  return { verdict: got.intent === 'none' ? 'no answer' : 'wrong', got };
}

function run(label: string, cases: AskCase[], side: 'public' | 'staff') {
  const tally: Record<Verdict, AskCase[]> = { right: [], 'no answer': [], wrong: [] };
  const lines: string[] = [];
  for (const c of cases) {
    const { verdict, got } = judge(c, side);
    tally[verdict].push(c);
    if (verdict !== 'right') lines.push(`  ${verdict.padEnd(9)} "${c.q}"  wanted ${want(c)}, got ${show(got)}`);
  }
  console.log(`\n${label}: ${cases.length} lines`);
  console.log(`  right                 ${tally.right.length}`);
  console.log(`  no answer             ${tally['no answer'].length}`);
  console.log(`  wrong with confidence ${tally.wrong.length}`);
  for (const l of lines) console.log(l);
  if (tally.wrong.length > 0) fail(`${label}: ${tally.wrong.length} wrong with confidence`);
  return tally;
}

/* ── The corpus ───────────────────────────────────────────────────────── */

const publicCases = ASK_CORPUS.filter(c => c.who !== 'staff');
const staffCases = ASK_CORPUS.filter(c => c.who === 'staff');

const pub = run('Public side', publicCases, 'public');
run('Staff side', staffCases, 'staff');

const share = pub.right.length / publicCases.length;
console.log(`\nPublic right: ${(share * 100).toFixed(1)}% (must be 95% or more)`);
if (share < 0.95) fail(`public right is ${(share * 100).toFixed(1)}%, under 95%`);

// The honest no: a line the corpus refuses must be refused.
for (const c of ASK_CORPUS.filter(x => x.answer === 'none')) {
  const got = parseAsk(c.q.replace('{classmate}', CLASSMATE), NAMES, { side: 'public' });
  if (got.intent !== 'none') fail(`"${c.q}" must get no answer, got ${show(got)}`);
}

// A staff question typed on the public side gets no answer. The exception is
// a sentence that is ALSO a public line ("next concert"): the same words are
// a fair question from a student, and the public line above decides them.
const publicWords = new Set(publicCases.map(c => c.q));
let leaks = 0;
for (const c of staffCases) {
  if (publicWords.has(c.q)) continue;
  const got = parseAsk(c.q.replace('{classmate}', CLASSMATE), NAMES, { side: 'public' });
  if (got.intent !== 'none') { leaks++; fail(`staff question "${c.q}" answered on the public side: ${show(got)}`); }
}
console.log(`Staff questions answered on the public side: ${leaks} (must be 0)`);

/* ── Traps that are not corpus lines ──────────────────────────────────── */

const ask = (q: string, side: 'public' | 'staff' = 'public') => parseAsk(q, NAMES, { side });
const expect = (q: string, wanted: Partial<AskParse>, side: 'public' | 'staff' = 'public') => {
  const got = ask(q, side);
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
// The rest of the date table.
expect('la proxima semana', { intent: 'myDay', when: 'nextWeek' });
expect('tmr', { intent: 'myDay', when: 'tomorrow' });
expect('do i have rehearsal tonight', { intent: 'myDay', when: 'tonight' });
expect('el fin de semana', { intent: 'myDay', when: 'weekend' });
// Two days in one question, or a day there is no word for: not sure.
expect('do i have rehearsal today or tomorrow', { intent: 'none' });
expect('que tengo pasado mañana', { intent: 'none' });
expect('what did we play yesterday', { intent: 'none' });
// Short forms. Initials of two letters count only when typed as capitals,
// because "we" is also a word.
expect('is WE cancelled', { intent: 'cancelled', when: 'today', about: 'wind ensemble' });
expect('do we have rehearsal', { intent: 'myDay', when: 'today' });
expect('the Lyric', { intent: 'concert', about: 'lyric' });
expect('4302', { intent: 'where', about: '4302' });
expect('Chapman', { intent: 'where', about: 'chapman' });
// One typo is forgiven; a word that is nobody's name is not skipped over.
expect('is camertaa cancelled', { intent: 'cancelled', when: 'today', about: 'camerata' });
expect('is camerata cancelled for zelda', { intent: 'none' });
expect('', { intent: 'none' });
expect('???', { intent: 'none' });

// Found by questions the parser was never tuned on (a second writer, who had
// not seen parse.ts). Each was a confident wrong answer before it was a line here.
expect('what is grace playing', { intent: 'none' });        // five letters is too short to call a typo of "grade"
expect('is will absent', { intent: 'none' });               // "will" is a word and a name, so it is not filler
expect('whats up', { intent: 'none' });                     // "up" is in "Sign-Up"
expect('what time does school start', { intent: 'none' });  // "school" is in "High School Choir"
expect('can i practice in 4304', { intent: 'none' });       // asking for a room, not for repertoire
expect('how many concerts', { intent: 'none' });
expect('camerata students', { intent: 'none' });            // "students" fits a form's title; a second name is a stray word
expect('change rehearsal to 3pm', { intent: 'none' });      // a director's command
expect('do we have rehearsal next friday', { intent: 'none' });
expect('when is the sat', { intent: 'none' });              // the test, not Saturday
expect('what chair am i sat in', { intent: 'seat' });
expect('que hay el 16/11', { intent: 'myDay', when: 'date:11-16' });
expect('whens the next show', { intent: 'concert', when: 'next' });
expect('when is 9th grade theory', { intent: 'myDay', when: 'next', about: '9th grade' });
// A word that picks an intent is not a question word when it is part of the name.
expect('chamber music', { intent: 'group', about: 'chamber music' });
expect('form and analysis', { intent: 'group', about: 'form & analysis' });
expect('pops concert', { intent: 'concert', about: 'pops' });

// Exactly one name gives the caller its own record back; several do not.
if (ask('camerata').match?.name !== 'Camerata String Orchestra') fail('"camerata" must hand back the one group it names');
if (ask('when is theory').match) fail('"theory" fits several classes, so no single match');

// Pure: the same words give the same answer, and the names are not touched
// (the list above is frozen, so a write would have thrown).
for (const c of ASK_CORPUS) {
  const q = c.q.replace('{classmate}', CLASSMATE);
  if (JSON.stringify(ask(q)) !== JSON.stringify(ask(q))) fail(`"${c.q}" parsed differently the second time`);
}

/* ── The boundary (design 3.7) ────────────────────────────────────────── */

// Nothing under src/shared/ask/ may reach the staff side, React or Firebase.
const here = new URL('.', import.meta.url);
for (const file of readdirSync(here).filter(f => f.endsWith('.ts'))) {
  const src = readFileSync(new URL(file, here), 'utf8');
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    const relative = spec.startsWith('.');
    const allowed = relative
      ? !/director|\/public\//.test(spec) && spec.endsWith('.ts')
      : spec.startsWith('node:') && file.endsWith('.selfcheck.ts');
    if (!allowed) fail(`${file} imports "${spec}"; src/shared/ask/ may import only its own files and ../fuzzy.ts`);
  }
}

if (failed) {
  console.error('\nask.selfcheck FAILED');
  process.exit(1);
}
console.log('\nask.selfcheck passed');
