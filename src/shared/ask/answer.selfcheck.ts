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
 *       is nobody, never "nothing today"; a general question never asks
 *    4. a cancelled or changed event carries the director's own note, in the
 *       reader's language, and the sentence is the same whatever the note says
 *    5. "No music is listed" is followed by the labelled Preparing-for cards
 *    6. a scheduled post, a scheduled or invite-only form and a scheduled
 *       assignment never appear, even asked for by name
 *    7. a concert a student only attends adds no pieces (#student-repertoire)
 *    8. the short path (the student's own record and own pull-outs) gives
 *       the same answer as the whole roster (design 3.6)
 *    9. the module's import list is an allowlist, and it has no clock
 *   10. English and Spanish say the same answer
 *   11. no typed word reaches a sentence
 *   12. the concert count is only ever a link
 *   13. every route is one the app mounts
 *   14. a lone suggestion is answered as a guess; several come back as choices
 *   15. the follow-up chips are readings, and each can be answered
 *   16. the date words mean the right days
 *   17. every time and date in a sentence is exactly what the formatter gave
 *   18. the real parser's reading goes straight in
 *
 * Two of the repo's own rules are lifted out of their files and run here
 * (see `lift`), so the announcements filter and the seating address tested
 * are the real ones, not a copy.
 *
 * Every person here is invented (#privacy). This file may import only this
 * folder and Node's own modules: ask.selfcheck.ts checks that.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  ASK_ANSWERS, ASK_ROUTES, answerAsk, askRange,
  type AskAnswer, type AskCard, type AskData, type AskOptions,
} from './answer.ts';
import { parseAsk, type AskName, type AskParse, type AskReading } from './parse.ts';
import { MACROS, PUBLIC_TEMPLATES } from './templates.ts';
import type { AskIntent, AskWhen } from './corpus.ts';

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
  const end = src.indexOf('\n}\n', at);
  if (at < 0 || end < 0) throw new Error(`${name} is no longer a top-level function in ${path}`);
  const js = stripTypeScriptTypes(src.slice(at + 'export '.length, end + 2));
  return new Function(`${js}; return ${name};`)() as F;
}

/* ── The school. Monday 2026-10-05. ───────────────────────────────────── */

const TODAY = '2026-10-05';
const NOW = Date.parse('2026-10-05T12:00:00Z');
const LATER = NOW + 86_400_000;

type Row<K extends keyof AskData> = NonNullable<AskData[K]>[number];
const as = <T>(x: unknown) => x as T;

const ensembles = as<AskData['ensembles']>([
  { id: 'sym', name: 'Symphony Orchestra', conductorName: 'Dr. Invented Person' },
  { id: 'cham', name: 'Chamber Players' },
  { id: 'theory', name: 'Theory Ten', kind: 'class' },
]);

const student = (id: string, name: string, grade: string, ensembleIds: string[], status = 'Active') =>
  as<Row<'students'>>({ id, name, grade, ensembleIds, status, instrument: 'Violin' });
const students = [
  student('ada', 'Ada Example', '10', ['sym']),
  student('ben', 'Ben Sample', '11', ['cham']),
  student('cy', 'Cy Placeholder', 'College Freshman', ['cham']),
  student('dee', 'Dee Fixture', '9', ['sym']),
  student('fay', 'Fay Stand-In', '11', ['sym', 'cham']),
  student('eli', 'Eli Madeup', '12', ['sym'], 'Graduated'),
];

const NOTE = 'Cancelled: the hall is closed.';
const NOTE_ES = 'Cancelado: la sala está cerrada.';
const ev = (id: string, date: string, type: string, ensembleIds: string[], extra: Partial<Row<'events'>> = {}) =>
  as<Row<'events'>>({ id, date, type, ensembleIds, status: 'Scheduled', ...extra });
const events = [
  ev('r1', '2026-10-05', 'Rehearsal', ['sym'], { startTime: '14:10', endTime: '15:30', location: 'Room 2210' }),
  ev('r2', '2026-10-06', 'Rehearsal', ['sym'], { startTime: '14:10', location: 'Room 2210', pieceIds: ['overture'] }),
  ev('r3', '2026-10-06', 'Rehearsal', ['cham'], { startTime: '13:00', status: 'Cancelled', changeNote: NOTE, changeNoteEs: NOTE_ES }),
  ev('r4', '2026-10-07', 'Rehearsal', ['cham'], { startTime: '13:00', location: 'Room 9', changeNote: 'Moved to Room 9 today.' }),
  ev('sec', '2026-10-08', 'Sectional', ['sym'], { startTime: '15:00', location: 'Room 12' }),
  ev('r5', '2026-10-09', 'Rehearsal', ['cham'], { startTime: '13:00' }),
  ev('c1', '2026-10-10', 'Concert', ['sym'], {
    title: 'Fall Concert', startTime: '19:00', location: 'Main Hall', pieceIds: ['overture', 'suite'],
    callTime: '18:00', dress: 'Concert black.', pickupTime: '21:00',
  }),
  // Chamber plays; Symphony is required in the audience.
  ev('c2', '2026-10-17', 'Concert', ['cham'], {
    title: 'Chamber Night', startTime: '19:30', endTime: '21:00', location: 'Small Hall',
    pieceIds: ['quartet'], attendanceEnsembleIds: ['sym'],
  }),
  ev('c3', '2026-11-14', 'Concert', ['sym'], { title: 'Winter Preview' }),
];

const overrides = as<AskData['overrides']>([
  // Ada is pulled from Thursday's sectional.
  { id: 'o1', studentId: 'ada', ensembleId: 'sym', action: 'remove', scope: 'event', eventId: 'sec' },
  // Other people's pull-outs, one of them from Ada's own rehearsal today:
  // they must not matter to Ada.
  { id: 'o2', studentId: 'ben', ensembleId: 'cham', action: 'remove', scope: 'event', eventId: 'r4' },
  { id: 'o3', studentId: 'dee', ensembleId: 'sym', action: 'remove', scope: 'event', eventId: 'r1' },
]);

const pieces = as<Row<'pieces'>[]>([
  { id: 'overture', title: 'Invented Overture', composer: 'A. Composer', ensembleIds: ['sym'], order: 1 },
  { id: 'suite', title: 'Made-Up Suite', ensembleIds: ['sym'], order: 2 },
  { id: 'quartet', title: 'Pretend Quartet', ensembleIds: ['cham'], order: 3 },
]);

const assignments = as<Row<'assignments'>[]>([
  { id: 'a1', title: 'Scale Check', type: 'Playing Exam', dueDate: '2026-10-09', ensembleIds: ['sym'], createdAt: 1 },
  { id: 'a2', title: 'Hidden Quiz', type: 'Written Test', dueDate: '2026-10-07', ensembleIds: ['sym'], createdAt: 2, publishAt: LATER },
  { id: 'a3', title: 'Bowing Sheet', type: 'Other', dueDate: '2026-10-06', ensembleIds: ['sym'], createdAt: 3 },
]);

const forms = as<Row<'forms'>[]>([
  { id: 'f1', title: 'Trip Permission', ensembleIds: ['sym'], families: [], deadline: '2026-10-08', questions: [], createdAt: 1 },
  { id: 'f2', title: 'Invited Few', ensembleIds: [], families: [], audienceMode: 'students', questions: [], createdAt: 2 },
  { id: 'f3', title: 'Hidden Form', ensembleIds: ['sym'], families: [], questions: [], createdAt: 3, publishAt: LATER },
]);

const lessons = as<Row<'lessons'>[]>([
  { id: 'l1', studentId: 'ada', date: '2026-10-07', startTime: '15:00', endTime: '15:30', status: 'Scheduled', location: 'Studio 3', teacherName: 'Ms. Invented' },
]);

const charts = as<Row<'charts'>[]>([
  { id: 'ch1', ensembleId: 'sym', title: 'Fall Seating', date: '2026-09-20', createdAt: 1,
    sections: [{ section: 'Violin 1', seats: [{ studentId: 'zed' }, { studentId: 'ada' }] }] },
]);

const announcements = as<Row<'announcements'>[]>([
  { id: 'n1', ensembleId: null, title: 'Bus leaves early', createdAt: NOW - 1000 },
  { id: 'n2', ensembleId: null, title: 'Hidden Post', createdAt: NOW - 500, publishAt: LATER },
  { id: 'n3', ensembleId: null, title: 'Expired Post', createdAt: NOW - 900, expiresOn: '2026-10-01' },
  { id: 'n4', ensembleId: null, title: 'Archived Post', createdAt: NOW - 800, archivedAt: NOW - 100 },
]);

const locations = [{ room: 'Room 2210', label: 'Orchestra Room', directions: 'Second floor.', mapAnchor: 'r2210' }];

const data: AskData = { students, events, overrides, ensembles, pieces, assignments, forms, lessons, charts, announcements, locations };

/** What must never be seen: scheduled, expired, archived, or by invitation. */
const HIDDEN = ['a2', 'f2', 'f3', 'n2', 'n3', 'n4', 'Hidden Quiz', 'Invited Few', 'Hidden Form', 'Hidden Post', 'Expired Post', 'Archived Post'];

/* The formatters are stand-ins that wrap what they are given, so a time or a
 * date in a sentence that did NOT come through them is easy to see. The
 * announcements filter and the seating address are the app's own. */
const use: AskOptions['use'] = {
  time: t => `<${t}>`,
  date: d => `{${d}}`,
  visibleAnnouncements: lift('src/director/hooks/useAnnouncements.ts', 'visibleAnnouncements'),
  seatingChartPath: lift('src/director/seating/seatingLink.ts', 'seatingChartPath'),
  // Friday the 9th is a district day off. The college is open.
  isSchoolDay: (d, campus) => !(campus === 'hs' && d === '2026-10-09'),
};
const base: AskOptions = {
  lang: 'en', today: TODAY, now: NOW, saved: [], use, features: { absenceReport: true, campusMap: true },
  contact: 'office@example.org',
};

const G = (id: string, name: string): AskName => ({ kind: 'group', name, id });
const SYM = G('sym', 'Symphony Orchestra');
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

const room = (name: string): AskName => ({ kind: 'room', name });
const concert = (id: string, name: string): AskName => ({ kind: 'concert', name, id });
type Case = [label: string, reading: AskParse, saved: string[], state: AskAnswer['state'], sentence: string, cards: string[]];
const CASES: Case[] = [
  ['myDay today', q('myDay', { when: 'today' }), ['ada'], 'answered',
    'Yes. Symphony Orchestra, today <14:10>, Room 2210.', ['event:r1']],
  ['myDay tomorrow', q('myDay', { when: 'tomorrow' }), ['ada'], 'answered',
    'Yes. Symphony Orchestra, tomorrow <14:10>, Room 2210.', ['event:r2']],
  ['myDay this week', q('myDay', { when: 'thisWeek' }), ['ada'], 'answered',
    'Yes. 3 things this week. First: Symphony Orchestra, today <14:10>, Room 2210.', ['event:r1', 'event:r2', 'event:c1']],
  ['myDay on a day she is pulled out', q('myDay', { when: 'weekday:thu' }), ['ada'], 'answered',
    'No. Nothing is on your schedule {2026-10-08}.', []],
  ['myDay, the next sectional (pulled out)', q('myDay', { when: 'next', about: 'sectional' }), ['ada'], 'answered',
    'No. Nothing is on your schedule.', []],
  ['myDay, only a cancelled rehearsal', q('myDay', { when: 'tomorrow' }), ['ben'], 'answered',
    'Chamber Players, tomorrow <13:00>: cancelled.', ['event:r3']],
  ['myDay for a named group', q('myDay', { when: 'next', about: SYM.name, match: SYM }), [], 'answered',
    'Symphony Orchestra, today <14:10>, Room 2210.', ['event:r1']],
  ['where today', q('where', { when: 'today' }), ['ada'], 'answered',
    'Symphony Orchestra, today <14:10>, Room 2210.', ['event:r1']],
  ['where, no room listed', q('where', { when: 'weekday:fri' }), ['ben'], 'nothingPosted',
    'No room is listed for Chamber Players, {2026-10-09} <13:00> yet.', ['event:r5']],
  ['where is a room', q('where', { about: 'Room 2210', match: room('Room 2210') }), ['ada'], 'answered',
    'Room 2210: Orchestra Room. Second floor.', ['place:Room 2210']],
  ['where is a room nobody listed', q('where', { about: 'Room 77', match: room('Room 77') }), [], 'nothingPosted',
    'No directions are posted for that room yet.', []],
  ['are we in that room today', q('where', { when: 'today', about: 'Room 2210', match: room('Room 2210') }), ['ada'], 'answered',
    'Yes. Symphony Orchestra, today <14:10>, Room 2210.', ['event:r1']],
  ['are we in another room today', q('where', { when: 'today', about: 'Room 9', match: room('Room 9') }), ['ada'], 'answered',
    'No. Symphony Orchestra, today <14:10>, Room 2210.', ['event:r1']],
  ['cancelled, yes', q('cancelled', { when: 'tomorrow' }), ['ben'], 'answered',
    'Yes. Chamber Players, tomorrow <13:00>: cancelled.', ['event:r3']],
  ['cancelled, moved', q('cancelled', { when: 'weekday:wed' }), ['cy'], 'answered',
    'Yes. Chamber Players, {2026-10-07} <13:00>, Room 9: changed.', ['event:r4']],
  ['cancelled, no', q('cancelled', { when: 'today' }), ['ada'], 'answered',
    'No. Nothing today is cancelled or changed.', ['event:r1']],
  ['playing, nothing listed', q('playing', { when: 'today' }), ['ada'], 'nothingPosted',
    'No music is listed for this rehearsal yet. Preparing for Fall Concert, {2026-10-10}.',
    ['event:r1', 'event:c1!prep', 'piece:overture!prep', 'piece:suite!prep']],
  ['playing, music listed', q('playing', { when: 'tomorrow' }), ['ada'], 'answered',
    'Symphony Orchestra, tomorrow: Invented Overture.', ['event:r2', 'piece:overture']],
  ['playing at the next concert', q('playing', { when: 'next' }), ['ada'], 'answered',
    'Fall Concert, {2026-10-10}: Invented Overture, Made-Up Suite.', ['event:c1', 'piece:overture', 'piece:suite']],
  ['playing, a named group', q('playing', { when: 'today', about: SYM.name, match: SYM }), [], 'nothingPosted',
    'No music is listed for this rehearsal yet. Preparing for Fall Concert, {2026-10-10}.',
    ['event:r1', 'event:c1!prep', 'piece:overture!prep', 'piece:suite!prep']],
  ['lesson, the next one', q('lesson', { when: 'next' }), ['ada'], 'answered',
    'Lesson {2026-10-07} <15:00>, Studio 3, Ms. Invented.', ['lesson:l1']],
  ['lesson today', q('lesson', { when: 'today' }), ['ada'], 'answered',
    'No. No lesson is on your schedule today.', []],
  ['due', q('due'), ['ada'], 'answered',
    '2 things are due. First: Bowing Sheet, tomorrow.', ['assignment:a3', 'assignment:a1', 'page:assignments']],
  ['due, an exam', q('due', { about: 'exam' }), ['ada'], 'answered',
    'Scale Check is due {2026-10-09}.', ['assignment:a1', 'page:assignments']],
  ['due by tomorrow', q('due', { when: 'tomorrow' }), ['ada'], 'answered',
    'Bowing Sheet is due tomorrow.', ['assignment:a3', 'page:assignments']],
  ['due, nothing', q('due'), ['ben'], 'answered', 'Nothing is due.', ['page:assignments']],
  ['seat', q('seat'), ['ada'], 'answered', 'Violin 1, chair 2. Fall Seating.', ['seating:ch1']],
  ['seat, no chart', q('seat'), ['ben'], 'nothingPosted', 'No seating chart with your name is posted yet.', []],
  ['seat, a named group', q('seat', { about: SYM.name, match: SYM }), [], 'answered',
    'The seating chart for Symphony Orchestra: Fall Seating.', ['seating:ch1']],
  ['parts', q('parts'), ['ada'], 'answered',
    "2 pieces are on your schedule. Your part is on each piece's page.", ['piece:overture', 'piece:suite']],
  ['parts of a named piece', q('parts', { about: 'Invented Overture', match: { kind: 'piece', name: 'Invented Overture', id: 'overture' } }), [], 'answered',
    'The parts for Invented Overture are on its page.', ['piece:overture']],
  ['forms, one waiting', q('forms'), ['ada'], 'answered',
    '1 form is waiting. Trip Permission, by {2026-10-08}.', ['form:f1', 'page:forms']],
  ['forms, none', q('forms'), ['ben'], 'answered', 'No forms are waiting for you.', ['page:forms']],
  ['forms, a named form', q('forms', { about: 'Trip Permission', match: { kind: 'form', name: 'Trip Permission', id: 'f1' } }), [], 'answered',
    'Trip Permission is open until {2026-10-08}.', ['form:f1']],
  ['concert, the next one', q('concert', { when: 'next' }), ['ada'], 'answered',
    'Fall Concert, {2026-10-10} <19:00>, Main Hall.', ['event:c1', 'page:concerts']],
  ['concerts', q('concert'), ['ada'], 'answered',
    '3 concerts. Next: Fall Concert, {2026-10-10} <19:00>, Main Hall.', ['event:c1', 'event:c2!aud', 'event:c3', 'page:concerts']],
  ['concert, nobody saved', q('concert', { when: 'next' }), [], 'answered',
    'Fall Concert, {2026-10-10} <19:00>, Main Hall.', ['event:c1', 'page:concerts']],
  ['concert by name', q('concert', { about: 'Chamber Night', match: concert('c2', 'Chamber Night') }), ['ada'], 'answered',
    'Chamber Night, {2026-10-17} <19:30>, Small Hall.', ['event:c2', 'page:concerts']],
  ['concert, a season word', q('concert', { about: 'winter' }), ['ada'], 'notUnderstood', 'The Hub does not have that.', []],
  ['call time', q('callTime', { when: 'next' }), ['ada'], 'answered',
    'Call time for Fall Concert: {2026-10-10} <18:00>.', ['event:c1']],
  ['call time, not posted', q('callTime', { when: 'next' }), ['ben'], 'nothingPosted',
    'No call time is posted for Chamber Night yet.', ['event:c2']],
  ['dress', q('dress', { when: 'next' }), ['ada'], 'answered', 'What to wear for Fall Concert: Concert black.', ['event:c1']],
  ['dress, not posted', q('dress', { when: 'next' }), ['ben'], 'nothingPosted', 'No dress note is posted for Chamber Night yet.', ['event:c2']],
  ['pickup', q('pickup', { when: 'next' }), ['ada'], 'answered', 'Pickup for Fall Concert: {2026-10-10} <21:00>.', ['event:c1']],
  ['pickup, only an end time', q('pickup', { when: 'next' }), ['ben'], 'answered', 'Chamber Night ends {2026-10-17} <21:00>.', ['event:c2']],
  ['required, mine', q('required'), ['ada'], 'answered',
    '3 concerts are on your schedule: 2 to play, 1 to attend.',
    ['event:c1', 'event:c2!aud', 'event:c3', 'page:requiredConcerts', 'page:concertTally']],
  ['required, one I attend', q('required', { about: 'Chamber Night', match: concert('c2', 'Chamber Night') }), ['ada'], 'answered',
    'Yes. You are required to attend Chamber Night.', ['event:c2!aud', 'page:requiredConcerts', 'page:concertTally']],
  ['required, one I play', q('required', { about: 'Chamber Night', match: concert('c2', 'Chamber Night') }), ['ben'], 'answered',
    'Yes. You play in Chamber Night.', ['event:c2', 'page:requiredConcerts', 'page:concertTally']],
  ['required, nobody saved', q('required'), [], 'answered',
    '1 concert has groups required to attend.', ['event:c2', 'page:requiredConcerts']],
  ['no school that day', q('noSchool', { when: 'weekday:fri' }), ['ada'], 'answered', 'No. There is no school {2026-10-09}.', ['page:calendar']],
  ['school that day, for a college student', q('noSchool', { when: 'weekday:fri' }), ['cy'], 'answered', 'Yes. There is school {2026-10-09}.', ['page:calendar']],
  ['no school on a Saturday', q('noSchool', { when: 'weekday:sat' }), [], 'answered', 'No. There is no school {2026-10-10}.', ['page:calendar']],
  ['the next day off', q('noSchool', { when: 'next' }), ['ada'], 'answered', 'The next day off is {2026-10-09}.', ['page:calendar']],
  ['days off this week', q('noSchool', { when: 'thisWeek' }), [], 'answered', 'No school: {2026-10-09}.', ['page:calendar']],
  ['a break by name', q('noSchool', { about: 'winter break' }), ['ada'], 'notUnderstood', 'The Hub does not have that.', []],
  ['group', q('group', { about: SYM.name, match: SYM }), ['ada'], 'answered', 'Symphony Orchestra, with Dr. Invented Person.', ['group:sym']],
  ['piece', q('piece', { about: 'Invented Overture', match: { kind: 'piece', name: 'Invented Overture', id: 'overture' } }), [], 'answered',
    'Invented Overture, by A. Composer.', ['piece:overture']],
  ['news', q('news'), ['ada'], 'answered', '1 announcement: Bus leaves early.', ['announcement:n1', 'page:announcements']],
  ['documents', q('documents'), [], 'answered', 'Documents are on the Documents page.', ['page:documents']],
  ['howAbsence', q('howAbsence', { when: 'today' }), [], 'answered', 'Report an absence on the Absence page.', ['page:absence']],
  ['howSubmit', q('howSubmit'), [], 'answered', 'Open the assignment and send your video from its page.', ['page:assignments']],
  ['howCheckin', q('howCheckin'), [], 'answered', 'Check in on the Check-In page.', ['page:checkin']],
  ['howCalendar', q('howCalendar'), [], 'answered', 'Subscribe from the calendar page, and it stays up to date.', ['page:calendar']],
  ['howCopy', q('howCopy'), [], 'answered', 'Ask for a copy on the Request Music Copies page.', ['page:copies']],
  ['howAlerts', q('howAlerts'), [], 'answered', 'The Start Guide shows how to turn on alerts.', ['page:start']],
  ['howFindMe', q('howFindMe'), [], 'answered', 'Find your name on the lookup page.', ['page:lookup']],
  ['glossary', q('glossary', { about: 'Call time', match: { kind: 'term', name: 'Call time' } }), [], 'answered',
    "That word is in the Start Guide's glossary.", ['page:glossary']],
  ['glossary, no term', q('glossary'), [], 'notUnderstood', 'I do not have an answer for that.', []],
  // No page and no field: said plainly, never made up.
  ['parking', q('parking'), ['ada'], 'notUnderstood', 'The Hub does not have that.', []],
  ['tickets', q('tickets'), ['ada'], 'notUnderstood', 'The Hub does not have that.', []],
  ['bring', q('bring', { when: 'tomorrow' }), ['ada'], 'notUnderstood', 'The Hub does not have that.', []],
  ['how long, with no concert named', q('duration', { when: 'next' }), ['ada'], 'notUnderstood', 'The Hub does not have that.', []],
  ['how long, start and end stored', q('duration', { about: 'Chamber Night', match: concert('c2', 'Chamber Night') }), ['ada'], 'answered',
    'Chamber Night: starts {2026-10-17} <19:30>, ends <21:00>.', ['event:c2']],
  ['how long, only a start stored', q('duration', { about: 'Fall Concert', match: concert('c1', 'Fall Concert') }), [], 'nothingPosted',
    'Fall Concert: starts {2026-10-10} <19:00>. No end time is posted.', ['event:c1']],
  ['how long, no times stored', q('duration', { about: 'Winter Preview', match: concert('c3', 'Winter Preview') }), [], 'nothingPosted',
    'No times are posted for Winter Preview yet.', ['event:c3']],
  ['who is my teacher', q('whoStaff', { about: 'teacher' }), ['ada'], 'answered', 'Your lesson teacher is Ms. Invented.', ['lesson:l1']],
  ['who is my conductor', q('whoStaff', { about: 'conductor' }), ['ada'], 'answered', 'Symphony Orchestra, with Dr. Invented Person.', ['group:sym']],
  ['who is my teacher, nobody listed', q('whoStaff', { about: 'teacher' }), ['ben'], 'nothingPosted',
    'No teacher or conductor is listed for your groups yet.', ['group:cham']],
  ['how do I contact', q('contactStaff'), ['ada'], 'answered', 'Write to office@example.org.', []],
  ['a thing the records do not hold', q('group', { about: 'Ghost Band', match: G('ghost', 'Ghost Band') }), [], 'notUnderstood',
    'I do not have an answer for that.', []],
];
const seen = new Set<string>();
for (const [label, reading, saved, state, sentence, cards] of CASES) {
  const got = ask(reading, saved);
  seen.add(reading.intent);
  eq(`2. ${label}`, [got.state, got.sentence, cardsOf(got)], [state, sentence, cards]);
}
for (const i of ASK_ANSWERS) check(`2. a case above exercises "${i}"`, seen.has(i));
check('2. reporting an absence is not answered where the page is not mounted',
  ask(q('howAbsence'), [], { features: {} }).state === 'notUnderstood');
check('2. school is not answered for an org with no school calendar',
  ask(q('noSchool', { when: 'tomorrow' }), ['ada'], { use: { ...use, isSchoolDay: undefined } }).state === 'notUnderstood');
check('2. with no contact address handed in, contact is not answered',
  ask(q('contactStaff'), [], { contact: undefined }).sentence === 'The Hub does not have that.');
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
  const hidden = ask(q('due', { about: 'Hidden Quiz', match: { kind: 'assignment', name: 'Hidden Quiz', id: 'a2' } }), ['ada']);
  check('2. a post that is still hidden is not named in `showing` either', hidden.showing === undefined && !JSON.stringify(hidden).includes('Hidden'));
  // "Saturday dec 9" is read as December 9 without checking the weekday, so
  // the date understood is always there to be shown.
  for (const [label, reading, saved] of CASES) {
    const got = ask(reading, saved);
    if (got.showing) check(`2. ${label}: \`showing\` carries the day understood`, /^\d{4}-\d{2}-\d{2}$/.test(got.showing.from ?? ''));
  }
  eq('2. a date is shown as the date it was read as', ask(q('myDay', { when: 'date:12-09' }), ['ada']).showing,
    { intent: 'myDay', when: 'date:12-09', from: '2026-12-09', to: '2026-12-09' });
}

