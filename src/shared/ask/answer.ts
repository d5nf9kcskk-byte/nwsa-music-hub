/**
 * Ask, the answering half (#ask): a reading of the question in, an answer
 * OBJECT out. Data, not JSX and not HTML. The overlay that draws it does not
 * exist yet, so nothing imports this.
 * Design: docs/superpowers/specs/2026-11-11-hub2-integrated-design.md, 3.2,
 * 3.4, 3.6 and 3.7.
 *
 * FOUR STATES, never confused (loading and offline are the screen's):
 *   answered       the records hold the answer, and "Nothing is on your
 *                  schedule Friday." is an answer
 *   nothingPosted  the thing asked about exists, but the part asked for is
 *                  blank: a rehearsal with no music listed, a concert with no
 *                  call time
 *   notUnderstood  two kinds, told apart by `showing`:
 *                  - no reading, several readings (they come back as
 *                    `choices`), the past, a staff question, a record that is
 *                    hidden or gone: no `showing`
 *                  - understood, and the Hub holds no record for it
 *                    (parking, tickets, a break by name): `showing` is set
 *                    and the sentence says the Hub does not have it
 *   needsWho       a "my" question and nobody is saved on this phone
 *
 * WHO. The module reads students from `opts.saved` (the ids identity.ts keeps
 * on the device) and from nowhere else. It never looks a student up by a
 * word in the question. A saved id that is archived or gone counts as nobody
 * saved. Several saved students get one answer each. A group named in the
 * question never stands in for the saved student: the answer is that
 * student's own day, narrowed to the group.
 *
 * THE SENTENCE states a fact. It never starts "Yes" or "No": the reading
 * does not carry which way round the question was put, so "is school closed
 * Friday" and "is there school Friday" get the same sentence and it answers
 * both. It is built from the fixed tables at the bottom (English and Spanish)
 * and from the records. No typed word reaches it: a name is printed from the
 * record the reading points at, never from the reading itself. It never words
 * a change: a cancelled event or lesson gets the word its own card prints
 * ("Cancelled"), a moved one is named with its time and room and nothing
 * else, and the director's own note rides on the card, through
 * `changeNoteFor`. A group named in the question is named in the sentence,
 * so it never speaks for the whole schedule.
 *
 * LOOKUPS. A named record is found in ONE place (`found`, below), from lists
 * that already leave out everything hidden: an assignment that has not
 * posted, a form that has not posted, is closed or is by invitation. So a
 * hidden record cannot reach a sentence, a card or `showing`, whatever the
 * reading says.
 *
 * WHAT IT READS. Public records only (#privacy), through the same rules the
 * pages use: `studentDay` for a student's day, `isAssignmentOpen` and
 * `isPublished` for assignments, the sign-up filters for forms,
 * `concertChartFor` for a group's seating chart. Some of the repo's ONE
 * definitions cannot be loaded by plain Node (they reach the org config,
 * React or Firestore), so the caller hands them in as `opts.use`: the time
 * and date formatters, the announcements filter, the seating chart address
 * and the school calendars. The org's contact address and time zone come in
 * the same way. That keeps one definition of each and keeps this file pure.
 *
 * Pure: no React, no Firestore, no org config, no clock (`now` is an
 * argument, and the day and the time of day are both read from it in the
 * school's time zone, so they cannot disagree), nothing kept between calls.
 * Relative imports carry `.ts`.
 * It must never import `director/utils` (#student-day). The import list is
 * an allowlist, pinned by `checkImports` in askKit.selfcheck.ts.
 */

import type { AskIntent, AskWhen } from './corpus.ts';
import type { AskName, AskParse, AskReading } from './parse.ts';
import { MACROS, PUBLIC_TEMPLATES } from './templates.ts';
import { normalizeText } from '../fuzzy.ts';
import { studentDay } from '../studentDay.ts';
import { changeNoteFor } from '../changeNoteEs.ts';
import { byDueDateOpenFirst, isAssignmentOpen, isPublished, pieceEnsembleIds } from '../pureRules.ts';
import { eventPieces } from '../studentRepertoire.ts';
import { concertChartFor } from '../concertRosters.ts';
import { hasAudienceRequirement, requiredAudienceEvents } from '../requiredAudience.ts';
import { eligibleForSignup, isCollegeGrade, signupIsOpen, signupShowsInAlerts, signupShowsInIndex } from '../signupEligibility.ts';
import { FORMS_PATH, formPath } from '../formLink.ts';
import { firstName } from '../personName.ts';
import { isMasterClass } from '../../director/groupKind.ts';
import type {
  Announcement, Assignment, CalendarEvent, CampusLocation, Ensemble, EventStatus, Lesson, RepertoirePiece,
  RosterOverride, SeatingChart, SignupForm, SignupSlotBooking, Student,
} from '../../director/types.ts';
import type { PublicLessonKey } from '../publicLesson.ts';

/* ── What goes in ─────────────────────────────────────────────────────── */

/** Only these fields, and the rest of the record's fields may not be there
 *  at all. A staff record does not fit, so the compiler refuses one. */
type Only<T, K extends keyof T> = Pick<T, K> & { [P in Exclude<keyof T, K>]?: never };

/** A `studentsPublic` doc: what `publicStudentFields` publishes, and the id. */
export type AskStudent = Only<Student, 'id' | 'name' | 'preferredName' | 'instrument' | 'section' | 'ensembleIds' | 'status' | 'grade'>;
/** A `rosterOverridesPublic` doc: everything but the free-text reason. */
export type AskOverride = Only<RosterOverride, Exclude<keyof RosterOverride, 'reason'>>;
/** A `lessonsPublic` doc: when and where, never the log. */
export type AskLesson = { id: string } & Partial<Pick<Lesson, PublicLessonKey>>
  & { [P in Exclude<keyof Lesson, PublicLessonKey | 'id'>]?: never };

/** The public records, already loaded. `students`, `overrides`, `lessons`
 *  and `bookings` may hold only the saved student's own rows (design 3.6). */
export interface AskData {
  students: AskStudent[];
  /** Every event loaded, not cut down to a range. */
  events: CalendarEvent[];
  overrides: AskOverride[];
  ensembles: Pick<Ensemble, 'id' | 'name' | 'kind' | 'conductorName' | 'staff'>[];
  forms?: SignupForm[];
  bookings?: SignupSlotBooking[];
  pieces?: RepertoirePiece[];
  charts?: SeatingChart[];
  lessons?: AskLesson[];
  assignments?: Assignment[];
  announcements?: Announcement[];
  locations?: Pick<CampusLocation, 'room' | 'label' | 'directions' | 'mapAnchor'>[];
}

/** The repo's ONE definitions that plain Node cannot load. The overlay
 *  passes the real ones; this file never writes its own. */
export interface AskUse {
  /** `formatTime` in src/director/utils: "14:10" to "2:10 PM". It takes its
   *  language from the device toggle, not from `opts.lang`: keep them in step. */
  time: (hhmm: string) => string;
  /** `fmtLongDateInline` in src/shared/dates: a date inside a sentence. The
   *  same note about language applies. */
  date: (ymd: string) => string;
  /** `visibleAnnouncements` in src/director/hooks/useAnnouncements. */
  visibleAnnouncements: (
    list: Announcement[], today: string, ensembleIds: string[] | 'all', now: number,
  ) => Announcement[];
  /** `seatingChartPath` in src/director/seating/seatingLink. */
  seatingChartPath: (chartId: string) => string;
  /** Is this weekday a school day on that campus: `isMdcpsSchoolDay` and
   *  `isCollegeSessionDay`. */
  isSchoolDay?: (ymd: string, campus: AskCampus) => boolean;
  /** The school year each calendar covers: `MDCPS_YEAR` and `MDC_YEAR` in
   *  src/shared/academicCalendars. Outside it the calendar knows nothing, so
   *  a question about school is not answered. Left out, with `isSchoolDay`,
   *  for an org with no school calendar. */
  schoolYear?: Record<AskCampus, { from: string; to: string }>;
}
export type AskCampus = 'hs' | 'college';

export interface AskOptions {
  lang: 'en' | 'es';
  /** The moment asked, in ms. ONE clock: with `timeZone` it gives today's
   *  date and the time of day at the school, and it keeps scheduled posts
   *  hidden. There is no separate "today" to disagree with it. */
  now: number;
  /** The school's time zone (`timezone` in the org config), e.g.
   *  "America/New_York". Empty, or a zone this device does not know, falls
   *  back to the device's own zone rather than throwing. */
  timeZone: string;
  /** The student ids saved on this device, in any order. */
  saved: readonly string[];
  use: AskUse;
  /** An org with public student info switched off: general answers only. */
  generalOnly?: boolean;
  /** Forms this device already sent (signupReceipt): not a to-do any more. */
  sentFormIds?: readonly string[];
  /** The org's feature flags, for pages that are not always mounted. */
  features?: { absenceReport?: boolean; campusMap?: boolean; contactForm?: boolean };
  /** The org's public contact address (`contactEmail` in the org config). */
  contact?: string;
}

/* ── What comes out ───────────────────────────────────────────────────── */

export type AskState = 'answered' | 'nothingPosted' | 'notUnderstood' | 'needsWho';

/** Pages a card can send somebody to. */
export type AskPageId =
  | 'absence' | 'assignments' | 'checkin' | 'calendar' | 'copies' | 'start' | 'glossary' | 'lookup'
  | 'documents' | 'forms' | 'announcements' | 'concerts' | 'requiredConcerts' | 'contact'
  /** The student's own page: the concert count lives there behind a school
   *  email, so Ask only ever links to it. */
  | 'concertTally'
  /** The student's own page, where their calendar is subscribed to. */
  | 'mySchedule';

/** One card for the overlay to draw with the card the pages already use.
 *  `route` is an in-app path. `label` marks the "Preparing for" cards. */
export type AskCard =
  | {
    kind: 'event'; id: string; route: string;
    /** Exactly as stored. */
    status: EventStatus;
    /** The director's own note, through `changeNoteFor`. Never reworded. */
    changeNote?: string;
    /** Required in the audience, not playing (#required-audience). */
    attendanceOnly?: true;
    label?: 'preparingFor';
  }
  | { kind: 'piece'; id: string; route: string; label?: 'preparingFor' }
  | { kind: 'assignment'; id: string; route: string }
  | { kind: 'lesson'; id: string; route: string; status?: EventStatus }
  | { kind: 'form'; id: string; route: string }
  | { kind: 'page'; id: AskPageId; route: string }
  | { kind: 'group'; id: string; route: string }
  | { kind: 'place'; id: string; route: string }
  | { kind: 'seating'; id: string; route: string }
  | { kind: 'announcement'; id: string; route: string };

