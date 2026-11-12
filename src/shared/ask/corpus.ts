/**
 * The questions people really type into the Hub's search bar (#ask).
 *
 * This list is the SPEC for the answer engine and, once the engine exists,
 * its self-check: every line must land on the intent written here, and the
 * count of "wrong with confidence" must stay at zero. Written 2026-11-11 from
 * what the Hub is used for: the Start Guide's own questions, the words on
 * every public page (English and Spanish), the live calendar's group, room
 * and concert names, and what families and staff have asked in the session
 * record. Design: docs/superpowers/specs/2026-11-11-hub2-integrated-design.md.
 *
 * Rules for adding a line:
 * - Spell it the way a thumb types it. Misspellings and text-speak are the
 *   point; do not tidy them.
 * - NEVER a student's name. `{classmate}` stands for one; the self-check
 *   fills it from fixtures. Staff names that are already on public pages are
 *   fine.
 * - `answer: 'none'` lines are as important as the rest. They are what the
 *   engine must refuse: staff-only facts, another student's day, and things
 *   the Hub does not know.
 */

export type AskIntent =
  /* about me */
  | 'myDay'        // what do I have, on a date or range
  | 'playing'      // what are we rehearsing or performing
  | 'where'        // which room
  | 'cancelled'    // is it still on, did it change
  | 'lesson'       // my private lesson
  | 'due'          // assignments and exams owed
  | 'seat'         // my chair
  | 'parts'        // my music
  | 'forms'        // forms waiting for me
  /* about a concert */
  | 'concert'      // when and where is a concert
  | 'callTime'
  | 'dress'
  | 'pickup'
  | 'required'     // which concerts I must attend
  /* about the school */
  | 'noSchool'
  | 'group'        // a group's page, its teacher, its schedule
  | 'piece'
  | 'news'         // announcements
  | 'documents'
  /* how do I */
  | 'howAbsence' | 'howSubmit' | 'howCheckin' | 'howCalendar' | 'howCopy'
  | 'howAlerts' | 'howFindMe' | 'glossary'
  /* staff only (January) */
  | 'staffWhereIs' | 'staffWhosOut' | 'staffWaiting' | 'staffMissing'
  | 'staffDay' | 'staffRoster' | 'staffContact' | 'staffDo'
  /* the honest no */
  | 'none';

/** When the question is about: left out means "not about a date". */
export type AskWhen =
  | 'today' | 'tonight' | 'tomorrow' | 'thisWeek' | 'nextWeek' | 'weekend'
  | `weekday:${'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'}`
  | `date:${string}`   // one day, "MM-DD": "dec 9", "12/9", "15 dec"
  | `month:${string}`  // a whole month, "MM": "concerts in march"
  | `day:${string}`    // the next day of the month with that number, "DD": "the 15th"
  | 'next'; // the next one that exists

export interface AskCase {
  q: string;
  lang: 'en' | 'es';
  who: 'student' | 'parent' | 'staff';
  intent: AskIntent;
  when?: AskWhen;
  /** The named thing in the question, as a plain word the matcher must find. */
  about?: string;
  /** card: answered in place. link: sent to the page that does it. none: refused. */
  answer: 'card' | 'link' | 'none';
}

const s = (q: string, intent: AskIntent, rest: Partial<AskCase> = {}): AskCase =>
  ({ q, lang: 'en', who: 'student', intent, answer: 'card', ...rest });
const p = (q: string, intent: AskIntent, rest: Partial<AskCase> = {}): AskCase =>
  ({ q, lang: 'en', who: 'parent', intent, answer: 'card', ...rest });
const d = (q: string, intent: AskIntent, rest: Partial<AskCase> = {}): AskCase =>
  ({ q, lang: 'en', who: 'staff', intent, answer: 'card', ...rest });
const es = { lang: 'es' } as const;

