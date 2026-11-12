/**
 * Self-check for Ask's answering half (#ask): src/shared/ask/answer.ts.
 * Run: node src/shared/ask/answer.selfcheck.ts
 *
 * PLAIN `node`, on purpose. The first promise it keeps is that the module
 * loads without the org config, React or Firestore.
 *
 * What it pins, on a small invented school:
 *    1. every intent the public templates can return is answered, every
 *       table word they can hand back is one this file has decided about,
 *       and a staff question is not answered
 *    2. each intent gives the right state, sentence and cards; a question
 *       the Hub has no record for (parking, tickets) is told so and nothing
 *       is made up; `showing` always carries the day that was understood
 *    3. who it is for: several saved students get one answer each; nobody
 *       saved and a "my" question asks who; an archived or missing student
 *       is nobody, never "nothing today"; a group named in the question
 *       never stands in for the saved student
 *    4. a cancelled or moved event carries the director's own note, in the
 *       reader's language, and the sentence gives only its stored status
 *    5. "No music is listed" is followed by the labelled Preparing-for
 *       cards, for that group's next concert and that group's pieces
 *    6. nothing hidden appears, in any answer, however it is asked for: a
 *       scheduled post, assignment or form, a closed or invite-only form
 *    7. a concert a student only attends adds no pieces, and never gets the
 *       performers' call time or dress (#student-repertoire)
 *    8. the short path (the student's own record and own pull-outs) gives
 *       the same answer as the whole roster (design 3.6)
 *    9. the import boundary: the answerer imports only its allowlist, the
 *       parser never imports the answerer, and there is no clock
 *   10. English and Spanish say the same answer
 *   11. no typed word reaches a sentence, `showing` or a follow-up chip
 *   12. the concert count is only ever a link
 *   13. every route is one the app mounts, and every page is named as the
 *       menu names it
 *   14. a lone suggestion is answered as a guess; several come back as choices
 *   15. the follow-up chips are readings, and each can be answered
 *   16. the date words mean the right days, inside the school year, and a
 *       day gone by is the past, never next year
 *   17. every time and date in a sentence is exactly what the formatter
 *       gave, once, with the year when it is not this year
 *   18. the real parser's reading goes straight in
 *   19. no sentence starts "Yes" or "No", and none words a change
 *   20. the time of day: what is over is not "next", and "tonight"
 *   21. school is answered only inside the calendar's own year
 *   22. no staff-only field planted on a record ever comes out
 *
 * Two of the repo's own rules are lifted out of their files and run here
 * (see `lift`), so the announcements filter and the seating address tested
 * are the real ones, not a copy.
 *
 * Every person here is invented (#privacy). This file may import only this
 * folder and Node's own modules: `checkImports` checks that.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  ASK_ANSWERS, ASK_PAGE_NAMES, ASK_ROUTES, answerAsk, askRange,
  type AskAnswer, type AskCard, type AskData, type AskOptions, type AskStudent,
} from './answer.ts';
import { parseAsk, type AskName, type AskParse, type AskReading } from './parse.ts';
import { MACROS, PUBLIC_TEMPLATES } from './templates.ts';
import type { AskIntent, AskWhen } from './corpus.ts';
import { ANSWERER_MAY_IMPORT, anyFailed, checkImports } from './askKit.selfcheck.ts';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) return;
  failures++;
  console.error(`FAIL  ${label}${detail ? `\n      ${detail}` : ''}`);
};
const eq = (label: string, got: unknown, want: unknown) =>
  check(label, JSON.stringify(got) === JSON.stringify(want), `got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);

const root = new URL('../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

/** One exported function, taken out of its own file and run as it is
 *  written. For the rules plain Node cannot import (their files reach React,
 *  Firestore or the org config), so the check uses the real rule. */
function lift<F>(path: string, name: string): F {
  const src = read(path);
  const at = src.indexOf(`export function ${name}(`);
  const stop = src.indexOf('\n}\n', at);
  if (at < 0 || stop < 0) throw new Error(`${name} is no longer a top-level function in ${path}`);
  const js = stripTypeScriptTypes(src.slice(at + 'export '.length, stop + 2));
  return new Function(`${js}; return ${name};`)() as F;
}

/* ── The school. Monday 2026-10-05, ten in the morning. ───────────────── */

const TODAY = '2026-10-05';
const ZONE = 'America/New_York';
/** A moment on a day, by the school's own clock (Eastern Daylight Time). */
const at = (ymd: string, hhmm: string) => Date.parse(`${ymd}T${hhmm}:00-04:00`);
const NOW = at(TODAY, '10:00');
const LATER = NOW + 86_400_000;
/** Planted on every record, in fields only staff may read, and in free text
 *  Ask has no business repeating. It must never come out (section 22). */
const P = 'POISON';

type Row<K extends keyof AskData> = NonNullable<AskData[K]>[number];
const as = <T>(x: unknown) => x as T;

const ensembles = as<AskData['ensembles']>([
  { id: 'sym', name: 'Symphony Orchestra', conductorName: 'Dr. Invented Person', staff: [{ name: 'Dr. Invented Person', mdcEmail: `${P}-staff@example.org`, phone: `${P}-PHONE` }] },
  { id: 'cham', name: 'Chamber Players' },
  { id: 'theory', name: 'Theory Ten', kind: 'class' },
]);

const student = (id: string, name: string, grade: string, ensembleIds: string[], extra: object = {}) => as<Row<'students'>>({
  id, name, grade, ensembleIds, status: 'Active', instrument: 'Violin',
  pronunciation: `${P}-PRON`, schoolId: `${P}-SCHOOLID`, adult: true, archivedLabel: `${P}-LABEL`, updatedBy: `${P}-BY`, ...extra,
});
const students = [
  // Stored surname first, as most of the roster is.
  student('ada', 'Example, Ada', '10', ['sym']),
  student('ben', 'Ben Sample', '11', ['cham']),
  student('cy', 'Cy Placeholder', 'College Freshman', ['cham']),
  student('dee', 'Dee Fixture', '9', ['sym']),
  student('fay', 'Stand-In, Fay', '11', ['sym', 'cham'], { preferredName: 'Faye' }),
  student('gus', 'Gus Pretend', '10', ['cham']),
  student('eli', 'Eli Madeup', '12', ['sym'], { status: 'Graduated' }),
];

const NOTE = 'Cancelled: the hall is closed.';
const NOTE_ES = 'Cancelado: la sala está cerrada.';
const ev = (id: string, date: string, type: string, ensembleIds: string[], extra: Partial<Row<'events'>> = {}) =>
  as<Row<'events'>>({ id, date, type, ensembleIds, status: 'Scheduled', notes: `${P}-NOTES`, changeLog: `${P}-LOG`, updatedBy: `${P}-BY`, ...extra });
const events = [
  // Last year's concert of the same name, with a different call time.
  ev('cold', '2025-10-11', 'Concert', ['sym'], { title: 'Fall Concert', startTime: '19:00', location: 'Old Hall', callTime: '17:00' }),
  // Over by ten o'clock.
  ev('e0', '2026-10-05', 'Rehearsal', ['cham'], { startTime: '08:00', endTime: '09:15', location: 'Room 9' }),
  ev('r1', '2026-10-05', 'Rehearsal', ['sym'], { startTime: '14:10', endTime: '15:30', location: 'Room 2210' }),
  ev('r2', '2026-10-06', 'Rehearsal', ['sym'], { startTime: '14:10', location: 'Room 2210', pieceIds: ['overture'] }),
  ev('r3', '2026-10-06', 'Rehearsal', ['cham'], { startTime: '13:00', status: 'Cancelled', changeNote: NOTE, changeNoteEs: NOTE_ES }),
  // Moved, not cancelled.
  ev('r4', '2026-10-07', 'Rehearsal', ['cham'], { startTime: '13:00', location: 'Room 9', changeNote: 'Moved to Room 9 today.' }),
  // No end stored.
  ev('sec', '2026-10-08', 'Sectional', ['sym'], { startTime: '15:00', location: 'Room 12', guestPerformers: [`${P}-GUEST`] }),
  ev('r5', '2026-10-09', 'Rehearsal', ['cham'], { startTime: '13:00' }),
  ev('c1', '2026-10-10', 'Concert', ['sym'], {
    title: 'Fall Concert', startTime: '19:00', location: 'Main Hall', pieceIds: ['overture', 'suite'],
    callTime: '18:00', dress: 'Concert black.', pickupTime: '21:00',
  }),
  // Chamber plays; Symphony is required in the audience. The call time and
  // the dress are the players', not the audience's.
  ev('c2', '2026-10-17', 'Concert', ['cham'], {
    title: 'Chamber Night', startTime: '19:30', endTime: '21:00', location: 'Small Hall',
    pieceIds: ['quartet'], attendanceEnsembleIds: ['sym'], callTime: '18:30', dress: 'Chamber dress.', pickupTime: '21:30',
  }),
  // Starts in the afternoon and runs into the evening.
  ev('late', '2026-10-13', 'Rehearsal', ['sym'], { startTime: '16:00', endTime: '18:30', location: 'Room 2210' }),
  ev('r6', '2026-10-20', 'Rehearsal', ['sym'], { startTime: '14:10', location: 'Room 2210' }),
  // Cancelled. It must never be "the next concert" or count as required.
  ev('cx', '2026-10-24', 'Concert', ['sym'], {
    title: 'Dropped Concert', status: 'Cancelled', changeNote: 'Cancelled: the hall flooded.', attendanceEnsembleIds: ['cham'],
  }),
  // Both groups play, each its own piece, and one piece names no group.
  ev('cs', '2026-10-31', 'Concert', ['sym', 'cham'], {
    title: 'Autumn Showcase', startTime: '18:00', endTime: '20:00', location: 'Main Hall', pieceIds: ['overture', 'quartet', 'finale'],
  }),
  ev('c3', '2026-11-14', 'Concert', ['sym'], { title: 'Winter Preview' }),
];

const overrides = as<AskData['overrides']>([
  // Ada is pulled from Thursday's sectional.
  { id: 'o1', studentId: 'ada', ensembleId: 'sym', action: 'remove', scope: 'event', eventId: 'sec', reason: `${P}-REASON` },
  // Other people's pull-outs, one of them from Ada's own rehearsal today:
  // they must not matter to Ada.
  { id: 'o2', studentId: 'ben', ensembleId: 'cham', action: 'remove', scope: 'event', eventId: 'r4', reason: `${P}-REASON` },
  { id: 'o3', studentId: 'dee', ensembleId: 'sym', action: 'remove', scope: 'event', eventId: 'r1', reason: `${P}-REASON` },
]);

const pieces = as<Row<'pieces'>[]>([
  { id: 'overture', title: 'Invented Overture', composer: 'A. Composer', ensembleIds: ['sym'], order: 1, notes: `${P}-PNOTES` },
  { id: 'suite', title: 'Made-Up Suite', ensembleIds: ['sym'], order: 2 },
  { id: 'quartet', title: 'Pretend Quartet', ensembleIds: ['cham'], order: 3 },
  { id: 'finale', title: 'Shared Finale', ensembleIds: [], order: 4 },
]);

const assignments = as<Row<'assignments'>[]>([
  { id: 'a1', title: 'Scale Check', type: 'Playing Exam', dueDate: '2026-10-09', ensembleIds: ['sym'], createdAt: 1 },
  { id: 'a2', title: 'Hidden Quiz', type: 'Written Test', dueDate: '2026-10-07', ensembleIds: ['sym'], createdAt: 2, publishAt: LATER },
  { id: 'a3', title: 'Bowing Sheet', type: 'Other', dueDate: '2026-10-06', ensembleIds: ['sym'], createdAt: 3 },
  // Past its date and still taking answers.
  { id: 'a4', title: 'Open Quiz', type: 'Written Test', dueDate: '2026-10-01', ensembleIds: ['sym'], createdAt: 4, acceptsQuizSubmissions: true },
]);

const forms = as<Row<'forms'>[]>([
  { id: 'f1', title: 'Trip Permission', ensembleIds: ['sym'], families: [], deadline: '2026-10-08', questions: [], createdAt: 1 },
  { id: 'f2', title: 'Invited Few', ensembleIds: [], families: [], audienceMode: 'students', questions: [], createdAt: 2 },
  { id: 'f3', title: 'Hidden Form', ensembleIds: ['sym'], families: [], questions: [], createdAt: 3, publishAt: LATER },
  { id: 'f4', title: 'Shut Form', ensembleIds: ['sym'], families: [], closed: true, questions: [], createdAt: 4 },
  // For the high schoolers in a group that has a college student too.
  { id: 'f5', title: 'District Slip', ensembleIds: ['cham'], families: [], highSchoolOnly: true, questions: [], createdAt: 5 },
  // For anyone with the link. It is on the forms page, and it is nobody's to-do.
  { id: 'f6', title: 'Open Intake', ensembleIds: [], families: [], audienceMode: 'open', questions: [], createdAt: 6 },
]);

