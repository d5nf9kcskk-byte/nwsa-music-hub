import { scoreOrderRank, lastName } from '../scoreOrder.ts';
import { partIsMine } from '../../shared/memberView.ts';
import { calledIds } from './personnelOrder.ts';
import type { CalendarEvent, ConcertPersonnel, Contract, Personnel, RepertoirePiece } from '../types.ts';

/**
 * The Personnel screen's arithmetic (#aiso-personnel,
 * docs/aiso-personnel-screen.md): which section cards a concert shows and in
 * what order, who sits where, which contract is "this concert's", and which
 * parts a player gets. Pure, so concertRoster.selfcheck.ts runs it under node.
 */

/** Something an invitation can go to. A name typed in the Email column is not. */
export const usableEmail = (s?: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((s ?? '').trim());

const key = (s?: string) => (s ?? '').trim().toLowerCase();

export interface SectionCard {
  /** '' is the closing card for people with no section (podium, staff). */
  name: string;
  needed?: number;
  people: Personnel[];
}

const bySeat = (a: Personnel, b: Personnel) =>
  (a.seat ?? Number.MAX_SAFE_INTEGER) - (b.seat ?? Number.MAX_SAFE_INTEGER)
  || lastName(a.name).localeCompare(lastName(b.name));

const byScore = (a: string, b: string) => scoreOrderRank(a) - scoreOrderRank(b) || a.localeCompare(b);

/**
 * The cards, in order: the concert's stored sections (the sheet's order),
 * then any section a seated player has that the list lacks, in score order.
 * With nothing stored yet, the roster's other sections follow, empty, so a
 * brand-new concert already has somewhere to add people.
 */
export function sectionCards(
  people: Personnel[], stored: ConcertPersonnel['sections'], rosterSections: string[] = [],
): SectionCard[] {
  const cards: SectionCard[] = [];
  const at = new Map<string, SectionCard>();
  const add = (name: string, needed?: number) => {
    if (!name.trim() || at.has(key(name))) return;
    const c: SectionCard = { name: name.trim(), ...(needed != null ? { needed } : {}), people: [] };
    at.set(key(name), c);
    cards.push(c);
  };
  for (const s of stored ?? []) add(s.name, s.needed);
  [...new Set(people.map(p => p.section?.trim() ?? '').filter(Boolean))].sort(byScore).forEach(n => add(n));
  if (!stored?.length) [...new Set(rosterSections.map(s => s.trim()).filter(Boolean))].sort(byScore).forEach(n => add(n));
  const none: Personnel[] = [];
  for (const p of people) (at.get(key(p.section))?.people ?? none).push(p);
  for (const c of cards) c.people.sort(bySeat);
  if (none.length) cards.push({ name: '', people: none.sort(bySeat) });
  return cards;
}

/** "12/12", "9/12", "13/12 · 1 over", or "3 seated · chairs needed not set". */
export function fillLabel(c: SectionCard): string {
  const n = c.people.length;
  if (c.needed == null) return `${n} seated · chairs needed not set`;
  return `${n}/${c.needed}${n > c.needed ? ` · ${n - c.needed} over` : ''}`;
}

export const isOpen = (c: SectionCard) => c.name !== '' && c.needed != null && c.people.length < c.needed;

/** The chair a new player in this section takes: one past the last. A section
 *  that seats nobody by number (percussion) stays seatless. */
export function nextSeat(sectionPeople: Personnel[]): number | undefined {
  const seats = sectionPeople.map(p => p.seat).filter((s): s is number => s != null);
  if (sectionPeople.length && !seats.length) return undefined;
  return Math.max(0, ...seats) + 1;
}

/** This concert's contract for a person: the newest live one that calls them
 *  to it (`calledIds`, the service roll's own answer). */
export function contractFor(contracts: Contract[], concert: Pick<CalendarEvent, 'id' | 'date' | 'ensembleIds'>, personnelId: string): Contract | undefined {
  return contracts
    .filter(c => c.personnelId === personnelId && calledIds([c], concert).has(personnelId))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
}

/** The fee most of this concert's flat contracts carry, to pre-fill the add row. */
export function usualFeeCents(contracts: Contract[]): number | undefined {
  const n = new Map<number, number>();
  for (const c of contracts) if (c.baseRateBasis === 'flat' && c.baseRateCents > 0) n.set(c.baseRateCents, (n.get(c.baseRateCents) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
}

/** The parts of this concert's pieces that are this player's chair. */
export function partsFor(
  pieces: Pick<RepertoirePiece, 'id' | 'title' | 'eventIds' | 'memberParts'>[],
  concert: Pick<CalendarEvent, 'id' | 'pieceIds'>,
  me: Pick<Personnel, 'section' | 'instrument' | 'seat'>,
): { piece: string; label: string }[] {
  const order = concert.pieceIds ?? [];
  return pieces
    .filter(p => order.includes(p.id) || p.eventIds?.includes(concert.id))
    .sort((a, b) => (order.indexOf(a.id) + 1 || 999) - (order.indexOf(b.id) + 1 || 999))
    .flatMap(p => (p.memberParts ?? []).filter(part => partIsMine(part, me)).map(part => ({ piece: p.title, label: part.label })));
}
