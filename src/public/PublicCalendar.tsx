import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useEvents } from '../director/hooks/useEvents';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { todayStr, toDateStr, parseDate, ensembleColor } from '../director/utils';
import { PubEventCard } from './components/PubEventCard';
import { SubscribeButton } from './components/SubscribeButton';
import type { CalendarEvent } from '../director/types';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function PublicCalendar() {
  const { ensembles } = useEnsembles();
  const { events } = useEvents();
  const { pieces } = useRepertoire();
  const [searchParams, setSearchParams] = useSearchParams();

  const [cursor, setCursor] = useState(() => {
    const d = parseDate(todayStr());
    d.setDate(1);
    return d;
  });
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [filterEnsembleId, setFilterEnsembleId] = useState(() => searchParams.get('ensemble') ?? '');

  // Swipe-animation state — mirrors the director calendar exactly.
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const swipeAxis = useRef<'h' | 'v' | null>(null);
  const calViewportRef = useRef<HTMLDivElement>(null);
  const calTimer = useRef<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const [calAnimating, setCalAnimating] = useState(false);

  // Keep the ?ensemble= deep-link in sync with the chosen filter.
  useEffect(() => {
    const current = searchParams.get('ensemble') ?? '';
    if (current !== filterEnsembleId) {
      const next = new URLSearchParams(searchParams);
      if (filterEnsembleId) next.set('ensemble', filterEnsembleId);
      else next.delete('ensemble');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterEnsembleId]);

  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);
  const piecesById = useMemo(() => Object.fromEntries(pieces.map(p => [p.id, p])), [pieces]);

  // School-wide events (ensembleIds: []) are always visible regardless of filter.
  const visible = filterEnsembleId
    ? events.filter(e => e.ensembleIds.length === 0 || e.ensembleIds.includes(filterEnsembleId))
    : events;
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

  function shiftMonth(n: number) {
    setCursor(c => new Date(c.getFullYear(), c.getMonth() + n, 1));
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (calTimer.current !== null) return; // a month-commit animation is in flight
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swipeAxis.current = null;
    setCalAnimating(false);
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
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
      const dir = dx < 0 ? 1 : -1;
      setDragX(-dir * width);
      calTimer.current = window.setTimeout(() => {
        shiftMonth(dir);
        setCalAnimating(false);
        setDragX(dir * width);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          setCalAnimating(true);
          setDragX(0);
          calTimer.current = null;
        }));
      }, 200);
    } else {
      setDragX(0);
    }
  }

  function color(e: CalendarEvent) {
    return e.type === 'Concert' ? '#ca8a04' : ensembleColor(ensembleMap[e.ensembleIds[0]]);
  }

  const dayEvents = (byDate[selectedDate] ?? []).slice().sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));

  return (
    <div className="pub-page">
      {/* Month navigation — same chrome as the director calendar */}
      <div className="dir-cal-nav">
        <button className="dir-date-nav-btn" onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
        <button className="dir-cal-month" onClick={() => { const d = parseDate(today); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); setSelectedDate(today); }}>{monthLabel}</button>
        <button className="dir-date-nav-btn" onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight size={18} /></button>
      </div>

      {ensembles.length > 0 && (
        <div className="dir-tabs pub-wrap-tabs">
          <button className={`dir-tab ${!filterEnsembleId ? 'active' : ''}`} onClick={() => setFilterEnsembleId('')}>All</button>
          {ensembles.map(e => (
            <button key={e.id} className={`dir-tab ${filterEnsembleId === e.id ? 'active' : ''}`} onClick={() => setFilterEnsembleId(e.id)}>
              {e.name}
            </button>
          ))}
        </div>
      )}

      {/* Calendar grid — identical markup + animated swipe to the director side */}
      <div className="dir-cal" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
        <div className="dir-cal-weekdays">
          {WEEKDAYS.map((d, i) => <div key={i} className="dir-cal-weekday">{d}</div>)}
        </div>
        <div className="dir-cal-viewport" ref={calViewportRef}>
          <div
            className="dir-cal-grid"
            style={{ transform: `translateX(${dragX}px)`, transition: calAnimating ? 'transform 0.2s ease-out' : 'none' }}
          >
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="dir-cal-cell empty" />;
              const evs = byDate[d] ?? [];
              return (
                <button key={i} className={`dir-cal-cell ${d === selectedDate ? 'selected' : ''} ${d === today ? 'today' : ''}`} onClick={() => setSelectedDate(d)}>
                  <span className="dir-cal-day">{parseDate(d).getDate()}</span>
                  <span className="dir-cal-dots">
                    {evs.slice(0, 4).map(e => <span key={e.id} className="dir-cal-dot" style={{ background: color(e) }} />)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected-day detail — same wrapper/header as the director side */}
      <div className="dir-day-detail">
        <div className="dir-day-detail-header">
          {parseDate(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          {selectedDate === today && <span className="dir-today-badge">Today</span>}
        </div>
        {dayEvents.length === 0 ? (
          <div className="dir-day-empty">Nothing scheduled.</div>
        ) : (
          dayEvents.map(e => (
            <PubEventCard key={e.id} event={e} ensembleMap={ensembleMap} piecesById={piecesById} />
          ))
        )}
      </div>

      <div className="pub-subscribe-section">
        <SubscribeButton ensembleId={filterEnsembleId || undefined} />
      </div>
    </div>
  );
}
