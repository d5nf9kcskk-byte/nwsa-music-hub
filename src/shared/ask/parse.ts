/**
 * Ask, the understanding half (#ask): what a person typed in, one typed
 * question out. No model, no network, no state kept between calls.
 * Design: docs/superpowers/specs/2026-11-11-hub2-integrated-design.md, 3.3.
 *
 * It reads a sentence in four passes, and the ORDER is the design:
 *   1. Date words come out first, from a closed table (English, Spanish, and
 *      what thumbs type). A month only counts with a day number beside it
 *      ("dec 9"), after "in" ("in march") or before "concert", so "Radetzky
 *      March" stays a piece and "Midnight Ball" stays a concert.
 *   2. The question's shape picks the intent, from one ordered table.
 *   3. The words LEFT OVER are matched against the names the caller passes
 *      in, allowing one typo, a short form ("phil", "tchaik 5") or initials
 *      ("cco"). This module knows no names of its own.
 *   4. Defaults: a date alone is my day, a name alone is that thing's card.
 *
 * The one failure that is not allowed is being wrong with confidence. So a
 * word nothing accounts for is never skipped: it ends the parse with
 * `intent: 'none'`. That single rule is also the privacy boundary. A
 * classmate's name is a word nothing accounts for, which is why "where is
 * <somebody>" gets no answer on the public side without this module ever
 * holding a list of people. Keep FILLER small; every word added to it is a
 * word the engine agrees to ignore.
 *
 * FIRST NAMES. Titles are full of them (Carmen Suite, Souvenir de Florence,
 * the James K. Batten Room), and "where is james" must not find a room. Three
 * guards, all in the matcher: a name is matched on its whole words or on the
 * short forms in SHORT, never on a loose beginning; the people on a thing
 * (`by`) are found by surname only; and a word in givenNames.ts never picks a
 * thing by itself. KNOWN LIMIT: a first name that is in no list of common
 * names and is also a whole word of some title still reads as that title.
 * Nothing can close that without a list of people, which this module must
 * never hold. The answer names what it understood, and all of it is public.
 *
 * ORDINARY WORDS. Titles are full of those too ("We'll go away together"),
 * and so is the calendar ("Radetzky March", a piece called "October"). A
 * word in commonWords.ts, a month, a weekday or a season is treated like a
 * first name: it counts beside a real word of the same name and never alone,
 * and a typo is never forgiven on it ("spring" is not a misspelled "string").
 *
 * THE PAST AND OTHER PEOPLE'S RECORDS. The public side answers what is
 * coming. "Was he absent", "how did my son do", "is she marked late" ask for
 * a record only staff may read, whoever the subject is, so they end the parse.
 *
 * Pure: no React, no Firestore, no org config. Relative imports carry `.ts`
 * so plain Node can load it. ask.selfcheck.ts runs it over the corpus.
 */

import type { AskIntent, AskWhen } from './corpus.ts';
import { normalizeText, withinOneTypo } from '../fuzzy.ts';
import { GIVEN_NAMES } from './givenNames.ts';
import { COMMON_WORDS } from './commonWords.ts';

/** What kind of thing a name is. `room` is somewhere we rehearse; `venue` is
 *  somewhere we travel to perform, so "where is the Lyric" is a question
 *  about a concert and "wheres 4304" is a question about a door. */
export type AskNameKind = 'group' | 'concert' | 'assignment' | 'piece' | 'venue' | 'room' | 'form';

export interface AskName {
  kind: AskNameKind;
  name: string;
  /** Other words people find it by: a course code, a short title. */
  also?: string[];
  /** The people on it: conductor, teacher, composer. Found by SURNAME only.
   *  "gilman" finds his classes; "sarah" finds nothing, because a first name
   *  is far more often a classmate than a teacher. */
  by?: string[];
  /** The caller's own handle. Never read here; handed back on `match`. */
  id?: string;
}

export interface AskParse {
  intent: AskIntent;
  when?: AskWhen;
  /** The named thing: the matched name when exactly one fits, otherwise the
   *  person's own words for it, with a typo or short form spelled out. */
  about?: string;
  /** The caller's own record, when exactly one name fits. */
  match?: AskName;
  /** False means "I do not have an answer for that", and intent is 'none'. */
  confident: boolean;
}

export interface AskRule {
  intent: AskIntent;
  /** The words that give the question away. A capture group marks words
   *  that are ALSO the thing asked about ("playing exam", "finals"). */
  re: RegExp;
  /** Other words that belong to this shape of question and mean nothing more. */
  also?: RegExp;
  /** The date when no date word was typed. null = none. Left out = the
   *  intent's own default (WHEN_DEFAULT). */
  when?: AskWhen | null;
  /** Leftover words are the topic to search for, not a reason to refuse. */
  topic?: boolean;
  /** Staff only: leftover words are a person's name. Ignored, never resolved. */
  person?: boolean;
  /** The rule stands aside when this is also in the sentence: "holiday
   *  concert" is a concert, not a day off. */
  not?: RegExp;
  /** The word only means this beside a named thing: "address for the
   *  fillmore" is a concert, "my address" is nothing the Hub answers. */
  named?: boolean;
}

/** Everything the staff side adds. It lives in src/director/ask/ (design
 *  3.8), so the public bundle carries no staff phrasing at all: the public
 *  parser refuses "who is out today" because it has never heard of it. */
export interface AskStaffSide {
  /** Tried before the public rules. */
  rules: AskRule[];
  kinds: Partial<Record<AskIntent, AskNameKind[]>>;
  whenDefault: Partial<Record<AskIntent, [AskWhen | undefined, AskWhen | undefined]>>;
  /** Public intents that mean something wider when staff ask. */
  widen: Partial<Record<AskIntent, AskIntent>>;
  /** "Where is <words nothing accounts for>": a person. */
  wherePerson: AskIntent;
  /** A room and a date with nothing else. */
  roomOnDate: AskIntent;
}

/* ── Words ────────────────────────────────────────────────────────────── */

const set = (s: string) => new Set(s.split(' '));

