import { useState, useMemo, useEffect, Fragment, useRef, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router';
import { ChevronLeft, ChevronRight, LayoutList, Grid3x3, CalendarX } from 'lucide-react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { usePublicEvents } from './hooks/usePublicEvents';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { useAssignments } from '../director/hooks/useAssignments';
import { useMinuteTick } from '../director/hooks/useAnnouncements';
import { todayStr, toDateStr, parseDate, ensembleColor, ensembleDisplayName, assignmentEmoji, musicEnsembles, isPublished, CONCERT_COLOR, ASSIGN_COLOR } from '../director/utils';
import { FilterMenu } from '../shared/FilterMenu';
import { PubEventCard } from './components/PubEventCard';
import { PageHeader, EmptyState } from './components/PageHeader';
import { NowLine, nowLineIndex, usePastDimming } from './components/NowLine';
import { SubscribeButton } from './components/SubscribeButton';
import { useMonthSwipe } from '../shared/useMonthSwipe';
import { t, tn, useLang, getLang } from '../shared/i18n';
import { dailyPun, say, fridayFinaleEmpty, emptyDayHoldLine, daCapoTodayLine, codaFoundLine, alreadyFfLine } from '../shared/whimsy';
import { useEggCheer, useTapN } from '../shared/useEggCheer';
import { NoteBurst } from '../shared/NoteBurst';
import { fmtDayHeader, fmtLongDate, fmtMonthYear, fmtShortDate, weekdayInitials } from '../shared/dates';
import type { CalendarEvent } from '../director/types';

// The type-filter buckets. Sectionals fold into "Rehearsals"; everything else
// is its own bucket. Empty selection === show all. Assignments are a parallel
// stream (due dates), handled separately below.
type TypeKey = 'Rehearsal' | 'Class' | 'Concert' | 'Event' | 'Assignment';

const TYPE_OPTIONS: { value: TypeKey; labelKey: string; color: string }[] = [
  { value: 'Rehearsal', labelKey: 'cal.rehearsals', color: '#2563eb' },
  { value: 'Class',      labelKey: 'cal.classes',    color: '#0f766e' },
  { value: 'Concert',    labelKey: 'cal.concerts',   color: CONCERT_COLOR },
  { value: 'Event',      labelKey: 'cal.events',     color: '#64748b' },
  { value: 'Assignment', labelKey: 'cal.assignments', color: ASSIGN_COLOR },
];

/** Which type bucket an event falls into (Sectional → Rehearsal). */
function eventTypeKey(t: CalendarEvent['type']): Exclude<TypeKey, 'Assignment'> {
  if (t === 'Sectional' || t === 'Rehearsal') return 'Rehearsal';
  if (t === 'Class') return 'Class';
  if (t === 'Concert') return 'Concert';
  return 'Event';
}

/** Empty `keys` = no type filter (show all). */
function matchesTypes(e: CalendarEvent, keys: TypeKey[]): boolean {
  if (keys.length === 0) return true;
  return keys.includes(eventTypeKey(e.type));
}

export function PublicCalendar() {
  useLang(); // re-render labels on EN/ES switch
  const { ensembles } = useEnsembles();
  const { events, ensureMonth } = usePublicEvents();
  const { pieces } = useRepertoire();
  const { assignments } = useAssignments();
  const now = useMinuteTick(); // a scheduled assignment appears the minute it publishes
  const [searchParams, setSearchParams] = useSearchParams();

  const [cursor, setCursor] = useState(() => {
    const d = parseDate(todayStr());
    d.setDate(1);
    return d;
  });
  const [selectedDate, setSelectedDate] = useState(todayStr);
  // Multi-select filters: several ensembles AND several types at once (e.g.
  // Symphony + Camerata, showing Rehearsals + Concerts). Empty === all.
  const [filterEnsembleIds, setFilterEnsembleIds] = useState<string[]>(
    () => (searchParams.get('ensemble') ?? '').split(',').map(s => s.trim()).filter(Boolean),
  );
  const [typeFilters, setTypeFilters] = useState<TypeKey[]>([]);
  const [view, setView] = useState<'month' | 'list'>('month');
  const { cheer, show } = useEggCheer();
  const filterSeq = useRef<string[]>([]);
  const pinchStart = useRef<number | null>(null);

  const noteFilter = useCallback((kind: 'ens' | 'type') => {
    const seq = filterSeq.current;
    seq.push(kind);
    if (seq.length > 4) seq.shift();
    if (seq.join(',') === 'ens,type,ens,type') {
      seq.length = 0;
      show(codaFoundLine(getLang()));
    }
  }, [show]);

  const onMonthTitleTap = useTapN(2, 800, () => show(daCapoTodayLine(getLang())));

  function jumpMonthToToday() {
    const d = parseDate(todayStr());
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelectedDate(todayStr());
    onMonthTitleTap();
  }

  // Only a window around today is live (#reads) — paging to another month
  // pulls that month once, so the whole year is still browsable.
  useEffect(() => { ensureMonth(cursor); }, [cursor, ensureMonth]);

  // Keep the ?ensemble= deep-link (comma-separated) in sync with the chosen
  // ensembles, so a filtered calendar is shareable and survives reload.
  useEffect(() => {
    const current = searchParams.get('ensemble') ?? '';
    const wanted = filterEnsembleIds.join(',');
    if (current !== wanted) {
      const next = new URLSearchParams(searchParams);
      if (wanted) next.set('ensemble', wanted);
      else next.delete('ensemble');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterEnsembleIds]);

  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);
  const piecesById = useMemo(() => Object.fromEntries(pieces.map(p => [p.id, p])), [pieces]);

  // School-wide events (ensembleIds: []) are always visible regardless of the
  // ensemble filter; the type filter still applies to them.
  const visible = events.filter(e =>
    (filterEnsembleIds.length === 0 || e.ensembleIds.length === 0 || e.ensembleIds.some(id => filterEnsembleIds.includes(id)))
    && matchesTypes(e, typeFilters),
  );

  const upcoming = useMemo(
    () => [...visible].filter(e => e.date >= todayStr()).sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '99').localeCompare(b.startTime ?? '99')),
    [visible],
  );

  // Assignments as a parallel calendar stream (due dates). Shown when no type
  // filter is set, or when "Assignments" is one of the chosen types.
  const visibleAssignments = useMemo(() => {
    if (typeFilters.length > 0 && !typeFilters.includes('Assignment')) return [];
    return assignments.filter(a =>
      isPublished(a, now) && (filterEnsembleIds.length === 0 || a.ensembleIds.some(id => filterEnsembleIds.includes(id))));
  }, [assignments, filterEnsembleIds, typeFilters, now]);
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
  const monthLabel = fmtMonthYear(cursor);
  const weekdays = weekdayInitials();
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

      {/* Filters — multi-select menus: pick several ensembles AND several
          types at once (e.g. Symphony + Camerata → Rehearsals + Concerts). */}
      <div className="pub-filter-selects">
        <FilterMenu
          prefix="pub"
          allLabel={t('nav.allEnsembles')}
          ariaLabel={t('nav.ensembles')}
          options={musicEnsembles([...ensembles].sort((a, b) => a.order - b.order)).map(e => ({ value: e.id, label: ensembleDisplayName(e), color: ensembleColor(e) }))}
          selected={filterEnsembleIds}
          onChange={next => { setFilterEnsembleIds(next); noteFilter('ens'); }}
        />
        <FilterMenu
          prefix="pub"
          allLabel={t('cal.allTypes')}
          ariaLabel={t('cal.filterTypes')}
          options={TYPE_OPTIONS.map(o => ({ value: o.value, label: t(o.labelKey), color: o.color }))}
          selected={typeFilters}
          onChange={next => { setTypeFilters(next as TypeKey[]); noteFilter('type'); }}
        />
      </div>

      <div className="pub-subscribe-section">
        <SubscribeButton ensembleId={filterEnsembleIds.length === 1 ? filterEnsembleIds[0] : undefined} />
      </div>

      {view === 'list' ? (
        <div style={{ marginTop: 8 }}>
          {listItems.length === 0 ? (
            <EmptyState icon={<CalendarX size={26} />}>
              {t('cal.nothingUpcoming')} {fridayFinaleEmpty(getLang()) ?? say(dailyPun('cal-list'), getLang())}
            </EmptyState>
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
                          {fmtDayHeader(item.date)}
                          {item.date === today && <span className="pub-today-badge">{t('cal.today')}</span>}
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
          onClick={jumpMonthToToday}
          title={t('cal.jumpToday')}
        >
          {monthLabel}
        </button>
        <button className="pub-cal-arrow" onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight size={18} /></button>
      </div>

      {/* Calendar grid — same compact grid + swipe as the rest of the public app */}
      <div
        className="pub-cal"
        {...handlers}
        onTouchStart={e => {
          handlers.onTouchStart(e);
          if (e.touches.length === 2) {
            const [a, b] = [e.touches[0], e.touches[1]];
            pinchStart.current = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          }
        }}
        onTouchMove={e => {
          handlers.onTouchMove(e);
          if (e.touches.length !== 2 || pinchStart.current == null) return;
          const [a, b] = [e.touches[0], e.touches[1]];
          const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          if (dist / pinchStart.current > 1.35) {
            pinchStart.current = null;
            show(alreadyFfLine(getLang()));
          }
        }}
        onTouchEnd={e => {
          handlers.onTouchEnd(e);
          pinchStart.current = null;
        }}
      >
        <div className="pub-cal-weekdays">
          {weekdays.map((d, i) => <div key={i}>{d}</div>)}
        </div>
        <div className="pub-cal-swipe-viewport" ref={viewportRef} style={{ overflow: 'hidden' }}>
          <div
            className="pub-cal-grid"
            style={{ transform: `translateX(${dragX}px)`, transition: animating ? 'transform 0.2s ease-out' : 'none' }}
          >
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="pub-cal-cell empty" />;
              const evs = byDate[d] ?? [];
              return (
                <button
                  key={i}
                  className={`pub-cal-cell ${d === selectedDate ? 'selected' : ''} ${d === today ? 'today' : ''}`}
                  onClick={() => setSelectedDate(d)}
                  aria-label={`${fmtLongDate(d)}, ${evs.length ? tn('cal.eventCount', evs.length) : t('cal.noEvents')}`}
                  aria-pressed={d === selectedDate}
                >
                  <span className="pub-cal-day">{parseDate(d).getDate()}</span>
                  <span className="pub-cal-dots">
                    {evs.slice(0, 4).map(e => <span key={e.id} className="pub-cal-dot" style={{ background: color(e) }} />)}
                    {(assignByDate[d] ?? []).slice(0, 2).map(a => <span key={a.id} className="pub-cal-dot" style={{ background: ASSIGN_COLOR }} />)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected-day detail */}
      <div className="pub-day-detail">
        <h3 className="pub-section-title pub-day-detail-header">
          {fmtLongDate(selectedDate)}
          {selectedDate === today && <span className="pub-today-badge">{t('cal.today')}</span>}
        </h3>
        {dayEvents.length === 0 && (assignByDate[selectedDate] ?? []).length === 0 ? (
          <div
            className="pub-muted"
            onContextMenu={e => e.preventDefault()}
            onPointerDown={e => {
              // Long-press empty day → tacet line (#easter-eggs).
              const id = window.setTimeout(() => {
                show(emptyDayHoldLine(fmtLongDate(selectedDate), getLang()));
              }, 550);
              const clear = () => window.clearTimeout(id);
              e.currentTarget.addEventListener('pointerup', clear, { once: true });
              e.currentTarget.addEventListener('pointerleave', clear, { once: true });
            }}
          >
            {t('cal.nothingScheduled')} {say(dailyPun('cal-day'), getLang())}
          </div>
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
      <NoteBurst cheer={cheer} />
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
          <span>{showDate ? `${t('cal.due')} ${fmtShortDate(a.dueDate)}` : t('cal.dueThisDay')}</span>
        </div>
      </div>
    </Link>
  );
}
