/**
 * Small rules that `utils.ts` has always owned, in a file with ZERO imports.
 *
 * src/director/groupKind.ts is the model: `utils.ts` reaches the org config
 * (through dates → i18n), so nothing that runs under Node's type-stripping
 * loader can import it. In src/shared rather than src/director because that is
 * where eslint's code-split boundary says a shared primitive belongs. `src/shared/studentDay.ts` — the ONE answer to "what does this
 * student have" — is read by `scripts/generate-feeds.mjs` under exactly that
 * loader, and it needs these six. So they live here, and `utils.ts` re-exports
 * every one: no existing import site changes, and there is still one
 * definition of each.
 *
 * Keep it zero-import (type imports are erased and do not count). A rule that
 * needs the org config, the clock's locale or React does not belong here.
 */
import type { EventType, RepertoirePiece } from '../director/types.ts';

/**
 * Event types the director takes roll for. A class meets on a schedule and its
 * attendance matters exactly like a rehearsal or sectional, so it counts here;
 * concerts and one-off events do not. Centralized so every attendance surface
 * agrees on what "a rehearsal day" means.
 */
export function takesAttendance(type: EventType): boolean {
  return type === 'Rehearsal' || type === 'Sectional' || type === 'Class';
}

/** A piece's ensembles as an array — reads the new `ensembleIds` or falls back
 *  to the legacy single `ensembleId`. Empty array if neither is set. */
export function pieceEnsembleIds(p: Pick<RepertoirePiece, 'ensembleIds' | 'ensembleId'>): string[] {
  if (p.ensembleIds && p.ensembleIds.length) return p.ensembleIds;
  return p.ensembleId ? [p.ensembleId] : [];
}

/** True if a scheduled item (Assignment/LibraryDocument) should show now —
 *  no publishAt set, or its publish moment has already passed. Mirrors the
 *  announcement scheduling gate (visibleAnnouncements in useAnnouncements.ts). */
export function isPublished(item: { publishAt?: number }, now: number = Date.now()): boolean {
  return !item.publishAt || item.publishAt <= now;
}

/**
 * Should this assignment still show in a list a student browses?
 *
 * Published, and either not yet due OR still taking submissions. The browse
 * lists used to drop anything past its due date, so an online test that was
 * still open left the home page, the assignments index, the calendar and a
 * student's own schedule the morning after it was due, while the test itself
 * went on accepting answers. (Its own page never hid — `PublicAssignment`
 * gates on `isPublished` alone — so the link kept working; it was the browsing
 * that broke.)
 *
 * `acceptsQuizSubmissions` ONLY, never `acceptsVideoSubmissions`.
 * `acceptsVideoSubmissions` reads like a twin and is not one: it is the MODE
 * flag that says this exam collects video at all, set once when the assignment
 * is created and never cleared, and it is what `firestore.rules` and
 * `composeSubmission` gate uploads on — so a director cannot switch it off
 * without breaking grading, and every playing exam ever set carries it
 * forever. Treating it as "still open" would pin every past exam to the top of
 * a list that sorts soonest-first and slices to four. `acceptsQuizSubmissions`
 * is a real toggle with a real Close button (`setQuizOpen`).
 */
export function isAssignmentOpen(
  a: { publishAt?: number; dueDate: string; acceptsQuizSubmissions?: boolean },
  today: string,
  now: number = Date.now(),
): boolean {
  return isPublished(a, now) && (a.dueDate >= today || !!a.acceptsQuizSubmissions);
}

/**
 * Sort comparator for a list built with `isAssignmentOpen`: soonest first, but
 * anything already overdue goes LAST.
 *
 * Without this the fix is worse than the bug. Every one of these lists sorts
 * by due date ascending, so an overdue-but-still-open test sorts ABOVE
 * everything real and stays there until somebody closes it — and the home page
 * shows five, the assignments index four.
 */
export function byDueDateOpenFirst(today: string) {
  return (a: { dueDate: string }, b: { dueDate: string }): number => {
    const aLate = a.dueDate < today, bLate = b.dueDate < today;
    if (aLate !== bLate) return aLate ? 1 : -1;
    return a.dueDate.localeCompare(b.dueDate);
  };
}

/** Does this assignment target the given student (via ensemble or individually)? */
export function studentHasAssignment(
  a: { ensembleIds: string[]; studentIds?: string[] },
  studentId: string,
  studentEnsembleIds: string[] | undefined,
): boolean {
  if ((a.studentIds ?? []).includes(studentId)) return true;
  return a.ensembleIds.some(id => (studentEnsembleIds ?? []).includes(id));
}
