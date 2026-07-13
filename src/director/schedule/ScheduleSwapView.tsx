import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowLeftRight, Clock3, MapPin, XCircle, RotateCcw } from 'lucide-react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useEvents } from '../hooks/useEvents';
import { useEnsembles } from '../hooks/useEnsembles';
import { useAnnouncements } from '../hooks/useAnnouncements';
import { todayStr, addDays, parseDate, formatTime, formatTimeRange, ensembleColor, addMinutesToTime, TIME_BLOCKS, CONCERT_COLOR } from '../utils';
import type { CalendarEvent, Announcement } from '../types';
import type { DirNavigate } from '../types-nav';

/** Post the urgent announcement (in-app banner) and enqueue the notify relay
 *  for a future Teams/email integration. Returns the announcement id so the
 *  event can link it and a later revert can pull it back down. */
async function postScheduleAnnouncement(
  addAnnouncement: (data: Omit<Announcement, 'id'>) => Promise<string | undefined>,
  date: string,
  title: string,
  ensembleIds: string[],
): Promise<string | undefined> {
  const annId = await addAnnouncement({
    title,
    ensembleId: ensembleIds.length === 1 ? ensembleIds[0] : null,
    priority: 'urgent',
    createdAt: Date.now(),
    expiresOn: addDays(date, 1),
  });
  if (db) {
    try {
      await addDoc(collection(db, 'notifyQueue'), {
        kind: 'urgent-announcement', title, ensembleIds, createdAt: Date.now(), processedAt: null,
      });
    } catch { /* relay is best-effort */ }
  }
  return annId;
}

/** Pre-change schedule snapshot, captured once (on the first change) so a
 *  revert can restore it exactly. Omits undefined fields for Firestore. */
function snapshot(e: CalendarEvent): NonNullable<CalendarEvent['changeFrom']> {
  const s: NonNullable<CalendarEvent['changeFrom']> = { status: e.status };
  if (e.startTime !== undefined) s.startTime = e.startTime;
  if (e.endTime !== undefined) s.endTime = e.endTime;
  if (e.location !== undefined) s.location = e.location;
  return s;
}
/** Include a `changeFrom` snapshot only if this event hasn't been changed yet,
 *  so the ORIGINAL schedule is preserved across repeated edits. */
const captureOriginal = (e: CalendarEvent) => (e.changeFrom ? {} : { changeFrom: snapshot(e) });

/**
 * Schedule Change — ENSEMBLE times, not students (students are handled on the
 * Roll screen). Swap two blocks, shift a rehearsal's time, move the room, or
 * cancel — for any day. Every change stamps a change note (drives the public
 * red banner) and can post an urgent announcement (in-app banner). A per-row
 * "Revert to normal" restores the original schedule and clears both.
 */
export function ScheduleSwapView({ initialDate, onNavigate }: {
  initialDate?: string;
  onNavigate: DirNavigate;
}) {
  const { events, updateEvent, revertEvent } = useEvents();
  const { ensembles } = useEnsembles();
  const { addAnnouncement, deleteAnnouncement } = useAnnouncements();

  const [date, setDate] = useState(initialDate ?? todayStr());
  const [swapPick, setSwapPick] = useState<string[]>([]); // event ids picked for a swap
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [confirmSwap, setConfirmSwap] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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

  const announce = (title: string, ensembleIds: string[]) =>
    postScheduleAnnouncement(addAnnouncement, date, title, ensembleIds);

  function togglePick(id: string) {
    setSwapPick(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id].slice(-2));
  }

  const [a, b] = swapPick.map(id => dayEvents.find(e => e.id === id)).filter(Boolean) as CalendarEvent[];

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
          [...new Set([...a.ensembleIds, ...b.ensembleIds])],
        );
        if (annId) {
          await updateEvent(a.id, { changeAnnouncementId: annId });
          await updateEvent(b.id, { changeAnnouncementId: annId });
        }
      }
      setSwapPick([]);
      setConfirmSwap(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the swap — try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRevert(e: CalendarEvent) {
    setBusy(true); setError('');
    try {
      const annId = await revertEvent(e.id);
      if (annId) await deleteAnnouncement(annId);
      setSwapPick(p => p.filter(x => x !== e.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revert — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dir-tab-page">
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

      <div className="dir-drawer-body">
        <div className="dir-field-hint">
          Ensemble times only — swap blocks, shift a rehearsal, move rooms, or cancel.
          Families see a red “Schedule change” banner automatically.
          For <strong>students</strong> (subs, pull-outs, absences), use{' '}
          <button className="dir-link-btn" onClick={() => onNavigate('roll')}>Take Roll</button>.
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
            {swapPick.length > 0 && (
              <div className="dir-att-summary" style={{ borderRadius: 10 }}>
                {swapPick.length === 1
                  ? 'Pick the second block to swap with.'
                  : <>Swapping <strong>{a && label(a)}</strong> ↔ <strong>{b && label(b)}</strong></>}
                {swapPick.length === 2 && (
                  <button className="dir-btn dir-btn-primary dir-sc-small" style={{ marginLeft: 10 }} onClick={() => setConfirmSwap(true)}>
                    <ArrowLeftRight size={14} /> Review swap
                  </button>
                )}
                <button className="dir-link-btn" style={{ marginLeft: 10 }} onClick={() => setSwapPick([])}>Clear</button>
              </div>
            )}

            {dayEvents.map(e => (
              <div key={e.id} className={`dir-ens-row ${swapPick.includes(e.id) ? 'dir-swap-picked' : ''}`}>
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
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {(e.changeNote || e.changeFrom || e.status === 'Cancelled') && (
                    <button
                      className="dir-tool-btn"
                      style={{ color: 'var(--dir-blue)' }}
                      disabled={busy}
                      onClick={() => handleRevert(e)}
                      title="Revert to normal schedule (clears the change note and its announcement)"
                    >
                      <RotateCcw size={14} />
                    </button>
                  )}
                  <button
                    className={`dir-tool-btn ${swapPick.includes(e.id) ? 'active' : ''}`}
                    onClick={() => togglePick(e.id)}
                    title="Select for a block swap"
                  >
                    <ArrowLeftRight size={14} />
                  </button>
                  <button className="dir-tool-btn" onClick={() => setEditing(e)} title="Change time / room / cancel">
                    <Clock3 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
        {error && <div className="dir-sc-error">⚠ {error}</div>}
      </div>

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
              const annId = await announce(notifyTitle, editing.ensembleIds);
              if (annId) await updateEvent(editing.id, { changeAnnouncementId: annId });
            }
          }}
          onClose={() => setEditing(null)}
        />
      )}
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
    const bits: string[] = [];
    if (start !== (event.startTime ?? '')) bits.push(`now ${formatTime(start)}`);
    if (room.trim() !== (event.location ?? '')) bits.push(`in ${room.trim() || 'TBD'}`);
    if (bits.length === 0) { onClose(); return; }
    run(
      { startTime: start || undefined, endTime: end || undefined, location: room.trim() || undefined, changeNote: `Changed — ${bits.join(', ')}` },
      `⚠ ${name}: ${bits.join(', ')} (${parseDate(event.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })})`,
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
