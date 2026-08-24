import { scoreOrderRank, lastName } from '../scoreOrder';
import type { Student } from '../types';

/**
 * Running-order arithmetic for juries (#juries).
 *
 * The stub stays a stub: this adds NO scheduling (no per-student slot times,
 * no room turnover, no panel availability) and NO scoring. It only fixes the
 * one thing that actually hurts — a director building String Juries had to
 * search and tap forty students one at a time. Adding a whole roster and
 * dropping the list into score order are list operations, not a process.
 *
 * The order itself is still the data, and still hand-shuffled afterwards:
 * these are a starting point, never the final word.
 */

/** Score order, then last name — the same ordering the app already uses for
 *  personnel and seating, so a jury sheet reads like every other list. One
 *  ranking table (scoreOrder.ts), never a second spelling list. */
export function bySection(a: Student, b: Student): number {
  return (
    scoreOrderRank(a.instrument) - scoreOrderRank(b.instrument) ||
    (a.instrument ?? '').localeCompare(b.instrument ?? '') ||
    lastName(a.name).localeCompare(lastName(b.name))
  );
}

/**
 * Append students to a running order, in score order, skipping anyone already
 * placed. Existing order is never disturbed — a director who has already
 * sequenced the cellists does not lose that by adding the violists.
 *
 * `candidates` is whatever the caller offers (a roster, an instrument family);
 * inactive students are dropped here so no caller has to remember to.
 */
export function appendInScoreOrder(order: string[], candidates: Student[]): string[] {
  // One set does both jobs: skip who is already placed, and dedupe a student
  // the caller offered twice (two ensembles can list the same player).
  const placed = new Set(order);
  const next = [...order];
  for (const s of [...candidates].sort(bySection)) {
    if (s.status !== 'Active' || placed.has(s.id)) continue;
    placed.add(s.id);
    next.push(s.id);
  }
  return next;
}

/** Re-sort an existing order into score order. Ids with no student record
 *  (a removed student still sitting in an old jury doc) keep their relative
 *  position at the end rather than vanishing — a jury doc is never silently
 *  edited by a sort. */
export function sortIntoScoreOrder(order: string[], byId: Record<string, Student>): string[] {
  const known = order.filter(id => byId[id]);
  const unknown = order.filter(id => !byId[id]);
  known.sort((a, b) => bySection(byId[a], byId[b]));
  return [...known, ...unknown];
}
