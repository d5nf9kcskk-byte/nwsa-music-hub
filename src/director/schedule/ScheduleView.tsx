import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, CalendarPlus, MapPin, Clock, Users, Upload } from 'lucide-react';
import { useEnsembles } from '../hooks/useEnsembles';
import { useEvents } from '../hooks/useEvents';
import { useStudents } from '../hooks/useStudents';
import { useRepertoire } from '../hooks/useRepertoire';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { resolveRoster, overrideSummary } from '../rosterResolver';
import { EventForm } from './EventForm';
import { EventRoster } from './EventRoster';
import { IcsImport } from './IcsImport';
import {
  todayStr, toDateStr, parseDate, formatTimeRange, ensembleColor, EVENT_TYPE_ICON,
} from '../utils';
import type { CalendarEvent } from '../types';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function ScheduleView() {
  const { ensembles } = useEnsembles();
  const { events, addEvent, updateEvent, deleteEvent } = useEvents();
  const { students } = useStudents();
  const { pieces } = useRepertoire();
  const { overrides } = useRosterOverrides();

  const [cursor, setCursor] = useState(() => {
    const d = parseDate(todayStr());
    d.setDate(1);
    return d;
  });
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [filterEnsembleId, setFilterEnsembleId] = useState('');
  const [editing, setEditing] = useState<CalendarEvent | null | 'new'>(null);
  const [rosterEvent, setRosterEvent] = useState<CalendarEvent | null>(null);
  const [importingIcs, setImportingIcs] = useState(false);

  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);
  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);
  const piecesById = useMemo(() => Object.fromEntries(pieces.map(p => [p.id, p])), [pieces]);

  const visibleEvents = useMemo(
    () => (filterEnsembleId ? events.filter(e => e.ensembleIds.includes(filterEnsembleId)) : events),
    [events, filterEnsembleId],
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
        <button className="dir-tool-btn" style={{ marginLeft: 'auto' }} onClick={() => setImportingIcs(true)} title="Import ICS calendar">
          <Upload size={15} /> Import
        </button>
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
        </div>
      )}

      {/* Calendar grid */}
      <div className="dir-cal">
        <div className="dir-cal-weekdays">
          {WEEKDAYS.map((d, i) => <div key={i} className="dir-cal-weekday">{d}</div>)}
        </div>
        <div className="dir-cal-grid">
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

      {/* Selected-day detail */}
      <div className="dir-day-detail">
        <div className="dir-day-detail-header">
          {parseDate(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          {selectedDate === today && <span className="dir-today-badge">Today</span>}
        </div>

        {dayEvents.length === 0 ? (
          <div className="dir-day-empty">No events scheduled. Tap + to add one.</div>
        ) : (
          dayEvents.map(e => {
            const summary = overrideSummary(overrides, e.id);
            return (
              <div key={e.id} className={`dir-event-card ${e.status === 'Cancelled' ? 'cancelled' : ''}`}>
                <span className="dir-event-bar" style={{ background: eventColor(e) }} />
                <div className="dir-event-body">
                  <div className="dir-event-tap" onClick={() => setEditing(e)}>
                    <div className="dir-event-title">
                      <span className="dir-event-type">{EVENT_TYPE_ICON[e.type]}</span>
                      {eventLabel(e)}
                      {e.status !== 'Scheduled' && <span className={`dir-event-status ${e.status}`}>{e.status}</span>}
                    </div>
                    <div className="dir-event-meta">
                      {formatTimeRange(e.startTime, e.endTime) && (
                        <span><Clock size={12} /> {formatTimeRange(e.startTime, e.endTime)}</span>
                      )}
                      {e.location && <span><MapPin size={12} /> {e.location}</span>}
                      {e.ensembleIds.length > 0 && <span><Users size={12} /> {expectedCount(e)} expected</span>}
                    </div>
                    {e.repertoire && <div className="dir-event-rep">{e.repertoire}</div>}
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
          })
        )}
      </div>

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
