import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Clock } from 'lucide-react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useEvents } from '../director/hooks/useEvents';
import { todayStr, toDateStr, parseDate, formatTimeRange, ensembleColor, EVENT_TYPE_ICON } from '../director/utils';
import type { CalendarEvent } from '../director/types';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function PublicCalendar() {
  const { ensembles } = useEnsembles();
  const { events } = useEvents();

  const [cursor, setCursor] = useState(() => {
    const d = parseDate(todayStr());
    d.setDate(1);
    return d;
  });
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [filterEnsembleId, setFilterEnsembleId] = useState('');

  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);

  const visible = filterEnsembleId ? events.filter(e => e.ensembleIds.includes(filterEnsembleId)) : events;
  const byDate = useMemo(() => {
    const m: Record<string, CalendarEvent[]> = {};
    for (const e of visible) (m[e.date] ??= []).push(e);
    return m;
  }, [visible]);

  const cells = useMemo(() => {
    const y = cursor.getFullYear(), mo = cursor.getMonth();
    const firstWeekday = new Date(y, mo, 1).getDay();
    const days = new Date(y, mo + 1, 0).getDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) out.push(null);
    for (let d = 1; d <= days; d++) out.push(toDateStr(new Date(y, mo, d)));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  const today = todayStr();
  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  function color(e: CalendarEvent) {
    return e.type === 'Concert' ? '#ca8a04' : ensembleColor(ensembleMap[e.ensembleIds[0]]);
  }
  function label(e: CalendarEvent) {
    if (e.title) return e.title;
    return e.ensembleIds.map(id => ensembleMap[id]?.name).filter(Boolean).join(', ') || e.type;
  }

  const dayEvents = (byDate[selectedDate] ?? []).slice().sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));

  return (
    <div className="pub-page">
      <div className="pub-cal-nav">
        <button className="pub-icon-btn" onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft size={18} /></button>
        <span className="pub-cal-month">{monthLabel}</span>
        <button className="pub-icon-btn" onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight size={18} /></button>
      </div>

      {ensembles.length > 0 && (
        <div className="pub-chips">
          <button className={`pub-chip ${!filterEnsembleId ? 'active' : ''}`} onClick={() => setFilterEnsembleId('')}>All</button>
          {ensembles.map(e => (
            <button key={e.id} className={`pub-chip ${filterEnsembleId === e.id ? 'active' : ''}`} onClick={() => setFilterEnsembleId(e.id)}>
              <span className="pub-chip-dot" style={{ background: ensembleColor(e) }} />{e.name}
            </button>
          ))}
        </div>
      )}

      <div className="pub-cal">
        <div className="pub-cal-weekdays">{WEEKDAYS.map((d, i) => <div key={i}>{d}</div>)}</div>
        <div className="pub-cal-grid">
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="pub-cal-cell empty" />;
            const evs = byDate[d] ?? [];
            return (
              <button key={i} className={`pub-cal-cell ${d === selectedDate ? 'selected' : ''} ${d === today ? 'today' : ''}`} onClick={() => setSelectedDate(d)}>
                <span className="pub-cal-day">{parseDate(d).getDate()}</span>
                <span className="pub-cal-dots">
                  {evs.slice(0, 4).map(e => <span key={e.id} className="pub-cal-dot" style={{ background: color(e) }} />)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pub-day">
        <h2 className="pub-section-title">
          {parseDate(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </h2>
        {dayEvents.length === 0 ? (
          <div className="pub-muted">Nothing scheduled.</div>
        ) : (
          dayEvents.map(e => (
            <div key={e.id} className={`pub-event ${e.status === 'Cancelled' ? 'cancelled' : ''}`}>
              <span className="pub-event-bar" style={{ background: color(e) }} />
              <div className="pub-event-body">
                <div className="pub-event-title">
                  {EVENT_TYPE_ICON[e.type]} {label(e)}
                  {e.status === 'Cancelled' && <span className="pub-cancelled-tag">Cancelled</span>}
                </div>
                <div className="pub-event-meta">
                  {formatTimeRange(e.startTime, e.endTime) && <span><Clock size={13} /> {formatTimeRange(e.startTime, e.endTime)}</span>}
                  {e.location && <span><MapPin size={13} /> {e.location}</span>}
                </div>
                {e.repertoire && <div className="pub-event-rep">{e.repertoire}</div>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
