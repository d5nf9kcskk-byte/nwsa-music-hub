import { MapPin, Clock, FileText } from 'lucide-react';
import type { CalendarEvent, Ensemble } from '../../director/types';
import { parseDate, formatTimeRange, ensembleColor, EVENT_TYPE_ICON } from '../../director/utils';
import { EnsembleLink, EnsembleLinks } from './EnsembleLink';

interface Props {
  event: CalendarEvent;
  ensembleMap: Record<string, Ensemble>;
  /** Show the date in the meta row (for lists that span multiple days). */
  showDate?: boolean;
  /** Show the rehearsal notes (student-facing reminders). */
  showNotes?: boolean;
  /** Mark this card as a substitute assignment. */
  isSub?: boolean;
  /** Restrict the ensembles named in the title (e.g. only the student's). */
  ensembleIds?: string[];
}

/** Shared, consistently-styled public event card. Ensemble names link to hubs. */
export function PubEventCard({ event: e, ensembleMap, showDate, showNotes, isSub, ensembleIds }: Props) {
  const ids = ensembleIds ?? e.ensembleIds;
  const ensembleObjs = ids.map(id => ensembleMap[id]).filter(Boolean) as Ensemble[];
  const barColor = e.type === 'Concert' ? '#ca8a04' : ensembleColor(ensembleObjs[0]);

  return (
    <div className={`pub-event ${e.status === 'Cancelled' ? 'cancelled' : ''}`}>
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
          {e.status === 'Cancelled' && <span className="pub-cancelled-tag">Cancelled</span>}
        </div>

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

        {e.repertoire && <div className="pub-event-rep">{e.repertoire}</div>}
        {showNotes && e.notes && <div className="pub-event-note"><FileText size={12} /> {e.notes}</div>}
      </div>
    </div>
  );
}
