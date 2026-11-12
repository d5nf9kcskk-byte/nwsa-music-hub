/**
 * Ask, the staff side's words (#ask, design 3.8).
 *
 * Every staff phrasing lives HERE, not in src/shared/ask/. That is the
 * boundary: the public bundle carries none of these tables, so the public
 * parser does not refuse "who is out today" by remembering to; it has never
 * heard of it. `parseStaffAsk` is the public parser with these added on top.
 *
 * Still only the understanding half. Nothing here reads a record, and a
 * person's name is never resolved: on a "where is <somebody>" the words are
 * left alone for the staff answerer, which reads through the staff's own
 * listeners so the rules decide what each role sees.
 *
 * Pure, and loadable by plain Node (relative imports carry `.ts`).
 * staffAsk.selfcheck.ts runs it over the staff lines of the corpus.
 */

import {
  ASK_INSTRUMENTS, parseAsk,
  type AskName, type AskParse, type AskStaffSide,
} from '../../shared/ask/parse.ts';

export const STAFF_SIDE: AskStaffSide = {
  /** Tried before the public rules. First match wins. */
  rules: [
    { intent: 'staffDo', re: /^take (?:roll|attendance)\b/, when: 'today' },
    { intent: 'staffDo', re: /^(?:cancel|move|add|post|excuse|create)\b|^new (?:form|announcement)\b|^(?:open )?(?:the )?gradebook\b/, also: /\bannouncement\b/, person: true },
    { intent: 'staffContact', re: /\b(?:call(?! time)|email|text|phone|contact)\b|\b(?:parents?|mom|dad|mother|father|guardians?)\b/, person: true },
    { intent: 'staffMissing', re: /\bwho (?:hasnt|has not|havent|have not|didnt|did not)(?: (?:turned in|submitted|signed|filled out|checked (?:in|out)|check (?:in|out)|sent|logged))?\b|\bwho (?:still )?owes\b|\bhavent (?:logged|taken)\b|\brolls?(?: are)? left\b|\bmissing\b/, also: /\bemergency contacts?\b|\brolls?\b/ },
    { intent: 'staffWaiting', re: /\bwaiting (?:on|for) me\b|\brequests?\b|\bapprovals?\b|\babsence reports?\b/, also: /\bcopy\b/ },
    { intent: 'staffWhosOut', re: /\bwho(?:s| is) (?:out|absent|excused|pulled(?: out)?)\b|\babsences\b|\bexcused\b|\bpulled out\b|\bquien(?:es)? faltan?\b/ },
    // "Was he absent", "is <somebody> absent": a question about the roll, not
    // somebody reporting an absence, which is what the public rule would hear.
    { intent: 'staffWhosOut', re: /^(?:is|was|are|were|esta|estuvo)\b.*\b(?:absent|ausente|tardy)\b/, person: true },
    { intent: 'staffRoster', re: new RegExp(`\\broster\\b|\\b(?:seniors|juniors|sophomores|freshmen)\\b|\\bhow many in\\b|\\bwho studies with\\b|\\b(?:${[...ASK_INSTRUMENTS].join('|')}) in\\b`), topic: true },
    { intent: 'staffWhereIs', re: /\bhere\b|\bin the building\b|\bon campus\b/, person: true },
    { intent: 'staffDay', re: /\bwhat(?:s| is) (?:in|on)\b|\bfree\b|\bwho(?:s| is) playing\b/ },
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
};

export function parseStaffAsk(text: string, names: readonly AskName[]): AskParse {
  return parseAsk(text, names, STAFF_SIDE);
}