/* ── 3. Who it is for. ────────────────────────────────────────────────── */

const MY: AskParse[] = [
  q('myDay', { when: 'today' }), q('playing', { when: 'today' }), q('where', { when: 'today' }),
  q('cancelled', { when: 'today' }), q('lesson', { when: 'next' }), q('due'), q('seat'), q('parts'), q('forms'),
  q('whoStaff', { about: 'teacher' }),
];
{
  const two = ask(q('myDay', { when: 'today' }), ['ada', 'ben']);
  eq('3. two saved students get one answer each, in the saved order',
    two.forWho.kind === 'several' && two.forWho.each.map(e => [e.student.id, e.student.name, e.state, e.sentence]),
    [['ada', 'Ada Example', 'answered', 'Yes. Symphony Orchestra, today <14:10>, Room 2210.'],
      ['ben', 'Ben Sample', 'answered', 'No. Nothing is on your schedule today.']]);
  check('3. with several, the answer itself holds no sentence and no cards', two.sentence === '' && two.cards.length === 0);
  const flipped = ask(q('myDay', { when: 'today' }), ['ben', 'ada']);
  check('3. no "first child": the order is the saved order',
    flipped.forWho.kind === 'several' && flipped.forWho.each[0].student.id === 'ben');
  const one = ask(q('myDay', { when: 'today' }), ['ada']);
  eq('3. one saved student: the answer is for them', one.forWho, { kind: 'one', student: { id: 'ada', name: 'Ada Example' } });

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
  for (const r of [q('group', { match: SYM }), q('news'), q('documents'), q('howCopy'), q('concert', { match: concert('c2', 'Chamber Night') })]) {
    for (const saved of [[], ['ada'], ['ada', 'ben']]) {
      const got = ask(r, saved);
      check(`3. "${r.intent}" is a general question: it never asks who (${saved.length} saved)`,
        got.state === 'answered' && got.forWho.kind === 'general');
    }
  }
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
  const moved = ask(q('myDay', { when: 'weekday:wed' }), ['cy']);
  eq('4. a moved rehearsal carries its note on any answer', noteOf(moved), [['Scheduled', 'Moved to Room 9 today.']]);
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
  const bare = { ...data, pieces: [] };
  const nothing = ask(q('playing', { when: 'today' }), ['ada'], {}, bare);
  eq('5. with no program posted anywhere, only the rehearsal shows', [nothing.state, nothing.sentence, cardsOf(nothing)],
    ['nothingPosted', 'No music is listed for this rehearsal yet.', ['event:r1']]);
}

