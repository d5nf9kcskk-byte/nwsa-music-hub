import { useMemo } from 'react';
import { useParams, Link } from 'react-router';
import { ChevronLeft, MapPin, Clock } from 'lucide-react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useStudents } from '../director/hooks/useStudents';
import { useEvents } from '../director/hooks/useEvents';
import { todayStr, parseDate, formatTimeRange, ensembleColor, EVENT_TYPE_ICON } from '../director/utils';

export function PublicEnsemble() {
  const { id = '' } = useParams();
  const { ensembles } = useEnsembles();
  const { students } = useStudents();
  const { events } = useEvents();

  const ensemble = ensembles.find(e => e.id === id);
  const today = todayStr();

  const members = useMemo(
    () => students
      .filter(s => s.status === 'Active' && s.ensembleIds?.includes(id))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [students, id],
  );

  const upcoming = useMemo(
    () => events
      .filter(e => e.ensembleIds.includes(id) && e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '99').localeCompare(b.startTime ?? '99'))
      .slice(0, 8),
    [events, id, today],
  );

  if (!ensemble) {
    return (
      <div className="pub-page">
        <Link to="/ensembles" className="pub-back"><ChevronLeft size={16} /> Ensembles</Link>
        <div className="pub-card pub-muted">Ensemble not found.</div>
      </div>
    );
  }

  return (
    <div className="pub-page">
      <Link to="/ensembles" className="pub-back"><ChevronLeft size={16} /> Ensembles</Link>
      <div className="pub-ens-hero" style={{ borderColor: ensembleColor(ensemble) }}>
        <h1 className="pub-h1">{ensemble.name}</h1>
        <div className="pub-muted">
          {members.length} member{members.length !== 1 ? 's' : ''}
          {ensemble.defaultLocation ? ` · ${ensemble.defaultLocation}` : ''}
          {formatTimeRange(ensemble.defaultStartTime, ensemble.defaultEndTime) ? ` · ${formatTimeRange(ensemble.defaultStartTime, ensemble.defaultEndTime)}` : ''}
        </div>
      </div>

      <h2 className="pub-section-title">Upcoming</h2>
      {upcoming.length === 0 ? (
        <div className="pub-muted">No upcoming events.</div>
      ) : (
        upcoming.map(e => (
          <div key={e.id} className={`pub-event ${e.status === 'Cancelled' ? 'cancelled' : ''}`}>
            <span className="pub-event-bar" style={{ background: e.type === 'Concert' ? '#ca8a04' : ensembleColor(ensemble) }} />
            <div className="pub-event-body">
              <div className="pub-event-title">
                {EVENT_TYPE_ICON[e.type]} {e.title || e.type}
                {e.status === 'Cancelled' && <span className="pub-cancelled-tag">Cancelled</span>}
              </div>
              <div className="pub-event-meta">
                <span>{parseDate(e.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                {formatTimeRange(e.startTime, e.endTime) && <span><Clock size={13} /> {formatTimeRange(e.startTime, e.endTime)}</span>}
                {e.location && <span><MapPin size={13} /> {e.location}</span>}
              </div>
              {e.repertoire && <div className="pub-event-rep">{e.repertoire}</div>}
            </div>
          </div>
        ))
      )}

      <h2 className="pub-section-title">Roster</h2>
      <div className="pub-card pub-roster">
        {members.length === 0 ? (
          <div className="pub-muted">No members listed.</div>
        ) : (
          members.map(s => (
            <div key={s.id} className="pub-roster-row">
              <span className="pub-roster-name">{s.name}</span>
              <span className="pub-roster-instr">{[s.instrument, s.section].filter(Boolean).join(' · ')}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