const LOG = { grade: `${P}-GRADE`, gradeNote: `${P}-GRADENOTE`, notes: `${P}-LNOTES`, repertoire: `${P}-LREP`, teacherEmail: `${P}-teacher@example.org`, studentInitials: `${P}-SI` };
const lessons = as<Row<'lessons'>[]>([
  { id: 'lt', studentId: 'ada', date: '2026-10-05', startTime: '16:00', endTime: '16:30', status: 'Scheduled', location: 'Studio 3', teacherName: 'Ms. Invented', ...LOG },
  { id: 'l1', studentId: 'ada', date: '2026-10-07', startTime: '15:00', endTime: '15:30', status: 'Scheduled', location: 'Studio 3', teacherName: 'Ms. Invented', ...LOG },
  // Over by ten o'clock.
  { id: 'l0', studentId: 'ben', date: '2026-10-05', startTime: '09:00', endTime: '09:30', status: 'Scheduled', location: 'Studio 1', teacherName: 'Mr. Madeup', ...LOG },
  { id: 'l2', studentId: 'ben', date: '2026-10-12', startTime: '09:00', status: 'Scheduled', location: 'Studio 1', teacherName: 'Mr. Madeup', ...LOG },
  { id: 'l3', studentId: 'cy', date: '2026-10-06', startTime: '10:00', status: 'Cancelled', teacherName: 'Mr. Madeup', ...LOG },
]);

const charts = as<Row<'charts'>[]>([
  { id: 'ch1', ensembleId: 'sym', title: 'Fall Seating', date: '2026-09-20', createdAt: 2,
    sections: [{ section: 'Violin 1', seats: [{ studentId: 'zed' }, { studentId: 'ada', note: `${P}-SEATNOTE` }] }] },
  // One work's personnel, and newer. It is not the group's chart.
  { id: 'ch2', ensembleId: 'sym', title: 'Suite Personnel', pieceIds: ['suite'], date: '2026-10-01', createdAt: 3,
    sections: [{ section: 'Oboe', seats: [{ studentId: 'ada' }] }] },
  // Last year's.
  { id: 'ch0', ensembleId: 'sym', title: 'Last Year Seating', date: '2025-09-01', createdAt: 1,
    sections: [{ section: 'Violin 2', seats: [{ studentId: 'ada' }] }] },
]);

const announcements = as<Row<'announcements'>[]>([
  { id: 'n1', ensembleId: null, title: 'Bus leaves early', createdAt: NOW - 1000, createdByEmail: `${P}-by@example.org` },
  { id: 'n2', ensembleId: null, title: 'Hidden Post', createdAt: NOW - 500, publishAt: LATER },
  { id: 'n3', ensembleId: null, title: 'Expired Post', createdAt: NOW - 900, expiresOn: '2026-10-01' },
  { id: 'n4', ensembleId: null, title: 'Archived Post', createdAt: NOW - 800, archivedAt: NOW - 100 },
  // Addressed to one group.
  { id: 'n5', ensembleId: 'cham', title: 'Chamber folders', createdAt: NOW - 700 },
]);

const locations = [{ room: 'Room 2210', label: 'Orchestra Room', directions: 'Second floor.', mapAnchor: 'r2210' }];

const data: AskData = { students, events, overrides, ensembles, pieces, assignments, forms, lessons, charts, announcements, locations };

/** What must never be seen: scheduled, expired, archived, closed, or by invitation. */
const HIDDEN = [
  'a2', 'f2', 'f3', 'f4', 'n2', 'n3', 'n4',
  'Hidden Quiz', 'Invited Few', 'Hidden Form', 'Shut Form', 'Hidden Post', 'Expired Post', 'Archived Post',
];

/* The formatters are stand-ins that wrap what they are given, so a time or a
 * date in a sentence that did NOT come through them is easy to see. The
 * announcements filter and the seating address are the app's own. */
const use: AskOptions['use'] = {
  time: t => `<${t}>`,
  date: d => `{${d}}`,
  visibleAnnouncements: lift('src/director/hooks/useAnnouncements.ts', 'visibleAnnouncements'),
  seatingChartPath: lift('src/director/seating/seatingLink.ts', 'seatingChartPath'),
  // Friday the 9th is a district day off. The college is open. Like the
  // real calendars, this knows closures and nothing about what year it is.
  isSchoolDay: (d, campus) => !(campus === 'hs' && d === '2026-10-09'),
  schoolYear: { hs: { from: '2026-08-17', to: '2027-06-04' }, college: { from: '2026-08-24', to: '2027-05-07' } },
};
const base: AskOptions = {
  lang: 'en', today: TODAY, now: NOW, timeZone: ZONE, saved: [], use,
  features: { absenceReport: true, campusMap: true }, contact: 'office@example.org',
};

const G = (id: string, name: string): AskName => ({ kind: 'group', name, id });
const SYM = G('sym', 'Symphony Orchestra');
const CHAM = G('cham', 'Chamber Players');
const room = (name: string): AskName => ({ kind: 'room', name });
const concert = (id: string, name: string): AskName => ({ kind: 'concert', name, id });
const named = (m: AskName) => ({ about: m.name, match: m });
const C2 = named(concert('c2', 'Chamber Night'));
const q = (intent: AskIntent, rest: Partial<AskReading> = {}): AskParse => ({ intent, confident: true, suggestions: [], ...rest });
const ask = (reading: AskParse, saved: string[] = [], more: Partial<AskOptions> = {}, d: AskData = data) =>
  answerAsk(reading, d, { ...base, saved, ...more });

const sig = (c: AskCard) =>
  `${c.kind}:${c.id}${'label' in c && c.label ? '!prep' : ''}${'attendanceOnly' in c && c.attendanceOnly ? '!aud' : ''}`;
const cardsOf = (a: AskAnswer) => a.cards.map(sig);
/** Every sentence and card an answer holds, whoever it is for. */
const everything = (a: AskAnswer) => {
  const each = a.forWho.kind === 'several' ? a.forWho.each : [];
  return {
    sentences: [a.sentence, ...each.map(e => e.sentence)],
    cards: [...a.cards, ...each.flatMap(e => e.cards)],
  };
};

/* ── 1. Every public intent is answered. A staff one is not. ──────────── */

const publicIntents = [...new Set(PUBLIC_TEMPLATES.map(t => t.intent))];
for (const i of publicIntents) {
  check(`1. the public templates can return "${i}", so answer.ts must answer it`, (ASK_ANSWERS as readonly string[]).includes(i));
}
for (const i of ['none', 'staffWhosOut', 'staffContact', 'staffRoster'] as AskIntent[]) {
  const got = ask(q(i, { when: 'today' }), ['ada']);
  check(`1. "${i}" is not answered`, got.state === 'notUnderstood' && got.cards.length === 0 && !got.showing);
}
// A template can hand back a word from its own table as what the question
// is about ("sectional", "finals", "teacher"). Each one must be a word this
// file has decided about: answered, or said plainly not to be held. A new
// word nobody decided about fails here.
{
  let words = 0;
  for (const t of PUBLIC_TEMPLATES) {
    for (const m of t.t.matchAll(/\{([^}]+)\}/g)) {
      for (const about of m[1].split('|').flatMap(w => (MACROS[w] ?? w).split('|'))) {
        words++;
        const got = ask(q(t.intent, { about, ...(t.when ? { when: t.when } : {}) }), ['ada']);
        check(`1. "${about}" in a "${t.intent}" template is a word answer.ts has decided about`,
          got.sentence !== 'I do not have an answer for that.' && !!got.showing, `${got.state}: ${got.sentence}`);
      }
    }
  }
  check('1. the templates do hand back table words', words >= 20, String(words));
}

/* ── 2. Each intent: state, sentence and cards. ───────────────────────── */