/* ── 6. Nothing that has not posted. ──────────────────────────────────── */
{
  const everyone = [[], ['ada'], ['ben'], ['cy'], ['ada', 'ben', 'cy']];
  const whens: (AskWhen | undefined)[] = [undefined, 'today', 'tomorrow', 'thisWeek', 'nextWeek', 'next'];
  let asked = 0;
  for (const intent of ASK_ANSWERS) {
    for (const when of whens) {
      for (const saved of everyone) {
        for (const lang of ['en', 'es'] as const) {
          const got = ask(q(intent, when ? { when } : {}), saved, { lang });
          asked++;
          const all = everything(got);
          const text = JSON.stringify([all.sentences, all.cards.map(c => c.id)]);
          for (const h of HIDDEN) {
            if (new RegExp(`"${h}"|${h.includes(' ') ? h : `\\b${h}\\b`}`).test(text)) {
              check(`6. "${h}" must never appear (${intent} ${when ?? ''} for ${saved.join('+') || 'nobody'})`, false, text);
            }
          }
        }
      }
    }
  }
  check('6. the sweep really ran', asked === ASK_ANSWERS.length * whens.length * everyone.length * 2);
  const byName = (kind: AskName['kind'], id: string, name: string, intent: AskIntent) =>
    ask(q(intent, { about: name, match: { kind, name, id } }), ['ada']);
  check('6. a scheduled assignment asked for by name is not answered', byName('assignment', 'a2', 'Hidden Quiz', 'due').state === 'notUnderstood');
  check('6. a scheduled form asked for by name is not answered', byName('form', 'f3', 'Hidden Form', 'forms').state === 'notUnderstood');
  check('6. an invite-only form asked for by name is not answered', byName('form', 'f2', 'Invited Few', 'forms').state === 'notUnderstood');
  const posted = ask(q('due'), ['ada'], { now: LATER + 1 });
  check('6. and once its moment passes, the assignment shows', cardsOf(posted).includes('assignment:a2'));
  const sent = ask(q('forms'), ['ada'], { sentFormIds: ['f1'] });
  check('6. a form this phone already sent is not waiting', sent.sentence === 'No forms are waiting for you.');
}

