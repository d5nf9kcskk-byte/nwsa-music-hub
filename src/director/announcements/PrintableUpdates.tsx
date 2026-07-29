import { useMemo, useRef } from 'react';
import { Printer, X } from 'lucide-react';
import { useAnnouncements, useMinuteTick, visibleAnnouncements } from '../hooks/useAnnouncements';
import { useEvents } from '../hooks/useEvents';
import { useEnsembles } from '../hooks/useEnsembles';
import { formatDate, todayStr } from '../utils';
import { printViaPopup } from '../../shared/printPopup';
import './printableUpdates.css';

/**
 * Director-facing printable sheet (#print-updates): today's schedule changes
 * (cancellations + changeNote events) plus every announcement currently live
 * on the public site — one page a director can print and post/hand off,
 * instead of relaying either by reading a screen aloud. Uses the same
 * popup-window print (printViaPopup) as the public program/season/start
 * guide, since in-page window.print() can stall or silently no-op on some
 * devices (see printPopup.ts).
 */
export function PrintableUpdates({ onClose }: { onClose: () => void }) {
  const { announcements } = useAnnouncements();
  const { events } = useEvents();
  const { ensembles } = useEnsembles();
  const now = useMinuteTick();
  const today = todayStr();
  const sheetRef = useRef<HTMLDivElement>(null);

  const ensembleName = (id: string | null) =>
    id === null ? 'All ensembles' : ensembles.find(e => e.id === id)?.name ?? 'Unknown';

  const shownAnnouncements = useMemo(
    () => visibleAnnouncements(announcements, today, 'all', now),
    [announcements, today, now],
  );

  // Changes from today forward — past changes are no longer actionable.
  const changes = useMemo(
    () => events
      .filter(e => e.date >= today && (e.status === 'Cancelled' || e.changeNote))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '99').localeCompare(b.startTime ?? '99')),
    [events, today],
  );

  function changeLabel(e: (typeof changes)[number]) {
    const names = e.ensembleIds.map(id => ensembles.find(x => x.id === id)?.name).filter(Boolean).join(', ');
    return e.title || names || e.type;
  }

  function handlePrint() {
    if (sheetRef.current) printViaPopup('NWSA Music — Announcements & Schedule Changes', sheetRef.current.outerHTML);
    else window.print();
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title"><Printer size={16} style={{ verticalAlign: '-2px' }} /> Print updates</span>
          <button className="dir-drawer-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-print-sheet" ref={sheetRef}>
            <header className="dir-print-head">
              <div className="dir-print-org">NWSA Music Hub</div>
              <h1 className="dir-print-title">Announcements &amp; Schedule Changes</h1>
              <div className="dir-print-asof">As of {formatDate(today, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
            </header>

            <section className="dir-print-section">
              <h2 className="dir-print-section-title">Schedule Changes</h2>
              {changes.length === 0 ? (
                <p className="dir-print-empty">No schedule changes on record.</p>
              ) : changes.map(e => (
                <div key={e.id} className="dir-print-item">
                  <div className="dir-print-item-top">
                    <span className="dir-print-item-date">{formatDate(e.date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    <span className="dir-print-item-title">
                      {changeLabel(e)}
                      {e.status === 'Cancelled' && <span className="dir-print-tag dir-print-tag-cancel">CANCELLED</span>}
                    </span>
                  </div>
                  {e.changeNote && <div className="dir-print-item-note">{e.changeNote}</div>}
                </div>
              ))}
            </section>

            <section className="dir-print-section">
              <h2 className="dir-print-section-title">Announcements</h2>
              {shownAnnouncements.length === 0 ? (
                <p className="dir-print-empty">No announcements currently posted.</p>
              ) : shownAnnouncements.map(a => (
                <div key={a.id} className="dir-print-item">
                  <div className="dir-print-item-top">
                    <span className="dir-print-item-title">
                      {a.title}
                      {a.priority === 'urgent' && <span className="dir-print-tag dir-print-tag-urgent">URGENT</span>}
                    </span>
                    <span className="dir-print-item-ens">{ensembleName(a.ensembleId)}</span>
                  </div>
                  {a.body && <div className="dir-print-item-note">{a.body}</div>}
                </div>
              ))}
            </section>
          </div>
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose}>Close</button>
          <button className="dir-btn dir-btn-primary" onClick={handlePrint}>
            <Printer size={15} style={{ verticalAlign: '-2px' }} /> Print
          </button>
        </div>
      </div>
    </div>
  );
}