const NONE = 'I do not have an answer for that.';
const NOT_HELD = 'The Hub does not have that.';
const OVERTURE: AskName = { kind: 'piece', name: 'Invented Overture', id: 'overture' };
type Case = [label: string, reading: AskParse, saved: string[], state: AskAnswer['state'], sentence: string, cards: string[], more?: Partial<AskOptions>];
const CASES: Case[] = [
  /* My day. Lessons are in it, as they are on the student's own page. */
  ['myDay today, a rehearsal and a lesson', q('myDay', { when: 'today' }), ['ada'], 'answered',
    '2 things today. Next: Symphony Orchestra, <14:10>, Room 2210.', ['event:r1', 'lesson:lt']],
  ['myDay tomorrow', q('myDay', { when: 'tomorrow' }), ['ada'], 'answered',
    'Symphony Orchestra, tomorrow <14:10>, Room 2210.', ['event:r2']],
  ['myDay this week', q('myDay', { when: 'thisWeek' }), ['ada'], 'answered',
    '5 things this week. First: Symphony Orchestra, today <14:10>, Room 2210.',
    ['event:r1', 'lesson:lt', 'event:r2', 'lesson:l1', 'event:c1']],
  // A count over a month carries no dates of its own: the line after it does.
  ['myDay over a month', q('myDay', { when: 'month:10' }), ['ada'], 'answered',
    '9 things. First: Symphony Orchestra, today <14:10>, Room 2210.',
    ['event:r1', 'lesson:lt', 'event:r2', 'lesson:l1', 'event:c1', 'event:late', 'event:c2!aud', 'event:r6', 'event:cx', 'event:cs']],
  ['myDay, a day with only a lesson', q('myDay', { when: 'weekday:wed' }), ['ada'], 'answered',
    'Lesson, {2026-10-07} <15:00>, Studio 3, Ms. Invented.', ['lesson:l1']],
  ['myDay on a day she is pulled out', q('myDay', { when: 'weekday:thu' }), ['ada'], 'answered',
    'Nothing is on your schedule {2026-10-08}.', []],
  ['myDay, the next sectional (pulled out)', q('myDay', { when: 'next', about: 'sectional' }), ['ada'], 'answered',
    'Nothing is on your schedule.', []],
  ['myDay, only a cancelled rehearsal', q('myDay', { when: 'tomorrow' }), ['ben'], 'answered',
    'Chamber Players, tomorrow <13:00>: Cancelled.', ['event:r3']],
  ['myDay for a named group, nobody saved', q('myDay', { when: 'next', ...named(SYM) }), [], 'answered',
    'Symphony Orchestra, today <14:10>, Room 2210.', ['event:r1']],
  /* A group named does not stand in for the saved student. */
  ['a named group she is pulled out of', q('myDay', { when: 'weekday:thu', ...named(SYM) }), ['ada'], 'answered',
    'Symphony Orchestra is not on your schedule {2026-10-08}.', ['group:sym']],
  ['a named group he is not in', q('myDay', { when: 'tomorrow', ...named(SYM) }), ['ben'], 'answered',
    'Symphony Orchestra is not on your schedule tomorrow.', ['group:sym']],
  ['a named group she is in', q('myDay', { when: 'tomorrow', ...named(SYM) }), ['ada'], 'answered',
    'Symphony Orchestra, tomorrow <14:10>, Room 2210.', ['event:r2']],
  ['where is a named group she is pulled out of', q('where', { when: 'weekday:thu', ...named(SYM) }), ['ada'], 'answered',
    'Symphony Orchestra is not on your schedule {2026-10-08}.', ['group:sym']],
  ['what is a named group playing, asked by somebody not in it', q('playing', { when: 'tomorrow', ...named(SYM) }), ['ben'], 'answered',
    'Symphony Orchestra is not on your schedule tomorrow.', ['group:sym']],
  /* Where. */
  ['where today', q('where', { when: 'today' }), ['ada'], 'answered',
    'Symphony Orchestra, today <14:10>, Room 2210.', ['event:r1']],
  ['where, no room listed', q('where', { when: 'weekday:fri' }), ['ben'], 'nothingPosted',
    'No room is listed for Chamber Players, {2026-10-09} <13:00> yet.', ['event:r5']],
  ['where is a room', q('where', named(room('Room 2210'))), ['ada'], 'answered',
    'Room 2210: Orchestra Room. Second floor.', ['place:Room 2210']],
  ['where is a room the directory does not list', q('where', named(room('Room 12'))), [], 'nothingPosted',
    'No directions are posted for that room yet.', []],
  ['where is a room no record names', q('where', named(room('Room 77'))), [], 'notUnderstood', NONE, []],
  ['are we in that room today', q('where', { when: 'today', ...named(room('Room 2210')) }), ['ada'], 'answered',
    'Symphony Orchestra, today <14:10>, Room 2210.', ['event:r1']],
  ['are we in another room today', q('where', { when: 'today', ...named(room('Room 9')) }), ['ada'], 'answered',
    'Symphony Orchestra, today <14:10>, Room 2210.', ['event:r1']],
  /* Cancelled: the event and its stored status. The note is on the card. */
  ['cancelled', q('cancelled', { when: 'tomorrow' }), ['ben'], 'answered',
    'Chamber Players, tomorrow <13:00>: Cancelled.', ['event:r3']],
  ['moved, not cancelled', q('cancelled', { when: 'weekday:wed' }), ['cy'], 'answered',
    'Chamber Players, {2026-10-07} <13:00>, Room 9: Scheduled.', ['event:r4']],
  ['nothing cancelled or changed', q('cancelled', { when: 'today' }), ['ada'], 'answered',
    'Nothing is cancelled or changed today.', ['event:r1']],
  ['nothing cancelled or changed, on a date', q('cancelled', { when: 'weekday:fri' }), ['ben'], 'answered',
    'Nothing is cancelled or changed {2026-10-09}.', ['event:r5']],
  ['two things changed in a week', q('cancelled', { when: 'thisWeek' }), ['cy'], 'answered',
    'Chamber Players, tomorrow <13:00>: Cancelled. Chamber Players, {2026-10-07} <13:00>, Room 9: Scheduled.', ['event:r3', 'event:r4']],
  /* Playing. */
  ['playing, nothing listed', q('playing', { when: 'today' }), ['ada'], 'nothingPosted',
    'No music is listed for this rehearsal yet. Preparing for Fall Concert, {2026-10-10}.',
    ['event:r1', 'event:c1!prep', 'piece:overture!prep', 'piece:suite!prep']],
  // The Suite has a personnel chart of its own, and it does not seat Fay.
  ['playing, nothing listed, and the day has several', q('playing', { when: 'today' }), ['fay'], 'nothingPosted',
    'No music is listed yet for Symphony Orchestra, today <14:10>, Room 2210. Preparing for Fall Concert, {2026-10-10}.',
    ['event:e0', 'event:r1', 'event:c1!prep', 'piece:overture!prep']],
  ['playing, music listed', q('playing', { when: 'tomorrow' }), ['ada'], 'answered',
    'Symphony Orchestra, tomorrow: Invented Overture.', ['event:r2', 'piece:overture']],
  ['playing at the next concert', q('playing', { when: 'next' }), ['ada'], 'answered',
    'Fall Concert, {2026-10-10}: Invented Overture, Made-Up Suite.', ['event:c1', 'piece:overture', 'piece:suite']],
  ['playing, a named group, nobody saved', q('playing', { when: 'today', ...named(SYM) }), [], 'nothingPosted',
    'No music is listed for this rehearsal yet. Preparing for Fall Concert, {2026-10-10}.',
    ['event:r1', 'event:c1!prep', 'piece:overture!prep', 'piece:suite!prep']],
  ['playing, on a day with only a concert she attends', q('playing', { when: 'date:10-17' }), ['ada'], 'answered',
    'You are in the audience: Chamber Night, {2026-10-17} <19:30>, Small Hall.', ['event:c2!aud']],
  ['playing, on a day with only a cancelled rehearsal', q('playing', { when: 'tomorrow' }), ['ben'], 'answered',
    'Chamber Players, tomorrow <13:00>: Cancelled.', ['event:r3']],
  ['playing at a named concert she only attends', q('playing', C2), ['ada'], 'answered',
    'You are in the audience: Chamber Night, {2026-10-17} <19:30>, Small Hall.', ['event:c2!aud']],
  ['the program of a named concert, nobody saved', q('playing', C2), [], 'answered',
    'Chamber Night, {2026-10-17}: Pretend Quartet.', ['event:c2', 'piece:quartet']],
  /* Lessons. */
  ['lesson, the next one', q('lesson', { when: 'next' }), ['ada'], 'answered',
    'Your next lesson: today <16:00>, Studio 3, Ms. Invented.', ['lesson:lt']],
  ['lesson, the next one, when today\'s is over', q('lesson', { when: 'next' }), ['ben'], 'answered',
    'Your next lesson: {2026-10-12} <09:00>, Studio 1, Mr. Madeup.', ['lesson:l2']],
  ['lesson on a day', q('lesson', { when: 'weekday:wed' }), ['ada'], 'answered',
    'Your lesson: {2026-10-07} <15:00>, Studio 3, Ms. Invented.', ['lesson:l1']],
  ['lesson today, none', q('lesson', { when: 'today' }), ['cy'], 'answered', 'No lesson is on your schedule today.', []],
  ['lesson, cancelled', q('lesson', { when: 'tomorrow' }), ['cy'], 'answered', 'Lesson, tomorrow <10:00>, Mr. Madeup: Cancelled.', ['lesson:l3']],
  /* Due. */
  ['due', q('due'), ['ada'], 'answered',
    '3 things are due. First: Bowing Sheet, tomorrow.', ['assignment:a3', 'assignment:a1', 'assignment:a4', 'page:assignments']],
  ['due, an exam', q('due', { about: 'exam' }), ['ada'], 'answered',
    '2 things are due. First: Scale Check, {2026-10-09}.', ['assignment:a1', 'assignment:a4', 'page:assignments']],
  ['due, a playing exam', q('due', { about: 'playing exam' }), ['ada'], 'answered',
    'Scale Check is due {2026-10-09}.', ['assignment:a1', 'page:assignments']],
  ['due today: past its date and still open', q('due', { when: 'today' }), ['ada'], 'answered',
    'Open Quiz was due {2026-10-01}.', ['assignment:a4', 'page:assignments']],
  ['due, nothing', q('due'), ['ben'], 'answered', 'Nothing is due.', ['page:assignments']],
  ['due for a named group: the scheduled one stays out', q('due', named(SYM)), [], 'answered',
    '3 things are due. First: Bowing Sheet, tomorrow.', ['assignment:a3', 'assignment:a1', 'assignment:a4', 'page:assignments']],
  ['due, by name', q('due', named({ kind: 'assignment', name: 'Scale Check', id: 'a1' })), [], 'answered',
    'Scale Check is due {2026-10-09}.', ['assignment:a1']],
  /* Seat: the group's own chart, not one work's and not last year's. */
  ['seat', q('seat'), ['ada'], 'answered', 'Violin 1, chair 2, on Fall Seating.', ['seating:ch1']],
  ['seat, no chart', q('seat'), ['ben'], 'nothingPosted', 'No seating chart with your name is posted yet.', []],
  ['seat, a named group, nobody saved', q('seat', named(SYM)), [], 'answered',
    'The seating chart for Symphony Orchestra: Fall Seating.', ['seating:ch1']],
  ['seat, a named group she is not seated in', q('seat', named(SYM)), ['dee'], 'nothingPosted',
    'You are not on the seating chart for Symphony Orchestra.', ['seating:ch1']],
  /* Parts. */
  ['parts', q('parts'), ['ada'], 'answered',
    "3 pieces are on your schedule. Your part is on each piece's page.", ['piece:overture', 'piece:suite', 'piece:finale']],
  ['parts of a named piece', q('parts', named(OVERTURE)), [], 'answered',
    'The parts for Invented Overture are on its page.', ['piece:overture']],
  /* Forms. */
  ['forms, one waiting', q('forms'), ['ada'], 'answered',
    '1 form is waiting. Trip Permission, by {2026-10-08}.', ['form:f1', 'page:forms']],
  ['forms, for the high schoolers in a group', q('forms'), ['ben'], 'answered', '1 form is waiting. District Slip.', ['form:f5', 'page:forms']],
  ['forms, not for the college student in that group', q('forms'), ['cy'], 'answered', 'No forms are waiting for you.', ['page:forms']],
  ['forms, a named form', q('forms', named({ kind: 'form', name: 'Trip Permission', id: 'f1' })), [], 'answered',
    'Trip Permission is open until {2026-10-08}.', ['form:f1']],
  ['forms, one for anyone with the link, by name', q('forms', named({ kind: 'form', name: 'Open Intake', id: 'f6' })), ['ada'], 'answered',
    'Open Intake is open.', ['form:f6']],
  ['forms, a table word', q('forms', { about: 'masterclass' }), ['ada'], 'answered', 'Forms are on the Forms page.', ['page:forms']],
  /* Concerts. */
  ['concert, the next one', q('concert', { when: 'next' }), ['ada'], 'answered',
    'Fall Concert, {2026-10-10} <19:00>, Main Hall.', ['event:c1', 'page:concerts']],
  ['concerts', q('concert'), ['ada'], 'answered',
    '4 concerts. Next: Fall Concert, {2026-10-10} <19:00>, Main Hall.',
    ['event:c1', 'event:c2!aud', 'event:cx', 'event:cs', 'event:c3', 'page:concerts']],
  ['concert, nobody saved', q('concert', { when: 'next' }), [], 'answered',
    'Fall Concert, {2026-10-10} <19:00>, Main Hall.', ['event:c1', 'page:concerts']],
  ['concert by name, one she attends', q('concert', C2), ['ada'], 'answered',
    'Chamber Night, {2026-10-17} <19:30>, Small Hall. You are in the audience for this one.', ['event:c2!aud', 'page:concerts']],
  ['concert by name, nobody saved', q('concert', C2), [], 'answered',
    'Chamber Night, {2026-10-17} <19:30>, Small Hall.', ['event:c2', 'page:concerts']],
  ['concert by a name last year\'s concert shares', q('concert', named(concert('cold', 'Fall Concert'))), [], 'answered',
    'Fall Concert, {2026-10-10} <19:00>, Main Hall.', ['event:c1', 'page:concerts']],
  ['concerts with a named piece on them', q('concert', named({ kind: 'piece', name: 'Pretend Quartet', id: 'quartet' })), [], 'answered',
    '2 concerts. Next: Chamber Night, {2026-10-17} <19:30>, Small Hall.', ['event:c2', 'event:cs', 'page:concerts']],
  ['the next concert, when a cancelled one comes first', q('concert', { when: 'next' }), ['ada'], 'answered',
    'Autumn Showcase, {2026-10-31} <18:00>, Main Hall.', ['event:cs', 'page:concerts'], { today: '2026-10-18', now: at('2026-10-18', '10:00') }],
  ['a cancelled concert by name', q('concert', named(concert('cx', 'Dropped Concert'))), [], 'answered',
    'Dropped Concert, {2026-10-24}: Cancelled.', ['event:cx', 'page:concerts']],
  ['concert, a season word', q('concert', { about: 'winter' }), ['ada'], 'notUnderstood', NOT_HELD, []],
  /* The day sheet. Call time and dress are a performer's. */
  ['call time', q('callTime', { when: 'next' }), ['ada'], 'answered', 'Call time for Fall Concert: {2026-10-10} <18:00>.', ['event:c1']],
  ['call time, for the one he plays', q('callTime', { when: 'next' }), ['ben'], 'answered', 'Call time for Chamber Night: {2026-10-17} <18:30>.', ['event:c2']],
  ['call time of a concert she only attends', q('callTime', C2), ['ada'], 'answered',
    'You are in the audience: Chamber Night, {2026-10-17} <19:30>, Small Hall.', ['event:c2!aud']],
  ['dress for a concert she only attends', q('dress', C2), ['ada'], 'answered',
    'You are in the audience: Chamber Night, {2026-10-17} <19:30>, Small Hall.', ['event:c2!aud']],
  ['call time of a concert not on his schedule', q('callTime', named(concert('c1', 'Fall Concert'))), ['ben'], 'answered',
    'Fall Concert is not on your schedule.', ['event:c1']],
  ['call time, not posted', q('callTime', named(concert('c3', 'Winter Preview'))), [], 'nothingPosted',
    'No call time is posted for Winter Preview yet.', ['event:c3']],
  ['dress', q('dress', { when: 'next' }), ['ada'], 'answered', 'What to wear for Fall Concert: Concert black.', ['event:c1']],
  ['dress, not posted', q('dress', named(concert('c3', 'Winter Preview'))), [], 'nothingPosted', 'No dress note is posted for Winter Preview yet.', ['event:c3']],
  ['pickup', q('pickup', { when: 'next' }), ['ada'], 'answered', 'Pickup for Fall Concert: {2026-10-10} <21:00>.', ['event:c1']],
  ['pickup from a concert she attends: when it ends', q('pickup', C2), ['ada'], 'answered', 'Chamber Night ends {2026-10-17} <21:00>.', ['event:c2!aud']],
  ['pickup, for the one he plays', q('pickup', { when: 'next' }), ['ben'], 'answered', 'Pickup for Chamber Night: {2026-10-17} <21:30>.', ['event:c2']],
  ['pickup, only an end time', q('pickup', named(concert('cs', 'Autumn Showcase'))), [], 'answered', 'Autumn Showcase ends {2026-10-31} <20:00>.', ['event:cs']],
  ['pickup, nothing posted', q('pickup', named(concert('c3', 'Winter Preview'))), [], 'nothingPosted', 'No pickup time is posted for Winter Preview yet.', ['event:c3']],
  /* Required. */
  ['required, mine', q('required'), ['ada'], 'answered',
    '4 concerts are on your schedule: 3 to play, 1 to attend.',
    ['event:c1', 'event:c2!aud', 'event:cs', 'event:c3', 'page:requiredConcerts', 'page:concertTally']],
  ['required, this week only', q('required', { when: 'thisWeek' }), ['ada'], 'answered',
    '1 concert is on your schedule this week: 1 to play, 0 to attend.', ['event:c1', 'page:requiredConcerts', 'page:concertTally']],
  ['required, this week, nobody saved', q('required', { when: 'thisWeek' }), [], 'answered',
    'No concert has a group required to attend this week.', ['page:requiredConcerts']],
  ['required, next week, nobody saved', q('required', { when: 'nextWeek' }), [], 'answered',
    '1 concert has groups required to attend next week.', ['event:c2', 'page:requiredConcerts']],
  ['required of a group, this week', q('required', { when: 'thisWeek', ...named(SYM) }), [], 'answered',
    'Symphony Orchestra: 1 to play, 0 to attend.', ['event:c1', 'group:sym', 'page:requiredConcerts']],
  ['required, one I attend', q('required', C2), ['ada'], 'answered',
    'You are required to attend Chamber Night.', ['event:c2!aud', 'page:requiredConcerts', 'page:concertTally']],
  ['required, one I play', q('required', C2), ['ben'], 'answered',
    'You play in Chamber Night.', ['event:c2', 'page:requiredConcerts', 'page:concertTally']],
  ['required, one not on my schedule', q('required', named(concert('c1', 'Fall Concert'))), ['ben'], 'answered',
    'Fall Concert is not on your schedule.', ['event:c1', 'page:requiredConcerts', 'page:concertTally']],
  ['required, a cancelled concert', q('required', named(concert('cx', 'Dropped Concert'))), ['ada'], 'answered',
    'Dropped Concert, {2026-10-24}: Cancelled.', ['event:cx', 'page:requiredConcerts', 'page:concertTally']],
  ['required, nobody saved: the cancelled one is not counted', q('required'), [], 'answered',
    '1 concert has groups required to attend.', ['event:c2', 'page:requiredConcerts']],
  ['required of a group: what it plays and what it attends', q('required', named(SYM)), [], 'answered',
    'Symphony Orchestra: 3 to play, 1 to attend.', ['event:c1', 'event:c2!aud', 'event:cs', 'event:c3', 'group:sym', 'page:requiredConcerts']],
  ['required of a group: a cancelled concert is nobody\'s duty', q('required', named(CHAM)), [], 'answered',
    'Chamber Players: 2 to play, 0 to attend.', ['event:c2', 'event:cs', 'group:cham', 'page:requiredConcerts']],
  /* School. */
  ['no school that day', q('noSchool', { when: 'weekday:fri' }), ['ada'], 'answered', 'No school {2026-10-09}.', ['page:calendar']],
  ['school that day, for a college student', q('noSchool', { when: 'weekday:fri' }), ['cy'], 'answered', 'There is school {2026-10-09}.', ['page:calendar']],
  ['no school on a Saturday', q('noSchool', { when: 'weekday:sat' }), [], 'answered', 'No school {2026-10-10}.', ['page:calendar']],
  ['the next day off', q('noSchool', { when: 'next' }), ['ada'], 'answered', 'The next day off is {2026-10-09}.', ['page:calendar']],
  ['days off this week', q('noSchool', { when: 'thisWeek' }), [], 'answered', 'No school: {2026-10-09}.', ['page:calendar']],
  ['a week with no day off', q('noSchool', { when: 'nextWeek' }), [], 'answered', 'There is school every weekday next week.', ['page:calendar']],
  ['this weekend', q('noSchool', { when: 'weekend' }), [], 'answered', 'No school this weekend.', ['page:calendar']],
  ['a break by name', q('noSchool', { about: 'winter break' }), ['ada'], 'notUnderstood', NOT_HELD, []],
  /* The rest. */
  ['group', q('group', named(SYM)), ['ada'], 'answered', 'Symphony Orchestra, with Dr. Invented Person.', ['group:sym']],
  ['piece', q('piece', named(OVERTURE)), [], 'answered', 'Invented Overture, by A. Composer.', ['piece:overture']],
  ['news, nobody saved: every post, a group\'s too', q('news'), [], 'answered',
    '2 announcements. Newest: Chamber folders.', ['announcement:n5', 'announcement:n1', 'page:announcements']],
  ['news, for a student: the school\'s and her groups\'', q('news'), ['ada'], 'answered',
    '1 announcement: Bus leaves early.', ['announcement:n1', 'page:announcements']],
  ['documents', q('documents'), [], 'answered', 'Documents are on the Documents page.', ['page:documents']],
  ['howAbsence', q('howAbsence', { when: 'today' }), [], 'answered', 'Use the Report an Absence page.', ['page:absence']],
  ['howSubmit', q('howSubmit'), [], 'answered', 'Open the assignment from the Assignments & Exams page and send your video there.', ['page:assignments']],
  ['howCheckin', q('howCheckin'), [], 'answered', 'Use the Concert Check-In page.', ['page:checkin']],
  ['howCalendar', q('howCalendar'), [], 'answered', 'Subscribe from the Calendar page, and it stays up to date.', ['page:calendar']],
  ['howCalendar, for a student', q('howCalendar'), ['ada'], 'answered', 'Subscribe from the My Schedule page, and it stays up to date.', ['page:mySchedule', 'page:calendar']],
  ['howCopy', q('howCopy'), [], 'answered', 'Use the Request Music Copies page.', ['page:copies']],
  ['howAlerts', q('howAlerts'), [], 'answered', 'The Start Here page shows how to turn on alerts.', ['page:start']],
  ['howFindMe', q('howFindMe'), [], 'answered', 'Use the Find My Schedule page.', ['page:lookup']],
  ['glossary', q('glossary', named({ kind: 'term', name: 'Call time' })), [], 'answered',
    'That word is in the glossary on the Start Here page.', ['page:glossary']],
  ['glossary, no term', q('glossary'), [], 'notUnderstood', NONE, []],
  // No page and no field: said plainly, never made up.
  ['parking', q('parking'), ['ada'], 'notUnderstood', NOT_HELD, []],
  ['tickets', q('tickets'), ['ada'], 'notUnderstood', NOT_HELD, []],
  ['bring', q('bring', { when: 'tomorrow' }), ['ada'], 'notUnderstood', NOT_HELD, []],
  ['how long, with no concert named', q('duration', { when: 'next' }), ['ada'], 'notUnderstood', NOT_HELD, []],
  ['how long, start and end stored', q('duration', C2), ['ada'], 'answered',
    'Chamber Night: starts {2026-10-17} <19:30>, ends <21:00>.', ['event:c2']],
  ['how long, only a start stored', q('duration', named(concert('c1', 'Fall Concert'))), [], 'nothingPosted',
    'Fall Concert: starts {2026-10-10} <19:00>. No end time is posted.', ['event:c1']],
  ['how long, no times stored', q('duration', named(concert('c3', 'Winter Preview'))), [], 'nothingPosted',
    'No times are posted for Winter Preview yet.', ['event:c3']],
  ['who is my teacher', q('whoStaff', { about: 'teacher' }), ['ada'], 'answered', 'Your lesson teacher is Ms. Invented.', ['lesson:lt']],
  ['who is my conductor', q('whoStaff', { about: 'conductor' }), ['ada'], 'answered', 'Symphony Orchestra, with Dr. Invented Person.', ['group:sym']],
  ['who is my teacher, nobody listed', q('whoStaff', { about: 'teacher' }), ['gus'], 'nothingPosted',
    'No teacher or conductor is listed for your groups yet.', ['group:cham']],
  ['how do I contact', q('contactStaff'), ['ada'], 'answered', 'Write to office@example.org.', []],
  ['a thing the records do not hold', q('group', named(G('ghost', 'Ghost Band'))), [], 'notUnderstood', NONE, []],
];
const seen = new Set<string>();
for (const [label, reading, saved, state, sentence, cards, more] of CASES) {
  const got = ask(reading, saved, more);
  seen.add(reading.intent);
  eq(`2. ${label}`, [got.state, got.sentence, cardsOf(got)], [state, sentence, cards]);
}
for (const i of ASK_ANSWERS) check(`2. a case above exercises "${i}"`, seen.has(i));
check('2. reporting an absence is not answered where the page is not mounted',
  ask(q('howAbsence'), [], { features: {} }).state === 'notUnderstood');
