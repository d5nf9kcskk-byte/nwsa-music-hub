import { useState, useMemo, useEffect, Fragment } from 'react';
import { useSearchParams, Link } from 'react-router';
import { ChevronLeft, ChevronRight, LayoutList, Grid3x3, CalendarX } from 'lucide-react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useEvents } from '../director/hooks/useEvents';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { useAssignments } from '../director/hooks/useAssignments';
import { todayStr, toDateStr, parseDate, ensembleColor, assignmentEmoji, CONCERT_COLOR, ASSIGN_COLOR } from '../director/utils';
import { PubEventCard } from './components/PubEventCard';
import { PageHeader, EmptyState } from './components/PageHeader';
import { NowLine, nowLineIndex, usePastDimming } from './components/NowLine';
import { SubscribeButton } from './components/SubscribeButton';
import { useMonthSwipe } from '../shared/useMonthSwipe';
import { t, useLang } from '../shared/i18n';
import type { CalendarEvent } from '../director/types';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type TypeFilter = 'all' | 'Rehearsal' | 'Concert' | 'Event' | 'Assignment';
function matchesType(e: CalendarEvent, f: TypeFilter): boolean {
  if (f === 'all') return true;
  if (f === 'Assignment') return false; // assignments are a parallel stream
  if (f === 'Rehearsal') return e.type === 'Rehearsal' || e.type === 'Sectional';
  return e.type === f;
}

const TYPE_LABEL_KEY: Record<TypeFilter, string> = {
  all: 'cal.everything',
  Rehearsal: 'cal.rehearsals',
  Concert: 'cal.concerts',
  Event: 'cal.events',
  Assignment: 'cal.assignments',
};