/** Words that carry nothing. Deliberately short: see the header. */
const FILLER = set(
  'a about after al am an and any anything are at be by can como could cual cuando day de del did do does donde ' +
  'r their them they u ur wat wen wut ' +
  'el en end ends es esta for from gonna has have hay he her hey hi him his hola hora how i if im in is it ' +
  'its just la las like lo look los me meet meets mi my need of ok on our over para please pls plz por ' +
  'que se she should so some start starts still tengo thanks that the there this tiene time to un una us va ' +
  'up vamos voy want was we what whats when whens where wheres which who whos with would y you your ' +
  'kid kids child son daughter student hijo hija empieza termina',
);
/** Nouns for the ordinary thing on a schedule. Ignored unless a name uses them. */
const GENERIC = set(
  'rehearsal rehearsals class classes concert concerts concierto conciertos ensayo ensayos clase clases ' +
  'music musica exam exams test lesson lessons form forms part parts recital school show shows',
);
/** An instrument qualifies a lesson, a seat or a part. Anywhere else it is a
 *  word nothing accounts for ("cellos in symphony" is a roster question). */
export const ASK_INSTRUMENTS = set(
  'violin violins viola violas cello cellos bass basses flute flutes oboe oboes clarinet clarinets ' +
  'bassoon bassoons horn horns trumpet trumpets trombone trombones tuba tubas percussion piano harp ' +
  'guitar sax saxophone saxophones drums voice chelo violonchelo contrabajo flauta trompeta',
);
const INSTRUMENT_OK = new Set<AskIntent>(['lesson', 'seat', 'parts', 'due', 'howCopy', 'howSubmit']);
/** A kind of rehearsal, not a name: kept as the thing asked about. */
const KIND_WORD = set('sectional sectionals seccional seccionales masterclass masterclasses');
const ARTICLE = set('a an any un una');
/** What comes before a thing, never before a person: "a bass bow", "my folder". */
const DETERMINER = set('a an the my our some any un una el la mi');
/** "Are WE", "do WE": a pronoun somebody typed loudly, not Wind Ensemble. */
const BEFORE_PRONOUN = set('are do did can should will would could shall were have dont cant');
const NAME_STOP = set('the of de la el a an and in for from at y no to with by up');
/** How people name a concert that has another name on the poster. */
const SEASON = set('winter spring fall autumn summer holiday christmas invierno primavera otono verano navidad');
/** The short forms people really use, and nothing looser. Any four-letter
 *  beginning used to count, and "chris" found the Christmas concert, "work"
 *  found Opera Workshop and "conc" found the Concerto concert. A group's own
 *  nickname belongs on its `also`. Initials ("cco", "WE") are a separate rule. */
const SHORT: Record<string, string> = {
  phil: 'philharmonic', orch: 'orchestra', symph: 'symphony', ens: 'ensemble', tchaik: 'tchaikovsky',
  midnite: 'midnight', nite: 'night', xmas: 'christmas',
};

