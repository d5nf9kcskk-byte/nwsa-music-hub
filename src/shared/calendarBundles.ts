/**
 * Named calendar bundles — curated calendars with a STABLE, human-readable
 * address (`feeds/bundle-<slug>.ics`).
 *
 * Why these exist alongside the filter views in `calendarView.ts`: a view's
 * file name is a hash of its exact filters, which is what lets any ad-hoc mix
 * be subscribable. But that also means the address CHANGES the moment the mix
 * changes — so a calendar defined as "every ensemble that isn't an orchestra"
 * could never gain a newly-created Jazz Combo without breaking everyone
 * already subscribed to it. A bundle fixes the address and lets the
 * MEMBERSHIP move: its ensembles are resolved fresh on every feed build, by
 * id and by name pattern, so "Jazz Combo #2" joins the calendar it belongs to
 * the moment the director creates it, and nobody re-subscribes.
 *
 * Bundles are per-org data (`config/orgs/*.json`), never hardcoded here.
 *
 * Matching deliberately COMPOSES with calendarView.ts rather than
 * re-implementing it: a bundle resolves to a CalendarViewSpec, is filtered by
 * the one definition of what a filtered calendar shows, and then applies at
 * most one subtractive refinement of its own (`includeSchoolWide`). That
 * refinement is the whole reason a director can subscribe to several bundles
 * at once without seeing every holiday two or three times — something the
 * hash-addressed views cannot offer, because their school-wide ride-along is
 * part of the frozen contract.
 */

import {
  assignmentMatchesView,
  eventMatchesView,
  normalizeView,
  type CalendarViewSpec,
  type ViewTypeKey,
} from './calendarView.ts';

export interface CalendarBundle {
  /** Address-stable id — the feed is `feeds/bundle-<slug>.ics`. Never change
   *  a published one; subscribers hold that URL. */
  slug: string;
  /** Calendar name as it appears in someone's calendar app. */
  name: string;
  /** One line shown next to it in the subscribe sheet. */
  description: string;
  /** Ensembles named outright. Ids that no longer exist are ignored. */
  ensembleIds?: string[];
  /** Case-insensitive regex sources matched against ensemble NAMES, so
   *  ensembles created later join automatically (e.g. '^jazz combo'). */
  ensembleNamePatterns?: string[];
  /** Restrict to these event types. Empty/absent = every type. */
  types?: ViewTypeKey[];
  /** Only items with NO ensemble at all — academic classes, school-wide days. */
  schoolOnly?: boolean;
  /** Carry school-wide items (holidays, early release) into an ensemble
   *  bundle. Off by default so several bundles can be subscribed together
   *  without repeating the same day on each one. */
  includeSchoolWide?: boolean;
}

interface EnsembleLike { id: string; name?: string }

/** The ensemble ids a bundle covers right now: named ids that still exist,
 *  plus every ensemble whose name matches one of its patterns. */
export function bundleEnsembleIds(bundle: CalendarBundle, ensembles: EnsembleLike[]): string[] {
  const byId = new Set(ensembles.map(e => e.id));
  const named = (bundle.ensembleIds ?? []).filter(id => byId.has(id));
  const matched = (bundle.ensembleNamePatterns ?? []).flatMap(src => {
    let re: RegExp;
    // A bad pattern in org config must not take the whole feed build down.
    try { re = new RegExp(src, 'i'); } catch { return []; }
    return ensembles.filter(e => e.name && re.test(e.name)).map(e => e.id);
  });
  return [...new Set([...named, ...matched])].sort();
}

/** The bundle expressed as an ordinary filter view, so the shared matcher in
 *  calendarView.ts decides what it contains. */
export function bundleViewSpec(bundle: CalendarBundle, ensembles: EnsembleLike[]): CalendarViewSpec {
  return normalizeView({
    ensembleIds: bundle.schoolOnly ? [] : bundleEnsembleIds(bundle, ensembles),
    school: Boolean(bundle.schoolOnly),
    types: bundle.types ?? [],
  });
}

const hasEnsemble = (item: { ensembleIds?: string[] }) => (item.ensembleIds ?? []).length > 0;

/** Does this event belong in this bundle? */
export function eventMatchesBundle(
  event: { type?: string; ensembleIds?: string[] },
  bundle: CalendarBundle,
  ensembles: EnsembleLike[],
): boolean {
  const spec = bundleViewSpec(bundle, ensembles);
  if (!eventMatchesView(event, spec)) return false;
  // Subtractive refinement: an ensemble bundle drops the school-wide
  // ride-along unless it asked for it.
  if (bundle.schoolOnly || bundle.includeSchoolWide) return true;
  return hasEnsemble(event);
}

/** Does this assignment's due date belong in this bundle? */
export function assignmentMatchesBundle(
  assignment: { ensembleIds?: string[] },
  bundle: CalendarBundle,
  ensembles: EnsembleLike[],
): boolean {
  // A school-only bundle is classes and school days; assignments belong to
  // ensembles, so they never ride along in one.
  if (bundle.schoolOnly) return false;
  return assignmentMatchesView(assignment, bundleViewSpec(bundle, ensembles));
}

/** File name (inside `feeds/`) for a bundle's ICS feed. */
export function bundleFeedFile(bundle: CalendarBundle): string {
  return `bundle-${bundle.slug}.ics`;
}