/* ── 7. In the audience is not playing. ───────────────────────────────── */
{
  const parts = ask(q('parts'), ['ada']);
  check('7. a concert she only attends adds no piece to her music', !cardsOf(parts).includes('piece:quartet'));
  // After the Fall Concert her next concert is one she only attends.
  const after = { today: '2026-10-11' };
  const next = ask(q('concert', { when: 'next' }), ['ada'], after);
  eq('7. her next concert is the one she attends, and it says so', [next.sentence, cardsOf(next)],
    ['Chamber Night, {2026-10-17} <19:30>, Small Hall. You are in the audience for this one.', ['event:c2!aud', 'page:concerts']]);
  const program = ask(q('playing', { when: 'next' }), ['ada'], after);
  eq('7. "what are we playing at the next concert" skips it', [program.state, program.sentence, cardsOf(program)],
    ['nothingPosted', 'No program is posted for Winter Preview yet.', ['event:c3']]);
  const week = ask(q('playing', { when: 'nextWeek' }), ['ada'], after);
  check('7. and it gives her nothing to practise', !everything(week).cards.some(c => c.id === 'quartet'));
  const call = ask(q('callTime', { when: 'next' }), ['ada'], after);
  check('7. call time is for a concert she plays', cardsOf(call).join() === 'event:c3');
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
      const r = q(intent, when ? { when } : {});
      eq(`8. ${intent} ${when ?? ''}: own record and own pull-outs give the whole roster's answer`, ask(r, ['ada'], {}, short), ask(r, ['ada']));
    }
  }
}

