/**
 * Ask's whole-sentence templates (#ask): the ONLY way to a confident answer.
 *
 * A template is a row of positions. Each position is a fixed set of words,
 * a typed slot, or an optional set of words. A sentence is confident only
 * when one template consumes EVERY token of it. There are no ignorable
 * words on this path: a word is consumed by a position, or the sentence is
 * not confident and the keyword engine in parse.ts may offer a suggestion.
 *
 * That is what makes a template safe to add. "Where is REH" cannot answer
 * "where is him", because "him" is in no position. Nothing here is "about
 * me" unless the sentence says i, we, my or our (the SELF words below); an
 * empty subject is not me.
 *
 * The mini-language, one template per string:
 *   word            that word
 *   [a|b c|d]       one of these, each may be several words
 *   {a|b}           one of these, and it is what the question is ABOUT
 *                   (so `about` is always a word from this file)
 *   X?              optional (works on a word, a group or a slot)
 *   UPPER           a macro from MACROS (a word set) or a typed slot:
 *     DATE          a whole date phrase, with "on" or "for" before it
 *     DEADLINE      "by" and a date: only in a question about what is due
 *     GROUP EVENT PIECE VENUE ROOM PLACE FORM TASK TERM
 *                   a thing from the caller's names, on strong evidence
 *     GROUP+        the same, but only a name of two words or more: for a
 *                   template that is nothing but the name
 *     GROUP!        the same, and also a name made entirely of ordinary
 *                   words: only where the template itself says what kind
 *                   of thing it is ("who wrote PIECE!")
 *     PERSON        staff only: one to three words that are a name
 *
 * KIN (a parent's own child) appears only in templates about schedule and
 * logistics: what they have, when their lesson is, what they wear, when to
 * be there, and reporting them out. Never in a where-is, is-at, did, has or
 * question-about-their-state template. Do not add one.
 */

import type { AskIntent, AskWhen } from './corpus.ts';

export interface AskTemplate {
  intent: AskIntent;
  /** The pattern, in the mini-language above. */
  t: string;
  /** The date when none is typed. null = none. Left out = the intent's default. */
  when?: AskWhen | null;
}

const INSTRUMENTS =
  'violin|viola|cello|bass|flute|oboe|clarinet|bassoon|horn|trumpet|trombone|tuba|percussion|piano|harp|guitar|' +
  'sax|saxophone|voice|chelo|contrabajo|flauta|trompeta';
const SEASONS = 'winter|spring|fall|autumn|summer|holiday|christmas|invierno|primavera|otono|verano|navidad';
const BREAKS = 'thanksgiving break|winter break|spring break|summer break|fall break|christmas break|holiday break|thanksgiving';

/** Word sets. SELF is I and MY, and nothing else is ever "about me". */
export const MACROS: Record<string, string> = {
  I: 'i|we',
  MY: 'my|our|mi|mis',
  THE: 'the|a|an|el|la|un|una',
  WHEN: 'when|what time|what day|which day|cuando|a que hora|que dia',
  DO: 'do|does',
  REH: 'rehearsal|rehearsals|class|classes|practice|ensayo|ensayos|clase',
  CON: 'concert|concierto|show|performance|recital',
  CONS: 'concerts|conciertos|shows|performances|recitals',
  NEXT: 'next|upcoming|proximo|proxima|siguiente',
  KIN: 'he|she|my son|my daughter|my kid|my child|my student|mi hijo|mi hija',
  MYKIN: 'my son|my daughter|my kid|my child|my student|mi hijo|mi hija',
  KINS: 'his|her|my sons|my daughters|my kids|my childs|my students',
  /** The same child as the object of a verb: "pick up him", "drop off my son". */
  KINO: 'him|her|my son|my daughter|my kid|my child|my student|mi hijo|mi hija',
  INSTR: INSTRUMENTS,
  CANC: 'cancelled|still on|still happening',
  SEASONS,
  BREAKS,
};
/** The SELF macros, for the self-check: it swaps each for somebody else. */
export const SELF_MACROS = ['I', 'MY'] as const;
export const NEXT_WORDS = new Set(MACROS.NEXT.split('|'));

const KINDS = ['group', 'event', 'piece', 'venue', 'room', 'form', 'task', 'term'];
const slotSource = (name: string): string | undefined => {
  // Not "by": "what do I have by friday" is a deadline, not a day.
  if (name === 'DATE') return '(?:(?:on|for|el|para|del|de) )?~';
  if (name === 'PERSON') return '(?<person>0?\\p{L}+(?: 0?\\p{L}+){0,2}?)';
  if (name === 'PLACE') return '<(?:room|venue)1?>';
  // "By friday" is a deadline, and only a question about what is due has one.
  if (name === 'DEADLINE') return 'by ~';
  // A day, where the template itself asks about one: also "12/9" with no
  // "on" before it, which anywhere else may be a time signature.
  if (name === 'DAY') return '(?:(?:on|for|el|para|del|de) )?~s?';
  // One distinctive word of exactly one concert's name: "the POPS concert".
  if (name === 'EVENTW') return '<eventw>';
  const m = name.match(/^([A-Z]+)([+!]?)$/);
  const kind = m && KINDS.find(k => k.toUpperCase() === m[1]);
  if (!kind) return undefined;
  // `<group>` two words or more; `<group1>` one word; `<group~>` all ordinary words.
  return m[2] === '+' ? `<${kind}>` : m[2] === '!' || kind === 'term' ? `<${kind}[1~]?>` : `<${kind}1?>`;
};
interface Elem { alts: string[]; optional: boolean; capture: boolean }

