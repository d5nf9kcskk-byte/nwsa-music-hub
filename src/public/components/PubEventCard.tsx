import { MapPin, Clock, Music, ExternalLink, ScrollText, ChevronRight, StickyNote } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import type { CalendarEvent, Ensemble, RepertoirePiece } from '../../director/types';
import { parseDate, formatTimeRange, ensembleColor, EVENT_TYPE_ICON, findPartForInstrument } from '../../director/utils';
import { EnsembleLink, EnsembleLinks } from './EnsembleLink';
import { Linkify } from '../../director/components/Linkify';

interface Props {
  event: CalendarEvent;
  ensembleMap: Record<string, Ensemble>;
  /** Show the date in the meta row (for lists that span multiple days). */
  showDate?: boolean;
  /** Show the rehearsal notes (student-facing reminders). */
  showNotes?: boolean;
  /** Mark this card as a substitute assignment. */
  isSub?: boolean;
  /** Student must ATTEND (audience) but is not performing. */
  attendanceOnly?: boolean;
  /** Restrict the ensembles named in the title (e.g. only the student's). */
  ensembleIds?: string[];
  /** Repertoire lookup so linked pieces can be shown. */
  piecesById?: Record<string, RepertoirePiece>;
  /** When set, surfaces the part link matching this instrument on each piece. */
  studentInstrument?: string;
  /** Show a "Details" link to the event's own page (default true). */
  detailLink?: boolean;
}

/** Shared, consistently-styled public event card. Ensemble names link to hubs. */
export function PubEventCard({
  event: e, ensembleMap, showDate, showNotes, isSub, attendanceOnly, ensembleIds, piecesById, studentInstrument, detailLink = true,
}: Props) {
  const navigate = useNavigate();
  const ids = ensembleIds ?? e.ensembleIds;
  const ensembleObjs = ids.map(id => ensembleMap[id]).filter(Boolean) as Ensemble[];
  const barColor = e.type === 'Concert' ? '#ca8a04' : ensembleColor(ensembleObjs[0]);

  // The whole card opens the event page; inner links/buttons keep their own action.
  function handleCardTap(ev: React.MouseEvent) {
    if (!detailLink) return;
    if ((ev.target as HTMLElement).closest('a, button')) return;
    navigate(`/event/${e.id}`);
  }

  // Pieces linked to this event from either direction: the event's pieceIds
  // (in program order) plus any piece that names this event in its eventIds.
  const pieces: RepertoirePiece[] = (() => {
    if (!piecesById) return [];
    const ordered = (e.pieceIds ?? []).map(id => piecesById[id]).filter(Boolean) as RepertoirePiece[];
    const seen = new Set(ordered.map(p => p.id));
    const extra = Object.values(piecesById).filter(
      p => !seen.has(p.id) && (p.eventIds ?? []).includes(e.id),
    );
    return [...ordered, ...extra];
  })();

  return (
    <div
      className={`pub-event ${e.status === 'Cancelled' ? 'cancelled' : ''} ${detailLink ? 'tappable' : ''}`}
      onClick={handleCardTap}
    >
      <span className="pub-event-bar" style={{ background: barColor }} />
      <div className="pub-event-body">
        <div className="pub-event-title">
          {EVENT_TYPE_ICON[e.type]}{' '}
          {e.title
            ? <span>{e.title}</span>
            : ensembleObjs.length > 0
              ? <EnsembleLinks ensembles={ensembleObjs} />
              : <span>{e.type}</span>}
          {isSub && <span className="pub-sub-tag">Sub</span>}
          {attendanceOnly && <span className="pub-attend-tag">Attendance required</span>}
          {e.status === 'Cancelled' && <span className="pub-cancelled-tag">Cancelled</span>}
          {e.status !== 'Cancelled' && e.changeNote && <span className="pub-changed-tag">Changed</span>}
        </div>

        {e.changeNote && <div className="pub-event-change">⚠ {e.changeNote}</div>}

        {e.title && ensembleObjs.length > 0 && (
          <div className="pub-tag-row pub-tag-row-sm">
            {ensembleObjs.map(en => (
              <span key={en.id} className="pub-ens-tag" style={{ background: ensembleColor(en) }}>
                <EnsembleLink ensemble={en} className="pub-ens-tag-link" />
              </span>
            ))}
          </div>
        )}

        <div className="pub-event-meta">
          {showDate && (
            <span>{parseDate(e.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          )}
          {formatTimeRange(e.startTime, e.endTime) && (
            <span><Clock size={13} /> {formatTimeRange(e.startTime, e.endTime)}</span>
          )}
          {e.location && <span><MapPin size={13} /> {e.location}</span>}
        </div>

        {e.repertoire && <div className="pub-event-rep"><Linkify text={e.repertoire} /></div>}

        {showNotes && e.notes && (
          <div className="pub-event-notes-inline">
            <StickyNote size={12} /> <Linkify text={e.notes} />
          </div>
        )}

        {pieces.length > 0 && (
          <div className="pub-event-pieces">
            {pieces.map(p => {
              const myPart = findPartForInstrument(p, studentInstrument);
              return (
                <div key={p.id} className="pub-event-piece">
                  <Link to={`/piece/${p.id}`} className="pub-event-piece-link">
                    <Music size={11} /> {p.title}{p.composer ? <span className="pub-event-piece-by"> · {p.composer}</span> : ''}
                  </Link>
                  {myPart && (
                    <a className="pub-event-mypart" href={myPart.url} target="_blank" rel="noreferrer">
                      My part <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              );
            })}
            {e.type === 'Concert' && (
              <Link to={`/program/${e.id}`} className="pub-event-program-link">
                <ScrollText size={12} /> View concert program
              </Link>
            )}
          </div>
        )}

        {detailLink && (
          <Link to={`/event/${e.id}`} className="pub-event-detail-link">
            Details <ChevronRight size={13} />
          </Link>
        )}
      </div>
    </div>
  );
}