/** One answer: for everyone, or for one student. */
export interface AskAnswerBody {
  state: 'answered' | 'nothingPosted';
  sentence: string;
  cards: AskCard[];
}

/** `name` is what to call them: the name they go by, else their first name. */
export interface AskStudentRef { id: string; name: string }

export type AskForWho =
  /** The same answer for everyone. It never asks for a name. */
  | { kind: 'general' }
  | { kind: 'one'; student: AskStudentRef }
  /** A parent: one answer per saved student, in the saved order. */
  | { kind: 'several'; each: (AskAnswerBody & { student: AskStudentRef })[] }
  /** A "my" question and nobody saved: ask who is asking. */
  | { kind: 'nobody' };

/** What was understood, for "Showing X. Not this?". */
export interface AskShowing {
  intent: AskIntent;
  when?: AskWhen;
  /** The days that meant, YYYY-MM-DD. Always there: "saturday dec 9" is read
   *  as December 9 whatever the weekday, so the day read must be shown. */
  from: string;
  /** No `to` means "from then on". */
  to?: string;
  /** The named thing, as the RECORD spells it, or a word from the parser's
   *  own template tables ("sectional"). Never a word from the reading that
   *  is neither. */
  thing?: string;
  /** The parser was not sure and offered exactly one reading: this is it. */
  guessed?: true;
}

export interface AskAnswer {
  state: AskState;
  /** One plain sentence. Empty when `forWho` is 'several': each has its own. */
  sentence: string;
  cards: AskCard[];
  forWho: AskForWho;
  /** Left out when nothing was understood. */
  showing?: AskShowing;
  /** "Did you mean": several readings and no answer. */
  choices: AskReading[];
  /** The one-change chips ("Tomorrow", "This week"), as readings. Each
   *  carries only what was read: the record's own name, never a typed one. */
  followUps: AskReading[];
}

/** Every intent this file answers. The self-check holds it against the
 *  public templates, so a new intent there cannot go unanswered in silence.
 *  The last row is the questions the Hub has no page or field for. */
export const ASK_ANSWERS = [
  'myDay', 'playing', 'where', 'cancelled', 'lesson', 'due', 'seat', 'parts', 'forms',
  'concert', 'callTime', 'dress', 'pickup', 'required',
  'noSchool', 'group', 'piece', 'news', 'documents',
  'howAbsence', 'howSubmit', 'howCheckin', 'howCalendar', 'howCopy', 'howAlerts', 'howFindMe', 'glossary',
  'parking', 'tickets', 'bring', 'duration', 'whoStaff', 'contactStaff',
] as const satisfies readonly AskIntent[];
type Answered = (typeof ASK_ANSWERS)[number];

/** The kinds of named thing each question can be about, as the answers
 *  below use them. It matches the parser's own table (KINDS in parse.ts,
 *  which is not exported). An intent that is not here takes no name. */
const A_CONCERT: readonly AskName['kind'][] = ['concert', 'venue', 'group', 'piece'];
const ABOUT: Partial<Record<Answered, readonly AskName['kind'][]>> = {
  myDay: ['group', 'concert'],
  playing: ['group', 'concert', 'venue', 'room'],
  where: ['group', 'room', 'venue', 'concert'],
  cancelled: ['group', 'concert'],
  due: ['assignment', 'group'],
  seat: ['group'],
  parts: ['piece', 'group'],
  forms: ['form', 'group'],
  concert: A_CONCERT, callTime: A_CONCERT, dress: A_CONCERT, pickup: A_CONCERT, required: A_CONCERT,
  duration: ['concert'],
  group: ['group'],
  piece: ['piece'],
  documents: ['group'],
  glossary: ['term'],
};

/** The same spellings the public pages write (src/main.tsx). Forms and
 *  seating charts have a helper of their own and use it. */
export const ASK_ROUTES = {
  event: (id: string) => `/event/${id}`,
  piece: (id: string) => `/piece/${id}`,
  group: (id: string) => `/ensemble/${id}`,
  student: (id: string) => `/student/${id}`,
  assignment: (id: string) => `/assignments/${id}`,
} as const;

/** A page's name, exactly as the menu spells it in each language. Keyed by
 *  the menu's own key in src/shared/translations.ts, which cannot be loaded
 *  here (it reads the org config). The self-check reads that file and fails
 *  if a name here has drifted from it. */
export const ASK_PAGE_NAMES = {
  'nav.absence': { en: 'Report an Absence', es: 'Reportar una ausencia' },
  'nav.assignments': { en: 'Assignments & Exams', es: 'Tareas y exámenes' },
  'nav.calendar': { en: 'Calendar', es: 'Calendario' },
  'nav.checkin': { en: 'Concert Check-In', es: 'Registro de conciertos' },
  'nav.copies': { en: 'Request Music Copies', es: 'Pedir copias de música' },
  'nav.documents': { en: 'Documents', es: 'Documentos' },
  'nav.mySchedule': { en: 'My Schedule', es: 'Mi horario' },
  'nav.signups': { en: 'Forms', es: 'Formularios' },
  'nav.startHere': { en: 'Start Here', es: 'Empieza aquí' },
  // The Home screen, and what its button for finding a student is called.
  'nav.home': { en: 'Home', es: 'Inicio' },
  'home.findMySchedule': { en: 'Find My Schedule', es: 'Buscar mi horario' },
} as const;

/** Words a sentence shares with the cards: "Cancelled" as the event card and
 *  the lesson card both print it, and what the lesson card calls a lesson.
 *  Keyed and checked the same way as the page names. */
export const ASK_CARD_WORDS = {
  'card.cancelled': { en: 'Cancelled', es: 'Cancelado' },
  'sched.lesson': { en: 'Private lesson', es: 'Clase particular' },
} as const;

/** The words a public template can hand back as what the question is about,
 *  by INTENT: "sectional" on my day, "finals" on school, "teacher" on who.
 *  `about` is believed only when it is one of the words that intent's own
 *  templates can capture, or the name of a record that was found. "Winter"
 *  on a lesson question is not read. The parser exports no single list, so
 *  this is read off its templates. */
const TABLE_WORDS = new Map<string, Set<string>>();
for (const t of PUBLIC_TEMPLATES) {
  for (const m of t.t.matchAll(/\{([^}]+)\}/g)) {
    const words = TABLE_WORDS.get(t.intent) ?? new Set<string>();
    for (const w of m[1].split('|').flatMap(x => (MACROS[x] ?? x).split('|'))) words.add(w);
    TABLE_WORDS.set(t.intent, words);
  }
}

/* ── Days. Arithmetic only: every date a person reads is `use.date`. ──── */

const DAY_MS = 86_400_000;
const ms = (ymd: string) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
const ymdOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const plus = (ymd: string, days: number) => ymdOf(ms(ymd) + days * DAY_MS);
/** A day that exists: not February 30, and not February 29 in a plain year. */
const real = (ymd: string) => /^\d{4}-\d{2}-\d{2}$/.test(ymd) && ymdOf(ms(ymd)) === ymd;
/** 0 Sunday to 6 Saturday. */
const weekdayOf = (ymd: string) => new Date(ms(ymd)).getUTCDay();
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

interface Range { from: string; to?: string }

/**
 * The days a date word means, counted from today. null = not a day this
 * answers about: behind us, or not a real date.
 *
 * A week runs Monday to Sunday, and only its days still to come are asked
 * about. A date with its month ("11/9") and a month ("october") are read
 * INSIDE the school year today is in (August 1 to July 31) and never jump a
 * year to stay ahead: "11/9" asked on November 10 is yesterday, which is the
 * past, and not next November. "5/1" asked in November is next May, in the
 * same school year.
 *
 * In June and July the school year is over, so August to December is the
 * COMING autumn: "8/16" asked on July 20 is next month, not last August.
 * The same holds on any day after `yearEnd`, the stored school year's last
 * day, when a caller has one to hand in.
 *
 * A day of the month with no month ("the 15th") is the parser's meaning: the
 * NEXT day with that number, today included. "The 4th" asked on the 5th is
 * next month's 4th. A month that has no such day is passed over: "the 30th"
 * asked on January 31 is March 30.
 */
export function askRange(when: AskWhen | undefined, today: string, yearEnd?: string): Range | null {
  const one = (d: string): Range | null => (real(d) && d >= today ? { from: d, to: d } : null);
  if (!when || when === 'next') return { from: today };
  if (when === 'today' || when === 'tonight') return one(today);
  if (when === 'tomorrow') return one(plus(today, 1));
  const monday = plus(today, -((weekdayOf(today) + 6) % 7));
  if (when === 'thisWeek') return { from: today, to: plus(monday, 6) };
  if (when === 'nextWeek') return { from: plus(monday, 7), to: plus(monday, 13) };
  if (when === 'weekend') {
    const saturday = plus(monday, 5);
    return { from: today > saturday ? today : saturday, to: plus(monday, 6) };
  }
  const [kind, value] = when.split(':');
  // The school year today is in starts the August 1 on or before it.
  const year = +today.slice(0, 4);
  const start = year - (today.slice(5) >= '08-01' ? 0 : 1);
  // Summer: the year is over and the next has not begun. August to December
  // is then the autumn ahead, in this calendar year.
  const summer = today.slice(5) < '08-01' && (today.slice(5) >= '06-01' || (!!yearEnd && today > yearEnd && yearEnd.slice(0, 4) === today.slice(0, 4)));
  const yearOf = (month: string) => (summer ? year : month >= '08' ? start : start + 1);
  if (kind === 'weekday') return WEEKDAYS.includes(value) ? one(plus(today, (WEEKDAYS.indexOf(value) - weekdayOf(today) + 7) % 7)) : null;
  if (kind === 'date') return one(`${yearOf(value.slice(0, 2))}-${value}`);
  if (kind === 'day') {
    // Two months and a day reaches any day number from any day of the year.
    for (let n = 0; n <= 62; n++) if (plus(today, n).slice(8) === value) return one(plus(today, n));
    return null;
  }
  if (kind === 'month') {
    const y = yearOf(value);
    const first = `${y}-${value}-01`;
    const last = ymdOf(Date.UTC(y, +value, 0));
    return real(first) && last >= today ? { from: first > today ? first : today, to: last } : null;
  }
  return null;
}

/** With no end stored, how long a thing is taken to last, in minutes. It errs
 *  towards still showing something that may have just ended. */
const ASSUMED_MINUTES = 120;
const EVENING = 17 * 60;
const minutes = (hhmm?: string) => (hhmm && /^\d{1,2}:\d{2}/.test(hhmm) ? +hhmm.split(':')[0] * 60 + +hhmm.split(':')[1] : undefined);
/** The date and the minutes past midnight at the school, at the moment asked.
 *  ONE reading of the one clock. A zone that is empty or unknown to this
 *  device falls back to the device's own zone: it never throws. */
