/**
 * What Ask's two self-checks share (#ask): the names, the stand-in people,
 * and the judging. Not a check itself; it only exports.
 *   src/shared/ask/ask.selfcheck.ts          the public side
 *   src/director/ask/staffAsk.selfcheck.ts   the staff side
 *
 * THE NAMES BELOW ARE PUBLIC ONES ONLY. They were read on 2026-11-11 from
 * the world-readable `ensembles`, `events`, `repertoire`, `signupForms` and
 * `assignments` collections: titles, rooms, course codes, and the conductor
 * or composer printed on a public page. No collection of people was read and
 * no student is named here. When you refresh this list, keep it that way
 * (#privacy).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AskCase } from './corpus.ts';
import { askWords, type AskName, type AskNameKind, type AskParse } from './parse.ts';

/** A row is a name, then its other names. One that starts with "@" is a
 *  person on it (conductor, composer), found by surname only. */
const of = (kind: AskNameKind, rows: (string | string[])[]): AskName[] =>
  rows.map(r => {
    const [name, ...rest] = typeof r === 'string' ? [r] : r;
    const also = rest.filter(x => !x.startsWith('@'));
    const by = rest.filter(x => x.startsWith('@')).map(x => x.slice(1));
    return { kind, name, ...(also.length ? { also } : {}), ...(by.length ? { by } : {}) };
  });