check('2. with no contact address handed in, contact is not answered',
  ask(q('contactStaff'), [], { contact: undefined }).sentence === NOT_HELD);
eq('2. with the contact page mounted, contact links to it',
  cardsOf(ask(q('contactStaff'), [], { features: { contactForm: true } })), ['page:contact']);
{
  // A group with no conductor printed still names the staff its page lists.
  const staffed = { ...data, ensembles: as<AskData['ensembles']>([...ensembles.slice(0, 1), { id: 'cham', name: 'Chamber Players', staff: [{ name: 'Mx. Placeholder', mdcEmail: 'not-printed@example.org' }] }]) };
  const got = ask(q('whoStaff', { about: 'director' }), ['ben'], {}, staffed);
  eq('2. who leads a group is the name its page lists, and never an address', got.sentence, 'Chamber Players, with Mx. Placeholder.');
}
{
  // Understood and not held is told apart from not understood by `showing`.
  const held = ask(q('tickets'), ['ada']);
  check('2. "the Hub does not have that" still says what was understood', held.showing?.intent === 'tickets' && held.forWho.kind === 'general');
  check('2. and nothing typed in an unreadable question is shown', ask(q('none'), ['ada']).showing === undefined);
  // A name of a kind the question cannot be about is not half-read: an
  // assignment on "what do I have", a piece on "where", a group on "lesson".
  for (const r of [
    q('myDay', { when: 'today', ...named({ kind: 'assignment', name: 'Scale Check', id: 'a1' }) }),
    q('where', { when: 'today', ...named(OVERTURE) }),
    q('lesson', { when: 'next', ...named(SYM) }),
    q('news', named(SYM)),
    q('noSchool', { when: 'tomorrow', ...named(concert('c1', 'Fall Concert')) }),
    q('duration', named(SYM)),
    q('myDay', { when: 'today', ...named(room('Room 2210')) }),
  ]) {
    const got = ask(r, ['ada']);
    check(`2. "${r.intent}" about a ${r.match?.kind} is not answered, and the name is not shown`,
      got.state === 'notUnderstood' && got.sentence === NONE && got.showing === undefined && got.cards.length === 0, JSON.stringify(got));
  }
  // No answer at all says nothing about what was asked.
  for (const r of [q('glossary'), q('myDay', { when: 'today', about: 'finals' }), q('group'), q('piece')]) {
    const got = ask(r, ['ada']);
    check(`2. "${r.intent}" with no answer carries no note of what was shown`, got.state === 'notUnderstood' && got.sentence === NONE && got.showing === undefined, JSON.stringify(got));
  }
  // "Saturday dec 9" is read as December 9 without checking the weekday, so
  // the date understood is always there to be shown.
  for (const [label, reading, saved, , , , more] of CASES) {
    const got = ask(reading, saved, more);
    if (got.showing) check(`2. ${label}: \`showing\` carries the day understood`, /^\d{4}-\d{2}-\d{2}$/.test(got.showing.from));
  }
  eq('2. a date is shown as the date it was read as', ask(q('myDay', { when: 'date:12-09' }), ['ada']).showing,
    { intent: 'myDay', when: 'date:12-09', from: '2026-12-09', to: '2026-12-09' });
}
{
  // The chart that is the group's own is not the newest chart: one work's
  // personnel is newer, and it seats her at another instrument.
  const noGeneral = { ...data, charts: charts.filter(c => c.id === 'ch2') };
  eq('2. with only a work\'s personnel posted, that chart still stands for the group',
    ask(q('seat'), ['ada'], {}, noGeneral).sentence, 'Oboe, chair 1, on Suite Personnel.');
  const lastYear = { ...data, charts: charts.filter(c => c.id !== 'ch1') };
  eq('2. last year\'s roster comes before this year\'s personnel for one work',
    cardsOf(ask(q('seat'), ['ada'], {}, lastYear)), ['seating:ch0']);
}

/* ── 3. Who it is for. ────────────────────────────────────────────────── */