/* ── 9. The import list is an allowlist, and there is no clock. ───────── */
{
  const ALLOWED = [
    'src/shared/ask/corpus.ts', 'src/shared/ask/parse.ts', 'src/shared/ask/answer/answerAsk.ts',
    'src/shared/fuzzy.ts', 'src/shared/studentDay.ts', 'src/shared/changeNoteEs.ts', 'src/shared/pureRules.ts',
    'src/shared/studentRepertoire.ts', 'src/shared/requiredAudience.ts', 'src/shared/signupEligibility.ts',
    'src/shared/formLink.ts', 'src/shared/publicLesson.ts', 'src/director/groupKind.ts', 'src/director/types.ts',
  ].map(p => fileURLToPath(new URL(p, root)));
  const files = ['src/shared/ask/answer.ts', ...readdirSync(new URL('src/shared/ask/answer/', root)).map(f => `src/shared/ask/answer/${f}`)];
  check('9. the module is answer.ts and one file under answer/', files.length === 2, files.join(', '));
  let imports = 0;
  for (const file of files) {
    const src = read(file);
    for (const m of src.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)) {
      imports++;
      const to = m[1].startsWith('.') ? fileURLToPath(new URL(m[1], new URL(file, root))) : m[1];
      check(`9. ${file} imports "${m[1]}", which is not on the allowlist`, ALLOWED.includes(to));
      check(`9. ${file}: "${m[1]}" must carry its .ts`, m[1].endsWith('.ts'));
    }
    const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    check(`9. ${file} reads no clock`, !/Date\.now\(|new Date\(\s*\)|performance\.now/.test(code));
    check(`9. ${file} keeps nothing`, !/localStorage|sessionStorage|document\.|window\./.test(code));
  }
  check('9. the import check really read the imports', imports >= 12, String(imports));
  for (const p of ['src/shared/studentDay.ts', 'src/shared/pureRules.ts', 'src/shared/signupEligibility.ts']) {
    check(`9. ${p} is still there to import`, read(p).length > 0);
  }
}

