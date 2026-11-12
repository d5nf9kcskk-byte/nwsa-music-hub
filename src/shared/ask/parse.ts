/**
 * Ask, the understanding half (#ask): what a person typed in, one typed
 * question out. No model, no network, no state kept between calls.
 * Design: docs/superpowers/specs/2026-11-11-hub2-integrated-design.md, 3.3.
 *
 * THREE OUTCOMES, and the parser is built for the first one being RIGHT:
 *   1. a confident answer (`confident: true`)
 *   2. "did you mean" (`confident: false`, `suggestions` not empty)
 *   3. nothing (`suggestions` empty): the ordinary search results show
 * A miss costs nothing, because the person still gets search results. A
 * confident wrong answer is the only expensive outcome. So nothing here
 * guesses. A sentence is answered only when EVERY word in it is accounted
 * for, and each of the four passes refuses rather than trims:
 *
 *   1. DATES come out first, from a closed table. A date phrase the table
 *      cannot read in full is no date at all: "the week after next" is not
 *      "this week", because "after" is a word nothing accounts for.
 *   2. NAMES are matched against what the caller passes in, and a match
 *      counts only on strong evidence: the whole name, or two of its
 *      distinctive words. One word out of a long title, a surname, a typo,
 *      a bare number and a tie are suggestions, never answers. A one-word
 *      name counts only when it is not an ordinary word and the question
 *      asks about that kind of thing. A group's short name ("Camerata")
 *      must therefore be passed in as an `also`.
 *   3. EVERY intent rule is tried, not the first that fits. When two
 *      different intents fire the result is not confident, unless that pair
 *      is in PRECEDENCE with a sentence that says why. A longer phrase wins
 *      over a shorter one inside it ("do we have school" over "do we have").
 *   4. What is LEFT must be frame words (FRAME is deliberately tiny). "How",
 *      "if", "after", "up", "out", "did" are not frame: they change what a
 *      sentence means, so a rule has to claim them or the parse ends.
 *
 * PEOPLE. The public side never answers about a person's record. Three
 * guards that do not depend on word order, article or language: a grade
 * word ends the parse; a third person ("my son", "she", "mi hijo") with the
 * past tense, or with "is ... at/in/here/absent", ends it ("is my son at
 * rehearsal", "my son is at rehearsal?", "mi hijo esta en el ensayo"); and a
 * word nothing accounts for ends it, which is what a classmate's name is.
 * This module holds no list of people.
 *
 * Pure: no React, no Firestore, no org config. Relative imports carry `.ts`
 * so plain Node can load it. ask.selfcheck.ts runs it over the corpus, a
 * hostile kit, and generated classes of question it must never answer.
 */

import type { AskIntent, AskWhen } from './corpus.ts';
import { normalizeText, withinOneTypo } from '../fuzzy.ts';
import { GIVEN_NAMES } from './givenNames.ts';
import { COMMON_WORDS } from './commonWords.ts';

/** What kind of thing a name is. `room` is somewhere we rehearse; `venue` is
 *  somewhere we travel to perform. `term` is a word the Hub's own glossary
 *  defines: "what does ... mean" is answered for those and nothing else. */
export type AskNameKind = 'group' | 'concert' | 'assignment' | 'piece' | 'venue' | 'room' | 'form' | 'term';

export interface AskName {
  kind: AskNameKind;
  name: string;
  /** Other names people find it by, each a whole name of its own: a course
   *  code, a room number, the short name everyone uses ("Camerata"). */
  also?: string[];
  /** The people on it: conductor, teacher, composer. Found by surname, and
   *  only ever as a suggestion: a surname alone never answers. */
  by?: string[];
  /** The caller's own handle. Never read here; handed back on `match`. */
  id?: string;
}

/** One way of reading the sentence. */
export interface AskReading {
  intent: AskIntent;
  when?: AskWhen;
  /** What it is about, always clean: the matched thing's own name, or a
   *  word from a closed table ("winter", "finals", "sectional"), or the
   *  search topic, or (staff only) the person's name as typed. */
  about?: string;
  /** The caller's own record, when a name matched. */
  match?: AskName;
  /** Staff only: the person named in the question, as typed. */
  person?: string;
}

export interface AskParse extends AskReading {
  /** False means no answer: `intent` is 'none'. */
  confident: boolean;
  /** "Did you mean": readings that fit but were not certain. Empty when
   *  confident, and empty when there is nothing to offer. */
  suggestions: AskReading[];
}

export interface AskRule {
  intent: AskIntent;
  /** The words that give the question away. A capture group marks words
   *  that are ALSO the thing asked about ("playing exam", "finals"). */
  re: RegExp;
  /** Other words that belong to this shape of question and mean nothing more. */
  also?: RegExp;
  /** Fires only when this is in the sentence too; those words are claimed. */
  with?: RegExp;
  /** Fires only in a "when" or "what time" question. */
  whenShape?: boolean;
  /** The date when no date word was typed. null = none. Left out = the
   *  intent's own default (WHEN_DEFAULT). */
  when?: AskWhen | null;
  /** Leftover words are the topic to search for. */
  topic?: boolean;
  /** Staff only: leftover words shaped like a name are a person. */
  person?: boolean;
  /** Means this only beside a named thing, a schedule noun or a person. */
  thing?: boolean;
}

/** [the intent that wins, the one it wins over, a sentence that shows why]. */
export type AskPrecedence = [AskIntent, AskIntent, string];

/** Everything the staff side adds. It lives in src/director/ask/ (design
 *  3.8), so the public bundle carries no staff phrasing at all. */
export interface AskStaffSide {
  rules: AskRule[];
  precedence: AskPrecedence[];
  kinds: Partial<Record<AskIntent, AskNameKind[]>>;
  whenDefault: Partial<Record<AskIntent, [AskWhen | undefined, AskWhen | undefined]>>;
  /** Public intents that mean something wider when staff ask. */
  widen: Partial<Record<AskIntent, AskIntent>>;
  /** "Where is <a name>": a person. */
  wherePerson: AskIntent;
  /** A room and a date with nothing else. */
  roomOnDate: AskIntent;
  /** Staff words that are a whole question typed alone ("requests"). */
  oneWord: string[];
}

/* ── Words ────────────────────────────────────────────────────────────── */

const set = (s: string) => new Set(s.split(' '));

/** Words that carry nothing, and the ONLY words that may go unclaimed.
 *  Deliberately tiny. Not here on purpose: how, why, who, where, if, or,
 *  can, need, want, about, with, from, after, before, up, out, over, back,
 *  did, was, get, go. Each of those changes the meaning, so a rule must
 *  claim it. */
const FRAME = set(
  'a an the is are am be do does i me my we our us it its this that there ' +
  'what whats which when whens wen wat wut at in on for to of and ' +
  'please pls plz thanks thank hi hey hello ok have has should would ' +
  'you your u ur r he she her his him they their them son daughter kid kids child student ' +
  'any anything time im ' +
  'el la los las un una es esta estan yo mi mis que cual cuando al de del en para por y ' +
  'hay tengo tiene tenemos hola gracias hora hijo hija se va vamos voy',
);
/** A preposition must lead somewhere. Left hanging ("sign in", "show up at")
 *  it is a different verb, and a word nothing accounts for. */
