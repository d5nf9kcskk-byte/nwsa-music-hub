/**
 * Pins the Required Concerts list (#required-audience):
 *   1. A group listed only as PERFORMER is not "required to attend" it.
 *   2. A group in `attendanceEnsembleIds` is, and the list is date order.
 *   3. An event with nobody in the audience lists never appears.
 *   4. A group in BOTH lists is playing, so it is not in the audience.
 *   5. A concert with only individually named attendees appears under "all"
 *      but under no group.
 */
/// <reference types="node" />
import { requiredAudienceEvents, hasAudienceRequirement } from './requiredAudience.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const SYM = 'symphony-orchestra', CCO = 'college-chamber-orchestra';
const ev = (id: string, date: string, ensembleIds: string[], attendanceEnsembleIds: string[] = [], attendanceStudentIds: string[] = [], startTime?: string) =>
  ({ id, date, ensembleIds, attendanceEnsembleIds, attendanceStudentIds, startTime });

const opera = ev('opera', '2026-10-26', [CCO], [SYM], [], '18:30');
const early = ev('early', '2026-10-26', [CCO], [SYM], [], '10:00');
const symOwn = ev('sym', '2026-11-05', [SYM]);
const named = ev('named', '2026-09-01', [CCO], [], ['stu1']);
const blanks = ev('blanks', '2026-09-02', [CCO], [''], ['']);
const both = ev('both', '2026-12-01', [SYM, CCO], [SYM, CCO]);
const all = [symOwn, opera, named, early, blanks, both];

const sym = requiredAudienceEvents(all, SYM).map(e => e.id);
assert(!sym.includes('sym'), '1: performing is not attending');
assert(sym.join() === 'early,opera', `2: audience group listed in date/time order, got ${sym}`);
assert(!hasAudienceRequirement(symOwn) && !hasAudienceRequirement(blanks), '3: no audience list, not required');
assert(!hasAudienceRequirement(both) && !sym.includes('both'), '4: playing beats the audience list');
assert(requiredAudienceEvents(all).map(e => e.id).join() === 'named,early,opera', '5: all = every audience requirement');
assert(requiredAudienceEvents(all, CCO).length === 0, '5: named attendees belong to no group');

console.log('requiredAudience self-check: OK');
