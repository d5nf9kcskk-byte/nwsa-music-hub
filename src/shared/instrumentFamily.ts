// Explicit .ts extensions: scripts/signup-eligibility.selfcheck.mjs loads this
// module through Node's type-stripping loader, which cannot resolve an
// extensionless relative import. Vite and tsc both accept the extension
// (allowImportingTsExtensions). Do not drop it — CI stops running the check.
import { scoreOrderRank } from '../director/scoreOrder.ts';
import type { InstrumentFamilyId } from '../director/types.ts';

/**
 * Instrument families, derived from the ONE ranking table the app already
 * has (`scoreOrderRank` in src/director/scoreOrder.ts). Score order is laid
 * out family by family, so the family is just the band the rank falls in —
 * no second list of instrument spellings to keep in sync with the first.
 *
 * Used by sign-ups (#signups) so a director can target, say, "the string
 * players in Camerata" without hand-picking students. `bass` alone ranks as
 * a string bass (430) while "bass guitar" ranks in the rhythm section (330),
 * which is exactly the distinction a director means when they say strings.
 */

/** Alias of the union declared in src/director/types.ts (the leaf module
 *  every data type lives in) — one definition, ergonomic name here. */
export type InstrumentFamily = InstrumentFamilyId;

export const INSTRUMENT_FAMILIES: { id: InstrumentFamily; label: string }[] = [
  { id: 'woodwind',   label: 'Woodwinds' },
  { id: 'brass',      label: 'Brass' },
  { id: 'percussion', label: 'Percussion' },
  { id: 'rhythm',     label: 'Keys / rhythm' },
  { id: 'strings',    label: 'Strings' },
  { id: 'voice',      label: 'Voice' },
];

export const INSTRUMENT_FAMILY_LABEL: Record<InstrumentFamily, string> =
  Object.fromEntries(INSTRUMENT_FAMILIES.map(f => [f.id, f.label])) as Record<InstrumentFamily, string>;

/**
 * Harp counts as STRINGS here, even though score order prints it up in the
 * harp/keys/rhythm block above the string section. That position is about
 * where the part sits on the page, not what the instrument is — a harp is a
 * string instrument, and a director who says "my strings" means the harpist
 * too. Missing them is the expensive mistake; including them in a
 * strings-only sign-up costs one person one tap.
 *
 * `\bharp(s|ist)?\b` deliberately does NOT match "harpsichord" (no word
 * boundary after "harp"), which scoreOrderRank otherwise lumps in with harp.
 */
const HARP = /\bharp(s|ist)?\b/i;

/** The family an instrument belongs to, or null when it isn't recognized. */
export function instrumentFamily(instrument: string | undefined): InstrumentFamily | null {
  if (instrument && HARP.test(instrument)) return 'strings';
  const rank = scoreOrderRank(instrument);
  if (rank < 100) return 'woodwind';
  if (rank < 200) return 'brass';
  if (rank < 300) return 'percussion';
  if (rank < 400) return 'rhythm';
  if (rank < 500) return 'strings';
  if (rank < 600) return 'voice';
  return null; // 998 = unrecognized instrument, 999 = none recorded
}