const PREPS = set('at in on for to of de del en para por');
const AFTER_PREP = set('the a an my our your his her their this that el la los las mi un una');
/** An instrument qualifies a lesson, a seat or a part and nothing else. */
export const ASK_INSTRUMENTS = set(
  'violin violins viola violas cello cellos bass basses flute flutes oboe oboes clarinet clarinets ' +
  'bassoon bassoons horn horns trumpet trumpets trombone trombones tuba tubas percussion piano harp ' +
  'guitar sax saxophone saxophones drums voice chelo violonchelo contrabajo flauta trompeta',
);
const INSTRUMENT_OK = new Set<AskIntent>(['lesson', 'seat', 'parts', 'due', 'howCopy', 'howSubmit']);
/** The ordinary things on a schedule. Never what tells two names apart. */
const NOUNS = set(
  'rehearsal rehearsals class classes concert concerts concierto conciertos ensayo ensayos clase clases ' +
  'music musica exam exams test tests lesson lessons form forms part parts recital recitals school show ' +
  'shows playing schedule program sectional sectionals masterclass masterclasses room',
);
const ARTICLE = set('a an any un una');
/** What comes before a thing, never before a person: "a bass bow", "my folder". */
const DETERMINER = set('a an the my our some any un una el la mi');
/** "Are WE", "do WE": a pronoun somebody typed loudly, not Wind Ensemble. */
const BEFORE_PRONOUN = set('are do did can should will would could shall were have dont cant');
const NAME_STOP = set('the of de la el a an and in for from at y no to with by up');
/** How people name a concert that has another name on the poster. */
const SEASON = set('winter spring fall autumn summer holiday christmas invierno primavera otono verano navidad');
/** Word-level short forms. Anything looser is a suggestion at best. */
const SHORT: Record<string, string> = {
  phil: 'philharmonic', orch: 'orchestra', symph: 'symphony', ens: 'ensemble', tchaik: 'tchaikovsky',
  midnite: 'midnight', nite: 'night', xmas: 'christmas',
};
/** "When does it start", "what time is it over": only in a when question. */
const TIMING = set('start starts begin begins end ends meet meets over finish finishes empieza comienza termina acaba');
const TIMED = new Set<AskIntent>(['myDay', 'concert', 'lesson', 'noSchool', 'pickup', 'callTime']);
/** The words that are a whole question typed alone. Any other single word
 *  ("play", "sign", "black", "room") is a keyword to search for: the reading
 *  is offered, not answered. */
const ONE_WORD = set(
  'schedule horario rehearsal ensayo lesson lessons concert concerts concierto conciertos forms formularios ' +
  'hw homework tarea syllabus handbook announcements anuncios news novedades noticias repertoire repertorio ' +
  'bowings fingerings scales holidays',
);

