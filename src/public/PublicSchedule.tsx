import { useMemo } from 'react';
import { useParams, Link } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useStudents } from '../director/hooks/useStudents';
import { useEvents } from '../director/hooks/useEvents';
import { useRosterOverrides } from '../director/hooks/useRosterOverrides';
import { useAnnouncements, visibleAnnouncements } from '../director/hooks/useAnnouncements';
import { studentExpectation } from '../director/rosterResolver';
import { todayStr, parseDate, ensembleColor } from '../director/utils';
import { PubEventCard } from './components/PubEventCard';
import { PubAnnouncements } from './components/PubAnnouncements';

export function PublicSchedule() {
  const { id = '' } = useParams();
  const { ensembles } = useEnsembles();
  const { students } = useStudents();
  const { events } = useEvents();
  const { overrides } = useRosterOverrides();
  const { announcements } = useAnnouncements();

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

  const todayItems = mySchedule.filter(x => x.event.date === today);
  const upcomingItems = mySchedule.filter(x => x.event.date > today);

  const myAnnouncements = useMemo(
    () => student ? visibleAnnouncements(announcements, today, student.ensembleIds ?? []) : [],
    [announcements, today, student],
  );

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
              <Link key={e.id} to={`/ensemble/${e.id}`} className="pub-ens-tag" style={{ background: ensembleColor(e) }}>{e.name}</Link>
            ))}
          </div>
        )}
      </div>

      <PubAnnouncements items={myAnnouncements} ensembleMap={ensembleMap} />

      <h2 className="pub-section-title">
        Today · {parseDate(today).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
      </h2>
      {todayItems.length === 0 ? (
        <div className="pub-card pub-muted">Nothing scheduled for you today.</div>
      ) : (
        todayItems.map(({ event: e, exp }) => (
          <PubEventCard key={e.id} event={e} ensembleMap={ensembleMap} ensembleIds={exp.ensembleIds} isSub={exp.isSub} showNotes />
        ))
      )}

      <h2 className="pub-section-title">Coming up</h2>
      {upcomingItems.length === 0 ? (
        <div className="pub-muted">No upcoming rehearsals or events.</div>
      ) : (
        upcomingItems.map(({ event: e, exp }) => (
          <PubEventCard key={e.id} event={e} ensembleMap={ensembleMap} ensembleIds={exp.ensembleIds} isSub={exp.isSub} showDate showNotes />
        ))
      )}
    </div>
  );
}