/* ── 10. English and Spanish. ─────────────────────────────────────────── */
{
  const PAIRS: [AskParse, string[], string, string][] = [
    [q('myDay', { when: 'tomorrow' }), ['ada'],
      'Yes. Symphony Orchestra, tomorrow <14:10>, Room 2210.', 'Sí. Symphony Orchestra, mañana <14:10>, Room 2210.'],
    [q('myDay', { when: 'weekday:thu' }), ['ada'],
      'No. Nothing is on your schedule {2026-10-08}.', 'No. No hay nada en tu horario el {2026-10-08}.'],
    [q('playing', { when: 'today' }), ['ada'],
      'No music is listed for this rehearsal yet. Preparing for Fall Concert, {2026-10-10}.',
      'Todavía no hay música anotada para este ensayo. Preparando Fall Concert, el {2026-10-10}.'],
    [q('cancelled', { when: 'tomorrow' }), ['ben'],
      'Yes. Chamber Players, tomorrow <13:00>: cancelled.', 'Sí. Chamber Players, mañana <13:00>: cancelado.'],
    [q('callTime', { when: 'next' }), ['ada'],
      'Call time for Fall Concert: {2026-10-10} <18:00>.', 'Hora de llegada para Fall Concert: el {2026-10-10} <18:00>.'],
    [q('myDay', { when: 'today' }), [], 'Who is asking?', '¿Quién pregunta?'],
    [q('none'), [], 'I do not have an answer for that.', 'No tengo una respuesta para eso.'],
  ];
  for (const [r, saved, en, es] of PAIRS) {
    const a = ask(r, saved);
    const b = ask(r, saved, { lang: 'es' });
    eq(`10. ${r.intent}: English`, a.sentence, en);
    eq(`10. ${r.intent}: Spanish`, b.sentence, es);
  }
  // Across everything: the same state and the same cards, in other words.
  const strip = (a: AskAnswer) => JSON.stringify([a.state, a.forWho.kind, a.cards.map(sig), a.showing, a.followUps]);
  for (const [label, reading, saved] of CASES) {
    const a = ask(reading, saved);
    const b = ask(reading, saved, { lang: 'es' });
    check(`10. ${label}: Spanish is the same answer`, strip(a) === strip(b));
    // A room's own entry is the directory's words and nothing else.
    check(`10. ${label}: and it is in Spanish`, a.sentence !== b.sentence || label === 'where is a room', a.sentence);
  }
}

