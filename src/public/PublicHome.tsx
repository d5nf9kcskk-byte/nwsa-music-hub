import { useMemo, useState, useEffect, useReducer } from 'react';
import { Link } from 'react-router';
import { CalendarDays, UserSearch, Megaphone, Music, ChevronRight, Ticket, HelpCircle } from 'lucide-react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useEvents } from '../director/hooks/useEvents';
import { useAnnouncements, visibleAnnouncements } from '../director/hooks/useAnnouncements';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { useAssignments } from '../director/hooks/useAssignments';
import { todayStr, parseDate, formatTimeRange, ensembleColor, addDays, assignmentEmoji } from '../director/utils';
import { PubEventCard } from './components/PubEventCard';
import { PubAnnouncements } from './components/PubAnnouncements';
import { getIdentity, onIdentityChange } from '../shared/identity';
import { t, useLang } from '../shared/i18n';
import type { CalendarEvent } from '../director/types';

const LOOKAHEAD_DAYS = 14;

export function PublicHome() {
  useLang(); // re-render headings on EN/ES switch
  const { ensembles } = useEnsembles();
  const { events, loading } = useEvents();
  const { announcements } = useAnnouncements();
  const { assignments } = useAssignments();
  const { pieces } = useRepertoire();

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

  // Coming up: whole days only — never cut off in the middle of a day.
  const [lookaheadDays, setLookaheadDays] = useState(LOOKAHEAD_DAYS);
  const horizon = addDays(today, lookaheadDays);
  const future = events.filter(e => e.date > today && e.status !== 'Cancelled');
  const upcomingRehearsals = future.filter(e => e.type === 'Rehearsal' || e.type === 'Sectional')
    .filter(e => e.date <= horizon)
    .sort(byDateTime);
  const moreRehearsalsExist = future.some(e =>
    (e.type === 'Rehearsal' || e.type === 'Sectional') && e.date > horizon);
  // Concerts/events look far ahead but always end on a day boundary.
  const upcomingConcerts = capWholeDays(future.filter(e => e.type === 'Concert').sort(byDateTime), 5);
  const upcomingEvents = capWholeDays(future.filter(e => e.type === 'Event').sort(byDateTime), 6);
  const upcomingAssignments = useMemo(
    () => assignments.filter(a => a.dueDate >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5),
    [assignments, today],
  );

  const homeAnnouncements = useMemo(
    () => visibleAnnouncements(announcements, today, 'all').filter(a => a.ensembleId === null || a.pinned),
    [announcements, today],
  );

  function label(e: CalendarEvent) {
    if (e.title) return e.title;
    return e.ensembleIds.map(id => ensembleMap[id]?.name).filter(Boolean).join(', ') || e.type;
  }
  function color(e: CalendarEvent) {
    return e.type === 'Concert' ? '#ca8a04' : ensembleColor(ensembleMap[e.ensembleIds[0]]);
  }

  const orderedEnsembles = [...ensembles].sort((a, b) => a.order - b.order);

  return (
    <div className="pub-page">
      <div className="pub-hero pub-hero-fancy">
        <div className="pub-hero-date">{parseDate(today).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        <h1>🎶 {t('home.todayAt')}</h1>
      </div>

      {/* Schedule alerts: cancellations, double blocks, rotations, moves */}
      {alerts.length > 0 && (
        <div className="pub-alert-banner">
          <div className="pub-alert-title">⚠ Schedule change today</div>
          {alerts.map(e => (
            <Link key={e.id} to={`/event/${e.id}`} className="pub-alert-row">
              <strong>{label(e)}</strong>
              {e.status === 'Cancelled' ? ' — cancelled' : ''}
              {e.changeNote ? ` — ${e.changeNote}` : ''}
              <ChevronRight size={14} />
            </Link>
          ))}
        </div>
      )}

      <PubAnnouncements items={homeAnnouncements} ensembleMap={ensembleMap} />

      {loading ? (
        <div className="pub-muted">Loading…</div>
      ) : todayEvents.length === 0 ? (
        <div className="pub-card pub-muted">{t('home.noEventsToday')}</div>
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
              <UserSearch size={22} /><span>{s.name.split(' ')[0]}'s schedule</span>
            </Link>
          ))}
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
                {parseDate(a.dueDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
              <span className="pub-upcoming-dot" style={{ background: '#7c3aed' }} />
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
                {en.name} <ChevronRight size={15} />
              </Link>
            ))}
          </div>
        </>
      )}

      {orderedEnsembles.length > 0 && (
        <Link to="/repertoire" className="pub-quick-btn" style={{ marginTop: 10 }}>
          <Music size={18} /><span>Browse all repertoire</span>
        </Link>
      )}
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
        {parseDate(e.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
      </span>
      <span className="pub-upcoming-dot" style={{ background: color }} />
      <span className="pub-upcoming-label">
        {label}
        {e.status === 'Cancelled' && <span className="pub-cancelled-tag" style={{ marginLeft: 6 }}>Cancelled</span>}
        {e.status !== 'Cancelled' && e.changeNote && <span className="pub-changed-tag" style={{ marginLeft: 6 }}>Changed</span>}
        {e.startTime ? <span className="pub-upcoming-time"> · {formatTimeRange(e.startTime, e.endTime)}</span> : null}
      </span>
      <ChevronRight size={15} className="pub-upcoming-chev" />
    </Link>
  );
}
