import { useMemo, useState, useEffect, useReducer, useRef } from 'react';
import { Link } from 'react-router';
import { CalendarDays, UserSearch, Megaphone, Music, ChevronRight, Ticket, HelpCircle, Music2, AlertTriangle } from 'lucide-react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { usePublicEvents } from './hooks/usePublicEvents';
import { useAnnouncements, visibleAnnouncements, useMinuteTick } from '../director/hooks/useAnnouncements';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { useAssignments } from '../director/hooks/useAssignments';
import { todayStr, formatTimeRange, ensembleColor, ensembleDisplayName, addDays, assignmentEmoji, musicEnsembles, isPublished, CONCERT_COLOR, ASSIGN_COLOR } from '../director/utils';
import { PubEventCard } from './components/PubEventCard';
import { PubAnnouncements } from './components/PubAnnouncements';
import { SkeletonCards, EmptyState } from './components/PageHeader';
import { getIdentity, onIdentityChange } from '../shared/identity';
import { t, useLang, getLang } from '../shared/i18n';
import { fmtLongDate, fmtShortDate } from '../shared/dates';
import { composerBirthdaysOn, birthdayLine, musicHolidayOn, concertDayLine, dailyPun, say, schoolMomentLine, weekdayMomentLine, fermataHoldLine } from '../shared/whimsy';
import { useTapTempo } from '../shared/useTapTempo';
import { useEggCheer } from '../shared/useEggCheer';
import { NoteBurst } from '../shared/NoteBurst';
import { WhatsNewBanner } from '../shared/WhatsNewBanner';
import '../shared/whatsNew.css';
import { groupScheduleAlerts } from '../shared/groupAlerts';
import { AlertGroupSections } from '../shared/AlertGroupSections';
import { SignupAlert } from './components/SignupAlert';
import { WelcomeHubBanner } from './components/WelcomeHubBanner';
import { PinnedHubGuide } from './components/PinnedHubGuide';
import { showPinnedHubGuide } from './welcomeHubSchedule';
import type { CalendarEvent } from '../director/types';

const LOOKAHEAD_DAYS = 14;

