import { scoreOrderRank, lastName } from '../scoreOrder.ts';
import type { CalendarEvent, Contract, Personnel } from '../types.ts';

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

const STRING_SECTION = /^(violin|viola|cello|violoncello|bass|double bass)/i;

/** Where a player sits, in words. Strings share stands, two to a stand: seat
 *  1 and 2 are stand 1 (odd = outside, nearest the audience, even = inside).
 *  Everyone else's seat is a part number. '' when there is no seat. */
export function seatLabel(p: Pick<Personnel, 'section' | 'instrument' | 'seat'>): string {
  if (p.seat == null) return '';
  if (STRING_SECTION.test(p.section ?? p.instrument ?? '')) {
    return `Stand ${Math.ceil(p.seat / 2)}, ${p.seat % 2 === 1 ? 'outside' : 'inside'}`;
  }
  return `Part ${p.seat}`;
}

/** Who a service calls, by contract: a contract that names services
 *  (`eventIds`) calls its person to exactly those; one that names none is a
 *  season contract and calls them to every service of its ensembles inside
 *  its dates (a contract with no ensemble calls nobody). Void contracts call nobody. */
export function calledIds(contracts: Contract[], service: Pick<CalendarEvent, 'id' | 'date' | 'ensembleIds'>): Set<string> {
  const out = new Set<string>();
  for (const c of contracts) {
    if (c.status === 'Void') continue;
    if (c.eventIds?.length) {
      if (c.eventIds.includes(service.id)) out.add(c.personnelId);
    } else if (
      c.ensembleIds?.some(id => service.ensembleIds.includes(id))
      && (!c.startDate || c.startDate <= service.date)
      && (!c.endDate || service.date <= c.endDate)
    ) out.add(c.personnelId);
  }
  return out;
}
