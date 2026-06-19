import { useState, useMemo } from 'react';
import { UserMinus, UserPlus, RotateCcw, Plus } from 'lucide-react';
import { useStudents } from '../hooks/useStudents';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { resolveRoster } from '../rosterResolver';
import { formatDate } from '../utils';
import type { CalendarEvent, Ensemble, RosterOverride, OverrideScope } from '../types';

interface Props {
  event: CalendarEvent;
  ensembles: Ensemble[];
  onClose: () => void;
}

export function EventRoster({ event, ensembles, onClose }: Props) {
  const { students } = useStudents();
  const { overrides, addOverride, deleteOverride } = useRosterOverrides();

  const eventEnsembles = ensembles.filter(e => event.ensembleIds.includes(e.id));
  const [ensembleId, setEnsembleId] = useState(event.ensembleIds[0] ?? '');
  const [scope, setScope] = useState<OverrideScope>('event');
  const [rangeStart, setRangeStart] = useState(event.date);
  const [rangeEnd, setRangeEnd] = useState(event.date);
  const [adding, setAdding] = useState(false);

  const eventsById = useMemo(() => ({ [event.id]: event }), [event]);

  const resolved = useMemo(
    () => resolveRoster(students, overrides, { ensembleId, eventId: event.id, eventsById }),
    [students, overrides, ensembleId, event.id, eventsById],
  );

  // Overrides that apply to THIS event/ensemble (for the pulled list + undo).
  function applies(o: RosterOverride) {
    if (o.ensembleId !== ensembleId) return false;
    if (o.scope === 'event') return o.eventId === event.id;
    return !!o.startDate && !!o.endDate && o.startDate <= event.date && event.date <= o.endDate;
  }
  const pulled = overrides
    .filter(o => o.action === 'remove' && applies(o))
    .map(o => ({ o, student: students.find(s => s.id === o.studentId) }))
    .filter(x => x.student);

  const expectedIds = new Set(resolved.map(r => r.student.id));
  const pulledIds = new Set(pulled.map(p => p.o.studentId));

  // Candidates to add as subs: active students not already expected or pulled here.
  const candidates = students
    .filter(s => s.status === 'Active' && !expectedIds.has(s.id) && !pulledIds.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  function scopeFields(): Partial<RosterOverride> {
    return scope === 'event'
      ? { scope: 'event', eventId: event.id }
      : { scope: 'range', startDate: rangeStart, endDate: rangeEnd };
  }

  async function pull(studentId: string) {
    await addOverride({ studentId, ensembleId, action: 'remove', ...scopeFields() } as Omit<RosterOverride, 'id'>);
  }
  async function addSub(studentId: string) {
    await addOverride({ studentId, ensembleId, action: 'add', ...scopeFields() } as Omit<RosterOverride, 'id'>);
    setAdding(false);
  }
  // Find and delete the override backing a sub/pull so it can be undone.
  function undoFor(studentId: string, action: 'add' | 'remove') {
    const match = overrides.find(o => o.studentId === studentId && o.action === action && applies(o));
    if (match) deleteOverride(match.id);
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">Event Roster</span>
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

          {/* Scope toggle: this event vs a date range */}
          <div className="dir-field">
            <label className="dir-label">Changes apply to</label>
            <div className="dir-segment">
              <button className={`dir-segment-btn ${scope === 'event' ? 'active' : ''}`} onClick={() => setScope('event')}>This event</button>
              <button className={`dir-segment-btn ${scope === 'range' ? 'active' : ''}`} onClick={() => setScope('range')}>Date range</button>
            </div>
          </div>
          {scope === 'range' && (
            <div className="dir-field-row">
              <div className="dir-field">
                <label className="dir-label">From</label>
                <input className="dir-input" type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} />
              </div>
              <div className="dir-field">
                <label className="dir-label">To</label>
                <input className="dir-input" type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} />
              </div>
            </div>
          )}

          {/* Expected roster */}
          <div className="dir-roster-section-title">{resolved.length} expected</div>
          {resolved.map(({ student, isSub }) => (
            <div key={student.id} className="dir-sub-row">
              <div className="dir-sub-info">
                <span className="dir-sub-name">{student.name}</span>
                {isSub && <span className="dir-sub-badge">Sub</span>}
                <span className="dir-sub-instr">{student.instrument}</span>
              </div>
              {isSub ? (
                <button className="dir-icon-btn" onClick={() => undoFor(student.id, 'add')} aria-label="Remove sub">
                  <RotateCcw size={16} />
                </button>
              ) : (
                <button className="dir-pull-btn" onClick={() => pull(student.id)}>
                  <UserMinus size={14} /> Pull
                </button>
              )}
            </div>
          ))}

          {/* Pulled-out players */}
          {pulled.length > 0 && (
            <>
              <div className="dir-roster-section-title">Pulled out</div>
              {pulled.map(({ o, student }) => (
                <div key={o.id} className="dir-sub-row pulled">
                  <div className="dir-sub-info">
                    <span className="dir-sub-name">{student!.name}</span>
                    <span className="dir-sub-instr">{student!.instrument}</span>
                  </div>
                  <button className="dir-restore-btn" onClick={() => deleteOverride(o.id)}>
                    <RotateCcw size={14} /> Restore
                  </button>
                </div>
              ))}
            </>
          )}

          {/* Add a sub */}
          {adding ? (
            <div className="dir-add-sub-list">
              <div className="dir-roster-section-title">Add a player</div>
              {candidates.length === 0 && <div className="dir-day-empty">No other active students.</div>}
              {candidates.map(s => (
                <button key={s.id} className="dir-sub-row dir-candidate" onClick={() => addSub(s.id)}>
                  <div className="dir-sub-info">
                    <span className="dir-sub-name">{s.name}</span>
                    <span className="dir-sub-instr">
                      {[s.instrument, s.ensembleIds.map(id => ensembles.find(e => e.id === id)?.name).filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <UserPlus size={16} />
                </button>
              ))}
              <button className="dir-btn dir-btn-ghost" onClick={() => setAdding(false)}>Done</button>
            </div>
          ) : (
            <button className="dir-btn dir-btn-ghost" style={{ marginTop: 8 }} onClick={() => setAdding(true)}>
              <Plus size={16} style={{ verticalAlign: '-3px' }} /> Add a player
            </button>
          )}
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
