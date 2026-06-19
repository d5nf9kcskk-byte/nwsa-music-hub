import { useMemo } from 'react';
import { useParams, Link } from 'react-router';
import { ChevronLeft, MapPin, Clock } from 'lucide-react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useStudents } from '../director/hooks/useStudents';
import { useEvents } from '../director/hooks/useEvents';
import { useRosterOverrides } from '../director/hooks/useRosterOverrides';
import { studentExpectation } from '../director/rosterResolver';
import { todayStr, parseDate, formatTimeRange, ensembleColor, EVENT_TYPE_ICON } from '../director/utils';

export function PublicSchedule() {
  const { id = '' } = useParams();
  const { ensembles } = useEnsembles();
  const { students } = useStudents();
  const { events } = useEvents();
  const { overrides } = useRosterOverrides();

  const student = students.find(s => s.id === id);
  const today = todayStr();
  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);
  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);

  // Upcoming events where this student is expected (base member or sub, minus pulls).
  const mySchedule = useMemo(() => {
    if (!student) return [];
    return events
      .filter(e => e.date >= today)
      .map(e => ({ event: e, exp: studentExpectation(id, e, students, overrides, eventsById) }))
      .filter(x => x.exp.expected)
      .sort((a, b) => a.event.date.localeCompare(b.event.date) || (a.event.startTime ?? '99').localeCompare(b.event.startTime ?? '99'));
  }, [student, events, students, overrides, eventsById, id, today]);

  if (!student) {
    return (
      <div className="pub-page">
        <Link to="/lookup" className="pub-back"><ChevronLeft size={16} /> Search</Link>
        <div className="pub-card pub-muted">Student not found.</div>
      </div>
    );
  }

  const homeEnsembles = ensembles.filter(e => student.ensembleIds?.includes(e.id));

  return (
    <div className="pub-page">
      <Link to="/lookup" className="pub-back"><ChevronLeft size={16} /> Search</Link>

      <div className="pub-ens-hero">
        <h1 className="pub-h1">{student.name}</h1>
        <div className="pub-muted">{student.instrument}{student.grade ? ` · ${student.grade}` : ''}</div>
        {homeEnsembles.length > 0 && (
          <div className="pub-tag-row">
            {homeEnsembles.map(e => (
              <span key={e.id} className="pub-ens-tag" style={{ background: ensembleColor(e) }}>{e.name}</span>
            ))}
          </div>
        )}
      </div>

      <h2 className="pub-section-title">Where you should be</h2>
      {mySchedule.length === 0 ? (
        <div className="pub-card pub-muted">No upcoming rehearsals or events.</div>
      ) : (
        mySchedule.map(({ event: e, exp }) => (
          <div key={e.id} className={`pub-event ${e.status === 'Cancelled' ? 'cancelled' : ''}`}>
            <span className="pub-event-bar" style={{ background: e.type === 'Concert' ? '#ca8a04' : ensembleColor(ensembleMap[exp.ensembleIds[0]]) }} />
            <div className="pub-event-body">
              <div className="pub-event-title">
                {EVENT_TYPE_ICON[e.type]} {e.title || exp.ensembleIds.map(eid => ensembleMap[eid]?.name).filter(Boolean).join(', ') || e.type}
                {exp.isSub && <span className="pub-sub-tag">Sub</span>}
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
    </div>
  );
}
