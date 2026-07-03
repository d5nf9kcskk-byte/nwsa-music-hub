import { useMemo, useState } from 'react';
import { ClipboardList, MapPin, Clock, Music, GraduationCap, CalendarPlus, Users } from 'lucide-react';
import { useEnsembles } from '../hooks/useEnsembles';
import { useEvents } from '../hooks/useEvents';
import { useStudents } from '../hooks/useStudents';
import { useRepertoire } from '../hooks/useRepertoire';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { resolveRoster } from '../rosterResolver';
import { todayStr, formatTimeRange, ensembleColor, EVENT_TYPE_ICON } from '../utils';
import type { CalendarEvent } from '../types';
import type { DirNavigate } from '../types-nav';

const ENS_PREF_KEY = 'dir.today.ensemble';

/** The director's landing page: today's schedule with one-tap jumps. */
export function TodayView({ onNavigate }: { onNavigate: DirNavigate }) {
  const { ensembles } = useEnsembles();
  const { events } = useEvents();
  const { students } = useStudents();
  const { pieces } = useRepertoire();
  const { overrides } = useRosterOverrides();
  const [ensembleId, setEnsembleId] = useState(() => localStorage.getItem(ENS_PREF_KEY) ?? '');

  const today = todayStr();
  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);
  const piecesById = useMemo(() => Object.fromEntries(pieces.map(p => [p.id, p])), [pieces]);
  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);

  function pickEnsemble(id: string) {
    const next = ensembleId === id ? '' : id;
    setEnsembleId(next);
    localStorage.setItem(ENS_PREF_KEY, next);
  }

  const todays = useMemo(() =>
    events
      .filter(e => e.date === today)
      .filter(e => !ensembleId || e.ensembleIds.length === 0 || e.ensembleIds.includes(ensembleId))
      .sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99')),
    [events, today, ensembleId]);

  const lessonsToday = useMemo(() =>
    overrides
      .filter(o => o.kind === 'lesson' && o.startDate && o.endDate && o.startDate <= today && today <= o.endDate)
      .filter(o => !ensembleId || o.ensembleId === ensembleId)
      .sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99')),
    [overrides, today, ensembleId]);

  const studentsById = useMemo(() => Object.fromEntries(students.map(s => [s.id, s])), [students]);

  const dateLabel = new Date(today + 'T12:00:00')
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="dir-tab-page">
      <div className="dir-today-hero">
        <div className="dir-today-date">{dateLabel}</div>
        <div className="dir-today-title">Today at NWSA</div>
      </div>

      {ensembles.length > 0 && (
        <div className="dir-tabs">
          <button className={`dir-tab ${!ensembleId ? 'active' : ''}`} onClick={() => pickEnsemble('')}>All</button>
          {ensembles.map(e => (
            <button
              key={e.id}
              className={`dir-tab ${ensembleId === e.id ? 'active' : ''}`}
              onClick={() => pickEnsemble(e.id)}
            >
              {e.name}
            </button>
          ))}
        </div>
      )}

      <div className="dir-drawer-body">
        {todays.length === 0 ? (
          <div className="dir-empty-inline">
            Nothing scheduled today{ensembleId ? ' for this ensemble' : ''}.
            <button className="dir-btn dir-btn-ghost dir-sc-small" style={{ marginLeft: 8 }} onClick={() => onNavigate('schedule', { date: today })}>
              <CalendarPlus size={14} /> Open schedule
            </button>
          </div>
        ) : (
          todays.map(ev => (
            <TodayCard
              key={ev.id}
              event={ev}
              ensembleMap={ensembleMap}
              piecesById={piecesById}
              expected={ev.ensembleIds.length > 0
                ? ev.ensembleIds.reduce((n, id) => n + resolveRoster(students, overrides, { ensembleId: id, eventId: ev.id, eventsById }).length, 0)
                : null}
              onNavigate={onNavigate}
            />
          ))
        )}

        {lessonsToday.length > 0 && (
          <>
            <div className="dir-form-section-label"><GraduationCap size={13} style={{ verticalAlign: '-2px' }} /> Lessons today</div>
            {lessonsToday.map(o => (
              <div key={o.id} className="dir-sc-ov lesson">
                <div className="dir-sc-ov-body">
                  <div className="dir-sc-ov-title">{studentsById[o.studentId]?.name ?? 'Student'}</div>
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
    </div>
  );
}

function TodayCard({
  event, ensembleMap, piecesById, expected, onNavigate,
}: {
  event: CalendarEvent;
  ensembleMap: Record<string, { id: string; name: string; order: number; color?: string }>;
  piecesById: Record<string, { id: string; title: string }>;
  expected: number | null;
  onNavigate: DirNavigate;
}) {
  const firstEns = event.ensembleIds.map(id => ensembleMap[id]).find(Boolean);
  const name = event.title
    || event.ensembleIds.map(id => ensembleMap[id]?.name).filter(Boolean).join(' + ')
    || 'School';
  const linkedPieces = (event.pieceIds ?? []).map(id => piecesById[id]?.title).filter(Boolean);
  const isRehearsal = event.type === 'Rehearsal' && event.ensembleIds.length > 0;
  const cancelled = event.status === 'Cancelled';

  return (
    <div className={`dir-today-card ${cancelled ? 'cancelled' : ''}`}>
      <div className="dir-today-stripe" style={{ background: firstEns ? ensembleColor(firstEns) : '#94a3b8' }} />
      <div className="dir-today-body">
        <div className="dir-today-name">
          <span className="dir-today-icon">{EVENT_TYPE_ICON[event.type]}</span> {name}
          {cancelled && <span className="dir-today-tag cancelled">Cancelled</span>}
          {!cancelled && event.changeNote && <span className="dir-today-tag changed">Changed</span>}
        </div>
        <div className="dir-today-meta">
          {event.startTime && <span><Clock size={13} /> {formatTimeRange(event.startTime, event.endTime)}</span>}
          {event.location && <span><MapPin size={13} /> {event.location}</span>}
          {expected != null && <span><Users size={13} /> {expected} expected</span>}
        </div>
        {event.changeNote && <div className="dir-today-change">⚠ {event.changeNote}</div>}
        <div className="dir-today-rep">
          <Music size={13} />
          {linkedPieces.length > 0
            ? linkedPieces.join(' · ')
            : event.repertoire
              ? event.repertoire
              : <em>No repertoire chosen yet</em>}
        </div>
        <div className="dir-today-actions">
          {isRehearsal && !cancelled && (
            <button className="dir-btn dir-btn-primary dir-today-action" onClick={() => onNavigate('roll', { ensembleId: event.ensembleIds[0] })}>
              <ClipboardList size={15} /> Take Roll
            </button>
          )}
          <button className="dir-btn dir-btn-ghost dir-today-action" onClick={() => onNavigate('schedule', { date: event.date, eventId: event.id })}>
            {linkedPieces.length > 0 || event.repertoire ? 'Details' : 'Add repertoire'}
          </button>
        </div>
      </div>
    </div>
  );
}
