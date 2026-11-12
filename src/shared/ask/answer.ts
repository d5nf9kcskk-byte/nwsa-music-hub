/**
 * Ask, the answering half (#ask): `answerAsk(reading, data, opts)`.
 *
 * The code is one folder down, in ./answer/answerAsk.ts, and this file only
 * passes it on. The reason is the parser's own check: ask.selfcheck.ts fails
 * if a file in THIS folder imports anything but this folder and ../fuzzy.ts,
 * which is what keeps the parser free of every record. The answering half
 * has to read records (through `studentDay` and the pages' own filters), so
 * it lives where that rule does not reach and carries an allowlist of its
 * own, pinned by answer.selfcheck.ts.
 */
export * from './answer/answerAsk.ts';