/* ── 11. No typed word reaches a sentence. ────────────────────────────── */
{
  const TYPED = ['Zzyzx', 'Qwerty', 'TYPEDNAME'];
  const clean = (a: AskAnswer) => !TYPED.some(w => JSON.stringify(everything(a)).includes(w));
  for (const [label, reading, saved] of CASES) {
    const plain = ask(reading, saved);
    // The same reading, with typed words everywhere a reading can hold them.
    const loud: AskParse = {
      ...reading,
      person: 'Zzyzx Qwerty',
      ...(reading.match ? { match: { ...reading.match, name: reading.match.id ? 'TYPEDNAME' : reading.match.name, also: ['Qwerty'], by: ['Zzyzx'] } } : {}),
    };
    const got = ask(loud, saved);
    check(`11. ${label}: nothing typed is in the answer`, clean(got));
    if (!reading.match || reading.match.id) {
      check(`11. ${label}: the sentence comes from the record, not the reading`, got.sentence === plain.sentence, `${got.sentence} / ${plain.sentence}`);
    }
  }
  const odd = ask(q('myDay', { when: 'today', about: 'Zzyzx' }), ['ada']);
  check('11. a word this file has no table for is not answered, and not repeated', odd.state === 'notUnderstood' && clean(odd));
  const who = ask(q('myDay', { when: 'today', person: 'Ben Sample' }), ['ada']);
  check('11. a person named in the question never changes who it is for',
    who.forWho.kind === 'one' && who.forWho.student.id === 'ada');
  const named = ask(q('myDay', { when: 'today', person: 'Ben Sample' }), []);
  check('11. and never stands in for a saved student', named.state === 'needsWho');
}

