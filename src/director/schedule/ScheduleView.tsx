import { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, CalendarPlus, MapPin, Clock, Users, Upload, Sparkles, LayoutList, Grid3x3 } from 'lucide-react';
import { useEnsembles } from '../hooks/useEnsembles';
import { useEvents } from '../hooks/useEvents';
import { useStudents } from '../hooks/useStudents';
import { useRepertoire } from '../hooks/useRepertoire';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { useAssignments } from '../hooks/useAssignments';
import { recordActivity } from '../hooks/useActivityLog';
import { resolveRoster, overrideSummary } from '../rosterResolver';
import { isSharedBlock, sharedBlockLabel } from '../../shared/sharedBlock';
import { EventForm } from './EventForm';
import { EventRoster } from './EventRoster';
import { IcsImport } from './IcsImport';
import { QuickAddView } from './QuickAddView';
import { FilteredCalendarSubscribe } from '../components/FilteredCalendarSubscribe';
import { FilterMenu } from '../../shared/FilterMenu';
import { seedCalendar, seedSchoolCalendar, seedExtraSchedule } from '../seedCalendar';
import { useMonthSwipe } from '../../shared/useMonthSwipe';
import {
  todayStr, toDateStr, parseDate, formatTimeRange, ensembleColor, musicEnsembles, EVENT_TYPE_ICON, assignmentEmoji, CONCERT_COLOR, ASSIGN_COLOR,
} from '../utils';
import type { CalendarEvent, EventType } from '../types';
import { assignmentMatchesView, eventMatchesView, normalizeView } from '../../shared/calendarView';
import { Linkify } from '../components/Linkify';
import { dailyPun } from '../../shared/whimsy';
import { ORG } from '../../org';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Sentinel for the "school-wide events only" pick in the ensemble filter menu.
const SCHOOL = '__school__';
type SchedTypeKey = EventType | 'Assignment';
const SCHED_TYPE_OPTIONS: { value: SchedTypeKey; label: string; color: string }[] = [
  { value: 'Rehearsal', label: 'Rehearsals', color: '#2563eb' },
  { value: 'Class',     label: 'Classes',    color: '#0f766e' },
  { value: 'Sectional', label: 'Sectionals', color: '#0891b2' },
  { value: 'Concert',   label: 'Concerts',   color: CONCERT_COLOR },
  { value: 'Event',     label: 'Events',     color: '#64748b' },
  { value: 'Assignment', label: 'Assignments', color: ASSIGN_COLOR },
];

