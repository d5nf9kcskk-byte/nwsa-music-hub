import { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, CalendarPlus, MapPin, Clock, Users, Upload, Sparkles, LayoutList, Grid3x3 } from 'lucide-react';
import { useEnsembles } from '../hooks/useEnsembles';
import { useEvents } from '../hooks/useEvents';
import { useStudents } from '../hooks/useStudents';
import { useRepertoire } from '../hooks/useRepertoire';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { resolveRoster, overrideSummary } from '../rosterResolver';
import { EventForm } from './EventForm';
import { EventRoster } from './EventRoster';
import { IcsImport } from './IcsImport';
import { seedCalendar, seedSchoolCalendar } from '../seedCalendar';
import {
  todayStr, toDateStr, parseDate, formatTimeRange, ensembleColor, EVENT_TYPE_ICON,
} from '../utils';
import type { CalendarEvent } from '../types';
import { Linkify } from '../components/Linkify';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function ScheduleView({ initialDate, initialEventId, initialEnsembleId = '' }: {
  initialDate?: string;
  initialEventId?: string;
  initialEnsembleId?: string;
} = {}) {
  const { ensembles } = useEnsembles();
  const { events, addEvent, updateEvent, deleteEvent } = useEvents();
  const { students } = useStudents();
  const { pieces } = useRepertoire();
  const { overrides } = useRosterOverrides();

  const [cursor, setCursor] = useState(() => {
    const d = parseDate(initialDate ?? todayStr());
    d.setDate(1);
    return d;
  });
  const [selectedDate, setSelectedDate] = useState(initialDate ?? todayStr());
  const [filterEnsembleId, setFilterEnsembleId] = useState(initialEnsembleId);
  const [typeFilter, setTypeFilter] = useState<'all' | 'Rehearsal' | 'Sectional' | 'Concert' | 'Event'>('all');
  const [calView, setCalView] = useState<'month' | 'list'>('month');
  const [editing, setEditing] = useState<CalendarEvent | null | 'new'>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const swipeAxis = useRef<'h' | 'v' | null>(null);
  const calViewportRef = useRef<HTMLDivElement>(null);
  const calTimer = useRef<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const [calAnimating, setCalAnimating] = useState(false);
  const [rosterEvent, setRosterEvent] = useState<CalendarEvent | null>(null);
  const [importingIcs, setImportingIcs] = useState(false);
  const [seedState, setSeedState] = useState<'idle' | 'seeding' | 'done' | 'error'>('idle');
  const [seedError, setSeedError] = useState('');
  const [schoolCalState, setSchoolCalState] = useState<'idle' | 'seeding' | 'done' | 'error'>('idle');
  const [schoolCalError, setSchoolCalError] = useState('');
  const focusConsumed = useRef(false);

  useEffect(() => {
    if (initialEventId && !focusConsumed.current && events.length > 0) {
      const ev = events.find(e => e.id === initialEventId);
      if (ev) { setEditing(ev); focusConsumed.current = true; }
    }
  }, [initialEventId, events]);

  async function handleSeed() {
    setSeedState('seeding');
    setSeedError('');
    try {
      await seedCalendar();
      setSeedState('done');
    } catch (e) {
      setSeedError(e instanceof Error ? e.message : String(e));
      setSeedState('error');
    }
  }

  async function handleSchoolCal() {
    setSchoolCalState('seeding');
    setSchoolCalError('');
    try {
      await seedSchoolCalendar();
      setSchoolCalState('done');
    } catch (e) {
      setSchoolCalError(e instanceof Error ? e.message : String(e));
      setSchoolCalState('error');
    }
  }

  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);
  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);
  const piecesById = useMemo(() => Object.fromEntries(pieces.map(p => [p.id, p])), [pieces]);

  const hasSchoolEvents = useMemo(() => events.some(e => e.ensembleIds.length === 0), [events]);

  // School-wide events (ensembleIds: []) are always visible regardless of filter;
  // the special 'school' filter shows ONLY them.
  const visibleEvents = useMemo(
    () => {
      const byEns = filterEnsembleId === 'school'
        ? events.filter(e => e.ensembleIds.length === 0)
        : filterEnsembleId
          ? events.filter(e => e.ensembleIds.length === 0 || e.ensembleIds.includes(filterEnsembleId))
          : events;
      return typeFilter === 'all' ? byEns : byEns.filter(e => e.type === typeFilter);
    },
    [events, filterEnsembleId, typeFilter],
  );

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const e of visibleEvents) (map[e.date] ??= []).push(e);
    return map;
  }, [visibleEvents]);

  // Build the month grid (leading blanks + days, padded to full weeks).
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

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const today = todayStr();

  function shiftMonth(n: number) {
    setCursor(c => new Date(c.getFullYear(), c.getMonth() + n, 1));
  }
  function goToday() {
    const d = parseDate(today);
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelectedDate(today);
  }

  const dayEvents = (eventsByDate[selectedDate] ?? [])
    .slice()
    .sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));

  const upcomingEvents = useMemo(() => {
    const t = today;
    return [...visibleEvents]
      .filter(e => e.date >= t)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));
  }, [visibleEvents, today]);

  function handleTouchStart(e: React.TouchEvent) {
    // Ignore new gestures while a month-commit animation is still in flight,
    // otherwise the pending timer can double-shift or leave the grid off-screen.
    if (calTimer.current !== null) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swipeAxis.current = null;
    setCalAnimating(false);
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    // Lock the gesture to one axis after a small threshold so vertical
    // scrolling isn't hijacked by the horizontal month swipe.
    if (swipeAxis.current === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      swipeAxis.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (swipeAxis.current === 'h') setDragX(dx);
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const wasHorizontal = swipeAxis.current === 'h';
    touchStartX.current = null;
    touchStartY.current = null;
    swipeAxis.current = null;
    if (!wasHorizontal) { setDragX(0); return; }

    const width = calViewportRef.current?.offsetWidth ?? 320;
    setCalAnimating(true);
    if (Math.abs(dx) > 60) {
      const dir = dx < 0 ? 1 : -1;        // swipe left → next month
      setDragX(-dir * width);             // slide the current month fully out
      calTimer.current = window.setTimeout(() => {
        shiftMonth(dir);
        setCalAnimating(false);
        setDragX(dir * width);            // drop the new month in from the opposite edge
        requestAnimationFrame(() => requestAnimationFrame(() => {
          setCalAnimating(true);
          setDragX(0);                     // ease it into place
          calTimer.current = null;         // commit complete — accept new gestures
        }));
      }, 200);
    } else {
      setDragX(0);                         // not far enough — spring back
    }
  }

  function expectedCount(e: CalendarEvent) {
    const set = new Set<string>();
    for (const ensId of e.ensembleIds) {
      resolveRoster(students, overrides, { ensembleId: ensId, eventId: e.id, eventsById })
        .forEach(r => set.add(r.student.id));
    }
    return set.size;
  }

  function eventColor(e: CalendarEvent) {
    if (e.type === 'Concert') return '#ca8a04';
    return ensembleColor(ensembleMap[e.ensembleIds[0]]);
  }

  function eventLabel(e: CalendarEvent) {
    if (e.title) return e.title;
    const names = e.ensembleIds.map(id => ensembleMap[id]?.name ?? '').filter(Boolean);
    return names.join(', ') || e.type;
  }

  function EventCard({ e }: { e: CalendarEvent }) {
    const summary = overrideSummary(overrides, e.id);
    const isSchoolWide = e.ensembleIds.length === 0;

    if (isSchoolWide) {
      return (
        <div className="dir-school-note" onClick={() => setEditing(e)}>
          <span className="dir-school-note-icon">🏫</span>
          <span className="dir-school-note-title">{eventLabel(e)}</span>
        </div>
      );
    }

    return (
      <div className={`dir-event-card ${e.status === 'Cancelled' ? 'cancelled' : ''}`}>
        <span className="dir-event-bar" style={{ background: eventColor(e) }} />
        <div className="dir-event-body">
          <div className="dir-event-tap" onClick={() => setEditing(e)}>
            <div className="dir-event-title">
              <span className="dir-event-type">{EVENT_TYPE_ICON[e.type]}</span>
              {eventLabel(e)}
              {e.status !== 'Scheduled' && <span className={`dir-event-status ${e.status}`}>{e.status}</span>}
              {e.status === 'Scheduled' && e.changeNote && <span className="dir-today-tag changed">Changed</span>}
            </div>
            {e.changeNote && <div className="dir-today-change">⚠ {e.changeNote}</div>}
            <div className="dir-event-meta">
              {formatTimeRange(e.startTime, e.endTime) && (
                <span><Clock size={12} /> {formatTimeRange(e.startTime, e.endTime)}</span>
              )}
              {e.location && <span><MapPin size={12} /> {e.location}</span>}
              {e.ensembleIds.length > 0 && <span><Users size={12} /> {expectedCount(e)} expected</span>}
            </div>
            {e.repertoire && <div className="dir-event-rep"><Linkify text={e.repertoire} /></div>}
            {(e.pieceIds ?? []).length > 0 && (
              <div className="dir-event-pieces">
                {(e.pieceIds ?? []).map(pid => piecesById[pid]).filter(Boolean).map(p => (
                  <span key={p!.id} className="dir-event-piece-chip">{p!.title}</span>
                ))}
              </div>
            )}
          </div>
          {e.type === 'Concert' && (e.pieceIds ?? []).length > 0 && (
            <a
              className="dir-event-program-btn"
              href={`${import.meta.env.BASE_URL}program/${e.id}`}
              target="_blank"
              rel="noreferrer"
            >
              Program ↗
            </a>
          )}
          {e.ensembleIds.length > 0 && (
            <button className="dir-event-roster-btn" onClick={() => setRosterEvent(e)}>
              Roster
              {(summary.added > 0 || summary.removed > 0) && (
                <span className="dir-event-roster-tag">
                  {summary.added > 0 && `+${summary.added}`}
                  {summary.added > 0 && summary.removed > 0 && ' '}
                  {summary.removed > 0 && `−${summary.removed}`}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Month navigation */}
      <div className="dir-cal-nav">
        <button className="dir-date-nav-btn" onClick={() => shiftMonth(-1)} aria-label="Previous month">
          <ChevronLeft size={18} />
        </button>
        <button className="dir-cal-month" onClick={goToday}>{monthLabel}</button>
        <button className="dir-date-nav-btn" onClick={() => shiftMonth(1)} aria-label="Next month">
          <ChevronRight size={18} />
        </button>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <button
            className={`dir-tool-btn${calView === 'list' ? ' active' : ''}`}
            onClick={() => setCalView(v => v === 'month' ? 'list' : 'month')}
            title={calView === 'month' ? 'Switch to list view' : 'Switch to month view'}
          >
            {calView === 'month'
              ? <><LayoutList size={15} /> List view</>
              : <><Grid3x3 size={15} /> Calendar view</>}
          </button>
          {/* One-time school-calendar import: hidden once school events exist */}
          {(!hasSchoolEvents || schoolCalState === 'seeding' || schoolCalState === 'error') && (
            <button
              className="dir-tool-btn"
              onClick={handleSchoolCal}
              disabled={schoolCalState === 'seeding'}
              title="Import MDCPS + MDC 2026-27 school calendar into Schedule"
            >
              {schoolCalState === 'seeding' ? 'Importing…' : schoolCalState === 'error' ? '⚠ Retry' : 'Import School Cal'}
            </button>
          )}
          {schoolCalState === 'error' && (
            <span style={{ fontSize: 12, color: 'var(--dir-danger)', alignSelf: 'center' }}>
              {schoolCalError}
            </span>
          )}
          {/* One-time season seed: only offered while the calendar is empty */}
          {events.length === 0 && seedState !== 'done' && (
            <button
              className="dir-tool-btn"
              onClick={handleSeed}
              disabled={seedState === 'seeding'}
              title="Pre-load full 2026-27 NWSA rehearsal schedule + MDCPS/MDC calendar"
            >
              <Sparkles size={15} /> {seedState === 'seeding' ? 'Seeding…' : 'Seed 2026-27'}
            </button>
          )}
          {seedState === 'error' && (
            <span style={{ fontSize: 12, color: 'var(--dir-danger)', alignSelf: 'center' }}>
              {seedError}
            </span>
          )}
          <button className="dir-tool-btn" onClick={() => setImportingIcs(true)} title="Import ICS calendar">
            <Upload size={15} /> Import
          </button>
        </div>
      </div>

      {/* Ensemble filter */}
      {ensembles.length > 0 && (
        <div className="dir-tabs">
          <button className={`dir-tab ${!filterEnsembleId ? 'active' : ''}`} onClick={() => setFilterEnsembleId('')}>All</button>
          {ensembles.map(e => (
            <button
              key={e.id}
              className={`dir-tab ${filterEnsembleId === e.id ? 'active' : ''}`}
              onClick={() => setFilterEnsembleId(e.id)}
            >
              {e.name}
            </button>
          ))}
          {hasSchoolEvents && (
            <button
              className={`dir-tab ${filterEnsembleId === 'school' ? 'active' : ''}`}
              onClick={() => setFilterEnsembleId('school')}
            >
              School
            </button>
          )}
        </div>
      )}

      {/* Type filter */}
      <div className="dir-type-filter">
        <span className="dir-type-filter-label">Show:</span>
        <select className="dir-input dir-type-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}>
          <option value="all">Everything</option>
          <option value="Rehearsal">Rehearsals</option>
          <option value="Sectional">Sectionals</option>
          <option value="Concert">Concerts</option>
          <option value="Event">Events</option>
        </select>
      </div>

      {calView === 'month' ? (
        <>
          {/* Calendar grid */}
          <div
            className="dir-cal"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="dir-cal-weekdays">
              {WEEKDAYS.map((d, i) => <div key={i} className="dir-cal-weekday">{d}</div>)}
            </div>
            <div className="dir-cal-viewport" ref={calViewportRef}>
              <div
                className="dir-cal-grid"
                style={{
                  transform: `translateX(${dragX}px)`,
                  transition: calAnimating ? 'transform 0.2s ease-out' : 'none',
                }}
              >
                {cells.map((dateStr, i) => {
                  if (!dateStr) return <div key={i} className="dir-cal-cell empty" />;
                  const evs = eventsByDate[dateStr] ?? [];
                  const isToday = dateStr === today;
                  const isSel = dateStr === selectedDate;
                  return (
                    <button
                      key={i}
                      className={`dir-cal-cell ${isSel ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                      onClick={() => setSelectedDate(dateStr)}
                    >
                      <span className="dir-cal-day">{parseDate(dateStr).getDate()}</span>
                      <span className="dir-cal-dots">
                        {evs.slice(0, 4).map(e => (
                          <span key={e.id} className="dir-cal-dot" style={{ background: eventColor(e) }} />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Selected-day detail */}
          <div className="dir-day-detail">
            <div className="dir-day-detail-header">
              {parseDate(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              {selectedDate === today && <span className="dir-today-badge">Today</span>}
            </div>
            {dayEvents.length === 0 ? (
              <div className="dir-day-empty">No events scheduled. Tap + to add one.</div>
            ) : (
              dayEvents.map(e => <EventCard key={e.id} e={e} />)
            )}
          </div>
        </>
      ) : (
        /* List view — upcoming events from today */
        <div className="dir-list-view">
          {upcomingEvents.length === 0 ? (
            <div className="dir-day-empty">No upcoming events.</div>
          ) : (() => {
            let lastDate = '';
            return upcomingEvents.map(e => {
              const showHeader = e.date !== lastDate;
              lastDate = e.date;
              return (
                <div key={e.id}>
                  {showHeader && (
                    <div className={`dir-list-date-header${e.date === today ? ' today' : ''}`}>
                      {parseDate(e.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {e.date === today && <span className="dir-today-badge">Today</span>}
                    </div>
                  )}
                  <EventCard e={e} />
                </div>
              );
            });
          })()}
        </div>
      )}

      <button className="dir-fab" onClick={() => setEditing('new')} aria-label="New event">
        <CalendarPlus size={22} />
      </button>

      {editing !== null && (
        <EventForm
          event={editing === 'new' ? null : editing}
          ensembles={ensembles}
          defaultDate={selectedDate}
          onSave={async data => {
            if (editing === 'new') await addEvent(data);
            else await updateEvent(editing.id, data);
          }}
          onDelete={editing !== 'new' ? async () => deleteEvent(editing.id) : undefined}
          onClose={() => setEditing(null)}
        />
      )}

      {rosterEvent && (
        <EventRoster
          event={rosterEvent}
          ensembles={ensembles}
          onClose={() => setRosterEvent(null)}
        />
      )}

      {importingIcs && <IcsImport onClose={() => setImportingIcs(false)} />}
    </div>
  );
}
