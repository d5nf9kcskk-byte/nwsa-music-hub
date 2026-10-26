/**
 * Concerts a group must ATTEND as audience without playing (#required-audience).
 *
 * Students said it was not obvious enough: the requirement lived in a purple
 * box halfway down the event page, and the concert card everyone actually
 * sees (Home, Calendar, an ensemble page) said only who PLAYS. So a Symphony
 * member looking at "Opera Scenes — College Chamber Orchestra" had no reason
 * to think it was theirs. The card now says it, and `/required-concerts` lists
 * them all in one place.
 *
 * The facts are the ones `studentExpectation()` already reads
 * (`attendanceEnsembleIds` / `attendanceStudentIds`); nothing new is stored.
 * Grade excusals (seniors) stay with `audienceExcusal.ts` and the per-student
 * answer stays with `studentExpectation()`; this module answers only the
 * per-EVENT and per-GROUP questions a list needs.
 *
 * Zero imports on purpose, like `audienceExcusal.ts`, so the self-check runs
 * under plain Node type stripping.
 */

interface AudienceEvent {
  date: string;
  ensembleIds?: string[];
  startTime?: string;
  attendanceEnsembleIds?: string[];
  attendanceStudentIds?: string[];
}

/**
 * Groups required in the audience, blanks dropped. A group that also PLAYS
 * the concert is dropped too: the Showcase lists every group in both places,
 * and "Philharmonic must be in the audience, even though they are not
 * performing" is false about a group on the program (`studentExpectation`
 * answers performer first for the same reason).
 */
export function audienceEnsembleIds(e: AudienceEvent): string[] {
  const playing = new Set(e.ensembleIds ?? []);
  return (e.attendanceEnsembleIds ?? []).filter(id => id && !playing.has(id));
}

/** Does anybody have to come to this one without playing? */
export function hasAudienceRequirement(e: AudienceEvent): boolean {
  return audienceEnsembleIds(e).length > 0 || (e.attendanceStudentIds ?? []).some(Boolean);
}

/**
 * Every event with an audience requirement, date order. With `ensembleId`,
 * only the ones THAT group must attend: a group that merely performs on a
 * concert is not "required to attend" it, it is playing it.
 */
export function requiredAudienceEvents<E extends AudienceEvent>(events: E[], ensembleId?: string): E[] {
  return events
    .filter(e => ensembleId ? audienceEnsembleIds(e).includes(ensembleId) : hasAudienceRequirement(e))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));
}
