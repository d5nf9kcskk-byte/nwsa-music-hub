/**
 * "Is this piece MINE to play" — the ONE answer for a student's own
 * repertoire (#student-repertoire). The practice list, the "My parts" list and
 * the per-event "My part" links on the student's schedule all ask it.
 *
 * Being on a concert is not the same as playing on it. A student who is only
 * required to ATTEND (audience — `attendanceOnly`) plays nothing, and a
 * student who plays with Symphony on a shared concert does not play the
 * Chamber Orchestra's half of the program. Before this, every piece on every
 * concert on a student's schedule landed on their practice list, so a
 * violinist required to hear College Chamber Orchestra was told to practise
 * its whole program.
 *
 * A piece is the student's when, on that event, they are a performer AND:
 *   - they are a NAMED performer on the event (`studentIds`) — a soloist's
 *     concerto may belong to another ensemble's list, so nothing is hidden, or
 *   - the piece names no ensemble (nothing to judge by — keep it), or
 *   - the piece is played by one of the ensembles they play with on it,
 * and, when the work has its own personnel chart for that ensemble on this
 * concert ("winds only, for the Mozart"), they are seated on it.
 *
 * Pinned by studentRepertoire.selfcheck.ts.
 */
import type { CalendarEvent, RepertoirePiece, SeatingChart } from '../director/types';
import { pieceEnsembleIds } from '../director/utils';
import { pieceChartsFor } from './concertRosters';

/** Pieces linked to an event from either direction: the event's `pieceIds`
 *  (in program order), then any piece that names the event in `eventIds`. */
export function eventPieces(
  e: Pick<CalendarEvent, 'id' | 'pieceIds'>,
  piecesById: Record<string, RepertoirePiece>,
): RepertoirePiece[] {
  const ordered = (e.pieceIds ?? []).map(id => piecesById[id]).filter(Boolean);
  const seen = new Set(ordered.map(p => p.id));
  const extra = Object.values(piecesById).filter(p => !seen.has(p.id) && (p.eventIds ?? []).includes(e.id));
  return [...ordered, ...extra];
}

/** What `studentExpectation()` says about this student on this event. */
export interface PlayingOn {
  expected: boolean;
  attendanceOnly: boolean;
  /** The ensembles the student plays with on this event. */
  ensembleIds: string[];
}

export function studentPlaysPiece(
  studentId: string,
  event: Pick<CalendarEvent, 'studentIds' | 'seatingChartIds' | 'programChartId'>,
  exp: PlayingOn,
  piece: RepertoirePiece,
  charts: Pick<SeatingChart, 'id' | 'ensembleId' | 'pieceId' | 'pieceIds' | 'date' | 'createdAt' | 'sections'>[] = [],
): boolean {
  if (!exp.expected || exp.attendanceOnly) return false;
  if ((event.studentIds ?? []).includes(studentId)) return true;
  const pieceEns = pieceEnsembleIds(piece);
  const mine = pieceEns.length === 0 || exp.ensembleIds.length === 0
    ? exp.ensembleIds
    : exp.ensembleIds.filter(id => pieceEns.includes(id));
  if (pieceEns.length > 0 && exp.ensembleIds.length > 0 && mine.length === 0) return false;
  // Per-work personnel: an ensemble of theirs with a chart for this work on
  // this concert that does not seat them is an ensemble they sit out for it.
  const workCharts = pieceChartsFor(piece.id, charts, event);
  if (workCharts.length === 0 || mine.length === 0) return true;
  return mine.some(ensId => {
    const own = workCharts.filter(c => c.ensembleId === ensId);
    return own.length === 0
      || own.some(c => c.sections.some(s => s.seats.some(seat => seat.studentId === studentId)));
  });
}

/** The pieces on this event the student actually plays. */
export function studentEventPieces(
  studentId: string,
  event: CalendarEvent,
  exp: PlayingOn,
  piecesById: Record<string, RepertoirePiece>,
  charts: Parameters<typeof studentPlaysPiece>[4] = [],
): RepertoirePiece[] {
  if (!exp.expected || exp.attendanceOnly) return [];
  return eventPieces(event, piecesById).filter(p => studentPlaysPiece(studentId, event, exp, p, charts));
}