function clockAt(now: number, timeZone: string | undefined): { today: string; clock: number } {
  const format = (zone: string | undefined) => new Intl.DateTimeFormat('en-US', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = format(timeZone || undefined);
  } catch {
    formatter = format(undefined);
  }
  const parts = formatter.formatToParts(new Date(now));
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? '00';
  return { today: `${part('year')}-${part('month')}-${part('day')}`, clock: +part('hour') * 60 + +part('minute') };
}
const DAY = 24 * 60;
/** A time stored before the start is after midnight only when it is 6:00 AM
 *  or earlier: 22:00 to 00:30. Any later (15:00 to 14:00) is a typing
 *  mistake, and a time equal to the start is not a day long. */
const wraps = (start: number | undefined, t: number | undefined) =>
  start !== undefined && t !== undefined && t < start && t <= 6 * 60;
/** When a thing starts and ends, in minutes past midnight on its own day:
 *  22:00 to 00:30 ends at 24:30. With no end stored, or an end that is not
 *  after the start and not past midnight, it is taken to last ASSUMED_MINUTES. */
function spanOf(x: { startTime?: string; endTime?: string }): { start?: number; ends?: number } {
  const start = minutes(x.startTime);
  const stored = minutes(x.endTime);
  const ends = wraps(start, stored) ? stored! + DAY
    : stored !== undefined && (start === undefined || stored > start) ? stored
      : start === undefined ? undefined : start + ASSUMED_MINUTES;
  return { start, ends };
}

/* ── The answer ───────────────────────────────────────────────────────── */

type Body = AskAnswerBody & {
  /** The same for everyone: not repeated for each saved student. */
  general?: boolean;
};
/** 'who' = this is a "my" question and nobody is asking. 'notHeld' = it was
 *  understood and the Hub has no record for it. null = no answer, and
 *  nothing is said about what was asked. */
type Result = Body | 'who' | 'notHeld' | null;

/** One thing on a schedule: an event, or a lesson. */
interface Entry {
  date: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  live: boolean;
  status?: EventStatus;
  event?: CalendarEvent;
  lesson?: AskLesson;
  /** The pieces that are this student's (or this group's) to play on it. */
  pieces: RepertoirePiece[];
  attendanceOnly: boolean;
  /** The groups it is on the schedule through. */
  ensembleIds: string[];
  /** A concert asked about that is not on this student's schedule at all. */
  absent?: boolean;
}

