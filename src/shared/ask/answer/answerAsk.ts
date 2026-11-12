/**
 * Ask, the answering half (#ask): a reading of the question in, an answer
 * OBJECT out. Data, not JSX and not HTML. The overlay that draws it does not
 * exist yet, so nothing imports this.
 * Design: docs/superpowers/specs/2026-11-11-hub2-integrated-design.md, 3.2,
 * 3.4, 3.6 and 3.7.
 *
 * FOUR STATES, never confused (loading and offline are the screen's):
 *   answered       the records hold the answer, and "No. Nothing is on your
 *                  schedule Friday." is an answer
 *   nothingPosted  the thing asked about exists, but the part asked for is
 *                  blank: a rehearsal with no music listed, a concert with no
 *                  call time
 *   notUnderstood  two kinds, told apart by `showing`:
 *                  - no reading, several readings (they come back as
 *                    `choices`), the past, a staff question: no `showing`
 *                  - understood, and the Hub holds no record for it
 *                    (parking, tickets, a break by name): `showing` is set
 *                    and the sentence says the Hub does not have it
 *   needsWho       a "my" question and nobody is saved on this phone
 *
 * WHO. The module reads students from `opts.saved` (the ids identity.ts keeps
 * on the device) and from nowhere else. It never looks a student up by a
 * word in the question. A saved id that is archived or gone counts as nobody
 * saved. Several saved students get one answer each.
 *
 * THE SENTENCE is built from the fixed tables at the bottom (English and
 * Spanish) and from the records. No typed word reaches it: names are printed
 * from the record the reading points at, never from the reading itself.
 * A cancelled or changed event carries the director's own note on its card,
 * through `changeNoteFor`. Nothing here words a change.
 *
 * WHAT IT READS. Public records only (#privacy), through the same rules the
 * pages use: `studentDay` for a student's day, `isAssignmentOpen` and
 * `isPublished` for assignments, the sign-up filters for forms. Four of the
 * repo's ONE definitions cannot be loaded by plain Node (they reach the org
 * config, React or Firestore), so the caller hands them in as `opts.use`:
 * the time and date formatters, the announcements filter, the seating chart
 * address and the school-day calendars. That keeps one definition of each
 * and keeps this file pure.
 *
 * Pure: no React, no Firestore, no org config, no clock ("today" and "now"
 * are arguments), nothing kept between calls. Relative imports carry `.ts`.
 * It must never import `director/utils` (#student-day). The import list is
 * an allowlist, pinned by ../answer.selfcheck.ts.
 */

import type { AskIntent, AskWhen } from '../corpus.ts';
import type { AskParse, AskReading } from '../parse.ts';
import { normalizeText } from '../../fuzzy.ts';
import { studentDay, type StudentDayRecords } from '../../studentDay.ts';
import { changeNoteFor } from '../../changeNoteEs.ts';
import { byDueDateOpenFirst, isAssignmentOpen, isPublished, pieceEnsembleIds } from '../../pureRules.ts';
import { eventPieces } from '../../studentRepertoire.ts';
import { hasAudienceRequirement, requiredAudienceEvents } from '../../requiredAudience.ts';
import {
  eligibleForSignup, isCollegeGrade, signupIsOpen, signupIsPublished, signupShowsInAlerts, signupShowsInIndex,
} from '../../signupEligibility.ts';
import { FORMS_PATH, formPath } from '../../formLink.ts';
import { isMasterClass } from '../../../director/groupKind.ts';
import type {
  Announcement, Assignment, CalendarEvent, CampusLocation, Ensemble, EventStatus, RepertoirePiece,
  SeatingChart, SignupForm, Student,
} from '../../../director/types.ts';
import type { PublicLesson } from '../../publicLesson.ts';

/* ── What goes in ─────────────────────────────────────────────────────── */

/** The public records, already loaded. What `studentDay` takes, plus names
 *  for the groups, the announcements and the room directory. `students` and
 *  `overrides` may hold only the saved student's own rows (design 3.6). */
export interface AskData extends Omit<StudentDayRecords, 'ensembles'> {
  ensembles: Pick<Ensemble, 'id' | 'name' | 'kind' | 'conductorName' | 'staff'>[];
  announcements?: Announcement[];
  locations?: Pick<CampusLocation, 'room' | 'label' | 'directions' | 'mapAnchor'>[];
}

/** The repo's ONE definitions that plain Node cannot load. The overlay
 *  passes the real ones; this file never writes its own. */
export interface AskUse {
  /** `formatTime` in src/director/utils: "14:10" to "2:10 PM". */
  time: (hhmm: string) => string;
  /** `fmtLongDateInline` in src/shared/dates: a date inside a sentence. */
  date: (ymd: string) => string;
  /** `visibleAnnouncements` in src/director/hooks/useAnnouncements. */
  visibleAnnouncements: (
    list: Announcement[], today: string, ensembleIds: string[] | 'all', now: number,
  ) => Announcement[];
  /** `seatingChartPath` in src/director/seating/seatingLink. */
  seatingChartPath: (chartId: string) => string;
  /** Is this weekday a school day on that campus: `isMdcpsSchoolDay` and
   *  `isCollegeSessionDay`. Left out (an org with no school calendar), a
   *  question about school is not answered. */
  isSchoolDay?: (ymd: string, campus: 'hs' | 'college') => boolean;
}

export interface AskOptions {
  lang: 'en' | 'es';
  /** YYYY-MM-DD, in the school's own day. */
  today: string;
  /** The moment asked, in ms. It keeps scheduled posts hidden. */
  now: number;
  /** The student ids saved on this device, in any order. */
  saved: readonly string[];
  use: AskUse;
  /** An org with public student info switched off: general answers only. */
  generalOnly?: boolean;
  /** Forms this device already sent (signupReceipt): not a to-do any more. */
  sentFormIds?: readonly string[];
  /** The org's feature flags, for pages that are not always mounted. */
  features?: { absenceReport?: boolean; campusMap?: boolean; contactForm?: boolean };
  /** The org's public contact address (`contactEmail` in the org config).
   *  Handed in, because this file may not read the org config. */
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

export interface AskStudentRef { id: string; name: string }

export type AskForWho =
  /** A general question. It never asks for a name. */
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
  /** The days that meant, YYYY-MM-DD. No `to` means "from then on". */
  from?: string;
  to?: string;
  /** The named thing, as the record spells it, or a word from the parser's
   *  own fixed tables ("sectional"). Never a typed word. */
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
  /** Left out when nothing was understood. It always carries the days that
   *  were understood, so a date read differently from what was meant shows. */
  showing?: AskShowing;
  /** "Did you mean": several readings and no answer. */
  choices: AskReading[];
  /** The one-change chips ("Tomorrow", "This week"), as readings. */
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
] as const;
type Answered = (typeof ASK_ANSWERS)[number];

