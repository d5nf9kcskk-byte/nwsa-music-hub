import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ClipboardList, Users, Calendar, Music, Megaphone, MapPin, Clock } from 'lucide-react';
import { useEnsembles } from '../hooks/useEnsembles';
import { useEvents } from '../hooks/useEvents';
import { useStudents } from '../hooks/useStudents';
import { RepertoireManager } from '../repertoire/RepertoireManager';
import { todayStr, parseDate, formatTimeRange, ensembleColor, EVENT_TYPE_ICON } from '../utils';
import type { Ensemble } from '../types';

interface Props {
  onTakeRoll: (ensembleId: string) => void;
  onOpenTab: (tab: 'roster' | 'schedule' | 'announcements') => void;
}

/** Ensembles hub: pick an ensemble → its own mini-dashboard with quick links. */
export function EnsemblesHub({ onTakeRoll, onOpenTab }: Props) {
  const { ensembles } = useEnsembles();
  const { students } = useStudents();
  const [selected, setSelected] = useState<Ensemble | null>(null);

  if (selected) {
    return (
      <EnsemblePage
        ensemble={selected}
        memberCount={students.filter(s => s.status === 'Active' && s.ensembleIds?.includes(selected.id)).length}
        onBack={() => setSelected(null)}
        onTakeRoll={onTakeRoll}
        onOpenTab={onOpenTab}
      />
    );
  }

  return (
    <div className="dir-tab-page">
      <div className="dir-sc-intro"><Users size={18} /> Jump into any ensemble's home base.</div>
      <div className="dir-drawer-body">
        {ensembles.map(e => (
          <button key={e.id} className="dir-ens-row dir-sc-pick" onClick={() => setSelected(e)}>
            <span className="dir-ens-swatch" style={{ background: ensembleColor(e) }} />
            <div className="dir-ens-info">
              <div className="dir-ens-name">{e.name}</div>
              <div className="dir-ens-sub">
                {students.filter(s => s.status === 'Active' && s.ensembleIds?.includes(e.id)).length} students
              </div>
            </div>
            <ChevronRight size={18} style={{ opacity: 0.45, flexShrink: 0 }} />
          </button>
        ))}
      </div>
    </div>
  );
}

function EnsemblePage({ ensemble, memberCount, onBack, onTakeRoll, onOpenTab }: {
  ensemble: Ensemble;
  memberCount: number;
  onBack: () => void;
  onTakeRoll: (id: string) => void;
  onOpenTab: (tab: 'roster' | 'schedule' | 'announcements') => void;
}) {
  const { events } = useEvents();
  const [showRepertoire, setShowRepertoire] = useState(false);
  const today = todayStr();

  const upcoming = useMemo(() => events
    .filter(e => e.ensembleIds.includes(ensemble.id) && e.date >= today && e.status !== 'Cancelled')
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '99').localeCompare(b.startTime ?? '99')),
  [events, ensemble.id, today]);

  const nextRehearsal = upcoming.find(e => e.type === 'Rehearsal' || e.type === 'Sectional');
  const nextConcert = upcoming.find(e => e.type === 'Concert');

  const fmt = (d: string) => parseDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="dir-tab-page">
      <div className="dir-sc-panel-head">
        <button className="dir-drawer-back" onClick={onBack}><ChevronLeft size={18} /> Back</button>
        <div className="dir-sc-student" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="dir-ens-swatch" style={{ background: ensembleColor(ensemble), height: 28 }} />
          <div className="dir-sc-student-name">{ensemble.name}</div>
        </div>
      </div>

      <div className="dir-drawer-body">
        {/* At a glance */}
        <div className="dir-hub-stats">
          <div className="dir-hub-stat"><div className="dir-hub-stat-num">{memberCount}</div><div className="dir-hub-stat-label">students</div></div>
          <div className="dir-hub-stat">
            <div className="dir-hub-stat-num">{nextRehearsal ? fmt(nextRehearsal.date) : '—'}</div>
            <div className="dir-hub-stat-label">next rehearsal</div>
          </div>
          <div className="dir-hub-stat">
            <div className="dir-hub-stat-num">{nextConcert ? fmt(nextConcert.date) : '—'}</div>
            <div className="dir-hub-stat-label">next concert</div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="dir-form-section-label">Quick actions</div>
        <button className="dir-ens-row dir-sc-pick" onClick={() => onTakeRoll(ensemble.id)}>
          <ClipboardList size={19} className="dir-hub-icon" />
          <div className="dir-ens-info"><div className="dir-ens-name">Take Roll</div></div>
          <ChevronRight size={18} style={{ opacity: 0.45 }} />
        </button>
        <button className="dir-ens-row dir-sc-pick" onClick={() => onOpenTab('roster')}>
          <Users size={19} className="dir-hub-icon" />
          <div className="dir-ens-info"><div className="dir-ens-name">Roster</div></div>
          <ChevronRight size={18} style={{ opacity: 0.45 }} />
        </button>
        <button className="dir-ens-row dir-sc-pick" onClick={() => setShowRepertoire(true)}>
          <Music size={19} className="dir-hub-icon" />
          <div className="dir-ens-info"><div className="dir-ens-name">Repertoire</div></div>
          <ChevronRight size={18} style={{ opacity: 0.45 }} />
        </button>
        <button className="dir-ens-row dir-sc-pick" onClick={() => onOpenTab('schedule')}>
          <Calendar size={19} className="dir-hub-icon" />
          <div className="dir-ens-info"><div className="dir-ens-name">Full Schedule</div></div>
          <ChevronRight size={18} style={{ opacity: 0.45 }} />
        </button>
        <button className="dir-ens-row dir-sc-pick" onClick={() => onOpenTab('announcements')}>
          <Megaphone size={19} className="dir-hub-icon" />
          <div className="dir-ens-info"><div className="dir-ens-name">Announcements</div></div>
          <ChevronRight size={18} style={{ opacity: 0.45 }} />
        </button>

        {/* What's ahead */}
        <div className="dir-form-section-label">Coming up</div>
        {upcoming.length === 0 ? (
          <div className="dir-empty-inline">Nothing on the calendar yet.</div>
        ) : (
          upcoming.slice(0, 8).map(e => (
            <div key={e.id} className="dir-ens-row">
              <span className="dir-ens-swatch" style={{ background: ensembleColor(ensemble) }} />
              <div className="dir-ens-info">
                <div className="dir-ens-name">{EVENT_TYPE_ICON[e.type]} {e.title || e.type}</div>
                <div className="dir-ens-sub">
                  {fmt(e.date)}
                  {e.startTime ? <> · <Clock size={11} style={{ verticalAlign: '-1px' }} /> {formatTimeRange(e.startTime, e.endTime)}</> : null}
                  {e.location ? <> · <MapPin size={11} style={{ verticalAlign: '-1px' }} /> {e.location}</> : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showRepertoire && <RepertoireManager ensembleId={ensemble.id} onClose={() => setShowRepertoire(false)} />}
    </div>
  );
}
