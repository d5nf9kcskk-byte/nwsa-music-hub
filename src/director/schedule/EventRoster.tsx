import { useState, useMemo } from 'react';
import { ClipboardList, Users } from 'lucide-react';
import { useStudents } from '../hooks/useStudents';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { resolveRoster, overrideApplies } from '../rosterResolver';
import { isSharedBlock, mergeSharedRoster, sharedBlockLabel } from '../../shared/sharedBlock';
import { formatDate, formatTimeRange, EVENT_TYPE_ICON } from '../utils';
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

  // A combined block is ONE room: show every player in it, not one ensemble at
  // a time. Doubling members (a rotator who belongs to two of the ensembles
  // present) are one person and are listed once — mergeSharedRoster dedupes and
  // keeps which ensembles each came in with.
  const shared = isSharedBlock(event);
  const sharedRoster = useMemo(() => {
    if (!shared) return [];
    return mergeSharedRoster(event.ensembleIds.map(id => ({
      ensembleId: id,
      students: resolveRoster(students, overrides, { ensembleId: id, eventId: event.id, eventsById }),
    }))).sort((a, b) => a.student.name.localeCompare(b.student.name));
  }, [shared, students, overrides, event.ensembleIds, event.id, eventsById]);

  const resolved = useMemo(
    () => resolveRoster(students, overrides, { ensembleId, eventId: event.id, eventsById }),
    [students, overrides, ensembleId, event.id, eventsById],
  );

  // Which ensembles' overrides this panel is showing: the whole room for a
  // combined block, otherwise just the selected tab. Without this a combined
  // block would list the pull-outs of one arbitrary ensemble and silently drop
  // the rest — the director would think nobody else was missing.
  const scopeIds = shared ? event.ensembleIds : [ensembleId];
  function applies(o: RosterOverride) {
    if (!scopeIds.includes(o.ensembleId)) return false;
    return overrideApplies(o, { ensembleId: o.ensembleId, eventId: event.id, eventsById });
  }
  const pulled = overrides
    .filter(o => o.action === 'remove' && !o.kind && applies(o))
    .map(o => ({ o, student: students.find(s => s.id === o.studentId) }))
    .filter(x => x.student);
  const lessons = overrides
    .filter(o => o.kind === 'lesson' && applies(o))
    .map(o => ({ o, student: students.find(s => s.id === o.studentId) }))
    .filter(x => x.student);

  // The event's display name and its REAL category. A rehearsal is labelled
  // "Rehearsal", a class "Class", a concert "Concert" — the generic "Event"
  // label is reserved for items that are none of those.
  const eventName = event.title
    || (shared
      ? sharedBlockLabel(eventEnsembles.map(e => e.name), { total: ensembles.length })
      : eventEnsembles.map(e => e.name).filter(Boolean).join(', '))
    || event.type;
  const timeLabel = formatTimeRange(event.startTime, event.endTime);

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title"><Users size={16} style={{ verticalAlign: '-2px' }} /> {event.type} Roster</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-roster-event-name">{EVENT_TYPE_ICON[event.type]} {eventName}</div>
          <div className="dir-roster-sub-date">
            {event.type} · {formatDate(event.date)}{timeLabel ? ` · ${timeLabel}` : ''}
          </div>

          {shared && (
            <div className="dir-roster-sub-date">
              <span className="dir-shared-badge">⇄ Combined</span>{' '}
              {eventEnsembles.map(e => e.name).join(' + ')} together
              {event.location ? ` in ${event.location}` : ''} · roll is taken per ensemble
            </div>
          )}

          {eventEnsembles.length > 1 && !shared && (
            <div className="dir-tabs" style={{ padding: '0 0 8px' }}>
              {eventEnsembles.map(e => (
                <button key={e.id} className={`dir-tab ${ensembleId === e.id ? 'active' : ''}`} onClick={() => setEnsembleId(e.id)}>
                  {e.name}
                </button>
              ))}
            </div>
          )}

          {shared ? (
            <>
              <div className="dir-roster-section-title">{sharedRoster.length} in the room</div>
              {sharedRoster.map(({ student, isSub, ensembleIds }) => (
                <div key={student.id} className="dir-sub-row">
                  <div className="dir-sub-info dir-sub-inline">
                    <span className="dir-sub-name">{student.name}</span>
                    {isSub && <span className="dir-sub-badge">Sub</span>}
                    <span className="dir-sub-instr">{student.instrument}</span>
                    <span className="dir-sub-instr">
                      {ensembleIds.map(id => ensembles.find(e => e.id === id)?.name ?? id).join(' · ')}
                    </span>
                  </div>
                </div>
              ))}
            </>
          ) : (
          <>
          <div className="dir-roster-section-title">{resolved.length} expected</div>
          {resolved.map(({ student, isSub }) => (
            <div key={student.id} className="dir-sub-row">
              <div className="dir-sub-info dir-sub-inline">
                <span className="dir-sub-name">{student.name}</span>
                {isSub && <span className="dir-sub-badge">Sub</span>}
                <span className="dir-sub-instr">{student.instrument}</span>
              </div>
            </div>
          ))}
          </>
          )}

          {lessons.length > 0 && (
            <>
              <div className="dir-roster-section-title">Lesson pull-outs (partial)</div>
              {lessons.map(({ o, student }) => (
                <div key={o.id} className="dir-sub-row">
                  <div className="dir-sub-info dir-sub-inline">
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
                  <div className="dir-sub-info dir-sub-inline">
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
              className="dir-btn dir-btn-primary dir-btn-compact"
              onClick={() => { onClose(); onNavigate('scheduleSwap', { date: event.date }); }}
            >
              <ClipboardList size={15} style={{ verticalAlign: '-2px' }} /> Move a student
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
