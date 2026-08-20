import { useEffect, useMemo, useState, Fragment } from 'react';
import { useParams, Link } from 'react-router';
import { useMonthSwipe } from '../shared/useMonthSwipe';
import { NowNext } from './components/NowNext';
import { NowLine, nowLineIndex, usePastDimming } from './components/NowLine';
import { PracticeCard } from './components/PracticeCard';
import { PlannedAbsenceButton } from './components/PlannedAbsence';
import { SignupAlert } from './components/SignupAlert';
import { BackLink } from './components/BackLink';
import { ChevronLeft, ChevronRight, ExternalLink, LayoutList, Grid3x3, CalendarX, GraduationCap } from 'lucide-react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useStudentsPublic } from './hooks/usePublicRoster';
import { usePublicEvents } from './hooks/usePublicEvents';
import { usePublicOverrides } from './hooks/usePublicRoster';
import { useAnnouncements, visibleAnnouncements, useMinuteTick } from '../director/hooks/useAnnouncements';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { useAssignments } from '../director/hooks/useAssignments';
import { studentExpectation } from '../director/rosterResolver';
import { todayStr, toDateStr, parseDate, formatTime, ensembleColor, ensembleDisplayName, findPartForInstrument, studentHasAssignment, assignmentEmoji, isPublished, CONCERT_COLOR, ASSIGN_COLOR } from '../director/utils';
import { PubEventCard } from './components/PubEventCard';
import { PubSelect } from './components/PubSelect';
import { PubAnnouncements } from './components/PubAnnouncements';
import { SkeletonCards, EmptyState } from './components/PageHeader';
import { SubscribeButton } from './components/SubscribeButton';
import { getIdentity } from '../shared/identity';
import { t, useLang, getLang } from '../shared/i18n';
import { dailyPun, instrumentQuip, say, yesThatsYouLine } from '../shared/whimsy';
import { useEggCheer, useTapN } from '../shared/useEggCheer';
import { NoteBurst } from '../shared/NoteBurst';
import { fmtDayHeader, fmtMonthYear, fmtShortDate, weekdayInitials } from '../shared/dates';
import type { CalendarEvent } from '../director/types';
import { PUBLIC_STUDENT_INFO } from './publicStudentInfo';

type TypeFilter = 'all' | 'rehearsals' | 'classes' | 'concerts' | 'events';

const FILTERS: { key: TypeFilter; labelKey: string }[] = [
  { key: 'all',        labelKey: 'lookup.all' },
  { key: 'rehearsals', labelKey: 'cal.rehearsals' },
  { key: 'classes',    labelKey: 'cal.classes' },
  { key: 'concerts',   labelKey: 'cal.concerts' },
  { key: 'events',     labelKey: 'cal.events' },
];

function matchesFilter(e: CalendarEvent, f: TypeFilter): boolean {
  if (f === 'all') return true;
  if (f === 'rehearsals') return e.type === 'Rehearsal' || e.type === 'Sectional';
  if (f === 'classes') return e.type === 'Class';
  if (f === 'concerts') return e.type === 'Concert';
  return e.type === 'Event';
}

