/**
 * Ask, the staff side's words (#ask, design 3.8).
 *
 * Every staff phrasing lives HERE, not in src/shared/ask/. That is the
 * boundary: the public bundle carries none of these tables, so the public
 * parser does not refuse "who is out today" by remembering to; it has never
 * heard of it. `parseStaffAsk` is the public parser with these added on top.
 *
 * The same discipline as the public side: every rule is tried, two
 * different intents firing is a conflict unless `precedence` settles that
 * pair with a sentence that says why, and every word must be accounted for.
 *
 * Still only the understanding half. Nothing here reads a record, and a
 * person's name is never resolved: it comes back as typed (`person`, and
 * `about` when nothing else is named) for the staff answerer, which reads
 * through the staff's own listeners so the rules decide what each role sees.
 *
 * NOT HERE YET: a staff member asking for one student's day ("what does
 * <name> have today"). "Where is <name>" is the only person question.
 *
 * Pure, and loadable by plain Node (relative imports carry `.ts`).
 * staffAsk.selfcheck.ts runs it over the staff lines of the corpus.
 */

import {
  ASK_INSTRUMENTS, parseAsk,
  type AskName, type AskParse, type AskStaffSide,
} from '../../shared/ask/parse.ts';
import { compileTemplates, type AskTemplate } from '../../shared/ask/templates.ts';

const T = (intent: AskTemplate['intent'], t: string, when?: AskTemplate['when']): AskTemplate =>
  (when === undefined ? { intent, t } : { intent, t, when });

/**
 * The staff side's whole-sentence templates: the only way to a confident
 * staff answer. Same mini-language as src/shared/ask/templates.ts. PERSON is
 * one to three words that are a name; it comes back as `person`, as typed,
 * and is never looked up here.
 */
export const STAFF_TEMPLATES: AskTemplate[] = [
  T('staffWhereIs', 'where is PERSON DATE?'),
  T('staffWhereIs', 'is PERSON here DATE?'),
  T('staffWhosOut', 'who is [out|absent|excused] DATE?'),
  T('staffWhosOut', 'who was [out|absent|excused] DATE'),
  T('staffWhosOut', 'absences DATE?'),
  T('staffWhosOut', 'who is excused from THE? NEXT? CON'),
  T('staffWhosOut', 'who is excused from THE? EVENT'),
  T('staffWhosOut', 'who is pulled out of GROUP DATE?'),
  T('staffWhosOut', '[is|was] PERSON absent DATE?'),
  T('staffWaiting', 'what is waiting [on|for] me'),
  T('staffWaiting', '[requests|approvals|copy requests]'),
  T('staffWaiting', 'any? absence reports DATE?'),
  T('staffMissing', 'who [hasnt|has not|didnt|did not] [turned in|turn in|submitted|submit] the {playing exam}'),
  T('staffMissing', 'who [hasnt|has not|didnt|did not] [turned in|turn in|submitted|submit] THE? TASK'),
  T('staffMissing', 'who [hasnt|has not|didnt|did not] [signed|sign|filled out|fill out] THE? FORM'),
  T('staffMissing', 'who [didnt|did not|hasnt|has not] [check in|checked in|check out|checked out] DATE?'),
  T('staffMissing', 'lessons i havent logged'),
  T('staffMissing', 'what rolls are left DATE?'),
  T('staffMissing', 'missing emergency contacts'),
  T('staffDay', 'what is [in|on] DATE'),
  T('staffDay', 'what is in ROOM DATE?'),
  T('staffDay', 'is ROOM free DATE?'),
  T('staffDay', 'who is playing at THE? GROUP! DATE?'),
  T('staffRoster', 'GROUP roster'),
  T('staffRoster', 'roster for GROUP'),
  T('staffRoster', 'who is in GROUP'),
  T('staffRoster', 'how many in GROUP'),
  T('staffRoster', 'INSTRS in GROUP'),
  T('staffRoster', '[seniors|juniors|sophomores|freshmen]'),
  T('staffContact', '[call|email|text] PERSON [mom|dad|parent|parents]?'),
  T('staffContact', 'PERSON [parent|parents|mom|dad] [email|phone|number]?'),
  T('staffContact', '[call|email|text] GROUP parents'),
  T('staffDo', 'cancel THE? REH DATE'),
  T('staffDo', 'cancel GROUP DATE?'),
  T('staffDo', 'move GROUP to ROOM DATE?'),
  T('staffDo', 'add a {sectional} DATE'),
  T('staffDo', 'post an? announcement'),
  T('staffDo', 'take [roll|attendance]', 'today'),
  T('staffDo', 'excuse PERSON from THE? NEXT? CON'),
  T('staffDo', 'excuse PERSON from THE? EVENT'),
  T('staffDo', 'new [form|announcement]'),
  T('staffDo', 'open? the? gradebook'),
];
const STAFF_MACROS = { INSTRS: [...ASK_INSTRUMENTS].filter(w => w.endsWith('s')).join('|') };