export function PublicHome() {
  useLang(); // re-render headings on EN/ES switch
  const { ensembles } = useEnsembles();
  const { events, loading } = usePublicEvents();
  const { announcements } = useAnnouncements();
  const now = useMinuteTick(); // scheduled posts appear the minute they go live
  const { assignments } = useAssignments();
  const { pieces } = useRepertoire();
  // Hidden delight (#easter-eggs): tap the date in rhythm → a tempo reading.
  const { cheer: tempoCheer, onTap: onDateTap } = useTapTempo();
  const { cheer: holdCheer, show: showHold } = useEggCheer();
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(holdTimer.current), []);

  function onHeroHoldStart() {
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => showHold(fermataHoldLine(getLang())), 1500);
  }
  function onHeroHoldEnd() {
    clearTimeout(holdTimer.current);
  }

  // Saved identity (student or parent's kids) personalizes the schedule CTA.
  const [, bump] = useReducer(x => x + 1, 0);
  useEffect(() => onIdentityChange(bump), []);
  const savedStudents = getIdentity().students;

  const today = todayStr();
  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);
  const piecesById = useMemo(() => Object.fromEntries(pieces.map(p => [p.id, p])), [pieces]);

  // Today: EVERYTHING, including cancelled/changed — students must see those.
  const todayEvents = events
    .filter(e => e.date === today)
    .sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));

  // Anything unusual today → red banner up top.
  const alerts = todayEvents.filter(e => e.status === 'Cancelled' || e.changeNote);
  const alertGroups = groupScheduleAlerts(alerts, ensembles);

  // Coming up: whole days only — never cut off in the middle of a day.
  const [lookaheadDays, setLookaheadDays] = useState(LOOKAHEAD_DAYS);
  const horizon = addDays(today, lookaheadDays);
  const future = events.filter(e => e.date > today && e.status !== 'Cancelled');
  const upcomingRehearsals = future.filter(e => e.type === 'Rehearsal' || e.type === 'Sectional')
    .filter(e => e.date <= horizon)
    .sort(byDateTime);
  const moreRehearsalsExist = future.some(e =>
    (e.type === 'Rehearsal' || e.type === 'Sectional') && e.date > horizon);
  const upcomingClasses = future.filter(e => e.type === 'Class')
    .filter(e => e.date <= horizon)
    .sort(byDateTime);
  // Concerts/events look far ahead but always end on a day boundary.
  const upcomingConcerts = capWholeDays(future.filter(e => e.type === 'Concert').sort(byDateTime), 5);
  const upcomingEvents = capWholeDays(future.filter(e => e.type === 'Event').sort(byDateTime), 6);
  const upcomingAssignments = useMemo(
    () => assignments.filter(a => a.dueDate >= today && isPublished(a, now)).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5),
    [assignments, today, now],
  );

  const homeAnnouncements = useMemo(
    () => visibleAnnouncements(announcements, today, 'all', now).filter(a => a.ensembleId === null || a.pinned),
    [announcements, today, now],
  );

  function label(e: CalendarEvent) {
    if (e.title) return e.title;
    return e.ensembleIds.map(id => ensembleDisplayName(ensembleMap[id])).filter(Boolean).join(', ') || e.type;
  }
  function color(e: CalendarEvent) {
    return e.type === 'Concert' ? CONCERT_COLOR : ensembleColor(ensembleMap[e.ensembleIds[0]]);
  }

  const orderedEnsembles = musicEnsembles([...ensembles].sort((a, b) => a.order - b.order));

  return (
    <div className="pub-page">
      <WelcomeHubBanner />
      {/* Open sign-ups this device hasn't answered yet (#signups) — ABOVE
          What's New on purpose: a sign-up with a next-day deadline is the one
          thing on this page that expires, and the changelog is not. */}
      <SignupAlert />
      <WhatsNewBanner audience="public" />
      <div
        className="pub-hero pub-hero-fancy"
        onPointerDown={onHeroHoldStart}
        onPointerUp={onHeroHoldEnd}
        onPointerLeave={onHeroHoldEnd}
        onPointerCancel={onHeroHoldEnd}
      >
        <div className="pub-hero-date" onClick={onDateTap}>{fmtLongDate(today)}</div>
        <h1><Music2 size={22} style={{ verticalAlign: '-3px' }} /> {t('home.todayAt')}</h1>
      </div>

      {showPinnedHubGuide(today) && <PinnedHubGuide />}

      {/* Hidden delights (#easter-eggs), each only on its own day: composer
          birthdays, musical holidays, school moments, weekday quips, concert ribbon. */}
      {composerBirthdaysOn(new Date()).map(b => (
        <div key={b.name} className="pub-birthday-line">{birthdayLine(b, getLang(), new Date())}</div>
      ))}
      {musicHolidayOn(new Date(), getLang()) && (
        <div className="pub-birthday-line">{musicHolidayOn(new Date(), getLang())}</div>
      )}
      {schoolMomentLine(new Date(), getLang()) && (
        <div className="pub-birthday-line">{schoolMomentLine(new Date(), getLang())}</div>
      )}
      {weekdayMomentLine(new Date(), getLang()) && (
        <div className="pub-birthday-line">{weekdayMomentLine(new Date(), getLang())}</div>
      )}
      {todayEvents.some(e => e.type === 'Concert' && e.status !== 'Cancelled') && (
        <div className="pub-birthday-line">{concertDayLine(getLang())}</div>
      )}

      {/* Schedule alerts: cancellations, double blocks, rotations, moves */}
      {alerts.length > 0 && (
        <div className="pub-alert-banner">
          <div className="pub-alert-title"><AlertTriangle size={15} style={{ verticalAlign: '-2px' }} /> {t('alert.scheduleChangeToday')}</div>
          <AlertGroupSections
            groups={alertGroups}
            sectionClassName="pub-alert-group pub-alert-group-in-banner"
            renderItem={e => (
              <Link key={e.id} to={`/event/${e.id}`} className="pub-alert-row">
                <strong>{label(e)}</strong>
                {e.status === 'Cancelled' ? ` — ${t('alert.cancelled')}` : ''}
                {e.changeNote ? ` — ${e.changeNote}` : ''}
                <ChevronRight size={14} />
              </Link>
            )}
          />
        </div>
      )}

      <PubAnnouncements items={homeAnnouncements} ensembleMap={ensembleMap} />

      {loading ? (
        <SkeletonCards n={3} />
      ) : todayEvents.length === 0 ? (
        <EmptyState icon={<CalendarDays size={26} />}>
          {t('home.noEventsToday')} {say(dailyPun('home'), getLang())}
        </EmptyState>
      ) : (
        todayEvents.map(e => (
          <PubEventCard key={e.id} event={e} ensembleMap={ensembleMap} piecesById={piecesById} showNotes />
        ))
      )}

      {/* Find my schedule — the #1 student action, front and center.
          Returning visitors get a direct link to their own schedule instead. */}
      {savedStudents.length > 0 ? (
        <div className="pub-quick">
          {savedStudents.map(s => (
            <Link key={s.id} to={`/student/${s.id}`} className="pub-quick-btn">
              <UserSearch size={22} /><span>{t('home.studentSchedule', { name: s.name.split(' ')[0] })}</span>
            </Link>
          ))}
          <Link to="/lookup" className="pub-quick-btn">
            <UserSearch size={22} /><span>{t('home.findSomeoneElse')}</span>
          </Link>
        </div>
      ) : (
        <Link to="/lookup" className="pub-cta-btn">
          <UserSearch size={22} /> {t('home.findMySchedule')}
        </Link>
      )}

      <div className="pub-quick">
        <Link to="/calendar" className="pub-quick-btn"><CalendarDays size={22} /><span>{t('home.fullCalendar')}</span></Link>
        <Link to="/announcements" className="pub-quick-btn"><Megaphone size={22} /><span>{t('nav.announcements')}</span></Link>
        <Link to="/repertoire" className="pub-quick-btn"><Music size={22} /><span>{t('nav.repertoire')}</span></Link>
        <Link to="/concerts" className="pub-quick-btn"><Ticket size={22} /><span>{t('nav.concerts')}</span></Link>
        <Link to="/start" className="pub-quick-btn"><HelpCircle size={22} /><span>{t('nav.startHere')}</span></Link>
      </div>

      {upcomingRehearsals.length > 0 && (
        <>
          <h2 className="pub-section-title">{t('home.comingUpRehearsals')}</h2>
          {upcomingRehearsals.map(e => <UpcomingRow key={e.id} e={e} label={label(e)} color={color(e)} />)}
          {moreRehearsalsExist && (
            <button className="pub-show-more" onClick={() => setLookaheadDays(d => d + 14)}>
              {t('misc.showMoreDays')} <ChevronRight size={14} style={{ transform: 'rotate(90deg)' }} />
            </button>
          )}
        </>
      )}

      {upcomingClasses.length > 0 && (
        <>
          <h2 className="pub-section-title">{t('home.comingUpClasses')}</h2>
          {upcomingClasses.map(e => <UpcomingRow key={e.id} e={e} label={label(e)} color={color(e)} />)}
        </>
      )}

      {upcomingConcerts.length > 0 && (
        <>
          <h2 className="pub-section-title">{t('home.comingUpConcerts')}</h2>
          {upcomingConcerts.map(e => <UpcomingRow key={e.id} e={e} label={label(e)} color={color(e)} />)}
        </>
      )}

      {upcomingEvents.length > 0 && (
        <>
          <h2 className="pub-section-title">{t('home.comingUpEvents')}</h2>
          {upcomingEvents.map(e => <UpcomingRow key={e.id} e={e} label={label(e)} color={color(e)} />)}
        </>
      )}

      {upcomingAssignments.length > 0 && (
        <>
          <h2 className="pub-section-title">{t('home.comingUpAssignments')}</h2>
          {upcomingAssignments.map(a => (
            <Link key={a.id} to={`/assignments?focus=${a.id}`} className="pub-upcoming">
              <span className="pub-upcoming-date">
                {fmtShortDate(a.dueDate)}
              </span>
              <span className="pub-upcoming-dot" style={{ background: ASSIGN_COLOR }} />
              <span className="pub-upcoming-label">
                {assignmentEmoji(a.type)} {a.title}
              </span>
              <ChevronRight size={15} className="pub-upcoming-chev" />
            </Link>
          ))}
        </>
      )}

      {orderedEnsembles.length > 0 && (
        <>
          <h2 className="pub-section-title">{t('home.ourEnsembles')}</h2>
          <div className="pub-ens-btn-grid">
            {orderedEnsembles.map(en => (
              <Link key={en.id} to={`/ensemble/${en.id}`} className="pub-ens-btn" style={{ borderLeftColor: ensembleColor(en) }}>
                {ensembleDisplayName(en)} <ChevronRight size={15} />
              </Link>
            ))}
          </div>
        </>
      )}

      {orderedEnsembles.length > 0 && (
        <Link to="/repertoire" className="pub-quick-btn" style={{ marginTop: 10 }}>
          <Music size={18} /><span>{t('rep.browseAll')}</span>
        </Link>
      )}

      <NoteBurst cheer={tempoCheer || holdCheer} />
    </div>
  );
}

