/**
 * What `Ensemble.kind` means — the two predicates that actually read the field
 * (#classes).
 *
 * They live in their own module, importing nothing but a type, so code that
 * runs OUTSIDE the browser can ask the question too. `utils.ts` reaches
 * dates.ts → i18n → the org config, which needs Vite's build-time defines and
 * cannot load under Node's type-stripping loader — so `scripts/generate-feeds.mjs`
 * had no way to import `isMasterClass` and would have had to spell
 * `kind === 'masterclass'` a second time. A second spelling of the field is
 * exactly what the "absent = 'ensemble'" default cannot survive.
 *
 * `utils.ts` re-exports both, so it stays the import site for everything that
 * already reads them. Never read `kind` directly anywhere else.
 */
import type { Ensemble } from './types.ts';

/** A class (theory, music appreciation, master class, college course) — has a
 *  roster and takes roll, but rehearses no repertoire and plays no concerts.
 *  Covers BOTH class kinds: everywhere a list is shown they belong together. */
export function isClassGroup(e: Pick<Ensemble, 'kind'>): boolean {
  return e.kind === 'class' || e.kind === 'masterclass';
}

/** A master class specifically — a class whose students PLAY in it, so a
 *  meeting picks performers and their pieces instead of a unit/chapter. */
export function isMasterClass(e: Pick<Ensemble, 'kind'>): boolean {
  return e.kind === 'masterclass';
}

/**
 * College / dual-enrollment. Independent of `kind`: a college ENSEMBLE
 * (College Chamber Orchestra) and a college CLASS are both college, and a
 * master class is not.
 *
 * It lives here beside the kind predicates, rather than in `utils.ts` where it
 * started, because it decides more than a list heading now: `campusCalendar.ts`
 * reads it to pick which academic calendar governs a group
 * (#college-hs-calendar-deps), and that module has to load under Node's
 * type-stripping loader, which `utils.ts` cannot. `utils.ts` re-exports it, so
 * every existing caller is unchanged and there is still ONE spelling.
 */
export function isCollegeGroup(e: Pick<Ensemble, 'collegeLevel'>): boolean {
  return !!e.collegeLevel;
}
