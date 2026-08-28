import { useMemo, useState } from 'react';
import { Plus, Settings2, UserPlus, ChevronRight, Music } from 'lucide-react';
import { EnsembleManager } from '../roster/EnsembleManager';
import { EnsembleRosterEditor } from './EnsembleRosterEditor';
import { useEnsembles } from '../hooks/useEnsembles';
import { useStudents } from '../hooks/useStudents';
import { useEvents } from '../hooks/useEvents';
import { todayStr, parseDate, formatTimeRange, ensembleColor, highSchoolEnsembles } from '../utils';
import type { DirNavigate } from '../types-nav';

/**
 * All Ensembles — high-school performing groups only (#classes, #college).
 * Classes live on the Classes tab; college ensembles on the College tab.
 */
export function EnsemblesView({ onNavigate }: { onNavigate: DirNavigate }) {
  const { ensembles } = useEnsembles();
  const { students } = useStudents();
  const { events } = useEvents();
  const [managing, setManaging] = useState<'list' | 'new' | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  const today = todayStr();
  const performing = useMemo(
    () => highSchoolEnsembles([...ensembles].sort((a, b) => a.order - b.order)),
    [ensembles],
  );
  const memberCount = (id: string) =>
    students.filter(s => s.status === 'Active' && s.ensembleIds?.includes(id)).length;
  const nextRehearsal = (id: string) =>
    events
      .filter(e => e.type === 'Rehearsal' && e.status !== 'Cancelled' && e.date >= today && e.ensembleIds.includes(id))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '99').localeCompare(b.startTime ?? '99'))[0];

  const addingEnsemble = ensembles.find(e => e.id === addingTo);

  return (
    <div className="dir-tab-page">
      <div className="dir-sc-intro">
        <Music size={18} />
        <span>
          Every performing ensemble in one place — create one, add students to its roster, or open its
          hub. Tap a name to see its schedule, roll, repertoire, and documents.
        </span>
      </div>

      <div className="dir-page-body">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="dir-btn dir-btn-primary" onClick={() => setManaging('new')}>
            <Plus size={16} style={{ verticalAlign: '-3px' }} /> New Ensemble
          </button>
          <button className="dir-btn dir-btn-ghost" onClick={() => setManaging('list')}>
            <Settings2 size={16} style={{ verticalAlign: '-3px' }} /> Edit / Reorder
          </button>
        </div>

        {performing.length === 0 ? (
          <div className="dir-empty-inline">
            No ensembles yet — tap <strong>New Ensemble</strong> to create the first one.
          </div>
        ) : (
          performing.map(e => {
            const count = memberCount(e.id);
            const next = nextRehearsal(e.id);
            return (
              <div key={e.id} className="dir-ens-row">
                <span className="dir-ens-swatch" style={{ background: ensembleColor(e) }} />
                <button
                  className="dir-ens-info"
                  style={{ background: 'none', border: 'none', textAlign: 'left', padding: 0, cursor: 'pointer' }}
                  onClick={() => onNavigate('ensembleHub', { ensembleId: e.id })}
                >
                  <div className="dir-ens-name">{e.name} <ChevronRight size={14} style={{ verticalAlign: '-2px', opacity: 0.5 }} /></div>
                  <div className="dir-ens-sub">
                    {count} student{count === 1 ? '' : 's'}
                    {count === 0 && ' — add some below'}
                    {next && ` · next rehearsal ${parseDate(next.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${next.startTime ? ` ${formatTimeRange(next.startTime, next.endTime)}` : ''}`}
                  </div>
                </button>
                <button
                  className="dir-btn dir-btn-ghost dir-sc-small"
                  style={{ flexShrink: 0 }}
                  onClick={() => setAddingTo(e.id)}
                >
                  <UserPlus size={14} style={{ verticalAlign: '-2px' }} /> Add students
                </button>
              </div>
            );
          })
        )}
      </div>

      {managing && (
        <EnsembleManager
          startNew={managing === 'new'}
          onCreated={id => { setManaging(null); setAddingTo(id); }}
          onClose={() => setManaging(null)}
        />
      )}

      {addingEnsemble && (
        <EnsembleRosterEditor
          ensembleId={addingEnsemble.id}
          ensembleName={addingEnsemble.name}
          onNavigate={onNavigate}
          onClose={() => setAddingTo(null)}
        />
      )}
    </div>
  );
}