function byDateTime(a: CalendarEvent, b: CalendarEvent) {
  return a.date.localeCompare(b.date) || (a.startTime ?? '99').localeCompare(b.startTime ?? '99');
}

/** Cap a sorted list at ~min items but always finish the last included day. */
function capWholeDays(list: CalendarEvent[], min: number): CalendarEvent[] {
  if (list.length <= min) return list;
  const lastDate = list[min - 1].date;
  let end = min;
  while (end < list.length && list[end].date === lastDate) end++;
  return list.slice(0, end);
}

function UpcomingRow({ e, label, color }: { e: CalendarEvent; label: string; color: string }) {
  return (
    <Link to={`/event/${e.id}`} className="pub-upcoming">
      <span className="pub-upcoming-date">
        {fmtShortDate(e.date)}
      </span>
      <span className="pub-upcoming-dot" style={{ background: color }} />
      <span className="pub-upcoming-label">
        {label}
        {e.status === 'Cancelled' && <span className="pub-cancelled-tag" style={{ marginLeft: 6 }}>{t('card.cancelled')}</span>}
        {e.status !== 'Cancelled' && e.changeNote && <span className="pub-changed-tag" style={{ marginLeft: 6 }}>{t('card.changed')}</span>}
        {e.startTime ? <span className="pub-upcoming-time"> · {formatTimeRange(e.startTime, e.endTime)}</span> : null}
      </span>
      <ChevronRight size={15} className="pub-upcoming-chev" />
    </Link>
  );
}
