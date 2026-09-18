/**
 * `assignedEnsembleIds` is ONE stored field edited by TWO controls on the
 * Directors screen — "ensembles they conduct" and "class sections they teach"
 * — and, for a Student Assistant, by a third (the FilterMenu variant of the
 * first). Each control can only see its own kind of group, so each must write
 * its own slice and carry the others through verbatim. A control that wrote
 * its own list wholesale would silently erase the other's: a director who
 * teaches AP Theory would lose Symphony the moment anyone touched the class
 * picker.
 *
 * That field is the ONE answer to "whose group is this" (#my-calendar) — it
 * names the staff on a class page, scopes the role shells, and decides what
 * arrives in a person's own calendar feed — so losing an id here is not a
 * display bug. Hence a module and a self-check rather than three inline
 * `filter` calls that have to stay in agreement by hand.
 *
 * `other` is the slice that belongs to NEITHER picker: an id whose group was
 * renamed out of both lists, or deleted. It is carried through untouched. The
 * Directors editor is not where a stale assignment gets cleaned up, and
 * quietly rewriting the field while someone edited an unrelated row would be
 * an edit nobody asked for.
 */
export interface AssignedSlices {
  performing: string[];
  classes: string[];
  other: string[];
}

export function splitAssigned(
  assigned: string[],
  isClass: (id: string) => boolean,
  isPerforming: (id: string) => boolean,
): AssignedSlices {
  const slices: AssignedSlices = { performing: [], classes: [], other: [] };
  for (const id of assigned) {
    // Class first: a master class satisfies both questions on some screens,
    // and it belongs to the class picker, which is the one that can show it.
    if (isClass(id)) slices.classes.push(id);
    else if (isPerforming(id)) slices.performing.push(id);
    else slices.other.push(id);
  }
  return slices;
}

/** Replace the performing slice, keep the other two exactly as they were. */
export function withPerforming(slices: AssignedSlices, ids: string[]): string[] {
  return [...ids, ...slices.classes, ...slices.other];
}

/** Replace the class slice, keep the other two exactly as they were. */
export function withClasses(slices: AssignedSlices, ids: string[]): string[] {
  return [...slices.performing, ...ids, ...slices.other];
}