const MY: AskParse[] = [
  q('myDay', { when: 'today' }), q('playing', { when: 'today' }), q('where', { when: 'today' }),
  q('cancelled', { when: 'today' }), q('lesson', { when: 'next' }), q('due'), q('seat'), q('parts'), q('forms'),
  q('whoStaff', { about: 'teacher' }),
];
{
  const two = ask(q('myDay', { when: 'tomorrow' }), ['ada', 'ben']);
  eq('3. two saved students get one answer each, in the saved order',
    two.forWho.kind === 'several' && two.forWho.each.map(e => [e.student.id, e.student.name, e.state, e.sentence]),
    [['ada', 'Ada', 'answered', 'Symphony Orchestra, tomorrow <14:10>, Room 2210.'],
      ['ben', 'Ben', 'answered', 'Chamber Players, tomorrow <13:00>: Cancelled.']]);
  check('3. with several, the answer itself holds no sentence and no cards', two.sentence === '' && two.cards.length === 0);
  const flipped = ask(q('myDay', { when: 'today' }), ['ben', 'ada']);
  check('3. no "first child": the order is the saved order',
    flipped.forWho.kind === 'several' && flipped.forWho.each[0].student.id === 'ben');
  const one = ask(q('myDay', { when: 'today' }), ['ada']);
  eq('3. one saved student: the answer is for them, by first name', one.forWho, { kind: 'one', student: { id: 'ada', name: 'Ada' } });
  eq('3. a student who goes by another name is called that', ask(q('myDay', { when: 'today' }), ['fay']).forWho,
    { kind: 'one', student: { id: 'fay', name: 'Faye' } });

  for (const r of MY) {
    for (const [why, saved] of [['nobody saved', []], ['an archived student', ['eli']], ['a student who is gone', ['nobody-here']]] as const) {
      const got = ask(r, [...saved]);
      check(`3. "${r.intent}" with ${why} asks who is asking`,
        got.state === 'needsWho' && got.forWho.kind === 'nobody' && got.cards.length === 0 && got.sentence === 'Who is asking?',
        `${got.state}: ${got.sentence}`);
    }
    const mixed = ask(r, ['eli', 'ada', 'nobody-here']);
    check(`3. "${r.intent}": an archived id beside a real one is simply left out`, mixed.forWho.kind === 'one' && mixed.forWho.student.id === 'ada');
    check(`3. "${r.intent}" is not answered where student pages are off`,
      ask(r, ['ada'], { generalOnly: true }).state === 'notUnderstood');
  }
  for (const r of [q('group', named(SYM)), q('documents'), q('howCopy'), q('piece', named(OVERTURE)), q('due', named(SYM)), q('contactStaff')]) {
    for (const saved of [[], ['ada'], ['ada', 'ben']]) {
      const got = ask(r, saved);
      check(`3. "${r.intent}" is the same for everyone: it never asks who (${saved.length} saved)`,
        got.state === 'answered' && got.forWho.kind === 'general');
    }
  }
  // A named concert is a fact with nobody saved, and each student's own
  // relation to it once they are.
  const forTwo = ask(q('required', C2), ['ada', 'ben']);
  eq('3. a named concert is answered for each saved student',
    forTwo.forWho.kind === 'several' && forTwo.forWho.each.map(e => e.sentence),
    ['You are required to attend Chamber Night.', 'You play in Chamber Night.']);
  const off = ask(q('concert', { when: 'next' }), ['ada'], { generalOnly: true });
  check('3. where student pages are off, a concert question is answered for everyone', off.state === 'answered' && off.forWho.kind === 'general');
}

/* ── 4. A change carries the director's note, and only that. ──────────── */
{
  const en = ask(q('cancelled', { when: 'tomorrow' }), ['ben']);
  const es = ask(q('cancelled', { when: 'tomorrow' }), ['ben'], { lang: 'es' });
  const noteOf = (a: AskAnswer) => a.cards.flatMap(c => (c.kind === 'event' ? [[c.status, c.changeNote]] : []));
  eq('4. the card carries the status as stored and the note word for word', noteOf(en), [['Cancelled', NOTE]]);
  eq('4. a Spanish reader gets the confirmed Spanish note', noteOf(es), [['Cancelled', NOTE_ES]]);
  const reworded = { ...data, events: events.map(e => (e.id === 'r3' ? { ...e, changeNote: 'Something else entirely.', changeNoteEs: undefined } : e)) };
  const other = ask(q('cancelled', { when: 'tomorrow' }), ['ben'], {}, reworded);
  check('4. the sentence is the same whatever the note says', other.sentence === en.sentence);
  eq('4. and the card follows the note', noteOf(other), [['Cancelled', 'Something else entirely.']]);
  const bare = { ...data, events: events.map(e => (e.id === 'r3' ? { ...e, changeNote: undefined, changeNoteEs: undefined } : e)) };
  const none = ask(q('cancelled', { when: 'tomorrow' }), ['ben'], {}, bare);
  check('4. with no note there is no note on the card, and the sentence is unchanged',
    none.sentence === en.sentence && none.cards.every(c => !('changeNote' in c)));
  const blank = { ...data, events: events.map(e => (e.id === 'r4' ? { ...e, changeNote: '   ' } : e)) };
  eq('4. a note that is only spaces is no note', [ask(q('cancelled', { when: 'weekday:wed' }), ['cy'], {}, blank).sentence],
    ['Nothing is cancelled or changed {2026-10-07}.']);
  const moved = ask(q('myDay', { when: 'weekday:wed' }), ['cy']);
  eq('4. a moved rehearsal carries its note on any answer', noteOf(moved), [['Scheduled', 'Moved to Room 9 today.']]);
  const odd = { ...data, events: events.map(e => (e.id === 'r4' ? as<Row<'events'>>({ ...e, status: 'Postponed' }) : e)) };
  eq('4. a status this file has no word for is printed as stored', ask(q('cancelled', { when: 'weekday:wed' }), ['cy'], {}, odd).sentence,
    'Chamber Players, {2026-10-07} <13:00>, Room 9: Postponed.');
  for (const a of [en, es, other, moved]) {
    check('4. no sentence repeats a note', !/hall is closed|sala está cerrada|Something else|Moved to Room/.test(a.sentence), a.sentence);
  }
}

/* ── 5. Preparing for. ────────────────────────────────────────────────── */
{
  const got = ask(q('playing', { when: 'today' }), ['ada']);
  check('5. "No music is listed" is its own state', got.state === 'nothingPosted');
  check('5. it leads with the plain sentence', got.sentence.startsWith('No music is listed for this rehearsal yet.'));
  const prep = got.cards.filter(c => 'label' in c && c.label === 'preparingFor');
  eq('5. then the next concert of that group and its pieces, each labelled', prep.map(sig), ['event:c1!prep', 'piece:overture!prep', 'piece:suite!prep']);
  check('5. the rehearsal itself is not labelled', cardsOf(got)[0] === 'event:r1');
  // Fay plays in both groups. Friday's rehearsal is Chamber's, so what she is
  // preparing for is Chamber's next concert, not Symphony's sooner one.
  const cham = ask(q('playing', { when: 'weekday:fri' }), ['fay']);
  eq('5. it is THAT group\'s next concert', cardsOf(cham), ['event:r5', 'event:c2!prep', 'piece:quartet!prep']);
  // On the 20th Symphony rehearses. Its next concert is cancelled, so the
  // one after is what it prepares for: both groups play that one, and only
  // Symphony's pieces (and the one that names no group) are listed.
  const later = { today: '2026-10-19', now: at('2026-10-19', '10:00') };
  const shared = ask(q('playing', { when: 'tomorrow' }), ['fay'], later);
  eq('5. a cancelled concert is skipped, and only that group\'s pieces are listed', cardsOf(shared),
    ['event:r6', 'event:cs!prep', 'piece:overture!prep', 'piece:finale!prep']);
  eq('5. the same, asked by the group\'s name with nobody saved', cardsOf(ask(q('playing', { when: 'tomorrow', ...named(SYM) }), [], later)),
    ['event:r6', 'event:cs!prep', 'piece:overture!prep', 'piece:finale!prep']);
  const bare = { ...data, pieces: [] };
  const nothing = ask(q('playing', { when: 'today' }), ['ada'], {}, bare);
  eq('5. with no program posted anywhere, only the rehearsal shows', [nothing.state, nothing.sentence, cardsOf(nothing)],
    ['nothingPosted', 'No music is listed for this rehearsal yet.', ['event:r1']]);
}

/* ── The sweep: every intent, every date word, everybody, both languages. ── */

const EVERYONE = [[], ['ada'], ['ben'], ['cy'], ['fay'], ['ada', 'ben', 'cy']];
const WHENS: (AskWhen | undefined)[] = [undefined, 'today', 'tonight', 'tomorrow', 'thisWeek', 'nextWeek', 'weekend', 'next', 'weekday:fri', 'date:10-17', 'month:10', 'month:05'];
const THINGS: (Partial<AskReading> | undefined)[] = [undefined, named(SYM), named(CHAM), C2, named(concert('cx', 'Dropped Concert')), named(room('Room 2210')), named(OVERTURE)];
interface Swept { intent: AskIntent; when?: AskWhen; saved: string[]; lang: 'en' | 'es'; got: AskAnswer; what: string }
/** A formatter whose time ends in a full stop, as a Spanish one does. */
const dotted: AskOptions['use'] = { ...use, time: t => `<${t}> p.m.` };
const SWEEP: Swept[] = [];
for (const intent of ASK_ANSWERS) {
  for (const when of WHENS) {
    for (const thing of THINGS) {
      for (const saved of EVERYONE) {
        for (const lang of ['en', 'es'] as const) {
          const got = ask(q(intent, { ...(when ? { when } : {}), ...thing }), saved, { lang, use: dotted });
          SWEEP.push({ intent, when, saved, lang, got, what: `${intent} ${when ?? ''} ${thing?.about ?? ''} for ${saved.join('+') || 'nobody'} (${lang})` });
        }
      }
    }
  }
}
check('the sweep really ran', SWEEP.length === ASK_ANSWERS.length * WHENS.length * THINGS.length * EVERYONE.length * 2, String(SWEEP.length));

/* ── 6. Nothing hidden, however it is asked for. ──────────────────────── */
{
  const hiddenIn = (a: AskAnswer) => {
    const text = JSON.stringify(a);
    return HIDDEN.find(h => new RegExp(h.includes(' ') ? h : `"${h}"|/${h}\\b`).test(text));
  };
  for (const s of SWEEP) {
    const h = hiddenIn(s.got);
    if (h) check(`6. "${h}" must never appear (${s.what})`, false, JSON.stringify(s.got));
  }
  // Asked for by name, with every intent: the ONE lookup does not find it,
  // so it is not in a sentence, a card, `showing` or a chip.
  const BY_NAME: AskName[] = [
    { kind: 'assignment', id: 'a2', name: 'Hidden Quiz' },
    { kind: 'form', id: 'f3', name: 'Hidden Form' },
    { kind: 'form', id: 'f2', name: 'Invited Few' },
    { kind: 'form', id: 'f4', name: 'Shut Form' },
  ];
  let asked = 0;
  for (const m of BY_NAME) {
    for (const intent of ASK_ANSWERS) {
      for (const saved of [[], ['ada']]) {
        // By its id, and by its name alone.
        for (const match of [m, { kind: m.kind, name: m.name }]) {
          const got = ask(q(intent, { when: 'today', about: m.name, match }), saved);
          asked++;
          check(`6. "${m.name}" asked for by name on "${intent}" is not found`,
            got.state === 'notUnderstood' && got.showing === undefined && got.cards.length === 0 && got.followUps.length === 0
            && !JSON.stringify(got).includes(m.name), JSON.stringify(got));
        }
      }
    }
  }
  check('6. the by-name sweep really ran', asked === BY_NAME.length * ASK_ANSWERS.length * 4);
  const posted = ask(q('due'), ['ada'], { now: LATER + 1 });
  check('6. and once its moment passes, the assignment shows', cardsOf(posted).includes('assignment:a2'));
  eq('6. and can then be asked for by name', ask(q('due', named({ kind: 'assignment', id: 'a2', name: 'Hidden Quiz' })), [], { now: LATER + 1 }).sentence,
    'Hidden Quiz is due {2026-10-07}.');
  const sent = ask(q('forms'), ['ada'], { sentFormIds: ['f1'] });
  check('6. a form this phone already sent is not waiting', sent.sentence === 'No forms are waiting for you.');
  // The group's own list of forms and of work leaves the hidden ones out.
  eq('6. forms for a named group: the scheduled and the closed stay out', cardsOf(ask(q('forms', named(SYM)), [])), ['form:f1', 'page:forms']);
}

