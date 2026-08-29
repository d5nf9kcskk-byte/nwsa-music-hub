import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowLeftRight, Clock3, MapPin, XCircle, RotateCcw, Grid3x3, CalendarDays, List, UserCog, Pencil, Merge } from 'lucide-react';
import { useEvents } from '../hooks/useEvents';
import { useEnsembles } from '../hooks/useEnsembles';
import { useAnnouncements } from '../hooks/useAnnouncements';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { useStudents } from '../hooks/useStudents';
import { todayStr, addDays, parseDate, toDateStr, formatTime, formatTimeRange, ensembleColor, addMinutesToTime, TIME_BLOCKS, CONCERT_COLOR, isClassGroup } from '../utils';
import { sharedBlockLabel } from '../../shared/sharedBlock';
import { bannersForEvents, announceChange, captureOriginal, combineSnapshot } from './changeOps';
import { planDayChange, applyPlan, rolledBlocks, strandedEventOverrides } from './changePlan';
import type { DayAction, DayPlan, PlanGuard } from './changePlan';
import type { CalendarEvent, Ensemble, RosterOverride } from '../types';
import type { DirNavigate } from '../types-nav';

/**
 * The day board's two rehearsal periods (TIME_BLOCKS[0] and [1]). An event
 * belongs to the period its start time falls in; the 14:25 boundary also
 * sorts the choir variants (Choir 1 starts 13:10, Choir 2 starts 14:25).
 * Concerts and odd-time events (outside the rehearsal afternoon) get no
 * period and render below the grid.
 */
function periodOf(e: CalendarEvent): 0 | 1 | null {
  if (!e.startTime || e.type === 'Concert') return null;
  if (e.startTime < '12:00' || e.startTime > '17:00') return null;
  return e.startTime < '14:25' ? 0 : 1;
}

const isChanged = (e: CalendarEvent) =>
  !!(e.changeNote || e.changeFrom || e.changeAnnouncementId || e.status === 'Cancelled');

const overrideWord = (o: RosterOverride) =>
  o.action === 'add' ? 'sub in' : o.kind === 'lesson' ? 'lesson pull-out' : 'pull-out';

/**
 * Change a Day — the TIME door (docs/schedule-ux-two-doors.md §1): whole-
 * ensemble changes only. Per block: swap, combine, move time/room, cancel.
 * Moving a PERSON is the other door ("Move a Student", `scheduleChanges`) —
 * the block menu's "Move a student…" deep-links there with this date and
 * block carried over. Every change here stamps a change note (drives the
 * public red banner) and can post an urgent announcement (in-app banner).
 * A per-row "Revert to normal" restores the original schedule and clears both.
 */
