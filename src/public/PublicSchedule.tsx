import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router';
import { useMonthSwipe } from './useMonthSwipe';
import { ChevronLeft, ChevronRight, ExternalLink, LayoutList, Grid3x3 } from 'lucide-react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useStudents } from '../director/hooks/useStudents';
import { useEvents } from '../director/hooks/useEvents';
import { useRosterOverrides } from '../director/hooks/useRosterOverrides';
import { useAnnouncements, visibleAnnouncements } from '../director/hooks/useAnnouncements';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { studentExpectation } from '../director/rosterResolver';
import { todayStr, toDateStr, parseDate, ensembleColor, findPartForInstrument } from '../director/utils';
import { PubEventCard } from './components/PubEventCard';
import { PubAnnouncements } from './components/PubAnnouncements';
import { SubscribeButton } from './components/SubscribeButton';
import type { CalendarEvent } from '../director/types';

type TypeFilter = 'all' | 'rehearsals' | 'concerts' | 'events';

const FILTERS: { key: TypeFilter; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'rehearsals', label: 'Rehearsals' },
  { key: 'concerts',   label: 'Concerts' },
  { key: 'events',     label: 'Events' },
];

function matchesFilter(e: CalendarEvent, f: TypeFilter): boolean {
  if (f === 'all') return true;
  if (f === 'rehearsals') return e.type === 'Rehearsal' || e.type === 'Sectional';
  if (f === 'concerts') return e.type === 'Concert';
  return e.type === 'Event';
}