/* ── 12. The concert count is only ever a link. ───────────────────────── */
{
  for (const r of [q('required'), q('howCheckin')]) {
    const got = ask(r, ['ada']);
    const tally = got.cards.find(c => c.kind === 'page' && c.id === 'concertTally');
    check(`12. ${r.intent}: the count is a link to the student's own page`, tally?.route === '/student/ada');
    check(`12. ${r.intent}: with nobody saved there is no such link`, !cardsOf(ask(r, [])).includes('page:concertTally'));
  }
  const src = read('src/shared/ask/answer/answerAsk.ts');
  check('12. the module is never handed a check-in', !/checkins?\b|ConcertCheckin|concertTally\(/i.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').replace(/'checkin'|\/checkin|howCheckin|Check-In/g, '')));
}

/* ── 13. Every route is one the app mounts. ───────────────────────────── */
{
  const main = read('src/main.tsx');
  const mounted = (route: string) => {
    const path = route.replace(/#.*$/, '').replace(/^\//, '').replace(/\/(?:ada|ben|cy|[a-z]+\d+|sym|cham|overture|suite|quartet|ID)$/, '/:id');
    return main.includes(`path: '${path}'`);
  };
  eq('13. the route table spells what main.tsx mounts',
    [ASK_ROUTES.event('ID'), ASK_ROUTES.piece('ID'), ASK_ROUTES.group('ID'), ASK_ROUTES.student('ID'), ASK_ROUTES.assignment('ID')].map(mounted),
    [true, true, true, true, true]);
  const routes = new Set<string>();
  for (const [, reading, saved] of CASES) for (const c of everything(ask(reading, saved)).cards) routes.add(c.route);
  check('13. the cases reach a good many routes', routes.size >= 20, String(routes.size));
  for (const r of routes) check(`13. "${r}" is a mounted route`, mounted(r));
  const form = ask(q('forms'), ['ada']).cards[0];
  check('13. a form links through formLink', form?.route === '/form/f1' && read('src/shared/formLink.ts').includes('`/form/${id}`'));
  check('13. a seating chart links through seatingLink', ask(q('seat'), ['ada']).cards[0]?.route === '/seating/ch1');
  const noMap = ask(q('where', { match: room('Room 2210') }), [], { features: {} });
  check('13. with no campus map the room is words only', noMap.state === 'answered' && noMap.cards.length === 0);
}

/* ── 14. Guesses and choices. ─────────────────────────────────────────── */
{
  const offer: AskReading = { intent: 'myDay', when: 'tomorrow' };
  const guess = ask({ intent: 'none', confident: false, suggestions: [offer] }, ['ada']);
  check('14. one suggestion is answered, and marked a guess',
    guess.state === 'answered' && guess.showing?.guessed === true && guess.sentence === 'Yes. Symphony Orchestra, tomorrow <14:10>, Room 2210.');
  check('14. a confident reading is not marked a guess', ask(q('myDay', { when: 'tomorrow' }), ['ada']).showing?.guessed === undefined);
  const two = [offer, { intent: 'concert', when: 'next' } as AskReading];
  const choice = ask({ intent: 'none', confident: false, suggestions: two }, ['ada']);
  check('14. several suggestions come back as choices, with no answer',
    choice.state === 'notUnderstood' && choice.cards.length === 0 && !choice.showing && JSON.stringify(choice.choices) === JSON.stringify(two));
  const nothing = ask({ intent: 'none', confident: false, suggestions: [] }, ['ada']);
  check('14. no reading at all is not understood', nothing.state === 'notUnderstood' && nothing.choices.length === 0);
  const showing = ask(q('myDay', { when: 'thisWeek', about: SYM.name, match: { ...SYM, name: 'TYPEDNAME' } }), []).showing;
  eq('14. "showing" says what was understood, in the record\'s own words', showing,
    { intent: 'myDay', when: 'thisWeek', from: '2026-10-05', to: '2026-10-11', thing: 'Symphony Orchestra' });
}

/* ── 15. Follow-up chips. ─────────────────────────────────────────────── */
{
  const today = ask(q('myDay', { when: 'today' }), ['ada']);
  eq('15. today offers tomorrow and this week', today.followUps, [{ intent: 'myDay', when: 'tomorrow' }, { intent: 'myDay', when: 'thisWeek' }]);
  eq('15. tomorrow offers today and this week',
    ask(q('playing', { when: 'tomorrow' }), ['ada']).followUps.map(r => r.when), ['today', 'thisWeek']);
  const kept = ask(q('myDay', { when: 'today', about: SYM.name, match: SYM }), []);
  check('15. a chip changes the day and keeps the thing', kept.followUps.every(r => r.match?.id === 'sym' && r.intent === 'myDay'));
  for (const r of today.followUps) {
    const again = ask({ ...r, confident: true, suggestions: [] }, ['ada']);
    check(`15. the "${r.when}" chip can be answered as it stands`, again.state === 'answered' && again.showing?.when === r.when);
  }
  for (const r of [q('due'), q('concert', { when: 'next' }), q('news'), q('myDay', { when: 'today' })]) {
    const saved = r.intent === 'myDay' ? [] : ['ada'];
    check(`15. no chips on "${r.intent}"${saved.length ? '' : ' with nobody saved'}`, ask(r, saved).followUps.length === 0);
  }
}

/* ── 16. Date words. ──────────────────────────────────────────────────── */
{
  const DAYS: [AskWhen | undefined, string, string | undefined][] = [
    [undefined, '2026-10-05', undefined], ['next', '2026-10-05', undefined],
    ['today', '2026-10-05', '2026-10-05'], ['tonight', '2026-10-05', '2026-10-05'], ['tomorrow', '2026-10-06', '2026-10-06'],
    ['thisWeek', '2026-10-05', '2026-10-11'], ['nextWeek', '2026-10-12', '2026-10-18'], ['weekend', '2026-10-10', '2026-10-11'],
    ['weekday:mon', '2026-10-05', '2026-10-05'], ['weekday:fri', '2026-10-09', '2026-10-09'], ['weekday:sun', '2026-10-11', '2026-10-11'],
    ['date:12-09', '2026-12-09', '2026-12-09'], ['date:01-15', '2027-01-15', '2027-01-15'], ['date:10-05', '2026-10-05', '2026-10-05'],
    ['day:15', '2026-10-15', '2026-10-15'], ['day:03', '2026-11-03', '2026-11-03'],
    ['month:10', '2026-10-05', '2026-10-31'], ['month:02', '2027-02-01', '2027-02-28'], ['month:12', '2026-12-01', '2026-12-31'],
  ];
  for (const [when, from, to] of DAYS) eq(`16. ${when ?? 'no date'}`, askRange(when, TODAY), to ? { from, to } : { from });
  eq('16. on a Sunday, the weekend is today', askRange('weekend', '2026-10-11'), { from: '2026-10-11', to: '2026-10-11' });
  eq('16. on a Sunday, this week ends today', askRange('thisWeek', '2026-10-11'), { from: '2026-10-11', to: '2026-10-11' });
  for (const when of ['yesterday', 'lastNight', 'lastWeek'] as AskWhen[]) {
    check(`16. "${when}" is behind us`, askRange(when, TODAY) === null);
    check(`16. and a question about it is not answered`, ask(q('myDay', { when }), ['ada']).state === 'notUnderstood');
  }
}

/* ── 17. Times and dates come from the formatter, whole. ──────────────── */
{
  let sentences = 0;
  for (const [label, reading, saved] of CASES) {
    for (const lang of ['en', 'es'] as const) {
      for (const s of everything(ask(reading, saved, { lang })).sentences) {
        sentences++;
        const outside = s.replace(/<[^>]*>|\{[^}]*\}/g, '');
        check(`17. ${label} (${lang}): a time or date in the sentence did not come from the formatter`,
          !/\d{1,2}:\d{2}|\d{4}-\d{2}-\d{2}|\b[ap]\.?m\b/i.test(outside), s);
      }
    }
  }
  check('17. the sweep really ran', sentences >= CASES.length * 2);
  // The formatter decides the words: change it and the sentence follows.
  const loud = ask(q('myDay', { when: 'weekday:thu' }), ['ben'], { use: { ...use, time: () => 'TIME', date: () => 'DATE' } });
  check('17. the formatter\'s own words are what is printed', loud.sentence === 'No. Nothing is on your schedule DATE.', loud.sentence);
}

/* ── 18. The real parser's reading goes straight in. ──────────────────── */
{
  const kit: AskName[] = [
    ...ensembles.map(e => ({ kind: 'group' as const, name: e.name, id: e.id })),
    ...events.filter(e => e.title).map(e => ({ kind: 'concert' as const, name: e.title!, id: e.id })),
  ];
  const typed = (text: string, saved: string[]) => ask(parseAsk(text, kit), saved);
  eq('18. "what do i have today"', typed('what do i have today', ['ada']).sentence, 'Yes. Symphony Orchestra, today <14:10>, Room 2210.');
  eq('18. "que tengo hoy", for a Spanish reader',
    ask(parseAsk('que tengo hoy', kit), ['ada'], { lang: 'es' }).sentence, 'Sí. Symphony Orchestra, hoy <14:10>, Room 2210.');
  check('18. "what do i have today" with nobody saved asks who', typed('what do i have today', []).state === 'needsWho');
  for (const text of ['where do i park', 'how much are tickets', 'what should i bring', 'how long is the concert']) {
    const got = typed(text, ['ada']);
    eq(`18. "${text}": the Hub does not have it, and says so`, [got.state, got.sentence, got.cards.length], ['notUnderstood', 'The Hub does not have that.', 0]);
  }
  eq('18. "who is my teacher"', typed('who is my teacher', ['ada']).sentence, 'Your lesson teacher is Ms. Invented.');
  eq('18. "how do i contact my teacher"', typed('how do i contact my teacher', ['ada']).sentence, 'Write to office@example.org.');
  // December 9, 2026 is a Wednesday. The parser does not check the weekday,
  // so what it read is always shown.
  const dated = typed('what do i have 12/9', ['ada']).showing;
  eq('18. "what do i have 12/9" shows the day it was read as', [dated?.from, dated?.to], ['2026-12-09', '2026-12-09']);
  for (const text of ['who is out today', 'what is ben sample doing today', 'did ada example come to rehearsal']) {
    const got = typed(text, ['ada']);
    check(`18. "${text}" is not answered`, got.state === 'notUnderstood' && got.cards.length === 0, `${got.state}: ${got.sentence}`);
  }
}

if (failures > 0) {
  console.error(`\nanswer.selfcheck: ${failures} failed`);
  process.exit(1);
}
console.log(`answer.selfcheck: ok (${CASES.length} cases, ${ASK_ANSWERS.length} intents)`);
