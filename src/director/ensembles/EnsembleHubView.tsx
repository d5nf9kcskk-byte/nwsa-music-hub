import { useMemo, useState } from 'react';
import { ClipboardList, Users, Calendar, Music, Megaphone, Clock, MapPin, Sparkles, Armchair, FolderOpen } from 'lucide-react';
import { SeatingManager } from '../seating/SeatingManager';
import { useEnsembles } from '../hooks/useEnsembles';
import { useEvents } from '../hooks/useEvents';
import { useStudents } from '../hooks/useStudents';
import { useAnnouncements } from '../hooks/useAnnouncements';
import { todayStr, parseDate, formatTimeRange, ensembleColor, EVENT_TYPE_ICON } from '../utils';
import type { DirNavigate } from '../types-nav';

/** Per-ensemble dashboard: next rehearsal, upcoming concerts, quick links. */
export function EnsembleHubView({ ensembleId, onNavigate }: { ensembleId: string; onNavigate: DirNavigate }) {
  const { ensembles } = useEnsembles();
  const { events } = useEvents();
  const { students } = useStudents();
  const { announcements } = useAnnouncements();

  const ensemble = ensembles.find(e => e.id === ensembleId);
  const today = todayStr();
  const [showSeating, setShowSeating] = useState(false);

  const mine = useMemo(
    () => events
      .filter(e => e.ensembleIds.includes(ensembleId) && e.status !== 'Cancelled' && e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '99').localeCompare(b.startTime ?? '99')),
    [events, ensembleId, today],
  );
  const nextRehearsal = mine.find(e => e.type === 'Rehearsal');
  // Concerts AND other non-rehearsal happenings (Events, Sectionals) both belong here.
  const upcomingConcerts = mine.filter(e => e.type !== 'Rehearsal').slice(0, 5);
  const rosterCount = students.filter(s => s.status === 'Active' && s.ensembleIds?.includes(ensembleId)).length;
  const myAnnouncements = announcements.filter(a => a.ensembleId === null || a.ensembleId === ensembleId).length;

  if (!ensemble) return <div className="dir-loading">Loading…</div>;
  const color = ensembleColor(ensemble);

  const fmtDay = (d: string) => parseDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="dir-tab-page">
      <div className="dir-hub-hero" style={{ borderColor: color }}>
        <span className="dir-ens-swatch" style={{ background: color, height: 44 }} />
        <div>
          <div className="dir-today-title">{ensemble.name}</div>
          <div className="dir-ens-sub">{rosterCount} active students</div>
        </div>
      </div>

      <div className="dir-drawer-body">
        <div className="dir-form-section-label">Next rehearsal</div>
        {nextRehearsal ? (
          <div className="dir-today-card">
            <div className="dir-today-stripe" style={{ background: color }} />
            <div className="dir-today-body">
              <div className="dir-today-name">{fmtDay(nextRehearsal.date)}{nextRehearsal.date === today ? ' — today' : ''}</div>
              <div className="dir-today-meta">
                {nextRehearsal.startTime && <span><Clock size={13} /> {formatTimeRange(nextRehearsal.startTime, nextRehearsal.endTime)}</span>}
                {nextRehearsal.location && <span><MapPin size={13} /> {nextRehearsal.location}</span>}
              </div>
              {nextRehearsal.changeNote && <div className="dir-today-change">⚠ {nextRehearsal.changeNote}</div>}
              <div className="dir-today-actions">
                {nextRehearsal.date === today && (
                  <button className="dir-btn dir-btn-primary dir-today-action" onClick={() => onNavigate('roll', { ensembleId })}>
                    <ClipboardList size={15} /> Take Roll
                  </button>
                )}
                <button className="dir-btn dir-btn-ghost dir-today-action" onClick={() => onNavigate('schedule', { date: nextRehearsal.date, eventId: nextRehearsal.id })}>
                  Details / repertoire
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="dir-empty-inline">No upcoming rehearsals on the calendar.</div>
        )}

        <div className="dir-form-section-label">Upcoming concerts & events</div>
        {upcomingConcerts.length === 0 ? (
          <div className="dir-empty-inline">No concerts or events scheduled yet.</div>
        ) : (
          upcomingConcerts.map(c => (
            <button key={c.id} className="dir-ens-row dir-sc-pick" onClick={() => onNavigate('schedule', { date: c.date, eventId: c.id })}>
              <span className="dir-today-icon">{EVENT_TYPE_ICON[c.type]}</span>
              <div className="dir-ens-info">
                <div className="dir-ens-name">{c.title || c.type}</div>
                <div className="dir-ens-sub">{fmtDay(c.date)}{c.startTime ? ` · ${formatTimeRange(c.startTime, c.endTime)}` : ''}{c.location ? ` · ${c.location}` : ''}</div>
              </div>
            </button>
          ))
        )}

        <div className="dir-form-section-label">Everything for {ensemble.name}</div>
        <div className="dir-hub-grid">
          <button className="dir-hub-btn" onClick={() => onNavigate('roll', { ensembleId })}>
            <ClipboardList size={20} /> Take Roll
          </button>
          <button className="dir-hub-btn" onClick={() => onNavigate('roster', { ensembleId })}>
            <Users size={20} /> Roster
          </button>
          <button className="dir-hub-btn" onClick={() => onNavigate('schedule', { ensembleId })}>
            <Calendar size={20} /> Schedule
          </button>
          <button className="dir-hub-btn" onClick={() => onNavigate('repertoire', { ensembleId })}>
            <Music size={20} /> Repertoire
          </button>
          <button className="dir-hub-btn" onClick={() => onNavigate('documents', { ensembleId })}>
            <FolderOpen size={20} /> Documents
          </button>
          <button className="dir-hub-btn" onClick={() => onNavigate('announcements')}>
            <Megaphone size={20} /> Announcements{myAnnouncements > 0 ? ` (${myAnnouncements})` : ''}
          </button>
          <button className="dir-hub-btn" onClick={() => onNavigate('scheduleChanges', { ensembleId })}>
            <Sparkles size={20} /> Temporary Roster Changes
          </button>
          <button className="dir-hub-btn" onClick={() => setShowSeating(true)}>
            <Armchair size={20} /> Seating
          </button>
        </div>
      </div>

      {showSeating && (
        <SeatingManager ensembleId={ensembleId} ensembleName={ensemble.name} onClose={() => setShowSeating(false)} />
      )}
    </div>
  );
}