export function answerAsk(parse: AskParse, data: AskData, opts: AskOptions): AskAnswer {
  const L = opts.lang === 'es' ? ES : EN;
  const { use, now } = opts;
  const none = (choices: AskReading[] = []): AskAnswer => ({
    state: 'notUnderstood', sentence: end(L.notUnderstood), cards: [], forWho: { kind: 'general' },
    choices: choices.map(({ intent, when, about, match }) =>
      ({ intent, ...(when ? { when } : {}), ...(about ? { about } : {}), ...(match ? { match } : {}) })),
    followUps: [],
  });
  // A moment that is not a number is no moment: there is no "today" to answer about.
  if (!Number.isFinite(now)) return none();
  const { today, clock } = clockAt(now, opts.timeZone);
  const yesterday = plus(today, -1);

  /* Which reading. One the parser is sure of, or the only one it offered. */
  const guessed = !parse.confident;
  const picked = parse.confident ? parse : parse.suggestions.length === 1 ? parse.suggestions[0] : undefined;
  if (!picked) return none(parse.suggestions);
  const { intent, when, about, match } = picked;
  // The last day of the stored school year, when one is handed in: after it
  // (and in June and July either way) autumn means the autumn ahead.
  const yearEnd = use.schoolYear ? [use.schoolYear.hs.to, use.schoolYear.college.to].sort().pop() : undefined;
  const range = askRange(when, today, yearEnd);
  if (!range || !(ASK_ANSWERS as readonly string[]).includes(intent)) return none();
  // A name of a kind this question cannot be about is not half-read: the
  // answer would be about something else, with the name shown beside it.
  if (match && !(ABOUT[intent as Answered] ?? []).includes(match.kind)) return none();

  /* ── The ONE place a named record is found ─────────────────────────────
   * Each list holds only what a page would show. Nothing hidden is in one,
   * so nothing hidden can be found, named or carded by any intent. Only the
   * record's own words are ever printed: `match.name` is compared, no more. */
  const same = (a?: string, b?: string) => !!a && !!b && normalizeText(a).trim() === normalizeText(b).trim();
  const visible = {
    tasks: (data.assignments ?? []).filter(a => isPublished(a, now)),
    // The forms page lists open forms only, and never one that is by invitation.
    forms: (data.forms ?? []).filter(f => signupIsOpen(f, today, now) && signupShowsInIndex(f)),
  };
  const found = <T extends { id: string }>(kind: AskName['kind'], list: readonly T[] | undefined, nameOf: (x: T) => string | undefined) =>
    (match?.kind === kind
      ? (list ?? []).find(x => x.id === match.id) ?? (list ?? []).find(x => same(nameOf(x), match.name))
      : undefined);
  const byTime = (a: { date: string; startTime?: string }, b: { date: string; startTime?: string }) =>
    a.date.localeCompare(b.date) || (a.startTime ?? '99').localeCompare(b.startTime ?? '99');
  const isLive = (x: { status?: string }) => x.status !== 'Cancelled';
  /** Already over: a day gone by, or ended earlier today. A thing that runs
   *  past midnight is not over at any hour of its own day. */
  const over = (x: { date?: string; startTime?: string; endTime?: string }) => {
    if (!x.date || x.date > today) return false;
    if (x.date < yesterday) return true;
    const { ends } = spanOf(x);
    // One that began yesterday is over unless it is still going past midnight.
    if (x.date === yesterday) return ends === undefined || ends - DAY <= clock;
    return ends !== undefined && ends <= clock;
  };
  const group = found('group', data.ensembles, e => e.name);
  const piece = found('piece', data.pieces, p => p.title);
  const task = found('assignment', visible.tasks, a => a.title);
  const form = found('form', visible.forms, f => f.title);
  // A concert by name: the one still to come, even when the reading's own id
  // points at last year's concert of the same name.
  const byId = match?.kind === 'concert' ? data.events.find(e => e.id === match.id) : undefined;
  const titled = match?.kind === 'concert'
    ? data.events.filter(e => e === byId || same(e.title, byId?.title) || same(e.title, match.name)).sort(byTime) : [];
  /** Behind us: over. For a PICKUP question, a concert with a pickup time
   *  stored is still ahead until that time has passed, not only until it
   *  ends: "when is pickup" at 9:10, after a 9:00 end, with pickup at 9:30. */
  const behind = (x: { date?: string; startTime?: string; endTime?: string; pickupTime?: string }) => {
    if (!over(x)) return false;
    const pickup = intent === 'pickup' && x.date && x.date >= yesterday ? minutes(x.pickupTime) : undefined;
    if (pickup === undefined) return true;
    // Both counted from midnight of the concert's own day.
    return pickup + (wraps(minutes(x.startTime), pickup) ? DAY : 0) <= clock + (x.date === yesterday ? DAY : 0);
  };
  const concert = (byId && !behind(byId) ? byId : undefined)
    ?? titled.find(e => !behind(e) && isLive(e)) ?? titled.find(e => !behind(e))
    ?? byId ?? titled[titled.length - 1];
  // A concert that is over is the past, like any day gone by: it is not
  // answered about, and never in the present tense ("Call time for ...").
  if (concert && behind(concert)) return none();
  // A room or a hall: the directory's own entry, or the words an event uses.
  const asked = match?.kind === 'room' || match?.kind === 'venue' ? match.name : undefined;
  const room = asked ? (data.locations ?? []).find(l => same(l.room, asked) || same(l.label, asked)) : undefined;
  const place = room?.room ?? (asked ? data.events.find(e => same(e.location, asked))?.location : undefined);
  if (match && match.kind !== 'term' && !group && !piece && !task && !form && !concert && !place) return none();
  // A word is believed only from the parser's own tables, and only on the
  // intent whose templates can capture it.
  if (about && !match && !TABLE_WORDS.get(intent)?.has(about)) return none();
  const word = match ? undefined : about;
  /** What was named, in the record's own words. */
  const thing = group?.name ?? (concert && (concert.title?.trim() || undefined)) ?? piece?.title ?? task?.title ?? form?.title ?? place ?? word;
  const reading: AskReading = {
    intent, ...(when ? { when } : {}), ...(thing ? { about: thing } : {}),
    ...(match && thing ? { match: { kind: match.kind, name: thing, ...(match.id ? { id: (group ?? piece ?? task ?? form ?? concert)?.id ?? match.id } : {}) } } : {}),
  };

  /* ── Small parts ───────────────────────────────────────────────────── */

  const piecesById = Object.fromEntries((data.pieces ?? []).map(p => [p.id, p]));
  const masterIds = new Set(data.ensembles.filter(isMasterClass).map(e => e.id));
  const titleOf = (e: CalendarEvent) => e.title?.trim()
    || e.ensembleIds.map(id => data.ensembles.find(g => g.id === id)?.name).filter(Boolean).join(' + ')
    || e.type;
  /** A date as words, with the year when it is not this calendar year. */
  const dated = (ymd: string) => (ymd.slice(0, 4) === today.slice(0, 4) ? use.date(ymd) : L.inYear(use.date(ymd), ymd.slice(0, 4)));
  const dayOf = (ymd: string) => (ymd === today ? L.today : ymd === plus(today, 1) ? L.tomorrow : L.on(dated(ymd)));
  /** "Symphony Orchestra, tomorrow 2:10 PM, Room 2210", skipping what is blank. */
  const line = (name: string | undefined, date: string | undefined, time?: string, ...rest: (string | undefined)[]) =>
    [name, [date && dayOf(date), time && use.time(time)].filter(Boolean).join(' '), ...rest.map(r => r?.trim())].filter(Boolean).join(', ');
  /** A pickup or an end, with its day: one after midnight is the next day. */
  const clockLine = (e: CalendarEvent, time: string) =>
    line(undefined, wraps(minutes(e.startTime), minutes(time)) ? plus(e.date, 1) : e.date, time);
  const oneDay = range.to === range.from;
  /** The days asked about, as words: "tomorrow", "this week", a date. */
  const days = (() => {
    if (concert || !when || when === 'next') return '';
    const fixed = (L.when as Record<string, string | undefined>)[when];
    if (fixed) return fixed;
    return oneDay ? L.on(dated(range.from)) : L.span(dated(range.from), dated(range.to!));
  })();
  /** The same, left out where a count is followed by a dated line, so no
   *  date is printed twice. */
  const countDays = oneDay || (when && when in L.when) ? days : '';
  const inRange = (date: string, r: Range = range) => date >= r.from && (!r.to || date <= r.to);
  /** Began yesterday and is not behind us: still going past midnight, or, for
   *  a pickup question, its pickup still ahead. It belongs to today's
   *  questions, so a range that starts today takes it in. */
  const carried = (e: CalendarEvent, r: Range) => r.from === today && e.date === yesterday && !behind(e);
  const eventsIn = (r: Range = range) => data.events.filter(e => inRange(e.date, r) || carried(e, r));

  /** Reaches the evening: starts at five or later, or is still running after
   *  five. It is a fact about the thing, not about the hour it is asked, so a
   *  4:30 to 9:00 dress rehearsal is "tonight" at noon and at six alike, and
   *  a 2:10 to 3:30 rehearsal never is. A thing with no time stored counts:
   *  it is today. */
  const evening = (x: Entry) => {
    const { start, ends } = spanOf(x);
    return start === undefined || start >= EVENING || (ends !== undefined && ends > EVENING);
  };
  /** "Tonight": the evening's things that are not behind us. */
  const tonight = (x: Entry) => evening(x) && !behind(x.event ?? x);
  /** Was part of the evening, and has ended. */
  const wasTonight = (x: Entry) => x.live && evening(x) && over(x);
  /** The next one: the first still on and not over, else a cancelled one. */
  const nextOf = (list: Entry[]) => {
    const ahead = list.filter(i => !over(i));
    const on = ahead.find(i => i.live);
    return on ? [on] : ahead.slice(0, 1);
  };
  /** The entries a date word leaves: tonight's, the next one, or all of them. */
  const window = (list: Entry[]) => (when === 'tonight' ? list.filter(tonight) : !when || when === 'next' ? nextOf(list) : list);

  /** The cards' own words, so a sentence and the card under it agree. */
  const cancelledWord = ASK_CARD_WORDS['card.cancelled'][opts.lang];
  const lessonWord = ASK_CARD_WORDS['sched.lesson'][opts.lang];
  /** `under`: the sentence already opens with this group's name, so a line
   *  whose only name is that group is its time and room. A thing that began
   *  yesterday always carries its date. */
  const lineOf = (i: Entry, withDate = true, under?: string) => {
    const date = withDate || i.date < today ? i.date : undefined;
    if (!i.event) return line(lessonWord, date, i.startTime, i.location, i.lesson?.teacherName);
    const title = titleOf(i.event);
    return (title === under && line(undefined, date, i.startTime, i.location)) || line(title, date, i.startTime, i.location);
  };

  /** The director's note, word for word, or nothing when it is blank. */
  const noteOf = (e: CalendarEvent) => {
    const note = changeNoteFor(e, opts.lang);
    return note?.trim() ? note : undefined;
  };
  const eventCard = (i: Pick<Entry, 'event' | 'attendanceOnly'>, label?: 'preparingFor'): AskCard => {
    const e = i.event!;
    const note = noteOf(e);
    return {
      kind: 'event', id: e.id, route: ASK_ROUTES.event(e.id), status: e.status,
      ...(note ? { changeNote: note } : {}), ...(i.attendanceOnly ? { attendanceOnly: true as const } : {}),
      ...(label ? { label } : {}),
    };
  };
  const cardFor = (me: AskStudent | undefined) => (i: Entry): AskCard => (i.event || !me || !i.lesson
    ? eventCard(i)
    : { kind: 'lesson', id: i.lesson.id, route: ASK_ROUTES.student(me.id), ...(i.lesson.status ? { status: i.lesson.status } : {}) });
  const pieceCard = (p: RepertoirePiece, label?: 'preparingFor'): AskCard =>
    ({ kind: 'piece', id: p.id, route: ASK_ROUTES.piece(p.id), ...(label ? { label } : {}) });
  const groupCard = (g: { id: string }): AskCard => ({ kind: 'group', id: g.id, route: ASK_ROUTES.group(g.id) });
  const page = (id: AskPageId, route: string): AskCard => ({ kind: 'page', id, route });
  const ok = (sentence: string, cards: AskCard[], general = false): Body => ({ state: 'answered', sentence: end(sentence), cards, general });
  const notYet = (sentence: string, cards: AskCard[], general = false): Body => ({ state: 'nothingPosted', sentence: end(sentence), cards, general });
  /** A door, not an answer: the page that does it. */
  const door = (sentence: string, ...cards: AskCard[]): Result => ok(sentence, cards, true);
  /** A page's name, as the menu spells it in this language. */
  const P = (key: keyof typeof ASK_PAGE_NAMES) => ASK_PAGE_NAMES[key][opts.lang];

  /* ── Whose events ──────────────────────────────────────────────────────
   * A student's come from `studentDay`, the ONE answer. A group's, a named
   * concert's or a room's are read off the calendar and are the same for
   * everybody. */
  const mine = (me: AskStudent, r: Range = range): Entry[] =>
    // Asked from yesterday when the range starts today, for what is `carried`.
    studentDay(me.id, { ...r, from: r.from === today ? yesterday : r.from, now }, data).events
      .filter(x => inRange(x.event.date, r) || carried(x.event, r)).map(x => ({
      date: x.event.date, startTime: x.event.startTime, endTime: x.event.endTime, location: x.event.location,
      live: isLive(x.event), status: x.event.status, event: x.event,
      pieces: x.pieces, attendanceOnly: x.exp.attendanceOnly, ensembleIds: x.exp.ensembleIds,
    }));
  const myLessons = (me: AskStudent, r: Range = range): Entry[] =>
    studentDay(me.id, { ...r, now }, data).lessons.map(l => ({
      date: l.date!, startTime: l.startTime, endTime: l.endTime, location: l.location,
      live: isLive(l), status: l.status, lesson: l, pieces: [], attendanceOnly: false, ensembleIds: [],
    }));
  const open = (list: CalendarEvent[]): Entry[] => [...list].sort(byTime).map(event => ({
    date: event.date, startTime: event.startTime, endTime: event.endTime, location: event.location,
    live: isLive(event), status: event.status, event,
    attendanceOnly: false, ensembleIds: group ? [group.id] : event.ensembleIds,
    pieces: eventPieces(event, piecesById)
      .filter(p => !group || pieceEnsembleIds(p).length === 0 || pieceEnsembleIds(p).includes(group.id)),
  }));
  /** What a concert on the calendar is to this student: playing, in the
   *  audience, or not on their schedule. */
  const relate = (me: AskStudent, i: Entry): Entry =>
    mine(me, { from: i.date, to: i.date }).find(x => x.event!.id === i.event!.id) ?? { ...i, absent: true };
  /** The events a question about a day is about. A named group narrows the
   *  saved student's own day: it never replaces it. undefined = a "my"
   *  question and nobody is asking. */
  const scope = (me: AskStudent | undefined, r: Range = range): Entry[] | undefined => {
    if (concert) return open([concert]);
    if (group) {
      // Theirs THROUGH that group, and of its music only that group's: a
      // student in two groups asking what one of them plays is not handed
      // the other's pieces.
      return me
        ? mine(me, r).filter(i => i.ensembleIds.includes(group.id)).map(i => ({
          ...i, ensembleIds: [group.id],
          pieces: i.pieces.filter(p => pieceEnsembleIds(p).length === 0 || pieceEnsembleIds(p).includes(group.id)),
        }))
        : open(eventsIn(r).filter(e => e.ensembleIds.includes(group.id)));
    }
    return me ? mine(me, r) : undefined;
  };
  const emptyDay = (me: AskStudent | undefined): Body => {
    if (group) return ok(me ? L.notOnMine(group.name, days) : L.noneFor(group.name, days), [groupCard(group)], !me);
    return ok(me ? L.noneMine(days) : L.noneAll(days), [], !me);
  };
  /** Each one named, up to three, then the count of the rest. The only
   *  status word is "Cancelled", as the cards print it. A thing that is
   *  changed and still on is its time and room: the note is on the card. A
   *  stored status this file does not know is never printed. */
  const statuses = (list: Entry[]) => sentences(
    ...list.slice(0, 3).map(i => (i.live ? lineOf(i) : L.is(lineOf(i), cancelledWord))),
    list.length > 3 ? L.more(list.length - 3) : '',
  );
  /** A group named in the question is named in the answer: the sentence
   *  must not read as if it spoke for the student's whole schedule. */
  const groupName = group?.name;

  /* ── About me ─────────────────────────────────────────────────────── */

  /** What do I have, and where. `needRoom`: the question is which room. */
  const schedule = (me: AskStudent | undefined, needRoom: boolean): Result => {
    // "Where is Room 2210", with no day: the room itself.
    if (place && !when) {
      if (!room) return notYet(L.noDirections, [], true);
      const route = opts.features?.campusMap ? `/map${room.mapAnchor ? `#${room.mapAnchor}` : ''}` : undefined;
      return ok(L.room(room.room, room.label, room.directions?.trim()), route ? [{ kind: 'place', id: room.room, route }] : [], true);
    }
    let all = scope(me);
    if (!all) return 'who';
    const general = !me || !!concert;
    if (word) {
      if (/^(?:sectional|seccional)/.test(word)) all = all.filter(i => i.event!.type === 'Sectional');
      else if (/^masterclass/.test(word)) all = all.filter(i => i.event!.ensembleIds.some(id => masterIds.has(id)));
      else return null;
    } else if (me && !group && !concert && !needRoom) {
      // The student's page shows lessons in the day, so the day has them too.
      all = [...all, ...myLessons(me)].sort(byTime);
    }
    const list = concert ? all : window(all);
    const card = cardFor(me);
    if (list.length === 0) {
      // Something was on today (or this evening), and it is over.
      const gone = when === 'tonight' ? all.filter(wasTonight) : range.from === today && oneDay ? all.filter(i => i.live) : [];
      return gone.length > 0 ? ok(L.noMore(days, groupName), gone.map(card), general) : emptyDay(me);
    }
    const cards = list.map(card);
    const on = list.filter(i => i.live);
    if (on.length === 0) return ok(statuses(list), cards, general);
    const lead = concert ? on[0] : on.find(i => !over(i));
    if (!lead) return ok(L.noMore(days, groupName), cards, general);
    // "Are we in Room 2210 today": where we are, which says it either way.
    if (place) return ok(lineOf(on.find(i => !over(i) && same(i.location, place)) ?? lead), cards, general);
    if (needRoom) return lead.location?.trim() ? ok(lineOf(lead), cards, general) : notYet(L.noRoom(lineOf(lead)), cards, general);
    const said = on.length > 1 ? L.things(on.length, countDays, lineOf(lead, !oneDay, groupName), range.from === today && oneDay, groupName) : lineOf(lead);
    return ok(lead.attendanceOnly ? sentences(said, L.audience) : said, cards, general);
  };

  const cancelled = (me: AskStudent | undefined): Result => {
    const all = scope(me);
    if (!all) return 'who';
    const list = concert ? all : window(all);
    if (list.length === 0) return emptyDay(me);
    const general = !me || !!concert;
    // What changed is the stored status and the director's note. The note
    // stays on the card; the sentence names the event, and says "Cancelled"
    // when that is its status.
    const changed = list.filter(i => !i.live || !!noteOf(i.event!));
    return changed.length === 0
      ? ok(L.noChange(days, groupName), list.map(i => eventCard(i)), general)
      : ok(statuses(changed), changed.map(i => eventCard(i)), general);
  };

  /** What are we playing. With a day: that day's rehearsals. With none, or
   *  "the next concert": a concert's program. */
  const playing = (me: AskStudent | undefined): Result => {
    const program = !!concert || !when || when === 'next';
    const general = !me || !!place;
    const music = (i: Entry) => i.pieces.length > 0 || !!i.event!.repertoire?.trim();
    const titles = (ps: RepertoirePiece[]) => L.list(ps.slice(0, 3).map(p => p.title), ps.length - 3);
    const say = (i: Entry) => (i.pieces.length > 0 ? L.playing(line(titleOf(i.event!), i.date), titles(i.pieces)) : L.musicListed(line(titleOf(i.event!), i.date)));
    const all = place
      ? open(eventsIn().filter(e => same(e.location, place)))
      : scope(me, program ? { from: today } : range);
    if (!all) return 'who';

    if (program) {
      // A concert by name is the same for everybody, until a student is
      // saved: then it is what THEY play on it, or that they only attend.
      const next = concert
        ? (me ? relate(me, all[0]) : all[0])
        : all.find(i => i.live && !over(i) && !i.attendanceOnly && i.event!.type === 'Concert');
      if (!next) return ok(L.noConcert(!general, '', groupName), group ? [groupCard(group)] : [], general);
      const cards = [eventCard(next), ...next.pieces.map(p => pieceCard(p))];
      if (!next.live) return ok(statuses([next]), [eventCard(next)], general);
      if (next.absent) return ok(L.notOnSchedule(titleOf(next.event!)), [eventCard(next)], general);
      if (next.attendanceOnly) return ok(L.inAudience(lineOf(next)), [eventCard(next)], general);
      return music(next) ? ok(say(next), cards, general) : notYet(L.noProgram(titleOf(next.event!)), cards, general);
    }

    const list = window(all);
    if (list.length === 0) return emptyDay(me);
    const cards = list.map(i => eventCard(i));
    const theirs = list.filter(i => i.live && !i.attendanceOnly);
    // What is still to come, when anything is: a rehearsal that ended this
    // morning is not what "what are we playing today" is asking about.
    const playable = theirs.some(i => !over(i)) ? theirs.filter(i => !over(i)) : theirs;
    const listed = playable.filter(music);
    if (listed.length > 0) {
      return ok(say(listed[0]), [...cards, ...unique(listed.flatMap(i => i.pieces)).map(p => pieceCard(p))], general);
    }
    // Something is on the day, and none of it is theirs to play: say what is
    // there. A concert they attend, or a rehearsal that is off.
    if (playable.length === 0) {
      const attends = list.find(i => i.live && i.attendanceOnly);
      return ok(attends ? L.inAudience(lineOf(attends)) : statuses(list), cards, general);
    }
    // Nothing posted. Then, labelled, that group's next concert and the
    // pieces that are that group's on it.
    const target = playable.find(i => i.event!.type !== 'Class') ?? playable[0];
    const groups = new Set(target.ensembleIds);
    const ahead = me && !place
      ? mine(me, { from: today })
      : open(data.events.filter(e => e.date >= today && e.ensembleIds.some(id => groups.has(id))));
    const next = ahead.find(i => i.event!.type === 'Concert' && i.live && !over(i) && !i.attendanceOnly
      && i.ensembleIds.some(id => groups.has(id)));
    const prep = (next?.pieces ?? []).filter(p => pieceEnsembleIds(p).length === 0 || pieceEnsembleIds(p).some(id => groups.has(id)));
    const blank = list.length > 1 ? L.noMusicFor(lineOf(target)) : L.noMusic;
    return notYet(
      next && prep.length > 0 ? sentences(blank, L.preparing(line(titleOf(next.event!), next.date))) : blank,
      [...cards, ...(next && prep.length > 0 ? [eventCard(next, 'preparingFor'), ...prep.map(p => pieceCard(p, 'preparingFor'))] : [])],
      general,
    );
  };

  const lesson = (me: AskStudent | undefined): Result => {
    if (!me) return 'who';
    const list = window(myLessons(me));
    if (list.length === 0) return ok(L.noLesson(days), []);
    const cards = list.map(cardFor(me));
    const on = list.find(i => i.live && !over(i)) ?? list.find(i => i.live);
    if (!on) return ok(statuses(list), cards);
    const said = line(undefined, on.date, on.startTime, on.location, on.lesson?.teacherName);
    return ok(!when || when === 'next' ? L.nextLesson(said) : L.lesson(said), cards);
  };

  const taskCard = (a: Assignment): AskCard => ({ kind: 'assignment', id: a.id, route: ASK_ROUTES.assignment(a.id) });
  const dueSaid = (a: Assignment) => (a.dueDate < today ? L.wasDue(a.title, dayOf(a.dueDate)) : L.dueOne(a.title, dayOf(a.dueDate)));
  const due = (me: AskStudent | undefined): Result => {
    if (task) return ok(dueSaid(task), [taskCard(task)], true);
    let list: Assignment[];
    if (group) {
      list = visible.tasks
        .filter(a => isAssignmentOpen(a, today, now) && a.ensembleIds.includes(group.id) && (!range.to || a.dueDate <= range.to))
        .sort(byDueDateOpenFirst(today));
    } else if (!me) return 'who';
    // Due ON OR BEFORE the day asked: what is due Thursday is still owed on Friday.
    else list = studentDay(me.id, { from: today, to: range.to, now }, data).assignments;
    if (word) {
      const types = /^playing/.test(word) ? ['Playing Exam'] : ['Playing Exam', 'Written Test'];
      list = list.filter(a => types.includes(a.type));
    }
    const cards = [...list.map(taskCard), page('assignments', '/assignments')];
    if (list.length === 0) return ok(L.noneDue(days, groupName), cards, !!group);
    const first = list[0];
    return ok(list.length > 1 ? L.dueMany(list.length, first.title, dayOf(first.dueDate), first.dueDate < today, groupName) : dueSaid(first), cards, !!group);
  };

  /** My chair. Which chart is a group's is `concertChartFor`'s decision: the
   *  group's own roster before one work's personnel, and the newest of those. */
  const seat = (me: AskStudent | undefined): Result => {
    const charts = data.charts ?? [];
    const card = (c: SeatingChart): AskCard => ({ kind: 'seating', id: c.id, route: use.seatingChartPath(c.id) });
    const chairIn = (c: SeatingChart, id: string) => c.sections.flatMap(s => {
      const at = s.seats.findIndex(x => x.studentId === id);
      return at < 0 ? [] : [{ c, section: s.section, chair: at + 1 }];
    })[0];
    if (group) {
      const chart = concertChartFor(undefined, group.id, charts);
      if (!chart) return notYet(L.noChartFor(group.name), [groupCard(group)], !me);
      if (!me) return ok(L.chartFor(group.name, chart.title), [card(chart)], true);
      const at = chairIn(chart, me.id);
      return at ? ok(L.seat(at.section, at.chair, chart.title), [card(chart)]) : notYet(L.noSeatIn(group.name), [card(chart)]);
    }
    if (!me) return 'who';
    const seats = me.ensembleIds.flatMap(id => {
      const chart = concertChartFor(undefined, id, charts);
      const at = chart && chairIn(chart, me.id);
      return at ? [at] : [];
    });
    if (seats.length === 0) return notYet(L.noSeat, []);
    return ok(sentences(...seats.map(s => L.seat(s.section, s.chair, s.c.title))), seats.map(s => card(s.c)));
  };

  const parts = (me: AskStudent | undefined): Result => {
    if (piece) return ok(L.partsOf(piece.title), [pieceCard(piece)], true);
    if (group) {
      const ps = (data.pieces ?? []).filter(p => pieceEnsembleIds(p).includes(group.id)).sort((a, b) => a.order - b.order);
      return ps.length > 0 ? ok(L.piecesFor(ps.length, group.name), ps.map(p => pieceCard(p)), true) : notYet(L.noPiecesFor(group.name), [groupCard(group)], true);
    }
    if (!me) return 'who';
    // What they PLAY on what is still to come. An audience concert adds nothing.
    const ps = unique(mine(me, { from: today }).filter(i => i.live).flatMap(i => i.pieces));
    return ps.length > 0 ? ok(L.myPieces(ps.length), ps.map(p => pieceCard(p))) : notYet(L.noMusicMine, []);
  };

  const forms = (me: AskStudent | undefined): Result => {
    const formCard = (f: SignupForm): AskCard => ({ kind: 'form', id: f.id, route: formPath(f.id) });
    const index = page('forms', FORMS_PATH);
    if (form) return ok(L.formOpen(form.title, form.deadline && dayOf(form.deadline)), [formCard(form)], true);
    if (word) return ok(L.onPage(L.formsWord, P('nav.signups')), [index], true);
    const sent = new Set(opts.sentFormIds ?? []);
    // The alert strip's own filter (SignupAlert): open, posted, for a group.
    const waiting = visible.forms.filter(f => signupShowsInAlerts(f) && !sent.has(f.id));
    let list: SignupForm[];
    if (group) list = waiting.filter(f => (f.ensembleIds ?? []).includes(group.id));
    else if (!me) return 'who';
    else {
      list = waiting.filter(f => eligibleForSignup(me, {
        ensembleIds: f.ensembleIds ?? [], families: f.families ?? [], highSchoolOnly: f.highSchoolOnly,
      }));
    }
    list.sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'));
    if (list.length === 0) return ok(group ? L.noFormsFor(group.name) : L.noForms, [index], !!group);
    const first = list[0];
    return ok(L.forms(list.length, first.title, first.deadline && dayOf(first.deadline), groupName), [...list.map(formCard), index], !!group);
  };

  /* ── About a concert ──────────────────────────────────────────────── */

  /** The concerts asked about. A saved student's own, unless a concert,
   *  group, hall or piece is named: then those, each marked with what it is
   *  to that student. With nobody saved, the school's. */
  const concerts = (me: AskStudent | undefined): Entry[] => {
    if (concert) return open([concert]).map(i => (me ? relate(me, i) : i));
    const pool = place ? data.events.filter(e => e.date >= today && same(e.location, place))
      : group ? eventsIn().filter(e => e.ensembleIds.includes(group.id))
        : undefined;
    let list = (pool ? open(pool) : me ? mine(me) : open(eventsIn()))
      .filter(i => i.event!.type === 'Concert');
    // A piece named: the concerts that have it on the program.
    if (piece) list = list.filter(i => eventPieces(i.event!, piecesById).some(p => p.id === piece.id));
    return pool && me ? list.map(i => relate(me, i)) : list;
  };
  /** The concerts still to come that the date word leaves. */
  const coming = (me: AskStudent | undefined) => {
    const all = concerts(me);
    if (concert) return all;
    return !when || when === 'next' || place ? all.filter(i => !behind(i.event!)) : window(all);
  };

  const concertAnswer = (me: AskStudent | undefined): Result => {
    // "The winter concert": no record says which concert that is.
    if (word) return 'notHeld';
    const general = !me;
    const all = coming(me);
    const list = (when === 'next' || place) && !concert ? nextOf(all) : all;
    const season = page('concerts', '/concerts');
    if (list.length === 0) return ok(L.noConcert(!general, days, groupName), [season], general);
    const cards = [...list.map(i => eventCard(i)), season];
    const on = list.filter(i => i.live);
    if (on.length === 0) return ok(statuses(list), cards, general);
    const said = on.length > 1 ? L.concerts(on.length, countDays, lineOf(on[0], true, groupName), groupName) : lineOf(on[0]);
    return ok(on[0].attendanceOnly ? sentences(said, L.audience) : said, cards, general);
  };

  /** Call time, what to wear, pickup: one field of one concert's day sheet.
   *  Call time and dress are a performer's: a student who only attends is
   *  told so, and is never given them. */
  const daySheet = (me: AskStudent | undefined, what: 'call' | 'dress' | 'pickup'): Result => {
    if (word) return 'notHeld';
    const general = !me;
    const all = coming(me);
    const named = !!(concert || place || group || piece);
    // A pickup still ahead of a concert that has ended is the players'. To
    // somebody who sat in its audience, that concert is over.
    const next = all.find(i => i.live && !(i.attendanceOnly && over(i)) && (named || what === 'pickup' || !i.attendanceOnly));
    if (!next) {
      if (concert && over(concert)) return null;
      const off = all.find(i => !i.live);
      return off && named ? ok(statuses([off]), [eventCard(off)], general) : ok(L.noConcert(!general, days, groupName), [], general);
    }
    const e = next.event!;
    const cards = [eventCard(next)];
    const t = titleOf(e);
    if (next.absent) return ok(L.notOnSchedule(t), cards);
    if (next.attendanceOnly && what !== 'pickup') return ok(L.inAudience(lineOf(next)), cards);
    if (what === 'call') {
      return e.callTime ? ok(L.call(t, line(undefined, e.date, e.callTime)), cards, general) : notYet(L.noCall(t), cards, general);
    }
    if (what === 'dress') return e.dress?.trim() ? ok(L.dress(t, e.dress.trim()), cards, general) : notYet(L.noDress(t), cards, general);
    // Pickup is for whoever played. Somebody in the audience leaves when it ends.
    if (e.pickupTime && !next.attendanceOnly) return ok(L.pickup(t, clockLine(e, e.pickupTime)), cards, general);
    return e.endTime ? ok(L.ends(t, clockLine(e, e.endTime)), cards, general) : notYet(L.noPickup(t), cards, general);
  };

  const required = (me: AskStudent | undefined): Result => {
    if (word) return 'notHeld';
    const all = page('requiredConcerts', '/required-concerts');
    // The count of concerts attended is behind a school email: only a link.
    const tally = me ? [page('concertTally', ASK_ROUTES.student(me.id))] : [];
    // One concert: named, or "the next concert".
    const one = concert ? concerts(me)[0] : when === 'next' ? coming(me).find(i => i.live) : undefined;
    if (one) {
      const t = titleOf(one.event!);
      const cards = [eventCard(one), all, ...tally];
      // A cancelled concert is required of nobody.
      if (!one.live) return ok(statuses([one]), cards, !me);
      if (!me) return ok(hasAudienceRequirement(one.event!) ? L.reqSome(t) : L.reqNobody(t), cards, true);
      return ok(one.absent ? L.notOnSchedule(t) : one.attendanceOnly ? L.reqAttend(t) : L.reqPlay(t), cards);
    }
    // The concerts in the days asked that are still on. Never a cancelled one.
    const pool = eventsIn().filter(e => e.type === 'Concert' && isLive(e) && !over(e));
    if (!me) {
      if (!group) {
        const list = requiredAudienceEvents(pool);
        return ok(list.length > 0 ? L.reqAll(list.length, countDays) : L.reqAllNone(days),
          [...list.map(event => eventCard({ event, attendanceOnly: false })), all], true);
      }
      // A group: what it plays, and what it must sit in the audience for.
      const plays = pool.filter(e => e.ensembleIds.includes(group.id));
      const attends = requiredAudienceEvents(pool, group.id);
      const list = [...plays.map(event => ({ event, attendanceOnly: false })), ...attends.map(event => ({ event, attendanceOnly: true }))]
        .sort((a, b) => byTime(a.event, b.event));
      return ok(list.length > 0 ? L.reqGroup(group.name, plays.length, attends.length) : L.noneFor(group.name, days),
        [...list.map(i => eventCard(i)), groupCard(group), all], true);
    }
    const list = mine(me).filter(i => i.event!.type === 'Concert' && i.live && !over(i) && (!group || i.ensembleIds.includes(group.id)));
    if (list.length === 0) return group ? emptyDay(me) : ok(L.noConcert(true, days), [all, ...tally]);
    const audience = list.filter(i => i.attendanceOnly).length;
    // With a group named, the count is that group's, and says so.
    return ok(
      group ? L.reqGroup(group.name, list.length - audience, audience) : L.reqMine(list.length, list.length - audience, audience, countDays),
      [...list.map(i => eventCard(i)), all, ...tally],
    );
  };

  /** How long is it. The Hub stores no length, so this is the start and,
   *  only when one is stored, the end, each said as what it is. The reading
   *  does not say whether a concert or a rehearsal was meant, so only a
   *  concert asked for by name is answered. */
  const duration = (): Result => {
    if (!concert) return 'notHeld';
    const cards = [eventCard({ event: concert, attendanceOnly: false })];
    const t = titleOf(concert);
    if (!concert.startTime) return notYet(L.noTimes(t), cards, true);
    const starts = line(undefined, concert.date, concert.startTime);
    return concert.endTime
      ? ok(L.startsEnds(t, starts, use.time(concert.endTime)), cards, true)
      : notYet(L.startsOnly(t, starts), cards, true);
  };

  /* ── About the school ─────────────────────────────────────────────── */

  const noSchool = (me: AskStudent | undefined): Result => {
    const inSession = use.isSchoolDay;
    // A break by name, finals, the end of a term: the Hub holds days, not names.
    if (!inSession || !use.schoolYear || (word && word !== 'mdc')) return 'notHeld';
    // MDC decides college and MDCPS decides high school (#college-hs-calendar-deps).
    const campus: AskCampus = word === 'mdc' || (me && isCollegeGrade(me.grade)) ? 'college' : 'hs';
    const year = use.schoolYear[campus];
    const general = word === 'mdc' || !me;
    const weekend = (d: string) => weekdayOf(d) === 0 || weekdayOf(d) === 6;
    const off = (d: string) => !weekend(d) && !inSession(d, campus);
    const cards = [page('calendar', '/calendar')];
    // The calendar is one school year. Outside it, it says nothing.
    const to = range.to ?? year.to;
    if (range.from < year.from || range.from > year.to || to > year.to) return 'notHeld';
    if (!when || when === 'next') {
      for (let d = today; d <= year.to; d = plus(d, 1)) {
        // Today is not "the next day off": it is no school today.
        if (off(d)) return ok(d === today ? L.noSchool(L.today) : L.nextOff(dayOf(d)), cards, general);
      }
      return notYet(L.noDayOff, cards, general);
    }
    if (oneDay) return ok(weekend(range.from) || off(range.from) ? L.noSchool(days) : L.school(days), cards, general);
    const weekdays: string[] = [];
    for (let d = range.from; d <= to; d = plus(d, 1)) if (!weekend(d)) weekdays.push(d);
    // "This weekend": no weekday is being asked about.
    if (weekdays.length === 0) return ok(L.noSchool(days), cards, general);
    const closed = weekdays.filter(off);
    return ok(closed.length > 0 ? L.daysOff(closed.map(dated).join('; ')) : L.schoolAll(days), cards, general);
  };

  /** Who a group is led by, as its own page names them. Names only. */
  const staffOf = (g: AskData['ensembles'][number]) =>
    g.conductorName?.trim() || (g.staff ?? []).map(s => s.name?.trim()).filter(Boolean).join(', ');
  /** Who is my teacher, conductor or director: the lesson card names the
   *  teacher, and each of my groups names who leads it. */
  const whoStaff = (me: AskStudent | undefined): Result => {
    if (!me) return 'who';
    if (/^(?:teacher|maestr|profesor)/.test(word ?? '')) {
      const taught = myLessons(me, { from: today }).find(i => i.lesson?.teacherName?.trim());
      if (taught) return ok(L.lessonTeacher(taught.lesson!.teacherName!.trim()), [cardFor(me)(taught)]);
    }
    const groups = data.ensembles.filter(g => me.ensembleIds.includes(g.id));
    const led = groups.filter(g => staffOf(g));
    return led.length > 0
      ? ok(sentences(...led.map(g => L.group(g.name, staffOf(g)))), led.map(groupCard))
      : notYet(L.noStaff, groups.map(groupCard));
  };

  /** What is new. A saved student sees what their own page shows them: the
   *  school's posts and their groups'. With nobody saved, every post. */
  const news = (me: AskStudent | undefined): Result => {
    const stamp = (a: Announcement) => Math.max(a.publishAt ?? 0, a.createdAt ?? 0);
    const list = [...use.visibleAnnouncements(data.announcements ?? [], today, me ? me.ensembleIds : 'all', now)]
      .sort((a, b) => stamp(b) - stamp(a));
    const all = page('announcements', '/announcements');
    if (list.length === 0) return ok(L.noNews, [all], !me);
    return ok(
      L.news(list.length, list[0].title),
      [...list.slice(0, 5).map((a): AskCard => ({ kind: 'announcement', id: a.id, route: '/announcements' })), all], !me,
    );
  };

  const answers: Record<Answered, (me: AskStudent | undefined) => Result> = {
    myDay: me => schedule(me, false),
    where: me => schedule(me, true),
    cancelled, playing, lesson, due, seat, parts, forms,
    concert: concertAnswer,
    callTime: me => daySheet(me, 'call'),
    dress: me => daySheet(me, 'dress'),
    pickup: me => daySheet(me, 'pickup'),
    required, noSchool, news,
    group: () => (group ? door(L.group(group.name, staffOf(group)), groupCard(group)) : null),
    piece: () => (piece ? door(L.piece(piece.title, piece.composer?.trim()), pieceCard(piece)) : null),
    documents: () => door(L.onPage(L.documentsWord, P('nav.documents')), ...(group ? [groupCard(group)] : []), page('documents', '/documents')),
    howAbsence: () => (opts.features?.absenceReport ? door(L.goTo(P('nav.absence')), page('absence', '/absence')) : 'notHeld'),
    howSubmit: () => door(L.howSubmit(P('nav.assignments')), page('assignments', '/assignments')),
    howCheckin: me => (me
      ? ok(L.goTo(P('nav.checkin')), [page('checkin', '/checkin'), page('concertTally', ASK_ROUTES.student(me.id))])
      : door(L.goTo(P('nav.checkin')), page('checkin', '/checkin'))),
    howCalendar: me => (me
      ? ok(L.howCalendar(P('nav.mySchedule')), [page('mySchedule', ASK_ROUTES.student(me.id)), page('calendar', '/calendar')])
      : door(L.howCalendar(P('nav.calendar')), page('calendar', '/calendar'))),
    howCopy: () => door(L.goTo(P('nav.copies')), page('copies', '/copies')),
    howAlerts: () => door(L.howAlerts(P('nav.startHere')), page('start', '/start')),
    // Not a page in the menu: the button the Home screen calls by this name.
    howFindMe: () => door(L.onHome(P('home.findMySchedule'), P('nav.home')), page('lookup', '/lookup')),
    glossary: () => (match?.kind === 'term' ? door(L.glossary(P('nav.startHere')), page('glossary', '/start#glossary')) : null),
    // No page and no field holds these. Never an invented answer.
    parking: () => 'notHeld',
    tickets: () => 'notHeld',
    bring: () => 'notHeld',
    duration, whoStaff,
    contactStaff: () => (opts.contact?.trim()
      ? door(L.contact(opts.contact.trim()), ...(opts.features?.contactForm ? [page('contact', '/contact')] : []))
      : 'notHeld'),
  };

  /* ── Who it is for ────────────────────────────────────────────────── */

  // Saved on this phone, and still an active student. Anybody else is nobody.
  const people = opts.generalOnly ? [] : unique(opts.saved)
    .map(id => data.students.find(s => s.id === id && s.status === 'Active'))
    .filter((s): s is AskStudent => !!s);
  const run = answers[intent as Answered];
  const first = run(people[0]);
  if (first === null) return none();

  const showing: AskShowing = {
    intent, ...(when ? { when } : {}), from: range.from, ...(range.to ? { to: range.to } : {}),
    ...(thing ? { thing } : {}), ...(guessed ? { guessed: true as const } : {}),
  };
  if (first === 'who') {
    if (opts.generalOnly) return none();
    return { state: 'needsWho', sentence: L.who, cards: [], forWho: { kind: 'nobody' }, showing, choices: [], followUps: [] };
  }
  if (first === 'notHeld') return { ...none(), sentence: end(L.notHeld), showing };
  // A named concert has its own date, and a room alone has none to change.
  const followUps: AskReading[] = FOLLOW_UP.has(intent) && !concert && !(place && !when)
    ? (['today', 'tomorrow', 'thisWeek'] as const).filter(w => w !== when).slice(0, 2).map(w => ({ ...reading, when: w }))
    : [];
  const body = ({ state, sentence, cards }: Body): AskAnswerBody => ({ state, sentence, cards });
  const ref = (s: AskStudent): AskStudentRef => ({ id: s.id, name: s.preferredName?.trim() || firstName(s.name) });
  const rest = { showing, choices: [], followUps };
  if (first.general || people.length === 0) return { ...body(first), forWho: { kind: 'general' }, ...rest };
  if (people.length === 1) return { ...body(first), forWho: { kind: 'one', student: ref(people[0]) }, ...rest };
  const each = people.flatMap((s, k) => {
    const got = k === 0 ? first : run(s);
    return got && typeof got !== 'string' ? [{ student: ref(s), ...body(got) }] : [];
  });
  return {
    state: each.some(a => a.state === 'answered') ? 'answered' : 'nothingPosted',
    sentence: '', cards: [], forWho: { kind: 'several', each }, ...rest,
  };
}