export function PublicSchedule() {
  useLang();
  const { id = '' } = useParams();
  const { ensembles } = useEnsembles();
  const { students, loading: studentsLoading } = useStudentsPublic();
  const { events, ensureMonth } = usePublicEvents();
  const { overrides } = usePublicOverrides();
  const { announcements } = useAnnouncements();
  const now = useMinuteTick(); // scheduled posts appear the minute they go live
  const { pieces } = useRepertoire();
  const { assignments } = useAssignments();

  // Plain component state on purpose: the filter and view reset every time the
  // student re-opens this page, so nothing stays silently hidden.
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const { cheer, show } = useEggCheer();
  const onNameTap = useTapN(4, 2000, () => show(yesThatsYouLine(getLang())));

  const student = students.find(s => s.id === id);
  const today = todayStr();
  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);
  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);
  const piecesById = useMemo(() => Object.fromEntries(pieces.map(p => [p.id, p])), [pieces]);

  // Upcoming events where this student is expected — performing (base member
  // or sub, minus pulls) OR required in the audience (attendanceEnsembleIds).
  const mySchedule = useMemo(() => {
    if (!student) return [];
    return events
      .filter(e => e.date >= today)
      .map(e => ({ event: e, exp: studentExpectation(id, e, students, overrides, eventsById) }))
      .filter(x => x.exp.expected)
      .sort((a, b) => a.event.date.localeCompare(b.event.date) || (a.event.startTime ?? '99').localeCompare(b.event.startTime ?? '99'));
  }, [student, events, students, overrides, eventsById, id, today]);

  const todayItems = mySchedule.filter(x => x.event.date === today);
  const { nowHM, isPast } = usePastDimming();
  const todayNowIdx = nowLineIndex(todayItems.map(x => x.event), today, nowHM);
  const upcomingItems = mySchedule.filter(x => x.event.date > today && matchesFilter(x.event, filter));

  const myAnnouncements = useMemo(
    () => student ? visibleAnnouncements(announcements, today, student.ensembleIds ?? [], now) : [],
    [announcements, today, student, now],
  );

  // Conflict explainer (#10): today's lesson windows that override a rehearsal.
  const myLessonsToday = useMemo(
    () => student
      ? overrides.filter(o => o.kind === 'lesson' && o.studentId === student.id
          && o.startDate && o.endDate && o.startDate <= today && today <= o.endDate)
      : [],
    [overrides, student, today],
  );

  const myAssignments = useMemo(
    () => student
      ? assignments
          .filter(a => a.dueDate >= today && isPublished(a, now) && studentHasAssignment(a, student.id, student.ensembleIds))
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      : [],
    [assignments, today, now, student],
  );

  // Pieces linked to upcoming events that have a part matching this student's instrument.
  const myParts = useMemo(() => {
    if (!student) return [];
    const upcomingEventIds = new Set(mySchedule.map(x => x.event.id));
    const piecesFromEvents = new Set(
      mySchedule.flatMap(x => x.event.pieceIds ?? []),
    );
    const result: { piece: typeof pieces[0]; partUrl: string; eventTitles: string[] }[] = [];
    for (const p of pieces) {
      const partLink = findPartForInstrument(p, student.instrument);
      if (!partLink) continue;
      const linkedEventIds = new Set([
        ...(p.eventIds ?? []).filter(eid => upcomingEventIds.has(eid)),
        ...(piecesFromEvents.has(p.id)
          ? mySchedule.filter(x => (x.event.pieceIds ?? []).includes(p.id)).map(x => x.event.id)
          : []),
      ]);
      if (linkedEventIds.size === 0) continue;
      const eventTitles = [...linkedEventIds]
        .map(eid => eventsById[eid])
        .filter(Boolean)
        .map(e => e.title || e.type);
      result.push({ piece: p, partUrl: partLink.url, eventTitles });
    }
    return result;
  }, [student, mySchedule, pieces, eventsById]);

  if (!PUBLIC_STUDENT_INFO) {
    return (
      <div className="pub-page">
        <BackLink fallback="/lookup" label={t('event.back')} />
        <div className="pub-card pub-muted">{t('lookup.rosterPending')}</div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="pub-page">
        <BackLink fallback="/lookup" label={t('event.back')} />
        {studentsLoading ? <SkeletonCards n={3} /> : <div className="pub-card pub-muted">{t('sched.studentNotFound')}</div>}
      </div>
    );
  }

  const homeEnsembles = ensembles.filter(e => student.ensembleIds?.includes(e.id));

  return (
    <div className="pub-page">
      <BackLink fallback="/lookup" label={t('event.back')} />

      {/* Parent mode: quick switch between saved students (#11) */}
      {getIdentity().students.length > 1 && (
        <div className="pub-chips" style={{ paddingBottom: 6 }}>
          {getIdentity().students.map(s => (
            <Link key={s.id} to={`/student/${s.id}`} className={`pub-chip ${s.id === student.id ? 'active' : ''}`}>
              {s.name.split(' ')[0]}
            </Link>
          ))}
        </div>
      )}

      <div className="pub-ens-hero">
        <h1 className="pub-h1" onClick={onNameTap} style={{ cursor: 'pointer' }}>{student.name}</h1>
        <div className="pub-muted">{[student.instrument, student.grade].filter(Boolean).join(' · ')}</div>
        <Link to="/lookup" className="pub-muted" style={{ display: 'inline-block', marginTop: 4, fontWeight: 700 }}>
          {t('sched.notYou')}
        </Link>
        {homeEnsembles.length > 0 && (
          <div className="pub-tag-row">
            {homeEnsembles.map(e => (
              <Link key={e.id} to={`/ensemble/${e.id}`} className="pub-ens-tag" style={{ background: ensembleColor(e) }}>{ensembleDisplayName(e)}</Link>
            ))}
          </div>
        )}
      </div>

      {/* Anything this student still has to answer (#signups). */}
      <SignupAlert student={student} />

      {/* Personal calendar feed — the one subscription that follows THIS student. */}
      <SubscribeButton studentId={student.id} label={t('sched.subscribeMine', { name: student.name.split(' ')[0] })} />
      <PlannedAbsenceButton student={student} />

      <PubAnnouncements items={myAnnouncements} ensembleMap={ensembleMap} />

      <NowNext items={mySchedule} />

      {/* Hidden delight (#easter-eggs): a line for your own instrument, one a day. */}
      {instrumentQuip(student.instrument, getLang()) && (
        <div className="pub-instrument-quip">{instrumentQuip(student.instrument, getLang())}</div>
      )}

      {myLessonsToday.map(o => (
        <div key={o.id} className="pub-conflict-chip">
          <GraduationCap size={14} style={{ verticalAlign: '-2px' }} />{' '}
          {t('sched.lessonOverride', {
            time: o.startTime && o.endTime ? ` ${formatTime(o.startTime)}–${formatTime(o.endTime)}` : '',
            ensemble: ensembleMap[o.ensembleId]?.name ?? t('type.Rehearsal').toLowerCase(),
          })}
        </div>
      ))}

      <PracticeCard student={student} schedule={mySchedule} piecesById={piecesById} assignments={myAssignments} />

      {myAssignments.length > 0 && (
        <>
          <h2 className="pub-section-title">{t('sched.yourAssignments')}</h2>
          {myAssignments.map(a => (
            <Link key={a.id} to={`/assignments?focus=${a.id}`} className="pub-assign-card pub-assign-link">
              <span className="pub-assign-emoji">{assignmentEmoji(a.type)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="pub-assign-title">{a.title}</div>
                <div className="pub-assign-meta">
                  <span className="pub-assign-type">{a.type}</span>
                  <span>{t('cal.due')} {fmtShortDate(a.dueDate)}</span>
                </div>
                {a.formUrl && (
                  <a className="pub-assign-form-btn" href={a.formUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                    📝 {t('misc.openExamForm')}
                  </a>
                )}
              </div>
            </Link>
          ))}
        </>
      )}

      <h2 className="pub-section-title">
        {t('cal.today')} · {fmtDayHeader(today)}
      </h2>
      {todayItems.length === 0 ? (
        <EmptyState icon={<CalendarX size={24} />}>
          {t('sched.nothingToday')} {say(dailyPun('my-sched'), getLang())}
        </EmptyState>
      ) : (
        <>
          {todayItems.map(({ event: e, exp }, i) => (
            <Fragment key={e.id}>
              {i === todayNowIdx && <NowLine />}
              <div className={isPast(e) ? 'pub-past-dim' : undefined}>
                <PubEventCard event={e} ensembleMap={ensembleMap} piecesById={piecesById} studentInstrument={student.instrument} ensembleIds={exp.ensembleIds} isSub={exp.isSub} attendanceOnly={exp.attendanceOnly} showNotes />
              </div>
            </Fragment>
          ))}
          {todayNowIdx === todayItems.length && todayItems.length > 0 && <NowLine />}
        </>
      )}

      <div className="pub-section-row">
        <h2 className="pub-section-title">{t('sched.yourSchedule')}</h2>
        <button
          className="pub-view-toggle"
          onClick={() => setView(v => v === 'list' ? 'calendar' : 'list')}
        >
          {view === 'list'
            ? <><Grid3x3 size={13} /> {t('cal.calendarView')}</>
            : <><LayoutList size={13} /> {t('cal.listView')}</>}
        </button>
      </div>

      {/* Type filter — a compact dropdown; resets to All every visit so nothing stays hidden */}
      <div className="pub-filter-selects">
        <PubSelect
          value={filter}
          onChange={v => setFilter(v as TypeFilter)}
          ariaLabel={t('cal.filterByType')}
          options={FILTERS.map(f => ({ value: f.key, label: t(f.labelKey) }))}
        />
      </div>

      {view === 'calendar' ? (
        <StudentMonth
          items={mySchedule.filter(x => matchesFilter(x.event, filter))}
          assignments={myAssignments}
          ensembleMap={ensembleMap}
          piecesById={piecesById}
          studentInstrument={student.instrument}
          onMonth={ensureMonth}
        />
      ) : upcomingItems.length === 0 ? (
        <div className="pub-muted">
          {filter === 'all' ? t('cal.noUpcomingMine') : t('cal.noneInCategory')}
        </div>
      ) : (
        <>
          {(showAllUpcoming ? upcomingItems : upcomingItems.slice(0, 20)).map(({ event: e, exp }) => (
            <PubEventCard key={e.id} event={e} ensembleMap={ensembleMap} piecesById={piecesById} studentInstrument={student.instrument} ensembleIds={exp.ensembleIds} isSub={exp.isSub} attendanceOnly={exp.attendanceOnly} showDate showNotes />
          ))}
          {!showAllUpcoming && upcomingItems.length > 20 && (
            <button className="pub-view-toggle" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowAllUpcoming(true)}>
              {t('cal.showAllUpcoming', { count: upcomingItems.length })}
            </button>
          )}
        </>
      )}

      {myParts.length > 0 && (
        <>
          <h2 className="pub-section-title">{t('sched.yourParts')}</h2>
          <div className="pub-card">
            {myParts.map(({ piece, partUrl, eventTitles }) => (
              <div key={piece.id} className="pub-mypart-row">
                <div className="pub-mypart-info">
                  <Link to={`/piece/${piece.id}`} className="pub-mypart-title">{piece.title}</Link>
                  {eventTitles.length > 0 && (
                    <div className="pub-mypart-events">{eventTitles.join(', ')}</div>
                  )}
                </div>
                <a className="pub-mypart-btn" href={partUrl} target="_blank" rel="noreferrer">
                  {t('sched.part')} <ExternalLink size={12} />
                </a>
              </div>
            ))}
          </div>
        </>
      )}
      <NoteBurst cheer={cheer} />
    </div>
  );
}