export function ScheduleView({ initialDate, initialEventId, initialEnsembleId = '', onNavigate }: {
  initialDate?: string;
  initialEventId?: string;
  initialEnsembleId?: string;
  onNavigate?: import('../types-nav').DirNavigate;
} = {}) {
  const { ensembles } = useEnsembles();
  const { events, addEvent, updateEvent, deleteEvent } = useEvents();
  const { students } = useStudents();
  const { pieces, updatePiece } = useRepertoire();
  const { overrides } = useRosterOverrides();
  const { assignments } = useAssignments();

  const [cursor, setCursor] = useState(() => {
    const d = parseDate(initialDate ?? todayStr());
    d.setDate(1);
    return d;
  });
  const [selectedDate, setSelectedDate] = useState(initialDate ?? todayStr());
  // Multi-select: filter by several ensembles AND several types at once.
  // Empty === all. `initialEnsembleId` (a deep-link from an ensemble hub) seeds
  // the ensemble selection.
  const [filterEnsembleIds, setFilterEnsembleIds] = useState<string[]>(initialEnsembleId ? [initialEnsembleId] : []);
  const [typeFilters, setTypeFilters] = useState<SchedTypeKey[]>([]);
  const [calView, setCalView] = useState<'month' | 'list'>('month');
  const [editing, setEditing] = useState<CalendarEvent | null | 'new'>(null);
  const [quickAddDraft, setQuickAddDraft] = useState<Partial<Omit<CalendarEvent, 'id'>> | undefined>(undefined);
  const [rosterEvent, setRosterEvent] = useState<CalendarEvent | null>(null);
  const [importingIcs, setImportingIcs] = useState(false);
  const [quickAdding, setQuickAdding] = useState(false);
  const [seedState, setSeedState] = useState<'idle' | 'seeding' | 'done' | 'error'>('idle');
  const [seedError, setSeedError] = useState('');
  const [schoolCalState, setSchoolCalState] = useState<'idle' | 'seeding' | 'done' | 'error'>('idle');
  const [schoolCalError, setSchoolCalError] = useState('');
  const [classesState, setClassesState] = useState<'idle' | 'seeding' | 'done' | 'error'>('idle');
  const [classesMsg, setClassesMsg] = useState('');
  const focusConsumed = useRef(false);

  useEffect(() => { recordActivity('schedule.view'); }, []);

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

  async function handleSeedClasses() {
    setClassesState('seeding');
    setClassesMsg('');
    try {
      const n = await seedExtraSchedule();
      setClassesMsg(`Added ${n} choir + class sessions for the year.`);
      setClassesState('done');
    } catch (e) {
      setClassesMsg(e instanceof Error ? e.message : String(e));
      setClassesState('error');
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

  // The filters as a shareable "view" — the same object the calendar feed is
  // built from, so what you subscribe to is what you're looking at.
  const realEnsIds = useMemo(() => filterEnsembleIds.filter(x => x !== SCHOOL), [filterEnsembleIds]);
  const viewSpec = useMemo(
    () => normalizeView({ ensembleIds: realEnsIds, school: filterEnsembleIds.includes(SCHOOL), types: typeFilters }),
    [realEnsIds, filterEnsembleIds, typeFilters],
  );
  const visibleEvents = useMemo(
    () => events.filter(e => eventMatchesView(e, viewSpec)),
    [events, viewSpec],
  );

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const e of visibleEvents) (map[e.date] ??= []).push(e);
    return map;
  }, [visibleEvents]);

  // Assignment due dates as a parallel stream on the calendar.
  const visibleAssignments = useMemo(
    () => assignments.filter(a => assignmentMatchesView(a, viewSpec)),
    [assignments, viewSpec],
  );
  const assignByDate = useMemo(() => {
    const m: Record<string, typeof assignments> = {};
    for (const a of visibleAssignments) (m[a.dueDate] ??= []).push(a);
    return m;
  }, [visibleAssignments]);

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
  const { dragX, animating: calAnimating, viewportRef: calViewportRef, handlers: swipeHandlers } = useMonthSwipe(shiftMonth);
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

  function expectedCount(e: CalendarEvent) {
    const set = new Set<string>();
    for (const ensId of e.ensembleIds) {
      resolveRoster(students, overrides, { ensembleId: ensId, eventId: e.id, eventsById })
        .forEach(r => set.add(r.student.id));
    }
    return set.size;
  }

  function eventColor(e: CalendarEvent) {
    if (e.type === 'Concert') return CONCERT_COLOR;
    return ensembleColor(ensembleMap[e.ensembleIds[0]]);
  }

  function eventLabel(e: CalendarEvent) {
    if (e.title) return e.title;
    const names = e.ensembleIds.map(id => ensembleMap[id]?.name ?? '').filter(Boolean);
    // A combined block collapses once it stops being readable — it can cover
    // every ensemble in the program, and 17 names is not a calendar chip.
    if (isSharedBlock(e)) return sharedBlockLabel(names, { total: ensembles.length });
    return names.join(', ') || e.type;
  }

  function EventCard({ e }: { e: CalendarEvent }) {
    const summary = overrideSummary(overrides, e.id);
    // School-wide items collapse to a minimal note UNLESS they're a Class —
    // classes are always school-wide (no ensemble) but still meet at a real
    // time/place, so they need the full card (time, location, type icon) just
    // like the public calendar shows them. Only timeless school markers (no
    // school today, planning days, etc.) get the minimal treatment.
    const isSchoolWide = e.ensembleIds.length === 0 && e.type !== 'Class';

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
          {(e.type === 'Rehearsal' || e.type === 'Sectional') && e.ensembleIds.length > 0 && onNavigate && (
            <button className="dir-event-roster-btn" onClick={() => onNavigate('whosOut', { date: e.date, ensembleId: e.ensembleIds[0] })} title="Who is out that day, and why">
              Who’s out
            </button>
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
      {/* Toolbar: view toggle + one-time imports (month nav lives with the grid) */}
      <div className="dir-cal-toolbar">
          <button
            className={`dir-tool-btn${calView === 'list' ? ' active' : ''}`}
            onClick={() => setCalView(v => v === 'month' ? 'list' : 'month')}
            title={calView === 'month' ? 'Switch to list view' : 'Switch to month view'}
          >
            {calView === 'month'
              ? <><LayoutList size={15} /> List view</>
              : <><Grid3x3 size={15} /> Calendar view</>}
          </button>
          <FilteredCalendarSubscribe
            events={visibleEvents}
            assignments={visibleAssignments}
            ensembles={ensembles}
            piecesById={piecesById}
            view={viewSpec}
          />
          {/* One-time school-calendar import: hidden once school events exist.
              The whole seed family is NWSA-only (hardcoded MDCPS/MDC data) —
              other orgs never see these buttons (#org-config). */}
          {ORG.features.calendarSeed && (!hasSchoolEvents || schoolCalState === 'seeding' || schoolCalState === 'error') && (
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
          {ORG.features.calendarSeed && events.length === 0 && seedState !== 'done' && (
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
          {/* Add the theory/academic classes to an already-seeded calendar. */}
          {ORG.features.calendarSeed && events.length > 0 && classesState !== 'done' && (
            <button
              className="dir-tool-btn"
              onClick={handleSeedClasses}
              disabled={classesState === 'seeding'}
              title="Add HS Choir rehearsals plus every academic class (AP Theory, Jazz Theory, Theory 9th/10th, Music History, String Masterclass, Vocal Lit, Vocal Forum) to the calendar for the whole year"
            >
              <Sparkles size={15} /> {classesState === 'seeding' ? 'Adding…' : 'Add classes & choir'}
            </button>
          )}
          {(classesState === 'done' || classesState === 'error') && (
            <span style={{ fontSize: 12, color: classesState === 'error' ? 'var(--dir-danger)' : 'inherit', alignSelf: 'center' }}>
              {classesMsg}
            </span>
          )}
          <button className="dir-tool-btn" onClick={() => setImportingIcs(true)} title="Import ICS calendar">
            <Upload size={15} /> Import
          </button>
          <button className="dir-tool-btn" onClick={() => setQuickAdding(true)} title="Describe an event in plain English">
            <Sparkles size={15} /> Quick Add
          </button>
      </div>

      {/* Filters — multi-select: several ensembles AND several types at once. */}
      <div className="dir-multi-filter">
        <span className="dir-multi-filter-label">Show:</span>
        <FilterMenu
          prefix="dir"
          allLabel="All ensembles"
          ariaLabel="Filter by ensemble"
          options={[
            ...musicEnsembles([...ensembles].sort((a, b) => a.order - b.order)).map(e => ({ value: e.id, label: e.name, color: ensembleColor(e) })),
            ...(hasSchoolEvents ? [{ value: SCHOOL, label: 'School events' }] : []),
          ]}
          selected={filterEnsembleIds}
          onChange={setFilterEnsembleIds}
        />
        <FilterMenu
          prefix="dir"
          allLabel="All types"
          ariaLabel="Filter by type"
          options={SCHED_TYPE_OPTIONS}
          selected={typeFilters}
          onChange={next => setTypeFilters(next as SchedTypeKey[])}
        />
      </div>

      {calView === 'month' ? (
        <div className="dir-sched-split">
          <div className="dir-sched-cal-col">
          {/* Month navigation — directly above the grid it controls */}
          <div className="dir-cal-nav">
            <button className="dir-date-nav-btn" onClick={() => shiftMonth(-1)} aria-label="Previous month">
              <ChevronLeft size={18} />
            </button>
            <button className="dir-cal-month" onClick={goToday} title="Jump back to today">{monthLabel}</button>
            <button className="dir-date-nav-btn" onClick={() => shiftMonth(1)} aria-label="Next month">
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Calendar grid */}
          <div className="dir-cal" {...swipeHandlers}>
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
                        {(assignByDate[dateStr] ?? []).slice(0, 2).map(a => (
                          <span key={a.id} className="dir-cal-dot" style={{ background: ASSIGN_COLOR }} />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          </div>

          {/* Selected-day detail */}
          <div className="dir-day-detail">
            <div className="dir-day-detail-header">
              {parseDate(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              {selectedDate === today && <span className="dir-today-badge">Today</span>}
            </div>
            {dayEvents.length === 0 && (assignByDate[selectedDate] ?? []).length === 0 ? (
              <div className="dir-day-empty">No events scheduled. Tap + to add one. {dailyPun('dir-sched').en}</div>
            ) : (
              <>
                {dayEvents.map(e => <EventCard key={e.id} e={e} />)}
                {(assignByDate[selectedDate] ?? []).map(a => (
                  <div key={a.id} className="dir-sc-ov" style={{ borderLeftColor: ASSIGN_COLOR }}>
                    <div className="dir-sc-ov-body">
                      <div className="dir-sc-ov-title">{assignmentEmoji(a.type)} {a.title}</div>
                      <div className="dir-sc-ov-meta">{a.type} · due this day · grade it in Assignments</div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
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
          initialDraft={editing === 'new' ? quickAddDraft : undefined}
          onSave={async data => {
            let eventId: string | undefined;
            if (editing === 'new') eventId = await addEvent(data);
            else { await updateEvent(editing.id, data); eventId = editing.id; }
            // Pieces↔concerts are linked from BOTH sides (piece.eventIds and
            // event.pieceIds), and every reader treats the union as truth. The
            // piece form already syncs the event side; mirror it here so
            // unselecting a piece from the concert also clears the piece's own
            // link — otherwise the stale piece.eventIds keeps the piece on the
            // concert's repertoire everywhere. Concert/Event only (same set the
            // piece form links): rehearsal programs stay one-sided on the
            // event, never in a piece's "programmed for" list.
            if (eventId && (data.type === 'Concert' || data.type === 'Event')) {
              const eid = eventId;
              const wanted = new Set(data.pieceIds ?? []);
              const writes: Promise<void>[] = [];
              for (const p of pieces) {
                const has = (p.eventIds ?? []).includes(eid);
                if (wanted.has(p.id) && !has) writes.push(updatePiece(p.id, { eventIds: [...(p.eventIds ?? []), eid] }));
                else if (!wanted.has(p.id) && has) writes.push(updatePiece(p.id, { eventIds: (p.eventIds ?? []).filter(id => id !== eid) }));
              }
              await Promise.all(writes);
            }
          }}
          onDelete={editing !== 'new' ? async () => deleteEvent(editing.id) : undefined}
          onClose={() => { setEditing(null); setQuickAddDraft(undefined); }}
        />
      )}

      {quickAdding && (
        <QuickAddView
          onClose={() => setQuickAdding(false)}
          onContinue={draft => {
            setQuickAddDraft(draft);
            setQuickAdding(false);
            setEditing('new');
          }}
        />
      )}

      {rosterEvent && (
        <EventRoster
          event={rosterEvent}
          ensembles={ensembles}
          onClose={() => setRosterEvent(null)}
          onNavigate={onNavigate}
        />
      )}

      {importingIcs && <IcsImport onClose={() => setImportingIcs(false)} />}
    </div>
  );
}
