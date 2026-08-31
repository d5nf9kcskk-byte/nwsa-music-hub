/**
 * One definition of "what a calendar view shows".
 *
 * The director Schedule screen, the public calendar, and the deploy-time ICS
 * generator (`scripts/generate-feeds.mjs` imports this file directly — Node
 * strips the types) all filter through the SAME functions here, so a
 * subscribed calendar contains exactly the events the screen showed when the
 * link was made. Duplicating this logic is how the two drifted apart before.
 *
 * A view is (ensembles × types); every view has a deterministic slug so its
 * feed is a stable file name: `feeds/view-<slug>.ics`.
 */

export const VIEW_EVENT_TYPES = ['Class', 'Rehearsal', 'Sectional', 'Concert', 'Event'] as const;
export type ViewEventType = (typeof VIEW_EVENT_TYPES)[number];

/** Assignment due dates ride the calendar alongside events, so the type
 *  filter carries them as a pseudo-type. */
export type ViewTypeKey = ViewEventType | 'Assignment';
export const VIEW_TYPE_KEYS: ViewTypeKey[] = [...VIEW_EVENT_TYPES, 'Assignment'];

export interface CalendarViewSpec {
  /** Chosen ensembles. Empty (with `school` false) means every ensemble. */
  ensembleIds: string[];
  /** True when "School events" (items with no ensemble) is an explicit pick. */
  school: boolean;
  /** Chosen types. Empty means every type. */
  types: ViewTypeKey[];
  /**
   * Narrow to concerts that count toward a student's obligation
   * (#concert-checkin). Absent = no such narrowing, which is every view that
   * existed before this filter and therefore every published feed URL.
   *
   * Deliberately NOT part of `types`: "Required" is not a kind of event, it
   * is a property of one, and folding it into the type list would make
   * "Concerts + Required" mean "concerts OR required things".
   */
  attendance?: ConcertAttendance;
}

/** Mirrors ConcertAttendance in concertCheckin.ts. Redeclared rather than
 *  imported so this module stays dependency-free — the ICS generator loads it
 *  directly and a new import here is a new file for that loader to resolve. */
export type ConcertAttendance = 'required' | 'optional';

/** Minimal shape of an event — the app's CalendarEvent and the generator's
 *  flattened Firestore doc both satisfy it. */
interface ViewEventLike {
  type?: string;
  ensembleIds?: string[];
  concertAttendance?: ConcertAttendance | null;
}

interface ViewAssignmentLike {
  ensembleIds?: string[];
}

/** Sorted + de-duplicated, so two identical views always hash the same. */
export function normalizeView(spec: CalendarViewSpec): CalendarViewSpec {
  const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return {
    ensembleIds: [...new Set(spec.ensembleIds)].sort(order),
    school: Boolean(spec.school),
    types: [...new Set(spec.types)].sort(order) as ViewTypeKey[],
    // Only carried when actually set: a normalized view with no attendance
    // filter must be structurally identical to one from before the filter
    // existed, or every published feed URL moves.
    ...(spec.attendance ? { attendance: spec.attendance } : {}),
  };
}

export function isEveryEnsemble(spec: CalendarViewSpec): boolean {
  return spec.ensembleIds.length === 0 && !spec.school;
}

/**
 * Does this event belong in this view?
 *
 * School-wide items (no ensemble at all — holidays, early release, planning
 * days) ride along with a narrowed ensemble pick, because they change
 * everyone's day. Academic CLASSES are the exception: they carry no ensemble
 * either, but a Theory class has nothing to do with the Symphony, so a
 * narrowed ensemble view hides them — unless the type filter explicitly names
 * Classes, in which case the director asked for them and gets them.
 */
export function eventMatchesView(event: ViewEventLike, spec: CalendarViewSpec): boolean {
  // Attendance is checked FIRST and short-circuits, so it cannot be widened by
  // the school-wide ride-along below: a holiday carries no ensemble, but a
  // holiday is not a required concert and must never appear in one of these
  // views just because it is school-wide.
  if (spec.attendance && event.concertAttendance !== spec.attendance) return false;
  if (spec.types.length > 0 && !spec.types.includes(event.type as ViewTypeKey)) return false;
  if (spec.attendance) return true;
  if (isEveryEnsemble(spec)) return true;

  const eventEnsembles = event.ensembleIds ?? [];
  if (eventEnsembles.some(id => spec.ensembleIds.includes(id))) return true;
  if (eventEnsembles.length > 0) return false;

  return event.type !== 'Class' || spec.types.includes('Class');
}

