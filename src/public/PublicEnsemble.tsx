import { useMemo, useRef, useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router';
import { CalendarDays, Armchair, ChevronRight } from 'lucide-react';
import { BackLink } from './components/BackLink';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useStudentsPublic } from './hooks/usePublicRoster';
import { usePublicEvents } from './hooks/usePublicEvents';
import { useAnnouncements, visibleAnnouncements, useMinuteTick } from '../director/hooks/useAnnouncements';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { useDocuments } from '../director/hooks/useDocuments';
import { useSeatingCharts } from '../director/hooks/useSeatingCharts';
import { todayStr, formatTimeRange, formatTime, ensembleColor, ensembleDisplayName, pieceEnsembleIds, isPublished, isClassGroup, groupKindLabel } from '../director/utils';
import { PubEventCard } from './components/PubEventCard';
import { PubAnnouncements } from './components/PubAnnouncements';
import { EnsembleAlerts } from './components/EnsembleAlerts';
import { PubRepertoire } from './components/PubRepertoire';
import { PubDocCard } from './components/PubDocCard';
import './documents.css';
import { primaryStudent } from '../shared/identity';
import { SeatingChartCard } from './components/SeatingChartCard';
import { SubscribeButton } from './components/SubscribeButton';
import { GradientHero } from './components/GradientHero';
import { fmtShortDate } from '../shared/dates';
import { t, tn, useLang, getLang } from '../shared/i18n';
import { PUBLIC_STUDENT_INFO } from './publicStudentInfo';
import { ensembleMoodLine, rosterOfOneLine } from '../shared/whimsy';
import { useEggCheer, useTapN } from '../shared/useEggCheer';
import { NoteBurst } from '../shared/NoteBurst';
import { PublicGroupStaffPanel } from '../director/components/GroupStaffPanel';
import { staffForGroupPage } from '../director/groupStaff';

