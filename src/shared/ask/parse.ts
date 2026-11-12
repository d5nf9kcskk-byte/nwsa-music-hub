/**
 * Ask, the understanding half (#ask): what a person typed in, one typed
 * question out. No model, no network, no state kept between calls.
 * Design: docs/superpowers/specs/2026-11-11-hub2-integrated-design.md, 3.3.
 *
 * It reads a sentence in four passes, and the ORDER is the design:
 *   1. Date words come out first, from a closed table (English, Spanish, and
 *      what thumbs type). A month only counts with a day number beside it, so
 *      "Radetzky March" stays a piece and "Midnight Ball" stays a concert.
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
 * KNOWN LIMIT. A person whose first name is also a word in a group's or a
 * concert's name is read as that group: "what is florence playing" answers
 * about Souvenir de Florence. Nothing here can tell the two apart without a
 * list of people, which this module must never hold. The answer names what
 * it understood, and everything it can show is already public.
 *
 * Pure: no React, no Firestore, no org config. Relative imports carry `.ts`
 * so plain Node can load it. ask.selfcheck.ts runs it over the corpus.
 */

import type { AskIntent, AskWhen } from './corpus.ts';
import { normalizeText, withinOneTypo } from '../fuzzy.ts';

/** What kind of thing a name is. `room` is somewhere we rehearse; `venue` is
 *  somewhere we travel to perform, so "where is the Lyric" is a question
 *  about a concert and "wheres 4304" is a question about a door. */
export type AskNameKind = 'group' | 'concert' | 'assignment' | 'piece' | 'venue' | 'room' | 'form';

