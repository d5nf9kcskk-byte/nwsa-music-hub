import { Link } from 'react-router';
import { useEvents } from '../director/hooks/useEvents';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { formatTime, todayStr, ensembleDisplayName } from '../director/utils';
import { concertsToday, repertoireLine, showCheckinLink } from './concertToday';
import { tIn, useLang } from './i18n';

interface ConcertDayBannerProps {
  /** Public site links straight to /checkin; the director shell has no
   *  router for that tab, so it gets a callback instead (go('concertCheckin')). */
  checkinNav: { to: string } | { onClick: () => void };
  /** Follow the public site's EN|ES toggle. The director shell leaves this
   *  off: it has no toggle and stays English (#alerts-es). Only the app's
   *  own words translate; titles, names, places and pieces never do. */
  localized?: boolean;
}

/**
 * Concert-day reminder (#concert-day-alert), top of every page on both
 * shells. Reads only fields the director already sets on the event —
 * concertAttendance and checkin.enabled — never a new guess at "is this
 * required / open" (see concertCheckin.ts and its door doc).
 */
export function ConcertDayBanner({ checkinNav, localized = false }: ConcertDayBannerProps) {
  const deviceLang = useLang();
  const lang = localized ? deviceLang : 'en';
  const say = (key: string, params?: Record<string, string>) => tIn(lang, key, params);
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
        const label = event.title || names.join(' + ') || tIn(lang, 'type.Concert');
        const time = event.callTime || event.startTime;
        const repertoire = repertoireLine(event, pieceById);

        return (
          <details key={event.id} className="concert-day-banner-item">
            <summary>
              🎵 {say('cday.tonight', { label })}
              {time ? `, ${formatTime(time)}` : ''}
              {event.location ? ` · ${event.location}` : ''}
            </summary>
            <div className="concert-day-banner-detail">
              {names.length > 0 && <div>{say('cday.performing', { names: names.join(', ') })}</div>}
              {time && <div>{say('cday.time', { time: formatTime(time) })}</div>}
              {event.location && <div>{say('cday.location', { location: event.location })}</div>}
              {repertoire && <div>{say('cday.repertoire', { list: repertoire })}</div>}
              {event.concertAttendance === 'required' && <div>{say('cday.required')}</div>}
              {event.concertAttendance === 'optional' && <div>{say('cday.optional')}</div>}
              {showCheckinLink(event) && (
                'to' in checkinNav ? (
                  <Link to={checkinNav.to} className="concert-day-banner-checkin">{say('cday.checkIn')}</Link>
                ) : (
                  <button type="button" onClick={checkinNav.onClick} className="concert-day-banner-checkin">
                    {say('cday.checkIn')}
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
