import { Music, ExternalLink, Clock } from 'lucide-react';
import { Link } from 'react-router';
import { parseDate, findPartForInstrument } from '../../director/utils';
import type { RepertoirePiece, CalendarEvent } from '../../director/types';

interface Props {
  pieces: RepertoirePiece[];
  eventsById: Record<string, CalendarEvent>;
  studentInstrument?: string;
}

/** Public repertoire list for an ensemble: title/composer, metadata, parts, concert links. */
export function PubRepertoire({ pieces, eventsById, studentInstrument }: Props) {
  if (pieces.length === 0) return null;
  return (
    <div className="pub-card pub-rep-list">
      {pieces.map(p => {
        const linkedEvents = (p.eventIds ?? []).map(id => eventsById[id]).filter(Boolean) as CalendarEvent[];
        const myPart = findPartForInstrument(p, studentInstrument);

        return (
          <div key={p.id} className="pub-rep-row">
            <Music size={16} className="pub-rep-icon" />
            <div className="pub-rep-body">
              <Link to={`/piece/${p.id}`} className="pub-rep-title">{p.title}</Link>
              {(p.composer || p.arranger) && (
                <div className="pub-rep-by">
                  {p.composer}
                  {p.composerDates && <span className="pub-rep-dates"> ({p.composerDates})</span>}
                  {p.arranger ? ` · arr. ${p.arranger}` : ''}
                </div>
              )}
              <div className="pub-rep-chips">
                {p.catalogNumber && <span className="pub-rep-chip">{p.catalogNumber}</span>}
                {p.duration && (
                  <span className="pub-rep-chip">
                    <Clock size={10} style={{ verticalAlign: '-1px' }} /> {p.duration} min
                  </span>
                )}
                {p.movements && p.movements.length > 0 && (
                  <span className="pub-rep-chip">{p.movements.length} mvt{p.movements.length !== 1 ? 's' : ''}</span>
                )}
              </div>
              {p.notes && <div className="pub-rep-notes">{p.notes}</div>}
              {linkedEvents.length > 0 && (
                <div className="pub-rep-events">
                  {linkedEvents.map(ev => (
                    <Link key={ev.id} to="/calendar" className="pub-rep-event-tag">
                      {ev.title || ev.type} · {parseDate(ev.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Link>
                  ))}
                </div>
              )}
              {myPart && (
                <a className="pub-rep-mypart" href={myPart.url} target="_blank" rel="noreferrer">
                  Your part ({myPart.instrument}) <ExternalLink size={11} />
                </a>
              )}
            </div>
            <div className="pub-rep-actions">
              {p.partsSharedUrl && (
                <a className="pub-rep-parts" href={p.partsSharedUrl} target="_blank" rel="noreferrer">
                  Parts <ExternalLink size={12} />
                </a>
              )}
              {!p.partsSharedUrl && p.partsUrl && (
                <a className="pub-rep-parts" href={p.partsUrl} target="_blank" rel="noreferrer">
                  Parts <ExternalLink size={12} />
                </a>
              )}
              <Link to={`/piece/${p.id}`} className="pub-rep-details">Details</Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