/** Lower case, no accents, no punctuation. ':' and '/' survive for dates. */
export function askWords(s: string): string {
  return normalizeText(s)
    .replace(/['’‘`´]/g, '')
    .replace(/[^a-z0-9:/]+/g, ' ')
    .replace(/\bmaster class/g, 'masterclass')
    .trim();
}

/* ── 1. Dates ─────────────────────────────────────────────────────────── */

const WEEKDAYS: [string, string][] = [
  ['mon', 'monday|mon|lunes'],
  ['tue', 'tuesday|tuseday|tues|tue|martes'],
  ['wed', 'wednesday|wensday|wednsday|weds|wed|miercoles'],
  ['thu', 'thursday|thrusday|thurs|thur|thu|jueves'],
  ['fri', 'friday|firday|fri|viernes'],
  ['sat', 'saturday|saterday|sat|sabado'],
  ['sun', 'sunday|sun'],
];
const MONTHS = [
  'january|jan|enero|ene', 'february|feb|febrero', 'march|mar|marzo', 'april|apr|abril|abr',
  'may|mayo', 'june|jun|junio', 'july|jul|julio', 'august|aug|agosto', 'september|sept|sep|septiembre|setiembre',
  'october|oct|octubre', 'november|nov|noviembre', 'december|dec|diciembre|dic',
];
const MONTH = MONTHS.join('|');
/** Words that are something else first: an ordinary word, a month, a
 *  weekday, a season. Never a typo of a name and never a name by themselves. */
const PLAIN = new Set([
  ...COMMON_WORDS, ...SEASON,
  ...MONTHS.flatMap(m => m.split('|')), ...WEEKDAYS.flatMap(([, alts]) => alts.split('|')), 'domingo',
]);
/** Where a date word was. The time of day right after one says nothing more. */
const WAS_DATE = ' ~ ';
const TIME_OF_DAY = /~\s+(?:(?:in|en|por|de|a|at)\s+(?:the\s+|la\s+)?)?(?:night|nite|morning|afternoon|evening|noche|tarde)\b/g;

type DateHit = AskWhen | 'strip' | 'past' | 'unsure';
const DATE_WORDS: [RegExp, DateHit][] = [
  [/\b\d{1,2}:\d{2}(?: ?[ap]m)?\b|\b\d{1,2} ?[ap]m\b|\b(?:at|a las?) \d{1,2}\b(?![/:])/g, 'strip'],
  // Days AskWhen has no word for. Reading "pasado mañana" as tomorrow would
  // be wrong with confidence, so these end the parse instead.
  [/\bpasado manana\b|\bday after tomorrow\b/g, 'unsure'],
  // "Next friday" is this coming Friday to some people and the one after to
  // others. Either guess would be wrong half the time.
  [new RegExp(`\\bnext (?:${WEEKDAYS.map(([, alts]) => alts).join('|')})\\b`, 'g'), 'unsure'],
  [/\byesterday\b|\bayer\b|\banoche\b|\blast (?:night|week|month|time)\b/g, 'past'],
  [/\bthis year\b|\beste ano\b|\b(?:por|en) la manana\b/g, 'strip'],
  [/\b(?:la )?(?:proxima|siguiente) semana\b|\bla semana que viene\b|\bne?xt week\b/g, 'nextWeek'],
  [/\b(?:esta|this|the|my|mi) (?:semana|week)\b/g, 'thisWeek'],
  [/\b(?:(?:this|the|el|este) )?(?:weekend|wknd|fin de semana|finde)\b/g, 'weekend'],
  [/\btonight\b|\btonite\b|\b2nite\b|\besta noche\b|\bthis evening\b|\bhoy (?:en|por|a) la noche\b/g, 'tonight'],
  [/\btoday\b|\b2day\b|\btdy\b|\bhoy\b|\bright now\b|\bnow\b|\bahora\b|\besta manana\b|\besta tarde\b|\bthis (?:morning|afternoon)\b|\bafter school\b/g, 'today'],
  [/\btomorrow\b|\btomorow\b|\btommorow\b|\btommorrow\b|\btomorro\b|\btmrw\b|\btmr\b|\btmw\b|\b2morrow\b|\b2moro\b|\bmanana\b/g, 'tomorrow'],
  // Domingo is also a man's name, so it is Sunday only with its article.
  [/\b(?:el|este|los) domingo\b/g, 'weekday:sun'],
  ...WEEKDAYS.map(([day, alts]): [RegExp, DateHit] =>
    [new RegExp(`\\b(?:(?:on|this|el|este|los) )?(?:${alts})\\b`, 'g'), `weekday:${day}` as AskWhen]),
];
const NEXT = /\b(?:next|nxt|proxim[oa]s?|siguiente|upcoming)\b/g;

interface DateRead { rest: string; when?: AskWhen; next: boolean; past: boolean; unsure: boolean; bareSlash: boolean; bareDay: boolean }

function takeDate(text: string): DateRead {
  const found = new Set<AskWhen>();
  let past = false;
  let unsure = false;
  let bareSlash = false;
  let bareDay = false;
  const dated = (m: number, d: number) => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    found.add(`date:${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    return true;
  };
  const monthOf = (w: string) => MONTHS.findIndex(m => m.split('|').includes(w)) + 1;

  // "Sat" is also what somebody did in a chair, and "the SAT" is a test.
  // "May I" is manners, not the month.
  let s = text
    .replace(/^may i\b/, 'can i')
    .replace(/\b(i|we|he|she|they|you) sat\b/g, '$1 sit')
    .replace(/\bthe (sat|sun)\b/g, 'the $1s')
    .replace(DATE_WORDS[0][0], ' ');
  // Month first, as the school writes it. "16/11" can only be day first.
  s = s.replace(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g, (all, m, d, at: number, whole: string) => {
    if (/^ time\b/.test(whole.slice(at + all.length))) return all; // "3/4 time"
    if (!dated(+m, +d) && !dated(+d, +m)) return all;
    if (!/\b(?:on|el|for|para|del|by|due)\s*$/.test(whole.slice(0, at))) bareSlash = true;
    return WAS_DATE;
  });
  // A month is a date with a day number beside it: "dec 9", "9 de diciembre",
  // "15 dec". ("May" is left out of the last shape: "exam 2 may be late".)
  s = s.replace(new RegExp(`\\b(${MONTH}) (\\d{1,2})(?:st|nd|rd|th)?\\b`, 'g'),
    (all, m, d) => (dated(monthOf(m), +d) ? WAS_DATE : all));
  s = s.replace(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)? (?:de |of )?(${MONTH})\\b`, 'g'),
    (all, d, m) => (!(m === 'may' && !/ (?:de|of) /.test(all)) && dated(monthOf(m), +d) ? WAS_DATE : all));
  // "In march" is the month. Without the "in" it stays a word, so
  // "Radetzky March" is still a piece and never the other way round.
  // "The december concert" is the month too. Not "march" or "may" there:
  // those two are also words, and "Radetzky March concert" is a piece.
  const month = (_all: string, m: string) => {
    found.add(`month:${String(monthOf(m)).padStart(2, '0')}`);
    return WAS_DATE;
  };
  s = s.replace(new RegExp(`\\b(?:in|en|during|durante) (${MONTH})\\b`, 'g'), month);
  s = s.replace(new RegExp(`\\b(?!march\\b|may\\b|mar\\b)(${MONTH}) (?=(?:concert|concierto|recital|show)s?\\b)`, 'g'), month);
  // "The 15th" is the next 15th, but only as the last thing said: "the 5th
  // symphony" and "9th grade" are not days. And unless it is all that was
  // said, only in a question about a day (`bareDay`): "bowings on the 2nd"
  // is a stand.
  const said = s.trim();
  s = s.replace(/\b(?:on )?the (\d{1,2})(?:st|nd|rd|th)(?=[ ~]*$)|\bel dia (\d{1,2})\b/, (all, d1, d2) => {
    const d = +(d1 ?? d2);
    if (d < 1 || d > 31) return all;
    found.add(`day:${String(d).padStart(2, '0')}`);
    if (d1 && all !== said) bareDay = true;
    return WAS_DATE;
  });
  for (const [re, hit] of DATE_WORDS.slice(1)) {
    s = s.replace(re, () => {
      if (hit === 'past') past = true;
      else if (hit === 'unsure') unsure = true;
      else if (hit !== 'strip') found.add(hit);
      return hit === 'strip' ? ' ' : WAS_DATE;
    });
  }
  // "Friday night", "tomorrow morning": the day is the date, and the time of
  // day is not a word in anybody's title.
  s = s.replace(TIME_OF_DAY, WAS_DATE);
  const next = s.search(NEXT) >= 0;
  s = s.replace(NEXT, ' ').replace(/[:/~]/g, ' ').replace(/\s+/g, ' ').trim();
  // Two different days in one question is a question this cannot answer.
  return { rest: s, when: found.size === 1 ? [...found][0] : undefined, next, past, bareSlash, bareDay, unsure: unsure || found.size > 1 };
}

/* ── 2. Intent ────────────────────────────────────────────────────────── */

/** Whoever the question is about: me, him, her, or the parent's own child. */
const SUBJECT = '(?:i|he|she|they|(?:my|our|mi) (?:son|daughter|kid|child|student|boy|girl|hij[oa]|nin[oa]))';
/** Staff-only facts. Refused outright on the public side, whoever they are
 *  about. A parent asks the same things in the third person. */
const REFUSE = new RegExp([
  // A mark, by name.
  /\b(?:grades?|notas?|calificacion(?:es)?|what did i get|marked|passing|failing|gpa|scores?)\b/.source,
  /\b(?:exam|test|quiz|examen)\w* results?\b|\bresults? (?:of|for|on|from) (?:the |my |his |her )?(?:playing )?(?:exam|test|quiz)/.source,
  /\b(?:my|his|her|their|mis?|sus?) (?:results?|resultados?)\b/.source,
  /^change\b/.source,
  // The past is a record: "was he absent", "how was the exam", "how did my
  // son do", "did she miss rehearsal". The public side answers what is coming.
  /\b(?:was|were|wasnt|werent)\b|\bhow did\b/.source,
  `\\bdid ${SUBJECT} (?!submit|upload|turn|send|check)`,
  // Asking whether somebody IS absent or late is asking for today's roll.
  // Saying that they will be is a report, and that has its own door.
  `\\b(?:is|are|am|esta|estoy) ${SUBJECT}\\b.*\\b(?:absent|ausente|late|tardy|present|presente|excused)\\b`,
  `\\b(?:is|are|esta) ${SUBJECT} (?:in|at|en) (?:class|school|rehearsal|clase|ensayo|la escuela)\\b`,
  // Somebody's contact details.
  /\b(?:his|her|their|su|sus) (?:address|phone|number|email|direccion|telefono|correo)\b/.source,
].join('|'));
/** A "who" question is about other people, so the public side refuses it
 *  unless it is one of these, which ask about a group or about me. */
const WHO = /\b(?:who|whos|whose|quien|quienes)\b/;
const WHO_OK = /\bwho do i tell\b|\bwho(?:s| is) in\b|\bwho (?:conducts|teaches|directs|wrote|composed)\b|\bwho(?:s| is) my\b|\bwho has\b.*\bduty\b|\bquien (?:dirige|ensena|es mi)\b/;
const WHEN_SHAPE = /\b(?:when|whens|wen|what time|cuando|a que hora)\b/;

/** First match wins, so the order is the meaning: "is my lesson cancelled"
 *  is about the lesson, "where is the concert" is about the concert. */
const RULES: AskRule[] = [
  { intent: 'glossary', re: /\bwhat does (.+) mean\b|\bque (?:significa|quiere decir) (.+)|^(?:whats|what is|que es) (?:a|an|un|una) (.+)$|^define (.+)$/ },

  // "ill" alone is how thumbs type "I'll": "ill be there" is a promise to come.
  { intent: 'howAbsence', re: /\b(?:sick|enferm[oa])\b|\b(?:im|i am|is|feel|feels|feeling) ill\b/, also: /\bout\b|\bhome\b/, when: 'today' },
  { intent: 'howAbsence', re: /\b(?:absent|absence|ausente|ausencia|faltar|leav(?:e|ing) early|salir temprano|appointment|cita|have to miss|gonna miss|miss (?:rehearsal|class|school)|wont be (?:at|in|there)|cant (?:come|go|attend|make it|be there)|no pued[eo] (?:ir|venir|asistir|llegar))\b/, also: /\breport(?:o|ar)?\b|\bwho do i tell\b|\bdentist\b|\bdoctors?\b|\bschool\b|\bwill be\b/ },
  { intent: 'howSubmit', re: /\bturn(?:ed)? (?:it )?in\b|\b(?:re)?submit\b|\bupload(?:ed)?\b|\b(?:better|another) take\b|\bretake\b|\bcomo (?:entrego|subo|envio)\b/, also: /\b(?:send|video|playing|exam|examen|test)\b/ },
  { intent: 'howCheckin', re: /\bcheck(?:ed)? ?(?:in|out)\b|\bregistrar (?:mi )?llegada\b|\bhow many concerts have i (?:gone to|been to|attended)\b/, also: /\b(?:forgot|count|counted)\b/ },
  { intent: 'howCalendar', re: /\bcalendar\b|\bcalendario\b|\bsubscribe\b|\bon my phone\b/, also: /\b(?:add|get|schedule|google|apple|iphone)\b/ },
  { intent: 'howCopy', re: /\blost my (?:music|part|folder)\b|\b(?:a|another|a new) copy\b|\bcopy of my\b|\bpage turn\b|\bmissing (?:a page|pages)\b|\bperdi mi (?:musica|partitura)\b/, also: /\b(?:bad|part|music|get)\b/ },
  { intent: 'howAlerts', re: /\b(?:alerts?|alertas?|notifications?|notificaciones|notify|get a text|text me)\b/, also: /\bturn on\b|\bcancell?ed\b|\bget\b/ },
  { intent: 'howFindMe', re: /\bfind (?:my schedule|me)\b|\bnot me\b|\bwrong (?:person|student|name|kid)\b|\btwo kids\b|\b(?:other|another) (?:kids?|child|student|phone)\b|\bespanol\b|\bin spanish\b/, also: /\bin the program\b|\bsend\b|\bsee\b|\bschedule\b/ },

  { intent: 'required', re: /\b(?:required|mandatory|obligatori[oa]s?)\b|\b(?:have|need) to (?:go|attend)\b/, also: /\bhow many\b|\bgo\b|\battend\b/ },
  { intent: 'pickup', re: /\bpick ?up\b|\bpick (?:him|her|them) up\b|\brecog\w+\b|\brecojo\b|^(?:what time|when) is it over$|\b(?:concert|concierto|show|it) (?:ends?|finish(?:es)?|is over|lets? out|termina|acaba)\b/ },
  // "Call" is the call time only as a noun: "what time is call", "our call".
  // "Call the school" and "call me" are things to do.
  { intent: 'callTime', re: /\bcall ?time\b|\b(?:is|whens|whats|the|our|my) call\b|^call$|^call for\b|\b(?:have|need|supposed) to be (?:there|at)\b|\b(?:be|get) there\b|\barrive\b|\bllegar\b|\b(?:hora de )?llegada\b/ },
  // "Black" is about clothes, except in "the black box", which is a room.
  { intent: 'dress', re: /\bwear(?:ing)?\b|\bdress(?: code)?\b(?! rehearsal)|\battire\b|\bconcert black\b|\bblack\b(?! box)|\bme pongo\b|\bropa\b|\buniforme?\b/, also: /\bon stage\b/ },

  // "Where is my lesson" is a where question about the lesson.
  { intent: 'where', re: /\b(?:where|wheres|donde)\b.*\b(lesson|clase particular)\b/, when: 'next' },
  { intent: 'lesson', re: /\blessons?\b|\bclase particular\b|\bleccion(?:es)?\b/, also: /\bteacher\b|\bprofesora?\b|\bcancell?ed\b/ },
  { intent: 'due', re: /\bdue\b|\bhw\b|\bhomework\b|\btarea\b|\bassignments?\b|\bse entrega\b|\b(playing exams?|exam(?:s|en|enes)?|tests?|quiz(?:zes)?)\b/, also: /\b(?:excerpts?|late|send|date)\b/ },
  { intent: 'forms', re: /\bforms?\b|\bformularios?\b|\bpermission(?: slip)?\b|\bpermiso\b|\bsign ?ups?\b|\bsign\b|\bfirm(?:o|ar)\b/, also: /\bfill(?:ed)? out\b/ },
  { intent: 'seat', re: /\bseat(?:s|ing)?\b|\bsit\b|\bchair\b|\bfirst or second\b|\bsiento\b|\basiento\b|\bstand partner\b|\b(?:which|what|my) stand\b/, also: /\bchart\b/ },
  { intent: 'parts', re: /\bparts?\b|\b(?:my|sheet) music\b|\bpartituras?\b|\bbowings?\b|\bfingerings?\b/ },
  { intent: 'piece', re: /\brecordings?\b|\bprogram notes?\b|\bgrabacion\b|\bwho (?:wrote|composed)\b|\bcomposer\b/ },
  // "cancel" and "move" alone are things a director DOES; only the past and
  // the question forms ask whether it happened.
  { intent: 'cancelled', re: /\bcancell?ed\b|\bcancelad[oa]\b|\bcancelo\b|\bcancelaron\b|\bstill (?:on|happening)\b|\bchanges?\b|\bchanged\b|\bcambios?\b|\bdid .*\bmove\b|\bmoved\b/ },

  { intent: 'news', re: /\bdid (?:anyone|anybody|someone) (?:find|see)\b|\bhas (?:anyone|anybody) (?:seen|found)\b|\blost and found\b|\bduty\b|\bresults?\b|\bresultados\b/, topic: true },
  { intent: 'news', re: /\bannouncements?\b|\banuncios?\b|\bwhats new\b|\bwhat is new\b|\bnews\b|\bnovedades\b|\bnoticias\b/ },
  { intent: 'documents', re: /\bsyllab(?:us|i)\b|\bhandbook\b|\bdocuments?\b|\bdocs\b|\b(study guides?|scales?|librarian)\b/, also: /\bjob\b/ },

  { intent: 'noSchool', re: /\bno school\b|\bcome back\b|\bgo back\b|\bregresamos\b|\bvolvemos\b/, when: 'next' },
  // Only the shapes that ask whether school is on. "What time does school
  // start" is a bell schedule, which the Hub does not hold.
  { intent: 'noSchool', re: /\b(?:is there|there is|theres|do we have|have|hay|tenemos) (?:school|clases|escuela)\b|\bschool (?:closed|open|off|cancell?ed)\b|\bis (mdc) open\b/ },
  // A break, a term or a holiday, unless it is naming a concert: "holiday
  // concert" and "end of quarter concert" are about the concert.
  { intent: 'noSchool', re: /\b((?:thanksgiving|winter|spring|summer|fall|christmas|holiday) break|thanksgiving|finals|quarter|semester|grading period|vacaciones)\b|\bbreak\b|\bday off\b|\bholidays?\b|\bdias? festivos?\b|\bferiados?\b/, also: /\bschedule\b/, not: /\b(?:concert|concierto|recital|show)s?\b/ },

  // "Is my son playing friday" asks whether he is on, not what the pieces are.
  { intent: 'myDay', re: /\bam i playing\b|^is (?:he|she|my (?:son|daughter|kid|child|student)) playing\b/ },
  // "What should I practice", not "can I practice in 4304".
  { intent: 'playing', re: /\bwhat (?:should|do|can|shall) (?:i|we) (?:need to |have to )?practice\b|\bwhat to practice\b|\bque (?:debo |tengo que )?practicar\b/, when: 'thisWeek' },
  { intent: 'playing', re: /\b(?:what|which|program|concert) order\b|\border of\b/, also: /\bplaying\b/, when: 'next' },
  { intent: 'playing', re: /\brepertoire\b|\brepertorio\b|\brep\b|\bprograma?\b|\bsetlist\b|\bmusica?\b/, when: null },
  { intent: 'playing', re: /\brehears(?:ing|ed)\b|\bplay(?:ing)?\b|\btoca(?:mos|r|ndo)\b|\bensaya(?:r|ndo|mos)\b|\bpieces?\b|\bpiezas?\b|\bobras?\b|\bworking on\b/, also: /\bbeing\b/ },

  // More than one concert is a list, not "the next one".
  { intent: 'concert', re: /\bhow many concerts are left\b|\bconcerts\b|\bconciertos\b|\bcoming up\b/, when: null },
  { intent: 'concert', re: /\bconcert\b|\bconcierto\b|\bshows?\b|\bperformances?\b|\bperf\b|\brecitals?\b|\btickets?\b|\bboletos?\b|\bentradas?\b/, also: /\bmuch\b|\baddress\b|\bdireccion\b/ },
  { intent: 'concert', re: /\baddress\b|\bdireccion\b/, named: true },

  { intent: 'group', re: /\bwho(?:s| is) in\b|\bwho (?:conducts|teaches|directs)\b|\bquien (?:dirige|ensena)\b/ },
  { intent: 'where', re: /\bare we in\b|\bestamos en\b/, when: 'today' },
  { intent: 'where', re: /\bwheres?\b|\bdonde\b|\b(?:what|which) room\b|\bsalon\b|\broom\b/ },
  { intent: 'myDay', re: /\bschedule\b|\bhorario\b|\brehearsals?\b|\bensayos?\b|\bget out\b|\bwhat do i have\b|\bdo (?:i|we) have\b/ },
];

/** The questions that are about a day, so "the 15th" in one is a date. */
const DAY_QUESTION = new Set<AskIntent>([
  'myDay', 'playing', 'where', 'cancelled', 'lesson', 'due', 'concert', 'callTime', 'dress', 'pickup',
  'required', 'noSchool', 'howAbsence',
]);

/** The shapes that carry a search topic, for the self-check: it tries each
 *  with a person where the topic goes, and fails if one has no such test. */
export const ASK_TOPIC_TRIGGERS: readonly RegExp[] = RULES.filter(r => r.topic).map(r => r.re);

/** The date a question means when it names none: [nothing named, a thing named]. */
const WHEN_DEFAULT: Partial<Record<AskIntent, [AskWhen | undefined, AskWhen | undefined]>> = {
  myDay: ['today', 'next'],
  playing: ['today', undefined],
  where: ['today', 'next'],
  cancelled: ['today', 'today'],
  lesson: ['next', 'next'],
  concert: ['next', undefined],
  callTime: ['next', undefined],
  dress: ['next', undefined],
  pickup: ['next', undefined],
  noSchool: ['next', undefined],
};

/** Which kinds of name each question can be about, most likely first. A kind
 *  that is not listed is not looked for, so "where is <a piece>" is refused
 *  instead of answered about something. */
const ANY_KIND: AskNameKind[] = ['group', 'concert', 'assignment', 'piece', 'venue', 'room', 'form'];
const ABOUT_CONCERT: AskNameKind[] = ['concert', 'venue', 'group', 'piece'];
const KINDS: Partial<Record<AskIntent, AskNameKind[]>> = {
  myDay: ['group', 'concert'],
  // Not a piece: "what is <a piece> playing" is a person who shares its name.
  playing: ['group', 'concert', 'venue', 'room'],
  where: ['group', 'room', 'venue'],
  cancelled: ['group', 'concert'],
  due: ['assignment', 'group'],
  seat: ['group'],
  parts: ['piece', 'group'],
  forms: ['form', 'group'],
  concert: ABOUT_CONCERT, callTime: ABOUT_CONCERT, dress: ABOUT_CONCERT, pickup: ABOUT_CONCERT, required: ABOUT_CONCERT,
  group: ['group'],
  piece: ['piece'],
  documents: ['group'],
};
/* ── 3. Names ─────────────────────────────────────────────────────────── */

type Role = 'stop' | 'used' | 'kept' | 'weak' | 'inst' | 'free';
interface Tok {
  w: string;
  at: number;
  role: Role;
  /** Typed as two capitals, so it may be initials ("WE"). */
  caps: boolean;
  /** A filler word kept only in case it is initials. Never an unknown word. */
  soft: boolean;
}

interface Cand {
  n: AskName;
  label: string;
  strong: number[];
  weak: number[];
  full: boolean;
  rank: number;
  spell: Map<number, string>;
}

/** 0 no, 1 the same word (or its plural), 2 a short form, 3 one typo away.
 *  `typo` is how long both words must be before a typo is forgiven; 0 never. */
function hit(t: string, w: string, typo: number): number {
  if (t === w) return 1;
  if (/^\d/.test(t) || /^\d/.test(w)) return 0;
  if (t === w + 's' || w === t + 's') return 1;
  if (SHORT[t] === w) return 2;
  // Thumbs slip in the middle of a word, not on its first letter: "fiction"
  // is not a misspelled "diction".
  return typo > 0 && t[0] === w[0] && t.length >= typo && w.length >= typo && withinOneTypo(t, w) ? 3 : 0;
}
/** A short word one letter from a name is usually just another word:
 *  "bottle" is not Battle Hymn and "grace" is not "grade". A person's name
 *  needs more still, because "marcato" and "cabbage" are each one letter
 *  from a teacher. */
const TYPO_TITLE = 7;
const TYPO_PERSON = 8;

const nameWords = (label: string) =>
  askWords(label).replace(/[:/]/g, ' ').split(/\s+/).filter(w => w && !NAME_STOP.has(w));

/** "Dr. Grant Gilman" → gilman. "Verdi, Giuseppe" → verdi. Two people
 *  joined by a slash give two surnames. */
const surnames = (who: string) =>
  who.split(/\s*\/\s*|\s+and\s+|\s*&\s*/).flatMap(p => nameWords(p.includes(',') ? p.split(',')[0] : p).slice(-1));

function candidates(toks: Tok[], names: readonly AskName[], kinds: readonly AskNameKind[]): Cand[] {
  const pool = names.filter(n => kinds.includes(n.kind)).map(n => {
    const plain = [n.name, ...(n.also ?? [])];
    return {
      n, titles: plain.length,
      labels: [...plain, ...(n.by ?? [])],
      words: [...plain.map(nameWords), ...(n.by ?? []).map(surnames)],
    };
  });
  const live = toks.map((_, i) => i).filter(i => toks[i].role !== 'stop' && toks[i].role !== 'used');
  // A word that fits some name exactly is never also read as a typo of
  // another: "concerto" is not a misspelled "concert".
  const sure = new Set(live.filter(i => pool.some(p => p.words.some(ws => ws.some(w => hit(toks[i].w, w, 0))))));

  const out: Cand[] = [];
  for (const p of pool) {
    const strong = new Set<number>();
    const weak = new Set<number>();
    // First names and ordinary words: see `quiet` below.
    const faint = new Set<number>();
    const spell = new Map<number, string>();
    const perLabel: number[] = [];
    let full = false;
    p.words.forEach((ws, li) => {
      const person = li >= p.titles;
      const covered = new Set<string>();
      const whole: number[] = [];
      let n = 0;
      for (const i of live) {
        const t = toks[i];
        const free = t.role === 'free';
        // A common first name is far more often a classmate than a title,
        // and an ordinary word is far more often just a word. Neither picks
        // a thing alone, is a typo of one, or is initials. "James" does not
        // find the James K. Batten Room and "well" does not find a duet.
        const given = GIVEN_NAMES.has(t.w);
        const quiet = given || PLAIN.has(t.w);
        const initials = free && !quiet && ws.length > 1 && (t.w.length > 2 || t.caps) && t.w === ws.map(w => w[0]).join('');
        let word: string | undefined;
        if (!initials && !t.soft) {
          const typo = free && !quiet && !sure.has(i) ? (person ? TYPO_PERSON : TYPO_TITLE) : 0;
          for (const w of ws) {
            const h = hit(t.w, w, typo);
            if (!h) continue;
            word = w;
            if (h > 1) spell.set(i, w);
            break;
          }
        }
        if (!initials && !word) continue;
        n++;
        if (initials) ws.forEach(w => covered.add(w));
        else covered.add(word!);
        if (free && quiet) {
          faint.add(i);
          if (!given && !person) whole.push(i);
        } else if (free && (initials || t.w.length >= 4 || /^\d{3,}$/.test(t.w))) {
          strong.add(i);
        } else {
          // A scrap ("up", "go", "5") is in too many names to pick one alone.
          weak.add(i);
        }
      }
      perLabel[li] = n;
      if (ws.length > 0 && covered.size === new Set(ws).size) {
        full = true;
        // An ordinary word IS the thing when it is the thing's whole name:
        // a piece called "October", "Down a Country Lane" typed in full.
        for (const i of whole) strong.add(i);
      }
    });
    for (const i of strong) faint.delete(i);
    const beside = (i: number, among: number[]) => among.some(j => {
      if (j === i) return false;
      const [a, b] = i < j ? [i, j] : [j, i];
      return toks.slice(a + 1, b).every(t => t.role === 'stop');
    });
    // A first name or an ordinary word counts only beside a real word of the
    // same name ("carmen suite", "spring concert"). Two of them together, or
    // one beside a scrap, pick nothing: "go away", "james k".
    const real = [...strong, ...[...weak].filter(i => toks[i].role !== 'free')];
    for (const i of faint) if (beside(i, real)) weak.add(i);
    // A schedule noun or a scrap counts only beside another word of the same
    // name: "choir concert" yes, "the orchestra ... at the concert" no.
    const all = [...strong, ...weak];
    for (const i of [...weak]) if (!beside(i, all)) weak.delete(i);
    // One real word, or two ordinary ones together ("class piano").
    if (strong.size === 0 && weak.size < 2) continue;
    const best = perLabel[0] > 0 ? 0 : perLabel.indexOf(Math.max(...perLabel));
    out.push({ n: p.n, label: p.labels[best], strong: [...strong], weak: [...weak], full, rank: kinds.indexOf(p.n.kind), spell });
  }
  return out;
}

/** The names that fit best, all equally well. One means it is that thing. */
function best(cands: Cand[]): Cand[] {
  const key = (c: Cand) => [c.strong.length, c.weak.length, -c.rank, c.full ? 1 : 0];
  const cmp = (a: Cand, b: Cand) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
    return 0;
  };
  const sorted = [...cands].sort(cmp);
  return sorted.filter(c => cmp(c, sorted[0]) === 0);
}