export interface AskName {
  kind: AskNameKind;
  name: string;
  /** Other words people find it by: a course code, a composer, a conductor. */
  also?: string[];
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

export interface AskOptions {
  /** 'public' (the default) can never return a staff intent. */
  side?: 'public' | 'staff';
}

/* ── Words ────────────────────────────────────────────────────────────── */

const set = (s: string) => new Set(s.split(' '));

/** Words that carry nothing. Deliberately short: see the header. */
const FILLER = set(
  'a about after al am an and any anything are at be by can could cual cuando day de del did do does donde ' +
  'r their them they u ur wat wen wut ' +
  'el en end ends es esta for from gonna has have hay he her hey hi him his hola hora how i if im in is it ' +
  'its just la las like lo look los me meet meets mi my need of ok on our over para please pls plz por ' +
  'que se she should so start starts still tengo thanks that the there this tiene time to un una us va ' +
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
const INSTRUMENT = set(
  'violin violins viola violas cello cellos bass basses flute flutes oboe oboes clarinet clarinets ' +
  'bassoon bassoons horn horns trumpet trumpets trombone trombones tuba tubas percussion piano harp ' +
  'guitar sax saxophone saxophones drums voice chelo violonchelo contrabajo flauta trompeta',
);
const INSTRUMENT_OK = new Set<AskIntent>(['lesson', 'seat', 'parts', 'due', 'howCopy', 'howSubmit']);
/** A kind of rehearsal, not a name: kept as the thing asked about. */
const KIND_WORD = set('sectional sectionals seccional seccionales masterclass masterclasses');
const ARTICLE = set('a an any un una');
const NAME_STOP = set('the of de la el a an and in for from at y no to with by up');

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
  ['sun', 'sunday|sun|domingo'],
];
const MONTHS = [
  'january|jan|enero|ene', 'february|feb|febrero', 'march|mar|marzo', 'april|apr|abril|abr',
  'may|mayo', 'june|jun|junio', 'july|jul|julio', 'august|aug|agosto', 'september|sept|sep|septiembre|setiembre',
  'october|oct|octubre', 'november|nov|noviembre', 'december|dec|diciembre|dic',
];
const MONTH = MONTHS.join('|');

type DateHit = AskWhen | 'strip' | 'past' | 'unsure';
const DATE_WORDS: [RegExp, DateHit][] = [
  [/\b\d{1,2}:\d{2}(?: ?[ap]m)?\b|\b\d{1,2} ?[ap]m\b/g, 'strip'],
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
  [/\btonight\b|\btonite\b|\b2nite\b|\besta noche\b/g, 'tonight'],
  [/\btoday\b|\b2day\b|\btdy\b|\bhoy\b|\bright now\b|\bnow\b|\bahora\b|\besta manana\b|\bafter school\b/g, 'today'],
  [/\btomorrow\b|\btomorow\b|\btommorow\b|\btommorrow\b|\btomorro\b|\btmrw\b|\btmr\b|\btmw\b|\b2morrow\b|\b2moro\b|\bmanana\b/g, 'tomorrow'],
  ...WEEKDAYS.map(([day, alts]): [RegExp, DateHit] =>
    [new RegExp(`\\b(?:(?:on|this|el|este|los) )?(?:${alts})\\b`, 'g'), `weekday:${day}` as AskWhen]),
];
const NEXT = /\b(?:next|proxim[oa]s?|siguiente|upcoming)\b/g;

interface DateRead { rest: string; when?: AskWhen; next: boolean; past: boolean; unsure: boolean }

function takeDate(text: string): DateRead {
  const found = new Set<AskWhen>();
  let past = false;
  let unsure = false;
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
  s = s.replace(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g, (all, m, d) => (dated(+m, +d) || dated(+d, +m) ? ' ' : all));
  // A month is a date only with a day number beside it: "dec 9", "9 de diciembre".
  s = s.replace(new RegExp(`\\b(${MONTH}) (\\d{1,2})(?:st|nd|rd|th)?\\b`, 'g'),
    (all, m, d) => (dated(monthOf(m), +d) ? ' ' : all));
  s = s.replace(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)? (?:de|of) (${MONTH})\\b`, 'g'),
    (all, d, m) => (dated(monthOf(m), +d) ? ' ' : all));
  for (const [re, hit] of DATE_WORDS.slice(1)) {
    s = s.replace(re, () => {
      if (hit === 'past') past = true;
      else if (hit === 'unsure') unsure = true;
      else if (hit !== 'strip') found.add(hit);
      return ' ';
    });
  }
  const next = s.search(NEXT) >= 0;
  s = s.replace(NEXT, ' ').replace(/[:/]/g, ' ').replace(/\s+/g, ' ').trim();
  // Two different days in one question is a question this cannot answer.
  return { rest: s, when: found.size === 1 ? [...found][0] : undefined, next, past, unsure: unsure || found.size > 1 };
}

/* ── 2. Intent ────────────────────────────────────────────────────────── */

interface Rule {
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
}

/** Staff-only facts. Refused outright on the public side. */
const REFUSE = /\b(?:grades?|notas?|calificacion(?:es)?|what did i get|marked|passing|failing|gpa)\b|^change\b/;
/** A "who" question is about other people, so the public side refuses it
 *  unless it is one of these, which ask about a group or about me. */
const WHO = /\b(?:who|whos|whose|quien|quienes)\b/;
const WHO_OK = /\bwho do i tell\b|\bwho(?:s| is) in\b|\bwho (?:conducts|teaches|directs|wrote|composed)\b|\bwho(?:s| is) my\b|\bwho has\b.*\bduty\b|\bquien (?:dirige|ensena|es mi)\b/;
const WHEN_SHAPE = /\b(?:when|whens|wen|what time|cuando|a que hora)\b/;

/** First match wins, so the order is the meaning: "is my lesson cancelled"
 *  is about the lesson, "where is the concert" is about the concert. */
const RULES: Rule[] = [
  { intent: 'glossary', re: /\bwhat does (.+) mean\b|\bque (?:significa|quiere decir) (.+)|^(?:whats|what is|que es) (?:a|an|un|una) (.+)$|^define (.+)$/ },

  { intent: 'howAbsence', re: /\b(?:sick|ill|enferm[oa])\b/, also: /\bout\b|\bhome\b/, when: 'today' },
  { intent: 'howAbsence', re: /\b(?:absent|absence|ausente|ausencia|faltar|leav(?:e|ing) early|salir temprano|appointment|cita|have to miss|gonna miss|miss (?:rehearsal|class|school)|wont be (?:at|in|there)|cant (?:come|make it))\b/, also: /\breport\b|\breportar\b|\bwho do i tell\b|\bdentist\b|\bdoctors?\b|\bschool\b|\bwill be\b/ },
  { intent: 'howSubmit', re: /\bturn(?:ed)? (?:it )?in\b|\b(?:re)?submit\b|\bupload(?:ed)?\b|\b(?:better|another) take\b|\bretake\b|\bcomo (?:entrego|subo|envio)\b/, also: /\b(?:send|video|playing|exam|examen|test)\b/ },
  { intent: 'howCheckin', re: /\bcheck(?:ed)? ?(?:in|out)\b|\bregistrar (?:mi )?llegada\b|\bhow many concerts have i (?:gone to|been to|attended)\b/, also: /\b(?:forgot|count|counted)\b/ },
  { intent: 'howCalendar', re: /\bcalendar\b|\bcalendario\b|\bsubscribe\b|\bon my phone\b/, also: /\b(?:add|get|schedule|google|apple|iphone)\b/ },
  { intent: 'howCopy', re: /\blost my (?:music|part|folder)\b|\b(?:a|another|a new) copy\b|\bcopy of my\b|\bpage turn\b|\bmissing (?:a page|pages)\b|\bperdi mi (?:musica|partitura)\b/, also: /\b(?:bad|part|music|get)\b/ },
  { intent: 'howAlerts', re: /\b(?:alerts?|alertas?|notifications?|notificaciones|notify|get a text|text me)\b/, also: /\bturn on\b|\bcancell?ed\b|\bget\b/ },
  { intent: 'howFindMe', re: /\bfind (?:my schedule|me)\b|\bnot me\b|\bwrong (?:person|student|name|kid)\b|\btwo kids\b|\b(?:other|another) (?:kids?|child|student|phone)\b|\bespanol\b|\bin spanish\b/, also: /\bin the program\b|\bsend\b|\bsee\b|\bschedule\b/ },

  { intent: 'required', re: /\b(?:required|mandatory|obligatori[oa]s?)\b|\b(?:have|need) to (?:go|attend)\b/, also: /\bhow many\b|\bgo\b|\battend\b/ },
  { intent: 'pickup', re: /\bpick ?up\b|\bpick (?:him|her|them) up\b|\brecog\w+\b|\brecojo\b|^(?:what time|when) is it over$|\b(?:concert|concierto|show|it) (?:ends?|finish(?:es)?|is over|lets? out|termina|acaba)\b/ },
  { intent: 'callTime', re: /\bcall(?: ?time)?\b|\b(?:have|need|supposed) to be (?:there|at)\b|\b(?:be|get) there\b|\barrive\b|\bllegar\b|\b(?:hora de )?llegada\b/ },
  { intent: 'dress', re: /\bwear(?:ing)?\b|\bdress(?: code)?\b(?! rehearsal)|\battire\b|\bconcert black\b|\bblack\b|\bme pongo\b|\bropa\b|\buniforme?\b/, also: /\bon stage\b/ },

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
  { intent: 'noSchool', re: /\b(?:is there|there is|theres|do we have|have|hay|tenemos) (?:school|clases|escuela)\b|\bschool (?:closed|open|off|cancell?ed)\b|\bis (mdc) open\b|\b((?:thanksgiving|winter|spring|summer|fall) break|thanksgiving|finals|quarter|semester|grading period|vacaciones)\b|\bbreak\b|\bday off\b/ },

  { intent: 'myDay', re: /\bam i playing\b/ },
  // "What should I practice", not "can I practice in 4304".
  { intent: 'playing', re: /\bwhat (?:should|do|can|shall) (?:i|we) (?:need to |have to )?practice\b|\bwhat to practice\b|\bque (?:debo |tengo que )?practicar\b/, when: 'thisWeek' },
  { intent: 'playing', re: /\b(?:what|which|program|concert) order\b|\border of\b/, also: /\bplaying\b/, when: 'next' },
  { intent: 'playing', re: /\brepertoire\b|\brepertorio\b|\brep\b|\bprograma?\b|\bsetlist\b|\bmusica?\b/, when: null },
  { intent: 'playing', re: /\brehears(?:ing|ed)\b|\bplay(?:ing)?\b|\btoca(?:mos|r|ndo)\b|\bensaya(?:r|ndo|mos)\b|\bpieces?\b|\bpiezas?\b|\bobras?\b|\bworking on\b/, also: /\bbeing\b/ },

  // More than one concert is a list, not "the next one".
  { intent: 'concert', re: /\bhow many concerts are left\b|\bconcerts\b|\bconciertos\b|\bcoming up\b/, when: null },
  { intent: 'concert', re: /\bconcert\b|\bconcierto\b|\bshows?\b|\brecitals?\b|\btickets?\b|\bboletos?\b|\bentradas?\b|\baddress\b|\bdireccion\b/, also: /\bmuch\b/ },

  { intent: 'group', re: /\bwho(?:s| is) in\b|\bwho (?:conducts|teaches|directs)\b|\bquien (?:dirige|ensena)\b/ },
  { intent: 'where', re: /\bare we in\b|\bestamos en\b/, when: 'today' },
  { intent: 'where', re: /\bwheres?\b|\bdonde\b|\b(?:what|which) room\b|\bsalon\b|\broom\b/ },
  { intent: 'myDay', re: /\bschedule\b|\bhorario\b|\brehearsals?\b|\bensayos?\b|\bget out\b|\bwhat do i have\b|\bdo (?:i|we) have\b/ },
];

/** The director's side. Tried first there, and never on the public side. */
const STAFF_RULES: Rule[] = [
  { intent: 'staffDo', re: /^take (?:roll|attendance)\b/, when: 'today' },
  { intent: 'staffDo', re: /^(?:cancel|move|add|post|excuse|create)\b|^new (?:form|announcement)\b|^(?:open )?(?:the )?gradebook\b/, also: /\bannouncement\b/, person: true },
  { intent: 'staffContact', re: /\b(?:call(?! time)|email|text|phone|contact)\b|\b(?:parents?|mom|dad|mother|father|guardians?)\b/, person: true },
  { intent: 'staffMissing', re: /\bwho (?:hasnt|has not|havent|have not|didnt|did not)(?: (?:turned in|submitted|signed|filled out|checked (?:in|out)|check (?:in|out)|sent|logged))?\b|\bwho (?:still )?owes\b|\bhavent (?:logged|taken)\b|\brolls?(?: are)? left\b|\bmissing\b/, also: /\bemergency contacts?\b|\brolls?\b/ },
  { intent: 'staffWaiting', re: /\bwaiting (?:on|for) me\b|\brequests?\b|\bapprovals?\b|\babsence reports?\b/, also: /\bcopy\b/ },
  { intent: 'staffWhosOut', re: /\bwho(?:s| is) (?:out|absent|excused|pulled(?: out)?)\b|\babsences\b|\bexcused\b|\bpulled out\b|\bquien(?:es)? faltan?\b/ },
  { intent: 'staffRoster', re: new RegExp(`\\broster\\b|\\b(?:seniors|juniors|sophomores|freshmen)\\b|\\bhow many in\\b|\\bwho studies with\\b|\\b(?:${[...INSTRUMENT].join('|')}) in\\b`), topic: true },
  { intent: 'staffWhereIs', re: /\bhere\b|\bin the building\b|\bon campus\b/, person: true },
  { intent: 'staffDay', re: /\bwhat(?:s| is) (?:in|on)\b|\bfree\b|\bwho(?:s| is) playing\b/ },
];
/** On the staff side a schedule question is about the whole building. */
const STAFF_MAP: Partial<Record<AskIntent, AskIntent>> = { myDay: 'staffDay', concert: 'staffDay', noSchool: 'staffDay' };

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
  staffWhereIs: ['today', 'today'],
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
  staffWhosOut: ['group', 'concert'],
  staffMissing: ['assignment', 'form', 'concert', 'group'],
  staffDay: ['group', 'room', 'concert', 'venue'],
  staffRoster: ['group'],
  staffContact: ['group'],
  staffDo: ['group', 'room', 'concert'],
};
/** How people name a concert that has another name on the poster. */
const SEASON = set('winter spring fall autumn summer holiday christmas invierno primavera otono verano navidad');

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

/** 0 no, 1 the same word (or its plural), 2 a short form, 3 one typo away. */
function hit(t: string, w: string, typo: boolean): number {
  if (t === w) return 1;
  if (/^\d/.test(t) || /^\d/.test(w)) return 0;
  if (t === w + 's' || w === t + 's') return 1;
  // ponytail: a short form is a word with at least four letters cut off
  // ("phil", "orch", "tchaik"). Cutting fewer is usually a different word
  // ("free" is not Freedom). A table of real nicknames if this guess wears thin.
  if (t.length >= 4 && w.length - t.length >= 4 && w.startsWith(t)) return 2;
  // Six letters before a typo is forgiven: at five, "grace" is a misspelled "grade".
  return typo && t.length >= 6 && w.length >= 6 && withinOneTypo(t, w) ? 3 : 0;
}

const nameWords = (label: string) =>
  askWords(label).replace(/[:/]/g, ' ').split(/\s+/).filter(w => w && !NAME_STOP.has(w));

function candidates(toks: Tok[], names: readonly AskName[], kinds: readonly AskNameKind[]): Cand[] {
  const pool = names.filter(n => kinds.includes(n.kind)).map(n => {
    const labels = [n.name, ...(n.also ?? [])];
    return { n, labels, words: labels.map(nameWords) };
  });
  const live = toks.map((_, i) => i).filter(i => toks[i].role !== 'stop' && toks[i].role !== 'used');
  // A word that fits some name exactly is never also read as a typo of
  // another: "concerto" is not a misspelled "concert".
  const sure = new Set(live.filter(i => pool.some(p => p.words.some(ws => ws.some(w => hit(toks[i].w, w, false))))));

  const out: Cand[] = [];
  for (const p of pool) {
    const strong = new Set<number>();
    const weak = new Set<number>();
    const spell = new Map<number, string>();
    const perLabel: number[] = [];
    let full = false;
    p.words.forEach((ws, li) => {
      const covered = new Set<string>();
      let n = 0;
      for (const i of live) {
        const t = toks[i];
        const free = t.role === 'free';
        const initials = free && ws.length > 1 && (t.w.length > 2 || t.caps) && t.w === ws.map(w => w[0]).join('');
        let word: string | undefined;
        if (!initials && !t.soft) {
          for (const w of ws) {
            const h = hit(t.w, w, free && !sure.has(i));
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
        // A scrap ("up", "go", "5") is in too many names to pick one alone.
        const sturdy = free && (initials || t.w.length >= 4 || /^\d{3,}$/.test(t.w));
        (sturdy ? strong : weak).add(i);
      }
      perLabel[li] = n;
      if (ws.length > 0 && covered.size === new Set(ws).size) full = true;
    });
    // An ordinary word counts only beside another word of the same name:
    // "choir concert" yes, "the orchestra ... at the concert" no.
    const all = [...strong, ...weak];
    const beside = (i: number) => all.some(j => {
      if (j === i) return false;
      const [a, b] = i < j ? [i, j] : [j, i];
      return toks.slice(a + 1, b).every(t => t.role === 'stop');
    });
    for (const i of [...weak]) if (!beside(i)) weak.delete(i);
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

export function parseAsk(text: string, names: readonly AskName[], opts: AskOptions = {}): AskParse {
  const staff = opts.side === 'staff';
  const mixedCase = /[a-z]/.test(text);
  const capsWords = new Set(mixedCase ? (text.match(/\b[A-Z]{2}\b/g) ?? []).map(w => w.toLowerCase()) : []);

  const cleaned = askWords(text);
  if (!cleaned) return none();
  if (/^(?:whats|what is) next$|^que sigue$/.test(cleaned)) {
    return { intent: staff ? 'staffDay' : 'myDay', when: 'today', confident: true };
  }
  const date = takeDate(cleaned);
  const s = date.rest;
  if (date.unsure || (date.past && !staff)) return none();
  // "9th grade theory" is a class, not a mark.
  const marks = s.replace(/\b(?:\d+(?:st|nd|rd|th)|ninth|tenth|eleventh|twelfth) grade\b/g, '');
  if (!staff && (REFUSE.test(marks) || (WHO.test(s) && !WHO_OK.test(s)))) return none();

  const found = (staff ? STAFF_RULES.find(r => r.re.test(s)) : undefined) ?? RULES.find(r => r.re.test(s));
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

  function read(rule: Rule | undefined): AskParse {
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
    else if (FILLER.has(w)) { if (caps) soft = true; else role = 'stop'; }
    else if (INSTRUMENT.has(w)) role = 'inst';
    else if (GENERIC.has(w)) role = 'weak';
    toks.push({ w, at: m.index, role, caps, soft });
  }

  /* Match the leftover words against the names. */
  const kinds = intent ? KINDS[intent] ?? [] : ANY_KIND;
  const cands = candidates(toks, names, kinds);
  const tied = best(cands);
  triggerInName = tied.some(c => {
    const ws = nameWords(c.n.name);
    return toks.some(t => t.role === 'used' && inside(t.at, trigger) && ws.some(w => hit(t.w, w, false) === 1));
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
    if (rule?.topic) unknown.forEach(i => aboutIdx.add(i));
    else if (rule?.person) { /* a name: left alone */ }
    else if (staff && intent === 'where' && aboutIdx.size === 0) intent = 'staffWhereIs';
    // "The winter concert" is on nobody's poster under that name, but it is
    // plainly a concert being asked about.
    else if (intent && KINDS[intent] === ABOUT_CONCERT && unknown.every(i => SEASON.has(toks[i].w))) unknown.forEach(i => aboutIdx.add(i));
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
    else intent = !dated ? 'where' : staff ? 'staffDay' : undefined;
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
      const [bare, named] = WHEN_DEFAULT[intent] ?? [];
      // A room is where, not what: "what are we rehearsing in chapman" is still today.
      const thing = !!about && !(intent === 'playing' && kind === 'room');
      when = intent === 'where' && kind === 'room' ? undefined : thing ? named : bare;
    }
  }

  if (staff) intent = STAFF_MAP[intent] ?? intent;
  else if (intent.startsWith('staff')) return none();

  const out: AskParse = { intent, confident: true };
  if (when) out.when = when;
  if (about) out.about = about;
  if (one) out.match = one.n;
  return out;
  }
}