/** The questions about a day: the chips change the day and nothing else. */
const FOLLOW_UP = new Set<AskIntent>(['myDay', 'playing', 'where', 'cancelled']);

function unique<T>(list: readonly T[]): T[] {
  return [...new Set(list)];
}

/** One full stop at the end, and never two: a Spanish time ends "p.m.". */
const end = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
/** Sentences side by side. Every join of two sentences goes through here,
 *  so the first one's full stop is `end`'s too: "... 7:30 p.m. No hay ...",
 *  never "p.m..". A blank part is left out. */
const sentences = (...parts: string[]) => parts.filter(Boolean).map(end).join(' ');

/* ── The words. Every sentence is one of these, filled from a record. ────
 * None ends in a full stop of its own writing: `end` adds the one, and a
 * form that is two sentences is built with `sentences`. None starts "Yes"
 * or "No". A form that can be asked about one group takes the group's name
 * and says it. */

const sp = (s: string) => (s ? ` ${s}` : '');

const EN = {
  notUnderstood: 'I do not have an answer for that',
  notHeld: 'The Hub does not have that',
  who: 'Who is asking?',
  today: 'today',
  tomorrow: 'tomorrow',
  on: (date: string) => date,
  inYear: (date: string, year: string) => `${date}, ${year}`,
  span: (a: string, b: string) => `from ${a} to ${b}`,
  when: { today: 'today', tonight: 'tonight', tomorrow: 'tomorrow', thisWeek: 'this week', nextWeek: 'next week', weekend: 'this weekend' },
  more: (n: number) => `And ${n} more`,
  list: (names: string[], more: number) => names.join(', ') + (more > 0 ? `, and ${more} more` : ''),
  is: (x: string, status: string) => `${x}: ${status}`,
  things: (n: number, days: string, x: string, next: boolean, group?: string) =>
    sentences(`${group ? `${group}: ` : ''}${n} things${sp(days)}`, `${next ? 'Next' : 'First'}: ${x}`),
  audience: 'You are in the audience for this one',
  inAudience: (x: string) => `You are in the audience: ${x}`,
  noMore: (days: string, group?: string) => (group ? `Nothing more for ${group}${sp(days)}` : `Nothing more is on your schedule${sp(days)}`),
  noChange: (days: string, group?: string) => `Nothing is cancelled or changed${group ? ` for ${group}` : ''}${sp(days)}`,
  noneMine: (days: string) => `Nothing is on your schedule${sp(days)}`,
  noneAll: (days: string) => `Nothing is on the calendar${sp(days)}`,
  noneFor: (group: string, days: string) => `Nothing is on the calendar for ${group}${sp(days)}`,
  notOnMine: (group: string, days: string) => `${group} is not on your schedule${sp(days)}`,
  notOnSchedule: (title: string) => `${title} is not on your schedule`,
  noRoom: (x: string) => `No room is listed for ${x} yet`,
  room: (room: string, label: string, directions?: string) => sentences(`${room}: ${label}`, directions ?? ''),
  noDirections: 'No directions are posted for that room yet',
  playing: (x: string, pieces: string) => `${x}: ${pieces}`,
  musicListed: (x: string) => `Music is listed for ${x}`,
  noMusic: 'No music is listed for this rehearsal yet',
  noMusicFor: (x: string) => `No music is listed yet for ${x}`,
  preparing: (x: string) => `Preparing for ${x}`,
  noProgram: (title: string) => `No program is posted for ${title} yet`,
  nextLesson: (x: string) => `Your next lesson: ${x}`,
  lesson: (x: string) => `Your lesson: ${x}`,
  noLesson: (days: string) => `No lesson is on your schedule${sp(days)}`,
  dueOne: (title: string, day: string) => `${title} is due ${day}`,
  wasDue: (title: string, day: string) => `${title} was due ${day}`,
  dueMany: (n: number, title: string, day: string, late: boolean, group?: string) =>
    sentences(`${n} things are due${group ? ` for ${group}` : ''}`, `First: ${title}, ${late ? `overdue since ${day}` : day}`),
  noneDue: (days: string, group?: string) => `Nothing is due${group ? ` for ${group}` : ''}${sp(days)}`,
  seat: (section: string, chair: number, chart: string) => `${section}, chair ${chair}, on ${chart}`,
  noSeat: 'No seating chart with your name is posted yet',
  noSeatIn: (group: string) => `You are not on the seating chart for ${group}`,
  chartFor: (group: string, chart: string) => `The seating chart for ${group}: ${chart}`,
  noChartFor: (group: string) => `No seating chart is posted for ${group} yet`,
  partsOf: (title: string) => `The parts for ${title} are on its page`,
  myPieces: (n: number) => sentences(`${n} ${n === 1 ? 'piece is' : 'pieces are'} on your schedule`, 'Your part is on each piece\'s page'),
  piecesFor: (n: number, group: string) => `${n} ${n === 1 ? 'piece' : 'pieces'} for ${group}`,
  noMusicMine: 'No music is listed for you yet',
  noPiecesFor: (group: string) => `No music is listed for ${group} yet`,
  forms: (n: number, title: string, by?: string, group?: string) => sentences(
    `${n} ${n === 1 ? 'form is' : 'forms are'} waiting${group ? ` for ${group}` : ''}`,
    `${n === 1 ? '' : 'First: '}${title}${by ? `, by ${by}` : ''}`,
  ),
  noForms: 'No forms are waiting for you',
  noFormsFor: (group: string) => `No forms are waiting for ${group}`,
  formOpen: (title: string, by?: string) => `${title} is open${by ? ` until ${by}` : ''}`,
  formsWord: 'Forms',
  concerts: (n: number, days: string, x: string, group?: string) =>
    sentences(`${n} concerts${group ? ` for ${group}` : ''}${sp(days)}`, `Next: ${x}`),
  noConcert: (mine: boolean, days: string, group?: string) =>
    `No concert${group ? ` for ${group}` : ''} is on ${mine ? 'your schedule' : 'the calendar'}${sp(days)}`,
  call: (title: string, x: string) => `Call time for ${title}: ${x}`,
  noCall: (title: string) => `No call time is posted for ${title} yet`,
  dress: (title: string, dress: string) => `What to wear for ${title}: ${dress}`,
  noDress: (title: string) => `No dress note is posted for ${title} yet`,
  pickup: (title: string, x: string) => `Pickup for ${title}: ${x}`,
  ends: (title: string, x: string) => `${title} ends ${x}`,
  noPickup: (title: string) => `No pickup time is posted for ${title} yet`,
  reqPlay: (title: string) => `You play in ${title}`,
  reqAttend: (title: string) => `You are required to attend ${title}`,
  reqSome: (title: string) => `Some groups are required to attend ${title}`,
  reqNobody: (title: string) => `No group is listed as required to attend ${title}`,
  reqMine: (n: number, play: number, attend: number, days: string) =>
    `${n} ${n === 1 ? 'concert is' : 'concerts are'} on your schedule${sp(days)}: ${play} to play, ${attend} to attend`,
  reqGroup: (group: string, play: number, attend: number) =>
    `${group}: ${play} ${play === 1 ? 'concert' : 'concerts'} to play, ${attend} to attend`,
  reqAll: (n: number, days: string) => `${n} ${n === 1 ? 'concert has' : 'concerts have'} groups required to attend${sp(days)}`,
  reqAllNone: (days: string) => `No concert has a group required to attend${sp(days)}`,
  noSchool: (days: string) => `No school${sp(days)}`,
  school: (days: string) => `There is school${sp(days)}`,
  nextOff: (day: string) => `The next day off is ${day}`,
  noDayOff: 'No day off is left on this year\'s calendar',
  daysOff: (dates: string) => `No school: ${dates}`,
  schoolAll: (days: string) => `There is school every weekday${sp(days)}`,
  group: (name: string, by?: string) => (by ? `${name}, with ${by}` : name),
  piece: (title: string, by?: string) => (by ? `${title}, by ${by}` : title),
  news: (n: number, title: string) => (n === 1 ? `1 announcement: ${title}` : sentences(`${n} announcements`, `Newest: ${title}`)),
  noNews: 'No announcements right now',
  documentsWord: 'Documents',
  onPage: (what: string, name: string) => `${what} are on the ${name} page`,
  goTo: (name: string) => `Use the ${name} page`,
  onHome: (name: string, home: string) => `Use ${name} on the ${home} screen`,
  howSubmit: (name: string) => `Open the assignment from the ${name} page and send your video there`,
  howCalendar: (name: string) => `Subscribe from the ${name} page, and it stays up to date`,
  howAlerts: (name: string) => `The ${name} page shows how to turn on alerts`,
  glossary: (name: string) => `That word is in the glossary on the ${name} page`,
  startsEnds: (title: string, x: string, ends: string) => `${title}: starts ${x}, ends ${ends}`,
  startsOnly: (title: string, x: string) => sentences(`${title}: starts ${x}`, 'No end time is posted'),
  noTimes: (title: string) => `No times are posted for ${title} yet`,
  lessonTeacher: (name: string) => `Your lesson teacher is ${name}`,
  noStaff: 'No teacher or conductor is listed for your groups yet',
  contact: (address: string) => `Write to ${address}`,
};

