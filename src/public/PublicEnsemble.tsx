import { useMemo, useRef, useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router';
import { ChevronLeft, CalendarDays, Armchair, ChevronRight } from 'lucide-react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useStudents } from '../director/hooks/useStudents';
import { useEvents } from '../director/hooks/useEvents';
import { useAnnouncements, visibleAnnouncements } from '../director/hooks/useAnnouncements';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { useSeatingCharts } from '../director/hooks/useSeatingCharts';
import { todayStr, formatTimeRange, formatTime, ensembleColor, parseDate } from '../director/utils';
import { PubEventCard } from './components/PubEventCard';
import { PubAnnouncements } from './components/PubAnnouncements';
import { PubRepertoire } from './components/PubRepertoire';
import { primaryStudent } from '../shared/identity';
import { SubscribeButton } from './components/SubscribeButton';
import { GradientHero } from './components/GradientHero';
import { t, tn, useLang } from '../shared/i18n';

export function PublicEnsemble() {
  useLang();
  const { id = '' } = useParams();
  const [showAllRoster, setShowAllRoster] = useState(false);
  const [showAllPieces, setShowAllPieces] = useState(false);
  const { ensembles, loading: ensemblesLoading } = useEnsembles();
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
        <div className="pub-card pub-muted">{ensemblesLoading ? 'Loading…' : 'Ensemble not found.'}</div>
      </div>
    );
  }

  // The one answer the hero must never bury: the next thing on the calendar.
  const nextEvent = [...upcomingConcerts, ...upcomingRehearsals, ...upcomingOther]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '99').localeCompare(b.startTime ?? '99'))[0];

  return (
    <div className="pub-page">
      <Link to="/ensembles" className="pub-back"><ChevronLeft size={16} /> Ensembles</Link>
      <GradientHero color={ensembleColor(ensemble)} seed={ensemble.id} title={ensemble.name}>
        <div className="pub-ghero-meta">
          {tn('ens.members', members.length)}
          {ensemble.defaultLocation ? ` · ${ensemble.defaultLocation}` : ''}
          {formatTimeRange(ensemble.defaultStartTime, ensemble.defaultEndTime) ? ` · ${formatTimeRange(ensemble.defaultStartTime, ensemble.defaultEndTime)}` : ''}
        </div>
        {nextEvent && (
          <Link to={`/event/${nextEvent.id}`} className="pub-ghero-next">
            <span>{t('misc.next')}:</span>
            {parseDate(nextEvent.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            {nextEvent.startTime ? ` · ${formatTime(nextEvent.startTime)}` : ''}
            {' · '}{nextEvent.title || nextEvent.type}
            <ChevronRight size={15} style={{ marginLeft: 'auto', flex: 'none' }} />
          </Link>
        )}
      </GradientHero>

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
          <PubRepertoire
            pieces={showAllPieces ? ensPieces : ensPieces.slice(0, 8)}
            eventsById={eventsById}
            studentInstrument={primaryStudent()?.instrument}
          />
          {!showAllPieces && ensPieces.length > 8 && (
            <button className="pub-showall-btn" onClick={() => setShowAllPieces(true)}>
              {t('misc.showAll', { count: ensPieces.length })}
            </button>
          )}
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
          (showAllRoster ? members : members.slice(0, 12)).map(s => (
            <Link key={s.id} to={`/student/${s.id}`} className="pub-roster-row pub-lookup-row">
              <span className="pub-roster-name">{s.name}</span>
              <span className="pub-roster-instr">{[s.instrument, s.section].filter(Boolean).join(' · ')}</span>
            </Link>
          ))
        )}
      </div>
      {!showAllRoster && members.length > 12 && (
        <button className="pub-showall-btn" onClick={() => setShowAllRoster(true)}>
          {t('misc.showAll', { count: members.length })}
        </button>
      )}
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
  const me = primaryStudent();
  if (charts.length === 0) return null;
  // Newest first; the newest published chart is the one in effect.
  const ordered = [...charts].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return (
    <div>
      <h2 className="pub-section-title"><Armchair size={15} style={{ verticalAlign: '-2px' }} /> Seating</h2>
      {ordered.map((c, ci) => (
        <div key={c.id} className="pub-card pub-seat-card">
          <div className="pub-seat-title">
            {c.title}
            {ordered.length > 1 && ci === 0 && <span className="pub-seat-current">Current</span>}
          </div>
          {c.date && (
            <div className="pub-seat-sub">
              Published {parseDate(c.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          )}
          {(c.pieceId && pieceTitle(c.pieceId)) && <div className="pub-seat-sub">For: {pieceTitle(c.pieceId)}</div>}
          {c.sections.map((sec, i) => (
            <div key={i} className="pub-seat-section">
              <div className="pub-seat-section-name">{sec.section}</div>
              <ol className="pub-seat-list">
                {sec.seats.map(seat => (
                  <li key={seat.studentId} className={`pub-seat-item${me?.id === seat.studentId ? ' me' : ''}`}>
                    <span className="pub-seat-name">{studentName(seat.studentId)}{me?.id === seat.studentId ? ' (you)' : ''}</span>
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
