import { Link } from 'react-router';
import { useEvents } from '../director/hooks/useEvents';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { formatTime, todayStr, ensembleDisplayName } from '../director/utils';
import { concertsToday, repertoireLine, showCheckinLink } from './concertToday';

interface ConcertDayBannerProps {
  /** Public site links straight to /checkin; the director shell has no
   *  router for that tab, so it gets a callback instead (go('concertCheckin')). */
  checkinNav: { to: string } | { onClick: () => void };
}

/**
 * Concert-day reminder (#concert-day-alert), top of every page on both
 * shells. Reads only fields the director already sets on the event —
 * concertAttendance and checkin.enabled — never a new guess at "is this
 * required / open" (see concertCheckin.ts and its door doc).
 */
export function ConcertDayBanner({ checkinNav }: ConcertDayBannerProps) {
  const { events } = useEvents({ types: ['Concert'] });
  const { ensembles } = useEnsembles();
  const { pieces } = useRepertoire();
  const today = todayStr();
  const concerts = concertsToday(events, today);

  if (concerts.length === 0) return null;

  const pieceById = (id: string) => pieces.find(p => p.id === id);

  return (
    <div className="concert-day-banner">
      {concerts.map(event => {
        const names = event.ensembleIds
          .map(id => ensembleDisplayName(ensembles.find(e => e.id === id)))
          .filter(Boolean);
        const label = event.title || names.join(' + ') || 'Concert';
        const time = event.callTime || event.startTime;
        const repertoire = repertoireLine(event, pieceById);

        return (
          <details key={event.id} className="concert-day-banner-item">
            <summary>
              🎵 Concert tonight — {label}
              {time ? `, ${formatTime(time)}` : ''}
              {event.location ? ` · ${event.location}` : ''}
            </summary>
            <div className="concert-day-banner-detail">
              {names.length > 0 && <div>Performing: {names.join(', ')}</div>}
              {time && <div>Time: {formatTime(time)}</div>}
              {event.location && <div>Location: {event.location}</div>}
              {repertoire && <div>Repertoire: {repertoire}</div>}
              {event.concertAttendance === 'required' && <div>Attendance is required.</div>}
              {event.concertAttendance === 'optional' && <div>Attendance is optional.</div>}
              {showCheckinLink(event) && (
                'to' in checkinNav ? (
                  <Link to={checkinNav.to} className="concert-day-banner-checkin">Check in →</Link>
                ) : (
                  <button type="button" onClick={checkinNav.onClick} className="concert-day-banner-checkin">
                    Check in →
                  </button>
                )
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