function elements(t: string): Elem[] {
  return (t.match(/\[[^\]]*\]\??|\{[^}]*\}\??|\S+/g) ?? []).map(raw => {
    const optional = raw.endsWith('?');
    const body = optional ? raw.slice(0, -1) : raw;
    const capture = body.startsWith('{');
    const alts = body.startsWith('[') || capture ? body.slice(1, -1).split('|').map(a => a.trim()) : [body];
    return { alts, optional, capture };
  });
}

/** One word of an alternative: a slot, a macro's words, or the word itself. */
function word(w: string, macros: Record<string, string>): { src: string; first: string; self: boolean } {
  const slot = slotSource(w);
  if (slot) return { src: slot, first: w, self: false };
  if (macros[w]) return { src: `(?:${macros[w]})`, first: macros[w].split('|')[0], self: (SELF_MACROS as readonly string[]).includes(w) };
  if (/[A-Z]/.test(w)) throw new Error(`Ask template: unknown macro or slot "${w}"`);
  return { src: w, first: w, self: false };
}

/** A sample sentence as its words; a slot comes back as its name. */
export interface AskSample { words: string[]; self: boolean[] }

export interface AskCompiled {
  src: AskTemplate;
  re: RegExp;
  /** The shortest and the longest sentence it accepts, for the self-check. */
  samples: AskSample[];
  /** Words one of which must be in the sentence for this to fit (the first
   *  position that is not optional). Only a shortcut: a sentence with none
   *  of them is not tried. Left out when that position can be anything. */
  keys?: string[];
}

const GREET = '(?:(?:hi|hey|hello|hola|please) )*';
const THANKS = '(?:(?:please|thanks|thank you|por favor|gracias) )*';

/** Compile templates to matchers over a sentence written as its tokens,
 *  each followed by one space. */
export function compileTemplates(list: readonly AskTemplate[], extra: Record<string, string> = {}): AskCompiled[] {
  const macros = { ...MACROS, ...extra };
  return list.map(src => {
    const elems = elements(src.t).map(e => {
      const alts = e.alts.map(a => a.split(' ').map(w => word(w, macros)));
      const body = alts.map(ws => ws.map(w => w.src).join(' ')).join('|');
      return {
        source: `(?:${e.capture ? `(?<about>${body})` : `(?:${body})`} )${e.optional ? '?' : ''}`,
        first: alts[0].flatMap(w => w.first.split(' ').map(x => ({ w: x, self: w.self }))),
        optional: e.optional,
      };
    });
    const build = (full: boolean): AskSample => {
      const ws = elems.filter(e => full || !e.optional).flatMap(e => e.first);
      return { words: ws.map(x => x.w), self: ws.map(x => x.self) };
    };
    const short = build(false);
    const long = build(true);
    // What the first required position can start with, as sentence tokens.
    const must = elements(src.t).find(e => !e.optional);
    const starts = (must?.alts ?? []).map(a => {
      const w = a.split(' ')[0];
      if (w === 'PERSON' || w === 'DEADLINE') return null;
      if (w === 'DATE') return ['~'];
      if (w === 'DAY') return ['~', '~s'];
      if (w === 'EVENTW') return ['<eventw'];
      if (w === 'PLACE') return ['<room', '<venue'];
      const slot = w.match(/^([A-Z]+)[+!]?$/);
      const kind = slot && KINDS.find(k => k.toUpperCase() === slot[1]);
      if (kind) return [`<${kind}`];
      return (macros[w] ?? w).split('|').map(x => x.split(' ')[0]);
    });
    const keys = starts.length > 0 && starts.every(k => k !== null) ? [...new Set(starts.flat() as string[])] : undefined;
    return {
      src,
      re: new RegExp(`^${GREET}${elems.map(e => e.source).join('')}${THANKS}$`, 'u'),
      samples: short.words.length === long.words.length ? [short] : [short, long],
      ...(keys ? { keys } : {}),
    };
  });
}
export const isSlotName = (w: string) => /^[A-Z]+[+!]?$/.test(w);

const T = (intent: AskIntent, t: string, when?: AskWhen | null): AskTemplate =>
  (when === undefined ? { intent, t } : { intent, t, when });

