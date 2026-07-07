import { useState, useMemo } from 'react';
import { ClipboardList, Users } from 'lucide-react';
import { useStudents } from '../hooks/useStudents';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { resolveRoster } from '../rosterResolver';
import { formatDate } from '../utils';
import type { CalendarEvent, Ensemble, RosterOverride } from '../types';
import type { DirNavigate } from '../types-nav';

interface Props {
  event: CalendarEvent;
  ensembles: Ensemble[];
  onClose: () => void;
  /** Jump to the Roll area (the ONE place student changes are made). */
  onNavigate?: DirNavigate;
}

/**
 * Read-only roster viewer for an event: who's expected, who's a guest, who
 * was pulled and WHY. Changes happen in one place — the Roll area (Take Roll
 * for marks, Subs & Pull-outs for roster moves) — so nothing here silently
 * edits a student's schedule.
 */
export function EventRoster({ event, ensembles, onClose, onNavigate }: Props) {
  const { students } = useStudents();
  const { overrides } = useRosterOverrides();

  const eventEnsembles = ensembles.filter(e => event.ensembleIds.includes(e.id));
  const [ensembleId, setEnsembleId] = useState(event.ensembleIds[0] ?? '');

  const eventsById = useMemo(() => ({ [event.id]: event }), [event]);

  const resolved = useMemo(
    () => resolveRoster(students, overrides, { ensembleId, eventId: event.id, eventsById }),
    [students, overrides, ensembleId, event.id, eventsById],
  );

  function applies(o: RosterOverride) {
    if (o.ensembleId !== ensembleId) return false;
    if (o.scope === 'event') return o.eventId === event.id;
    return !!o.startDate && !!o.endDate && o.startDate <= event.date && event.date <= o.endDate;
  }
  const pulled = overrides
    .filter(o => o.action === 'remove' && o.kind !== 'lesson' && applies(o))
    .map(o => ({ o, student: students.find(s => s.id === o.studentId) }))
    .filter(x => x.student);
  const lessons = overrides
    .filter(o => o.kind === 'lesson' && applies(o))
    .map(o => ({ o, student: students.find(s => s.id === o.studentId) }))
    .filter(x => x.student);

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title"><Users size={16} style={{ verticalAlign: '-2px' }} /> Event Roster</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-roster-sub-date">{formatDate(event.date)}</div>

          {eventEnsembles.length > 1 && (
            <div className="dir-tabs" style={{ padding: '0 0 8px' }}>
              {eventEnsembles.map(e => (
                <button key={e.id} className={`dir-tab ${ensembleId === e.id ? 'active' : ''}`} onClick={() => setEnsembleId(e.id)}>
                  {e.name}
                </button>
              ))}
            </div>
          )}

          <div className="dir-roster-section-title">{resolved.length} expected</div>
          {resolved.map(({ student, isSub }) => (
            <div key={student.id} className="dir-sub-row">
              <div className="dir-sub-info">
                <span className="dir-sub-name">{student.name}</span>
                {isSub && <span className="dir-sub-badge">Sub</span>}
                <span className="dir-sub-instr">{student.instrument}</span>
              </div>
            </div>
          ))}

          {lessons.length > 0 && (
            <>
              <div className="dir-roster-section-title">Lesson pull-outs (partial)</div>
              {lessons.map(({ o, student }) => (
                <div key={o.id} className="dir-sub-row">
                  <div className="dir-sub-info">
                    <span className="dir-sub-name">{student!.name}</span>
                    <span className="dir-sub-instr">
                      {o.startTime && o.endTime ? `${o.startTime}–${o.endTime}` : 'window TBD'}
                      {o.reason ? ` · ${o.reason}` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </>
          )}

          {pulled.length > 0 && (
            <>
              <div className="dir-roster-section-title">Pulled out</div>
              {pulled.map(({ o, student }) => (
                <div key={o.id} className="dir-sub-row pulled">
                  <div className="dir-sub-info">
                    <span className="dir-sub-name">{student!.name}</span>
                    <span className="dir-sub-instr">{o.reason || 'no reason recorded'}</span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose}>Close</button>
          {onNavigate && (
            <button
              className="dir-btn dir-btn-primary"
              onClick={() => { onClose(); onNavigate('scheduleChanges', { ensembleId }); }}
            >
              <ClipboardList size={15} style={{ verticalAlign: '-2px' }} /> Make changes (Subs &amp; Pull-outs)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
