import { useState } from 'react';
import { Clock3, MapPin, XCircle, Megaphone, Copy } from 'lucide-react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { addMinutesToTime, formatTime } from '../utils';
import type { CalendarEvent } from '../types';
import './quickChange.css';

/**
 * One-tap schedule surgery (#16): Delay / Room change / Cancel from the Today
 * card. One confirm updates the event, posts an urgent announcement, queues a
 * Teams/email notification (#21), and puts a paste-ready message on the clipboard.
 */
export function QuickChangeMenu({ event, ensembleNames, onApply, onAnnounce, onClose }: {
  event: CalendarEvent;
  ensembleNames: string;
  onApply: (data: Partial<Omit<CalendarEvent, 'id'>>) => Promise<void>;
  onAnnounce: (title: string, body: string) => Promise<void>;
  onClose: () => void;
}) {
  const [pending, setPending] = useState<{ label: string; data: Partial<Omit<CalendarEvent, 'id'>>; message: string } | null>(null);
  const [room, setRoom] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function planDelay(mins: number) {
    if (!event.startTime) { setError('This event has no start time to delay.'); return; }
    const newStart = addMinutesToTime(event.startTime, mins);
    const newEnd = event.endTime ? addMinutesToTime(event.endTime, mins) : undefined;
    setPending({
      label: `Delay ${mins} minutes`,
      data: { startTime: newStart, endTime: newEnd, changeNote: `Delayed ${mins} min — starts ${formatTime(newStart)}` },
      message: `⚠ ${ensembleNames}: today's rehearsal is DELAYED ${mins} minutes — new start ${formatTime(newStart)}.`,
    });
  }
  function planRoom() {
    if (!room.trim()) return;
    setPending({
      label: `Move to ${room.trim()}`,
      data: { location: room.trim(), changeNote: `Room change — meet in ${room.trim()}` },
      message: `⚠ ${ensembleNames}: today's rehearsal MOVED to ${room.trim()}.`,
    });
  }
  function planCancel() {
    setPending({
      label: 'Cancel today',
      data: { status: 'Cancelled' },
      message: `🚫 ${ensembleNames}: today's rehearsal is CANCELLED.`,
    });
  }

  async function apply() {
    if (!pending) return;
    setSaving(true); setError('');
    try {
      await onApply(pending.data);
      await onAnnounce(pending.message.replace(/^[⚠🚫] /u, ''), '');
      // Notification relay (#21): Power Automate reads this queue.
      if (db) {
        await addDoc(collection(db, 'notifyQueue'), {
          kind: pending.data.status === 'Cancelled' ? 'cancellation' : 'change',
          title: pending.message,
          ensembleIds: event.ensembleIds,
          createdAt: Date.now(),
          processedAt: null,
        });
      }
      try { await navigator.clipboard?.writeText(pending.message); } catch { /* clipboard optional */ }
      onClose();
    } catch (e) {
      setSaving(false);
      setError(e instanceof Error ? e.message : 'Could not apply the change.');
    }
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">Quick change — {ensembleNames}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          {!pending ? (
            <>
              <div className="dir-qc-grid">
                <button className="dir-qc-btn" onClick={() => planDelay(15)}><Clock3 size={18} /> Delay 15 min</button>
                <button className="dir-qc-btn" onClick={() => planDelay(30)}><Clock3 size={18} /> Delay 30 min</button>
                <button className="dir-qc-btn danger" onClick={planCancel}><XCircle size={18} /> Cancel today</button>
              </div>
              <div className="dir-field" style={{ marginTop: 12 }}>
                <label className="dir-label">Room change</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="dir-input" style={{ flex: 1 }} value={room} onChange={e => setRoom(e.target.value)} placeholder="New room, e.g. Black Box" />
                  <button className="dir-btn dir-btn-ghost" disabled={!room.trim()} onClick={planRoom}><MapPin size={15} /> Move</button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="dir-qc-review">
                <div className="dir-qc-review-title">{pending.label}</div>
                <div className="dir-qc-review-row"><Megaphone size={14} /> Posts an urgent announcement on every public page</div>
                <div className="dir-qc-review-row"><Copy size={14} /> Copies a paste-ready Teams message</div>
                <div className="dir-qc-msg">{pending.message}</div>
              </div>
              {error && <div className="dir-sc-error" style={{ margin: '8px 0 0' }}>⚠ {error}</div>}
            </>
          )}
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={() => pending ? setPending(null) : onClose()}>
            {pending ? 'Back' : 'Cancel'}
          </button>
          {pending && (
            <button className="dir-btn dir-btn-primary" disabled={saving} onClick={apply}>
              {saving ? 'Applying…' : 'Apply + announce'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