/** Personal month calendar: dots on days with this student's events; tap a day for details. */
function StudentMonth({ items, assignments, ensembleMap, piecesById, studentInstrument, onMonth }: {
  items: { event: CalendarEvent; exp: ReturnType<typeof studentExpectation> }[];
  assignments: import('../director/types').Assignment[];
  ensembleMap: Record<string, import('../director/types').Ensemble>;
  piecesById: Record<string, import('../director/types').RepertoirePiece>;
  studentInstrument?: string;
  /** Load the month being viewed — only a window around today is live (#reads). */
  onMonth: (cursor: Date) => void;
}) {
  useLang(); // month/weekday names follow the EN/ES toggle
  const today = todayStr();
  const [cursor, setCursor] = useState(() => {
    const d = parseDate(today);
    d.setDate(1);
    return d;
  });
  const [selectedDate, setSelectedDate] = useState(today);

  useEffect(() => { onMonth(cursor); }, [cursor, onMonth]);

  const byDate = useMemo(() => {
    const m: Record<string, typeof items> = {};
    for (const it of items) (m[it.event.date] ??= []).push(it);
    return m;
  }, [items]);

  const assignByDate = useMemo(() => {
    const m: Record<string, typeof assignments> = {};
    for (const a of assignments) (m[a.dueDate] ??= []).push(a);
    return m;
  }, [assignments]);

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(toDateStr(new Date(year, month, d)));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  const monthLabel = fmtMonthYear(cursor);
  const dayItems = byDate[selectedDate] ?? [];
  const shiftMonth = (n: number) => setCursor(c => new Date(c.getFullYear(), c.getMonth() + n, 1));
  const { dragX, animating, viewportRef, handlers } = useMonthSwipe(shiftMonth);

  return (
    <>
      <div className="pub-cal-nav">
        <button className="pub-cal-arrow" onClick={() => shiftMonth(-1)} aria-label={t('cal.prevMonth')}>
          <ChevronLeft size={18} />
        </button>
        <span className="pub-cal-month">{monthLabel}</span>
        <button className="pub-cal-arrow" onClick={() => shiftMonth(1)} aria-label={t('cal.nextMonth')}>
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="pub-cal" onTouchStart={handlers.onTouchStart} onTouchMove={handlers.onTouchMove} onTouchEnd={handlers.onTouchEnd}>
        <div className="pub-cal-weekdays">
          {weekdayInitials().map((d, i) => <div key={i}>{d}</div>)}
        </div>
        <div className="pub-cal-swipe-viewport" ref={viewportRef} style={{ overflow: 'hidden' }}>
          <div className="pub-cal-grid" style={{ transform: `translateX(${dragX}px)`, transition: animating ? 'transform 0.2s ease-out' : 'none' }}>
            {cells.map((date, i) => date === null ? (
              <div key={i} className="pub-cal-cell empty" />
            ) : (
              <button
                key={i}
                className={`pub-cal-cell ${date === today ? 'today' : ''} ${date === selectedDate ? 'selected' : ''}`}
                onClick={() => setSelectedDate(date)}
              >
                <span className="pub-cal-day">{Number(date.slice(8))}</span>
                <span className="pub-cal-dots">
                  {(byDate[date] ?? []).slice(0, 3).map((it, j) => (
                    <span
                      key={j}
                      className="pub-cal-dot"
                      style={{ background: it.event.type === 'Concert' ? CONCERT_COLOR : ensembleColor(ensembleMap[it.exp.ensembleIds[0] ?? it.event.ensembleIds[0]]) }}
                    />
                  ))}
                  {(assignByDate[date] ?? []).slice(0, 2).map(a => (
                    <span key={a.id} className="pub-cal-dot" style={{ background: ASSIGN_COLOR }} />
                  ))}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <h3 className="pub-section-title">
        {fmtDayHeader(selectedDate)}
      </h3>
      {dayItems.length === 0 && (assignByDate[selectedDate] ?? []).length === 0 ? (
        <div className="pub-muted">{t('cal.nothingThisDay')}</div>
      ) : (
        <>
          {dayItems.map(({ event: e, exp }) => (
            <PubEventCard key={e.id} event={e} ensembleMap={ensembleMap} piecesById={piecesById} studentInstrument={studentInstrument} ensembleIds={exp.ensembleIds} isSub={exp.isSub} attendanceOnly={exp.attendanceOnly} showNotes />
          ))}
          {(assignByDate[selectedDate] ?? []).map(a => (
            <Link key={a.id} to={`/assignments?focus=${a.id}`} className="pub-assign-card pub-assign-link">
              <span className="pub-assign-emoji">{assignmentEmoji(a.type)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="pub-assign-title">{a.title}</div>
                <div className="pub-assign-meta"><span className="pub-assign-type">{a.type}</span><span>{t('cal.dueThisDay')}</span></div>
              </div>
            </Link>
          ))}
        </>
      )}
    </>
  );
}