/** The same spellings the public pages write (src/main.tsx). Forms and
 *  seating charts have a helper of their own and use it. */
export const ASK_ROUTES = {
  event: (id: string) => `/event/${id}`,
  piece: (id: string) => `/piece/${id}`,
  group: (id: string) => `/ensemble/${id}`,
  student: (id: string) => `/student/${id}`,
  assignment: (id: string) => `/assignments/${id}`,
} as const;

/* ── Days. Arithmetic only: every date a person reads is `use.date`. ──── */

const DAY_MS = 86_400_000;
const ms = (ymd: string) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
const ymdOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const plus = (ymd: string, days: number) => ymdOf(ms(ymd) + days * DAY_MS);
/** 0 Sunday to 6 Saturday. */
const weekdayOf = (ymd: string) => new Date(ms(ymd)).getUTCDay();
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

interface Range { from: string; to?: string }

/** The days a date word means, counted from today. A week runs Monday to
 *  Sunday and only its days still to come are asked about. null = behind us:
 *  the public side does not answer about the past. */
export function askRange(when: AskWhen | undefined, today: string): Range | null {
  const one = (d: string): Range => ({ from: d, to: d });
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
  const year = +today.slice(0, 4);
  if (kind === 'weekday') return one(plus(today, (WEEKDAYS.indexOf(value) - weekdayOf(today) + 7) % 7));
  if (kind === 'date') return one(`${year}-${value}` >= today ? `${year}-${value}` : `${year + 1}-${value}`);
  if (kind === 'day') {
    for (let n = 0; n < 62; n++) if (plus(today, n).slice(8) === value) return one(plus(today, n));
    return null;
  }
  if (kind === 'month') {
    const y = `${year}-${value}` >= today.slice(0, 7) ? year : year + 1;
    const first = `${y}-${value}-01`;
    return { from: first > today ? first : today, to: ymdOf(Date.UTC(y, +value, 0)) };
  }
  return null;
}

/* ── The answer ───────────────────────────────────────────────────────── */

type Body = AskAnswerBody & {
  /** The same for everyone: not repeated for each saved student. */
  general?: boolean;
};
/** 'who' = this is a "my" question and nobody is asking. 'notHeld' = it was
 *  understood and the Hub has no record for it. null = no answer, and
 *  nothing is said about what was asked (a post that is still hidden). */
type Result = Body | 'who' | 'notHeld' | null;

interface Item {
  event: CalendarEvent;
  pieces: RepertoirePiece[];
  attendanceOnly: boolean;
  /** The groups it is on the schedule through. */
  ensembleIds: string[];
}

