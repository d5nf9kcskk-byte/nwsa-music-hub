import { useMemo } from 'react';
import { useParams, Link } from 'react-router';
import { ChevronLeft, CalendarDays } from 'lucide-react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useStudents } from '../director/hooks/useStudents';
import { useEvents } from '../director/hooks/useEvents';
import { useAnnouncements, visibleAnnouncements } from '../director/hooks/useAnnouncements';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { todayStr, formatTimeRange, ensembleColor } from '../director/utils';
import { PubEventCard } from './components/PubEventCard';
import { PubAnnouncements } from './components/PubAnnouncements';
import { PubRepertoire } from './components/PubRepertoire';
import { SubscribeButton } from './components/SubscribeButton';

export function PublicEnsemble() {
  const { id = '' } = useParams();
  const { ensembles } = useEnsembles();
  const { students } = useStudents();
  const { events } = useEvents();
  const { announcements } = useAnnouncements();
  const { pieces } = useRepertoire();

  const ensemble = ensembles.find(e => e.id === id);
  const today = todayStr();
  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);
  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);
  const piecesById = useMemo(() => Object.fromEntries(pieces.map(p => [p.id, p])), [pieces]);

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
      .slice(0, 10),
    [events, id, today],
  );

  const ensAnnouncements = useMemo(
    () => visibleAnnouncements(announcements, today, [id]),
    [announcements, today, id],
  );

  const ensPieces = useMemo(
    () => pieces.filter(p => p.ensembleId === id),
    [pieces, id],
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

      <PubAnnouncements items={ensAnnouncements} ensembleMap={ensembleMap} showEnsembleTag={false} />

      <div className="pub-section-row">
        <h2 className="pub-section-title">Schedule</h2>
        <Link to={`/calendar?ensemble=${ensemble.id}`} className="pub-section-link"><CalendarDays size={13} /> Full calendar</Link>
      </div>
      <SubscribeButton ensembleId={ensemble.id} label={`Subscribe · ${ensemble.name}`} />
      {upcoming.length === 0 ? (
        <div className="pub-muted">No upcoming events.</div>
      ) : (
        upcoming.map(e => (
          <PubEventCard key={e.id} event={e} ensembleMap={ensembleMap} piecesById={piecesById} showDate showNotes ensembleIds={[id]} />
        ))
      )}

      {ensPieces.length > 0 && (
        <>
          <h2 className="pub-section-title">Repertoire</h2>
          <PubRepertoire pieces={ensPieces} eventsById={eventsById} />
        </>
      )}

      <h2 className="pub-section-title">Roster</h2>
      <div className="pub-card pub-roster">
        {members.length === 0 ? (
          <div className="pub-muted">No members listed.</div>
        ) : (
          members.map(s => (
            <Link key={s.id} to={`/student/${s.id}`} className="pub-roster-row pub-lookup-row">
              <span className="pub-roster-name">{s.name}</span>
              <span className="pub-roster-instr">{[s.instrument, s.section].filter(Boolean).join(' · ')}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