/* ── The parse ────────────────────────────────────────────────────────── */

const none = (): AskParse => ({ intent: 'none', confident: false });

function ranges(re: RegExp | undefined, s: string, used: [number, number][], kept: [number, number][]) {
  if (!re) return;
  for (const m of s.matchAll(new RegExp(re.source, 'g'))) {
    if (!m[0]) continue;
    used.push([m.index, m.index + m[0].length]);
    const cap = m.slice(1).find(Boolean);
    if (cap) {
      const at = m.index + m[0].indexOf(cap);
      kept.push([at, at + cap.length]);
    }
  }
}

const MAX_LENGTH = 300;

/** What thumbs do to the commonest words, put right before anything reads
 *  them: "rehersal", "rehersing", and a parent's "my sons schedule" (the
 *  apostrophe is already gone), which is their own child's schedule. */
const respell = (s: string) => s
  .replace(/\brehe?a?r?s(?:al|el)(s?)\b/g, 'rehearsal$1')
  .replace(/\brehe?a?r?s(ing|ed)\b/g, 'rehears$1')
  .replace(/\b(my|our) (son|daughter|kid|child|student)s\b/g, '$1 $2');

/**
 * The public parser. Called with two arguments it knows no staff phrasing
 * and can never return a staff intent. The staff side passes its own tables
 * as `side`; use `parseStaffAsk` in src/director/ask/ rather than calling
 * this with three.
 */
