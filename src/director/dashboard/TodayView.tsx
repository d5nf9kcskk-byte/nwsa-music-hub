import { useState, useMemo } from 'react';
import { ClipboardList, MapPin, Clock, Music, Plus, GraduationCap, Users, CalendarDays } from 'lucide-react';
import { useEnsembles } from '../hooks/useEnsembles';
import { useEvents } from '../hooks/useEvents';
import { useStudents } from '../hooks/useStudents';
import { useRepertoire } from '../hooks/useRepertoire';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { resolveRoster } from '../rosterResolver';
import { EventForm } from '../schedule/EventForm';
import { todayStr, parseDate, formatTimeRange, ensembleColor, EVENT_TYPE_ICON } from '../utils';
import type { CalendarEvent } from '../types';

interface Props {
  onTakeRoll: (ensembleId: string) => void;
  onOpenSchedule: () => void;
}

/** Director home: today's rehearsals at a glance, one tap into roll/repertoire. */
export function TodayView({ onTakeRoll, onOpenSchedule }: Props) {
  const { ensembles } = useEnsembles();
  const { events, updateEvent } = useEvents();
  const { students } = useStudents();
  const { pieces } = useRepertoire();
  const { overrides } = useRosterOverrides();
  const [filterEnsembleId, setFilterEnsembleId] = useState(() => localStorage.getItem('dir-today-ens') ?? '');
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  const today = todayStr();
  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);
  const piecesById = useMemo(() => Object.fromEntries(pieces.map(p => [p.id, p])), [pieces]);
  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);

  function pickFilter(id: string) {
    const next = filterEnsembleId === id ? '' : id;
    setFilterEnsembleId(next);
    localStorage.setItem('dir-today-ens', next);
  }

  const todaysEvents = useMemo(() => events
    .filter(e => e.date === today && e.status !== 'Cancelled')
    .filter(e => !filterEnsembleId || e.ensembleIds.length === 0 || e.ensembleIds.includes(filterEnsembleId))
    .sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99')),
  [events, today, filterEnsembleId]);

  const schoolToday = todaysEvents.filter(e => e.ensembleIds.length === 0);
  const rehearsalsToday = todaysEvents.filter(e => e.ensembleIds.length > 0);

  const lessonsToday = useMemo(() => overrides
    .filter(o => o.kind === 'lesson' && o.startDate && o.endDate && o.startDate <= today && today <= o.endDate)
    .filter(o => !filterEnsembleId || o.ensembleId === filterEnsembleId)
    .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? '')),
  [overrides, today, filterEnsembleId]);

  const studentName = (id: string) => students.find(s => s.id === id)?.name ?? 'Student';
  const dateLabel = parseDate(today).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="dir-tab-page">
      <div className="dir-today-hero">
        <div className="dir-today-date">{dateLabel}</div>
        <div className="dir-today-title">Today at NWSA</div>
      </div>

      {ensembles.length > 0 && (
        <div className="dir-tabs">
          <button className={`dir-tab ${!filterEnsembleId ? 'active' : ''}`} onClick={() => pickFilter('')}>All</button>
          {ensembles.map(e => (
            <button key={e.id} className={`dir-tab ${filterEnsembleId === e.id ? 'active' : ''}`} onClick={() => pickFilter(e.id)}>
              {e.name}
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: '4px 16px 20px' }}>
        {schoolToday.map(e => (
          <div key={e.id} className="dir-today-school">🏫 {e.title}</div>
        ))}

        {rehearsalsToday.length === 0 ? (
          <div className="dir-empty">
            <CalendarDays size={40} />
            <h3>Nothing scheduled today</h3>
            <p>Enjoy the quiet — or check the full schedule.</p>
            <button className="dir-btn dir-btn-primary" onClick={onOpenSchedule}>Open Schedule</button>
          </div>
        ) : (
          rehearsalsToday.map(e => {
            const primary = ensembleMap[e.ensembleIds[0]];
            const names = e.ensembleIds.map(id => ensembleMap[id]?.name).filter(Boolean).join(' + ');
            const expected = e.ensembleIds.reduce((n, ensId) =>
              n + resolveRoster(students, overrides, { ensembleId: ensId, eventId: e.id, eventsById }).length, 0);
            const linked = (e.pieceIds ?? []).map(id => piecesById[id]).filter(Boolean);
            return (
              <div key={e.id} className="dir-today-card">
                <div className="dir-today-stripe" style={{ background: primary ? ensembleColor(primary) : '#94a3b8' }} />
                <div className="dir-today-body">
                  <div className="dir-today-head">
                    {EVENT_TYPE_ICON[e.type]} {e.title || names || e.type}
                  </div>
                  <div className="dir-today-meta">
                    {e.startTime && <span><Clock size={13} /> {formatTimeRange(e.startTime, e.endTime)}</span>}
                    {e.location && <span><MapPin size={13} /> {e.location}</span>}
                    <span><Users size={13} /> {expected} expected</span>
                  </div>
                  {linked.length > 0 ? (
                    <div className="dir-today-rep">
                      <Music size={13} /> {linked.map(p => p.title).join(' · ')}
                    </div>
                  ) : (
                    <div className="dir-today-rep muted">
                      <Music size={13} /> No repertoire set for this rehearsal yet
                    </div>
                  )}
                  <div className="dir-today-actions">
                    {e.ensembleIds.map(id => ensembleMap[id] && (
                      <button key={id} className="dir-btn dir-btn-primary dir-today-action" onClick={() => onTakeRoll(id)}>
                        <ClipboardList size={15} /> Take Roll{e.ensembleIds.length > 1 ? ` · ${ensembleMap[id].name}` : ''}
                      </button>
                    ))}
                    <button className="dir-btn dir-btn-ghost dir-today-action" onClick={() => setEditingEvent(e)}>
                      {linked.length > 0 ? <><Music size={15} /> Repertoire</> : <><Plus size={15} /> Add repertoire</>}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {lessonsToday.length > 0 && (
          <>
            <div className="dir-form-section-label">Lessons today</div>
            {lessonsToday.map(o => (
              <div key={o.id} className="dir-sc-ov lesson">
                <div className="dir-sc-ov-body">
                  <div className="dir-sc-ov-title"><GraduationCap size={14} /> {studentName(o.studentId)}</div>
                  <div className="dir-sc-ov-meta">
                    Out of {ensembleMap[o.ensembleId]?.name ?? 'rehearsal'}
                    {o.startTime && o.endTime ? ` · ${formatTimeRange(o.startTime, o.endTime)}` : ''}
                    {o.reason ? ` · ${o.reason}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {editingEvent && (
        <EventForm
          event={editingEvent}
          ensembles={ensembles}
          defaultDate={today}
          onSave={async data => { await updateEvent(editingEvent.id, data); }}
          onClose={() => setEditingEvent(null)}
        />
      )}
    </div>
  );
}