export function ScheduleSwapView({ initialDate, onNavigate }: {
  initialDate?: string;
  onNavigate: DirNavigate;
}) {
  const { events, updateEvent, deleteEvent, revertEvent } = useEvents();
  const { ensembles } = useEnsembles();
  const { overrides } = useRosterOverrides();
  const announcementApi = useAnnouncements();
  const { announcements, deleteAnnouncement } = announcementApi;

  const [date, setDate] = useState(initialDate ?? todayStr());
  // Pick-mode: tapping blocks to swap (exactly two) or combine (host first,
  // then any number of blocks to absorb). One grammar for both (#2.3).
  const [pick, setPick] = useState<{ mode: 'swap' | 'combine'; ids: string[] } | null>(null);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [menuFor, setMenuFor] = useState<CalendarEvent | null>(null);
  const [cancelling, setCancelling] = useState<CalendarEvent | null>(null);
  const [confirmSwap, setConfirmSwap] = useState(false);
  const [confirmCombine, setConfirmCombine] = useState(false);
  // A quick option (or an intercepted colliding move) under review — the
  // action is the source of truth; the plan is recomputed from live data.
  const [planAction, setPlanAction] = useState<DayAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Deep-linked with a date (from the calendar / Today): open on that day.
  const [view, setView] = useState<'day' | 'list' | 'month'>(initialDate ? 'day' : 'month');

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

  // ── The day board + enumerated plans (#schedule-ux-two-doors §3) ────────
  const boardCols = useMemo(() => {
    const cols: [CalendarEvent[], CalendarEvent[], CalendarEvent[]] = [[], [], []];
    for (const e of dayEvents) cols[periodOf(e) ?? 2].push(e);
    return cols;
  }, [dayEvents]);

  const planCtx = useMemo(() => ({
    labels: Object.fromEntries(dayEvents.map(e => [e.id, label(e)])),
    overrides,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [dayEvents, overrides, ensembleMap]);

  const planned: DayPlan | null = useMemo(
    () => planAction ? planDayChange(dayEvents, planAction, planCtx) : null,
    [planAction, dayEvents, planCtx],
  );

  /** Quick options: every valid whole-day plan, computed per day.
   *  Enumerated over PERFORMING rehearsal blocks only — the seeded academic
   *  classes sit on the bell schedule, so "Swap AP Theory ↔ Choir" is not a
   *  real verb (the same reasoning that killed the shift feature, §3), and
   *  including them turned the board into a wall of n² chips. A class is
   *  still changeable one at a time via its own block's Change menu. */
  const quickOptions = useMemo(() => {
    const opts: { key: string; label: string; action: DayAction; danger?: boolean }[] = [];
    const isRehearsalBlock = (e: CalendarEvent) =>
      (e.type === 'Rehearsal' || e.type === 'Sectional')
      && e.ensembleIds.some(id => { const g = ensembleMap[id]; return g && !isClassGroup(g); });
    const [p0, p1] = boardCols.map(col => col.filter(isRehearsalBlock));
    for (const ea of p0) for (const eb of p1) {
      if (ea.status === 'Cancelled' || eb.status === 'Cancelled') continue;
      if (ea.ensembleIds.some(id => eb.ensembleIds.includes(id))) continue;
      opts.push({
        key: `swap-${ea.id}-${eb.id}`,
        label: p0.length === 1 && p1.length === 1 ? 'Swap the two periods' : `Swap ${label(ea)} ↔ ${label(eb)}`,
        action: { kind: 'swap', aId: ea.id, bId: eb.id },
      });
    }
    // Co-resident blocks (same period, i.e. same time slot) are combinable.
    for (const col of [p0, p1]) {
      for (let i = 0; i < col.length; i++) for (let j = i + 1; j < col.length; j++) {
        if (col[i].status === 'Cancelled' || col[j].status === 'Cancelled') continue;
        opts.push({
          key: `combine-${col[i].id}-${col[j].id}`,
          label: `Combine ${label(col[i])} + ${label(col[j])}`,
          action: { kind: 'combine', hostId: col[i].id, absorbedIds: [col[j].id], groupLabel: combinedLabel([col[i], col[j]]) },
        });
      }
    }
    if (dayEvents.some(e => e.status !== 'Cancelled')) {
      opts.push({ key: 'cancel-day', label: 'Cancel the day', action: { kind: 'cancelDay' }, danger: true });
    }
    if (dayEvents.some(isChanged)) {
      opts.push({ key: 'back-to-normal', label: 'Back to normal', action: { kind: 'backToNormal' } });
    }
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardCols, dayEvents, ensembleMap]);

  /** Revert one event and pull down every banner that belongs to it. */
  async function revertOne(e: CalendarEvent) {
    const strays = bannersForEvents(announcements, [e], [label(e)], date);
    const annId = await revertEvent(e.id);
    const gone = new Set<string>();
    for (const s of strays) { await deleteAnnouncement(s.id); gone.add(s.id); }
    if (annId && !gone.has(annId)) await deleteAnnouncement(annId);
  }

  /** Replay a plan through the existing changeOps machinery: the writes as
   *  planned, then ONE banner linked from every updated event. */
  async function commitPlan(plan: DayPlan, notify: boolean) {
    // Never commit an unacknowledged collision (exit test, doc §6) — the
    // review sheet swaps Save for the resolution buttons, this is the belt.
    if (plan.guards.some(g => g.kind === 'collision')) return;
    setBusy(true); setError('');
    try {
      const byId = Object.fromEntries(dayEvents.map(e => [e.id, e]));
      const touched = plan.writes.map(w => byId[w.id]).filter(Boolean) as CalendarEvent[];
      for (const w of plan.writes) {
        if (w.op === 'update') await updateEvent(w.id, w.data);
        else if (w.op === 'delete') await deleteEvent(w.id, { undoable: false });
        else if (byId[w.id]) await revertOne(byId[w.id]);
      }
      if (notify && plan.bannerText && touched.length > 0) {
        const annId = await announceChange(announcementApi, date, plan.bannerText, touched, touched.map(label));
        if (annId) {
          for (const w of plan.writes) {
            if (w.op === 'update') await updateEvent(w.id, { changeAnnouncementId: annId });
          }
        }
      }
      setPlanAction(null);
      setPick(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the change — try again.');
    } finally {
      setBusy(false);
    }
  }

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
      await revertOne(e);
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

  /** One block card — used in the period grid and the odd-times list. */
  const renderRow = (e: CalendarEvent) => (
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
        {isChanged(e) && (
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
  );

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
      </div>

      {view === 'month' ? (
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
          Whole-ensemble changes for this day — pick a ready-made option below,
          or tap <strong>Change</strong> on a block
          to swap, combine, move time or room, or cancel.
          Families see a red “Schedule change” banner automatically.
          {' '}Moving one student, not a whole block?{' '}
          <button className="dir-inline-link" onClick={() => onNavigate('scheduleChanges', { date })}>
            Move a Student
          </button>
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

            {quickOptions.length > 0 && !pick && (
              <div className="dir-quickplan-row">
                {quickOptions.map(q => (
                  <button
                    key={q.key}
                    className="dir-tool-btn"
                    style={q.danger ? { color: 'var(--dir-danger)' } : undefined}
                    onClick={() => setPlanAction(q.action)}
                  >
                    {q.action.kind === 'swap' ? <ArrowLeftRight size={14} />
                      : q.action.kind === 'combine' ? <Merge size={14} />
                      : q.action.kind === 'cancelDay' ? <XCircle size={14} />
                      : <RotateCcw size={14} />} {q.label}
                  </button>
                ))}
              </div>
            )}

            <div className="dir-dayboard">
              {([0, 1] as const).map(p => (
                <div key={p}>
                  <div className="dir-dayboard-head">{formatTimeRange(TIME_BLOCKS[p].start, TIME_BLOCKS[p].end)}</div>
                  {boardCols[p].length === 0
                    ? <div className="dir-dayboard-empty">Free</div>
                    : boardCols[p].map(e => renderRow(e))}
                </div>
              ))}
            </div>
            {boardCols[2].length > 0 && (
              <>
                <div className="dir-dayboard-head">Concerts &amp; other times</div>
                {boardCols[2].map(e => renderRow(e))}
              </>
            )}
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
          onStudent={() => { const id = menuFor.id; setMenuFor(null); onNavigate('scheduleChanges', { date, eventId: id }); }}
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
            // Displacement is never silent (§3): a time/room move that lands
            // on an occupied slot or breaks a lesson window routes through
            // the day-plan review with one-tap resolutions instead of saving.
            if (!data.status) {
              const action: DayAction = { kind: 'move', id: editing.id, startTime: data.startTime, endTime: data.endTime, location: data.location };
              if (planDayChange(dayEvents, action, planCtx).guards.length > 0) {
                setPlanAction(action);
                return;
              }
            }
            await updateEvent(editing.id, { ...data, ...captureOriginal(editing) });
            if (notifyTitle) {
              const annId = await announce(notifyTitle, [editing]);
              if (annId) await updateEvent(editing.id, { changeAnnouncementId: annId });
            }
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {planAction && planned && (
        <PlanReviewSheet
          action={planAction}
          planned={planned}
          dayEvents={dayEvents}
          labelOf={label}
          combineLabelOf={combinedLabel}
          busy={busy}
          error={error}
          onAction={setPlanAction}
          onConfirm={notify => commitPlan(planned, notify)}
          onClose={() => setPlanAction(null)}
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
    // The PEOPLE door — deep-links to Move a Student on this block's roster.
    { icon: <UserCog size={16} />, title: 'Move a student…', sub: 'Opens Move a Student with this block’s roster', run: onStudent },
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

/** Compact one-day board grouped by rehearsal period — the review sheet's
 *  before/after halves. With a `baseline`, rows that differ are highlighted. */
function MiniBoard({ events, labelOf, baseline }: {
  events: CalendarEvent[];
  labelOf: (e: CalendarEvent) => string;
  baseline?: CalendarEvent[];
}) {
  const sig = (e: CalendarEvent) =>
    [e.startTime, e.endTime, e.location, e.status, e.ensembleIds.join('+'), e.sharedBlock ? '1' : ''].join('|');
  const base = baseline ? Object.fromEntries(baseline.map(e => [e.id, sig(e)])) : null;
  const cols: [CalendarEvent[], CalendarEvent[], CalendarEvent[]] = [[], [], []];
  for (const e of events) cols[periodOf(e) ?? 2].push(e);
  return (
    <div className="dir-plan-mini">
      {([0, 1, 2] as const).map(p => (p === 2 && cols[2].length === 0) ? null : (
        <div key={p}>
          <div className="dir-plan-mini-head">{p === 2 ? 'Other' : formatTimeRange(TIME_BLOCKS[p].start, TIME_BLOCKS[p].end)}</div>
          {cols[p].length === 0
            ? <div className="dir-plan-mini-row">—</div>
            : cols[p].map(e => (
              <div key={e.id} className={`dir-plan-mini-row ${base && base[e.id] !== sig(e) ? 'changed' : ''}`}>
                <strong>{labelOf(e)}</strong>
                {' '}{formatTimeRange(e.startTime, e.endTime)}{e.location ? ` · ${e.location}` : ''}
                {e.status === 'Cancelled' ? ' · Cancelled' : ''}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Review a whole-day plan (#schedule-ux-two-doors §3): a collision leads with
 * one-tap resolutions (swap / combine with the occupant, or overlap anyway),
 * then the day before → after, the guards, and the exact banner text.
 * One save, one banner — Save is withheld until every collision is resolved
 * or acknowledged.
 */
function PlanReviewSheet({ action, planned, dayEvents, labelOf, combineLabelOf, busy, error, onAction, onConfirm, onClose }: {
  action: DayAction;
  planned: DayPlan;
  dayEvents: CalendarEvent[];
  labelOf: (e: CalendarEvent) => string;
  combineLabelOf: (evts: CalendarEvent[]) => string;
  busy: boolean;
  error: string;
  onAction: (a: DayAction) => void;
  onConfirm: (notify: boolean) => void;
  onClose: () => void;
}) {
  const { students } = useStudents();
  const [notify, setNotify] = useState(true);
  const after = useMemo(() => applyPlan(dayEvents, planned.writes), [dayEvents, planned]);
  const byId = useMemo(() => Object.fromEntries(dayEvents.map(e => [e.id, e])), [dayEvents]);
  const ofKind = <K extends PlanGuard['kind']>(k: K) =>
    planned.guards.filter((g): g is Extract<PlanGuard, { kind: K }> => g.kind === k);
  const collision = ofKind('collision')[0];
  const mover = collision ? byId[collision.movingId] : undefined;
  const occupant = collision ? byId[collision.occupantId] : undefined;
  const rolled = ofKind('rollTaken');
  const stranded = ofKind('strandedOverride');
  const lessons = ofKind('lessonWindow');
  const studentName = (id: string) => students.find(s => s.id === id)?.name ?? 'A student';

  const titles: Record<DayAction['kind'], [React.ReactNode, string, string]> = {
    swap: [<ArrowLeftRight key="i" size={16} style={{ verticalAlign: '-2px' }} />, 'Swap blocks', 'Swap the blocks'],
    combine: [<Merge key="i" size={16} style={{ verticalAlign: '-2px' }} />, 'Combine blocks', 'Combine the blocks'],
    move: [<Clock3 key="i" size={16} style={{ verticalAlign: '-2px' }} />, 'Move time / room', 'Save the change'],
    cancelDay: [<XCircle key="i" size={16} style={{ verticalAlign: '-2px' }} />, 'Cancel the day', 'Cancel the day'],
    backToNormal: [<RotateCcw key="i" size={16} style={{ verticalAlign: '-2px' }} />, 'Back to normal', 'Put the day back to normal'],
  };
  const [icon, title, saveLabel] = titles[action.kind];

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">{icon} {title}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          {collision && mover && occupant && (
            <>
              <div className="dir-sc-error">
                ⚠ <strong>{labelOf(mover)}</strong> would land on <strong>{labelOf(occupant)}</strong>’s
                time ({formatTimeRange(occupant.startTime, occupant.endTime)}
                {occupant.location ? ` · ${occupant.location}` : ''}). Pick how to resolve it:
              </div>
              <div className="dir-quickplan-row">
                <button className="dir-tool-btn" onClick={() => onAction({ kind: 'swap', aId: mover.id, bId: occupant.id })}>
                  <ArrowLeftRight size={14} /> Swap with {labelOf(occupant)}
                </button>
                <button
                  className="dir-tool-btn"
                  onClick={() => onAction({ kind: 'combine', hostId: occupant.id, absorbedIds: [mover.id], groupLabel: combineLabelOf([occupant, mover]) })}
                >
                  <Merge size={14} /> Combine with {labelOf(occupant)}
                </button>
                {action.kind === 'move' && (
                  <button className="dir-tool-btn" onClick={() => onAction({ ...action, overlapAcknowledged: true })}>
                    Overlap anyway (different rooms)
                  </button>
                )}
              </div>
            </>
          )}

          <div className="dir-plan-diff">
            <div>
              <div className="dir-label">Before</div>
              <MiniBoard events={dayEvents} labelOf={labelOf} />
            </div>
            <div>
              <div className="dir-label">After</div>
              <MiniBoard events={after} labelOf={labelOf} baseline={dayEvents} />
            </div>
          </div>

          {rolled.length > 0 && (
            <div className="dir-sc-error">
              ⚠ Roll was already taken for {rolled.map(g => byId[g.eventId] ? labelOf(byId[g.eventId]) : 'a block').join(' and ')}.
              Those attendance records are kept (they’re stored by ensemble and date), but that
              block’s own roll receipt goes away with it.
            </div>
          )}
          {stranded.length > 0 && (
            <div className="dir-sc-error">
              ⚠ These per-event roster moves point at a block being absorbed and will stop applying:{' '}
              {stranded.map(g => `${studentName(g.studentId)} (${g.action === 'add' ? 'sub in' : g.lesson ? 'lesson pull-out' : 'pull-out'})`).join(', ')}.
              Re-add them on the combined block if they still apply.
            </div>
          )}
          {lessons.length > 0 && (
            <div className="dir-sc-error">
              ⚠ Lesson pull-outs falling outside the new time:{' '}
              {lessons.map(g => `${studentName(g.studentId)} (${formatTimeRange(g.startTime, g.endTime)})`).join(', ')}.
              Pull-outs stay keyed to ensemble + date, so they still apply — adjust the lesson if it no longer fits.
            </div>
          )}

          {planned.bannerText ? (
            <>
              <label className="pub-parent-toggle">
                <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} />
                Post an urgent announcement (shows a banner on the calendar)
              </label>
              {notify && <div className="dir-field-hint">“{planned.bannerText}”</div>}
            </>
          ) : (
            <div className="dir-field-hint">No new banner — reverting also takes down this day’s change banners.</div>
          )}
          {error && <div className="dir-sc-error">⚠ {error}</div>}
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose}>Cancel</button>
          {!collision && (
            <button
              className={`dir-btn ${action.kind === 'cancelDay' ? 'dir-btn-danger' : 'dir-btn-primary'}`}
              disabled={busy || planned.writes.length === 0}
              onClick={() => onConfirm(notify)}
            >
              {busy ? 'Saving…' : saveLabel}
            </button>
          )}
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

  // §4.2 guards — same helpers the day planner uses (changePlan.ts). Roll
  // receipts live on the event (`rollTaken`); event-scoped overrides pointing
  // at an absorbed block stop applying once it's deleted.
  const { overrides } = useRosterOverrides();
  const { students } = useStudents();
  const rolled = rolledBlocks(absorbed);
  const stranded = strandedEventOverrides(overrides, new Set(absorbed.map(e => e.id)));
  const studentName = (id: string) => students.find(s => s.id === id)?.name ?? 'A student';

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