export const NAMES: readonly AskName[] = Object.freeze([
  ...of('group', [
    'Camerata String Orchestra', 'Chamber Winds', 'AP Theory', 'Symphony Orchestra', 'Philharmonic',
    'Wind Ensemble', 'Jazz Ensemble', 'Opera Orchestra', 'High School Choir', 'College Vocal Ensemble',
    'Jazz Theory', 'Music History — 11th–12th', 'Theory — 10th Grade', 'Theory — 9th Grade',
    'Vocal Forum', 'Vocal Lit', 'Dance', 'Theatre', 'Visual Arts',
    ['Chamber Music', '@Grant Gilman'],
    ['College Chamber Orchestra', '@Grant Gilman'],
    ['College Forum', '@Sarah Cambage'],
    ['Diction / Singing 1', 'MUS 1211', '@Sarah Cambage'],
    ['Form & Analysis', 'MUT 3611', '@Susan Epstein'],
    ['French for Singers', 'MUS 3225', '@Sarah Cambage'],
    ['MIDI Electronic Music 1', 'MUM 2623C', '@Albornoz'],
    ['Music from 1900–1945', 'MUC 4572', '@Richard Fleischman'],
    ['History and Literature of the Opera', 'MUL 4662', '@Richard Fleischman'],
    ['Opera Workshop / Theater', 'MUO 1501', 'MUO 3652', '@Sarah Cambage'],
    ['Class Piano 1', 'MVK 1111', '@Ron Cowler'],
    ['Class Piano 3', 'MVK 2121', '@Ron Cowler'],
    ['Sight Singing & Ear Training 1', 'MUT 1241', '@Susan Epstein'],
    ['Sight Singing & Ear Training 3', 'MUT 2246', '@Susan Epstein'],
    ['String Pedagogy', 'MVS 4640', '@Grant Gilman'],
    ['Survey Music History 1', 'MUH 3211', '@Grant Gilman'],
    ['Music Theory 1', 'MUT 1111', '@Susan Epstein'],
    ['Music Theory 3', 'MUT 2116', '@Susan Epstein'],
    ['Souvenir de Florence', '@Dr. Daniel Andai'],
    ['Bass Masterclass', '@Juan Pena'],
    ['Cello Masterclass', '@Germán Marcano'],
    ['Viola Masterclass', '@Richard Fleischman'],
    ['Violin Masterclass', '@Dr. Grant Gilman'],
    ['Jazz Combo #1', '@The Great Gasior'],
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
    ['"Bella figlia dell\'amore" from Rigoletto', '@Verdi, Giuseppe'],
    ['"Under the Willow Tree" from Vanessa', '@Barber, Samuel'],
    ['"We\'ll go away together" (Laurie and Martin, Reh. 73-77) from The Tender Land', '@Copland, Aaron'],
    ['1812 Overture — Finale (modified)', '@Pyotr Ilyich Tchaikovsky'],
    ['4′33″', '@John Cage'],
    ['Adagio of Spartacus and Phrygia', '@Aram Khachaturian'],
    ['American Salute', '@Morton Gould'],
    ['Battle Hymn of the Republic', '@William Steffe / Julia Ward Howe'],
    ['Capriol Suite', '@Peter Warlock'],
    ['Carmen Suite No. 1', '@Georges Bizet'],
    ['Cello Concerto No. 2 in D, I. Allegro moderato', '@Joseph Haydn'],
    ['Cendrillon', '@Jules Massenet'],
    ['Cortège de Bacchus', '@Léo Delibes'],
    ['Danse sacrée', '@Claude Debussy'],
    ['Danzas de Panamá', '@William Grant Still'],
    ['Divertimento in F for Viola and String Quartet, BI 330', '@Alessandro Rolla'],
    ['Down a Country Lane', '@Aaron Copland'],
    ["Ging heut' morgen übers Feld", '@Gustav Mahler'],
    ['Hoe-Down', '@Aaron Copland'],
    ['Holberg Suite', '@Edvard Grieg'],
    ['Intermezzo', '@Pietro Mascagni'],
    ['La Forza del Destino - Overture', '@Giuseppe Verdi'],
    ['La Musica Notturna delle Strade di Madrid', '@Luigi Boccherini'],
    ['Lincoln Portrait', '@Aaron Copland'],
    ['Marche des Princesses', '@Jules Massenet'],
    ['Marche from the Love of Three Oranges', '@Prokofiev'],
    ['Nutcracker ballet', '@Pyotr Ilyich Tchaikovsky'],
    ['O mio babbino caro', '@Giacomo Puccini'],
    ['Overture to Rip Van Winkle', '@George Whitefield Chadwick'],
    ['Piano Quartet in G minor', '@Johannes Brahms'],
    ['Polovtsian Dances - 1st Theme', '@Borodin'],
    ['Prelude to Act I from La traviata', '@Verdi, Giuseppe'],
    ['Rhapsody in Blue', '@George Gershwin'],
    ['Ritual Fire Dance', '@Manuel de Falla'],
    ['Sospiri', '@Edward Elgar'],
    ['Souvenir de Florence', '@Pyotr Ilyich Tchaikovsky'],
    ['Symphony 7 - II. Allegretto', '@Beethoven'],
    ['Symphony No. 33', '@Wolfgang Amadeus Mozart'],
    ['Symphony No. 5', '@Pyotr Ilyich Tchaikovsky'],
    ['Symphony No. 8 ‘Unfinished’', '@Franz Schubert'],
    ['The Star-Spangled Banner', '@John Stafford Smith'],
    ['The Stars and Stripes Forever', '@John Philip Sousa'],
    ['Tuba Concerto, I. Allegro moderato', '@Bruce Broughton'],
    ['Wood-Sprites scene (“Hou, hou, hou / Stojí měsíc nad vodou”) from Rusalka, Op. 114', '@Dvořák, Antonín'],
    ['“Au fond du temple saint” from Les Pêcheurs de perles', '@Bizet, Georges'],
    ['“Eccovi il medico, signore belle” from Così fan tutte, K. 588', '@Mozart, Wolfgang'],
    ['“Epiphany” (No. 17, original key) from Sweeney Todd', '@Sondheim, Stephen'],
    ['“Glück, das mir verblieb” (Marietta’s Lied / Lute Song) from Die tote Stadt', '@Korngold, Erich'],
    ['“Si colmi il calice” from Macbeth', '@Verdi, Giuseppe'],
    // Not in the live library today. Here because the design names it as the
    // trap a date library fell into: the month in a title is not a date.
    ['Radetzky March', '@Johann Strauss'],
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
export const CLASSMATE = 'Zelda Quillfeather';

/**
 * First names to stand in for `{classmate}`, one at a time. The made-up
 * name above passes because it is unusual; these are the ones that used to
 * get an answer. Ordinary given names, not anybody at the school: the roster
 * was never read (#privacy). Chosen to be hard:
 *   - the first name of somebody printed on a public page (a conductor, a
 *     composer): sarah, daniel, juan, grant, richard, susan, ron, george ...
 *   - a first name that is a word in a title or a room: james, jackie,
 *     louise, adrienne, carmen, florence, martin, vanessa, todd, lincoln
 *   - a first name that is also an ordinary word: will, may, rose, grace, angel
 *   - a first name that is also a weekday in Spanish: domingo
 *   - "chris", which used to be read as short for "christmas"
 *   - three that are in no list of common names: zelda, thaddeus, anouk
 * "kendall" is left out on purpose: it is a real place we perform at.
 */
export const FIRST_NAMES = (
  'sarah daniel juan james chris maria jose david michael emily sofia isabella matthew anthony ashley ' +
  'carlos luis gabriel samantha andrew john william grace carmen florence jackie louise adrienne george ' +
  'aaron martin vanessa todd lincoln grant richard susan ron rose will may angel domingo peter edward ' +
  'zelda thaddeus anouk'
).split(' ');

/* ── Judging ──────────────────────────────────────────────────────────── */

let failed = false;
export const fail = (msg: string) => { failed = true; console.error(`FAIL  ${msg}`); };
export const anyFailed = () => failed;

export const plain = (s: string) => askWords(s).replace(/[:/]/g, ' ').replace(/\s+/g, ' ').trim();
export const show = (p: { intent: string; when?: string; about?: string }) =>
  `${p.intent}${p.when ? ` ${p.when}` : ''}${p.about ? ` about "${p.about}"` : ''}`;
export const fill = (q: string, who = CLASSMATE) => q.replace('{classmate}', who);

export type Parse = (q: string) => AskParse;

/** Does the parse say what the corpus line says? `about` in the corpus is a
 *  plain word the matcher must find, so a fuller name ("Symphony No. 5")
 *  passes when it contains it; a line with no `about` must come back with none. */
export function agrees(c: AskCase, got: AskParse): boolean {
  const about = c.about ? !!got.about && plain(got.about).includes(plain(c.about)) : !got.about;
  return got.intent === c.intent && got.when === c.when && about;
}

/**
 * Run a set of corpus lines and print the three counts. Fails on any
 * confident wrong answer, AND on any line that is not right unless it is
 * named in `mayBeNoAnswer`. Without that floor a line could slide from
 * right to "no answer" and nothing would notice: deleting "tmrw" from the
 * date table used to pass.
 */
export function runCorpus(label: string, cases: AskCase[], parse: Parse, mayBeNoAnswer: readonly string[]) {
  const right: AskCase[] = [];
  const noAnswer: AskCase[] = [];
  const wrong: AskCase[] = [];
  const lines: string[] = [];
  for (const c of cases) {
    const got = parse(fill(c.q));
    if (got.confident !== (got.intent !== 'none')) fail(`"${c.q}": confident must mean "has an intent"`);
    if (agrees(c, got)) { right.push(c); continue; }
    const silent = got.intent === 'none';
    (silent ? noAnswer : wrong).push(c);
    lines.push(`  ${silent ? 'no answer' : 'WRONG    '} "${c.q}"  wanted ${show(c)}, got ${show(got)}`);
    if (silent && !mayBeNoAnswer.includes(c.q)) fail(`${label}: "${c.q}" lost its answer (wanted ${show(c)})`);
  }
  console.log(`\n${label}: ${cases.length} lines`);
  console.log(`  right                 ${right.length}`);
  console.log(`  no answer             ${noAnswer.length}`);
  console.log(`  wrong with confidence ${wrong.length}`);
  for (const l of lines) console.log(l);
  if (wrong.length > 0) fail(`${label}: ${wrong.length} wrong with confidence`);
  for (const q of mayBeNoAnswer) {
    if (!noAnswer.some(c => c.q === q)) fail(`${label}: "${q}" is listed as allowed to get no answer but does not; take it off the list`);
  }
  return { right, noAnswer, wrong };
}

/**
 * The import boundary (design 3.7), as an allowlist. Every `.ts` file in
 * `dir` may import only what `allowed` says, given the ABSOLUTE path the
 * import resolves to. A self-check may also use Node's own modules.
 */
export function checkImports(dir: URL, allowed: (path: string) => boolean, what: string) {
  for (const file of readdirSync(dir).filter(f => f.endsWith('.ts'))) {
    const at = new URL(file, dir);
    for (const m of readFileSync(at, 'utf8').matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)) {
      const spec = m[1];
      const ok = spec.startsWith('.')
        ? allowed(fileURLToPath(new URL(spec, at)))
        : spec.startsWith('node:') && file.endsWith('.selfcheck.ts');
      if (!ok) fail(`${file} imports "${spec}"; ${what}`);
    }
  }
}