export function PublicCalendar() {
  useLang(); // re-render labels on EN/ES switch
  const { ensembles } = useEnsembles();
  const { events } = useEvents();
  const { pieces } = useRepertoire();
  const { assignments } = useAssignments();
  const [searchParams, setSearchParams] = useSearchParams();

  const [cursor, setCursor] = useState(() => {
    const d = parseDate(todayStr());
    d.setDate(1);
    return d;
  });
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [filterEnsembleId, setFilterEnsembleId] = useState(() => searchParams.get('ensemble') ?? '');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [view, setView] = useState<'month' | 'list'>('month');

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
  const visible = (filterEnsembleId
    ? events.filter(e => e.ensembleIds.length === 0 || e.ensembleIds.includes(filterEnsembleId))
    : events
  ).filter(e => matchesType(e, typeFilter));

  const upcoming = useMemo(
    () => [...visible].filter(e => e.date >= todayStr()).sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '99').localeCompare(b.startTime ?? '99')),
    [visible],
  );

  // Assignments as a parallel calendar stream (due dates).
  const visibleAssignments = useMemo(() => {
    if (typeFilter !== 'all' && typeFilter !== 'Assignment') return [];
    return assignments.filter(a => !filterEnsembleId || a.ensembleIds.includes(filterEnsembleId));
  }, [assignments, filterEnsembleId, typeFilter]);
  const assignByDate = useMemo(() => {
    const m: Record<string, typeof assignments> = {};
    for (const a of visibleAssignments) (m[a.dueDate] ??= []).push(a);
    return m;
  }, [visibleAssignments]);

  // List view: events and assignment due dates interleaved chronologically.
  type ListItem = { kind: 'event'; e: CalendarEvent; date: string } | { kind: 'assign'; a: (typeof assignments)[0]; date: string };
  const listItems = useMemo<ListItem[]>(() => {
    const t = todayStr();
    const evs: ListItem[] = upcoming.map(e => ({ kind: 'event' as const, e, date: e.date }));
    const asg: ListItem[] = visibleAssignments.filter(a => a.dueDate >= t).map(a => ({ kind: 'assign' as const, a, date: a.dueDate }));
    return [...evs, ...asg].sort((x, y) => x.date.localeCompare(y.date));
  }, [upcoming, visibleAssignments]);
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
  const { nowHM, isPast } = usePastDimming();
  const nowIdx = nowLineIndex(
    listItems.map(it => (it.kind === 'event' ? { date: it.date, startTime: it.e.startTime } : { date: it.date })),
    today, nowHM,
  );

  function shiftMonth(n: number) {
    setCursor(c => new Date(c.getFullYear(), c.getMonth() + n, 1));
  }
  const { dragX, animating, viewportRef, handlers } = useMonthSwipe(shiftMonth);

  function color(e: CalendarEvent) {
    return e.type === 'Concert' ? CONCERT_COLOR : ensembleColor(ensembleMap[e.ensembleIds[0]]);
  }

  const dayEvents = (byDate[selectedDate] ?? []).slice().sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));

  return (
    <div className="pub-page">
      <PageHeader
        title={t('nav.calendar')}
        action={
          <button className="pub-view-toggle" onClick={() => setView(v => v === 'month' ? 'list' : 'month')}>
            {view === 'month' ? <><LayoutList size={13} /> {t('cal.listView')}</> : <><Grid3x3 size={13} /> {t('cal.monthView')}</>}
          </button>
        }
      />

      {/* Filters first; the month header sits directly above the grid below. */}
      {ensembles.length > 0 && (
        <div className="pub-chips pub-wrap-tabs">
          <button className={`pub-chip ${!filterEnsembleId ? 'active' : ''}`} onClick={() => setFilterEnsembleId('')}>{t('cal.allEnsembles')}</button>
          {ensembles.map(e => (
            <button key={e.id} className={`pub-chip ${filterEnsembleId === e.id ? 'active' : ''}`} onClick={() => setFilterEnsembleId(e.id)}>
              <span className="pub-chip-dot" style={{ background: ensembleColor(e) }} />
              {e.name}
            </button>
          ))}
        </div>
      )}

      {/* Type filter */}
      <div className="pub-filter-row">
        {(['all', 'Rehearsal', 'Concert', 'Event', 'Assignment'] as TypeFilter[]).map(f => (
          <button key={f} className={`pub-filter-btn ${typeFilter === f ? 'active' : ''}`} onClick={() => setTypeFilter(f)}>
            {t(TYPE_LABEL_KEY[f])}
          </button>
        ))}
      </div>

      {view === 'list' ? (
        <div style={{ marginTop: 8 }}>
          {listItems.length === 0 ? (
            <EmptyState icon={<CalendarX size={26} />}>{t('cal.nothingUpcoming')}</EmptyState>
          ) : (
            <>
              {(() => {
                let lastDate = '';
                return listItems.map((item, i) => {
                  const showHeader = item.date !== lastDate;
                  lastDate = item.date;
                  return (
                    <Fragment key={item.kind === 'event' ? item.e.id : item.a.id}>
                      {showHeader && (
                        <div className={`pub-list-datehead${item.date === today ? ' today' : ''}`}>
                          {parseDate(item.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                          {item.date === today && <span className="dir-today-badge">{t('cal.today')}</span>}
                        </div>
                      )}
                      {i === nowIdx && <NowLine />}
                      {item.kind === 'event'
                        ? (
                          <div className={isPast(item.e) ? 'pub-past-dim' : undefined}>
                            <PubEventCard event={item.e} ensembleMap={ensembleMap} piecesById={piecesById} />
                          </div>
                        )
                        : <AssignRow a={item.a} />}
                    </Fragment>
                  );
                });
              })()}
              {nowIdx === listItems.length && <NowLine />}
            </>
          )}
        </div>
      ) : (
      <>
      {/* Month header — directly above the grid it controls */}
      <div className="pub-cal-nav" style={{ marginTop: 4 }}>
        <button className="pub-cal-arrow" onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
        <button
          className="pub-cal-month-btn"
          onClick={() => { const d = parseDate(today); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); setSelectedDate(today); }}
          title="Jump back to today"
        >
          {monthLabel}
        </button>
        <button className="pub-cal-arrow" onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight size={18} /></button>
      </div>

      {/* Calendar grid — same compact grid + swipe as the director side */}
      <div className="dir-cal" {...handlers}>
        <div className="dir-cal-weekdays">
          {WEEKDAYS.map((d, i) => <div key={i} className="dir-cal-weekday">{d}</div>)}
        </div>
        <div className="dir-cal-viewport" ref={viewportRef}>
          <div
            className="dir-cal-grid"
            style={{ transform: `translateX(${dragX}px)`, transition: animating ? 'transform 0.2s ease-out' : 'none' }}
          >
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="dir-cal-cell empty" />;
              const evs = byDate[d] ?? [];
              return (
                <button
                  key={i}
                  className={`dir-cal-cell ${d === selectedDate ? 'selected' : ''} ${d === today ? 'today' : ''}`}
                  onClick={() => setSelectedDate(d)}
                  aria-label={`${parseDate(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${(byDate[d] ?? []).length ? `, ${(byDate[d] ?? []).length} event${(byDate[d] ?? []).length !== 1 ? 's' : ''}` : ', no events'}`}
                  aria-pressed={d === selectedDate}
                >
                  <span className="dir-cal-day">{parseDate(d).getDate()}</span>
                  <span className="dir-cal-dots">
                    {evs.slice(0, 4).map(e => <span key={e.id} className="dir-cal-dot" style={{ background: color(e) }} />)}
                    {(assignByDate[d] ?? []).slice(0, 2).map(a => <span key={a.id} className="dir-cal-dot" style={{ background: ASSIGN_COLOR }} />)}
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
          {selectedDate === today && <span className="dir-today-badge">{t('cal.today')}</span>}
        </div>
        {dayEvents.length === 0 && (assignByDate[selectedDate] ?? []).length === 0 ? (
          <div className="dir-day-empty">{t('cal.nothingScheduled')}</div>
        ) : (
          <>
            {dayEvents.map(e => (
              <PubEventCard key={e.id} event={e} ensembleMap={ensembleMap} piecesById={piecesById} />
            ))}
            {(assignByDate[selectedDate] ?? []).map(a => <AssignRow key={a.id} a={a} />)}
          </>
        )}
      </div>
      </>
      )}

      <div className="pub-subscribe-section">
        <SubscribeButton ensembleId={filterEnsembleId || undefined} />
      </div>
    </div>
  );
}

/** Compact assignment row used on calendar day details and the list view. */
function AssignRow({ a, showDate }: { a: { id: string; title: string; type: string; dueDate: string }; showDate?: boolean }) {
  return (
    <Link to={`/assignments?focus=${a.id}`} className="pub-assign-card pub-assign-link">
      <span className="pub-assign-emoji">{assignmentEmoji(a.type)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="pub-assign-title">{a.title}</div>
        <div className="pub-assign-meta">
          <span className="pub-assign-type">{a.type}</span>
          <span>{t('cal.due')}{showDate ? ` ${parseDate(a.dueDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}` : ' this day'}</span>
        </div>
      </div>
    </Link>
  );
}
