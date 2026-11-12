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

export const STAFF_SIDE: AskStaffSide = {
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
    { intent: 'staffRoster', re: new RegExp(`\\broster\\b|\\bwho(?:s| is) in\\b|\\b(?:seniors|juniors|sophomores|freshmen)\\b|\\bhow many in\\b|\\bwho studies with\\b|\\b(?:${[...ASK_INSTRUMENTS].join('|')}) in\\b`), topic: true },
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
  oneWord: ['requests', 'approvals', 'seniors', 'juniors', 'sophomores', 'freshmen', 'gradebook', 'absences'],
};

export function parseStaffAsk(text: string, names: readonly AskName[]): AskParse {
  return parseAsk(text, names, STAFF_SIDE);
}
