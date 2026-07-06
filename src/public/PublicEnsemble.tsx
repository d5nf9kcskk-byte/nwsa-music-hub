import { useMemo, useRef, useEffect } from 'react';
import { useParams, useLocation, Link } from 'react-router';
import { ChevronLeft, CalendarDays } from 'lucide-react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useStudents } from '../director/hooks/useStudents';
import { useEvents } from '../director/hooks/useEvents';
import { useAnnouncements, visibleAnnouncements } from '../director/hooks/useAnnouncements';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { useSeatingCharts } from '../director/hooks/useSeatingCharts';
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

  // Cap per SECTION (after splitting by type) so a far-off concert is never
  // pushed out of view by a long run of rehearsals.
  const { upcomingRehearsals, upcomingConcerts, upcomingOther } = useMemo(() => {
    const mine = events
      .filter(e => e.ensembleIds.includes(id) && e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));
    return {
      upcomingRehearsals: mine.filter(e => e.type === 'Rehearsal' || e.type === 'Sectional').slice(0, 10),
      upcomingConcerts: mine.filter(e => e.type === 'Concert').slice(0, 6),
      upcomingOther: mine.filter(e => e.type === 'Event').slice(0, 6),
    };
  }, [events, id, today]);
  const upcomingCount = upcomingRehearsals.length + upcomingConcerts.length + upcomingOther.length;

  // Deep links like /ensemble/:id#repertoire scroll to their section.
  const { hash } = useLocation();
  const repertoireRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (hash === '#repertoire' && repertoireRef.current) {
      repertoireRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [hash, pieces.length]);

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
        <h2 className="pub-section-title">Schedule &amp; concerts</h2>
        <Link to={`/calendar?ensemble=${ensemble.id}`} className="pub-section-link"><CalendarDays size={13} /> Full calendar</Link>
      </div>
      <SubscribeButton ensembleId={ensemble.id} label={`Subscribe · ${ensemble.name}`} />
      {upcomingCount === 0 && <div className="pub-muted">No upcoming events.</div>}

      {upcomingRehearsals.length > 0 && (
        <>
          <h2 className="pub-section-title">Rehearsal schedule</h2>
          {upcomingRehearsals.map(e => (
            <PubEventCard key={e.id} event={e} ensembleMap={ensembleMap} piecesById={piecesById} showDate showNotes ensembleIds={[id]} />
          ))}
        </>
      )}

      {upcomingConcerts.length > 0 && (
        <>
          <h2 className="pub-section-title">Concert schedule</h2>
          {upcomingConcerts.map(e => (
            <PubEventCard key={e.id} event={e} ensembleMap={ensembleMap} piecesById={piecesById} showDate showNotes ensembleIds={[id]} />
          ))}
        </>
      )}

      {upcomingOther.length > 0 && (
        <>
          <h2 className="pub-section-title">Event schedule</h2>
          {upcomingOther.map(e => (
            <PubEventCard key={e.id} event={e} ensembleMap={ensembleMap} piecesById={piecesById} showDate showNotes ensembleIds={[id]} />
          ))}
        </>
      )}

      {ensPieces.length > 0 && (
        <div ref={repertoireRef} id="repertoire">
          <h2 className="pub-section-title">Repertoire</h2>
          <PubRepertoire pieces={ensPieces} eventsById={eventsById} />
        </div>
      )}

      <SeatingSection
        ensembleId={id}
        studentName={sid => students.find(s => s.id === sid)?.name ?? '—'}
        pieceTitle={pid => piecesById[pid]?.title}
      />

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

/** Published seating charts for this ensemble (playing-exam results). */
function SeatingSection({ ensembleId, studentName, pieceTitle }: {
  ensembleId: string;
  studentName: (id: string) => string;
  pieceTitle: (id: string) => string | undefined;
}) {
  const { charts } = useSeatingCharts(ensembleId);
  if (charts.length === 0) return null;
  return (
    <div>
      <h2 className="pub-section-title">🪑 Seating</h2>
      {charts.map(c => (
        <div key={c.id} className="pub-card pub-seat-card">
          <div className="pub-seat-title">{c.title}</div>
          {(c.pieceId && pieceTitle(c.pieceId)) && <div className="pub-seat-sub">For: {pieceTitle(c.pieceId)}</div>}
          {c.sections.map((sec, i) => (
            <div key={i} className="pub-seat-section">
              <div className="pub-seat-section-name">{sec.section}</div>
              <ol className="pub-seat-list">
                {sec.seats.map(seat => (
                  <li key={seat.studentId} className="pub-seat-item">
                    <span className="pub-seat-name">{studentName(seat.studentId)}</span>
                    {seat.note && <span className="pub-seat-note">{seat.note}</span>}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