export const STAFF_SIDE: AskStaffSide = {
  templates: compileTemplates(STAFF_TEMPLATES, STAFF_MACROS),
  rules: [
    { intent: 'staffDo', re: /^take (?:roll|attendance)$/, when: 'today' },
    // A thing to do needs the thing: "cancel" alone opens nothing.
    { intent: 'staffDo', re: /^(?:cancel|move|add|create)\b/, thing: true },
    { intent: 'staffDo', re: /^post (?:an? )?announcement$|^new (?:form|announcement)$|^(?:open )?(?:the )?gradebook$/ },
    { intent: 'staffDo', re: /^excuse\b/, also: /\bfrom\b/, person: true },
    { intent: 'staffContact', re: /\b(?:call|email|text|phone|contact)\b|\b(?:parents?|mom|dad|mother|father|guardians?)\b/, person: true, thing: true },
    { intent: 'staffMissing', re: /\bwho (?:hasnt|has not|havent|have not|didnt|did not)(?: (?:turned in|submitted|signed|filled out|checked (?:in|out)|check (?:in|out)|sent|logged))?\b|\bwho (?:still )?owes\b|\bhavent (?:logged|taken)\b|\brolls?(?: are)? left\b|\bmissing\b/, also: /\bemergency contacts?\b|\brolls?\b/ },
    { intent: 'staffWaiting', re: /\bwaiting (?:on|for) me\b|\brequests?\b|\bapprovals?\b|\babsence reports?\b/, also: /\bcopy\b/ },
    { intent: 'staffWhosOut', re: /\bwho(?:s| is| was| were) (?:out|absent|excused|pulled(?: out)?)\b|\babsences\b|\bexcused\b|\bpulled out\b|\bquien(?:es)? faltan?\b/, also: /\bfrom\b/ },
    // "Was he absent", "is <somebody> absent": a question about the roll, not
    // somebody reporting an absence, which is what the public rule would hear.
    { intent: 'staffWhosOut', re: /\b(?:absent|ausente|tardy)\b/, with: /^(?:is|was|are|were|esta|estuvo)\b/, person: true },
    // "Who is in camerata" is the roster. "Who is in today" names no group.
    { intent: 'staffRoster', re: /\bwho(?:s| is) in\b/, thing: true },
    { intent: 'staffRoster', re: new RegExp(`\\broster\\b|\\b(?:seniors|juniors|sophomores|freshmen)\\b|\\bhow many in\\b|\\bwho studies with\\b|\\b(?:${[...ASK_INSTRUMENTS].join('|')}) in\\b`), topic: true },
    { intent: 'staffWhereIs', re: /\bhere\b|\bin the building\b|\bon campus\b/, also: /\bright\b/, person: true },
    { intent: 'staffDay', re: /\bwhat(?:s| is) (?:in|on)\b|\bfree\b|\bwho(?:s| is) playing\b/ },
  ],
  /** [wins, over, a sentence in which both fire]. The self-check runs each. */
  precedence: [
    ['staffDo', 'myDay', 'cancel rehearsal tomorrow'],
    ['staffDo', 'concert', 'cancel the concert'],
    ['staffMissing', 'due', 'who hasnt turned in the playing exam'],
    ['staffMissing', 'lesson', 'lessons i havent logged'],
    ['staffWhosOut', 'howAbsence', 'was he absent'],
    ['staffDay', 'myDay', 'who is playing at masterclass friday'],
    ['staffRoster', 'group', 'who is in camerata'],
  ],
  kinds: {
    staffWhosOut: ['group', 'concert'],
    staffMissing: ['assignment', 'form', 'concert', 'group'],
    staffDay: ['group', 'room', 'concert', 'venue'],
    staffRoster: ['group'],
    staffContact: ['group'],
    staffDo: ['group', 'room', 'concert'],
  },
  whenDefault: { staffWhereIs: ['today', 'today'] },
  /** From staff, a schedule question is about the whole building. */
  widen: { myDay: 'staffDay', concert: 'staffDay', noSchool: 'staffDay' },
  wherePerson: 'staffWhereIs',
  roomOnDate: 'staffDay',
  dayIntents: ['staffWhereIs', 'staffWhosOut', 'staffWaiting', 'staffMissing', 'staffDay', 'staffDo'],
  oneWord: ['requests', 'approvals', 'seniors', 'juniors', 'sophomores', 'freshmen', 'gradebook', 'absences'],
};

/**
 * `people` is the roster, as full names, for this one call. A question
 * about a person ("where is <name>") is answered only when every word of
 * the name typed is a word of one name on it. Leave it out and those
 * questions come back as suggestions, with the name as typed in `person`.
 * Nothing is kept between calls.
 */
export function parseStaffAsk(text: string, names: readonly AskName[], people?: readonly string[]): AskParse {
  return parseAsk(text, names, people ? { ...STAFF_SIDE, people } : STAFF_SIDE);
}
