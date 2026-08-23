import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowLeftRight, Clock3, MapPin, XCircle, RotateCcw, Grid3x3, CalendarDays, List, Users, UserCog, Pencil, Merge } from 'lucide-react';
import { useEvents } from '../hooks/useEvents';
import { useEnsembles } from '../hooks/useEnsembles';
import { useAnnouncements } from '../hooks/useAnnouncements';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { useStudents } from '../hooks/useStudents';
import { todayStr, addDays, parseDate, toDateStr, formatTime, formatTimeRange, ensembleColor, addMinutesToTime, TIME_BLOCKS, CONCERT_COLOR } from '../utils';
import { sharedBlockLabel } from '../../shared/sharedBlock';
import { bannersForEvents, announceChange, captureOriginal, combineSnapshot } from './changeOps';
import { ScheduleChangeView } from '../schedule-changes/ScheduleChangeView';
import type { CalendarEvent, Ensemble } from '../types';
import type { DirNavigate } from '../types-nav';

/**
 * Schedule Changes — everything that's different about a day, in one place
 * (#schedule-ux-redesign Phase 1). Per block: swap, shift, move rooms, cancel,
 * or move a student (which routes into the existing roster-override flow).
 * The Students tab is the by-student picker that used to be its own
 * "Temporary Roster Changes" menu item. Every ensemble-time change stamps a
 * change note (drives the public red banner) and can post an urgent
 * announcement (in-app banner). A per-row "Revert to normal" restores the
 * original schedule and clears both.
 */