/* ── 7. In the audience is not playing. ───────────────────────────────── */
{
  const parts = ask(q('parts'), ['ada']);
  check('7. a concert she only attends adds no piece to her music', !cardsOf(parts).includes('piece:quartet'));
  // After the Fall Concert her next concert is one she only attends.
  const after = { today: '2026-10-11', now: at('2026-10-11', '10:00') };
  const next = ask(q('concert', { when: 'next' }), ['ada'], after);
  eq('7. her next concert is the one she attends, and it says so', [next.sentence, cardsOf(next)],
    ['Chamber Night, {2026-10-17} <19:30>, Small Hall. You are in the audience for this one.', ['event:c2!aud', 'page:concerts']]);
  const program = ask(q('playing', { when: 'next' }), ['ada'], after);
  eq('7. "what are we playing at the next concert" skips it, and the cancelled one', [program.state, program.sentence, cardsOf(program)],
    ['answered', 'Autumn Showcase, {2026-10-31}: Invented Overture, Shared Finale.', ['event:cs', 'piece:overture', 'piece:finale']]);
  const week = ask(q('playing', { when: 'nextWeek' }), ['ada'], after);
  check('7. and it gives her nothing to practise', !everything(week).cards.some(c => c.id === 'quartet'));
  const call = ask(q('callTime', { when: 'next' }), ['ada'], after);
  eq('7. call time is for a concert she plays', cardsOf(call), ['event:cs']);
  for (const s of SWEEP.filter(x => x.saved.join() === 'ada' && (x.intent === 'callTime' || x.intent === 'dress'))) {
    check(`7. the players' call time and dress never reach somebody in the audience (${s.what})`,
      !/<18:30>|Chamber dress|vestuario.*Chamber/.test(s.got.sentence), s.got.sentence);
  }
  for (const s of SWEEP.filter(x => x.saved.join() === 'ada' && x.intent === 'pickup')) {
    check(`7. the players' pickup time never reaches somebody in the audience (${s.what})`, !s.got.sentence.includes('<21:30>'), s.got.sentence);
  }
}

/* ── 8. The short path is the same answer. ────────────────────────────── */
{
  const short: AskData = {
    ...data,
    students: students.filter(s => s.id === 'ada'),
    overrides: overrides.filter(o => o.studentId === 'ada'),
    lessons: lessons.filter(l => l.studentId === 'ada'),
  };
  check('8. the short path really is shorter', short.students.length === 1 && short.overrides.length < overrides.length);
  for (const intent of ASK_ANSWERS) {
    for (const when of [undefined, 'today', 'tomorrow', 'thisWeek', 'weekday:thu', 'next'] as (AskWhen | undefined)[]) {
      for (const thing of [undefined, named(SYM), C2]) {
        const r = q(intent, { ...(when ? { when } : {}), ...thing });
        eq(`8. ${intent} ${when ?? ''} ${thing?.about ?? ''}: own record and own pull-outs give the whole roster's answer`,
          ask(r, ['ada'], {}, short), ask(r, ['ada']));
      }
    }
  }
}