export const ASK_CORPUS: AskCase[] = [
  /* ── 1. My day. The morning question, the hallway question. ─────────── */
  s('what do i have today', 'myDay', { when: 'today' }),
  s('today', 'myDay', { when: 'today' }),
  s('whats today', 'myDay', { when: 'today' }),
  s('schedule', 'myDay', { when: 'today' }),
  s('my schedule', 'myDay', { when: 'today' }),
  s('do i have rehearsal today', 'myDay', { when: 'today' }),
  s('do we have orch tmrw', 'myDay', { when: 'tomorrow', about: 'orchestra' }),
  s('whats tmrw', 'myDay', { when: 'tomorrow' }),
  s('tomorow', 'myDay', { when: 'tomorrow' }),
  s('what do i have friday', 'myDay', { when: 'weekday:fri' }),
  s('thurs', 'myDay', { when: 'weekday:thu' }),
  // Also a staff line (section 13). From a student it is their own Thursday.
  s('whats on thursday', 'myDay', { when: 'weekday:thu' }),
  s('what time is rehearsal tomorow', 'myDay', { when: 'tomorrow' }),
  s('when does rehearsal end', 'myDay', { when: 'today' }),
  s('what time do we get out today', 'myDay', { when: 'today' }),
  s('this week', 'myDay', { when: 'thisWeek' }),
  s('whats my week look like', 'myDay', { when: 'thisWeek' }),
  s('next week', 'myDay', { when: 'nextWeek' }),
  s('do i have anything this weekend', 'myDay', { when: 'weekend' }),
  s('is there rehearsal 2day', 'myDay', { when: 'today' }),
  s('do we have camerata today', 'myDay', { when: 'today', about: 'camerata' }),
  s('is there phil tomorrow', 'myDay', { when: 'tomorrow', about: 'philharmonic' }),
  s('when is jazz combo', 'myDay', { when: 'next', about: 'jazz combo' }),
  s('whens the next sectional', 'myDay', { when: 'next', about: 'sectional' }),
  s('what do i have after school', 'myDay', { when: 'today' }),
  s('whats next', 'myDay', { when: 'today' }),
  s('when is violin masterclass', 'myDay', { when: 'next', about: 'violin masterclass' }),
  s('am i playing in masterclass friday', 'myDay', { when: 'weekday:fri', about: 'masterclass' }),
  s('when is theory', 'myDay', { when: 'next', about: 'theory' }),
  s('what time is MUT 1111', 'myDay', { when: 'next', about: 'mut 1111' }),
  s('when does class piano meet', 'myDay', { when: 'next', about: 'class piano' }),
  s('hoy', 'myDay', { ...es, when: 'today' }),
  s('que tengo hoy', 'myDay', { ...es, when: 'today' }),
  s('mi horario', 'myDay', { ...es, when: 'today' }),
  s('ensayo mañana', 'myDay', { ...es, when: 'tomorrow' }),
  s('hay ensayo manana', 'myDay', { ...es, when: 'tomorrow' }),
  s('hay ensayo el viernes', 'myDay', { ...es, when: 'weekday:fri' }),
  s('que tengo esta semana', 'myDay', { ...es, when: 'thisWeek' }),
  s('a que hora es el ensayo', 'myDay', { ...es, when: 'today' }),
  p('what does my kid have today', 'myDay', { when: 'today' }),
  p('what time is rehearsal over', 'myDay', { when: 'today' }),
  p('does she have rehearsal saturday', 'myDay', { when: 'weekday:sat' }),
  p('a que hora termina el ensayo', 'myDay', { ...es, when: 'today' }),

  /* ── 2. What are we playing. The director's own test sentence. ──────── */
  s('what is being rehearsed today', 'playing', { when: 'today' }),
  s('what are we rehearsing today', 'playing', { when: 'today' }),
  s('what are we playing', 'playing', { when: 'today' }),
  s('what pieces today', 'playing', { when: 'today' }),
  s('what should i practice', 'playing', { when: 'thisWeek' }),
  s('what do i need to practice for tmrw', 'playing', { when: 'tomorrow' }),
  s('what are we playing at the lyric', 'playing', { about: 'lyric' }),
  s('nutcracker music', 'playing', { about: 'nutcracker' }),
  s('whats on the program dec 9', 'playing', { when: 'date:12-09' }),
  s('what order are we playing in', 'playing', { when: 'next' }),
  s('what is camerata playing', 'playing', { about: 'camerata' }),
  s('symphony rep', 'playing', { about: 'symphony' }),
  s('repertoire', 'playing'),
  s('what are we rehearsing in chapman', 'playing', { when: 'today', about: 'chapman' }),
  s('que tocamos hoy', 'playing', { ...es, when: 'today' }),
  s('que vamos a ensayar mañana', 'playing', { ...es, when: 'tomorrow' }),
  s('repertorio', 'playing', es),
  p('what is the orchestra playing at the concert', 'playing', { when: 'next', about: 'orchestra' }),

  /* ── 3. Where. ─────────────────────────────────────────────────────── */
  s('where is rehearsal', 'where', { when: 'today' }),
  s('what room', 'where', { when: 'today' }),
  s('where is symphony today', 'where', { when: 'today', about: 'symphony' }),
  s('are we in chapman', 'where', { when: 'today', about: 'chapman' }),
  s('wheres wind ens today', 'where', { when: 'today', about: 'wind ensemble' }),
  s('are we in 4302 or wolfson', 'where', { when: 'today' }),
  s('where is my lesson', 'where', { when: 'next', about: 'lesson' }),
  s('where is jazz theory', 'where', { when: 'next', about: 'jazz theory' }),
  s('wheres 4304', 'where', { about: '4304', answer: 'link' }),
  s('where is building 5', 'where', { about: 'building 5', answer: 'link' }),
  s('donde es el ensayo', 'where', { ...es, when: 'today' }),
  s('en que salon', 'where', { ...es, when: 'today' }),

  /* ── 4. Is it cancelled. No error rate is acceptable here. ─────────── */
  s('is rehearsal cancelled', 'cancelled', { when: 'today' }),
  s('is rehearsal canceled today', 'cancelled', { when: 'today' }),
  s('is camerata cancelled', 'cancelled', { when: 'today', about: 'camerata' }),
  s('is wind ensemble still on', 'cancelled', { when: 'today', about: 'wind ensemble' }),
  s('did anything change today', 'cancelled', { when: 'today' }),
  s('any changes tomorrow', 'cancelled', { when: 'tomorrow' }),
  s('is class cancelled', 'cancelled', { when: 'today' }),
  s('did rehearsal move', 'cancelled', { when: 'today' }),
  s('se cancelo el ensayo', 'cancelled', { ...es, when: 'today' }),
  s('hay cambios hoy', 'cancelled', { ...es, when: 'today' }),
  p('is rehearsal cancelled today', 'cancelled', { when: 'today' }),
  p('did anything change', 'cancelled', { when: 'today' }),

  /* ── 5. My lesson. ─────────────────────────────────────────────────── */
  s('when is my lesson', 'lesson', { when: 'next' }),
  s('do i have a lesson today', 'lesson', { when: 'today' }),
  s('lesson time', 'lesson', { when: 'next' }),
  s('who is my lesson teacher', 'lesson', { when: 'next' }),
  s('is my lesson cancelled', 'lesson', { when: 'next' }),
  s('cuando es mi clase particular', 'lesson', { ...es, when: 'next' }),
  p('when is her violin lesson', 'lesson', { when: 'next' }),

  /* ── 6. What is due. ───────────────────────────────────────────────── */
  s('what is due', 'due'),
  s('hw', 'due'),
  s('whats due this week', 'due', { when: 'thisWeek' }),
  s('when is the playing exam due', 'due', { about: 'playing exam' }),
  s('playing exam', 'due', { about: 'playing exam' }),
  s('what excerpt is the playing exam', 'due', { about: 'playing exam' }),
  s('camerata playing exam 2', 'due', { about: 'camerata playing exam' }),
  s('when is the music history exam', 'due', { about: 'music history' }),
  s('do i have a test tomorrow', 'due', { when: 'tomorrow' }),
  s('is the exam late if i send it tonight', 'due', { when: 'tonight', about: 'exam' }),
  s('que tarea tengo', 'due', es),
  s('cuando se entrega el examen', 'due', { ...es, about: 'examen' }),
  p('does my son have an exam this week', 'due', { when: 'thisWeek' }),

  /* ── 7. My seat and my music. ──────────────────────────────────────── */
  s('whats my seat', 'seat'),
  s('where do i sit', 'seat'),
  s('what chair am i', 'seat'),
  s('seating chart', 'seat'),
  s('camerata seating', 'seat', { about: 'camerata' }),
  s('am i first or second violin', 'seat'),
  s('donde me siento', 'seat', es),
  s('where is my part', 'parts'),
  s('my music', 'parts'),
  s('sheet music', 'parts'),
  s('holberg viola part', 'parts', { about: 'holberg' }),
  s('nutcracker part', 'parts', { about: 'nutcracker' }),
  s('bowings', 'parts'),
  s('is there a recording of tchaik 5', 'piece', { about: 'symphony no. 5' }),
  s('donde esta mi partitura', 'parts', es),

  /* ── 8. Forms. ─────────────────────────────────────────────────────── */
  s('forms', 'forms'),
  s('do i have any forms', 'forms'),
  s('permission slip', 'forms'),
  s('field trip form', 'forms', { about: 'field trip' }),
  s('sandwich order', 'forms', { about: 'sandwich' }),
  s('all state sign up', 'forms', { about: 'all-state' }),
  s('sign up for masterclass', 'forms', { about: 'masterclass' }),
  s('orchestra assistant interview', 'forms', { about: 'orchestra assistant' }),
  s('formularios', 'forms', es),
  p('what do i need to sign', 'forms'),
  p('donde firmo el permiso', 'forms', es),

  /* ── 9. Concerts: when, where, call, clothes, pickup. ──────────────── */
  s('next concert', 'concert', { when: 'next' }),
  s('when is the next concert', 'concert', { when: 'next' }),
  s('when is the nutcracker', 'concert', { about: 'nutcracker' }),
  s('nutcraker', 'concert', { about: 'nutcracker' }),
  s('when is the winter concert', 'concert', { about: 'winter' }),
  s('concerto concert', 'concert', { about: 'concerto' }),
  s('where is the lyric', 'concert', { about: 'lyric' }),
  s('what time does the concert start', 'concert', { when: 'next' }),
  s('side by side', 'concert', { about: 'side by side' }),
  s('when is the arsht concert', 'concert', { about: 'arsht' }),
  s('jazz combos concert', 'concert', { about: 'jazz combos' }),
  s('how many concerts are left', 'concert'),
  s('concerts', 'concert'),
  s('next perf', 'concert', { when: 'next' }),
  s('midnite ball', 'concert', { about: 'midnight ball' }),
  s('cuando es el concierto', 'concert', { ...es, when: 'next' }),
  s('a que hora es el concierto', 'concert', { ...es, when: 'next' }),
  s('proximo concierto', 'concert', { ...es, when: 'next' }),
  p('what concerts are coming up this year', 'concert'),
  p('where is the concert monday', 'concert', { when: 'weekday:mon' }),
  p('address for the fillmore', 'concert', { about: 'fillmore' }),
  p('how much are tickets', 'concert', { when: 'next' }),
  p('donde es el concierto', 'concert', { ...es, when: 'next' }),
  s('call time', 'callTime', { when: 'next' }),
  s('what time is call friday', 'callTime', { when: 'weekday:fri' }),
  s('call time sat', 'callTime', { when: 'weekday:sat' }),
  s('when do i have to be there', 'callTime', { when: 'next' }),
  s('what time do we get there for nutcracker', 'callTime', { about: 'nutcracker' }),
  s('hora de llegada', 'callTime', { ...es, when: 'next' }),
  p('what time does he need to be at the concert', 'callTime', { when: 'next' }),
  s('what do i wear', 'dress', { when: 'next' }),
  s('do i need to wear black', 'dress', { when: 'next' }),
  s('concert black?', 'dress', { when: 'next' }),
  s('dress code for jazz concert', 'dress', { about: 'jazz' }),
  s('que me pongo', 'dress', { ...es, when: 'next' }),
  p('what should my student wear on stage', 'dress', { when: 'next' }),
  p('what time is pickup friday', 'pickup', { when: 'weekday:fri' }),
  p('when and where do i pick up my student after the concert', 'pickup', { when: 'next' }),
  p('what time is it over', 'pickup', { when: 'next' }),
  p('a que hora la recojo', 'pickup', { ...es, when: 'next' }),
  s('which concerts are required', 'required'),
  s('required concerts', 'required'),
  s('do i have to go to the choir concert', 'required', { about: 'choir' }),
  s('how many concerts do i need to attend', 'required'),
  s('is the faculty recital required', 'required', { about: 'faculty recital' }),
  s('conciertos obligatorios', 'required', es),

  /* ── 10. The school. ───────────────────────────────────────────────── */
  s('is there school monday', 'noSchool', { when: 'weekday:mon' }),
  s('no school', 'noSchool', { when: 'next' }),
  s('is there school tomorrow', 'noSchool', { when: 'tomorrow' }),
  s('when is thanksgiving break', 'noSchool', { about: 'thanksgiving' }),
  s('when does winter break start', 'noSchool', { about: 'winter break' }),
  s('when do we come back', 'noSchool', { when: 'next' }),
  s('is mdc open monday', 'noSchool', { when: 'weekday:mon', about: 'mdc' }),
  s('when are finals', 'noSchool', { about: 'finals' }),
  s('when does the quarter end', 'noSchool', { about: 'quarter' }),
  s('hay clases mañana', 'noSchool', { ...es, when: 'tomorrow' }),
  p('is there school friday', 'noSchool', { when: 'weekday:fri' }),
  s('symphony', 'group', { about: 'symphony' }),
  s('wind ensemble', 'group', { about: 'wind ensemble' }),
  s('who is in camerata', 'group', { about: 'camerata' }),
  s('who conducts wind ensemble', 'group', { about: 'wind ensemble' }),
  s('who teaches ap theory', 'group', { about: 'ap theory' }),
  s('gilman', 'group', { about: 'gilman' }),
  s('cco', 'group', { about: 'college chamber orchestra' }),
  s('opera workshop', 'group', { about: 'opera workshop' }),
  s('holberg', 'piece', { about: 'holberg' }),
  s('tchaik 5', 'piece', { about: 'symphony no. 5' }),
  s('lincoln portrait', 'piece', { about: 'lincoln portrait' }),
  s('radetzky march', 'piece', { about: 'radetzky' }),
  s('program notes for cendrillon', 'piece', { about: 'cendrillon' }),
  s('announcements', 'news'),
  s('whats new', 'news'),
  s('did anyone find a bass bow', 'news', { about: 'bass bow' }),
  s('who has stands and chairs duty', 'news', { about: 'stands and chairs' }),
  s('all state results', 'news', { about: 'all-state' }),
  s('anuncios', 'news', es),
  s('syllabus', 'documents'),
  s('camerata syllabus', 'documents', { about: 'camerata' }),
  s('study guide', 'documents', { about: 'study guide' }),
  s('scales', 'documents', { about: 'scale' }),
  s('orchestra librarian job', 'documents', { about: 'librarian' }),
  p('handbook', 'documents'),

  /* ── 11. How do I. Answered with the door, not an essay. ───────────── */
  s('im gonna be absent friday', 'howAbsence', { when: 'weekday:fri', answer: 'link' }),
  s('i have to miss rehearsal', 'howAbsence', { answer: 'link' }),
  s('im sick', 'howAbsence', { when: 'today', answer: 'link' }),
  s('leaving early today', 'howAbsence', { when: 'today', answer: 'link' }),
  s('i have a dentist appointment thursday', 'howAbsence', { when: 'weekday:thu', answer: 'link' }),
  s('report absence', 'howAbsence', { answer: 'link' }),
  s('voy a faltar mañana', 'howAbsence', { ...es, when: 'tomorrow', answer: 'link' }),
  p('my student will be absent who do i tell', 'howAbsence', { answer: 'link' }),
  p('she wont be at school tomorrow', 'howAbsence', { when: 'tomorrow', answer: 'link' }),
  p('out sick', 'howAbsence', { when: 'today', answer: 'link' }),
  p('mi hijo esta enfermo', 'howAbsence', { ...es, when: 'today', answer: 'link' }),
  s('how do i turn in my playing exam', 'howSubmit', { answer: 'link' }),
  s('submit video', 'howSubmit', { answer: 'link' }),
  s('did my video upload', 'howSubmit', { answer: 'link' }),
  s('can i send a better take', 'howSubmit', { answer: 'link' }),
  s('como entrego mi examen', 'howSubmit', { ...es, answer: 'link' }),
  s('check in', 'howCheckin', { answer: 'link' }),
  s('how do i check in', 'howCheckin', { answer: 'link' }),
  s('i forgot to check out', 'howCheckin', { answer: 'link' }),
  s('how many concerts have i gone to', 'howCheckin', { answer: 'link' }),
  s('did my check in count', 'howCheckin', { answer: 'link' }),
  s('registrar llegada', 'howCheckin', { ...es, answer: 'link' }),
  s('add to my calendar', 'howCalendar', { answer: 'link' }),
  s('can i get the schedule on my phone', 'howCalendar', { answer: 'link' }),
  p('subscribe to calendar', 'howCalendar', { answer: 'link' }),
  s('i lost my music', 'howCopy', { answer: 'link' }),
  s('i need a copy of my part', 'howCopy', { answer: 'link' }),
  s('bad page turn', 'howCopy', { answer: 'link' }),
  s('turn on alerts', 'howAlerts', { answer: 'link' }),
  p('can i get a text when rehearsal is cancelled', 'howAlerts', { answer: 'link' }),
  s('find my schedule', 'howFindMe', { answer: 'link' }),
  s('not me', 'howFindMe', { answer: 'link' }),
  p('i have two kids in the program', 'howFindMe', { answer: 'link' }),
  p('send to my other phone', 'howFindMe', { answer: 'link' }),
  p('esta en español', 'howFindMe', { ...es, answer: 'link' }),
  s('what does call time mean', 'glossary', { about: 'call time' }),
  s('whats a sectional', 'glossary', { about: 'sectional' }),
  s('what is a pull out', 'glossary', { about: 'pull-out' }),
  p('what does downbeat mean', 'glossary', { about: 'downbeat' }),

  /* ── 12. The honest no, on the public side. ────────────────────────── */
  // Staff-only facts: the public engine has no way to reach them, and says so.
  s('whats my grade', 'none', { answer: 'none' }),
  s('what did i get on the playing exam', 'none', { answer: 'none' }),
  s('how many absences do i have', 'none', { answer: 'none' }),
  s('was i marked late', 'none', { answer: 'none' }),
  p('is my daughter passing', 'none', { answer: 'none' }),
  p('que nota tiene mi hijo', 'none', { ...es, answer: 'none' }),
  // Somebody else. Looking a person up stays the lookup page's job.
  s('where is {classmate}', 'none', { answer: 'none' }),
  s('what is {classmate} playing', 'none', { answer: 'none' }),
  s('{classmate} phone number', 'none', { answer: 'none' }),
  s('who is absent today', 'none', { answer: 'none' }),
  s('who hasnt turned in the exam', 'none', { answer: 'none' }),
  // Things the Hub does not hold.
  p('where do i park', 'none', { answer: 'none' }),
  p('is the concert livestreamed', 'none', { answer: 'none' }),
  s('whats for lunch', 'none', { answer: 'none' }),
  s('what is the wifi password', 'none', { answer: 'none' }),
  s('will it rain', 'none', { answer: 'none' }),
  s('asdf', 'none', { answer: 'none' }),
  // Found by an independent review of the first parser (2026-11-11). Each of
  // these got a confident answer. The self-check also runs every
  // `{classmate}` line with 48 ordinary first names, because the made-up
  // stand-in only passed for being unusual.
  s('is {classmate} in camerata', 'none', { answer: 'none' }),
  // "ill" is how a thumb types "I'll". These are promises to come, not sick notes.
  s('ill be there', 'none', { answer: 'none' }),
  s('ill be at the concert', 'none', { answer: 'none' }),
  s('ill be at rehearsal tomorrow', 'none', { answer: 'none' }),
  // A grade or the attendance record, asked without the tell-tale words.
  s('how did i do on the playing exam', 'none', { answer: 'none' }),
  s('did i do ok on the test', 'none', { answer: 'none' }),
  s('how was my exam', 'none', { answer: 'none' }),
  s('was i absent', 'none', { answer: 'none' }),
  s('did i miss rehearsal', 'none', { answer: 'none' }),
  // Time signatures are not dates.
  s('what is 4/4', 'none', { answer: 'none' }),
  s('3/4 time', 'none', { answer: 'none' }),
  s('2/4', 'none', { answer: 'none' }),
  // A loose beginning is not a short form: these used to find the Concerto
  // concert and Opera Workshop.
  s('when is the next conc', 'none', { answer: 'none' }),
  s('do we have work today', 'none', { answer: 'none' }),

  /* ── 12b. Found by a second independent review (2026-11-11). ────────── */
  // 41 of 271 unseen questions got a confident wrong answer. Every one the
  // reviewer named is a line here, with a few more of the same kind.
  //
  // A grade or the roll, asked by a parent or about "he" and "she". The
  // refusals used to cover only "I".
  p('how did my son do on the exam', 'none', { answer: 'none' }),
  p('how did my daughter do on her playing exam', 'none', { answer: 'none' }),
  p('did my son do ok on the test', 'none', { answer: 'none' }),
  s('how was the exam', 'none', { answer: 'none' }),
  p('was my son absent', 'none', { answer: 'none' }),
  p('was he absent', 'none', { answer: 'none' }),
  p('is he absent today', 'none', { answer: 'none' }),
  p('esta mi hijo ausente', 'none', { ...es, answer: 'none' }),
  p('did my son miss rehearsal', 'none', { answer: 'none' }),
  p('did my son miss class today', 'none', { answer: 'none' }),
  p('was my son at rehearsal today', 'none', { answer: 'none' }),
  p('was she at rehearsal', 'none', { answer: 'none' }),
  p('did my son show up today', 'none', { answer: 'none' }),
  p('is he in class today', 'none', { answer: 'none' }),
  s('my results', 'none', { answer: 'none' }),
  // Somebody's contact details, and an address that is nobody's concert.
  p('what is her address', 'none', { answer: 'none' }),
  p('what is his address', 'none', { answer: 'none' }),
  s('my address', 'none', { answer: 'none' }),
  // An ordinary word one letter from a name, or sitting inside a title, is
  // still an ordinary word. These found a class, a teacher and two pieces.
  s('spring', 'none', { answer: 'none' }),
  s('marcato', 'none', { answer: 'none' }),
  s('cabbage', 'none', { answer: 'none' }),
  s('is it cooler today', 'none', { answer: 'none' }),
  s('bottle', 'none', { answer: 'none' }),
  s('fiction', 'none', { answer: 'none' }),
  s('go away', 'none', { answer: 'none' }),
  s('well', 'none', { answer: 'none' }),
  s('spring concert', 'concert', { about: 'spring' }),
  s('when is the spring concert', 'concert', { about: 'spring' }),
  // A person where a search topic goes.
  s('results for {classmate}', 'none', { answer: 'none' }),
  s('did anyone find {classmate}', 'none', { answer: 'none' }),
  // A holiday is a day off, unless it is the Holiday Concert.
  s('is monday a holiday', 'noSchool', { when: 'weekday:mon' }),
  s('when is the next holiday', 'noSchool', { when: 'next' }),
  s('holidays', 'noSchool', { when: 'next' }),
  s('is there a holiday this week', 'noSchool', { when: 'thisWeek' }),
  s('holiday schedule', 'noSchool', { when: 'next' }),
  s('christmas break', 'noSchool', { about: 'christmas break' }),
  // "In march" is the month, never the Radetzky March, and "friday night"
  // is Friday, never a piece with "night" in it.
  s('concerts in march', 'concert', { when: 'month:03' }),
  s('whats in march', 'myDay', { when: 'month:03' }),
  s('concerts in october', 'concert', { when: 'month:10' }),
  s('concerts in december', 'concert', { when: 'month:12' }),
  s('december concert', 'concert', { when: 'month:12' }),
  s('concert friday night', 'concert', { when: 'weekday:fri' }),
  s('rehearsal tomorrow night', 'myDay', { when: 'tomorrow' }),
  s('this afternoon', 'myDay', { when: 'today' }),
  s('tmrw morning', 'myDay', { when: 'tomorrow' }),
  s('esta tarde', 'myDay', { ...es, when: 'today' }),
  s('hoy en la noche', 'myDay', { ...es, when: 'tonight' }),
  s('15 dec', 'myDay', { when: 'date:12-15' }),
  s('9 diciembre', 'myDay', { ...es, when: 'date:12-09' }),
  s('the 15th', 'myDay', { when: 'day:15' }),
  s('is there rehearsal the 20th', 'myDay', { when: 'day:20' }),
  // An ordinal is a day only in a question about a day.
  s('bowings on the 2nd', 'none', { answer: 'none' }),
  s('am i the 2nd', 'none', { answer: 'none' }),
  p('is my son playing friday', 'myDay', { when: 'weekday:fri' }),
  // Words that fired on too little.
  s('call the school', 'none', { answer: 'none' }),
  s('call me', 'none', { answer: 'none' }),
  s('how was the concert', 'none', { answer: 'none' }),
  s('end of quarter concert', 'none', { answer: 'none' }),
  // A class and three rooms all fit "theater": it could be any of them.
  s('where is the theater', 'none', { answer: 'none' }),
  s('where is the black box', 'where', { about: 'black box', answer: 'link' }),
  s('do we need black for the concert', 'dress', { when: 'next' }),
  // Common enough to read correctly: what thumbs do to "rehearsal", a
  // parent's own child, and two ways of saying "cannot come" in Spanish.
  s('rehersal tomorrow', 'myDay', { when: 'tomorrow' }),
  s('what are we rehersing', 'playing', { when: 'today' }),
  s('wen is nxt concert', 'concert', { when: 'next' }),
  p('my sons schedule', 'myDay', { when: 'today' }),
  p('my daughters rehearsal tomorrow', 'myDay', { when: 'tomorrow' }),
  p('when is my sons lesson', 'lesson', { when: 'next' }),
  s('como reporto una ausencia', 'howAbsence', { ...es, answer: 'link' }),
  p('mi hija no puede ir mañana', 'howAbsence', { ...es, when: 'tomorrow', answer: 'link' }),
  // "WE" in capitals is Wind Ensemble, but not after "are" or "do".
  s('where are WE today', 'where', { when: 'today' }),

  /* ── 13. The director's side (built in January). ───────────────────── */
  d('where is {classmate}', 'staffWhereIs', { when: 'today' }),
  d('where is {classmate} right now', 'staffWhereIs', { when: 'today' }),
  d('is {classmate} here today', 'staffWhereIs', { when: 'today' }),
  d('whos out today', 'staffWhosOut', { when: 'today' }),
  d('who is out friday', 'staffWhosOut', { when: 'weekday:fri' }),
  d('who is excused from the nutcracker', 'staffWhosOut', { about: 'nutcracker' }),
  d('who is pulled out of symphony today', 'staffWhosOut', { when: 'today', about: 'symphony' }),
  d('absences this week', 'staffWhosOut', { when: 'thisWeek' }),
  // From staff this is a question about the roll. It used to be heard as
  // somebody reporting an absence.
  d('was {classmate} absent', 'staffWhosOut'),
  d('was he absent', 'staffWhosOut'),
  d('what is waiting on me', 'staffWaiting'),
  d('requests', 'staffWaiting'),
  d('any absence reports today', 'staffWaiting', { when: 'today' }),
  d('copy requests', 'staffWaiting'),
  d('approvals', 'staffWaiting'),
  d('who hasnt turned in the playing exam', 'staffMissing', { about: 'playing exam' }),
  d('who hasnt signed the field trip form', 'staffMissing', { about: 'field trip' }),
  // "Last night" is behind us and AskWhen has no word for the past, so no
  // date is expected here. It was 'next', which means the one still to come.
  d('who didnt check in last night', 'staffMissing'),
  d('who has not submitted camerata exam 2', 'staffMissing', { about: 'camerata playing exam' }),
  d('lessons i havent logged', 'staffMissing'),
  d('what rolls are left today', 'staffMissing', { when: 'today' }),
  d('missing emergency contacts', 'staffMissing'),
  d('whats on thursday', 'staffDay', { when: 'weekday:thu' }),
  d('what is in 4302 tomorrow', 'staffDay', { when: 'tomorrow', about: '4302' }),
  d('is chapman free friday', 'staffDay', { when: 'weekday:fri', about: 'chapman' }),
  d('next concert', 'staffDay', { when: 'next' }),
  d('who is playing at violin masterclass friday', 'staffDay', { when: 'weekday:fri', about: 'violin masterclass' }),
  d('when does the quarter end', 'staffDay', { about: 'quarter' }),
  d('camerata roster', 'staffRoster', { about: 'camerata' }),
  d('cellos in symphony', 'staffRoster', { about: 'symphony' }),
  d('seniors', 'staffRoster'),
  d('how many in wind ensemble', 'staffRoster', { about: 'wind ensemble' }),
  d('who studies with marcano', 'staffRoster', { about: 'marcano' }),
  d('call {classmate} mom', 'staffContact'),
  d('{classmate} parent email', 'staffContact'),
  d('email camerata parents', 'staffContact', { about: 'camerata' }),
  // Things to DO open the door already filled in. Nothing is written by the search.
  d('cancel rehearsal tomorrow', 'staffDo', { when: 'tomorrow', answer: 'link' }),
  d('move symphony to chapman today', 'staffDo', { when: 'today', about: 'symphony', answer: 'link' }),
  d('add a sectional friday 2:10', 'staffDo', { when: 'weekday:fri', about: 'sectional', answer: 'link' }),
  d('post an announcement', 'staffDo', { answer: 'link' }),
  d('take roll', 'staffDo', { when: 'today', answer: 'link' }),
  d('excuse {classmate} from the concert', 'staffDo', { answer: 'link' }),
  d('new form', 'staffDo', { answer: 'link' }),
  d('gradebook', 'staffDo', { answer: 'link' }),
];