export function ScheduleSwapView({ initialDate, onNavigate }: {
  initialDate?: string;
  onNavigate: DirNavigate;
}) {
  const { events, updateEvent, deleteEvent, revertEvent } = useEvents();
  const { ensembles } = useEnsembles();
  const announcementApi = useAnnouncements();
  const { announcements, deleteAnnouncement } = announcementApi;

  const [date, setDate] = useState(initialDate ?? todayStr());
  // Pick-mode: tapping blocks to swap (exactly two) or combine (host first,
  // then any number of blocks to absorb). One grammar for both (#2.3).
  const [pick, setPick] = useState<{ mode: 'swap' | 'combine'; ids: string[] } | null>(null);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [menuFor, setMenuFor] = useState<CalendarEvent | null>(null);
  const [cancelling, setCancelling] = useState<CalendarEvent | null>(null);
  // "Move a student" on a block: embed the existing roster-change flow,
  // landed directly on that block's expected roster.
  const [studentFlowEventId, setStudentFlowEventId] = useState<string | null>(null);
  const [confirmSwap, setConfirmSwap] = useState(false);
  const [confirmCombine, setConfirmCombine] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Deep-linked with a date (from the calendar / Today): open on that day.
  const [view, setView] = useState<'day' | 'list' | 'month' | 'students'>(initialDate ? 'day' : 'month');

  const today = todayStr();
  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);
  const dayEvents = useMemo(
    () => events
      .filter(e => e.date === date && e.ensembleIds.length > 0)
      .sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99')),
    [events, date],
  );
  const dateLabel = parseDate(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const label = (e: CalendarEvent) =>
    e.title || e.ensembleIds.map(id => ensembleMap[id]?.name).filter(Boolean).join(' + ') || e.type;

  const announce = (title: string, evts: CalendarEvent[]) =>
    announceChange(announcementApi, date, title, evts, evts.map(label));

  function togglePick(id: string, mode: 'swap' | 'combine' = 'swap') {
    setPick(p => {
      const cur = p?.mode === mode ? p.ids : [];
      const ids = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
      if (ids.length === 0) return null;
      return { mode, ids: mode === 'swap' ? ids.slice(-2) : ids };
    });
  }

  const picked = (pick?.ids ?? []).map(id => dayEvents.find(e => e.id === id)).filter(Boolean) as CalendarEvent[];
  const [a, b] = pick?.mode === 'swap' ? picked : [];

  /** "Wind Ensemble + Symphony Orchestra" for the blocks being combined. */
  const combinedLabel = (evts: CalendarEvent[]) =>
    sharedBlockLabel(
      [...new Set(evts.flatMap(e => e.ensembleIds))].map(id => ensembleMap[id]?.name).filter(Boolean) as string[],
      { total: ensembles.length },
    );

  async function applySwap(notify: boolean) {
    if (!a || !b) return;
    setBusy(true); setError('');
    try {
      const noteA = `Block swap — now ${formatTimeRange(b.startTime, b.endTime)}${b.location && b.location !== a.location ? ` in ${b.location}` : ''}`;
      const noteB = `Block swap — now ${formatTimeRange(a.startTime, a.endTime)}${a.location && a.location !== b.location ? ` in ${a.location}` : ''}`;
      await updateEvent(a.id, { startTime: b.startTime, endTime: b.endTime, location: b.location, changeNote: noteA, ...captureOriginal(a) });
      await updateEvent(b.id, { startTime: a.startTime, endTime: a.endTime, location: a.location, changeNote: noteB, ...captureOriginal(b) });
      if (notify) {
        const annId = await announce(
          `Block swap ${parseDate(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}: ` +
          `${label(a)} now ${formatTime(b.startTime)}, ${label(b)} now ${formatTime(a.startTime)}`,
          [a, b],
        );
        if (annId) {
          await updateEvent(a.id, { changeAnnouncementId: annId });
          await updateEvent(b.id, { changeAnnouncementId: annId });
        }
      }
      setPick(null);
      setConfirmSwap(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the swap — try again.');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Combine (#schedule-ux-redesign §2.3): the first-picked block hosts —
   * it takes the union of ensembles, `sharedBlock: true`, and the chosen
   * time/room; the other block(s) are absorbed (deleted, with full copies in
   * the host's snapshot so revert re-creates them under their original doc
   * ids). One banner, worded as a where/when change so the absorbed
   * ensemble's families read it as "we meet there, with them" — not a cancel.
   */
  async function applyCombine(opts: { startTime?: string; endTime?: string; location?: string; notify: boolean }) {
    const [host, ...absorbed] = picked;
    if (!host || absorbed.length === 0) return;
    setBusy(true); setError('');
    try {
      const group = combinedLabel(picked);
      const where = opts.location?.trim() || undefined;
      const bits = [
        opts.startTime ? `${formatTime(opts.startTime)}` : '',
        where ? `in ${where}` : '',
      ].filter(Boolean).join(' ');
      await updateEvent(host.id, {
        ensembleIds: [...new Set(picked.flatMap(e => e.ensembleIds))],
        sharedBlock: true,
        startTime: opts.startTime,
        endTime: opts.endTime,
        location: where,
        changeNote: `Combined rehearsal — ${group}${bits ? `, ${bits}` : ''}`,
        changeFrom: combineSnapshot(host, absorbed),
      });
      for (const e of absorbed) await deleteEvent(e.id, { undoable: false });
      if (opts.notify) {
        const when = parseDate(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const annId = await announce(`${group} combined rehearsal ${when}${bits ? `: ${bits}` : ''}`, picked);
        if (annId) await updateEvent(host.id, { changeAnnouncementId: annId });
      }
      setPick(null);
      setConfirmCombine(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not combine the blocks — try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRevert(e: CalendarEvent) {
    setBusy(true); setError('');
    try {
      // Pull down EVERY banner for this event, not just the linked one —
      // an event changed more than once (before one-banner-per-event) can
      // have several, and leaving strays up is what families complain about.
      const strays = bannersForEvents(announcements, [e], [label(e)], date);
      const annId = await revertEvent(e.id);
      const gone = new Set<string>();
      for (const s of strays) { await deleteAnnouncement(s.id); gone.add(s.id); }
      if (annId && !gone.has(annId)) await deleteAnnouncement(annId);
      setPick(p => {
        if (!p) return p;
        const ids = p.ids.filter(x => x !== e.id);
        return ids.length > 0 ? { ...p, ids } : null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revert — try again.');
    } finally {
      setBusy(false);
    }
  }

  // "Move a student" from a block's Change menu: hand over to the existing
  // roster-change flow (the same machinery the old Temporary Roster Changes
  // screen used), opened straight onto that block's expected roster.
  if (studentFlowEventId) {
    return (
      <div className="dir-tab-page">
        <button className="dir-drawer-back" style={{ margin: '8px 16px 0' }} onClick={() => setStudentFlowEventId(null)}>
          <ChevronLeft size={18} /> Back to schedule changes
        </button>
        <ScheduleChangeView
          initialMode="date"
          initialDate={date}
          initialEventId={studentFlowEventId}
          onNavigate={onNavigate}
        />
      </div>
    );
  }

  return (
    <div className="dir-tab-page">
      <div className="dir-mode-toggle">
        <button className={`dir-segment-btn ${view === 'day' ? 'active' : ''}`} onClick={() => setView('day')}>
          <CalendarDays size={14} style={{ verticalAlign: '-2px' }} /> Day
        </button>
        <button className={`dir-segment-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>
          <List size={14} style={{ verticalAlign: '-2px' }} /> List
        </button>
        <button className={`dir-segment-btn ${view === 'month' ? 'active' : ''}`} onClick={() => setView('month')}>
          <Grid3x3 size={14} style={{ verticalAlign: '-2px' }} /> Month
        </button>
        <button className={`dir-segment-btn ${view === 'students' ? 'active' : ''}`} onClick={() => setView('students')}>
          <Users size={14} style={{ verticalAlign: '-2px' }} /> Students
        </button>
      </div>

      {view === 'students' ? (
        <ScheduleChangeView onNavigate={onNavigate} />
      ) : view === 'month' ? (
        <SwapMonth date={date} events={events} ensembleMap={ensembleMap} onPick={d => { setDate(d); setView('day'); }} />
      ) : view === 'list' ? (
        <SwapList events={events} ensembleMap={ensembleMap} onPick={d => { setDate(d); setView('day'); }} />
      ) : (
      <>
      <div className="dir-cal-nav">
        <button className="dir-date-nav-btn" onClick={() => setDate(d => addDays(d, -1))} aria-label="Previous day">
          <ChevronLeft size={18} />
        </button>
        <button className="dir-cal-month" onClick={() => setDate(today)} title="Jump back to today">
          {dateLabel}{date === today && <span className="dir-today-badge">Today</span>}
        </button>
        <button className="dir-date-nav-btn" onClick={() => setDate(d => addDays(d, 1))} aria-label="Next day">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="dir-page-body">
        <div className="dir-field-hint">
          Everything different about this day starts here — tap <strong>Change</strong> on a block
          to swap, shift, move rooms, cancel, or move a student.
          Families see a red “Schedule change” banner automatically.
        </div>

        {dayEvents.length === 0 ? (
          <div className="dir-empty-inline">
            No ensemble events this day.
            <button className="dir-btn dir-btn-ghost dir-sc-small" style={{ marginLeft: 8 }} onClick={() => onNavigate('schedule', { date })}>
              Open schedule
            </button>
          </div>
        ) : (
          <>
            {pick && (
              <div className="dir-att-summary" style={{ borderRadius: 10 }}>
                {pick.mode === 'swap' ? (
                  picked.length < 2
                    ? 'Pick the second block to swap with.'
                    : <>Swapping <strong>{a && label(a)}</strong> ↔ <strong>{b && label(b)}</strong></>
                ) : (
                  picked.length < 2
                    ? 'Pick the block(s) to combine with.'
                    : <>Combining <strong>{picked.map(label).join(' + ')}</strong></>
                )}
                {pick.mode === 'swap' && picked.length === 2 && (
                  <button className="dir-btn dir-btn-primary dir-sc-small" style={{ marginLeft: 10 }} onClick={() => setConfirmSwap(true)}>
                    <ArrowLeftRight size={14} /> Review swap
                  </button>
                )}
                {pick.mode === 'combine' && picked.length >= 2 && (
                  <button className="dir-btn dir-btn-primary dir-sc-small" style={{ marginLeft: 10 }} onClick={() => setConfirmCombine(true)}>
                    <Merge size={14} /> Review combine
                  </button>
                )}
                <button className="dir-link-btn" style={{ marginLeft: 10 }} onClick={() => setPick(null)}>Clear</button>
              </div>
            )}

            {dayEvents.map(e => (
              <div key={e.id} className={`dir-ens-row ${pick?.ids.includes(e.id) ? 'dir-swap-picked' : ''}`}>
                <span className="dir-ens-swatch" style={{ background: e.type === 'Concert' ? CONCERT_COLOR : ensembleColor(ensembleMap[e.ensembleIds[0]]) }} />
                <div className="dir-ens-info">
                  <div className="dir-ens-name">
                    {label(e)}
                    {e.status === 'Cancelled' && <span className="dir-status-badge absent" style={{ marginLeft: 8 }}>Cancelled</span>}
                  </div>
                  <div className="dir-ens-sub">
                    {formatTimeRange(e.startTime, e.endTime) || 'No time set'}
                    {e.location ? ` · ${e.location}` : ''}
                    {e.changeNote ? ` · ⚠ ${e.changeNote}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {(e.changeNote || e.changeFrom || e.status === 'Cancelled') && (
                    <button
                      className="dir-tool-btn"
                      style={{ color: 'var(--dir-blue)' }}
                      disabled={busy}
                      onClick={() => handleRevert(e)}
                      title="Put this back to its normal schedule and clear the change banner"
                    >
                      <RotateCcw size={14} /> Revert
                    </button>
                  )}
                  {pick ? (
                    // Mid-pick: the row's one job is picking the other block(s).
                    <button
                      className={`dir-tool-btn ${pick.ids.includes(e.id) ? 'active' : ''}`}
                      onClick={() => togglePick(e.id, pick.mode)}
                      title={pick.mode === 'swap'
                        ? 'Select this and one other block to trade times'
                        : 'Add this block to the combined rehearsal'}
                    >
                      {pick.mode === 'swap' ? <><ArrowLeftRight size={14} /> Swap</> : <><Merge size={14} /> Combine</>}
                    </button>
                  ) : (
                    <button className="dir-tool-btn" onClick={() => setMenuFor(e)} title="Swap, shift, move rooms, cancel, or move a student">
                      <Pencil size={14} /> Change ▾
                    </button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
        {error && <div className="dir-sc-error">⚠ {error}</div>}
      </div>
      </>
      )}

      {menuFor && (
        <ChangeMenu
          event={menuFor}
          name={label(menuFor)}
          onClose={() => setMenuFor(null)}
          onTimeRoom={() => { setEditing(menuFor); setMenuFor(null); }}
          onCancel={() => { setCancelling(menuFor); setMenuFor(null); }}
          onSwap={() => { togglePick(menuFor.id); setMenuFor(null); }}
          onCombine={() => { setPick({ mode: 'combine', ids: [menuFor.id] }); setMenuFor(null); }}
          onStudent={() => { setStudentFlowEventId(menuFor.id); setMenuFor(null); }}
        />
      )}

      {confirmCombine && picked.length >= 2 && (
        <CombineSheet
          events={picked}
          labelOf={label}
          groupLabel={combinedLabel(picked)}
          date={date}
          busy={busy}
          onConfirm={applyCombine}
          onClose={() => setConfirmCombine(false)}
        />
      )}

      {cancelling && (
        <CancelSheet
          event={cancelling}
          name={label(cancelling)}
          onApply={async (data, notifyTitle) => {
            await updateEvent(cancelling.id, { ...data, ...captureOriginal(cancelling) });
            if (notifyTitle) {
              const annId = await announce(notifyTitle, [cancelling]);
              if (annId) await updateEvent(cancelling.id, { changeAnnouncementId: annId });
            }
          }}
          onClose={() => setCancelling(null)}
        />
      )}

      {confirmSwap && a && b && (
        <SwapConfirm
          a={a} b={b} labelA={label(a)} labelB={label(b)} busy={busy}
          onConfirm={applySwap}
          onClose={() => setConfirmSwap(false)}
        />
      )}

      {editing && (
        <TimeChangeSheet
          event={editing}
          name={label(editing)}
          onApply={async (data, notifyTitle) => {
            await updateEvent(editing.id, { ...data, ...captureOriginal(editing) });
            if (notifyTitle) {
              const annId = await announce(notifyTitle, [editing]);
              if (annId) await updateEvent(editing.id, { changeAnnouncementId: annId });
            }
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** List view: every ensemble event on the calendar, grouped by day (past and
 *  future). Tap any day to open it in the day view. */
function SwapList({ events, ensembleMap, onPick }: {
  events: CalendarEvent[];
  ensembleMap: Record<string, Ensemble | undefined>;
  onPick: (date: string) => void;
}) {
  const today = todayStr();
  const byDate = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      if (e.ensembleIds.length === 0) continue;
      const list = m.get(e.date) ?? [];
      list.push(e);
      m.set(e.date, list);
    }
    for (const list of m.values()) list.sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [events]);

  if (byDate.length === 0) {
    return <div className="dir-empty-inline">No ensemble events on the calendar.</div>;
  }
  return (
    <div className="dir-page-body">
      <div className="dir-field-hint">All ensemble events — tap a day to open it and make a change.</div>
      {byDate.map(([d, dayEvents]) => (
        <button key={d} className="dir-ens-row dir-sc-pick" onClick={() => onPick(d)}>
          <div className="dir-ens-info">
            <div className="dir-ens-name">
              {parseDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              {d === today && <span className="dir-today-badge" style={{ marginLeft: 8 }}>Today</span>}
            </div>
            {dayEvents.map(e => (
              <div key={e.id} className="dir-ens-sub">
                <span className="dir-cal-dot" style={{ display: 'inline-block', background: e.type === 'Concert' ? CONCERT_COLOR : ensembleColor(ensembleMap[e.ensembleIds[0]]), marginRight: 6 }} />
                {e.title || e.ensembleIds.map(id => ensembleMap[id]?.name).filter(Boolean).join(' + ') || e.type}
                {' · '}{formatTimeRange(e.startTime, e.endTime) || 'No time set'}
                {e.status === 'Cancelled' ? ' · Cancelled' : ''}
                {e.changeNote ? ` · ⚠ ${e.changeNote}` : ''}
              </div>
            ))}
          </div>
          <ChevronRight size={16} style={{ flexShrink: 0, opacity: 0.5 }} />
        </button>
      ))}
    </div>
  );
}

/** Full-month overview: see every day's ensemble events at a glance; tap a day
 *  to open it in the day view and swap/change its blocks. */
function SwapMonth({ date, events, ensembleMap, onPick }: {
  date: string;
  events: CalendarEvent[];
  ensembleMap: Record<string, Ensemble | undefined>;
  onPick: (date: string) => void;
}) {
  const [cursor, setCursor] = useState(() => { const d = parseDate(date); d.setDate(1); return d; });
  const y = cursor.getFullYear();
  const mo = cursor.getMonth();
  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const today = todayStr();

  const cells = useMemo(() => {
    const firstWd = new Date(y, mo, 1).getDay();
    const days = new Date(y, mo + 1, 0).getDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < firstWd; i++) out.push(null);
    for (let d = 1; d <= days; d++) out.push(toDateStr(new Date(y, mo, d)));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [y, mo]);

  const byDate = useMemo(() => {
    const m: Record<string, CalendarEvent[]> = {};
    for (const e of events) if (e.ensembleIds.length > 0) (m[e.date] ??= []).push(e);
    return m;
  }, [events]);

  return (
    <div className="dir-cal">
      <div className="dir-cal-nav">
        <button className="dir-date-nav-btn" onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))} aria-label="Previous month">
          <ChevronLeft size={18} />
        </button>
        <span className="dir-cal-month">{monthLabel}</span>
        <button className="dir-date-nav-btn" onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))} aria-label="Next month">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="dir-cal-weekdays">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} className="dir-cal-weekday">{d}</div>)}
      </div>
      <div className="dir-cal-grid">
        {cells.map((d, i) => d === null ? (
          <div key={i} className="dir-cal-cell empty" />
        ) : (
          <button
            key={i}
            className={`dir-cal-cell ${d === date ? 'selected' : ''} ${d === today ? 'today' : ''}`}
            onClick={() => onPick(d)}
            aria-label={`${parseDate(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${(byDate[d] ?? []).length ? `, ${(byDate[d] ?? []).length} event(s)` : ''}`}
          >
            <span className="dir-cal-day">{parseDate(d).getDate()}</span>
            <span className="dir-cal-dots">
              {(byDate[d] ?? []).slice(0, 4).map(e => (
                <span key={e.id} className="dir-cal-dot" style={{ background: e.type === 'Concert' ? CONCERT_COLOR : ensembleColor(ensembleMap[e.ensembleIds[0]]) }} />
              ))}
            </span>
          </button>
        ))}
      </div>
      <div className="dir-field-hint" style={{ padding: '10px 16px' }}>Tap a day to open it and swap or change its blocks.</div>
    </div>
  );
}

/**
 * One block's whole change vocabulary in one sheet — the director's verbs,
 * not the data model's (#schedule-ux-redesign). Time/room and cancel mutate
 * this event; swap enters the pick-two flow; move-a-student hands off to the
 * roster-override machinery.
 */
function ChangeMenu({ event, name, onClose, onTimeRoom, onCancel, onSwap, onCombine, onStudent }: {
  event: CalendarEvent;
  name: string;
  onClose: () => void;
  onTimeRoom: () => void;
  onCancel: () => void;
  onSwap: () => void;
  onCombine: () => void;
  onStudent: () => void;
}) {
  const cancelled = event.status === 'Cancelled';
  const items: { icon: React.ReactNode; title: string; sub: string; run: () => void; danger?: boolean }[] = [
    { icon: <Clock3 size={16} />, title: 'Move time or room…', sub: 'Shift this block, or put it somewhere else', run: onTimeRoom },
    { icon: <ArrowLeftRight size={16} />, title: 'Swap with another block…', sub: 'Trade times (and rooms) with another block this day', run: onSwap },
    { icon: <Merge size={16} />, title: 'Combine with another block…', sub: 'Meet together — one room, one downbeat, roll still per ensemble', run: onCombine },
    cancelled
      ? { icon: <RotateCcw size={16} />, title: 'Un-cancel…', sub: 'Put it back on as originally scheduled', run: onCancel }
      : { icon: <XCircle size={16} />, title: `Cancel this ${event.type.toLowerCase()}…`, sub: 'Families can be told automatically', run: onCancel, danger: true },
    { icon: <UserCog size={16} />, title: 'Move a student…', sub: 'Lesson pull-out, sub, or a day with another ensemble', run: onStudent },
  ];
  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">{name}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-field-hint" style={{ marginBottom: 8 }}>
            {parseDate(event.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            {formatTimeRange(event.startTime, event.endTime) ? ` · ${formatTimeRange(event.startTime, event.endTime)}` : ''}
            {event.location ? ` · ${event.location}` : ''}
          </div>
          {items.map(it => (
            <button key={it.title} className="dir-ens-row dir-sc-pick" onClick={it.run}>
              <div className="dir-ens-info">
                <div className="dir-ens-name" style={it.danger ? { color: 'var(--dir-danger)' } : undefined}>
                  {it.icon} {it.title}
                </div>
                <div className="dir-ens-sub">{it.sub}</div>
              </div>
              <ChevronRight size={16} style={{ flexShrink: 0, opacity: 0.5 }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Confirm a cancel (or un-cancel) with the notify choice — same snapshot,
 *  note, and banner path as every other change on this screen. */
function CancelSheet({ event, name, onApply, onClose }: {
  event: CalendarEvent;
  name: string;
  onApply: (data: Partial<Omit<CalendarEvent, 'id'>>, notifyTitle?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancelled = event.status === 'Cancelled';
  const when = parseDate(event.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  async function run() {
    setBusy(true); setError('');
    try {
      if (cancelled) {
        await onApply(
          { status: 'Scheduled', changeNote: 'Back on — as originally scheduled' },
          notify ? `${name}: back ON ${when} — as originally scheduled` : undefined,
        );
      } else {
        await onApply(
          { status: 'Cancelled', changeNote: 'Cancelled' },
          notify ? `🚫 ${name}: CANCELLED ${when}` : undefined,
        );
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save — try again.');
      setBusy(false);
    }
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">
            {cancelled ? <RotateCcw size={16} style={{ verticalAlign: '-2px' }} /> : <XCircle size={16} style={{ verticalAlign: '-2px' }} />}
            {' '}{cancelled ? 'Un-cancel' : 'Cancel'} {event.type.toLowerCase()}
          </span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-sc-summary">
            <strong>{name}</strong> {cancelled ? 'goes back on' : 'is cancelled for'} {when}
            {formatTimeRange(event.startTime, event.endTime) ? ` (${formatTimeRange(event.startTime, event.endTime)})` : ''}.
          </div>
          <label className="pub-parent-toggle" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} />
            Post an urgent announcement (shows a banner on the calendar)
          </label>
          {error && <div className="dir-sc-error">⚠ {error}</div>}
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose}>Keep as is</button>
          <button className={`dir-btn ${cancelled ? 'dir-btn-primary' : 'dir-btn-danger'}`} disabled={busy} onClick={run}>
            {busy ? 'Saving…' : cancelled ? 'Put it back on' : `Cancel the ${event.type.toLowerCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Confirm a combine (#schedule-ux-redesign §2.3): choose which block's time
 * slot (or custom), the room, and whether to notify. Also surfaces the §4.2
 * guards before saving — roll already taken on a block being absorbed, and
 * event-scoped roster moves that will stop applying once that block is gone.
 */
function CombineSheet({ events, labelOf, groupLabel, date, busy, onConfirm, onClose }: {
  events: CalendarEvent[]; // host first, then the block(s) being absorbed
  labelOf: (e: CalendarEvent) => string;
  groupLabel: string;
  date: string;
  busy: boolean;
  onConfirm: (opts: { startTime?: string; endTime?: string; location?: string; notify: boolean }) => void;
  onClose: () => void;
}) {
  const [host] = events;
  const absorbed = events.slice(1);
  const slots = useMemo(() => {
    const seen = new Set<string>();
    const out: { key: string; start: string; end?: string; owner: string }[] = [];
    for (const e of events) {
      const key = `${e.startTime}|${e.endTime ?? ''}`;
      if (!e.startTime || seen.has(key)) continue;
      seen.add(key);
      out.push({ key, start: e.startTime, end: e.endTime, owner: labelOf(e) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  const [slotKey, setSlotKey] = useState(slots[0]?.key ?? 'custom');
  const [customStart, setCustomStart] = useState(host.startTime ?? '');
  const [customEnd, setCustomEnd] = useState(host.endTime ?? '');
  const [room, setRoom] = useState(host.location ?? '');
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState('');

  // §4.2 guards. Roll receipts live on the event (`rollTaken`); event-scoped
  // overrides pointing at an absorbed block stop applying once it's deleted.
  const { overrides } = useRosterOverrides();
  const { students } = useStudents();
  const rolled = absorbed.filter(e => Object.keys(e.rollTaken ?? {}).length > 0);
  const absorbedIds = new Set(absorbed.map(e => e.id));
  const stranded = overrides.filter(o => o.scope === 'event' && !!o.eventId && absorbedIds.has(o.eventId));
  const studentName = (id: string) => students.find(s => s.id === id)?.name ?? 'A student';
  const overrideWord = (o: (typeof stranded)[number]) =>
    o.action === 'add' ? 'sub in' : o.kind === 'lesson' ? 'lesson pull-out' : 'pull-out';

  const slot = slots.find(s => s.key === slotKey);
  const startTime = slot ? slot.start : customStart || undefined;
  const endTime = slot ? slot.end : customEnd || undefined;
  const when = parseDate(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const bits = [startTime ? formatTime(startTime) : '', room.trim() ? `in ${room.trim()}` : ''].filter(Boolean).join(' ');

  function save() {
    if (!slot && customStart && customEnd && customEnd <= customStart) {
      setError('End time is before start time.');
      return;
    }
    onConfirm({ startTime, endTime, location: room.trim() || undefined, notify });
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title"><Merge size={16} style={{ verticalAlign: '-2px' }} /> Combine blocks</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-sc-summary">
            <strong>{events.map(labelOf).join(' + ')}</strong> meet together {when} — one room, one
            downbeat. Roll is still taken per ensemble.
          </div>
          <div className="dir-field">
            <label className="dir-label"><Clock3 size={12} /> When</label>
            {slots.map(s => (
              <label key={s.key} className="pub-parent-toggle">
                <input type="radio" name="combine-slot" checked={slotKey === s.key} onChange={() => setSlotKey(s.key)} />
                {formatTimeRange(s.start, s.end)} ({s.owner}’s slot)
              </label>
            ))}
            <label className="pub-parent-toggle">
              <input type="radio" name="combine-slot" checked={slotKey === 'custom'} onChange={() => setSlotKey('custom')} />
              Custom…
            </label>
            {slotKey === 'custom' && (
              <div className="dir-field-row">
                <div className="dir-field">
                  <label className="dir-label">Starts</label>
                  <input className="dir-input" type="time" value={customStart} onChange={e => setCustomStart(e.target.value)} />
                </div>
                <div className="dir-field">
                  <label className="dir-label">Ends</label>
                  <input className="dir-input" type="time" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
                </div>
              </div>
            )}
          </div>
          <div className="dir-field">
            <label className="dir-label"><MapPin size={12} /> Where</label>
            <input className="dir-input" value={room} onChange={e => setRoom(e.target.value)} placeholder="e.g. Auditorium" />
          </div>
          {rolled.length > 0 && (
            <div className="dir-sc-error">
              ⚠ Roll was already taken for {rolled.map(labelOf).join(' and ')}. Those attendance
              records are kept (they’re stored by ensemble and date), but that block’s own roll
              receipt goes away with it.
            </div>
          )}
          {stranded.length > 0 && (
            <div className="dir-sc-error">
              ⚠ These per-event roster moves point at a block being absorbed and will stop applying:{' '}
              {stranded.map(o => `${studentName(o.studentId)} (${overrideWord(o)})`).join(', ')}.
              Re-add them on the combined block if they still apply.
            </div>
          )}
          <label className="pub-parent-toggle">
            <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} />
            Post an urgent announcement (shows a banner on the calendar)
          </label>
          {notify && (
            <div className="dir-field-hint">
              “{groupLabel} combined rehearsal {when}{bits ? `: ${bits}` : ''}”
            </div>
          )}
          {error && <div className="dir-sc-error">⚠ {error}</div>}
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="dir-btn dir-btn-primary" disabled={busy} onClick={save}>
            {busy ? 'Combining…' : 'Combine the blocks'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SwapConfirm({ a, b, labelA, labelB, busy, onConfirm, onClose }: {
  a: CalendarEvent; b: CalendarEvent; labelA: string; labelB: string; busy: boolean;
  onConfirm: (notify: boolean) => void; onClose: () => void;
}) {
  const [notify, setNotify] = useState(true);
  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title"><ArrowLeftRight size={16} style={{ verticalAlign: '-2px' }} /> Swap blocks</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-sc-summary">
            <strong>{labelA}</strong> moves to {formatTimeRange(b.startTime, b.endTime)}{b.location ? ` (${b.location})` : ''}.<br />
            <strong>{labelB}</strong> moves to {formatTimeRange(a.startTime, a.endTime)}{a.location ? ` (${a.location})` : ''}.
          </div>
          <label className="pub-parent-toggle" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} />
            Post an urgent announcement (shows a banner on the calendar)
          </label>
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="dir-btn dir-btn-primary" disabled={busy} onClick={() => onConfirm(notify)}>
            {busy ? 'Swapping…' : 'Swap the blocks'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TimeChangeSheet({ event, name, onApply, onClose }: {
  event: CalendarEvent;
  name: string;
  onApply: (data: Partial<Omit<CalendarEvent, 'id'>>, notifyTitle?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [start, setStart] = useState(event.startTime ?? '');
  const [end, setEnd] = useState(event.endTime ?? '');
  const [room, setRoom] = useState(event.location ?? '');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancelled = event.status === 'Cancelled';

  async function run(data: Partial<Omit<CalendarEvent, 'id'>>, notifyTitle?: string) {
    setBusy(true); setError('');
    try {
      await onApply(data, notify ? notifyTitle : undefined);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save — try again.');
      setBusy(false);
    }
  }

  function saveTimeRoom() {
    if (start && end && end <= start) { setError('End time is before start time.'); return; }
    if (start === (event.startTime ?? '') && end === (event.endTime ?? '') && room.trim() === (event.location ?? '')) { onClose(); return; }
    // Describe the change against the ORIGINAL schedule (the pre-change
    // snapshot when one exists), so a second edit produces one note/banner
    // covering everything — not a note that only mentions the latest tweak.
    const orig = event.changeFrom ?? event;
    const bits: string[] = [];
    if (start !== (orig.startTime ?? '')) bits.push(`now ${formatTime(start)}`);
    if (room.trim() !== (orig.location ?? '')) bits.push(`in ${room.trim() || 'TBD'}`);
    const note = bits.length > 0 ? `Changed — ${bits.join(', ')}` : 'Changed — back to the usual time';
    run(
      { startTime: start || undefined, endTime: end || undefined, location: room.trim() || undefined, changeNote: note },
      `⚠ ${name}: ${bits.length > 0 ? bits.join(', ') : 'back to the usual time'} (${parseDate(event.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })})`,
    );
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">{name}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">Starts</label>
              <input className="dir-input" type="time" value={start} onChange={e => setStart(e.target.value)} />
            </div>
            <div className="dir-field">
              <label className="dir-label">Ends</label>
              <input className="dir-input" type="time" value={end} onChange={e => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="dir-field">
            <label className="dir-label"><MapPin size={12} /> Room / location</label>
            <input className="dir-input" value={room} onChange={e => setRoom(e.target.value)} placeholder="e.g. Auditorium" />
          </div>
          <div className="dir-field-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {TIME_BLOCKS.map(b => (
              <button key={b.label} type="button" className="dir-tool-btn" onClick={() => { setStart(b.start); setEnd(b.end); }}>
                {b.label}
              </button>
            ))}
            <button className="dir-tool-btn" onClick={() => { if (start) { const ns = addMinutesToTime(start, 30); setStart(ns); if (end) setEnd(addMinutesToTime(end, 30)); } }}>
              <Clock3 size={14} /> +30 min
            </button>
            {!cancelled ? (
              <button
                className="dir-tool-btn"
                style={{ color: 'var(--dir-danger)' }}
                onClick={() => run(
                  { status: 'Cancelled', changeNote: 'Cancelled' },
                  `🚫 ${name}: CANCELLED ${parseDate(event.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
                )}
              >
                <XCircle size={14} /> Cancel this {event.type.toLowerCase()}
              </button>
            ) : (
              <button className="dir-tool-btn" onClick={() => run({ status: 'Scheduled', changeNote: 'Back on — as originally scheduled' })}>
                <RotateCcw size={14} /> Un-cancel
              </button>
            )}
          </div>
          <label className="pub-parent-toggle">
            <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} />
            Post an urgent announcement (shows a banner on the calendar)
          </label>
          {error && <div className="dir-sc-error">⚠ {error}</div>}
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose}>Close</button>
          <button className="dir-btn dir-btn-primary" disabled={busy} onClick={saveTimeRoom}>
            {busy ? 'Saving…' : 'Save time / room'}
          </button>
        </div>
      </div>
    </div>
  );
}
