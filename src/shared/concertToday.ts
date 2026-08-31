/**
 * Concert-day banner (#concert-day-alert) — pure logic, no React/DOM, so it
 * pins with a plain-node selfcheck like concertCheckin.ts.
 */

export interface ConcertDayEvent {
  type: string;
  date: string;
  status?: string;
}

/** Today's non-cancelled concerts. Cancelled concerts never collect
 *  attendance (concertCheckin.ts) and shouldn't remind anyone to show up. */
export function concertsToday<T extends ConcertDayEvent>(events: T[], today: string): T[] {
  return events.filter(e => e.type === 'Concert' && e.date === today && e.status !== 'Cancelled');
}

export interface CheckinLinkEvent {
  concertAttendance?: 'required' | 'optional' | null;
  checkin?: { enabled?: boolean };
}

/** Only surface the check-in link when attendance is required AND the
 *  station is actually turned on — never a fourth guess at "is this open?",
 *  just the two fields the director already set. */
export function showCheckinLink(event: CheckinLinkEvent): boolean {
  return event.concertAttendance === 'required' && !!event.checkin?.enabled;
}

export interface RepertoirePieceLike {
  title: string;
  composer?: string;
}

export interface RepertoireEvent {
  repertoire?: string;
  pieceIds?: string[];
}

/** Free text plus linked piece titles, same join as icsDescription's
 *  repertoire line ("Title — Composer · Title2 · custom text"). */
export function repertoireLine(
  event: RepertoireEvent,
  pieceById: (id: string) => RepertoirePieceLike | undefined,
): string {
  const pieces = (event.pieceIds ?? [])
    .map(pieceById)
    .filter((p): p is RepertoirePieceLike => Boolean(p?.title))
    .map(p => [p.title, p.composer].filter(Boolean).join(' — '));
  return [event.repertoire, ...pieces].filter(Boolean).join(' · ');
}