/** Assignment due dates: ensemble-scoped, never school-wide. */
export function assignmentMatchesView(assignment: ViewAssignmentLike, spec: CalendarViewSpec): boolean {
  // An assignment is never a concert, so an attendance-filtered view has none.
  if (spec.attendance) return false;
  if (spec.types.length > 0 && !spec.types.includes('Assignment')) return false;
  if (spec.ensembleIds.length === 0) return !spec.school;
  return (assignment.ensembleIds ?? []).some(id => spec.ensembleIds.includes(id));
}

/** Canonical string form — the only input to the slug hash. */
function canonicalView(spec: CalendarViewSpec): string {
  const n = normalizeView(spec);
  const base = `e:${n.ensembleIds.join(',')}|s:${n.school ? 1 : 0}|t:${n.types.join(',')}`;
  // APPENDED ONLY WHEN SET. The slug is a subscription contract: someone's
  // calendar app holds feeds/view-<slug>.ics and re-resolves it forever.
  // Adding '|a:' unconditionally would rewrite every existing hash and break
  // every existing subscription, so a view without an attendance filter
  // hashes exactly the string it always did. Pinned in the self-check.
  return n.attendance ? `${base}|a:${n.attendance}` : base;
}

/**
 * Deterministic short id for a view (FNV-1a, 32-bit, hex). Same input →
 * same file name forever, in the browser and in the deploy script, so a
 * subscription URL keeps working and re-subscribing to the same mix reuses
 * one feed instead of piling up new ones.
 */
export function viewSlug(spec: CalendarViewSpec): string {
  const text = canonicalView(spec);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** File name (inside `feeds/`) for a view's ICS feed. */
export function viewFeedFile(spec: CalendarViewSpec): string {
  return `view-${viewSlug(spec)}.ics`;
}

/**
 * Views the deploy step ALWAYS builds, whether or not anyone registered
 * them: every single ensemble (and "school events", and "all ensembles")
 * crossed with every single type, plus each of those with no type filter.
 * These are the mixes people actually pick, and pre-building them means the
 * subscribe link works the moment the site deploys.
 *
 * Anything wider (several ensembles, several types) is registered on demand
 * in the `calendarViews` collection and built on the next feed refresh.
 */
export function autoViewSpecs(ensembleIds: string[]): CalendarViewSpec[] {
  const groups: { ensembleIds: string[]; school: boolean }[] = [
    { ensembleIds: [], school: false },
    { ensembleIds: [], school: true },
    ...ensembleIds.map(id => ({ ensembleIds: [id], school: false })),
  ];
  return groups.flatMap(group => AUTO_TYPE_SETS.map(types => normalizeView({ ...group, types })));
}

/**
 * Type selections built for every group: no filter, each single type, and the
 * public calendar's "Rehearsals" bucket — which is rehearsals AND sectionals,
 * so it needs its own pre-built feed to stay one tap away for students.
 */
const AUTO_TYPE_SETS: ViewTypeKey[][] = [
  [],
  ...VIEW_TYPE_KEYS.map(type => [type]),
  ['Rehearsal', 'Sectional'],
];

/** True when this view is in the always-built set (no registration needed). */
export function isAutoView(spec: CalendarViewSpec): boolean {
  const n = normalizeView(spec);
  // autoViewSpecs never generates an attendance-filtered view, so claiming one
  // is pre-built would hand out a feeds/view-<slug>.ics that does not exist —
  // and a calendar app refuses a 404 outright rather than retrying. These are
  // registered in calendarViews and built on the next refresh, like any other
  // wider mix.
  if (n.attendance) return false;
  const oneGroup = n.ensembleIds.length <= 1 && !(n.school && n.ensembleIds.length > 0);
  const typeKey = n.types.join(',');
  return oneGroup && AUTO_TYPE_SETS.some(set => normalizeView({ ensembleIds: [], school: false, types: set }).types.join(',') === typeKey);
}

/**
 * The view's filters as human-readable chips: ensembles first, then types.
 * Used for the sheet's chip row, the ICS calendar name, and the feed's
 * X-WR-CALDESC, so all three read the same.
 */
export function describeView(
  spec: CalendarViewSpec,
  ensembleName: (id: string) => string,
): { ensembles: string[]; types: string[] } {
  const ensembles = isEveryEnsemble(spec)
    ? ['All ensembles']
    : [...spec.ensembleIds.map(ensembleName), ...(spec.school ? ['School events'] : [])];
  const types = spec.types.length === 0
    ? ['All types']
    : spec.types.map(t => (t === 'Assignment' ? 'Assignments' : `${t}s`));
  return { ensembles, types };
}

/** One-line label, e.g. "Symphony Orchestra, Philharmonic · Rehearsals". */
export function viewLabel(spec: CalendarViewSpec, ensembleName: (id: string) => string): string {
  const { ensembles, types } = describeView(spec, ensembleName);
  return `${ensembles.join(', ')} · ${types.join(', ')}`;
}
