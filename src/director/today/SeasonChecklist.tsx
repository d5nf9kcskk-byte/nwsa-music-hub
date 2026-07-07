import { useMemo, useState } from 'react';
import { CheckCircle2, Circle, ChevronRight, GraduationCap } from 'lucide-react';
import { useStudents } from '../hooks/useStudents';
import { useEvents } from '../hooks/useEvents';
import { useSeatingCharts } from '../hooks/useSeatingCharts';
import { useContacts } from '../hooks/useContacts';
import { useRepertoire } from '../hooks/useRepertoire';
import { todayStr, addDays } from '../utils';
import type { DirNavigate } from '../types-nav';
import './seasonChecklist.css';

/**
 * New-term checklist (#47): the error-prone mid-August setup, computed LIVE
 * from Firestore so "done" means actually done — with one-tap jumps and a
 * guided graduate-the-seniors action.
 */
export function SeasonChecklist({ onNavigate, onClose }: { onNavigate: DirNavigate; onClose: () => void }) {
  const { students, updateStudent } = useStudents();
  const { events } = useEvents();
  const { charts } = useSeatingCharts();
  const { contacts } = useContacts();
  const { pieces } = useRepertoire();
  const [busy, setBusy] = useState(false);
  const today = todayStr();

  const seniors = useMemo(
    () => students.filter(s => s.status === 'Active' && (s.grade ?? '').startsWith('12')),
    [students],
  );
  const staleCharts = useMemo(
    () => charts.filter(c => c.date && c.date < addDays(today, -120)),
    [charts, today],
  );
  const futureEvents = events.filter(e => e.date >= today).length;
  const missingContacts = students.filter(s => s.status === 'Active' && !contacts[s.id]).length;
  const activeCount = students.filter(s => s.status === 'Active').length;

  const items: { done: boolean; label: string; detail: string; action?: () => void; actionLabel?: string }[] = [
    {
      done: futureEvents > 10,
      label: 'Season calendar loaded',
      detail: futureEvents > 10 ? `${futureEvents} upcoming events on the calendar` : 'Fewer than 10 upcoming events — load or import the season',
      action: () => onNavigate('schedule'),
      actionLabel: 'Open Schedule',
    },
    {
      done: seniors.length === 0,
      label: 'Graduated seniors moved out',
      detail: seniors.length === 0 ? 'No active 12th-graders from last year' : `${seniors.length} active student${seniors.length !== 1 ? 's' : ''} marked 12th grade`,
    },
    {
      done: staleCharts.length === 0,
      label: 'Old seating charts retired',
      detail: staleCharts.length === 0 ? 'No stale published charts' : `${staleCharts.length} chart${staleCharts.length !== 1 ? 's' : ''} older than ~4 months still published`,
      // Jump straight to the hub of the first stale chart's ensemble — the hub
      // tab renders blank without an ensembleId.
      action: staleCharts[0]?.ensembleId
        ? () => onNavigate('ensembleHub', { ensembleId: staleCharts[0].ensembleId })
        : undefined,
      actionLabel: 'Review in ensemble hub',
    },
    {
      done: missingContacts < Math.max(3, activeCount * 0.2),
      label: 'Contact info entered',
      detail: `${activeCount - missingContacts}/${activeCount} active students have contacts`,
      action: () => onNavigate('roster'),
      actionLabel: 'Open Roster',
    },
    {
      done: pieces.length > 0,
      label: 'Repertoire started',
      detail: pieces.length > 0 ? `${pieces.length} pieces in the library` : 'No repertoire yet',
      action: () => onNavigate('repertoire'),
      actionLabel: 'Open Repertoire',
    },
  ];
  const doneCount = items.filter(i => i.done).length;

  async function graduateSeniors() {
    if (!window.confirm(`Mark all ${seniors.length} active 12th-graders as Graduated? They leave rosters and rolls immediately.`)) return;
    setBusy(true);
    try {
      for (const s of seniors) await updateStudent(s.id, { status: 'Graduated' });
    } finally { setBusy(false); }
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">🍂 New-term checklist</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-checklist-progress">{doneCount}/{items.length} ready for opening day</div>
          {items.map((it, i) => (
            <div key={i} className={`dir-check-item ${it.done ? 'done' : ''}`}>
              {it.done ? <CheckCircle2 size={19} className="ok" /> : <Circle size={19} className="todo" />}
              <div className="dir-check-body">
                <div className="dir-check-label">{it.label}</div>
                <div className="dir-check-detail">{it.detail}</div>
                {!it.done && it.label === 'Graduated seniors moved out' && seniors.length > 0 && (
                  <button className="dir-btn dir-btn-ghost dir-sc-small" style={{ marginTop: 6 }} disabled={busy} onClick={graduateSeniors}>
                    <GraduationCap size={14} /> {busy ? 'Updating…' : `Mark all ${seniors.length} as Graduated`}
                  </button>
                )}
              </div>
              {!it.done && it.action && (
                <button className="dir-check-jump" onClick={it.action}>{it.actionLabel} <ChevronRight size={13} /></button>
              )}
            </div>
          ))}
          <div className="dir-field-hint" style={{ marginTop: 10 }}>
            This list recomputes from live data — items check themselves off as the work gets done.
          </div>
        </div>
      </div>
    </div>
  );
}