/** Lower case, no accents, no punctuation. ':' and '/' survive for dates. */
export function askWords(s: string): string {
  return normalizeText(s)
    .replace(/['’‘`´]/g, '')
    .replace(/[^a-z0-9:/]+/g, ' ')
    .replace(/\bmaster class/g, 'masterclass')
    .trim();
}

/* ── 1. Dates ─────────────────────────────────────────────────────────── */

/** [day, the spellings that are only ever the day, the short form that is
 *  also a word ("sat", "sun", "wed") and counts only where a day belongs]. */
const WEEKDAYS: [string, string, string][] = [
  ['mon', 'monday|lunes', 'mon'],
  ['tue', 'tuesday|tuseday|tues|martes', 'tue'],
  ['wed', 'wednesday|wensday|wednsday|weds|miercoles', 'wed'],
  ['thu', 'thursday|thrusday|thurs|thur|jueves', 'thu'],
  ['fri', 'friday|firday|viernes', 'fri'],
  ['sat', 'saturday|saterday|sabado', 'sat'],
  ['sun', 'sunday', 'sun'],
];
const ANY_DAY = WEEKDAYS.map(([, sure, short]) => `${sure}|${short}`).join('|');
const MONTHS = [
  'january|jan|enero|ene', 'february|feb|febrero', 'march|mar|marzo', 'april|apr|abril|abr',
  'may|mayo', 'june|jun|junio', 'july|jul|julio', 'august|aug|agosto', 'september|sept|sep|septiembre|setiembre',
  'october|oct|octubre', 'november|nov|noviembre', 'december|dec|diciembre|dic',
];
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH = MONTHS.join('|');
/** Words that are something else first: an ordinary word, a month, a
 *  weekday, a season. A helper, not the defence: see `strength`. */
const PLAIN = new Set([
  ...COMMON_WORDS, ...SEASON,
  ...MONTHS.flatMap(m => m.split('|')), ...ANY_DAY.split('|'), 'domingo',
]);
/** Where a date word was. */
const WAS_DATE = ' ~ ';
const TIME_OF_DAY = /~\s+(?:(?:in|en|por|de|a|at)\s+(?:the\s+|la\s+)?)?(?:night|nite|morning|afternoon|evening|noche|tarde)\b/g;
const NEXT_WORD = 'next|nxt|upcoming|proxim[oa]s?|siguiente';

type DateHit = AskWhen | 'strip' | 'past' | 'unsure';
const DATE_WORDS: [RegExp, DateHit][] = [
  [/\b\d{1,2}:\d{2}(?: ?[ap]m)?\b|\b\d{1,2} ?[ap]m\b|\b(?:at|a las?) \d{1,2}\b(?![/:])/g, 'strip'],
  // Days AskWhen has no word for. Reading "pasado mañana" as tomorrow would
  // be wrong with confidence, so these end the parse instead.
  [/\bpasado manana\b|\bday after tomorrow\b|\bday before yesterday\b|\banteayer\b/g, 'unsure'],
  // "Next friday" is this coming Friday to some people and the one after to
  // others, however "next" is spelled and whichever side of the day it sits.
  [new RegExp(`\\b(?:${NEXT_WORD}|(?:this )?coming) (?:${ANY_DAY})\\b|\\b(?:${ANY_DAY}) (?:que viene|proxim[oa]|siguiente|after next)\\b`, 'g'), 'unsure'],
  [/\byesterday\b|\bayer\b/g, 'yesterday'],
  [/\blast night\b|\banoche\b/g, 'lastNight'],
  [/\blast week\b|\bla semana pasada\b/g, 'lastWeek'],
  [/\blast (?:month|time|year)\b/g, 'past'],
  [/\bthis year\b|\beste ano\b|\b(?:por|en) la manana\b/g, 'strip'],
  [/\b(?:la )?(?:proxima|siguiente) semana\b|\bla semana que viene\b|\bne?xt week\b/g, 'nextWeek'],
  [/\b(?:esta|this|the|my|mi) (?:semana|week)\b/g, 'thisWeek'],
  [/\b(?:(?:this|the|el|este) )?(?:weekend|wknd|fin de semana|finde)\b/g, 'weekend'],
  [/\btonight\b|\btonite\b|\b2nite\b|\besta noche\b|\bthis evening\b|\bhoy (?:en|por|a) la noche\b/g, 'tonight'],
  [/\btoday\b|\b2day\b|\btdy\b|\bhoy\b|\bright now\b|\bnow\b|\bahora\b|\besta manana\b|\besta tarde\b|\bthis (?:morning|afternoon)\b|\bafter school\b/g, 'today'],
  [/\btomorrow\b|\btomorow\b|\btommorow\b|\btommorrow\b|\btomorro\b|\btmrw\b|\btmr\b|\btmw\b|\b2morrow\b|\b2moro\b|\bmanana\b/g, 'tomorrow'],
  // Domingo is also a man's name, so it is Sunday only with its article.
  [/\b(?:el|este|los) domingo\b/g, 'weekday:sun'],
  ...WEEKDAYS.map(([day, sure]): [RegExp, DateHit] =>
    [new RegExp(`\\b(?:(?:on|this|el|este|los) )?(?:${sure})\\b`, 'g'), `weekday:${day}` as AskWhen]),
];
const PAST_WHEN = new Set<AskWhen>(['yesterday', 'lastNight', 'lastWeek']);
/** "Next" names the one still to come, but "next to" is somewhere else. */
const NEXT = new RegExp(`\\b(?:${NEXT_WORD})\\b(?! (?:to|of|door)\\b)`, 'g');

interface DateRead {
  /** What is left, with `~` where a date word was. */
  rest: string;
  when?: AskWhen;
  next: boolean;
  /** About a day behind us. Staff may ask; the public side may not. */
  past: boolean;
  /** A date was typed and this cannot say which. */
  unsure: boolean;
  /** "12/9" with nothing saying it is a day: maybe a time signature. */
  bareSlash: boolean;
  /** "the 2nd" inside a longer sentence: a day only in a question about one. */
  bareDay: boolean;
}

function takeDate(text: string): DateRead {
  const found = new Set<AskWhen>();
  let past = false;
  let unsure = false;
  let bareSlash = false;
  let bareDay = false;
  const dated = (m: number, d: number) => {
    if (m < 1 || m > 12 || d < 1 || d > MONTH_DAYS[m - 1]) return false;
    found.add(`date:${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    return true;
  };
  const monthOf = (w: string) => MONTHS.findIndex(m => m.split('|').includes(w)) + 1;

  // "Sat" is also what somebody did in a chair, and "the SAT" is a test.
  // "May I" is manners, not the month.
  let s = text
    .replace(/^may i\b/, 'can i')
    .replace(/\b(i|we|he|she|they|you|have|has|had) sat\b/g, '$1 sit')
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
  // "In march" is the month, and so is "the december concert". Without
  // either it stays a word, so "Radetzky March" is still a piece. Not "march"
  // or "may" before "concert": those two are also words.
  const month = (_all: string, m: string) => {
    found.add(`month:${String(monthOf(m)).padStart(2, '0')}`);
    return WAS_DATE;
  };
  s = s.replace(new RegExp(`\\b(?:in|en|during|durante) (${MONTH})\\b`, 'g'), month);
  s = s.replace(new RegExp(`\\b(?!march\\b|may\\b|mar\\b)(${MONTH}) (?=(?:concert|concierto|recital|show)s?\\b)`, 'g'), month);
  // "The 15th" is the next 15th, but only as the last thing said: "the 5th
  // symphony" and "9th grade" are not days. And unless it is all that was
  // said, only in a question about a day (`bareDay`).
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
  // The short forms are words too ("sat test", "wed like to", "the sun"),
  // so they are a day only where a day belongs: after "on" or "this", as
  // the last thing said, or before a time.
  for (const [day, , short] of WEEKDAYS) {
    s = s.replace(new RegExp(`\\b(on |this |el )?${short}\\b`, 'g'), (all, lead, at: number, whole: string) => {
      if (!lead && !/^(?: ~| \d|\s*$)/.test(whole.slice(at + all.length))) return all;
      found.add(`weekday:${day}` as AskWhen);
      return WAS_DATE;
    });
  }
  // "Friday night", "tomorrow morning": the day is the date, and the time of
  // day is not a word in anybody's title.
  s = s.replace(TIME_OF_DAY, WAS_DATE);
  // A date that goes on ("the week of the concert", "friday of finals") is
  // a phrase this table does not hold. Reading only the part it knows would
  // be a different day.
  if (/~\s+(?:of|de|del)\s+(?!~)\S/.test(s)) unsure = true;
  const next = s.search(NEXT) >= 0;
  s = s.replace(NEXT, WAS_DATE).replace(/[:/]/g, ' ').replace(/\s+/g, ' ').trim();
  const when = found.size === 1 ? [...found][0] : undefined;
  return {
    rest: s, when, next, bareSlash, bareDay,
    past: past || (!!when && PAST_WHEN.has(when)),
    // Two different days in one question is a question this cannot answer.
    unsure: unsure || found.size > 1,
  };
}

/* ── 2. Names ─────────────────────────────────────────────────────────── */

interface Tok {
  w: string;
  frame: boolean;
  /** A date word came right after it. */
  dateAfter: boolean;
  /** A frame word typed as two capitals: maybe a short name ("WE"). */
  loud: boolean;
}

/** One label of one name, and the words of the sentence that fit it. */
interface Found {
  n: AskName;
  /** A person on the thing (`by`), not one of its names. */
  person: boolean;
  /** The tokens that hit, in order. */
  hits: number[];
  /** Every word of the label, in order, with nothing but frame words between. */
  whole: boolean;
  /** How many words the label has. */
  words: number;
  /** Hits that are distinctive words: not ordinary, not a number, not a noun. */
  distinctive: number;
  /** Hits that were a plural or a short form, not the word itself. */
  loose: number;
  typo: boolean;
  /** Every word that hit is an ordinary one. */
  plain: boolean;
}

/** 0 no, 1 the same word, 2 its plural or a short form, 3 one typo away. */
function hit(t: string, w: string, typo: number): number {
  if (t === w) return 1;
  if (/^\d/.test(t) || /^\d/.test(w)) return 0;
  if (t === w + 's' || w === t + 's' || SHORT[t] === w) return 2;
  // Thumbs slip in the middle of a word, not on its first letter.
  return typo > 0 && t[0] === w[0] && t.length >= typo && w.length >= typo && withinOneTypo(t, w) ? 3 : 0;
}
const TYPO_TITLE = 7;
const TYPO_PERSON = 8;

const ordinary = (w: string) =>
  w.length < 3 || /^\d{1,2}$/.test(w) || PLAIN.has(w) || GIVEN_NAMES.has(w) || FRAME.has(w) || NOUNS.has(w) ||
  ASK_INSTRUMENTS.has(w) || NAME_STOP.has(w);
const distinctive = (w: string) => !ordinary(w) && (w.length >= 4 || /^\d{3,}$/.test(w));

/** The words of a name that tell it apart. A name that is nothing but
 *  frame words ("WE") keeps them: it is still a name. */
const labelWords = (label: string) => {
  const all = askWords(label).replace(/[:/]/g, ' ').split(/\s+/).filter(Boolean);
  const telling = all.filter(w => !NAME_STOP.has(w) && !FRAME.has(w));
  return telling.length > 0 ? telling : all;
};

/** "Dr. Grant Gilman" → gilman. "Verdi, Giuseppe" → verdi. Two people
 *  joined by a slash give two surnames. */
const surnames = (who: string) =>
  who.split(/\s*\/\s*|\s+and\s+|\s*&\s*/).flatMap(p => labelWords(p.includes(',') ? p.split(',')[0] : p).slice(-1));

/** Every label of every name against the sentence. No judgement here about
 *  whether a fit is good enough: that is `strength`, and it depends on what
 *  the question turned out to be. */
function findNames(toks: Tok[], names: readonly AskName[]): Found[] {
  const skip = (t: Tok) => (t.frame && !t.loud) || NAME_STOP.has(t.w);
  const out: Found[] = [];
  for (const n of names) {
    const titles = [n.name, ...(n.also ?? [])].map(labelWords);
    const people = (n.by ?? []).flatMap(surnames).map(w => [w]);
    [...titles, ...people].forEach((ws, li) => {
      if (ws.length === 0) return;
      const person = li >= titles.length;
      const bests: Found[] = [];
      let run: { i: number; h: number; at: number }[] = [];
      const close = () => {
        if (run.length === 0) return;
        const hits = run.map(r => r.i);
        const whole = run.length === ws.length && run.every((r, k) => r.at === k && r.h < 3);
        const f: Found = {
          n, person, hits, whole, words: ws.length,
          distinctive: run.filter(r => r.h < 3 && distinctive(toks[r.i].w)).length,
          loose: run.filter(r => r.h === 2).length,
          typo: run.some(r => r.h === 3),
          plain: run.every(r => !toks[r.i].loud && ordinary(toks[r.i].w)),
        };
        const score = (x: Found) => (x.whole ? 1000 : 0) + x.distinctive * 100 + x.hits.length * 10 - x.loose;
        if (bests.length === 0 || score(f) > score(bests[0])) bests[0] = f;
        run = [];
      };
      toks.forEach((t, i) => {
        // A loud frame word ("WE") is only ever a whole one-word name.
        if (t.loud) { if (ws.length === 1 && ws[0] === t.w) run.push({ i, h: 1, at: 0 }); return; }
        if (skip(t)) return;
        const used = new Set(run.map(r => r.at));
        let at = -1;
        let h = 0;
        const typo = GIVEN_NAMES.has(t.w) || PLAIN.has(t.w) ? 0 : person ? TYPO_PERSON : TYPO_TITLE;
        ws.forEach((w, k) => {
          if (h === 1 || used.has(k)) return;
          const x = hit(t.w, w, typo);
          if (x && (!h || x < h)) { h = x; at = k; }
        });
        if (h) run.push({ i, h, at });
        else close();
      });
      close();
      out.push(...bests);
    });
  }
  return out;
}

/** How good a fit is: 2 the whole name, 1 two distinctive words of it,
 *  0 a suggestion at best. `shaped` says the question asks about a thing of
 *  this kind, which a one-word name needs before it is believed. */
function strength(f: Found, shaped: boolean): 0 | 1 | 2 {
  if (f.person || f.typo) return 0;
  if (f.whole) {
    if (f.words === 1) return !f.plain && shaped ? 2 : 0;
    return f.plain && !shaped ? 0 : 2;
  }
  return f.distinctive >= 2 ? 1 : 0;
}

/* ── 3. Intent ────────────────────────────────────────────────────────── */

/** Staff-only facts, refused outright on the public side whoever asks. */
const REFUSE = new RegExp([
  /\b(?:grades?|notas?|calificacion(?:es)?|what did i get|marked|passing|failing|gpa|scores?|attendance|asistencia|tardies|absences)\b/.source,
  /\b(?:exam|test|quiz|examen)\w* results?\b|\bresults? (?:of|for|on|from) (?:the |my |his |her )?(?:playing )?(?:exam|test|quiz)/.source,
  /\b(?:my|his|her|their|mis?|sus?) (?:results?|resultados?)\b/.source,
  /^change\b/.source,
  // Somebody's contact details. Only "address" has a public meaning, and
  // only for a place: see the concert rule.
  /\b(?:phone|cell|telefono|celular) ?(?:numbers?|numeros?|#)|\bnumero de (?:telefono|celular)\b|\b(?:email|e mail|telefono|celular|correo|contact info)\b/.source,
].join('|'));
/** A "who" question is about other people, so the public side refuses it
 *  unless it is one of these, which ask about a group or about me. */
const WHO = /\b(?:who|whos|whose|quien|quienes)\b/;
const WHO_OK = /\bwho do i tell\b|\bwho(?:s| is) in\b|\bwho (?:conducts|teaches|directs|wrote|composed)\b|\bwho(?:s| is) my\b|\bwho has\b.*\bduty\b|\bquien (?:dirige|ensena|es mi)\b/;
const WHEN_SHAPE = /\b(?:when|whens|wen|what time|what day|which day|cuando|a que hora|que dia)\b/g;
/** "How do I": only ever the start of a how-to question. */
const HOW = /\bhow (?:do|can|should) (?:i|we)\b|\bcomo\b/g;
const CAN = /\b(?:can|could)\b|\bi need\b/g;

/* People, on the public side. */
/** Somebody other than the person typing, as the SUBJECT of the sentence. */
const SUBJECT = set('he she they ella ellos');
const KIN = set('son daughter kid kids child children student students boy girl brother sister hijo hija hijos hijas nino nina');
/** After one of these a kin word owns the noun ("my son's lesson"): not a subject. */
const OWNED = set(
  'schedule rehearsal rehearsals lesson lessons class classes concert concerts exam exams test teacher part parts ' +
  'music seat chair form forms horario ensayo clase concierto leccion examen recital stand calendar',
);
const COPULA = set('is are esta estan');
/** What may be asked about somebody else: what they HAVE and what is expected of them. */
const SCHEDULE_VERB = set('have has tiene need needs supposed play plays playing performing wear sit required get pick pickup recojo recoger');
/** A report, not a question about the roll: "my son is sick". */
const REPORT = /\b(?:sick|ill|enferm[oa])\b|\b(?:will|wont|gonna|going to) be\b|\bcant\b|\bno pued[eo]\b|\bhave to miss\b|\bappointment\b|\bcita\b|\bleav(?:e|ing) early\b|\bwho do i tell\b|\breport(?:o|ar)?\b/;
/** The past: what happened is a record. */
const PAST = set(
  'did didnt was were wasnt werent had been went came got missed skipped attended showed arrived made passed ' +
  'failed finished turned submitted uploaded checked sent signed took happened fue fueron estuvo estaba falto llego vino entrego',
);
/** Asked of oneself with "am": today's roll. */
const ROLL = set('absent ausente late tardy excused present presente marked');

/** Every rule is tried. Two different intents firing is a conflict unless
 *  PRECEDENCE settles that pair; order here only matters within one intent. */
const RULES: AskRule[] = [
  // "ill" alone is how thumbs type "I'll": "ill be there" is a promise to come.
  { intent: 'howAbsence', re: /\b(?:sick|enferm[oa])\b|\b(?:im|i am|is|feel|feels|feeling) ill\b/, also: /\bout\b|\bhome\b/, when: 'today' },
  { intent: 'howAbsence', re: /\b(?:absent|absence|ausente|ausencia|faltar|leav(?:e|ing) early|salir temprano|appointment|cita|have to miss|gonna miss|miss (?:rehearsal|class|school)|wont be (?:at|in|there)|cant (?:come|go|attend|make it|be there)|no pued[eo] (?:ir|venir|asistir|llegar))\b/, also: /\breport(?:o|ar)?\b|\bwho do i tell\b|\bdentist\b|\bdoctors?\b|\bschool\b|\b(?:will|gonna) be\b/ },
  { intent: 'howSubmit', re: /\bturn(?:ed)? (?:it )?in\b|\b(?:re)?submit\b|\bupload(?:ed)?\b|\b(?:better|another) take\b|\bretake\b|\b(?:entrego|subo|envio)\b/, also: /\bsend\b|\bvideo\b|\bdid\b/ },
  { intent: 'howCheckin', re: /\bcheck(?:ed)? ?(?:in|out)\b|\bregistrar (?:mi )?llegada\b|\bhow many concerts have i (?:gone to|been to|attended)\b/, also: /\bforgot\b|\bcount(?:ed)?\b|\bdid\b/ },
  // Getting the schedule INTO a calendar. "What is on my calendar" is not this.
  { intent: 'howCalendar', re: /\bsubscribe\b|\badd (?:\w+ )?to (?:my )?(?:calendar|calendario|phone)\b|\b(?:schedule )?on my phone\b|\b(?:google|apple|iphone|outlook) calendar\b|\bcalendar (?:feed|link|subscription)\b/, also: /\bget\b|\bcalendar\b|\bcalendario\b/ },
  { intent: 'howCopy', re: /\blost my (?:music|part|folder)\b|\b(?:a|another|a new) copy\b|\bcopy of my\b|\bpage turn\b|\bmissing (?:a page|pages)\b|\bperdi mi (?:musica|partitura)\b/, also: /\b(?:bad|get)\b/ },
  { intent: 'howAlerts', re: /\b(?:alerts?|alertas?|notifications?|notificaciones|notify|get a text|text me)\b/, also: /\bturn on\b|\bget\b/ },
  { intent: 'howFindMe', re: /\bfind (?:my schedule|me)\b|\bnot me\b|\bwrong (?:person|student|name|kid)\b|\btwo kids\b|\b(?:other|another) (?:kids?|child|student|phone)\b|\bespanol\b|\bin spanish\b/, also: /\bin the program\b|\bsend\b|\bsee\b/ },

  { intent: 'required', re: /\b(?:required|mandatory|obligatori[oa]s?)\b|\b(?:have|need) to (?:go|attend)(?: to)?\b/, also: /\bhow many\b|\bgo\b|\battend\b/ },
  { intent: 'pickup', re: /\bpick ?up\b|\bpick (?:him|her|them) up\b|\brecog\w+\b|\brecojo\b/, also: /\bafter\b|\bfrom\b/ },
  { intent: 'pickup', re: /^(?:what time|when) is it over$|\b(?:concert|concierto|show|it) (?:ends?|finish(?:es)?|is over|lets? out|termina|acaba)\b/, whenShape: true },
  // "Call" is the call time only as a noun: "what time is call", "our call".
  { intent: 'callTime', re: /\bcall ?time\b|\b(?:is|whens|whats|the|our|my) call\b|^call$|^call for\b|\b(?:have|need|supposed) to be (?:there|at)\b|\b(?:be|get) there\b|\barrive\b|\bllegar\b|\b(?:hora de )?llegada\b/ },
  { intent: 'dress', re: /\bwear(?:ing)?\b|\bdress(?: code)?\b(?! rehearsal)|\battire\b|\bconcert black\b|\bblack\b|\bme pongo\b|\bropa\b|\buniforme?\b/, also: /\bon stage\b|\bneed(?: to)?\b/ },

  { intent: 'lesson', re: /\blessons?\b|\bclase particular\b|\bleccion(?:es)?\b/, also: /\bteacher\b|\bprofesora?\b|\bwho is my\b/ },
  { intent: 'due', re: /\bdue\b|\bhw\b|\bhomework\b|\btarea\b|\bassignments?\b|\bse entrega\b|\b(playing exams?|exam(?:s|en|enes)?|tests?|quiz(?:zes)?)\b/, also: /\bexcerpts?\b|\bdate\b/ },
  { intent: 'forms', re: /\bforms?\b|\bformularios?\b|\bpermission(?: slip)?\b|\bpermiso\b|\bsign ?ups?\b|\bsign\b|\bfirm(?:o|ar)\b/, also: /\bfill(?:ed)? out\b|\bneed(?: to)?\b/ },
  { intent: 'seat', re: /\bseat(?:s|ing)?\b|\bsit(?:ting)?\b|\bchair\b|\bfirst or second\b|\bsiento\b|\basiento\b|\bstand partner\b|\b(?:which|what|my) stand\b/, also: /\bchart\b/ },
  { intent: 'parts', re: /\bparts?\b|\b(?:my|sheet) music\b|\bpartituras?\b|\bbowings?\b|\bfingerings?\b/ },
  { intent: 'piece', re: /\brecordings?\b|\bprogram notes?\b|\bgrabacion\b|\bwho (?:wrote|composed)\b|\bcomposer\b/ },
  // "cancel" and "move" alone are things a director DOES; only the past and
  // the question forms ask whether it happened.
  { intent: 'cancelled', re: /\bcancell?ed\b|\bcancelad[oa]\b|\bcancelo\b|\bcancelaron\b|\bstill (?:on|happening)\b|\bchanges?\b|\bchanged\b|\bcambios?\b|\bmoved\b/, also: /\bdid\b|\bget\b|\bgot\b|\bhas\b|\bbeen\b/ },
  { intent: 'cancelled', re: /\bmove\b/, with: /\bdid\b/ },

  { intent: 'news', re: /\bdid (?:anyone|anybody|someone) (?:find|see)\b|\bhas (?:anyone|anybody) (?:seen|found)\b|\blost and found\b|\bduty\b|\bresults?\b|\bresultados\b/, also: /\bwho has\b/, topic: true },
  { intent: 'news', re: /\bannouncements?\b|\banuncios?\b|\bwhats new\b|\bwhat is new\b|\bnews\b|\bnovedades\b|\bnoticias\b/ },
  { intent: 'documents', re: /\bsyllab(?:us|i)\b|\bhandbook\b|\bdocuments?\b|\bdocs\b|\b(study guides?|scales?|librarian)\b/, also: /\bjob\b/ },

  { intent: 'noSchool', re: /\bno school\b/, when: 'next' },
  // "When do we come back" asks for a date. "Go back" alone is a button.
  { intent: 'noSchool', re: /\bcome back\b|\bgo back\b|\bregresamos\b|\bvolvemos\b/, whenShape: true, when: 'next' },
  // Only the shapes that ask whether school is on. "What time does school
  // start" is a bell schedule, which the Hub does not hold.
  { intent: 'noSchool', re: /\b(?:is there|there is|theres|do we have|have|hay|tenemos) (?:school|clases|escuela)\b|\bschool (?:closed|open|off|cancell?ed)\b|\bis (mdc) open\b/ },
  { intent: 'noSchool', re: /\b((?:thanksgiving|winter|spring|summer|fall|christmas|holiday) break|thanksgiving|finals|quarter|semester|grading period|vacaciones)\b|\bbreak\b|\bday off\b|\bholidays?\b|\bdias? festivos?\b|\bferiados?\b/ },

  { intent: 'myDay', re: /\bam i playing\b|^is (?:he|she|my (?:son|daughter|kid|child|student)) playing\b/ },
  { intent: 'myDay', re: /\bschedule\b|\bhorario\b|\brehearsals?\b|\brehearses?\b|\bensayos?\b|\bclass(?:es)?\b|\bclases?\b|\bget out\b|\bwhat do i have\b(?! to\b)|\bdo (?:i|we) have\b(?! to\b)|\blook like\b|\b(sectionals?|seccional(?:es)?|masterclass(?:es)?)\b/ },
  // "What should I practice", not "can I practice in 4304".
  { intent: 'playing', re: /\bwhat (?:should|do|can|shall) (?:i|we) (?:need to |have to )?practice\b|\bwhat to practice\b|\bque (?:debo |tengo que )?practicar\b/, when: 'thisWeek' },
  { intent: 'playing', re: /\b(?:what|which|program|concert) order\b|\border of\b/, also: /\bplaying(?: in)?\b/, when: 'next' },
  { intent: 'playing', re: /\brepertoire\b|\brepertorio\b|\brep\b|\bprograma?\b|\bsetlist\b|\bmusica?\b/, when: null },
  { intent: 'playing', re: /\brehears(?:ing|ed)\b|\bplay(?:ing)?\b|\btoca(?:mos|r|ndo)\b|\bensaya(?:r|ndo|mos)\b|\bpieces?\b|\bpiezas?\b|\bobras?\b|\bworking on\b/, also: /\bbeing\b/ },

  // More than one concert is a list, not "the next one".
  { intent: 'concert', re: /\bhow many concerts are left\b|\bconcerts\b|\bconciertos\b|\bcoming up\b/, when: null },
  // "Show" is a concert only as a noun: "show me" and "show up" are verbs.
  { intent: 'concert', re: /\bconcert\b|\bconcierto\b|\b(?:the|a|our|my|this) shows?\b|^shows?$|\bperformances?\b|\bperf\b|\brecitals?\b|\btickets?\b|\bboletos?\b|\bentradas?\b/, also: /\bhow much\b|\baddress\b|\bdireccion\b/ },
  { intent: 'concert', re: /\baddress\b|\bdireccion\b/, thing: true },

  { intent: 'group', re: /\bwho(?:s| is) in\b|\bwho (?:conducts|teaches|directs)\b|\bquien (?:dirige|ensena)\b/ },
  { intent: 'where', re: /\bare we in\b|\bestamos en\b/, when: 'today' },
  { intent: 'where', re: /\bwheres?\b|\bdonde\b|\b(?:what|which) room\b|\bsalon\b|\broom\b/, also: /\bin$/ },
];

/** What a definition question looks like. It is answered only for a term
 *  the caller vouches for (kind `term`), and then it beats everything. */
const DEFINE = /\bwhat does (.+) mean\b|\bque (?:significa|quiere decir) (.+)|^(?:whats|what is|que es) (?:a|an|un|una) (.+)$|^define (.+)$/;

/**
 * When two different intents fire, the first of the pair wins. Any pair not
 * here is a conflict, and a conflict is not answered. Each line carries a
 * sentence in which both fire; the self-check runs it. Most are a schedule
 * noun ("rehearsal", "concert", "exam") giving way to the question asked
 * about it.
 */
export const ASK_PRECEDENCE: AskPrecedence[] = [
  ['lesson', 'myDay', 'do i have a lesson today'],
  ['lesson', 'cancelled', 'is my lesson cancelled'],
  ['lesson', 'where', 'where is my lesson'],
  ['due', 'myDay', 'do i have a test tomorrow'],
  ['forms', 'myDay', 'do i have any forms'],
  ['forms', 'where', 'donde firmo el permiso'],
  ['forms', 'due', 'are there any forms due'],
  ['howCheckin', 'where', 'where do i check in'],
  ['seat', 'where', 'where do i sit'],
  ['parts', 'where', 'where is my part'],
  ['howCopy', 'parts', 'i need a copy of my part'],
  ['howSubmit', 'due', 'how do i turn in my playing exam'],
  ['howAlerts', 'cancelled', 'can i get a text when rehearsal is cancelled'],
  ['howAlerts', 'myDay', 'can i get a text when rehearsal is cancelled'],
  ['howAbsence', 'myDay', 'i cant come to rehearsal'],
  ['cancelled', 'myDay', 'is rehearsal cancelled'],
  ['cancelled', 'concert', 'is the concert cancelled'],
  ['where', 'myDay', 'where is rehearsal'],
  ['concert', 'where', 'where is the concert'],
  ['concert', 'myDay', 'do i have a concert today'],
  ['playing', 'concert', 'what are we playing at the concert'],
  ['playing', 'myDay', 'what are we playing in rehearsal'],
  ['dress', 'concert', 'what do i wear to the concert'],
  ['callTime', 'concert', 'what time do i need to be at the concert'],
  ['pickup', 'concert', 'what time is pickup after the concert'],
  ['pickup', 'where', 'where do i pick up my student'],
  ['required', 'concert', 'which concerts are required'],
  ['required', 'myDay', 'is rehearsal required'],
];

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

/** Which kinds of name each question can be about. A kind that is not
 *  listed is not believed: "where is <a piece>" is not answered. */
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
  glossary: ['term'],
};
/** The questions that are about a day. Any other question with a date in it
 *  is two questions ("calendar this week"), and is not answered. */
const DAY_QUESTION = new Set<AskIntent>([
  'myDay', 'playing', 'where', 'cancelled', 'lesson', 'due', 'concert', 'callTime', 'dress', 'pickup',
  'required', 'noSchool', 'howAbsence',
]);

/** The shapes that carry a search topic, for the self-check. */
export const ASK_TOPIC_TRIGGERS: readonly RegExp[] = RULES.filter(r => r.topic).map(r => r.re);

/* ── The parse ────────────────────────────────────────────────────────── */

const MAX_LENGTH = 300;
const MAX_SUGGESTIONS = 4;

const nothing = (): AskParse => ({ intent: 'none', confident: false, suggestions: [] });

/** What thumbs do to the commonest words, put right before anything reads
 *  them. "My sons schedule" is a parent's own child's schedule (the
 *  apostrophe is already gone). */
const respell = (s: string) => s
  .replace(/\brehe?a?r?s(?:al|el)(s?)\b/g, 'rehearsal$1')
  .replace(/\brehe?a?r?s(ing|ed)\b/g, 'rehears$1')
  .replace(/\b(my|our) (son|daughter|kid|child|student)s (?=\w)/g, '$1 $2 ');

interface Fired { rule: AskRule; spans: number[][]; kept: number[][] }

/** Which intents fire in a sentence, before anything settles them. For the
 *  self-check, which proves each PRECEDENCE pair really is a pair. */
export function askIntentsFired(text: string, names: readonly AskName[], side?: AskStaffSide): AskIntent[] {
  const seen: AskIntent[] = [];
  work(text, names, side, intents => { seen.push(...intents); });
  return seen;
}

/**
 * The public parser. Called with two arguments it knows no staff phrasing
 * and can never return a staff intent. The staff side passes its own tables
 * as `side`; use `parseStaffAsk` in src/director/ask/ rather than calling
 * this with three.
 */
export function parseAsk(typed: string, names: readonly AskName[], side?: AskStaffSide): AskParse {
  return work(typed, names, side);
}

function work(typed: string, names: readonly AskName[], side?: AskStaffSide, spy?: (fired: AskIntent[]) => void): AskParse {
  // Nobody's question is this long. A pasted page is not answered from its
  // first line: it is not answered.
  if (typed.length > MAX_LENGTH) return nothing();
  const staff = !!side;
  const kindsOf = (i: AskIntent) => side?.kinds[i] ?? KINDS[i] ?? [];
  const mixedCase = /[a-z]/.test(typed);
  const loudWords = new Set(mixedCase ? (typed.match(/\b[A-Z]{2}\b/g) ?? []).map(w => w.toLowerCase()) : []);

  // "We'd" is "we would", not Wednesday.
  const cleaned = respell(askWords(typed.replace(/(\w)['’]d\b/g, '$1 would').replace(/(\w)['’]ll\b/g, '$1 will')));
  if (!cleaned) return nothing();
  if (/^(?:whats|what is) next$|^que sigue$/.test(cleaned)) {
    return { intent: side?.widen.myDay ?? 'myDay', when: 'today', confident: true, suggestions: [] };
  }
  const date = takeDate(cleaned);
  if (date.unsure || (date.past && (!staff || !date.when))) return nothing();
  const dated = !!date.when || date.next;

  /* The words, and what the sentence is once the dates are out. */
  const toks: Tok[] = [];
  for (const piece of date.rest.split(' ')) {
    if (!piece) continue;
    const prev = toks[toks.length - 1];
    if (piece === '~') { if (prev) prev.dateAfter = true; continue; }
    const frame = FRAME.has(piece);
    toks.push({ w: piece, frame, dateAfter: false, loud: frame && loudWords.has(piece) && !(prev && BEFORE_PRONOUN.has(prev.w)) });
  }
  const plainText = toks.map(t => t.w).join(' ');
  const has = (words: Set<string>) => toks.some(t => words.has(t.w));

  /* The public side's refusals. */
  if (!staff) {
    // "9th grade theory" is a class, not a mark.
    const marks = plainText.replace(/\b(?:\d+(?:st|nd|rd|th)|ninth|tenth|eleventh|twelfth) grade\b/g, '');
    if (REFUSE.test(marks) || (WHO.test(plainText) && !WHO_OK.test(plainText))) return nothing();
  }

  /* Names, then the rules on what the names do not cover. */
  const found = findNames(toks, names);
  const masked = new Set<number>();
  for (const f of found) {
    if (f.n.kind === 'term' || strength(f, false) === 0) continue;
    for (let i = f.hits[0]; i <= f.hits[f.hits.length - 1]; i++) masked.add(i);
  }
  const starts: number[] = [];
  let at = 0;
  const sentence = toks.map((t, i) => {
    starts.push(at);
    const w = masked.has(i) ? '§'.repeat(t.w.length) : t.w;
    at += w.length + 1;
    return w;
  }).join(' ');
  const span = (from: number, length: number) =>
    toks.map((_, i) => i).filter(i => starts[i] >= from && starts[i] < from + length);
  const spans = (re: RegExp | undefined) =>
    re ? [...sentence.matchAll(new RegExp(re.source, 'g'))].filter(m => m[0]).map(m => span(m.index, m[0].length)) : [];
  const whenSpans = spans(WHEN_SHAPE);
  const whenShape = whenSpans.length > 0;

  let fired: Fired[] = [];
  for (const rule of [...(side?.rules ?? []), ...RULES]) {
    if (rule.whenShape && !whenShape) continue;
    if (rule.with && !rule.with.test(sentence)) continue;
    const f: Fired = { rule, spans: [], kept: [] };
    for (const m of sentence.matchAll(new RegExp(rule.re.source, 'g'))) {
      if (!m[0]) continue;
      f.spans.push(span(m.index, m[0].length));
      const cap = m.slice(1).find(Boolean);
      if (cap) f.kept.push(span(m.index + m[0].indexOf(cap), cap.length));
    }
    if (f.spans.length > 0) fired.push(f);
  }
  // A longer phrase wins over a shorter one inside it: "do we have school"
  // is not also "do we have", and "lost my music" is not also "my music".
  const inside = (a: number[], b: number[]) => a.length < b.length && a.every(i => b.includes(i));
  const everySpan = fired.flatMap(f => [...f.spans, ...spans(f.rule.also)].map(s => ({ s, rule: f.rule })));
  fired = fired
    .map(f => {
      const keep = f.spans.map(s => !everySpan.some(o => o.rule.intent !== f.rule.intent && inside(s, o.s)));
      return { ...f, spans: f.spans.filter((_, k) => keep[k]), kept: f.kept.filter(k => f.spans.some((s, j) => keep[j] && k.every(i => s.includes(i)))) };
    })
    .filter(f => f.spans.length > 0);

  // A definition, for a term the caller vouches for and nothing else.
  const define = sentence.match(DEFINE);
  const term = define && found.find(f => {
    if (f.n.kind !== 'term' || !f.whole) return false;
    const asked = define.slice(1).find(Boolean) ?? '';
    const words = span(define.index! + define[0].indexOf(asked), asked.length).filter(i => !toks[i].frame || f.hits.includes(i));
    return words.length === f.hits.length && words.every(i => f.hits.includes(i));
  });
  if (term) {
    spy?.(['glossary']);
    return { intent: 'glossary', about: term.n.name, match: term.n, confident: true, suggestions: [] };
  }
  // Asked to define anything else: not a question the Hub has an answer to.
  if (define) return nothing();

  const intents = [...new Set(fired.map(f => f.rule.intent))];
  spy?.(intents);
  const pairs = [...ASK_PRECEDENCE, ...(side?.precedence ?? [])];
  const beats = (a: AskIntent, b: AskIntent) => pairs.some(([w, l]) => w === a && l === b);
  const winner = intents.find(a => intents.every(b => b === a || beats(a, b)));
  const standing = intents.filter(a => !intents.some(b => b !== a && beats(b, a)));

  /* One way of reading the sentence: as intent `as`, or as a bare name. */
  interface Try { reading?: AskReading; sure: boolean; offers: AskReading[] }
  const attempt = (as: AskIntent | undefined, lenient: boolean): Try => {
    const mine = fired.filter(f => f.rule.intent === as);
    const rule = mine[0]?.rule;
    const claimed = new Set<number>();
    const claim = (ss: number[][]) => ss.forEach(s => s.forEach(i => claimed.add(i)));
    toks.forEach((t, i) => { if (t.frame && !t.loud) claimed.add(i); });
    claim(whenSpans);
    const held = new Set<number>(); // claimed by a phrase, so a preposition in it is not left hanging
    for (const f of fired) {
      if (!(lenient || f.rule.intent === as || (as && beats(as, f.rule.intent)))) continue;
      claim(f.spans);
      f.spans.forEach(s => s.forEach(i => held.add(i)));
    }
    for (const f of mine) {
      for (const s of [...spans(f.rule.also), ...spans(f.rule.with)]) { claim([s]); s.forEach(i => held.add(i)); }
    }
    // "How do I" and "can I" start a how-to and nothing else: "can I wear
    // jeans" is a question about the rules, which the Hub does not hold.
    if (as?.startsWith('how')) claim([...spans(HOW), ...spans(CAN)]);
    toks.forEach((t, i) => {
      if (as && whenShape && TIMED.has(as) && TIMING.has(t.w)) claimed.add(i);
      if (as && INSTRUMENT_OK.has(as) && ASK_INSTRUMENTS.has(t.w)) claimed.add(i);
    });

    /* Names: believed only on strong evidence, and only one. */
    const kinds = as ? kindsOf(as) : ANY_KIND;
    const shaped = as ? true : dated || whenShape;
    // A word does one job. One that a rule has claimed as its trigger is not
    // also a name: a piece called "Black" is not what "wear black" is about.
    const fits = found.filter(f => kinds.includes(f.n.kind) && !f.hits.every(i => held.has(i)));
    // The fit that covers more of the sentence first ("jazz combo" over
    // "jazz"), then the better evidence. Never the kind of thing.
    const rank = (f: Found) => f.hits.length * 1000 + strength(f, shaped) * 100 - f.loose;
    const strong = fits.filter(f => strength(f, shaped) > 0).sort((a, b) => rank(b) - rank(a));
    const overlaps = (a: Found, b: Found) => a.hits.some(i => b.hits.includes(i));
    const picked: Found[] = [];
    let tied = false;
    for (const f of strong) {
      const rival = picked.find(p => overlaps(p, f));
      if (!rival) picked.push(f);
      else if (rival.n !== f.n && rank(rival) === rank(f)) tied = true;
    }
    picked.sort((a, b) => a.hits[0] - b.hits[0]);
    const either = toks.findIndex(t => t.w === 'or' || t.w === 'o');
    const choice = picked.length === 2 && either > picked[0].hits[0] && either < picked[1].hits[0] && picked[0].n.kind === picked[1].n.kind;
    if (choice) claimed.add(either);
    if (!tied) {
      for (const f of picked) for (let i = f.hits[0]; i <= f.hits[f.hits.length - 1]; i++) { claimed.add(i); held.add(i); }
    }
    const one = !tied && !choice && (picked.length === 1 || (staff && picked.length > 1)) ? picked[0] : undefined;
    const kind = one?.n.kind ?? (choice ? picked[0].n.kind : undefined);

    /* Words from the closed tables that are also the thing asked about. */
    let about: string | undefined = one?.n.name;
    const keptIdx = fired
      // A how-to is a door, not a card: it is not about the exam it mentions.
      .filter(f => f.rule.intent === as || (as && !as.startsWith('how') && beats(as, f.rule.intent)))
      .flatMap(f => f.kept)
      // "The exam" is one exam, and the thing asked about. "A test" is any test.
      .filter(k => !(as === 'due' && k[0] > 0 && ARTICLE.has(toks[k[0] - 1].w)))
      .flat();
    if (!about && keptIdx.length > 0) about = [...new Set(keptIdx)].sort((a, b) => a - b).map(i => toks[i].w).join(' ');
    let person: string | undefined;

    const loose = () => toks.map((_, i) => i).filter(i => !claimed.has(i));
    if (loose().length > 0 && rule?.topic) {
      // A topic is a THING to search the announcements for: "a bass bow",
      // "stands and chairs", "all state". On the public side every word of
      // it must be one this module can vouch for: an ordinary word, a word
      // of some public name, or what follows "a" or "my". Anything else may
      // be a person, and a first name always is.
      const titled = new Set(found.filter(f => !f.person && !f.typo).flatMap(f => f.hits));
      const known = (w: string) => [w, w.replace(/s$/, '')].some(x => PLAIN.has(x) || NOUNS.has(x) || ASK_INSTRUMENTS.has(x));
      let after = false;
      const vouched = toks.map((t, i) => {
        if (DETERMINER.has(t.w)) { after = true; return true; }
        if (claimed.has(i)) { after = false; return true; }
        const ok = !GIVEN_NAMES.has(t.w) && (after || titled.has(i) || known(t.w));
        if (!ok) after = false;
        return ok;
      });
      if (staff || loose().every(i => vouched[i])) {
        const idx = loose();
        about = toks.slice(idx[0], idx[idx.length - 1] + 1).filter((_, k) => !held.has(idx[0] + k)).map(t => t.w).join(' ');
        idx.forEach(i => claimed.add(i));
      }
    }
    // "The winter concert" is on nobody's poster under that name, but it is
    // plainly a concert being asked about.
    if (!about && as && kindsOf(as) === ABOUT_CONCERT && loose().length > 0 && loose().every(i => SEASON.has(toks[i].w))) {
      about = loose().map(i => toks[i].w).join(' ');
      loose().forEach(i => claimed.add(i));
    }
    // Staff: a few words shaped like a name are a person. Never resolved here.
    let intent = as;
    // "Where is <a name>", in that shape: "where do we meet" is not a person.
    const whereIs = as === 'where' && !one && /^(?:where is|wheres|donde esta)\b/.test(sentence);
    if (side && loose().length > 0 && loose().length <= 3 && (rule?.person || whereIs)) {
      const named = loose().every(i => GIVEN_NAMES.has(toks[i].w) || (!ordinary(toks[i].w) && /^[a-z]+$/.test(toks[i].w)));
      if (named) {
        person = loose().map(i => toks[i].w).join(' ');
        loose().forEach(i => claimed.add(i));
        if (as === 'where') intent = side.wherePerson;
      }
    }
    // A preposition must lead to something. "Sign in" is not "sign".
    toks.forEach((t, i) => {
      if (!PREPS.has(t.w) || held.has(i) || t.dateAfter) return;
      let j = i + 1;
      while (j < toks.length && AFTER_PREP.has(toks[j].w)) j++;
      if (j >= toks.length || !claimed.has(j) || (PREPS.has(toks[j].w) && !held.has(j))) claimed.delete(i);
    });

    const unknown = loose();

    /* The intent, when no rule gave one: a date alone is my day, a name
     * alone is that thing's card. */
    if (!intent) {
      if (!kind) intent = date.when && unknown.length === 0 ? 'myDay' : undefined;
      else if (kind === 'group') intent = dated || whenShape ? 'myDay' : 'group';
      else if (kind === 'concert' || kind === 'venue') intent = 'concert';
      // A piece and a day with nothing joining them could mean several things.
      else if (kind === 'piece') intent = date.when ? undefined : 'piece';
      else if (kind === 'form') intent = 'forms';
      else if (kind === 'assignment') intent = 'due';
      // A room on a date is a question about the building, not about me.
      else intent = !dated ? 'where' : side?.roomOnDate;
    }
    // Asking where a hall is, is asking about the concert there.
    if (intent === 'where' && kind === 'venue') intent = 'concert';

    const finish = (i: AskIntent, m: Found | undefined, a: string | undefined): AskReading => {
      let when: AskWhen | undefined = date.when ?? (date.next ? 'next' : undefined);
      if (!when) {
        if (rule && rule.when !== undefined && rule.intent === i) when = rule.when ?? undefined;
        else if (i === 'playing' && intents.includes('concert')) when = 'next';
        else {
          const [bare, named] = side?.whenDefault[i] ?? WHEN_DEFAULT[i] ?? [];
          // A room is where, not what: "what are we rehearsing in chapman" is still today.
          const thing = !!a && !(i === 'playing' && m?.n.kind === 'room');
          when = i === 'where' && m?.n.kind === 'room' ? undefined : thing ? named : bare;
          // "What day is rehearsal" is not asking about today.
          if (i === 'myDay' && /\b(?:what|which) day\b|\bque dia\b/.test(sentence)) when = 'next';
        }
      }
      const out: AskReading = { intent: side ? side.widen[i] ?? i : i };
      if (when) out.when = when;
      const shown = a ?? person;
      if (shown) out.about = shown;
      if (m) out.match = m.n;
      if (person) out.person = person;
      return out;
    };

    /* Did you mean: the names that fit the leftover words, but not well
     * enough to be believed. */
    const offers: AskReading[] = [];
    // One entry per thing, counting every word of the sentence it explains,
    // by its own name or by a person on it ("tchaik 5").
    const reach = new Map<AskName, Set<number>>();
    const wholly = new Set<AskName>();
    for (const f of fits) {
      // A first name alone offers nothing: it is far more often a classmate.
      if (!(tied || strength(f, shaped) === 0 || picked.length > 1)) continue;
      if (!f.hits.some(i => !NOUNS.has(toks[i].w) && !GIVEN_NAMES.has(toks[i].w))) continue;
      const set = reach.get(f.n) ?? new Set<number>();
      f.hits.forEach(i => set.add(i));
      reach.set(f.n, set);
      if (f.whole && !f.person) wholly.add(f.n);
    }
    const covered = new Set([...reach.values()].flatMap(v => [...v]));
    const nameable = unknown.length > 0
      ? unknown.every(i => covered.has(i) || NAME_STOP.has(toks[i].w))
      : tied || (picked.length > 1 && !choice && !staff);
    if (nameable) {
      const score = (n: AskName) => (wholly.has(n) ? 1000 : 0) + reach.get(n)!.size * 10;
      const order = [...reach.keys()]
        .filter(n => unknown.length === 0 || unknown.some(i => reach.get(n)!.has(i)))
        .sort((a, b) => (score(b) - score(a)) || (kinds.indexOf(a.kind) - kinds.indexOf(b.kind)));
      for (const n of order) {
        // Only the best fits: one that explains fewer words is noise.
        if (score(n) < score(order[0]) || offers.length >= MAX_SUGGESTIONS) break;
        const k = n.kind;
        const i = as ?? (k === 'group' ? (dated || whenShape ? 'myDay' : 'group')
          : k === 'concert' || k === 'venue' ? 'concert' : k === 'piece' ? 'piece' : k === 'form' ? 'forms'
            : k === 'assignment' ? 'due' : 'where');
        const f = fits.find(x => x.n === n)!;
        offers.push(finish(i === 'where' && k === 'venue' ? 'concert' : i, f, n.name));
      }
    }

    // "Address" and "cancel" mean something only beside a thing: a name, or
    // the schedule noun the question is about.
    const lacking = !!rule?.thing && !kind && !person && !fired.some(f => !!as && beats(as, f.rule.intent));
    const sure = !!intent && unknown.length === 0 && !tied && (picked.length <= 1 || choice || staff)
      && !lacking
      // One word, and not one of the few that is a question by itself.
      && !(toks.length === 1 && !dated && !ONE_WORD.has(toks[0].w) && !side?.oneWord.includes(toks[0].w))
      // A date belongs in a question about a day. "Calendar this week" is two questions.
      && !(dated && !staff && !DAY_QUESTION.has(intent))
      && !(date.bareDay && !(as && (DAY_QUESTION.has(as) || staff)));
    const reading = intent && unknown.length === 0 && !lacking ? finish(intent, one, about) : undefined;
    // A lone keyword: offered as what it probably means.
    if (!sure && reading && toks.length === 1 && offers.length === 0) offers.push(reading);
    return { reading, sure, offers };
  };

  const offer = (readings: AskReading[]): AskParse => {
    const seen = new Set<string>();
    const suggestions = readings.filter(r => {
      if (!side && r.intent.startsWith('staff')) return false;
      const key = `${r.intent}|${r.when ?? ''}|${r.about ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, MAX_SUGGESTIONS);
    return { intent: 'none', confident: false, suggestions };
  };

  /* A third person and the past, or their whereabouts: a record. Refused
   * whatever the word order, article or language. The how-to is offered.
   * Staff too, unless a staff rule fired: "is my son at rehearsal" names
   * nobody a staff answer could look up. */
  if (!staff || !intents.some(i => i.startsWith('staff'))) {
    const subject = toks.some((t, i) => SUBJECT.has(t.w) || (KIN.has(t.w) && !(toks[i + 1] && OWNED.has(toks[i + 1].w))));
    const report = REPORT.test(plainText);
    const record =
      // About somebody else, only two things are answered: what they HAVE or
      // are expected to do, and a report that they will be out.
      (subject && (has(PAST) || (!report && !has(SCHEDULE_VERB)))) ||
      // "Is he absent", "am I excused": asking for today's roll, not reporting.
      (!report && has(ROLL) && toks.some(t => COPULA.has(t.w) || t.w === 'am' || t.w === 'estoy'));
    if (record) {
      const doors = intents.filter(i => i === 'howSubmit' || i === 'howCheckin' || i === 'howAbsence');
      return offer(doors.map(intent => ({ intent })));
    }
  }
  // "What is 4/4" is a time signature. Two numbers and a slash are a date
  // only when the rest of the sentence is a question about a day.
  if (date.bareSlash && intents.length === 0) return nothing();

  /* Settle it. */
  if (intents.length > 0 && !winner) {
    // Two questions in one sentence. Offer each; answer neither.
    const each = standing.map(i => attempt(i, true));
    return offer(each.flatMap(t => (t.offers.length > 0 ? t.offers : t.reading ? [t.reading] : [])));
  }
  const got = attempt(winner, false);
  if (got.sure && got.reading) {
    if (!side && got.reading.intent.startsWith('staff')) return nothing();
    return { ...got.reading, confident: true, suggestions: [] };
  }
  return offer(got.offers);
}