export function PublicSchedule() {
  const { id = '' } = useParams();
  const { ensembles } = useEnsembles();
  const { students } = useStudents();
  const { events } = useEvents();
  const { overrides } = useRosterOverrides();
  const { announcements } = useAnnouncements();
  const { pieces } = useRepertoire();

  // Plain component state on purpose: the filter and view reset every time the
  // student re-opens this page, so nothing stays silently hidden.
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [view, setView] = useState<'list' | 'calendar'>('list');

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
  const upcomingItems = mySchedule.filter(x => x.event.date > today && matchesFilter(x.event, filter));

  const myAnnouncements = useMemo(
    () => student ? visibleAnnouncements(announcements, today, student.ensembleIds ?? []) : [],
    [announcements, today, student],
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

  if (!student) {
    return (
      <div className="pub-page">
        <Link to="/lookup" className="pub-back"><ChevronLeft size={16} /> Search</Link>
        <div className="pub-card pub-muted">Student not found.</div>
      </div>
    );
  }

  const homeEnsembles = ensembles.filter(e => student.ensembleIds?.includes(e.id));

  return (
    <div className="pub-page">
      <Link to="/lookup" className="pub-back"><ChevronLeft size={16} /> Search</Link>

      <div className="pub-ens-hero">
        <h1 className="pub-h1">{student.name}</h1>
        <div className="pub-muted">{student.instrument}{student.grade ? ` · ${student.grade}` : ''}</div>
        {homeEnsembles.length > 0 && (
          <div className="pub-tag-row">
            {homeEnsembles.map(e => (
              <Link key={e.id} to={`/ensemble/${e.id}`} className="pub-ens-tag" style={{ background: ensembleColor(e) }}>{e.name}</Link>
            ))}
          </div>
        )}
      </div>

      {/* Personal calendar feed — the one subscription that follows THIS student. */}
      <SubscribeButton studentId={student.id} label={`Subscribe · ${student.name.split(' ')[0]}'s calendar`} />

      <PubAnnouncements items={myAnnouncements} ensembleMap={ensembleMap} />

      <h2 className="pub-section-title">
        Today · {parseDate(today).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
      </h2>
      {todayItems.length === 0 ? (
        <div className="pub-card pub-muted">Nothing scheduled for you today.</div>
      ) : (
        todayItems.map(({ event: e, exp }) => (
          <PubEventCard key={e.id} event={e} ensembleMap={ensembleMap} piecesById={piecesById} studentInstrument={student.instrument} ensembleIds={exp.ensembleIds} isSub={exp.isSub} attendanceOnly={exp.attendanceOnly} showNotes />
        ))
      )}

      <div className="pub-section-row">
        <h2 className="pub-section-title">Your schedule</h2>
        <button
          className="pub-view-toggle"
          onClick={() => setView(v => v === 'list' ? 'calendar' : 'list')}
        >
          {view === 'list'
            ? <><Grid3x3 size={13} /> Calendar view</>
            : <><LayoutList size={13} /> List view</>}
        </button>
      </div>

      {/* Type filter — resets to All every visit so nothing stays hidden */}
      <div className="pub-filter-row">
        {FILTERS.map(f => (
          <button
            key={f.key}
            className={`pub-filter-btn ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {view === 'calendar' ? (
        <StudentMonth
          items={mySchedule.filter(x => matchesFilter(x.event, filter))}
          ensembleMap={ensembleMap}
          piecesById={piecesById}
          studentInstrument={student.instrument}
        />
      ) : upcomingItems.length === 0 ? (
        <div className="pub-muted">
          {filter === 'all' ? 'No upcoming rehearsals or events.' : 'Nothing in this category coming up.'}
        </div>
      ) : (
        upcomingItems.map(({ event: e, exp }) => (
          <PubEventCard key={e.id} event={e} ensembleMap={ensembleMap} piecesById={piecesById} studentInstrument={student.instrument} ensembleIds={exp.ensembleIds} isSub={exp.isSub} attendanceOnly={exp.attendanceOnly} showDate showNotes />
        ))
      )}

      {myParts.length > 0 && (
        <>
          <h2 className="pub-section-title">Your parts</h2>
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
                  Part <ExternalLink size={12} />
                </a>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Personal month calendar: dots on days with this student's events; tap a day for details. */
function StudentMonth({ items, ensembleMap, piecesById, studentInstrument }: {
  items: { event: CalendarEvent; exp: ReturnType<typeof studentExpectation> }[];
  ensembleMap: Record<string, import('../director/types').Ensemble>;
  piecesById: Record<string, import('../director/types').RepertoirePiece>;
  studentInstrument?: string;
}) {
  const today = todayStr();
  const [cursor, setCursor] = useState(() => {
    const d = parseDate(today);
    d.setDate(1);
    return d;
  });
  const [selectedDate, setSelectedDate] = useState(today);

  const byDate = useMemo(() => {
    const m: Record<string, typeof items> = {};
    for (const it of items) (m[it.event.date] ??= []).push(it);
    return m;
  }, [items]);

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
  const dayItems = byDate[selectedDate] ?? [];
  const shiftMonth = (n: number) => setCursor(c => new Date(c.getFullYear(), c.getMonth() + n, 1));
  const { dragX, animating, viewportRef, handlers } = useMonthSwipe(shiftMonth);

  return (
    <>
      <div className="pub-cal-nav">
        <button className="pub-cal-arrow" onClick={() => shiftMonth(-1)} aria-label="Previous month">
          <ChevronLeft size={18} />
        </button>
        <span className="pub-cal-month">{monthLabel}</span>
        <button className="pub-cal-arrow" onClick={() => shiftMonth(1)} aria-label="Next month">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="pub-cal" onTouchStart={handlers.onTouchStart} onTouchMove={handlers.onTouchMove} onTouchEnd={handlers.onTouchEnd}>
        <div className="pub-cal-weekdays">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
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
                      style={{ background: it.event.type === 'Concert' ? '#ca8a04' : ensembleColor(ensembleMap[it.exp.ensembleIds[0] ?? it.event.ensembleIds[0]]) }}
                    />
                  ))}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <h3 className="pub-section-title">
        {parseDate(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
      </h3>
      {dayItems.length === 0 ? (
        <div className="pub-muted">Nothing for you this day.</div>
      ) : (
        dayItems.map(({ event: e, exp }) => (
          <PubEventCard key={e.id} event={e} ensembleMap={ensembleMap} piecesById={piecesById} studentInstrument={studentInstrument} ensembleIds={exp.ensembleIds} isSub={exp.isSub} attendanceOnly={exp.attendanceOnly} showNotes />
        ))
      )}
    </>
  );
}
