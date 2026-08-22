/**
 * Shared (combined) blocks — the ONE definition of "these ensembles rehearse
 * TOGETHER, in one room, at one downbeat".
 *
 * A CalendarEvent already carries `ensembleIds: string[]` and a single
 * `location`, so the shape was always expressible. What was missing is the
 * MEANING: a rehearsal tagged with two ensembles could equally mean "combined
 * pops rehearsal in 4302" or "this concerns both groups". Nothing downstream
 * could tell, so a real combined block read as a double-booking — the student
 * appeared to be in two rooms at once, and a director had to fake it by
 * creating one event per ensemble.
 *
 * `sharedBlock: true` says it explicitly. It is deliberately a flag on the
 * event rather than a pair of ids: the block is however many ensembles are on
 * the event, from two up to every ensemble in the program.
 *
 * Imported by src/shared/ics.ts, which `scripts/generate-feeds.mjs` loads
 * directly under Node's type-stripping loader — hence the explicit `.ts` on
 * the import over there, and no non-type imports of its own here.
 */

export interface SharedBlockLike {
  ensembleIds?: string[];
  sharedBlock?: boolean;
}

/**
 * Fails CLOSED: the flag alone is not enough, there must actually be two or
 * more ensembles in the room. A director who flags a block and then removes
 * ensembles down to one leaves a stale `true` behind; treating that as
 * combined would put a "combined" badge on an ordinary rehearsal.
 */
export function isSharedBlock(event: SharedBlockLike): boolean {
  return event.sharedBlock === true && (event.ensembleIds?.length ?? 0) >= 2;
}

/**
 * "Wind Ensemble + Symphony Orchestra", collapsing once the list stops being
 * readable. A block may cover every ensemble in the program, and seventeen
 * names joined by plus signs is not a label — it's a paragraph.
 *
 * `total` is how many ensembles exist in this org; pass it and a block that
 * covers all of them says so by name instead of listing them.
 */
export function sharedBlockLabel(
  names: string[],
  opts: { max?: number; total?: number; allLabel?: string } = {},
): string {
  const { max = 3, total, allLabel = 'All ensembles' } = opts;
  const clean = names.filter(Boolean);
  if (clean.length === 0) return '';
  if (total !== undefined && total >= 2 && clean.length >= total) return allLabel;
  if (clean.length <= max) return clean.join(' + ');
  const shown = clean.slice(0, max).join(' + ');
  return `${shown} + ${clean.length - max} more`;
}

/**
 * The roster of a shared block is the UNION of its ensembles' rosters, and a
 * student who belongs to two of them is ONE person in the room, listed once.
 * Callers resolve each ensemble separately (rosters are per-ensemble
 * everywhere — attendance, roll receipts, and rules all key on ensembleId);
 * this merges the results and remembers which ensembles each student came in
 * with, so the combined list can show "Symphony · Wind Ensemble" beside a
 * doubling player rather than printing their name twice.
 */
export function mergeSharedRoster<S extends { id: string }>(
  perEnsemble: { ensembleId: string; students: { student: S; isSub: boolean }[] }[],
): { student: S; isSub: boolean; ensembleIds: string[] }[] {
  const byStudent = new Map<string, { student: S; isSub: boolean; ensembleIds: string[] }>();
  for (const { ensembleId, students } of perEnsemble) {
    for (const { student, isSub } of students) {
      const hit = byStudent.get(student.id);
      if (hit) {
        if (!hit.ensembleIds.includes(ensembleId)) hit.ensembleIds.push(ensembleId);
        // A player who is a full member via ANY ensemble in the room is not a
        // sub — the sub badge means "not normally here", and they normally are.
        hit.isSub = hit.isSub && isSub;
      } else {
        byStudent.set(student.id, { student, isSub, ensembleIds: [ensembleId] });
      }
    }
  }
  return [...byStudent.values()];
}
