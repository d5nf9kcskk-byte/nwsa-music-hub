import type { Ensemble } from '../../director/types';
import { isClassGroup, isMasterClass } from '../../director/utils';
import { instrumentFamily, type InstrumentFamily } from '../instrumentFamily';

/**
 * Which instrument badge a group or an instrument wears (#hub2-alive).
 *
 * The family comes from the ONE ranking table (`instrumentFamily`, built on
 * scoreOrderRank), read out of an instrument or a group's own name, so a
 * "Flute Masterclass" or a "Brass Quintet" created next term needs no edit
 * here. A group the table cannot read gets the ensemble baton; a class gets
 * the book. TODO(piece 2): strip the class words from a master class's name
 * first, as groupIcon.ts does ("Bass Masterclass" -> "Bass"), by exporting
 * its instrumentFromGroupName through utils.
 */
export type BadgeKind = InstrumentFamily | 'class' | 'ensemble';

/** Words in an ensemble's name that name its family when no single
 *  instrument does ("Wind Ensemble", "Jazz Combo", "Concert Choir"). */
const ENSEMBLE_WORDS: [RegExp, BadgeKind][] = [
  [/\b(choir|chorus|chorale|voice|vocal|opera|singers?)\b/i, 'voice'],
  [/\b(wind|winds|band|woodwind)\b/i, 'woodwind'],
  [/\b(jazz|brass)\b/i, 'brass'],
  [/\b(percussion|drum(line)?|steel)\b/i, 'percussion'],
  [/\b(piano|keyboard|accompan)/i, 'rhythm'],
  [/\b(string|strings|camerata|quartet)\b/i, 'strings'],
];

/** The badge for an instrument ("Violin", "Alto Sax"). */
export function badgeForInstrument(instrument: string | undefined): BadgeKind {
  return instrumentFamily(instrument) ?? 'ensemble';
}

/** The badge for a group: a class's book, a master class's instrument, an
 *  ensemble's family from its name, else the conductor's baton. */
export function badgeForGroup(group: Pick<Ensemble, 'name' | 'kind'>): BadgeKind {
  if (isMasterClass(group)) return instrumentFamily(group.name) ?? 'class';
  if (isClassGroup(group)) return 'class';
  return instrumentFamily(group.name) ?? ENSEMBLE_WORDS.find(([re]) => re.test(group.name))?.[1] ?? 'ensemble';
}
