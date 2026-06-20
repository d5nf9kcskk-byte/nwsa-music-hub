import { Music, ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import { parseDate } from '../../director/utils';
import type { RepertoirePiece, CalendarEvent } from '../../director/types';

interface Props {
  pieces: RepertoirePiece[];
  eventsById: Record<string, CalendarEvent>;
}

/** Public repertoire list for an ensemble: title/composer, parts link, concert link. */
export function PubRepertoire({ pieces, eventsById }: Props) {
  if (pieces.length === 0) return null;
  return (
    <div className="pub-card pub-rep-list">
      {pieces.map(p => {
        const linkedEvents = (p.eventIds ?? []).map(id => eventsById[id]).filter(Boolean) as CalendarEvent[];
        return (
          <div key={p.id} className="pub-rep-row">
            <Music size={16} className="pub-rep-icon" />
            <div className="pub-rep-body">
              <div className="pub-rep-title">{p.title}</div>
              {(p.composer || p.arranger) && (
                <div className="pub-rep-by">
                  {p.composer}{p.arranger ? ` · arr. ${p.arranger}` : ''}
                </div>
              )}
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
            </div>
            {p.partsUrl && (
              <a className="pub-rep-parts" href={p.partsUrl} target="_blank" rel="noreferrer">
                Parts <ExternalLink size={12} />
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