const ES: typeof EN = {
  notUnderstood: 'No tengo una respuesta para eso',
  notHeld: 'El Hub no tiene eso',
  who: '¿Quién pregunta?',
  today: 'hoy',
  tomorrow: 'mañana',
  on: date => `el ${date}`,
  inYear: (date, year) => `${date} de ${year}`,
  span: (a, b) => `del ${a} al ${b}`,
  when: { today: 'hoy', tonight: 'esta noche', tomorrow: 'mañana', thisWeek: 'esta semana', nextWeek: 'la próxima semana', weekend: 'este fin de semana' },
  more: n => `Y ${n} más`,
  list: (names, more) => names.join(', ') + (more > 0 ? ` y ${more} más` : ''),
  is: (x, status) => `${x}: ${status}`,
  things: (n, days, x, next, group) => sentences(`${group ? `${group}: ` : ''}${n} cosas${sp(days)}`, `${next ? 'Sigue' : 'Primero'}: ${x}`),
  audience: 'Vas como público a este',
  inAudience: x => `Vas como público: ${x}`,
  noMore: (days, group) => (group ? `No queda nada de ${group}${sp(days)}` : `No queda nada en tu horario${sp(days)}`),
  noChange: (days, group) => `No hay nada cancelado ni cambiado${group ? ` en ${group}` : ''}${sp(days)}`,
  noneMine: days => `No hay nada en tu horario${sp(days)}`,
  noneAll: days => `No hay nada en el calendario${sp(days)}`,
  noneFor: (group, days) => `No hay nada en el calendario de ${group}${sp(days)}`,
  notOnMine: (group, days) => `${group} no está en tu horario${sp(days)}`,
  notOnSchedule: title => `${title} no está en tu horario`,
  noRoom: x => `Todavía no hay salón para ${x}`,
  room: (room, label, directions) => sentences(`${room}: ${label}`, directions ?? ''),
  noDirections: 'Todavía no hay indicaciones para ese salón',
  playing: (x, pieces) => `${x}: ${pieces}`,
  musicListed: x => `Hay música anotada para ${x}`,
  noMusic: 'Todavía no hay música anotada para este ensayo',
  noMusicFor: x => `Todavía no hay música anotada para ${x}`,
  preparing: x => `Preparando ${x}`,
  noProgram: title => `Todavía no hay programa para ${title}`,
  nextLesson: x => `Tu próxima clase particular: ${x}`,
  lesson: x => `Tu clase particular: ${x}`,
  noLesson: days => `No hay clase particular en tu horario${sp(days)}`,
  dueOne: (title, day) => `${title} se entrega ${day}`,
  wasDue: (title, day) => `${title} se entregaba ${day}`,
  dueMany: (n, title, day, late, group) =>
    sentences(`Hay ${n} tareas por entregar${group ? ` en ${group}` : ''}`, `Primera: ${title}, ${late ? `atrasada desde ${day}` : day}`),
  noneDue: (days, group) => `No hay nada por entregar${group ? ` en ${group}` : ''}${sp(days)}`,
  seat: (section, chair, chart) => `${section}, silla ${chair}, en ${chart}`,
  noSeat: 'Todavía no hay una tabla de asientos con tu nombre',
  noSeatIn: group => `No apareces en la tabla de asientos de ${group}`,
  chartFor: (group, chart) => `La tabla de asientos de ${group}: ${chart}`,
  noChartFor: group => `Todavía no hay tabla de asientos para ${group}`,
  partsOf: title => `Las partes de ${title} están en su página`,
  myPieces: n => sentences(`${n} ${n === 1 ? 'obra' : 'obras'} en tu horario`, 'Tu parte está en la página de cada obra'),
  piecesFor: (n, group) => `${n} ${n === 1 ? 'obra' : 'obras'} para ${group}`,
  noMusicMine: 'Todavía no hay música anotada para ti',
  noPiecesFor: group => `Todavía no hay música anotada para ${group}`,
  forms: (n, title, by, group) => sentences(
    `${n} ${n === 1 ? 'formulario pendiente' : 'formularios pendientes'}${group ? ` para ${group}` : ''}`,
    `${n === 1 ? '' : 'Primero: '}${title}${by ? `, hasta ${by}` : ''}`,
  ),
  noForms: 'No tienes formularios pendientes',
  noFormsFor: group => `No hay formularios pendientes para ${group}`,
  formOpen: (title, by) => `${title} está abierto${by ? ` hasta ${by}` : ''}`,
  formsWord: 'Los formularios',
  concerts: (n, days, x, group) => sentences(`${n} conciertos${group ? ` de ${group}` : ''}${sp(days)}`, `El siguiente: ${x}`),
  noConcert: (mine, days, group) =>
    `No hay ningún concierto${group ? ` de ${group}` : ''} en ${mine ? 'tu horario' : 'el calendario'}${sp(days)}`,
  call: (title, x) => `Hora de llegada para ${title}: ${x}`,
  noCall: title => `Todavía no hay hora de llegada para ${title}`,
  dress: (title, dress) => `Qué ponerse para ${title}: ${dress}`,
  noDress: title => `Todavía no hay nota de vestuario para ${title}`,
  pickup: (title, x) => `Recogida para ${title}: ${x}`,
  ends: (title, x) => `${title} termina ${x}`,
  noPickup: title => `Todavía no hay hora de recogida para ${title}`,
  reqPlay: title => `Tocas en ${title}`,
  reqAttend: title => `Debes asistir a ${title}`,
  reqSome: title => `Algunos grupos deben asistir a ${title}`,
  reqNobody: title => `Ningún grupo aparece como obligado a asistir a ${title}`,
  reqMine: (n, play, attend, days) =>
    `${n} ${n === 1 ? 'concierto' : 'conciertos'} en tu horario${sp(days)}: ${play} para tocar, ${attend} para asistir`,
  reqGroup: (group, play, attend) => `${group}: ${play} ${play === 1 ? 'concierto' : 'conciertos'} para tocar, ${attend} para asistir`,
  reqAll: (n, days) => `${n} ${n === 1 ? 'concierto tiene' : 'conciertos tienen'} grupos que deben asistir${sp(days)}`,
  reqAllNone: days => `Ningún concierto tiene un grupo que deba asistir${sp(days)}`,
  noSchool: days => `No hay clases${sp(days)}`,
  school: days => `Hay clases${sp(days)}`,
  nextOff: day => `El próximo día sin clases es ${day}`,
  noDayOff: 'No queda ningún día sin clases en el calendario de este año',
  daysOff: dates => `Sin clases: ${dates}`,
  schoolAll: days => `Hay clases de lunes a viernes${sp(days)}`,
  group: (name, by) => (by ? `${name}, con ${by}` : name),
  piece: (title, by) => (by ? `${title}, de ${by}` : title),
  news: (n, title) => (n === 1 ? `1 anuncio: ${title}` : sentences(`${n} anuncios`, `El más reciente: ${title}`)),
  noNews: 'No hay anuncios por ahora',
  documentsWord: 'Los documentos',
  onPage: (what, name) => `${what} están en la página ${name}`,
  goTo: name => `Usa la página ${name}`,
  onHome: (name, home) => `Usa ${name} en la pantalla ${home}`,
  howSubmit: name => `Abre la tarea desde la página ${name} y envía tu video ahí`,
  howCalendar: name => `Suscríbete desde la página ${name} y se mantiene al día`,
  howAlerts: name => `La página ${name} muestra cómo activar las alertas`,
  glossary: name => `Esa palabra está en el glosario de la página ${name}`,
  startsEnds: (title, x, ends) => `${title}: empieza ${x}, termina ${ends}`,
  startsOnly: (title, x) => sentences(`${title}: empieza ${x}`, 'No hay hora de fin anotada'),
  noTimes: title => `Todavía no hay horas para ${title}`,
  lessonTeacher: name => `Tu clase particular es con ${name}`,
  noStaff: 'Todavía no aparece maestro ni director para tus grupos',
  contact: address => `Escribe a ${address}`,
};