export function PublicEnsemble() {
  useLang();
  const { id = '' } = useParams();
  const [showAllRoster, setShowAllRoster] = useState(false);
  const [showAllPieces, setShowAllPieces] = useState(false);
  const { ensembles, loading: ensemblesLoading } = useEnsembles();
  const { students } = useStudentsPublic();
  const { events } = usePublicEvents();
  const { announcements } = useAnnouncements();
  const now = useMinuteTick(); // scheduled posts appear the minute they go live
  const { pieces } = useRepertoire();
  const { documents } = useDocuments();

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
  const { upcomingRehearsals, upcomingClasses, upcomingConcerts, upcomingOther } = useMemo(() => {
    const mine = events
      .filter(e => e.ensembleIds.includes(id) && e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));
    return {
      upcomingRehearsals: mine.filter(e => e.type === 'Rehearsal' || e.type === 'Sectional').slice(0, 10),
      upcomingClasses: mine.filter(e => e.type === 'Class').slice(0, 6),
      upcomingConcerts: mine.filter(e => e.type === 'Concert').slice(0, 6),
      upcomingOther: mine.filter(e => e.type === 'Event').slice(0, 6),
    };
  }, [events, id, today]);
  const upcomingCount = upcomingRehearsals.length + upcomingClasses.length + upcomingConcerts.length + upcomingOther.length;

  // Deep links like /ensemble/:id#repertoire scroll to their section.
  const { hash } = useLocation();
  const repertoireRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (hash === '#repertoire' && repertoireRef.current) {
      repertoireRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [hash, pieces.length]);

  const ensAnnouncements = useMemo(
    () => visibleAnnouncements(announcements, today, [id], now)
      .filter(a => a.priority !== 'urgent'),
    [announcements, today, id, now],
  );

  /** Cancelled / changed events for this ensemble, plus school-wide schedule alerts. */
  const scheduleAlerts = useMemo(() => {
    return events
      .filter(e => {
        if (e.date < today) return false;
        if (e.status !== 'Cancelled' && !e.changeNote) return false;
        const forThis = e.ensembleIds.includes(id);
        const forEveryone = e.ensembleIds.length === 0;
        return forThis || forEveryone;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));
  }, [events, id, today]);

  /** Active urgent notices: everyone-wide, or tagged to this ensemble. */
  const urgentAlerts = useMemo(
    () => visibleAnnouncements(announcements, today, [id], now).filter(a => a.priority === 'urgent'),
    [announcements, today, id, now],
  );

  const { cheer, show } = useEggCheer();
  const onTitleTap = useTapN(3, 1200, () => {
    if (ensemble) show(ensembleMoodLine(ensembleDisplayName(ensemble), getLang()));
  });

  const ensPieces = useMemo(
    () => pieces.filter(p => pieceEnsembleIds(p).includes(id)),
    [pieces, id],
  );

  const ensDocs = useMemo(
    () => documents.filter(d => d.ensembleIds.includes(id) && isPublished(d, now)),
    [documents, id, now],
  );

  if (!ensemble) {
    return (
      <div className="pub-page">
        <BackLink fallback="/ensembles" label={t('event.back')} />
        <div className="pub-card pub-muted">{ensemblesLoading ? 'Loading…' : 'Ensemble not found.'}</div>
      </div>
    );
  }

  // The one answer the hero must never bury: the next thing on the calendar.
  const nextEvent = [...upcomingConcerts, ...upcomingRehearsals, ...upcomingClasses, ...upcomingOther]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '99').localeCompare(b.startTime ?? '99'))[0];

  // A class leads with its documents (#classes): a student opening Music Theory
  // came for the syllabus or the handout, not for a rehearsal list. Same block,
  // moved above the schedule — and repertoire/seating simply never apply.
  const isClass = isClassGroup(ensemble);
  const staff = staffForGroupPage(ensemble, null, ensembles);
  const docsSection = ensDocs.length > 0 ? (
    <div>
      <div className="pub-section-row">
        <h2 className="pub-section-title">Documents</h2>
        <Link to="/documents" className="pub-section-link">All documents</Link>
      </div>
      <div className="pub-doc-list">
        {ensDocs.map(d => <PubDocCard key={d.id} doc={d} />)}
      </div>
    </div>
  ) : null;

  return (
    <div className="pub-page">
      <BackLink fallback="/ensembles" label={t('event.back')} />
      <GradientHero
        color={ensembleColor(ensemble)}
        seed={ensemble.id}
        title={ensembleDisplayName(ensemble)}
        onTitleTap={onTitleTap}
      >
        <div className="pub-ghero-meta">
          {[
            PUBLIC_STUDENT_INFO ? tn('ens.members', members.length) : null,
            groupKindLabel(ensemble) || null,
            ensemble.defaultLocation || null,
            formatTimeRange(ensemble.defaultStartTime, ensemble.defaultEndTime) || null,
          ].filter(Boolean).join(' · ')}
        </div>
        {members.length === 1 && PUBLIC_STUDENT_INFO && (
          <div className="pub-ghero-meta">{rosterOfOneLine(getLang())}</div>
        )}
        {nextEvent && (
          <Link to={`/event/${nextEvent.id}`} className="pub-ghero-next">
            <span>{t('misc.next')}:</span>
            {fmtShortDate(nextEvent.date)}
            {nextEvent.startTime ? ` · ${formatTime(nextEvent.startTime)}` : ''}
            {' · '}{nextEvent.title || nextEvent.type}
            <ChevronRight size={15} style={{ marginLeft: 'auto', flex: 'none' }} />
          </Link>
        )}
      </GradientHero>

      {staff.length > 0 && <PublicGroupStaffPanel staff={staff} />}

      <EnsembleAlerts
        ensembleId={id}
        ensembleName={ensembleDisplayName(ensemble)}
        scheduleAlerts={scheduleAlerts}
        urgentAlerts={urgentAlerts}
      />

      <PubAnnouncements items={ensAnnouncements} ensembleMap={ensembleMap} showEnsembleTag />

      {isClass && docsSection}

      <div className="pub-section-row">
        <h2 className="pub-section-title">Schedule &amp; concerts</h2>
        <Link to={`/calendar?ensemble=${ensemble.id}`} className="pub-section-link"><CalendarDays size={13} /> Full calendar</Link>
      </div>
      <SubscribeButton ensembleId={ensemble.id} label={`Subscribe · ${ensembleDisplayName(ensemble)}`} />
      {upcomingCount === 0 && <div className="pub-muted">No upcoming events.</div>}

      {upcomingRehearsals.length > 0 && (
        <>
          <h2 className="pub-section-title">Rehearsal schedule</h2>
          {upcomingRehearsals.map(e => (
            <PubEventCard key={e.id} event={e} ensembleMap={ensembleMap} piecesById={piecesById} showDate showNotes ensembleIds={[id]} />
          ))}
        </>
      )}

      {upcomingClasses.length > 0 && (
        <>
          <h2 className="pub-section-title">Class schedule</h2>
          {upcomingClasses.map(e => (
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

      {!isClass && docsSection}

      {PUBLIC_STUDENT_INFO && !isClass && (
        <SeatingSection
          ensembleId={id}
          studentName={sid => students.find(s => s.id === sid)?.name ?? '—'}
          pieceTitle={pid => piecesById[pid]?.title}
        />
      )}

      {PUBLIC_STUDENT_INFO && (
        <>
          <h2 className="pub-section-title">Roster</h2>
          <div className="pub-card pub-roster">
            {members.length === 0 ? (
              <div className="pub-muted">No members listed.</div>
            ) : (
              (showAllRoster ? members : members.slice(0, 12)).map(s => (
                <Link key={s.id} to={`/student/${s.id}`} className="pub-roster-row pub-lookup-row">
                  <span className="pub-roster-name">{s.name}</span>
                  <span className="pub-roster-instr">{[s.instrument, s.grade].filter(Boolean).join(' · ')}</span>
                </Link>
              ))
            )}
          </div>
          {!showAllRoster && members.length > 12 && (
            <button className="pub-showall-btn" onClick={() => setShowAllRoster(true)}>
              {t('misc.showAll', { count: members.length })}
            </button>
          )}
        </>
      )}
      <NoteBurst cheer={cheer} />
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
  // Newest first; the newest published chart is the one in effect.
  const ordered = [...charts].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return (
    <div>
      <h2 className="pub-section-title"><Armchair size={15} style={{ verticalAlign: '-2px' }} /> Seating</h2>
      {ordered.map((c, ci) => (
        <SeatingChartCard
          key={c.id}
          chart={c}
          studentName={studentName}
          current={ordered.length > 1 && ci === 0}
          subtitle={c.pieceId && pieceTitle(c.pieceId) ? `For: ${pieceTitle(c.pieceId)}` : undefined}
        />
      ))}
    </div>
  );
}
