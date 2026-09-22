import { useMemo, useRef, useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router';
import { CalendarDays, Armchair, ChevronRight, ClipboardCheck } from 'lucide-react';
import { BackLink } from './components/BackLink';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useAssignments } from '../director/hooks/useAssignments';
import { AssignmentCard } from './components/AssignmentCard';
import { useStudentsPublic } from './hooks/usePublicRoster';
import { usePublicEvents } from './hooks/usePublicEvents';
import { useAnnouncements, visibleAnnouncements, useMinuteTick } from '../director/hooks/useAnnouncements';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { useDocuments } from '../director/hooks/useDocuments';
import { useSeatingCharts } from '../director/hooks/useSeatingCharts';
import { todayStr, formatTimeRange, formatTime, ensembleColor, ensembleDisplayName, pieceEnsembleIds, isPublished, isClassGroup, groupKindLabel, WEEKDAY_LABELS } from '../director/utils';
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
import { chartPieceIds } from '../shared/concertRosters';
import type { SeatingChart } from '../director/types';
import { ensembleMoodLine, rosterOfOneLine } from '../shared/whimsy';
import { useEggCheer, useTapN } from '../shared/useEggCheer';
import { NoteBurst } from '../shared/NoteBurst';
import { PublicGroupStaffPanel } from '../director/components/GroupStaffPanel';
import { staffForGroupPage } from '../director/groupStaff';

/** "Tue · Thu" from the stored weekday numbers, or nothing when a group has no
 *  standing pattern. Sunday-first, matching `WEEKDAY_LABELS`. */
function meetingDaysLabel(days: number[] | undefined): string | null {
  const valid = (days ?? []).filter(d => d >= 0 && d <= 6);
  if (valid.length === 0) return null;
  return [...new Set(valid)].sort((a, b) => a - b).map(d => WEEKDAY_LABELS[d]).join(' · ');
}

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
  const { assignments } = useAssignments();
  const [showAllPast, setShowAllPast] = useState(false);

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

  /**
   * This group's assignments and exams.
   *
   * The page had NO assignments section at all — a class page showed
   * announcements, documents, schedule and roster, and a student sent to their
   * class to find the exam found everything except the exam. It was tagged
   * correctly and published; the page simply never asked.
   *
   * Past ones are kept, behind a fold. A due date is when work is DUE, not
   * when it stops existing: a written test can still be chased days later, and
   * a student looking up what they missed has nowhere else to look.
   */
  const { upcomingWork, pastWork } = useMemo(() => {
    const mine = assignments
      .filter(a => a.ensembleIds.includes(id) && isPublished(a, now));
    return {
      upcomingWork: mine
        .filter(a => a.dueDate >= today)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      pastWork: mine
        .filter(a => a.dueDate < today)
        .sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
    };
  }, [assignments, id, today, now]);

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
  // The group's OWN semester, stored on the group (see Ensemble.term).
  // `currentTerm(terms, today)` was wrong here twice over: it answers "what
  // term is it now" rather than "when does this course run", so every class
  // printed the same string; and `terms` is the MDCPS calendar, while a
  // dual-enrollment course's fall ends Dec 11 rather than Dec 19
  // (#college-hs-calendar-deps). `terms` is still read above for orgs that
  // have configured one — a group with no term of its own says nothing.
  const term = ensemble?.term?.trim() || '';
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

  // Assignments & exams. A class leads with these and its documents — the
  // student opening Survey Music History came for the exam, not for a
  // rehearsal list — so on a class page this sits straight under Documents
  // and above the schedule.
  const workSection = (upcomingWork.length > 0 || pastWork.length > 0) ? (
    <div>
      <div className="pub-section-row">
        <h2 className="pub-section-title">
          <ClipboardCheck size={15} style={{ verticalAlign: '-2px' }} /> {t('nav.assignments')}
        </h2>
        <Link to="/assignments" className="pub-section-link">{t('nav.assignments')}</Link>
      </div>
      {upcomingWork.length === 0 && (
        <div className="pub-muted">Nothing due right now.</div>
      )}
      {upcomingWork.map(a => (
        <AssignmentCard key={a.id} assignment={a} ensembles={ensembles} showEnsembles={false} />
      ))}
      {pastWork.length > 0 && (
        <>
          <h3 className="pub-subsection-title">Past</h3>
          {(showAllPast ? pastWork : pastWork.slice(0, 3)).map(a => (
            <AssignmentCard key={a.id} assignment={a} ensembles={ensembles} showEnsembles={false} withAnchor={false} />
          ))}
          {!showAllPast && pastWork.length > 3 && (
            <button className="pub-showall-btn" onClick={() => setShowAllPast(true)}>
              {t('misc.showAll', { count: pastWork.length })}
            </button>
          )}
        </>
      )}
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
            // The catalog number a dual-enrollment student is registered
            // under, and the one everyone outside this building asks them for.
            ensemble.courseCode || null,
            ensemble.defaultLocation || null,
            // Which days it meets — "Tue · Thu" is half of "when is my class",
            // and the page only ever carried the other half.
            meetingDaysLabel(ensemble.meetingDays),
            formatTimeRange(ensemble.defaultStartTime, ensemble.defaultEndTime) || null,
          ].filter(Boolean).join(' · ')}
        </div>
        {/* The semester this group runs, stored on the group — a class with
            none says nothing rather than borrowing the district's current
            term, which is the wrong calendar for a college course. */}
        {term && <div className="pub-ghero-meta">{term}</div>}
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
      {isClass && workSection}

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

      {!isClass && workSection}
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
              // A group with no roster is listed everywhere on purpose: the
              // class exists and is on the calendar whether or not anybody has
              // been enrolled yet, and staff need to see it is there and
              // available. Seven of the sixteen college classes are in exactly
              // this state today. "No members listed" read like a failure.
              <div className="pub-muted">
                {isClass
                  ? 'The roster for this class has not been built yet.'
                  : 'No members listed yet.'}
              </div>
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
  // One chart can be several works' personnel (a whole reduced-orchestra
  // half), so the label names all of them.
  const chartWorks = (c: SeatingChart) => {
    const titles = chartPieceIds(c).map(pieceTitle).filter(Boolean);
    return titles.length ? `For: ${titles.join(', ')}` : '';
  };
  return (
    <div>
      <h2 className="pub-section-title"><Armchair size={15} style={{ verticalAlign: '-2px' }} /> Seating</h2>
      {ordered.map((c, ci) => (
        <SeatingChartCard
          key={c.id}
          chart={c}
          studentName={studentName}
          current={ordered.length > 1 && ci === 0}
          subtitle={chartWorks(c) || undefined}
        />
      ))}
    </div>
  );
}
