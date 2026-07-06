import { useMemo, useState } from 'react';
import { ClipboardList, MapPin, Clock, Music, GraduationCap, CalendarPlus, Users, Megaphone, ChevronRight, Plus } from 'lucide-react';
import { useEnsembles } from '../hooks/useEnsembles';
import { useEvents } from '../hooks/useEvents';
import { useStudents } from '../hooks/useStudents';
import { useRepertoire } from '../hooks/useRepertoire';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { useAnnouncements, visibleAnnouncements } from '../hooks/useAnnouncements';
import { useAssignments } from '../hooks/useAssignments';
import { resolveRoster } from '../rosterResolver';
import { todayStr, parseDate, formatTimeRange, ensembleColor, EVENT_TYPE_ICON } from '../utils';
import type { CalendarEvent } from '../types';
import type { DirNavigate } from '../types-nav';
import { Linkify } from '../components/Linkify';

const ENS_PREF_KEY = 'dir.today.ensemble';

/** Director landing page: same shape as the public home, plus editing jumps. */
export function TodayView({ onNavigate }: { onNavigate: DirNavigate }) {
  const { ensembles } = useEnsembles();
  const { events } = useEvents();
  const { students } = useStudents();
  const { pieces } = useRepertoire();
  const { overrides } = useRosterOverrides();
  const { announcements } = useAnnouncements();
  const { assignments } = useAssignments();
  const [ensembleId, setEnsembleId] = useState(() => localStorage.getItem(ENS_PREF_KEY) ?? '');

  const today = todayStr();
  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);
  const piecesById = useMemo(() => Object.fromEntries(pieces.map(p => [p.id, p])), [pieces]);
  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);
  const studentsById = useMemo(() => Object.fromEntries(students.map(s => [s.id, s])), [students]);

  function pickEnsemble(id: string) {
    const next = ensembleId === id ? '' : id;
    setEnsembleId(next);
    localStorage.setItem(ENS_PREF_KEY, next);
  }

  const matchesEns = (e: CalendarEvent) => !ensembleId || e.ensembleIds.length === 0 || e.ensembleIds.includes(ensembleId);

  const todays = useMemo(() =>
    events.filter(e => e.date === today).filter(matchesEns)
      .sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99')),
    [events, today, ensembleId]);

  const future = useMemo(() =>
    events.filter(e => e.date > today && e.status !== 'Cancelled').filter(matchesEns)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '99').localeCompare(b.startTime ?? '99')),
    [events, today, ensembleId]);

  const upRehearsals = future.filter(e => e.type === 'Rehearsal' || e.type === 'Sectional').slice(0, 6);
  const upConcerts = future.filter(e => e.type === 'Concert').slice(0, 4);
  const upEvents = future.filter(e => e.type === 'Event').slice(0, 5);
  const upAssignments = useMemo(() =>
    assignments
      .filter(a => a.dueDate >= today)
      .filter(a => !ensembleId || a.ensembleIds.includes(ensembleId) || (a.studentIds?.length ?? 0) > 0)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5),
    [assignments, today, ensembleId]);

  const alerts = useMemo(() =>
    events.filter(e => e.date === today).filter(matchesEns)
      .filter(e => e.status === 'Cancelled' || e.changeNote),
    [events, today, ensembleId]);

  const homeAnnouncements = useMemo(
    () => visibleAnnouncements(announcements, today, ensembleId ? [ensembleId] : 'all').slice(0, 3),
    [announcements, today, ensembleId]);

  const lessonsToday = useMemo(() =>
    overrides
      .filter(o => o.kind === 'lesson' && o.startDate && o.endDate && o.startDate <= today && today <= o.endDate)
      .filter(o => !ensembleId || o.ensembleId === ensembleId)
      .sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99')),
    [overrides, today, ensembleId]);

  const orderedEns = useMemo(() => [...ensembles].sort((a, b) => a.order - b.order), [ensembles]);
  const dateLabel = parseDate(today).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const upRow = (e: CalendarEvent) => (
    <button key={e.id} className="dir-up-row" onClick={() => onNavigate('schedule', { date: e.date, eventId: e.id })}>
      <span className="dir-up-date">{parseDate(e.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
      <span className="dir-up-dot" style={{ background: e.type === 'Concert' ? '#ca8a04' : ensembleColor(ensembleMap[e.ensembleIds[0]]) }} />
      <span className="dir-up-label">
        {e.title || e.ensembleIds.map(id => ensembleMap[id]?.name).filter(Boolean).join(' + ') || e.type}
        {e.startTime ? <span className="dir-up-time"> · {formatTimeRange(e.startTime, e.endTime)}</span> : null}
      </span>
      <ChevronRight size={15} className="dir-up-chev" />
    </button>
  );

  return (
    <div className="dir-tab-page">
      <div className="dir-today-hero">
        <div className="dir-today-date">{dateLabel}</div>
        <div className="dir-today-title">🎶 Today at NWSA</div>
      </div>

      {ensembles.length > 0 && (
        <div className="dir-tabs">
          <button className={`dir-tab ${!ensembleId ? 'active' : ''}`} onClick={() => pickEnsemble('')}>All</button>
          {ensembles.map(e => (
            <button key={e.id} className={`dir-tab ${ensembleId === e.id ? 'active' : ''}`} onClick={() => pickEnsemble(e.id)}>{e.name}</button>
          ))}
        </div>
      )}

      <div className="dir-drawer-body">
        {/* Alerts: today's cancellations / changes */}
        {alerts.map(e => (
          <button key={e.id} className="dir-today-alert" onClick={() => onNavigate('schedule', { date: e.date, eventId: e.id })}>
            ⚠ {e.status === 'Cancelled' ? 'Cancelled' : 'Changed'}: {e.title || e.ensembleIds.map(id => ensembleMap[id]?.name).join(' + ') || e.type}
            {e.changeNote ? ` — ${e.changeNote}` : ''}
          </button>
        ))}

        {/* Announcements */}
        {homeAnnouncements.length > 0 && (
          <>
            <div className="dir-section-head">
              <span><Megaphone size={14} /> Announcements</span>
              <button className="dir-link-btn" onClick={() => onNavigate('announcements')}>Manage</button>
            </div>
            {homeAnnouncements.map(a => (
              <button key={a.id} className="dir-ens-row dir-sc-pick" onClick={() => onNavigate('announcements')}>
                <span className="dir-ens-swatch" style={{ background: a.ensembleId ? ensembleColor(ensembleMap[a.ensembleId]) : '#64748b' }} />
                <div className="dir-ens-info">
                  <div className="dir-ens-name">{a.pinned ? '📌 ' : ''}{a.title}</div>
                  <div className="dir-ens-sub">{a.ensembleId ? ensembleMap[a.ensembleId]?.name : 'School-wide'}</div>
                </div>
              </button>
            ))}
          </>
        )}

        {/* Today's rehearsals */}
        <div className="dir-section-head"><span>Today's schedule</span></div>
        {todays.length === 0 ? (
          <div className="dir-empty-inline">
            Nothing scheduled today{ensembleId ? ' for this ensemble' : ''}.
            <button className="dir-btn dir-btn-ghost dir-sc-small" style={{ marginLeft: 8 }} onClick={() => onNavigate('schedule', { date: today })}>
              <CalendarPlus size={14} /> Open schedule
            </button>
          </div>
        ) : (
          todays.map(ev => (
            <TodayCard
              key={ev.id}
              event={ev}
              ensembleMap={ensembleMap}
              piecesById={piecesById}
              expected={ev.ensembleIds.length > 0
                ? ev.ensembleIds.reduce((n, id) => n + resolveRoster(students, overrides, { ensembleId: id, eventId: ev.id, eventsById }).length, 0)
                : null}
              onNavigate={onNavigate}
            />
          ))
        )}

        {lessonsToday.length > 0 && (
          <>
            <div className="dir-form-section-label"><GraduationCap size={13} style={{ verticalAlign: '-2px' }} /> Lessons today</div>
            {lessonsToday.map(o => (
              <div key={o.id} className="dir-sc-ov lesson">
                <div className="dir-sc-ov-body">
                  <div className="dir-sc-ov-title">{studentsById[o.studentId]?.name ?? 'Student'}</div>
                  <div className="dir-sc-ov-meta">
                    Out of {ensembleMap[o.ensembleId]?.name ?? 'rehearsal'}
                    {o.startTime && o.endTime ? ` · ${formatTimeRange(o.startTime, o.endTime)}` : ''}
                    {o.reason ? ` · ${o.reason}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Quick actions */}
        <div className="dir-today-quick">
          <button className="dir-quick-btn" onClick={() => onNavigate('schedule', { date: today })}><CalendarPlus size={18} /> New event</button>
          <button className="dir-quick-btn" onClick={() => onNavigate('announcements')}><Megaphone size={18} /> Post announcement</button>
          <button className="dir-quick-btn" onClick={() => onNavigate('scheduleChanges')}><Users size={18} /> Schedule change</button>
        </div>

        {/* Coming up */}
        {upRehearsals.length > 0 && (<><div className="dir-section-head"><span>Coming up — rehearsals</span></div>{upRehearsals.map(upRow)}</>)}
        {upConcerts.length > 0 && (<><div className="dir-section-head"><span>Coming up — concerts</span></div>{upConcerts.map(upRow)}</>)}
        {upEvents.length > 0 && (<><div className="dir-section-head"><span>Coming up — events</span></div>{upEvents.map(upRow)}</>)}
        {upAssignments.length > 0 && (
          <>
            <div className="dir-section-head"><span>Coming up — assignments</span><button className="dir-link-btn" onClick={() => onNavigate('assignments')}>Manage</button></div>
            {upAssignments.map(a => (
              <button key={a.id} className="dir-up-row" onClick={() => onNavigate('assignments')}>
                <span className="dir-up-date">{parseDate(a.dueDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                <span className="dir-up-dot" style={{ background: '#7c3aed' }} />
                <span className="dir-up-label">{a.type === 'Playing Exam' ? '🎯 ' : ''}{a.title}</span>
                <ChevronRight size={15} className="dir-up-chev" />
              </button>
            ))}
          </>
        )}

        {/* Ensembles grid */}
        {orderedEns.length > 0 && (
          <>
            <div className="dir-section-head"><span>Ensembles</span></div>
            <div className="dir-ens-grid">
              {orderedEns.map(e => (
                <button key={e.id} className="dir-ens-grid-btn" style={{ borderLeftColor: ensembleColor(e) }} onClick={() => onNavigate('ensembleHub', { ensembleId: e.id })}>
                  {e.name}
                  <ChevronRight size={15} style={{ opacity: 0.4 }} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TodayCard({
  event, ensembleMap, piecesById, expected, onNavigate,
}: {
  event: CalendarEvent;
  ensembleMap: Record<string, { id: string; name: string; order: number; color?: string }>;
  piecesById: Record<string, { id: string; title: string }>;
  expected: number | null;
  onNavigate: DirNavigate;
}) {
  const firstEns = event.ensembleIds.map(id => ensembleMap[id]).find(Boolean);
  const name = event.title
    || event.ensembleIds.map(id => ensembleMap[id]?.name).filter(Boolean).join(' + ')
    || 'School';
  const linkedPieces = (event.pieceIds ?? []).map(id => piecesById[id]?.title).filter(Boolean);
  const isRehearsal = (event.type === 'Rehearsal' || event.type === 'Sectional') && event.ensembleIds.length > 0;
  const cancelled = event.status === 'Cancelled';

  return (
    <div className={`dir-today-card ${cancelled ? 'cancelled' : ''}`}>
      <div className="dir-today-stripe" style={{ background: firstEns ? ensembleColor(firstEns) : '#94a3b8' }} />
      <div className="dir-today-body">
        <div className="dir-today-name">
          <span className="dir-today-icon">{EVENT_TYPE_ICON[event.type]}</span> {name}
          {cancelled && <span className="dir-today-tag cancelled">Cancelled</span>}
          {!cancelled && event.changeNote && <span className="dir-today-tag changed">Changed</span>}
        </div>
        <div className="dir-today-meta">
          {event.startTime && <span><Clock size={13} /> {formatTimeRange(event.startTime, event.endTime)}</span>}
          {event.location && <span><MapPin size={13} /> {event.location}</span>}
          {expected != null && <span><Users size={13} /> {expected} expected</span>}
        </div>
        {event.changeNote && <div className="dir-today-change">⚠ {event.changeNote}</div>}
        <div className="dir-today-rep">
          <Music size={13} />
          {linkedPieces.length > 0
            ? linkedPieces.join(' · ')
            : event.repertoire
              ? <Linkify text={event.repertoire} />
              : <em>No repertoire chosen yet</em>}
        </div>
        <div className="dir-today-actions">
          {isRehearsal && !cancelled && (
            <button className="dir-btn dir-btn-primary dir-today-action" onClick={() => onNavigate('roll', { ensembleId: event.ensembleIds[0] })}>
              <ClipboardList size={15} /> Take Roll
            </button>
          )}
          <button className="dir-btn dir-btn-ghost dir-today-action" onClick={() => onNavigate('schedule', { date: event.date, eventId: event.id })}>
            {linkedPieces.length > 0 || event.repertoire ? 'Edit / details' : <><Plus size={14} /> Add repertoire</>}
          </button>
        </div>
      </div>
    </div>
  );
}