/** The public side. Written from the kinds of question the Hub can answer. */
export const PUBLIC_TEMPLATES: AskTemplate[] = [
  /* My day. */
  T('myDay', 'DATE'),
  T('myDay', 'what DO? I have DAY?'),
  T('myDay', 'what DO? I have going on DATE?'),
  T('myDay', 'what is DATE'),
  T('myDay', 'what is next', 'today'),
  T('myDay', 'que sigue', 'today'),
  T('myDay', 'what is [on|happening|going on] DAY?'),
  T('myDay', 'que [tengo|tenemos|hay] DATE?'),
  T('myDay', '[DO I have|is there|hay|tengo|tenemos] [anything|something|algo] DATE?'),
  T('myDay', '[anything|something] DATE'),
  T('myDay', 'MY? [schedule|horario] DATE?'),
  T('myDay', 'what is MY [schedule|day] DATE?'),
  T('myDay', 'what [is|does] DATE look like'),
  T('myDay', 'what does MY [schedule|day] look like DATE?'),
  T('myDay', '[is there|are there|DO I have|hay|tengo|tenemos] [a|any|un]? REH DAY?'),
  T('myDay', 'any? REH DATE?'),
  T('myDay', 'WHEN is THE? NEXT? REH DATE?'),
  T('myDay', 'WHEN is MY NEXT? REH DATE?'),
  T('myDay', 'WHEN DO? THE? REH [start|begin|end|finish|meet] DATE?'),
  T('myDay', 'WHEN is THE? REH over DATE?'),
  T('myDay', 'WHEN [es|empieza|termina] [el|la]? REH DATE?'),
  T('myDay', 'WHEN DO I [get out|start|finish] DATE?'),
  T('myDay', 'MY? NEXT REH', 'next'),
  T('myDay', 'WHEN is GROUP DATE?'),
  T('myDay', 'WHEN is THE? NEXT? GROUP [rehearsal|class|sectional|practice] DATE?'),
  T('myDay', 'WHEN DO? GROUP [meet|rehearse|start|end|practice] DATE?'),
  T('myDay', '[is there|DO I have|hay|tengo|tenemos] GROUP DATE?'),
  T('myDay', 'GROUP [rehearsal|class|schedule|practice]? DATE'),
  T('myDay', 'GROUP [rehearsal|schedule]'),
  T('myDay', 'what DO? GROUP have DATE?'),
  T('myDay', 'WHEN is THE? NEXT? {sectional|sectionals|masterclass|seccional}'),
  T('myDay', 'am i playing DATE?'),
  T('myDay', 'am i playing in {masterclass|sectional} DATE?'),
  // A parent's own child: what they HAVE.
  T('myDay', 'what DO KIN have DATE?'),
  T('myDay', 'DO KIN have [a|any]? [REH|anything] DATE?'),
  T('myDay', 'WHEN is KINS REH DATE?'),
  T('myDay', 'KINS [schedule|rehearsal] DATE?'),
  T('myDay', 'WHEN DO KIN get out DATE?'),
  T('myDay', 'is KIN playing DATE?'),

  /* What are we playing. */
  T('playing', 'what [is|are] I [playing|rehearsing|practicing|working on] DATE?'),
  T('playing', 'what [is|are] I [playing|rehearsing] [at|for|in] THE? NEXT? CON', 'next'),
  T('playing', 'what [is|are] I [playing|rehearsing] [at|in] THE? REH DATE?'),
  T('playing', 'what is being rehearsed DATE?'),
  T('playing', 'what [pieces|music|songs] DATE?'),
  T('playing', 'what [pieces|music|songs] are I [playing|rehearsing] DATE?'),
  T('playing', 'what should I practice DATE?', 'thisWeek'),
  T('playing', 'what DO I [need|have] to practice DATE?', 'thisWeek'),
  T('playing', 'what is on the program DATE?', null),
  T('playing', '[repertoire|repertorio|rep|program|programa|setlist]', null),
  T('playing', 'GROUP [rep|repertoire|program|music|repertorio]', null),
  T('playing', 'what is GROUP [playing|rehearsing] DATE?'),
  T('playing', 'what [is|are] I [playing|rehearsing] [at|in] THE? PLACE DATE?'),
  T('playing', '[what|which] order are I playing in?', 'next'),
  T('playing', 'que [tocamos|ensayamos] DATE?'),
  T('playing', 'que vamos a [tocar|ensayar] DATE?'),
  T('playing', 'que tocamos en el concierto', 'next'),

  /* Where. */
  T('where', 'where is THE? REH DATE?'),
  T('where', 'where are we DATE?'),
  T('where', 'where DO I have REH DATE?'),
  T('where', 'where DO I [meet|rehearse] DATE?'),
  T('where', '[what|which] room DATE?'),
  T('where', '[what|which] room [is|are] [REH|I] in? DATE?'),
  T('where', '[what|which] room is GROUP in? DATE?'),
  T('where', 'are we in PLACE DATE?', 'today'),
  T('where', 'where is GROUP DATE?'),
  T('where', 'where DO? GROUP [meet|rehearse|practice] DATE?'),
  T('where', 'where is THE? GROUP [rehearsal|class] DATE?'),
  T('where', 'where is ROOM'),
  T('where', 'ROOM+'),
  T('where', 'donde es [el|la]? REH DATE?'),
  T('where', 'en que salon DATE?'),

  /* Is it cancelled. */
  T('cancelled', 'is THE? REH CANC DATE?'),
  T('cancelled', 'is GROUP REH? CANC DATE?'),
  T('cancelled', 'is KINS REH CANC DATE?'),
  T('cancelled', 'is [anything|something] [cancelled|changed|different] DATE?'),
  T('cancelled', 'did [anything|something] [change|get cancelled|move] DATE?'),
  T('cancelled', 'did THE? REH [change|move|get cancelled|get moved] DATE?'),
  T('cancelled', 'did GROUP [change|move|get cancelled] DATE?'),
  T('cancelled', 'has THE? REH been [cancelled|moved|changed] DATE?'),
  T('cancelled', '[any|are there any] changes DATE?'),
  T('cancelled', 'is THE? NEXT? CON CANC DATE?'),
  T('cancelled', 'is THE? EVENT CANC'),
  T('cancelled', 'se cancelo [el|la]? REH DATE?'),
  T('cancelled', 'hay cambios DATE?'),

  /* My lesson. */
  T('lesson', 'WHEN is MY NEXT? INSTR? lesson DATE?'),
  T('lesson', 'DO I have [a|an|any]? INSTR? lesson DATE?'),
  T('lesson', 'MY? NEXT? lesson [time|schedule]?'),
  T('lesson', 'where is MY lesson DATE?'),
  T('lesson', 'is MY lesson CANC DATE?'),
  T('lesson', 'who is MY lesson teacher'),
  T('lesson', 'WHEN is KINS NEXT? INSTR? lesson DATE?'),
  T('lesson', 'DO KIN have [a|an]? lesson DATE?'),
  T('lesson', 'cuando es mi [clase particular|leccion] DATE?'),

  /* What is due. */
  T('due', 'what is due DAY?'),
  T('due', 'what is due DEADLINE'),
  T('due', 'what DO I have due DATE?'),
  T('due', '[homework|tarea|assignments]'),
  T('due', '[DO I have|is there|any|tengo|hay] any? [homework|tarea] DATE?'),
  T('due', 'que tarea tengo DATE?'),
  T('due', '[DO I have|is there] [a|an|any] [test|exam|quiz] DATE?'),
  T('due', 'DO KIN have [a|an|any] [test|exam|quiz|homework] DATE?'),
  T('due', 'WHEN is the {playing exam|exam|test|quiz} due?'),
  T('due', '{playing exam}'),
  T('due', 'what excerpt is the {playing exam}'),
  T('due', 'WHEN is THE? TASK due?'),
  T('due', 'TASK+'),
  T('due', 'cuando se entrega el {examen}'),

  /* My seat and my music. */
  T('seat', 'where DO I sit'),
  T('seat', 'what is MY [seat|chair|stand]'),
  T('seat', 'what [chair|seat] am i'),
  T('seat', 'where is MY [seat|chair]'),
  T('seat', 'where am i sitting'),
  T('seat', 'MY? [seat|seating|seating chart]'),
  T('seat', 'GROUP [seating|seating chart]'),
  T('seat', 'am i first or second INSTR?'),
  T('seat', 'donde me siento'),
  T('parts', 'where is MY [part|music|sheet music]'),
  T('parts', 'where is the sheet music'),
  T('parts', 'MY [music|part]'),
  T('parts', '[sheet music|bowings|fingerings]'),
  T('parts', 'donde esta mi partitura'),
  T('parts', 'MY? PIECE! INSTR? part'),

  /* Forms. */
  T('forms', '[forms|formularios]'),
  T('forms', 'DO I have any? forms'),
  T('forms', 'what forms DO I [need|have]'),
  T('forms', 'permission slip'),
  T('forms', 'what DO I [need|have] to sign'),
  T('forms', 'FORM+'),
  T('forms', 'donde firmo el permiso'),
  T('forms', 'sign up for {masterclass}'),

  /* Concerts. */
  T('concert', 'NEXT? CON'),
  T('concert', 'WHEN is THE? NEXT? CON DATE?'),
  T('concert', 'WHEN is MY NEXT? CON'),
  T('concert', 'where is THE? NEXT? CON DATE?'),
  T('concert', 'WHEN DO? THE? CON [start|begin]'),
  T('concert', 'is there [a|any]? CON DATE?'),
  T('concert', 'is THE CON DATE'),
  T('concert', 'CON DATE'),
  T('concert', 'upcoming? CONS DATE?', null),
  T('concert', 'DATE CON'),
  T('concert', 'WHEN is THE? GROUP CON'),
  T('concert', 'where is THE? GROUP CON'),
  T('concert', 'GROUP CON'),
  T('concert', 'what CONS are coming up [this year]?', null),
  T('concert', 'how many CONS are left', null),
  T('concert', 'WHEN is THE? EVENT'),
  T('concert', 'EVENT+'),
  T('concert', 'where is THE? [EVENT|VENUE]'),
  T('concert', '[address|directions] [for|of|to] THE? NEXT? CON'),
  T('concert', '[address|directions] [for|of|to] THE? [EVENT|VENUE]'),
  T('concert', 'WHEN is THE? {SEASONS} CON'),
  T('concert', '{SEASONS} CON'),
  T('concert', 'WHEN is KINS NEXT? CON'),
  T('concert', 'where is KINS NEXT? CON'),
  T('concert', 'WHEN es el NEXT? concierto'),
  T('concert', 'donde es el NEXT? concierto'),
  T('callTime', 'call time DATE?'),
  T('callTime', 'WHEN is THE? call time? DATE?'),
  T('callTime', 'what is THE? call time DATE?'),
  T('callTime', 'WHEN [DO|should] I [have to|need to]? [be there|get there|arrive] DATE?'),
  T('callTime', 'WHEN [DO|should] KIN [have to|need to]? [be there|get there|arrive] DATE?'),
  T('callTime', 'WHEN [DO|should] [I|KIN] [have to|need to]? be at the CON'),
  T('callTime', '[call time|WHEN is call] for THE? EVENT'),
  T('callTime', 'hora de llegada'),
  T('dress', 'what [DO|should] [I|KIN] wear DATE?'),
  T('dress', 'what [DO|should] [I|KIN] wear [to|for|at] THE? NEXT? CON'),
  T('dress', 'what [DO|should] [I|KIN] wear [to|for] THE? EVENT'),
  T('dress', 'what DO [I|KIN] need to wear'),
  T('dress', 'what should [I|KIN] wear on stage'),
  T('dress', 'DO I [need|have] to wear black'),
  T('dress', 'DO I need black'),
  T('dress', 'DO I [need|need to wear|have to wear] black [for|to|at] THE? NEXT? CON'),
  T('dress', 'what [DO|should] [I|KIN] wear [to|for] THE? GROUP CON'),
  T('dress', 'concert black'),
  T('dress', 'what is the dress code'),
  T('dress', 'dress code'),
  T('dress', 'dress code for THE? NEXT? CON'),
  T('dress', 'que me pongo'),
  T('dress', 'que me pongo para el concierto'),
  T('pickup', 'WHEN is pickup DATE?'),
  T('pickup', '[when and where|WHEN] [DO|should|can] i pick up KIN'),
  T('pickup', '[when and where|WHEN] [DO|should|can] i pick up KIN after the CON'),
  T('pickup', 'WHEN is it over'),
  T('pickup', 'WHEN DO? THE? CON [end|finish|let out]'),
  T('pickup', 'a que hora la recojo'),
  T('required', '[which|what] CONS are [required|mandatory]'),
  T('required', '[required|mandatory] CONS'),
  T('required', 'is THE? NEXT? CON [required|mandatory]'),
  T('required', 'is THE? EVENT [required|mandatory]'),
  T('required', 'DO I have to [go to|attend] THE? NEXT? CON'),
  T('required', 'DO I have to [go to|attend] THE? EVENT'),
  T('required', 'DO I have to [go to|attend] THE? GROUP CON'),
  T('required', 'is THE? GROUP CON [required|mandatory]'),
  T('required', 'how many CONS DO I [need|have] to attend'),
  T('required', 'conciertos obligatorios'),

  /* The school. */
  T('noSchool', '[is there|DO I have|hay|tenemos] [school|clases|escuela] DATE?'),
  T('noSchool', 'no school', 'next'),
  T('noSchool', 'WHEN is THE? NEXT? [day off|holiday|break]'),
  T('noSchool', 'WHEN is THE? {BREAKS}'),
  T('noSchool', 'WHEN DO? THE? {BREAKS} [start|end|begin]'),
  T('noSchool', '{BREAKS}'),
  T('noSchool', 'WHEN DO I [come|go] back', 'next'),
  T('noSchool', 'is {mdc} open DATE?'),
  T('noSchool', 'WHEN are {finals}'),
  T('noSchool', 'WHEN DO? the {quarter|semester} end'),
  T('noSchool', 'is DATE a holiday'),
  T('noSchool', 'is there a holiday DATE'),
  T('noSchool', 'holidays', 'next'),
  T('group', 'GROUP+'),
  T('group', 'who is in GROUP'),
  T('group', 'who [conducts|teaches|directs] THE? GROUP'),
  T('piece', 'PIECE+'),
  T('piece', 'is there a recording of PIECE!'),
  T('piece', 'recording of PIECE!'),
  T('piece', 'program notes for PIECE!'),
  T('piece', 'who [wrote|composed] THE? PIECE!'),
  T('news', 'any? [announcements|news|anuncios|novedades]'),
  T('news', 'what is new'),
  T('news', 'lost and found'),
  T('documents', '[syllabus|handbook|documents]'),
  T('documents', 'GROUP syllabus'),
  T('documents', '{study guide|scales}'),

  /* How do I. A parent may report their own child out. */
  T('howAbsence', 'how DO I report [an absence|MYKIN absent]'),
  T('howAbsence', 'report an? absence'),
  T('howAbsence', 'como reporto una ausencia'),
  T('howAbsence', 'i am [going to be|gonna be]? [absent|out] DATE?'),
  T('howAbsence', 'i will be [absent|out] DATE?'),
  T('howAbsence', 'i am sick DATE?', 'today'),
  T('howAbsence', 'out sick', 'today'),
  T('howAbsence', 'i have to miss REH DATE?'),
  T('howAbsence', 'i cant [come|make it] DATE?'),
  T('howAbsence', '[i am]? leaving early DATE?'),
  T('howAbsence', 'i have [a|an] [doctor|doctors|dentist]? appointment DATE?'),
  T('howAbsence', 'voy a faltar DATE?'),
  // Not "my son is sick": that is a statement about somebody's state, and
  // the same words with a question mark ask for it. A parent reports with
  // "will be", "wont be", "cant come" or "how do I report".
  T('howAbsence', 'KIN [will be|is going to be] [absent|out] DATE?'),
  T('howAbsence', 'KIN wont be [at school|there|in class|at rehearsal] DATE?'),
  T('howAbsence', 'KIN cant [come|make it] DATE?'),
  T('howAbsence', 'KIN has [a|an] [doctor|doctors|dentist]? appointment DATE?'),
  T('howAbsence', 'MYKIN no puede [ir|venir] DATE?'),
  T('howAbsence', 'MYKIN will be absent who do i tell'),
  T('howSubmit', 'how DO I [submit|turn in|upload] MY? [video|playing exam|exam]'),
  T('howSubmit', '[submit|upload] MY? video'),
  T('howSubmit', 'can i [send|submit] [a better|another] take'),
  T('howSubmit', 'como entrego mi [examen|video]'),
  T('howCheckin', 'check in'),
  T('howCheckin', 'how DO I check [in|out]'),
  T('howCheckin', 'where DO I check in'),
  T('howCheckin', 'i forgot to check [in|out]'),
  T('howCheckin', 'registrar llegada'),
  T('howCheckin', 'how many CONS have i [gone to|been to|attended]'),
  T('howCalendar', 'add [it|this]? to MY [calendar|phone]'),
  T('howCalendar', 'how DO I add [it|this] to MY calendar'),
  T('howCalendar', 'can i get the schedule on my phone'),
  T('howCalendar', 'subscribe to the? calendar'),
  T('howCopy', 'i lost MY [music|part|folder]'),
  T('howCopy', 'i need [a|another] copy of MY [part|music]'),
  T('howCopy', 'bad page turn'),
  T('howAlerts', 'turn on [alerts|notifications]'),
  T('howAlerts', 'how DO I [get|turn on] [alerts|notifications]'),
  T('howAlerts', 'can i get a text when REH is cancelled'),
  T('howFindMe', 'find my schedule'),
  T('howFindMe', 'not me'),
  T('howFindMe', 'i have two kids in the program'),
  T('howFindMe', 'send to my other phone'),
  T('howFindMe', 'esta en espanol'),

  /* Definitions: only the glossary's own words. */
  T('glossary', 'what does TERM mean'),
  T('glossary', 'what is [a|an] TERM'),
  T('glossary', 'define TERM'),
  T('glossary', 'que significa TERM'),

  /* ── Coverage, by kind of question (second PR). ─────────────────────── */

  /* A group or a concert named inside an ordinary question. */
  T('playing', 'what [is|are] I [playing|rehearsing|practicing|working on] in GROUP DATE?'),
  T('playing', 'what [pieces|music|songs] are I [playing|rehearsing|working on] in GROUP DATE?'),
  T('playing', 'what [pieces|music|songs] are I working on DATE?'),
  T('playing', 'what is GROUP working on DATE?'),
  T('playing', 'what [is|are] I playing [at|for|in] THE? EVENT'),
  T('playing', 'what [is|are] I playing [at|for|in] THE? EVENTW CON'),
  T('playing', 'what is on the program [for|at] THE? EVENT', null),
  T('seat', 'where DO I sit in GROUP'),
  T('seat', 'what is MY [seat|chair] in GROUP'),
  T('seat', 'seating chart for? GROUP'),
  T('cancelled', 'did GROUP get [moved|cancelled|changed] DATE?'),
  T('cancelled', 'has GROUP been [moved|cancelled|changed] DATE?'),
  T('cancelled', 'is THE? EVENTW CON CANC'),
  T('group', 'who is the [conductor|director|teacher] [of|for] GROUP'),
  T('callTime', 'WHEN [DO|should] I [have to|need to]? [be there|get there|arrive] for THE? EVENT'),
  T('callTime', 'WHEN [DO|should] I [have to|need to]? [be there|get there|arrive] for THE? EVENTW CON'),
  T('callTime', 'WHEN [DO|should] I [have to|need to]? [be there|get there|arrive] for THE? NEXT? CON'),
  T('callTime', 'WHEN is THE? call time for THE? EVENT'),
  T('callTime', '[call time|WHEN is call|WHEN is call time|WHEN is the call time] for THE? EVENTW CON'),
  T('callTime', '[call time|WHEN is call|WHEN is call time|WHEN is the call time] for THE? NEXT? CON'),
  T('dress', 'what [DO|should] [I|KIN] wear [to|for|at] THE? EVENTW CON'),
  T('dress', 'what [DO|should] [I|KIN] wear at THE? EVENT'),
  T('concert', 'WHEN DO? THE? EVENT [start|begin]'),
  T('concert', 'WHEN is THE? EVENTW CON'),
  T('concert', 'where is THE? EVENTW CON'),
  T('concert', 'EVENTW CON'),
  T('concert', 'WHEN DO? THE? EVENTW CON [start|begin]'),
  T('pickup', 'WHEN is pickup [after|for] THE? EVENT'),
  T('pickup', 'WHEN is pickup [after|for] THE? NEXT? CON'),
  T('pickup', 'WHEN is pickup [after|for] THE? EVENTW CON'),
  T('pickup', 'WHEN DO? THE? EVENT [end|finish|let out]'),
  T('required', 'is THE? EVENTW CON [required|mandatory]'),

  /* A parent's own child: schedule and logistics only. */
  T('callTime', 'WHEN [DO|should] i drop off KINO DATE?'),
  T('callTime', 'WHEN [DO|should] i drop KINO off DATE?'),
  T('callTime', 'WHEN [DO|should] i drop off KINO [for|at] THE? NEXT? CON'),
  T('callTime', 'WHEN [DO|should] i drop off KINO [for|at] THE? EVENT'),
  T('pickup', '[when and where|WHEN] [DO|should|can] i pick up KINO DATE?'),
  T('pickup', 'WHEN [DO|should|can] i pick KINO up DATE?'),
  T('where', 'where DO KIN need to [be|go] DATE?'),
  T('lesson', 'is KINS lesson CANC DATE?'),
  T('required', 'DO KIN have to [go to|attend] THE? NEXT? CON'),
  T('required', 'DO KIN have to [go to|attend] THE? EVENT'),
  T('required', '[which|what] CONS are [required|mandatory] for KINO'),
  T('howAbsence', 'how DO I excuse KINO'),
  T('howAbsence', 'how DO I excuse [myself|KINO] from REH'),
  T('howAbsence', 'KIN [will be|is going to be] late DATE?'),
  T('howAbsence', 'i [will be|am going to be] late DATE?'),
  T('myDay', 'what is KINS schedule DATE?'),

  /* How do I, with the rest of the sentence. */
  T('howCheckin', '[how|where] DO I check in [at|for] THE? NEXT? CON'),
  T('howCalendar', 'how DO I subscribe to THE? calendar'),
  T('howCalendar', 'how DO I [add|get|put] THE? [calendar|schedule] [to|on] MY [phone|calendar]'),
  T('howCalendar', '[add|put] THE? [calendar|schedule] [to|on] MY phone'),
  T('howAlerts', 'can I get [text|phone]? [alerts|notifications|texts]'),
  T('howAlerts', 'how DO I [get|turn on] [text|phone] [alerts|notifications]'),
  T('howCopy', 'how DO I [request|get|ask for] [a|another] copy of MY [part|music]'),
  T('howCopy', 'can I get [a|another] copy of MY [part|music]'),
  T('howCopy', 'i need a new [part|copy]'),
  T('howFindMe', 'how DO I find MY [schedule|page|name]'),
  T('howFindMe', 'where DO I find MY schedule'),
  T('parts', 'where [DO|can] I find MY [music|part|parts|sheet music]'),
  T('parts', 'how DO I get MY [part|music|parts]'),
  T('forms', 'how DO I sign THE? permission slip'),
  T('forms', 'is there a form I [need|have] to sign'),
  T('forms', 'DO I owe any forms'),
  T('forms', 'what forms DO I still? [need|have] to [turn in|sign|fill out]'),
  T('forms', 'what forms are due'),
  T('howAbsence', 'who DO I [contact|tell|email] about an absence'),

  /* The day, said other ways. */
  T('myDay', 'what is on MY schedule DAY?'),
  T('myDay', 'what [am i|are we] doing DAY?'),
  T('myDay', 'no REH DATE'),
  T('noSchool', 'is school [closed|open|cancelled] DATE?'),
  T('noSchool', 'is there no school DATE?'),
  T('noSchool', 'no school DATE'),
  T('noSchool', '[no school days|days off] DATE?', 'next'),
  T('noSchool', '{teacher planning day|teacher planning days}'),
  T('noSchool', 'WHEN is THE? NEXT? {teacher planning day}'),
  T('concert', 'any CONS DATE?', null),
  T('callTime', 'DATE call time'),
  T('dress', 'what to wear DATE?'),
  T('lesson', 'INSTR lesson DATE?'),
  T('due', 'GROUP [test|exam|quiz|homework] DATE?'),
  T('due', 'what is due [for|in] GROUP DATE?'),

  /* In Spanish, and mixed. */
  T('where', 'donde esta [el salon|la sala]? ROOM'),
  T('where', 'donde esta [el|la] REH DATE?'),
  T('cancelled', 'esta [cancelado|cancelada] [el|la]? REH DATE?'),
  T('lesson', 'cuando es mi [clase particular|leccion] de INSTR DATE?'),
  T('lesson', 'tengo [lesson|leccion|clase particular] DATE?'),
  T('due', 'cuando es el {examen}'),
  T('due', 'que tengo que entregar DATE?'),
  T('callTime', 'WHEN [tengo|tenemos|hay] que llegar DATE?'),
  T('callTime', 'WHEN [tengo|tenemos|hay] que llegar al concierto'),
  T('pickup', 'WHEN [termina|acaba] el concierto'),
  T('noSchool', 'cuando son las {vacaciones}'),
  T('dress', 'como [nos vestimos|me visto]'),
  T('dress', 'que nos ponemos'),
  T('dress', 'que nos ponemos para el concierto'),
  T('forms', 'formularios pendientes'),
  T('forms', 'tengo que firmar algo'),
  T('forms', 'que tengo que firmar'),
  T('news', 'que hay de nuevo'),
  T('parts', '[mis partituras|mi partitura|mi parte]'),
  T('howCopy', 'necesito una copia de mi [parte|partitura|musica]'),
  T('myDay', 'MYKIN tiene REH DATE?'),
  T('myDay', 'que tiene MYKIN DATE?'),
  T('myDay', 'WHEN es [el|la|mi]? NEXT? REH DATE?'),

  /* Asked constantly, and the Hub has no answer of its own. Each gets a
   * fixed intent so the answering layer can send the person to the right
   * page, or say plainly that the Hub does not hold this and who to ask.
   * Nothing here invents an answer. */
  T('parking', 'where [DO|can] I park'),
  T('parking', 'where is THE? parking'),
  T('parking', 'is there parking'),
  T('parking', 'is parking free'),
  T('parking', 'parking'),
  T('parking', 'donde [me estaciono|hay estacionamiento]'),
  T('tickets', 'how much are THE? tickets'),
  T('tickets', 'how much DO tickets cost'),
  T('tickets', 'tickets'),
  T('tickets', 'ticket [price|prices]'),
  T('tickets', 'DO I need [a ticket|tickets]'),
  T('tickets', 'DO I need [a ticket|tickets] for THE? NEXT? CON'),
  T('tickets', 'are tickets [free|required|needed]'),
  T('tickets', '[where|how] DO I [buy|get] tickets'),
  T('tickets', 'is THE? NEXT? CON free'),
  T('tickets', 'cuanto cuestan [los boletos|las entradas]'),
  T('bring', 'what [DO|should] I bring DATE?'),
  T('bring', 'what DO I need to bring DATE?'),
  T('bring', 'what [DO|should] I [need to]? bring to THE? NEXT? [CON|REH]'),
  T('bring', 'que [traigo|llevo|tengo que traer]'),
  T('duration', 'how long is THE? NEXT? CON'),
  T('duration', 'how long is THE? EVENT'),
  T('duration', 'how long is THE? REH'),
  T('duration', 'how long DO? THE? NEXT? CON [last|run]'),
  T('duration', 'cuanto dura el concierto'),
  T('whoStaff', 'who is MY {teacher|conductor|director}'),
  T('whoStaff', 'who is the {conductor|director|teacher}'),
  T('whoStaff', 'quien es mi {maestro|maestra|profesor|profesora|director}'),
  T('contactStaff', 'how DO I [contact|email|reach|message] [my|our|the] [teacher|conductor|director]'),
  T('contactStaff', 'how DO I contact [the school|the office|the music office]'),
  T('contactStaff', 'who DO I [contact|ask]'),

  /* More of the same kinds, from two blind question sets. */
  T('playing', 'what [pieces|music|songs] is GROUP [playing|rehearsing|working on] DATE?'),
  T('due', 'what [assignments|homework] DO I have DAY?'),
  T('due', 'WHEN is THE? GROUP {playing exam|exam|test|quiz}'),
  T('due', '[DO I have|is there] any? [homework|tarea] due DAY?'),
  T('parts', 'MY? part for THE? PIECE!'),
  T('parts', 'donde [esta|estan] [mi partitura|mis partituras|mi parte|mi musica]'),
  T('group', 'quien [dirige|ensena] THE? GROUP'),
  T('documents', 'where are THE? documents'),
  T('documents', 'where is THE? [syllabus|handbook]'),
  T('documents', 'class? documents for GROUP'),
  T('documents', 'GROUP documents'),
  T('howSubmit', 'where DO I [upload|submit|turn in] MY? [video|playing exam|exam|playing exam video]'),
  T('howSubmit', 'how DO I [submit|turn in|upload] MY? playing exam video'),
  T('howCalendar', 'how DO I add [REH|CONS|events] to MY [calendar|phone]'),
  T('howCheckin', 'como [hago check in|me registro]'),
  T('howAlerts', 'get text? alerts on my phone'),
  T('dress', 'concert [dress|attire]'),
  T('dress', 'what is THE? dress code for THE? EVENT'),
  T('dress', 'what is THE? dress code for THE? NEXT? CON'),
  T('dress', 'what is THE? dress code for THE? EVENTW CON'),
  T('dress', 'dress code for? THE? EVENT'),
  T('dress', 'dress code for THE? EVENTW CON'),
  T('myDay', 'what REH DO I have DAY?'),
  T('myDay', 'what REH DO I have next', 'next'),
  T('concert', 'when and where is THE? NEXT? CON'),
  T('concert', 'when and where is THE? EVENT'),
  T('concert', 'when and where is THE? EVENTW CON'),
  T('concert', 'WHEN DO? THE? GROUP CON [start|begin]'),
  T('cancelled', 'is THE? REH cancelled or moved DATE?'),
  T('pickup', 'WHEN is pickup [after|for] THE? NEXT? CON DATE'),
  T('pickup', 'WHEN recojo a MYKIN'),
  T('pickup', 'WHEN recojo a MYKIN despues del concierto'),
  T('where', 'donde es [el|la] REH de GROUP DATE?'),
  T('forms', 'DO I have any? forms to [sign|turn in|fill out]'),
  T('required', '[que|cuales] conciertos son [obligatorios|requeridos]'),
  T('glossary', 'que es [un|una] TERM'),
];