/* ── 9. The import boundary, and no clock. ────────────────────────────── */
{
  const here = new URL('.', import.meta.url);
  const folder = fileURLToPath(here);
  const fuzzy = fileURLToPath(new URL('../fuzzy.ts', here));
  // The same call ask.selfcheck.ts makes: the parser's files may import
  // their own folder and ../fuzzy.ts, never the answerer; the answerer may
  // import only its own list.
  checkImports(here, path => path.startsWith(folder) || path === fuzzy, 'src/shared/ask/ may import only its own files and src/shared/fuzzy.ts');
  check('9. the import boundary holds for every file in this folder', !anyFailed());
  check('9. the code is one file in this folder, with no folder of its own',
    readdirSync(here, { withFileTypes: true }).every(e => !e.isDirectory()) && readdirSync(here).includes('answer.ts'));
  const rel = ANSWERER_MAY_IMPORT.map(p => p.slice(fileURLToPath(root).length));
  check('9. the answerer\'s list is short, and every file on it exists', rel.length <= 16 && rel.every(p => read(p).length > 0), rel.join(', '));
  for (const banned of ['director/utils', 'director/hooks', 'director/firebase', '/org', 'i18n', 'dates.ts', 'translations', 'publicMirror', 'identity']) {
    check(`9. the answerer may not import ${banned}`, !rel.some(p => p.includes(banned)));
  }
  const src = read('src/shared/ask/answer.ts');
  const imports = [...src.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
  check('9. the answerer does import the rules it says it reads through', ['../studentDay.ts', '../changeNoteEs.ts', '../concertRosters.ts', '../requiredAudience.ts', '../signupEligibility.ts', '../pureRules.ts']
    .every(p => imports.includes(p)), imports.join(', '));
  check('9. every import carries its .ts', imports.every(p => p.endsWith('.ts')));
  const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  check('9. answer.ts reads no clock', !/Date\.now\(|new Date\(\s*\)|performance\.now/.test(code));
  check('9. answer.ts keeps nothing', !/localStorage|sessionStorage|document\.|window\./.test(code));
}

/* ── 10. English and Spanish. ─────────────────────────────────────────── */
{
  const PAIRS: [AskParse, string[], string, string][] = [
    [q('myDay', { when: 'tomorrow' }), ['ada'],
      'Symphony Orchestra, tomorrow <14:10>, Room 2210.', 'Symphony Orchestra, mañana <14:10>, Room 2210.'],
    [q('myDay', { when: 'today' }), ['ada'],
      '2 things today. Next: Symphony Orchestra, <14:10>, Room 2210.', '2 cosas hoy. Sigue: Symphony Orchestra, <14:10>, Room 2210.'],
    [q('myDay', { when: 'weekday:thu' }), ['ada'],
      'Nothing is on your schedule {2026-10-08}.', 'No hay nada en tu horario el {2026-10-08}.'],
    [q('playing', { when: 'today' }), ['ada'],
      'No music is listed for this rehearsal yet. Preparing for Fall Concert, {2026-10-10}.',
      'Todavía no hay música anotada para este ensayo. Preparando Fall Concert, el {2026-10-10}.'],
    [q('cancelled', { when: 'tomorrow' }), ['ben'],
      'Chamber Players, tomorrow <13:00>: Cancelled.', 'Chamber Players, mañana <13:00>: Cancelado.'],
    [q('cancelled', { when: 'weekday:fri' }), ['ben'],
      'Nothing is cancelled or changed {2026-10-09}.', 'No hay nada cancelado ni cambiado el {2026-10-09}.'],
    [q('callTime', { when: 'next' }), ['ada'],
      'Call time for Fall Concert: {2026-10-10} <18:00>.', 'Hora de llegada para Fall Concert: el {2026-10-10} <18:00>.'],
    [q('noSchool', { when: 'nextWeek' }), [],
      'There is school every weekday next week.', 'Hay clases de lunes a viernes la próxima semana.'],
    [q('howCheckin'), [], 'Use the Concert Check-In page.', 'Usa la página Registro de conciertos.'],
    [q('myDay', { when: 'today' }), [], 'Who is asking?', '¿Quién pregunta?'],
    [q('none'), [], NONE, 'No tengo una respuesta para eso.'],
    [q('parking'), [], NOT_HELD, 'El Hub no tiene eso.'],
  ];
  for (const [r, saved, en, es] of PAIRS) {
    eq(`10. ${r.intent}: English`, ask(r, saved).sentence, en);
    eq(`10. ${r.intent}: Spanish`, ask(r, saved, { lang: 'es' }).sentence, es);
  }
  // Across everything: the same state and the same cards, in other words.
  const strip = (a: AskAnswer) => JSON.stringify([a.state, a.forWho.kind, a.cards.map(sig), a.showing, a.followUps]);
  for (const [label, reading, saved, , , , more] of CASES) {
    const a = ask(reading, saved, more);
    const b = ask(reading, saved, { ...more, lang: 'es' });
    check(`10. ${label}: Spanish is the same answer`, strip(a) === strip(b));
    // A room's own entry is the directory's words and nothing else.
    check(`10. ${label}: and it is in Spanish`, a.sentence !== b.sentence || label === 'where is a room', a.sentence);
  }
}

/* ── 11. No typed word reaches a sentence, `showing` or a chip. ───────── */
{
  const TYPED = ['Zzyzx', 'Qwerty', 'TYPEDNAME'];
  const clean = (a: AskAnswer) => !TYPED.some(w => JSON.stringify(a).includes(w));
  for (const [label, reading, saved, , , , more] of CASES) {
    const plain = ask(reading, saved, more);
    // The same reading, with typed words everywhere a reading can hold them.
    const loud: AskParse = {
      ...reading,
      person: 'Zzyzx Qwerty',
      ...(reading.match?.id ? { about: 'TYPEDNAME', match: { ...reading.match, name: 'TYPEDNAME', also: ['Qwerty'], by: ['Zzyzx'] } } : {}),
    };
    const got = ask(loud, saved, more);
    check(`11. ${label}: nothing typed is in the answer, the note of what was shown or a chip`, clean(got), JSON.stringify(got));
    check(`11. ${label}: the answer comes from the record, not the reading`, JSON.stringify(got) === JSON.stringify(plain));
  }
  for (const intent of ASK_ANSWERS) {
    const odd = ask(q(intent, { when: 'today', about: 'Zzyzx Qwerty is failing' }), ['ada']);
    check(`11. "${intent}": a word that is in none of the parser's tables is not read, and not repeated`,
      odd.state === 'notUnderstood' && odd.showing === undefined && clean(odd), JSON.stringify(odd));
  }
  const who = ask(q('myDay', { when: 'today', person: 'Ben Sample' }), ['ada']);
  check('11. a person named in the question never changes who it is for',
    who.forWho.kind === 'one' && who.forWho.student.id === 'ada');
  const nobody = ask(q('myDay', { when: 'today', person: 'Ben Sample' }), []);
  check('11. and never stands in for a saved student', nobody.state === 'needsWho');
  const chips = ask(q('myDay', { when: 'today', about: 'TYPEDNAME', match: { kind: 'group', id: 'sym', name: 'TYPEDNAME', also: ['Qwerty'], by: ['Zzyzx'] } }), []);
  eq('11. a chip carries the record\'s own name and nothing else from the reading', chips.followUps[0],
    { intent: 'myDay', when: 'tomorrow', about: 'Symphony Orchestra', match: { kind: 'group', name: 'Symphony Orchestra', id: 'sym' } });
  const choice = ask({ intent: 'none', confident: false, suggestions: [{ intent: 'myDay', person: 'Zzyzx' }, { intent: 'concert' }] }, []);
  check('11. choices carry no person', clean(choice));
}

/* ── 12. The concert count is only ever a link. ───────────────────────── */
{
  for (const r of [q('required'), q('howCheckin')]) {
    const got = ask(r, ['ada']);
    const tally = got.cards.find(c => c.kind === 'page' && c.id === 'concertTally');
    check(`12. ${r.intent}: the count is a link to the student's own page`, tally?.route === '/student/ada');
    check(`12. ${r.intent}: with nobody saved there is no such link`, !cardsOf(ask(r, [])).includes('page:concertTally'));
  }
  const code = read('src/shared/ask/answer.ts').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  check('12. the module is never handed a check-in', !/checkins?\b|ConcertCheckin|concertTally\(/i.test(code.replace(/'checkin'|\/checkin|howCheckin|nav\.checkin|Check-In/g, '')));
  for (const s of SWEEP.filter(x => x.intent === 'required' || x.intent === 'howCheckin')) {
    check(`12. no sentence counts concerts attended (${s.what})`, everything(s.got).sentences.every(t => !/attended|asistido|\bof \d|\bde \d+ concier/.test(t)));
  }
}

/* ── 13. Routes and page names. ───────────────────────────────────────── */
{
  const main = read('src/main.tsx');
  const mounted = (route: string) => {
    const path = route.replace(/#.*$/, '').replace(/^\//, '').replace(/^(event|piece|ensemble|student|assignments|seating|form)\/[^/]+$/, '$1/:id');
    return main.includes(`path: '${path}'`);
  };
  eq('13. the route table spells what main.tsx mounts',
    [ASK_ROUTES.event('ID'), ASK_ROUTES.piece('ID'), ASK_ROUTES.group('ID'), ASK_ROUTES.student('ID'), ASK_ROUTES.assignment('ID')].map(mounted),
    [true, true, true, true, true]);
  const routes = new Set<string>();
  for (const s of SWEEP) for (const c of everything(s.got).cards) routes.add(c.route);
  for (const [, reading, saved, , , , more] of CASES) for (const c of everything(ask(reading, saved, more)).cards) routes.add(c.route);
  check('13. the answers reach a good many routes', routes.size >= 30, String(routes.size));
  for (const r of routes) check(`13. "${r}" is a mounted route`, mounted(r));
  check('13. a route nobody mounts is caught by this check', !mounted('/copy-requests') && !mounted('/events/x'));
  const form = ask(q('forms'), ['ada']).cards[0];
  check('13. a form links through formLink', form?.route === '/form/f1' && read('src/shared/formLink.ts').includes('`/form/${id}`'));
  check('13. a seating chart links through seatingLink', ask(q('seat'), ['ada']).cards[0]?.route === '/seating/ch1');
  const noMap = ask(q('where', named(room('Room 2210'))), [], { features: {} });
  check('13. with no campus map the room is words only', noMap.state === 'answered' && noMap.cards.length === 0);
  // A page is called what the menu calls it, in both languages.
  const table = read('src/shared/translations.ts');
  for (const [key, name] of Object.entries(ASK_PAGE_NAMES)) {
    const row = table.split('\n').find(l => l.includes(`'${key}':`)) ?? '';
    check(`13. ${key} is spelled as the menu spells it`, row.includes(`en: '${name.en}'`) && row.includes(`es: '${name.es}'`), row.trim());
  }
  eq('13. the absence page by its menu name, in Spanish', ask(q('howAbsence'), [], { lang: 'es' }).sentence, 'Usa la página Reportar una ausencia.');
}

/* ── 14. Guesses and choices. ─────────────────────────────────────────── */
{
  const offer: AskReading = { intent: 'myDay', when: 'tomorrow' };
  const guess = ask({ intent: 'none', confident: false, suggestions: [offer] }, ['ada']);
  check('14. one suggestion is answered, and marked a guess',
    guess.state === 'answered' && guess.showing?.guessed === true && guess.sentence === 'Symphony Orchestra, tomorrow <14:10>, Room 2210.');
  check('14. a confident reading is not marked a guess', ask(q('myDay', { when: 'tomorrow' }), ['ada']).showing?.guessed === undefined);
  const two = [offer, { intent: 'concert', when: 'next' } as AskReading];
  const choice = ask({ intent: 'none', confident: false, suggestions: two }, ['ada']);
  check('14. several suggestions come back as choices, with no answer',
    choice.state === 'notUnderstood' && choice.cards.length === 0 && !choice.showing && JSON.stringify(choice.choices) === JSON.stringify(two));
  const nothing = ask({ intent: 'none', confident: false, suggestions: [] }, ['ada']);
  check('14. no reading at all is not understood', nothing.state === 'notUnderstood' && nothing.choices.length === 0);
  const showing = ask(q('myDay', { when: 'thisWeek', about: 'TYPEDNAME', match: { ...SYM, name: 'TYPEDNAME' } }), []).showing;
  eq('14. "showing" says what was understood, in the record\'s own words', showing,
    { intent: 'myDay', when: 'thisWeek', from: '2026-10-05', to: '2026-10-11', thing: 'Symphony Orchestra' });
  eq('14. a table word is shown as the word it is', ask(q('myDay', { when: 'next', about: 'sectional' }), ['dee']).showing?.thing, 'sectional');
}

/* ── 15. Follow-up chips. ─────────────────────────────────────────────── */
{
  const today = ask(q('myDay', { when: 'today' }), ['ada']);
  eq('15. today offers tomorrow and this week', today.followUps, [{ intent: 'myDay', when: 'tomorrow' }, { intent: 'myDay', when: 'thisWeek' }]);
  eq('15. tomorrow offers today and this week',
    ask(q('playing', { when: 'tomorrow' }), ['ada']).followUps.map(r => r.when), ['today', 'thisWeek']);
  const kept = ask(q('myDay', { when: 'today', ...named(SYM) }), []);
  check('15. a chip changes the day and keeps the thing', kept.followUps.every(r => r.match?.id === 'sym' && r.intent === 'myDay'));
  for (const r of today.followUps) {
    const again = ask({ ...r, confident: true, suggestions: [] }, ['ada']);
    check(`15. the "${r.when}" chip can be answered as it stands`, again.state === 'answered' && again.showing?.when === r.when);
  }
  for (const r of kept.followUps) {
    check(`15. the "${r.when}" chip for a named group can be answered as it stands`, ask({ ...r, confident: true, suggestions: [] }, []).showing?.thing === 'Symphony Orchestra');
  }
  for (const r of [q('due'), q('concert', { when: 'next' }), q('news'), q('myDay', { when: 'today' })]) {
    const saved = r.intent === 'myDay' ? [] : ['ada'];
    check(`15. no chips on "${r.intent}"${saved.length ? '' : ' with nobody saved'}`, ask(r, saved).followUps.length === 0);
  }
}

/* ── 16. Date words, inside the school year. ──────────────────────────── */
{
  const DAYS: [AskWhen | undefined, string, string | undefined][] = [
    [undefined, '2026-10-05', undefined], ['next', '2026-10-05', undefined],
    ['today', '2026-10-05', '2026-10-05'], ['tonight', '2026-10-05', '2026-10-05'], ['tomorrow', '2026-10-06', '2026-10-06'],
    ['thisWeek', '2026-10-05', '2026-10-11'], ['nextWeek', '2026-10-12', '2026-10-18'], ['weekend', '2026-10-10', '2026-10-11'],
    ['weekday:mon', '2026-10-05', '2026-10-05'], ['weekday:fri', '2026-10-09', '2026-10-09'], ['weekday:sun', '2026-10-11', '2026-10-11'],
    ['date:12-09', '2026-12-09', '2026-12-09'], ['date:10-05', '2026-10-05', '2026-10-05'],
    // Later in the same school year: next calendar year, and fine.
    ['date:01-15', '2027-01-15', '2027-01-15'], ['date:05-01', '2027-05-01', '2027-05-01'], ['date:07-31', '2027-07-31', '2027-07-31'],
    // A day of the month with no month is the NEXT day with that number.
    ['day:15', '2026-10-15', '2026-10-15'], ['day:31', '2026-10-31', '2026-10-31'], ['day:05', '2026-10-05', '2026-10-05'],
    ['day:04', '2026-11-04', '2026-11-04'], ['day:01', '2026-11-01', '2026-11-01'],
    ['month:10', '2026-10-05', '2026-10-31'], ['month:12', '2026-12-01', '2026-12-31'], ['month:02', '2027-02-01', '2027-02-28'],
    ['month:07', '2027-07-01', '2027-07-31'],
  ];
  for (const [when, from, to] of DAYS) eq(`16. ${when ?? 'no date'}`, askRange(when, TODAY), to ? { from, to } : { from });
  // A month and day, or a month, earlier than today in this school year is
  // the past. It never becomes the same day a year on.
  for (const when of ['date:10-04', 'date:09-15', 'date:08-01', 'month:09', 'month:08', 'yesterday', 'lastNight', 'lastWeek'] as AskWhen[]) {
    check(`16. "${when}" is behind us`, askRange(when, TODAY) === null, JSON.stringify(askRange(when, TODAY)));
    check(`16. and a question about "${when}" is not answered`, ask(q('myDay', { when }), ['ada']).state === 'notUnderstood');
  }
  // A day that does not exist is no day: not March 1.
  for (const when of ['date:02-29', 'date:02-30', 'date:04-31', 'date:13-01', 'day:32', 'day:00', 'day:5', 'month:13', 'month:1', 'weekday:xyz', 'someday'] as AskWhen[]) {
    check(`16. "${when}" is not a real day`, askRange(when, TODAY) === null, JSON.stringify(askRange(when, TODAY)));
  }
  // "The 31st" with no month: the next 31st, passing over a month without one.
  const next = (when: AskWhen, today: string) => askRange(when, today)?.from;
  eq('16. the 31st, asked on November 10', next('day:31', '2026-11-10'), '2026-12-31');
  eq('16. the 31st, asked on November 30', next('day:31', '2026-11-30'), '2026-12-31');
  eq('16. the 30th, asked on January 31: February has none', next('day:30', '2027-01-31'), '2027-03-30');
  eq('16. the 29th, asked on January 30 of a plain year', next('day:29', '2027-01-30'), '2027-03-29');
  eq('16. the 29th, asked on January 30 of a leap year', next('day:29', '2028-01-30'), '2028-02-29');
  eq('16. the 31st, asked on February 1', next('day:31', '2027-02-01'), '2027-03-31');
  eq('16. the 4th, asked on December 15, is in January', next('day:04', '2026-12-15'), '2027-01-04');
  eq('16. the 1st, asked on July 31, is the next day', next('day:01', '2027-07-31'), '2027-08-01');
  for (let n = 0; n < 366; n++) {
    const today = new Date(Date.UTC(2027, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);
    for (let d = 1; d <= 31; d++) {
      const got = next(`day:${String(d).padStart(2, '0')}` as AskWhen, today);
      if (!got || got < today || +got.slice(8) !== d) check(`16. the ${d}th asked on ${today} is the next one`, false, String(got));
    }
  }
  eq('16. the 4th in the sentence, with its month, and its year when that is next year',
    ask(q('myDay', { when: 'day:04' }), ['ada'], { today: '2026-12-15', now: at('2026-12-15', '10:00') }).sentence,
    'Nothing is on your schedule {2027-01-04}, 2027.');
  eq('16. and what was read is shown', ask(q('myDay', { when: 'day:04' }), ['ada']).showing,
    { intent: 'myDay', when: 'day:04', from: '2026-11-04', to: '2026-11-04' });
  eq('16. February 29 in a leap year is a day', askRange('date:02-29', '2027-10-05'), { from: '2028-02-29', to: '2028-02-29' });
  // In spring the school year began last August.
  eq('16. in March, "6/1" is this June', askRange('date:06-01', '2027-03-15'), { from: '2027-06-01', to: '2027-06-01' });
  check('16. in March, "10/5" is last October: the past', askRange('date:10-05', '2027-03-15') === null);
  check('16. in March, "october" is the past', askRange('month:10', '2027-03-15') === null);
  eq('16. on a Sunday, the weekend is today', askRange('weekend', '2026-10-11'), { from: '2026-10-11', to: '2026-10-11' });
  eq('16. on a Sunday, this week ends today', askRange('thisWeek', '2026-10-11'), { from: '2026-10-11', to: '2026-10-11' });
}

/* ── 17. Times and dates come from the formatter, whole, once. ────────── */
{
  let sentences = 0;
  for (const s of SWEEP) {
    for (const text of everything(s.got).sentences) {
      sentences++;
      const outside = text.replace(/<[^>]*>( p\.m\.)?|\{[^}]*\}/g, '');
      check(`17. ${s.what}: a time or date in the sentence did not come from the formatter`,
        !/\d{1,2}:\d{2}|\d{4}-\d{2}-\d{2}|\b[ap]\.?m\b/i.test(outside), text);
      check(`17. ${s.what}: no two full stops together`, !text.includes('..'), text);
      // Within one sentence, no date twice.
      for (const part of text.split(/(?<=[.?!])\s+(?=[A-ZÁÉÍÓÚ¿\d])/)) {
        const dates = [...part.matchAll(/\{[^}]*\}/g)].map(m => m[0]);
        check(`17. ${s.what}: a date is printed twice in one sentence`, new Set(dates).size === dates.length, text);
        check(`17. ${s.what}: "today" or "tomorrow" is said twice in one sentence`,
          (part.match(/\b(?:today|hoy)\b/g) ?? []).length <= 1 && (part.match(/\b(?:tomorrow|mañana)\b/g) ?? []).length <= 1, text);
      }
      // A date that is not in this calendar year carries its year.
      for (const m of text.matchAll(/\{(\d{4})-[^}]*\}(,? (?:de )?(\d{4}))?/g)) {
        check(`17. ${s.what}: a date in another year prints the year`, m[1] === '2026' ? !m[3] : m[3] === m[1], text);
      }
    }
  }
  check('17. the sweep really ran', sentences >= SWEEP.length);
  eq('17. a date next year says so', ask(q('myDay', { when: 'date:05-01' }), ['ada']).sentence, 'Nothing is on your schedule {2027-05-01}, 2027.');
  eq('17. and in Spanish', ask(q('myDay', { when: 'date:05-01' }), ['ada'], { lang: 'es' }).sentence, 'No hay nada en tu horario el {2027-05-01} de 2027.');
  // The formatter decides the words: change it and the sentence follows.
  const loud = ask(q('myDay', { when: 'weekday:thu' }), ['ben'], { use: { ...use, time: () => 'TIME', date: () => 'DATE' } });
  check('17. the formatter\'s own words are what is printed', loud.sentence === 'Nothing is on your schedule DATE.', loud.sentence);
}

/* ── 18. The real parser's reading goes straight in. ──────────────────── */
{
  const kit: AskName[] = [
    ...ensembles.map(e => ({ kind: 'group' as const, name: e.name, id: e.id })),
    ...events.filter(e => e.title && e.id !== 'cold').map(e => ({ kind: 'concert' as const, name: e.title!, id: e.id })),
  ];
  const typed = (text: string, saved: string[]) => ask(parseAsk(text, kit), saved);
  eq('18. "what do i have today"', typed('what do i have today', ['ada']).sentence, '2 things today. Next: Symphony Orchestra, <14:10>, Room 2210.');
  eq('18. "que tengo hoy", for a Spanish reader',
    ask(parseAsk('que tengo hoy', kit), ['ada'], { lang: 'es' }).sentence, '2 cosas hoy. Sigue: Symphony Orchestra, <14:10>, Room 2210.');
  check('18. "what do i have today" with nobody saved asks who', typed('what do i have today', []).state === 'needsWho');
  for (const text of ['who is out today', 'what is ben sample doing today', 'did ada example come to rehearsal']) {
    const got = typed(text, ['ada']);
    check(`18. "${text}" is not answered`, got.state === 'notUnderstood' && got.cards.length === 0, `${got.state}: ${got.sentence}`);
  }
  for (const text of ['where do i park', 'how much are tickets', 'what should i bring', 'how long is the concert']) {
    const got = typed(text, ['ada']);
    eq(`18. "${text}": the Hub does not have it, and says so`, [got.state, got.sentence, got.cards.length], ['notUnderstood', NOT_HELD, 0]);
  }
  eq('18. "who is my teacher"', typed('who is my teacher', ['ada']).sentence, 'Your lesson teacher is Ms. Invented.');
  eq('18. "how do i contact my teacher"', typed('how do i contact my teacher', ['ada']).sentence, 'Write to office@example.org.');
  // The question put both ways round gets the one sentence, and it is true.
  for (const text of ['is there school friday', 'is school closed on friday', 'no school friday']) {
    eq(`18. "${text}"`, typed(text, ['ada']).sentence, 'No school {2026-10-09}.');
  }
  for (const text of ['is there school tomorrow', 'is school closed tomorrow']) {
    eq(`18. "${text}"`, typed(text, ['ada']).sentence, 'There is school tomorrow.');
  }
  eq('18. "is rehearsal cancelled tomorrow", for one that is', typed('is rehearsal cancelled tomorrow', ['ben']).sentence, 'Chamber Players, tomorrow <13:00>: Cancelled.');
  eq('18. "do i have symphony orchestra thursday", pulled out', typed('do i have symphony orchestra thursday', ['ada']).sentence,
    'Symphony Orchestra is not on your schedule {2026-10-08}.');
  // December 9, 2026 is a Wednesday. The parser does not check the weekday,
  // so what it read is always shown.
  const dated = typed('what do i have 12/9', ['ada']).showing;
  eq('18. "what do i have 12/9" shows the day it was read as', [dated?.from, dated?.to], ['2026-12-09', '2026-12-09']);
  check('18. "what do i have 10/4", asked on the 5th, is the past and not next October', typed('what do i have 10/4', ['ada']).state === 'notUnderstood');
  // With no month it is the next day with that number, as the parser means it.
  eq('18. "what do i have on the 4th", asked on the 5th, is next month\'s 4th', typed('what do i have on the 4th', ['ada']).showing?.from, '2026-11-04');
  eq('18. "what do i have tonight", asked at ten on a day with nothing in the evening', typed('what do i have tonight', ['ada']).sentence,
    'Nothing is on your schedule tonight.');
}

/* ── 19. No "Yes", no "No", and no change put into words. ─────────────── */
{
  for (const s of SWEEP) {
    for (const text of everything(s.got).sentences) {
      check(`19. ${s.what}: a sentence starts with yes or no`, !/^(?:Yes|No|Sí|Si)[.,!]/.test(text), text);
      // The only words about a change are the stored status, and "nothing
      // is cancelled or changed".
      const rest = text.replace(/Nothing is cancelled or changed|No hay nada cancelado ni cambiado|: (?:Cancelled|Cancelado)\b/g, '');
      check(`19. ${s.what}: the sentence words a change`,
        !/\bcancel|\bchange|\bmoved?\b|\bcambi|\bmovid|\bpostpon|\breschedul|\baplaz/i.test(rest), text);
    }
  }
  const SAME: [AskParse, string[]][] = [[q('noSchool', { when: 'weekday:fri' }), ['ada']], [q('noSchool', { when: 'tomorrow' }), ['ada']], [q('cancelled', { when: 'weekday:wed' }), ['cy']]];
  for (const [r, saved] of SAME) {
    check(`19. "${r.intent}" states a fact that answers the question either way round`, /^(?:No school|There is school|Chamber Players)/.test(ask(r, saved).sentence));
  }
}

/* ── 20. The time of day. ─────────────────────────────────────────────── */
{
  const today = q('myDay', { when: 'today' });
  eq('20. at seven, the morning rehearsal is still to come', ask(today, ['cy'], { now: at(TODAY, '07:00') }).sentence,
    'Chamber Players, today <08:00>, Room 9.');
  eq('20. at nine, it is still going on', ask(q('where', { when: 'today' }), ['cy'], { now: at(TODAY, '09:00') }).sentence,
    'Chamber Players, today <08:00>, Room 9.');
  eq('20. at ten it is over, and nothing more is on', [ask(today, ['cy']).sentence, cardsOf(ask(today, ['cy']))],
    ['Nothing more is on your schedule today.', ['event:e0']]);
  eq('20. "where" at ten names nothing that is over', ask(q('where', { when: 'today' }), ['cy']).sentence, 'Nothing more is on your schedule today.');
  eq('20. for somebody in both groups, "where" is the one still to come', ask(q('where', { when: 'today' }), ['fay']).sentence,
    'Symphony Orchestra, today <14:10>, Room 2210.');
  eq('20. and before eight it is the first', ask(q('where', { when: 'today' }), ['fay'], { now: at(TODAY, '07:30') }).sentence,
    'Chamber Players, today <08:00>, Room 9.');
  eq('20. the next lesson is not one that has ended', cardsOf(ask(q('lesson', { when: 'next' }), ['ben'])), ['lesson:l2']);
  eq('20. before it, it is', cardsOf(ask(q('lesson', { when: 'next' }), ['ben'], { now: at(TODAY, '08:30') })), ['lesson:l0']);
  // Tonight is the evening: not over, and starting at five or later, or
  // under way now that it is five or later. Asked at ten, three, six and
  // eleven, on three kinds of day.
  const tonight = q('myDay', { when: 'tonight' });
  const HOURS = ['10:00', '15:00', '18:00', '23:00'];
  const said = (ymd: string, hhmm: string) => {
    const got = ask(tonight, ['ada'], { today: ymd, now: at(ymd, hhmm) });
    return [got.sentence, cardsOf(got)];
  };
  // Monday: a rehearsal at 2:10 and a lesson at 4:00. Nothing in the evening.
  for (const h of HOURS) {
    eq(`20. "tonight" on a day with only afternoon things, asked at ${h}`, said(TODAY, h), ['Nothing is on your schedule tonight.', []]);
  }
  // Saturday: a concert at 7:00, with no end stored.
  const saturday = { today: '2026-10-10' };
  for (const h of HOURS.slice(0, 3)) {
    eq(`20. "tonight" on a concert night, asked at ${h}`, said('2026-10-10', h), ['Fall Concert, today <19:00>, Main Hall.', ['event:c1']]);
  }
  eq('20. "tonight" on a concert night, asked at 23:00: it is over', said('2026-10-10', '23:00'),
    ['Nothing more is on your schedule tonight.', ['event:c1']]);
  // Tuesday the 13th: a rehearsal from 4:00 to 6:30.
  for (const h of HOURS.slice(0, 2)) {
    eq(`20. "tonight", a rehearsal that starts at four, asked at ${h}: it is not the evening yet`, said('2026-10-13', h),
      ['Nothing is on your schedule tonight.', []]);
  }
  eq('20. "tonight", the same rehearsal, asked at 18:00: it is under way', said('2026-10-13', '18:00'),
    ['Symphony Orchestra, today <16:00>, Room 2210.', ['event:late']]);
  eq('20. "tonight", the same rehearsal, asked at 23:00: it is over', said('2026-10-13', '23:00'),
    ['Nothing more is on your schedule tonight.', ['event:late']]);
  for (const s of SWEEP.filter(x => x.when === 'tonight')) {
    check(`20. "tonight" never names an afternoon time (${s.what})`,
      everything(s.got).sentences.every(t => !/<(?:0\d|1[0-6]):\d\d>/.test(t)), JSON.stringify(everything(s.got).sentences));
  }
  eq('20. the other questions keep the evening too: nothing is cancelled tonight', ask(q('cancelled', { when: 'tonight' }), ['ada']).sentence,
    'Nothing is on your schedule tonight.');
  // With no end stored, a thing is taken to last two hours.
  const thursday = { today: '2026-10-08' };
  eq('20. no end stored: still on after an hour and a half', ask(q('where', { when: 'today' }), ['dee'], { ...thursday, now: at('2026-10-08', '16:30') }).sentence,
    'Symphony Orchestra, today <15:00>, Room 12.');
  // "Are we in Room 9 today", for somebody with a rehearsal in each room: the
  // sentence is the one in the room asked about, when there is one.
  const early = { now: at(TODAY, '07:00') };
  eq('20. asked about the room of the second thing', ask(q('where', { when: 'today', ...named(room('Room 2210')) }), ['fay'], early).sentence,
    'Symphony Orchestra, today <14:10>, Room 2210.');
  eq('20. asked about the room of the first thing', ask(q('where', { when: 'today', ...named(room('Room 9')) }), ['fay'], early).sentence,
    'Chamber Players, today <08:00>, Room 9.');
  eq('20. asked about a room that is over: where they are next', ask(q('where', { when: 'today', ...named(room('Room 9')) }), ['fay']).sentence,
    'Symphony Orchestra, today <14:10>, Room 2210.');
  eq('20. no end stored: over after two hours', ask(q('where', { when: 'today' }), ['dee'], { ...thursday, now: at('2026-10-08', '17:00') }).sentence,
    'Nothing more is on your schedule today.');
  eq('20. a concert that has ended is not the next concert', cardsOf(ask(q('concert', { when: 'next' }), ['ada'], { ...saturday, now: at('2026-10-10', '23:30') })),
    ['event:c2!aud', 'page:concerts']);
  eq('20. the clock is the school\'s, not the phone\'s or London\'s', ask(today, ['cy'], { now: Date.parse('2026-10-05T12:30:00Z') }).sentence,
    'Chamber Players, today <08:00>, Room 9.');
}

/* ── 21. School, only inside the calendar's own year. ─────────────────── */
{
  const school = (when: AskWhen | undefined, saved: string[] = [], more: Partial<AskOptions> = {}) => ask(q('noSchool', when ? { when } : {}), saved, more).sentence;
  // The stand-in calendar, like the real ones, would say "there is school"
  // on any day it has no closure for. Outside its year it is not asked.
  eq('21. July is outside the year', school('date:07-05'), NOT_HELD);
  eq('21. so is the whole month', school('month:07'), NOT_HELD);
  eq('21. and a month the year ends inside of', school('month:06'), NOT_HELD);
  eq('21. the last day of the year is inside it', school('date:06-04'), 'There is school {2027-06-04}, 2027.');
  eq('21. the day after is not', school('date:06-07'), NOT_HELD);
  eq('21. next year\'s Labor Day, asked in August, is outside the stored year', school('date:09-06', [], { today: '2027-08-20', now: at('2027-08-20', '10:00') }), NOT_HELD);
  eq('21. in summer, "the next day off" is not answered', school('next', [], { today: '2027-07-01', now: at('2027-07-01', '10:00') }), NOT_HELD);
  // The college's year is its own, and shorter.
  eq('21. the high school is in its year on May 10', school('date:05-10', ['ada']), 'There is school {2027-05-10}, 2027.');
  eq('21. the college is past its year by then', school('date:05-10', ['cy']), NOT_HELD);
  eq('21. with the calendar but no year handed in, school is not answered', school('tomorrow', ['ada'], { use: { ...use, schoolYear: undefined } }), NOT_HELD);
  eq('21. with no calendar handed in, school is not answered', school('tomorrow', ['ada'], { use: { ...use, isSchoolDay: undefined } }), NOT_HELD);
  eq('21. "is there school this weekend"', school('weekend'), 'No school this weekend.');
  check('21. a weekend is never "school every weekday"', !SWEEP.some(s => s.intent === 'noSchool' && s.when === 'weekend' && /every weekday|lunes a viernes/.test(s.got.sentence)));
  eq('21. Spanish does not say "every day" for every weekday', ask(q('noSchool', { when: 'nextWeek' }), [], { lang: 'es' }).sentence,
    'Hay clases de lunes a viernes la próxima semana.');
}

/* ── 22. Nothing staff-only, and nothing planted, ever comes out. ─────── */
{
  check('22. the fixtures do carry the planted fields', JSON.stringify(data).split(P).length > 60);
  for (const s of SWEEP) {
    if (JSON.stringify(s.got).includes(P)) check(`22. a planted field came out (${s.what})`, false, JSON.stringify(s.got));
  }
  for (const [label, reading, saved, , , , more] of CASES) {
    check(`22. ${label}: nothing planted comes out`, !JSON.stringify(ask(reading, saved, more)).includes(P));
  }
  // The type itself refuses a staff record.
  const fromStaff = { id: 'x', name: 'Staff Record', ensembleIds: [], instrument: '', status: 'Active' as const, pronunciation: 'not public' };
  // @ts-expect-error a `students` doc, with its staff-only fields, is not an AskStudent
  const refused: AskStudent = fromStaff;
  check('22. (the line above is checked by the compiler, not at run time)', refused.id === 'x');
}

if (failures > 0) {
  console.error(`\nanswer.selfcheck: ${failures} failed`);
  process.exit(1);
}
console.log(`answer.selfcheck: ok (${CASES.length} cases, ${ASK_ANSWERS.length} intents, ${SWEEP.length} swept)`);
