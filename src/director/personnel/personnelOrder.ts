import { scoreOrderRank, lastName } from '../scoreOrder.ts';
import type { Personnel } from '../types.ts';

/** True when a section just repeats the instrument ("Flute" / "Flute"), so a
 *  person's line names it once. */
export function sectionIsInstrument(p: Pick<Personnel, 'section' | 'instrument'>): boolean {
  return !!p.section && p.section.trim().toLowerCase() === (p.instrument ?? '').trim().toLowerCase();
}

/** Score order by SECTION where the section is a known part ("Violin II"
 *  ranks after "Violin I"), else by instrument; then section, seat, surname.
 *  Ranking by instrument alone interleaved Violin I and II seat by seat. */
export function byScoreSectionSeat(a: Personnel, b: Personnel): number {
  const rank = (p: Personnel) => {
    const r = scoreOrderRank(p.section);
    return r < 998 ? r : scoreOrderRank(p.instrument);
  };
  return rank(a) - rank(b)
    || (a.section ?? '').localeCompare(b.section ?? '')
    || (a.seat ?? Number.MAX_SAFE_INTEGER) - (b.seat ?? Number.MAX_SAFE_INTEGER)
    || lastName(a.name).localeCompare(lastName(b.name));
}