export function answerAsk(parse: AskParse, data: AskData, opts: AskOptions): AskAnswer {
  const L = opts.lang === 'es' ? ES : EN;
  const { use, today, now } = opts;
  const none = (choices: AskReading[] = []): AskAnswer =>
    ({ state: 'notUnderstood', sentence: L.notUnderstood, cards: [], forWho: { kind: 'general' }, choices, followUps: [] });

  /* Which reading. One the parser is sure of, or the only one it offered. */
  const guessed = !parse.confident;
  const picked = parse.confident ? parse : parse.suggestions.length === 1 ? parse.suggestions[0] : undefined;
  if (!picked) return none(parse.suggestions);
  const { intent, when, about, match } = picked;
  const reading: AskReading = { intent, ...(when ? { when } : {}), ...(about ? { about } : {}), ...(match ? { match } : {}) };
  const range = askRange(when, today);
  if (!range || !(ASK_ANSWERS as readonly string[]).includes(intent)) return none();

  /* The named thing, found in the records. Only the record's own words are
   * ever printed: `match.name` is compared and nothing more. */
  const same = (a?: string, b?: string) => !!a && !!b && normalizeText(a).trim() === normalizeText(b).trim();
  const find = <T extends { id: string }>(list: readonly T[] | undefined, nameOf: (x: T) => string | undefined) =>
    (list ?? []).find(x => x.id === match?.id) ?? (list ?? []).find(x => same(nameOf(x), match?.name));
  const byTime = (a: CalendarEvent, b: CalendarEvent) =>
    a.date.localeCompare(b.date) || (a.startTime ?? '99').localeCompare(b.startTime ?? '99');
  const isLive = (x: { status?: string }) => x.status !== 'Cancelled';
  const group = match?.kind === 'group' ? find(data.ensembles, e => e.name) : undefined;
  const piece = match?.kind === 'piece' ? find(data.pieces, p => p.title) : undefined;
  const task = match?.kind === 'assignment' ? find(data.assignments, a => a.title) : undefined;
  const form = match?.kind === 'form' ? find(data.forms, f => f.title) : undefined;
  const named = match?.kind === 'concert'
    ? data.events.filter(e => e.id === match.id || same(e.title, match.name)).sort(byTime) : [];
  // A name on two dates is the one still to come.
  const concert = named.find(e => e.id === match?.id) ?? named.find(e => e.date >= today && isLive(e)) ?? named[named.length - 1];
  const place = match?.kind === 'room' || match?.kind === 'venue' ? match.name : undefined;
  const room = place ? (data.locations ?? []).find(l => same(l.room, place) || same(l.label, place)) : undefined;
  if (match && match.kind !== 'term' && !group && !piece && !task && !form && !concert && !place) return none();
  /** A word from the parser's fixed tables ("sectional", "exam", "mdc"). */
  const word = match ? undefined : about;

  /* Small parts. */
  const piecesById = Object.fromEntries((data.pieces ?? []).map(p => [p.id, p]));
  const masterIds = new Set(data.ensembles.filter(isMasterClass).map(e => e.id));
  const titleOf = (e: CalendarEvent) => e.title?.trim()
    || e.ensembleIds.map(id => data.ensembles.find(g => g.id === id)?.name).filter(Boolean).join(' + ')
    || e.type;
  const dayOf = (ymd: string) => (ymd === today ? L.today : ymd === plus(today, 1) ? L.tomorrow : L.on(use.date(ymd)));
  /** "Symphony Orchestra, tomorrow 2:10 PM, Room 2210", skipping what is blank. */
  const line = (name: string | undefined, date: string | undefined, time?: string, ...rest: (string | undefined)[]) =>
    [name, [date && dayOf(date), time && use.time(time)].filter(Boolean).join(' '), ...rest].filter(Boolean).join(', ');
  const eventLine = (e: CalendarEvent) => line(titleOf(e), e.date, e.startTime, e.location);
  /** The days asked about, as words: "tomorrow", "this week", a date. */
  const days = (() => {
    if (concert || !when || when === 'next') return '';
    const fixed = (L.when as Record<string, string | undefined>)[when];
    if (fixed) return fixed;
    return range.to === range.from ? L.on(use.date(range.from)) : L.span(use.date(range.from), use.date(range.to!));
  })();
  const inRange = (date: string, r: Range = range) => date >= r.from && (!r.to || date <= r.to);

  const eventCard = (i: Pick<Item, 'event' | 'attendanceOnly'>, label?: 'preparingFor'): AskCard => {
    const note = changeNoteFor(i.event, opts.lang);
    return {
      kind: 'event', id: i.event.id, route: ASK_ROUTES.event(i.event.id), status: i.event.status,
      ...(note ? { changeNote: note } : {}), ...(i.attendanceOnly ? { attendanceOnly: true as const } : {}),
      ...(label ? { label } : {}),
    };
  };
  const pieceCard = (p: RepertoirePiece, label?: 'preparingFor'): AskCard =>
    ({ kind: 'piece', id: p.id, route: ASK_ROUTES.piece(p.id), ...(label ? { label } : {}) });
  const groupCard = (g: { id: string }): AskCard => ({ kind: 'group', id: g.id, route: ASK_ROUTES.group(g.id) });
  const page = (id: AskPageId, route: string): AskCard => ({ kind: 'page', id, route });
  const ok = (sentence: string, cards: AskCard[], general = false): Body => ({ state: 'answered', sentence, cards, general });
  const notYet = (sentence: string, cards: AskCard[], general = false): Body => ({ state: 'nothingPosted', sentence, cards, general });

  /* Whose events. A student's come from `studentDay`, the ONE answer; a
   * named group's, concert's or room's are the same for everybody. */
  const mine = (me: Student, r: Range = range): Item[] =>
    studentDay(me.id, { ...r, now }, data).events.map(x =>
      ({ event: x.event, pieces: x.pieces, attendanceOnly: x.exp.attendanceOnly, ensembleIds: x.exp.ensembleIds }));
  const open = (list: CalendarEvent[]): Item[] => [...list].sort(byTime).map(event => ({
    event, attendanceOnly: false, ensembleIds: group ? [group.id] : event.ensembleIds,
    pieces: eventPieces(event, piecesById)
      .filter(p => !group || pieceEnsembleIds(p).length === 0 || pieceEnsembleIds(p).includes(group.id)),
  }));
  const shared = !!(concert || group);
  const items = (me: Student | undefined, r: Range = range): Item[] | undefined => {
    if (concert) return open([concert]);
    if (group) return open(data.events.filter(e => inRange(e.date, r) && e.ensembleIds.includes(group.id)));
    return me ? mine(me, r) : undefined;
  };
  /** The next one: the first that is still on, or a cancelled one if that is all there is. */
  const soonest = (list: Item[]) => {
    const on = list.find(i => isLive(i.event));
    return on ? [on] : list.slice(0, 1);
  };
  const emptyDay = (me: Student | undefined): Body => ok(
    group ? L.noneFor(group.name, days) : me ? L.noneMine(days) : L.noneAll(days),
    group ? [groupCard(group)] : [], shared || !me,
  );

  /* ── About me ─────────────────────────────────────────────────────── */

  /** What do I have, and where. `needRoom`: the question is which room. */
  const schedule = (me: Student | undefined, needRoom: boolean): Result => {
    // "Where is Room 2210", with no day: the room itself.
    if (place && !when) {
      if (!room) return notYet(L.noDirections, [], true);
      const route = opts.features?.campusMap ? `/map${room.mapAnchor ? `#${room.mapAnchor}` : ''}` : undefined;
      return ok(L.room(room.room, room.label, room.directions), route ? [{ kind: 'place', id: room.room, route }] : [], true);
    }
    let list = items(me);
    if (!list) return 'who';
    if (word) {
      if (/^(?:sectional|seccional)/.test(word)) list = list.filter(i => i.event.type === 'Sectional');
      else if (/^masterclass/.test(word)) list = list.filter(i => i.event.ensembleIds.some(id => masterIds.has(id)));
      else return null;
    }
    if (!when || when === 'next') list = soonest(list);
    if (list.length === 0) return emptyDay(me);
    const cards = list.map(i => eventCard(i));
    const general = shared || !me;
    const on = list.filter(i => isLive(i.event));
    if (on.length === 0) return ok(L.off(eventLine(list[0].event)), cards, general);
    // "Are we in Room 2210 today": yes or no, and where we are.
    if (place) {
      const there = on.find(i => same(i.event.location, place));
      return ok(there ? L.yes(eventLine(there.event)) : L.no(eventLine(on[0].event)), cards, general);
    }
    const first = on[0].event;
    if (needRoom) {
      return first.location?.trim()
        ? ok(L.plain(eventLine(first)), cards, general)
        : notYet(L.noRoom(line(titleOf(first), first.date, first.startTime)), cards, general);
    }
    if (when === 'next') return ok(L.plain(eventLine(first)), cards, general);
    return ok(on.length > 1 ? L.yesMany(on.length, days, eventLine(first)) : L.yes(eventLine(first)), cards, general);
  };

  const cancelled = (me: Student | undefined): Result => {
    let list = items(me);
    if (!list) return 'who';
    if (!when || when === 'next') list = soonest(list);
    if (list.length === 0) return emptyDay(me);
    const general = shared || !me;
    // A change is the stored status or the director's note. Its words stay on the card.
    const changed = list.filter(i => !isLive(i.event) || !!changeNoteFor(i.event, opts.lang));
    if (changed.length === 0) return ok(L.noChange(days), list.map(i => eventCard(i)), general);
    const first = changed[0].event;
    return ok(
      changed.length > 1 ? L.changes(changed.length, days) : isLive(first) ? L.changed(eventLine(first)) : L.yesOff(eventLine(first)),
      changed.map(i => eventCard(i)), general,
    );
  };

  /** What are we playing. With a day: that day's rehearsals. With none, or
   *  "the next concert": a concert's program. */
  const playing = (me: Student | undefined): Result => {
    const program = !!concert || !when || when === 'next';
    const general = shared || !!place || !me;
    const all = place
      ? open(data.events.filter(e => inRange(e.date) && same(e.location, place)))
      : items(me, program ? { from: today } : range);
    if (!all) return 'who';
    const music = (i: Item) => i.pieces.length > 0 || !!i.event.repertoire?.trim();
    // Somebody in the audience is not playing (#student-repertoire), and a
    // theory class never has music to list.
    const list = all.filter(i => isLive(i.event) && !i.attendanceOnly
      && (program ? i.event.type === 'Concert' || i.event === concert : i.event.type !== 'Class' || music(i)));
    const titles = (ps: RepertoirePiece[]) => L.list(ps.slice(0, 3).map(p => p.title), ps.length - 3);
    const say = (i: Item) => (i.pieces.length > 0
      ? L.playing(line(titleOf(i.event), i.event.date), titles(i.pieces))
      : L.musicListed(line(titleOf(i.event), i.event.date)));
    if (program) {
      const next = list[0];
      if (!next) return ok(L.noConcert(!general, ''), [], general);
      const cards = [eventCard(next), ...next.pieces.map(p => pieceCard(p))];
      return music(next) ? ok(say(next), cards, general) : notYet(L.noProgram(titleOf(next.event)), cards, general);
    }
    if (list.length === 0) return emptyDay(me);
    const listed = list.filter(music);
    if (listed.length > 0) {
      return ok(say(listed[0]), [...list.map(i => eventCard(i)), ...unique(listed.flatMap(i => i.pieces)).map(p => pieceCard(p))], general);
    }
    // Nothing posted. Then, labelled, the pieces on that group's next concert.
    const groups = new Set(list.flatMap(i => i.ensembleIds));
    const ahead = me && !shared && !place
      ? mine(me, { from: today })
      : open(data.events.filter(e => e.date >= today && e.ensembleIds.some(id => groups.has(id))));
    const next = ahead.find(i => i.event.type === 'Concert' && isLive(i.event) && !i.attendanceOnly
      && i.ensembleIds.some(id => groups.has(id)));
    const prep = next && next.pieces.length > 0 ? next : undefined;
    return notYet(
      prep ? `${L.noMusic} ${L.preparing(line(titleOf(prep.event), prep.event.date))}` : L.noMusic,
      [
        ...list.map(i => eventCard(i)),
        ...(prep ? [eventCard(prep, 'preparingFor'), ...prep.pieces.map(p => pieceCard(p, 'preparingFor'))] : []),
      ],
      general,
    );
  };

  const lessonCard = (me: Student, l: PublicLesson): AskCard =>
    ({ kind: 'lesson', id: l.id, route: ASK_ROUTES.student(me.id), ...(l.status ? { status: l.status } : {}) });
  const lesson = (me: Student | undefined): Result => {
    if (!me) return 'who';
    let list: PublicLesson[] = studentDay(me.id, { ...range, now }, data).lessons;
    if (!when || when === 'next') list = (list.find(isLive) ? [list.find(isLive)!] : list.slice(0, 1));
    if (list.length === 0) return ok(L.noLesson(days), []);
    const cards = list.map(l => lessonCard(me, l));
    const on = list.find(isLive);
    if (!on) return ok(L.lessonOff(line(undefined, list[0].date, list[0].startTime)), cards);
    const said = line(undefined, on.date, on.startTime, on.location, on.teacherName);
    return ok(when && when !== 'next' ? L.yes(L.lesson(said)) : L.plain(L.lesson(said)), cards);
  };

  const taskCard = (a: Assignment): AskCard => ({ kind: 'assignment', id: a.id, route: ASK_ROUTES.assignment(a.id) });
  const due = (me: Student | undefined): Result => {
    // One assignment by name. Its own page hides it until it posts; so does this.
    if (task) return isPublished(task, now) ? ok(L.dueOne(task.title, dayOf(task.dueDate)), [taskCard(task)], true) : null;
    let list: Assignment[];
    if (group) {
      list = (data.assignments ?? [])
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
    if (list.length === 0) return ok(L.noneDue(days), cards, !!group);
    const first = list[0];
    return ok(list.length > 1 ? L.dueMany(list.length, first.title, dayOf(first.dueDate)) : L.dueOne(first.title, dayOf(first.dueDate)), cards, !!group);
  };

  const seat = (me: Student | undefined): Result => {
    const newest = [...(data.charts ?? [])].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.createdAt - a.createdAt);
    const card = (c: SeatingChart): AskCard => ({ kind: 'seating', id: c.id, route: use.seatingChartPath(c.id) });
    if (group) {
      const chart = newest.find(c => c.ensembleId === group.id);
      return chart ? ok(L.chartFor(group.name, chart.title), [card(chart)], true) : notYet(L.noChartFor(group.name), [groupCard(group)], true);
    }
    if (!me) return 'who';
    const seats = newest.flatMap(c => c.sections.flatMap(s => {
      const chair = s.seats.findIndex(x => x.studentId === me.id);
      return chair < 0 ? [] : [{ c, section: s.section, chair: chair + 1 }];
    }));
    if (seats.length === 0) return notYet(L.noSeat, []);
    return ok(L.seat(seats[0].section, seats[0].chair, seats[0].c.title), unique(seats.map(s => s.c)).map(card));
  };

  const parts = (me: Student | undefined): Result => {
    if (piece) return ok(L.partsOf(piece.title), [pieceCard(piece)], true);
    if (group) {
      const ps = (data.pieces ?? []).filter(p => pieceEnsembleIds(p).includes(group.id)).sort((a, b) => a.order - b.order);
      return ps.length > 0 ? ok(L.piecesFor(ps.length, group.name), ps.map(p => pieceCard(p)), true) : notYet(L.noMusicFor(group.name), [groupCard(group)], true);
    }
    if (!me) return 'who';
    // What they PLAY on what is still to come. An audience concert adds nothing.
    const ps = unique(mine(me, { from: today }).filter(i => isLive(i.event)).flatMap(i => i.pieces));
    return ps.length > 0 ? ok(L.myPieces(ps.length), ps.map(p => pieceCard(p))) : notYet(L.noMusicMine, []);
  };

  const forms = (me: Student | undefined): Result => {
    const formCard = (f: SignupForm): AskCard => ({ kind: 'form', id: f.id, route: formPath(f.id) });
    const index = page('forms', FORMS_PATH);
    if (form) {
      // By invitation means the invitation is the way in: never listed here.
      if (!signupIsPublished(form, now) || !signupShowsInIndex(form)) return null;
      return ok(signupIsOpen(form, today, now) ? L.formOpen(form.title, form.deadline && dayOf(form.deadline)) : L.formClosed(form.title), [formCard(form)], true);
    }
    if (word) return ok(L.formsPage, [index], true);
    const sent = new Set(opts.sentFormIds ?? []);
    // The alert strip's own filter (SignupAlert): open, posted, and not by invitation.
    const waiting = (data.forms ?? []).filter(f => signupIsOpen(f, today, now) && signupShowsInAlerts(f) && !sent.has(f.id));
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
    return ok(L.forms(list.length, first.title, first.deadline && dayOf(first.deadline)), [...list.map(formCard), index], !!group);
  };

  /* ── About a concert ──────────────────────────────────────────────── */

  /** The concerts asked about. With a student saved they are that student's
   *  own; with nobody saved they are the school's. */
  const concerts = (me: Student | undefined): Item[] => {
    const list = place
      ? open(data.events.filter(e => e.date >= today && same(e.location, place)))
      : items(me) ?? open(data.events.filter(e => inRange(e.date)));
    return list.filter(i => i.event.type === 'Concert' || i.event === concert);
  };
  /** The same for everybody: a named concert, group or hall, or nobody saved. */
  const everyones = (me: Student | undefined) => shared || !!place || !me;

  const concertAnswer = (me: Student | undefined): Result => {
    // "The winter concert": no record says which concert that is.
    if (word) return 'notHeld';
    const general = everyones(me);
    const all = concerts(me);
    const list = when === 'next' || place ? soonest(all) : all;
    const season = page('concerts', '/concerts');
    if (list.length === 0) return ok(L.noConcert(!general, days), [season], general);
    const cards = [...list.map(i => eventCard(i)), season];
    const on = list.filter(i => isLive(i.event));
    if (on.length === 0) return ok(L.off(eventLine(list[0].event)), cards, general);
    const said = on.length > 1 ? L.concerts(on.length, eventLine(on[0].event)) : L.plain(eventLine(on[0].event));
    return ok(on[0].attendanceOnly ? `${said} ${L.audience}` : said, cards, general);
  };

  /** Call time, what to wear, pickup: one field of one concert's day sheet. */
  const daySheet = (me: Student | undefined, what: 'call' | 'dress' | 'pickup'): Result => {
    if (word) return 'notHeld';
    const general = everyones(me);
    // Call time and dress are a performer's. Pickup is anybody's.
    const next = concerts(me).find(i => isLive(i.event) && (what === 'pickup' || !i.attendanceOnly));
    if (!next) return ok(L.noConcert(!general, days), [], general);
    const e = next.event;
    const cards = [eventCard(next)];
    const t = titleOf(e);
    if (what === 'call') {
      return e.callTime ? ok(L.call(t, line(undefined, e.date, e.callTime)), cards, general) : notYet(L.noCall(t), cards, general);
    }
    if (what === 'dress') return e.dress?.trim() ? ok(L.dress(t, e.dress.trim()), cards, general) : notYet(L.noDress(t), cards, general);
    if (e.pickupTime) return ok(L.pickup(t, line(undefined, e.date, e.pickupTime)), cards, general);
    return e.endTime ? ok(L.ends(t, line(undefined, e.date, e.endTime)), cards, general) : notYet(L.noPickup(t), cards, general);
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

  /** Who a group is led by, as its own page names them. Names only. */
  const staffOf = (g: AskData['ensembles'][number]) =>
    g.conductorName?.trim() || (g.staff ?? []).map(s => s.name?.trim()).filter(Boolean).join(', ');
  /** Who is my teacher, conductor or director: the lesson card names the
   *  teacher, and each of my groups names who leads it. */
  const whoStaff = (me: Student | undefined): Result => {
    if (!me) return 'who';
    if (/^(?:teacher|maestr|profesor)/.test(word ?? '')) {
      const taught = studentDay(me.id, { from: today, now }, data).lessons.find(l => l.teacherName?.trim());
      if (taught) return ok(L.lessonTeacher(taught.teacherName!.trim()), [lessonCard(me, taught)]);
    }
    const groups = data.ensembles.filter(g => me.ensembleIds.includes(g.id));
    const led = groups.filter(g => staffOf(g));
    return led.length > 0
      ? ok(led.map(g => L.group(g.name, staffOf(g))).join(' '), led.map(groupCard))
      : notYet(L.noStaff, groups.map(groupCard));
  };

  const required = (me: Student | undefined): Result => {
    if (word) return 'notHeld';
    const all = page('requiredConcerts', '/required-concerts');
    // The count of concerts attended is behind a school email: only a link.
    const tally = me ? [page('concertTally', ASK_ROUTES.student(me.id))] : [];
    const one = concert ?? (group || when === 'next' ? concerts(me).find(i => isLive(i.event))?.event : undefined);
    if (one) {
      const t = titleOf(one);
      if (!me) return ok(hasAudienceRequirement(one) ? L.reqSome(t) : L.reqNobody(t), [eventCard({ event: one, attendanceOnly: false }), all], true);
      const hit = mine(me, { from: one.date, to: one.date }).find(i => i.event.id === one.id);
      return ok(
        !hit ? L.reqNo(t) : hit.attendanceOnly ? L.reqAttend(t) : L.reqPlay(t),
        [eventCard(hit ?? { event: one, attendanceOnly: false }), all, ...tally],
      );
    }
    if (group) return ok(L.noConcert(false, ''), [all], true);
    if (!me) {
      const list = requiredAudienceEvents(data.events.filter(e => e.date >= today && isLive(e)));
      return ok(list.length > 0 ? L.reqAll(list.length) : L.reqAllNone, [...list.map(event => eventCard({ event, attendanceOnly: false })), all], true);
    }
    const list = mine(me, { from: today }).filter(i => i.event.type === 'Concert' && isLive(i.event));
    const audience = list.filter(i => i.attendanceOnly).length;
    return ok(
      list.length > 0 ? L.reqMine(list.length, list.length - audience, audience) : L.noConcert(true, ''),
      [...list.map(i => eventCard(i)), all, ...tally],
    );
  };

  /* ── About the school ─────────────────────────────────────────────── */

  const noSchool = (me: Student | undefined): Result => {
    const inSession = use.isSchoolDay;
    // A break by name, finals, the end of a term: the Hub holds days, not names.
    if (!inSession || (word && word !== 'mdc')) return 'notHeld';
    // MDC decides college and MDCPS decides high school (#college-hs-calendar-deps).
    const campus = word === 'mdc' || (me && isCollegeGrade(me.grade)) ? 'college' : 'hs';
    const general = word === 'mdc' || !me;
    const weekend = (d: string) => weekdayOf(d) === 0 || weekdayOf(d) === 6;
    const off = (d: string) => !weekend(d) && !inSession(d, campus);
    const cards = [page('calendar', '/calendar')];
    if (!when || when === 'next') {
      for (let n = 0; n < 370; n++) if (off(plus(today, n))) return ok(L.nextOff(dayOf(plus(today, n))), cards, general);
      return notYet(L.noDayOff, cards, general);
    }
    if (range.to === range.from) {
      return ok(weekend(range.from) || off(range.from) ? L.noSchool(days) : L.school(days), cards, general);
    }
    const closed: string[] = [];
    for (let d = range.from; d <= range.to! && closed.length < 31; d = plus(d, 1)) if (off(d)) closed.push(d);
    return ok(closed.length > 0 ? L.daysOff(closed.map(d => use.date(d)).join('; ')) : L.schoolAll(days), cards, general);
  };

  const news = (): Result => {
    const stamp = (a: Announcement) => Math.max(a.publishAt ?? 0, a.createdAt ?? 0);
    const list = [...use.visibleAnnouncements(data.announcements ?? [], today, 'all', now)].sort((a, b) => stamp(b) - stamp(a));
    const all = page('announcements', '/announcements');
    if (list.length === 0) return ok(L.noNews, [all], true);
    return ok(
      L.news(list.length, list[0].title),
      [...list.slice(0, 5).map((a): AskCard => ({ kind: 'announcement', id: a.id, route: '/announcements' })), all], true,
    );
  };

  /** A door, not an answer: the page that does it. */
  const door = (sentence: string, ...cards: AskCard[]): Result => ok(sentence, cards, true);

  const answers: Record<Answered, (me: Student | undefined) => Result> = {
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
    documents: () => door(L.documents, ...(group ? [groupCard(group)] : []), page('documents', '/documents')),
    howAbsence: () => (opts.features?.absenceReport ? door(L.howAbsence, page('absence', '/absence')) : 'notHeld'),
    howSubmit: () => door(L.howSubmit, page('assignments', '/assignments')),
    howCheckin: me => (me
      ? ok(L.howCheckin, [page('checkin', '/checkin'), page('concertTally', ASK_ROUTES.student(me.id))])
      : door(L.howCheckin, page('checkin', '/checkin'))),
    howCalendar: me => (me
      ? ok(L.howCalendar, [page('mySchedule', ASK_ROUTES.student(me.id)), page('calendar', '/calendar')])
      : door(L.howCalendar, page('calendar', '/calendar'))),
    howCopy: () => door(L.howCopy, page('copies', '/copies')),
    howAlerts: () => door(L.howAlerts, page('start', '/start')),
    howFindMe: () => door(L.howFindMe, page('lookup', '/lookup')),
    glossary: () => (match?.kind === 'term' ? door(L.glossary, page('glossary', '/start#glossary')) : null),
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
    .filter((s): s is Student => !!s);
  const run = answers[intent as Answered];
  const first = run(people[0]);
  if (first === null) return none();

  const thing = group?.name ?? (concert && titleOf(concert)) ?? piece?.title ?? task?.title ?? form?.title ?? room?.room ?? word;
  const showing: AskShowing = {
    intent, ...(when ? { when } : {}), from: range.from, ...(range.to ? { to: range.to } : {}),
    ...(thing ? { thing } : {}), ...(guessed ? { guessed: true as const } : {}),
  };
  if (first === 'who') {
    if (opts.generalOnly) return none();
    return { state: 'needsWho', sentence: L.who, cards: [], forWho: { kind: 'nobody' }, showing, choices: [], followUps: [] };
  }
  if (first === 'notHeld') return { ...none(), sentence: L.notHeld, showing };
  // A named concert has its own date, and a room alone has none to change.
  const followUps: AskReading[] = FOLLOW_UP.has(intent) && !concert && !(place && !when)
    ?(['today', 'tomorrow', 'thisWeek'] as const).filter(w => w !== when).slice(0, 2).map(w => ({ ...reading, when: w }))
    : [];
  const body = ({ state, sentence, cards }: Body): AskAnswerBody => ({ state, sentence, cards });
  const ref = (s: Student): AskStudentRef => ({ id: s.id, name: s.preferredName?.trim() || s.name });
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

/* ── The words. Every sentence is one of these, filled from a record. ─── */

const sp = (s: string) => (s ? ` ${s}` : '');

const EN = {
  notUnderstood: 'I do not have an answer for that.',
  notHeld: 'The Hub does not have that.',
  who: 'Who is asking?',
  startsEnds: (title: string, x: string, end: string) => `${title}: starts ${x}, ends ${end}.`,
  startsOnly: (title: string, x: string) => `${title}: starts ${x}. No end time is posted.`,
  noTimes: (title: string) => `No times are posted for ${title} yet.`,
  lessonTeacher: (name: string) => `Your lesson teacher is ${name}.`,
  noStaff: 'No teacher or conductor is listed for your groups yet.',
  contact: (address: string) => `Write to ${address}.`,
  today: 'today',
  tomorrow: 'tomorrow',
  on: (date: string) => date,
  span: (a: string, b: string) => `from ${a} to ${b}`,
  when: { today: 'today', tonight: 'tonight', tomorrow: 'tomorrow', thisWeek: 'this week', nextWeek: 'next week', weekend: 'this weekend' },
  list: (names: string[], more: number) => names.join(', ') + (more > 0 ? `, and ${more} more` : ''),
  plain: (x: string) => `${x}.`,
  yes: (x: string) => `Yes. ${x}.`,
  no: (x: string) => `No. ${x}.`,
  yesMany: (n: number, days: string, x: string) => `Yes. ${n} things${sp(days)}. First: ${x}.`,
  off: (x: string) => `${x}: cancelled.`,
  yesOff: (x: string) => `Yes. ${x}: cancelled.`,
  changed: (x: string) => `Yes. ${x}: changed.`,
  changes: (n: number, days: string) => `Yes. ${n} changes${sp(days)}.`,
  noChange: (days: string) => `No. Nothing${sp(days)} is cancelled or changed.`,
  noneMine: (days: string) => `No. Nothing is on your schedule${sp(days)}.`,
  noneAll: (days: string) => `No. Nothing is on the calendar${sp(days)}.`,
  noneFor: (group: string, days: string) => `No. Nothing is on the calendar for ${group}${sp(days)}.`,
  noRoom: (x: string) => `No room is listed for ${x} yet.`,
  room: (room: string, label: string, directions?: string) => `${room}: ${label}.${directions ? ` ${directions}` : ''}`,
  noDirections: 'No directions are posted for that room yet.',
  playing: (x: string, pieces: string) => `${x}: ${pieces}.`,
  musicListed: (x: string) => `Music is listed for ${x}.`,
  noMusic: 'No music is listed for this rehearsal yet.',
  preparing: (x: string) => `Preparing for ${x}.`,
  noProgram: (title: string) => `No program is posted for ${title} yet.`,
  lesson: (x: string) => `Lesson ${x}`,
  lessonOff: (x: string) => `Lesson ${x}: cancelled.`,
  noLesson: (days: string) => `No. No lesson is on your schedule${sp(days)}.`,
  dueOne: (title: string, day: string) => `${title} is due ${day}.`,
  dueMany: (n: number, title: string, day: string) => `${n} things are due. First: ${title}, ${day}.`,
  noneDue: (days: string) => `Nothing is due${sp(days)}.`,
  seat: (section: string, chair: number, chart: string) => `${section}, chair ${chair}. ${chart}.`,
  noSeat: 'No seating chart with your name is posted yet.',
  chartFor: (group: string, chart: string) => `The seating chart for ${group}: ${chart}.`,
  noChartFor: (group: string) => `No seating chart is posted for ${group} yet.`,
  partsOf: (title: string) => `The parts for ${title} are on its page.`,
  myPieces: (n: number) => `${n} ${n === 1 ? 'piece is' : 'pieces are'} on your schedule. Your part is on each piece's page.`,
  piecesFor: (n: number, group: string) => `${n} ${n === 1 ? 'piece' : 'pieces'} for ${group}.`,
  noMusicMine: 'No music is listed for you yet.',
  noMusicFor: (group: string) => `No music is listed for ${group} yet.`,
  forms: (n: number, title: string, by?: string) =>
    `${n} ${n === 1 ? 'form is' : 'forms are'} waiting. ${n === 1 ? '' : 'First: '}${title}${by ? `, by ${by}` : ''}.`,
  noForms: 'No forms are waiting for you.',
  noFormsFor: (group: string) => `No forms are waiting for ${group}.`,
  formOpen: (title: string, by?: string) => `${title} is open${by ? ` until ${by}` : ''}.`,
  formClosed: (title: string) => `${title} is closed.`,
  formsPage: 'Forms are on the Forms page.',
  concerts: (n: number, x: string) => `${n} concerts. Next: ${x}.`,
  audience: 'You are in the audience for this one.',
  noConcert: (mine: boolean, days: string) => `No concert is on ${mine ? 'your schedule' : 'the calendar'}${sp(days)}.`,
  call: (title: string, x: string) => `Call time for ${title}: ${x}.`,
  noCall: (title: string) => `No call time is posted for ${title} yet.`,
  dress: (title: string, dress: string) => `What to wear for ${title}: ${dress}`,
  noDress: (title: string) => `No dress note is posted for ${title} yet.`,
  pickup: (title: string, x: string) => `Pickup for ${title}: ${x}.`,
  ends: (title: string, x: string) => `${title} ends ${x}.`,
  noPickup: (title: string) => `No pickup time is posted for ${title} yet.`,
  reqPlay: (title: string) => `Yes. You play in ${title}.`,
  reqAttend: (title: string) => `Yes. You are required to attend ${title}.`,
  reqNo: (title: string) => `No. ${title} is not on your schedule.`,
  reqSome: (title: string) => `Some groups are required to attend ${title}.`,
  reqNobody: (title: string) => `No group is listed as required to attend ${title}.`,
  reqMine: (n: number, play: number, attend: number) =>
    `${n} ${n === 1 ? 'concert is' : 'concerts are'} on your schedule: ${play} to play, ${attend} to attend.`,
  reqAll: (n: number) => `${n} ${n === 1 ? 'concert has' : 'concerts have'} groups required to attend.`,
  reqAllNone: 'No concert has a group required to attend.',
  noSchool: (days: string) => `No. There is no school${sp(days)}.`,
  school: (days: string) => `Yes. There is school${sp(days)}.`,
  nextOff: (day: string) => `The next day off is ${day}.`,
  noDayOff: 'No day off is on the calendar.',
  daysOff: (dates: string) => `No school: ${dates}.`,
  schoolAll: (days: string) => `There is school every weekday${sp(days)}.`,
  group: (name: string, by?: string) => (by ? `${name}, with ${by}.` : `${name}.`),
  piece: (title: string, by?: string) => (by ? `${title}, by ${by}.` : `${title}.`),
  news: (n: number, title: string) => (n === 1 ? `1 announcement: ${title}.` : `${n} announcements. Newest: ${title}.`),
  noNews: 'No announcements right now.',
  documents: 'Documents are on the Documents page.',
  howAbsence: 'Report an absence on the Absence page.',
  howSubmit: 'Open the assignment and send your video from its page.',
  howCheckin: 'Check in on the Check-In page.',
  howCalendar: 'Subscribe from the calendar page, and it stays up to date.',
  howCopy: 'Ask for a copy on the Request Music Copies page.',
  howAlerts: 'The Start Guide shows how to turn on alerts.',
  howFindMe: 'Find your name on the lookup page.',
  glossary: "That word is in the Start Guide's glossary.",
};

const ES: typeof EN = {
  notUnderstood: 'No tengo una respuesta para eso.',
  notHeld: 'El Hub no tiene eso.',
  who: '¿Quién pregunta?',
  startsEnds: (title, x, end) => `${title}: empieza ${x}, termina ${end}.`,
  startsOnly: (title, x) => `${title}: empieza ${x}. No hay hora de fin anotada.`,
  noTimes: title => `Todavía no hay horas para ${title}.`,
  lessonTeacher: name => `Tu clase particular es con ${name}.`,
  noStaff: 'Todavía no aparece maestro ni director para tus grupos.',
  contact: address => `Escribe a ${address}.`,
  today: 'hoy',
  tomorrow: 'mañana',
  on: date => `el ${date}`,
  span: (a, b) => `del ${a} al ${b}`,
  when: { today: 'hoy', tonight: 'esta noche', tomorrow: 'mañana', thisWeek: 'esta semana', nextWeek: 'la próxima semana', weekend: 'este fin de semana' },
  list: (names, more) => names.join(', ') + (more > 0 ? ` y ${more} más` : ''),
  plain: x => `${x}.`,
  yes: x => `Sí. ${x}.`,
  no: x => `No. ${x}.`,
  yesMany: (n, days, x) => `Sí. ${n} cosas${sp(days)}. Primero: ${x}.`,
  off: x => `${x}: cancelado.`,
  yesOff: x => `Sí. ${x}: cancelado.`,
  changed: x => `Sí. ${x}: con cambios.`,
  changes: (n, days) => `Sí. ${n} cambios${sp(days)}.`,
  noChange: days => `No. Nada${sp(days)} está cancelado ni cambiado.`,
  noneMine: days => `No. No hay nada en tu horario${sp(days)}.`,
  noneAll: days => `No. No hay nada en el calendario${sp(days)}.`,
  noneFor: (group, days) => `No. No hay nada en el calendario de ${group}${sp(days)}.`,
  noRoom: x => `Todavía no hay salón para ${x}.`,
  room: (room, label, directions) => `${room}: ${label}.${directions ? ` ${directions}` : ''}`,
  noDirections: 'Todavía no hay indicaciones para ese salón.',
  playing: (x, pieces) => `${x}: ${pieces}.`,
  musicListed: x => `Hay música anotada para ${x}.`,
  noMusic: 'Todavía no hay música anotada para este ensayo.',
  preparing: x => `Preparando ${x}.`,
  noProgram: title => `Todavía no hay programa para ${title}.`,
  lesson: x => `Clase particular ${x}`,
  lessonOff: x => `Clase particular ${x}: cancelada.`,
  noLesson: days => `No. No hay clase particular en tu horario${sp(days)}.`,
  dueOne: (title, day) => `${title} se entrega ${day}.`,
  dueMany: (n, title, day) => `Hay ${n} tareas por entregar. Primera: ${title}, ${day}.`,
  noneDue: days => `No hay nada por entregar${sp(days)}.`,
  seat: (section, chair, chart) => `${section}, silla ${chair}. ${chart}.`,
  noSeat: 'Todavía no hay una tabla de asientos con tu nombre.',
  chartFor: (group, chart) => `La tabla de asientos de ${group}: ${chart}.`,
  noChartFor: group => `Todavía no hay tabla de asientos para ${group}.`,
  partsOf: title => `Las partes de ${title} están en su página.`,
  myPieces: n => `${n} ${n === 1 ? 'obra' : 'obras'} en tu horario. Tu parte está en la página de cada obra.`,
  piecesFor: (n, group) => `${n} ${n === 1 ? 'obra' : 'obras'} para ${group}.`,
  noMusicMine: 'Todavía no hay música anotada para ti.',
  noMusicFor: group => `Todavía no hay música anotada para ${group}.`,
  forms: (n, title, by) =>
    `${n} ${n === 1 ? 'formulario pendiente' : 'formularios pendientes'}. ${n === 1 ? '' : 'Primero: '}${title}${by ? `, hasta ${by}` : ''}.`,
  noForms: 'No tienes formularios pendientes.',
  noFormsFor: group => `No hay formularios pendientes para ${group}.`,
  formOpen: (title, by) => `${title} está abierto${by ? ` hasta ${by}` : ''}.`,
  formClosed: title => `${title} está cerrado.`,
  formsPage: 'Los formularios están en la página de Formularios.',
  concerts: (n, x) => `${n} conciertos. El siguiente: ${x}.`,
  audience: 'Vas como público a este.',
  noConcert: (mine, days) => `No hay ningún concierto en ${mine ? 'tu horario' : 'el calendario'}${sp(days)}.`,
  call: (title, x) => `Hora de llegada para ${title}: ${x}.`,
  noCall: title => `Todavía no hay hora de llegada para ${title}.`,
  dress: (title, dress) => `Qué ponerse para ${title}: ${dress}`,
  noDress: title => `Todavía no hay nota de vestuario para ${title}.`,
  pickup: (title, x) => `Recogida para ${title}: ${x}.`,
  ends: (title, x) => `${title} termina ${x}.`,
  noPickup: title => `Todavía no hay hora de recogida para ${title}.`,
  reqPlay: title => `Sí. Tocas en ${title}.`,
  reqAttend: title => `Sí. Debes asistir a ${title}.`,
  reqNo: title => `No. ${title} no está en tu horario.`,
  reqSome: title => `Algunos grupos deben asistir a ${title}.`,
  reqNobody: title => `Ningún grupo aparece como obligado a asistir a ${title}.`,
  reqMine: (n, play, attend) =>
    `${n} ${n === 1 ? 'concierto' : 'conciertos'} en tu horario: ${play} para tocar, ${attend} para asistir.`,
  reqAll: n => `${n} ${n === 1 ? 'concierto tiene' : 'conciertos tienen'} grupos que deben asistir.`,
  reqAllNone: 'Ningún concierto tiene un grupo que deba asistir.',
  noSchool: days => `No. No hay clases${sp(days)}.`,
  school: days => `Sí. Hay clases${sp(days)}.`,
  nextOff: day => `El próximo día sin clases es ${day}.`,
  noDayOff: 'No hay ningún día sin clases en el calendario.',
  daysOff: dates => `Sin clases: ${dates}.`,
  schoolAll: days => `Hay clases todos los días${sp(days)}.`,
  group: (name, by) => (by ? `${name}, con ${by}.` : `${name}.`),
  piece: (title, by) => (by ? `${title}, de ${by}.` : `${title}.`),
  news: (n, title) => (n === 1 ? `1 anuncio: ${title}.` : `${n} anuncios. El más reciente: ${title}.`),
  noNews: 'No hay anuncios por ahora.',
  documents: 'Los documentos están en la página de Documentos.',
  howAbsence: 'Reporta una ausencia en la página de Ausencias.',
  howSubmit: 'Abre la tarea y envía tu video desde su página.',
  howCheckin: 'Registra tu llegada en la página de Check-In.',
  howCalendar: 'Suscríbete desde la página del calendario y se mantiene al día.',
  howCopy: 'Pide una copia en la página de Pedir copias de música.',
  howAlerts: 'La Guía de inicio muestra cómo activar las alertas.',
  howFindMe: 'Busca tu nombre en la página de búsqueda.',
  glossary: 'Esa palabra está en el glosario de la Guía de inicio.',
};