export function parseAsk(typed: string, names: readonly AskName[], side?: AskStaffSide): AskParse {
  // Nobody's question is longer than this, and a pasted page must not cost
  // half a second.
  const text = typed.slice(0, MAX_LENGTH);
  const staff = !!side;
  const kindsOf = (i: AskIntent) => side?.kinds[i] ?? KINDS[i] ?? [];
  const mixedCase = /[a-z]/.test(text);
  const capsWords = new Set(mixedCase ? (text.match(/\b[A-Z]{2}\b/g) ?? []).map(w => w.toLowerCase()) : []);

  const cleaned = respell(askWords(text));
  if (!cleaned) return none();
  if (/^(?:whats|what is) next$|^que sigue$/.test(cleaned)) {
    return { intent: side?.widen.myDay ?? 'myDay', when: 'today', confident: true };
  }
  const date = takeDate(cleaned);
  const s = date.rest;
  if (date.unsure || (date.past && !staff)) return none();
  // "9th grade theory" is a class, not a mark.
  const marks = s.replace(/\b(?:\d+(?:st|nd|rd|th)|ninth|tenth|eleventh|twelfth) grade\b/g, '');
  if (!staff && (REFUSE.test(marks) || (WHO.test(s) && !WHO_OK.test(s)))) return none();

  const fits = (r: AskRule) => r.re.test(s) && !r.not?.test(s);
  const found = side?.rules.find(fits) ?? RULES.find(fits);
  // "What is 4/4" is a time signature. Two numbers and a slash are a date
  // only when the rest of the sentence is a question about a day.
  if (date.bareSlash && !found) return none();
  // Likewise "the 2nd" is a day only in a question about a day.
  if (date.bareDay && !(found && (DAY_QUESTION.has(found.intent) || found.intent.startsWith('staff')))) return none();
  // "Chamber Music", "Form & Analysis", "Violin Masterclass Sign-Up": when
  // the word that picked the intent turns out to be part of the name it
  // matched, it was never a question word. Read the sentence again as a name.
  let triggerInName = false;
  const first = read(found);
  if (found && triggerInName) {
    const again = read(undefined);
    if (again.confident) return again;
  }
  return first;

  function read(rule: AskRule | undefined): AskParse {
  let intent: AskIntent | undefined = rule?.intent;

  /* Sort every word into what it is doing in the sentence. */
  const trigger: [number, number][] = [];
  const used: [number, number][] = [];
  const kept: [number, number][] = [];
  if (rule) {
    ranges(rule.re, s, trigger, kept);
    ranges(rule.also, s, used, []);
    used.push(...trigger);
  }
  const inside = (at: number, rs: [number, number][]) => rs.some(([a, b]) => at >= a && at < b);
  // "The exam" is one exam, and the thing asked about. "A test" is any test.
  const anyOne = new Set<[number, number]>();
  const toks: Tok[] = [];
  for (const m of s.matchAll(/\S+/g)) {
    const w = m[0];
    const caps = capsWords.has(w);
    const prev = toks[toks.length - 1]?.w;
    let role: Role = 'free';
    let soft = false;
    const keptIn = kept.find(([a, b]) => m.index >= a && m.index < b);
    if (keptIn && m.index === keptIn[0] && intent === 'due' && prev && ARTICLE.has(prev)) anyOne.add(keptIn);
    if (keptIn && !anyOne.has(keptIn)) role = 'kept';
    else if (inside(m.index, used)) role = 'used';
    else if (FILLER.has(w)) { if (caps && !(prev && BEFORE_PRONOUN.has(prev))) soft = true; else role = 'stop'; }
    else if (ASK_INSTRUMENTS.has(w)) role = 'inst';
    else if (GENERIC.has(w)) role = 'weak';
    toks.push({ w, at: m.index, role, caps, soft });
  }

  /* Match the leftover words against the names. */
  const kinds = intent ? kindsOf(intent) : ANY_KIND;
  const cands = candidates(toks, names, kinds);
  // "Theater" is a class and three rooms. When a group and a place fit the
  // same word equally well there is no telling which was meant.
  const weight = (c: Cand) => c.strong.length * 10000 + c.weak.length * 10 + (c.full ? 1 : 0);
  const most = Math.max(...cands.map(weight));
  const top = cands.filter(c => weight(c) === most);
  const place = (c: Cand) => c.n.kind === 'room' || c.n.kind === 'venue';
  if (top.some(g => g.n.kind === 'group' && top.some(p => place(p) && p.strong.some(i => g.strong.includes(i))))) return none();
  const tied = best(cands);
  triggerInName = tied.some(c => {
    const ws = nameWords(c.n.name);
    return toks.some(t => t.role === 'used' && inside(t.at, trigger) && ws.some(w => hit(t.w, w, 0) === 1));
  });
  const nameIdx = new Set<number>();
  for (const c of tied) for (const i of [...c.strong, ...c.weak]) nameIdx.add(i);
  const claimed = new Set(nameIdx);
  // Two names in one sentence: fine from staff ("move symphony to chapman")
  // and around an "or". Anywhere else on the public side the second name is
  // a stray word, and stray words end the parse.
  const either = toks.some(t => t.role === 'free' && (t.w === 'or' || t.w === 'o'));
  if (staff || either) for (const c of cands) for (const i of c.strong) claimed.add(i);
  // "4302 or wolfson" names two things, so it is about neither.
  const lo = Math.min(...claimed);
  const hi = Math.max(...claimed);
  const choice = toks.some((t, i) => i > lo && i < hi && (t.w === 'or' || t.w === 'o'));
  const one = tied.length === 1 && !choice ? tied[0] : undefined;
  const kind = choice ? undefined : tied[0]?.n.kind;
  if (rule?.named && !kind) return none();

  const aboutIdx = new Set<number>(choice ? [] : nameIdx);
  const unknown: number[] = [];
  toks.forEach((t, i) => {
    if (t.role === 'kept') aboutIdx.add(i);
    if (claimed.has(i) || t.soft) return;
    if (t.role === 'free') {
      if (t.w === 'or' || t.w === 'o') return;
      if (KIND_WORD.has(t.w) && kinds.includes('group')) aboutIdx.add(i);
      else unknown.push(i);
    } else if (t.role === 'inst' && !(intent && INSTRUMENT_OK.has(intent))) {
      unknown.push(i);
    }
  });

  /* A word nothing accounts for: a topic, a person, or the end of the parse. */
  if (unknown.length > 0) {
    if (rule?.topic) {
      // A topic is a THING to search the announcements for: "a bass bow",
      // "stands and chairs", "all state". On the public side every word of
      // it must be one this module can vouch for: an ordinary word, a word
      // of some public name, or what follows "a" or "my". Anything else may
      // be a person ("results for <somebody>", "did anyone find <somebody>"),
      // and a first name always is.
      if (!staff) {
        const titled = new Set(candidates(toks, names, ANY_KIND).flatMap(c => [...c.strong, ...c.weak]));
        const ordinary = (w: string) => [w, w.replace(/s$/, '')].some(x => PLAIN.has(x) || GENERIC.has(x) || ASK_INSTRUMENTS.has(x));
        let after = false;
        const vouched = toks.map((t, i) => {
          if (DETERMINER.has(t.w)) { after = true; return true; }
          if (t.role === 'stop' || t.role === 'used') { after = false; return true; }
          const ok = !GIVEN_NAMES.has(t.w) && (after || titled.has(i) || ordinary(t.w));
          if (!ok) after = false;
          return ok;
        });
        if (unknown.some(i => !vouched[i])) return none();
      }
      unknown.forEach(i => aboutIdx.add(i));
    }
    else if (rule?.person) { /* a name: left alone */ }
    else if (side && intent === 'where' && aboutIdx.size === 0) intent = side.wherePerson;
    // "The winter concert" is on nobody's poster under that name, but it is
    // plainly a concert being asked about.
    else if (intent && kindsOf(intent) === ABOUT_CONCERT && unknown.every(i => SEASON.has(toks[i].w))) unknown.forEach(i => aboutIdx.add(i));
    else return none();
  }

  /* 4. Defaults, when the shape of the question gave nothing away. */
  const dated = !!date.when || date.next;
  if (!intent) {
    const named = kind ?? (aboutIdx.size > 0 ? 'group' : undefined);
    if (!named) intent = date.when ? 'myDay' : undefined;
    else if (named === 'group') intent = dated || WHEN_SHAPE.test(s) || !kind ? 'myDay' : 'group';
    else if (named === 'concert' || named === 'venue') intent = 'concert';
    // A piece and a day with nothing joining them could mean several things.
    else if (named === 'piece') intent = date.when ? undefined : 'piece';
    else if (named === 'form') intent = 'forms';
    else if (named === 'assignment') intent = 'due';
    // A room on a date is a question about the building, not about me.
    else intent = !dated ? 'where' : side?.roomOnDate;
    if (!intent) return none();
  }
  // Asking where a hall is, is asking about the concert there.
  if (intent === 'where' && kind === 'venue') intent = 'concert';

  /* The thing asked about. */
  let about: string | undefined;
  if (aboutIdx.size > 0) {
    if (one && [...aboutIdx].every(i => nameIdx.has(i))) {
      about = one.label;
    } else {
      const idx = [...aboutIdx];
      const spelled = (i: number) => {
        const w = tied[0]?.spell.get(i);
        return w && tied.every(c => c.spell.get(i) === w) ? w : toks[i].w;
      };
      about = toks
        .map((t, i) => (i >= Math.min(...idx) && i <= Math.max(...idx) && t.role !== 'used' ? spelled(i) : ''))
        .filter(Boolean)
        .join(' ');
    }
  }

  /* The date. */
  let when: AskWhen | undefined = date.when ?? (date.next ? 'next' : undefined);
  if (!when) {
    if (rule && rule.when !== undefined && rule.intent === intent) {
      when = rule.when ?? undefined;
    } else if (intent === 'playing' && /\b(?:concert|concierto)\b/.test(s)) {
      when = 'next';
    } else {
      const [bare, named] = side?.whenDefault[intent] ?? WHEN_DEFAULT[intent] ?? [];
      // A room is where, not what: "what are we rehearsing in chapman" is still today.
      const thing = !!about && !(intent === 'playing' && kind === 'room');
      when = intent === 'where' && kind === 'room' ? undefined : thing ? named : bare;
    }
  }

  if (side) intent = side.widen[intent] ?? intent;
  else if (intent.startsWith('staff')) return none();

  const out: AskParse = { intent, confident: true };
  if (when) out.when = when;
  if (about) out.about = about;
  if (one) out.match = one.n;
  return out;
  }
}
