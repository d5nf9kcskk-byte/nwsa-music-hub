import { useMemo } from 'react';
import { Link } from 'react-router';
import { CalendarDays, Users, UserSearch, MapPin, Clock } from 'lucide-react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useEvents } from '../director/hooks/useEvents';
import { todayStr, parseDate, formatTimeRange, ensembleColor, EVENT_TYPE_ICON } from '../director/utils';
import type { CalendarEvent } from '../director/types';

export function PublicHome() {
  const { ensembles } = useEnsembles();
  const { events, loading } = useEvents();

  const today = todayStr();
  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);

  const todayEvents = events
    .filter(e => e.date === today && e.status !== 'Cancelled')
    .sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));

  const upcoming = events
    .filter(e => e.date > today && e.status !== 'Cancelled')
    .slice(0, 5);

  function label(e: CalendarEvent) {
    if (e.title) return e.title;
    return e.ensembleIds.map(id => ensembleMap[id]?.name).filter(Boolean).join(', ') || e.type;
  }
  function color(e: CalendarEvent) {
    return e.type === 'Concert' ? '#ca8a04' : ensembleColor(ensembleMap[e.ensembleIds[0]]);
  }

  return (
    <div className="pub-page">
      <div className="pub-hero">
        <div className="pub-hero-date">{parseDate(today).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        <h1>Today at NWSA</h1>
      </div>

      {loading ? (
        <div className="pub-muted">Loading…</div>
      ) : todayEvents.length === 0 ? (
        <div className="pub-card pub-muted">No rehearsals or events scheduled today.</div>
      ) : (
        todayEvents.map(e => (
          <div key={e.id} className="pub-event">
            <span className="pub-event-bar" style={{ background: color(e) }} />
            <div className="pub-event-body">
              <div className="pub-event-title">{EVENT_TYPE_ICON[e.type]} {label(e)}</div>
              <div className="pub-event-meta">
                {formatTimeRange(e.startTime, e.endTime) && <span><Clock size={13} /> {formatTimeRange(e.startTime, e.endTime)}</span>}
                {e.location && <span><MapPin size={13} /> {e.location}</span>}
              </div>
              {e.repertoire && <div className="pub-event-rep">{e.repertoire}</div>}
            </div>
          </div>
        ))
      )}

      <div className="pub-quick">
        <Link to="/lookup" className="pub-quick-btn"><UserSearch size={22} /><span>Find my schedule</span></Link>
        <Link to="/ensembles" className="pub-quick-btn"><Users size={22} /><span>Browse ensembles</span></Link>
        <Link to="/calendar" className="pub-quick-btn"><CalendarDays size={22} /><span>Full calendar</span></Link>
      </div>

      {upcoming.length > 0 && (
        <>
          <h2 className="pub-section-title">Coming up</h2>
          {upcoming.map(e => (
            <Link key={e.id} to="/calendar" className="pub-upcoming">
              <span className="pub-upcoming-date">
                {parseDate(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              <span className="pub-upcoming-dot" style={{ background: color(e) }} />
              <span className="pub-upcoming-label">{label(e)}</span>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
