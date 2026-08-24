import { useMemo, useState } from 'react';
import { Plus, Settings2, UserPlus, ChevronRight, Music } from 'lucide-react';
import { EnsembleManager } from '../roster/EnsembleManager';
import { EnsembleRosterEditor } from './EnsembleRosterEditor';
import { useEnsembles } from '../hooks/useEnsembles';
import { useStudents } from '../hooks/useStudents';
import { useEvents } from '../hooks/useEvents';
import { todayStr, parseDate, formatTimeRange, ensembleColor, performingEnsembles, classGroups, isClassGroup, isMasterClass } from '../utils';
import type { DirNavigate } from '../types-nav';

/**
 * All Ensembles — the central place for everything ensemble-shaped (#ux):
 * create one, build its student roster, and jump into any ensemble's hub.
 * Previously creation was buried inside Roster and adding students to a new
 * ensemble had no obvious path at all.
 */
export function EnsemblesView({ onNavigate }: { onNavigate: DirNavigate }) {
  const { ensembles } = useEnsembles();
  const { students } = useStudents();
  const { events } = useEvents();
  const [managing, setManaging] = useState<'list' | 'new' | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  const today = todayStr();
  const sorted = useMemo(() => [...ensembles].sort((a, b) => a.order - b.order), [ensembles]);
  // Classes list apart from ensembles (#classes): a master class among the
  // orchestras reads as another orchestra, and the two answer different
  // questions ("who performs this?" vs "who is enrolled?").
  const performing = useMemo(() => performingEnsembles(sorted), [sorted]);
  const classes = useMemo(() => classGroups(sorted), [sorted]);
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
          Every ensemble and class in one place — create one, add students to its roster, or open its
          hub. Tap a name to see its schedule, roll, documents, and (for ensembles) repertoire.
        </span>
      </div>

      <div className="dir-page-body">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="dir-btn dir-btn-primary" onClick={() => setManaging('new')}>
            <Plus size={16} style={{ verticalAlign: '-3px' }} /> New Group
          </button>
          <button className="dir-btn dir-btn-ghost" onClick={() => setManaging('list')}>
            <Settings2 size={16} style={{ verticalAlign: '-3px' }} /> Edit / Reorder
          </button>
        </div>

        {sorted.length === 0 ? (
          <div className="dir-empty-inline">
            No groups yet — tap <strong>New Group</strong> to create the first one.
          </div>
        ) : (
          [...performing, ...classes].map(e => {
            const count = memberCount(e.id);
            const next = nextRehearsal(e.id);
            const firstClass = classes.length > 0 && e.id === classes[0].id;
            return (
              <div key={e.id}>
              {firstClass && (
                <div className="dir-field-hint" style={{ margin: '14px 0 6px' }}>
                  Classes — rosters and roll, no repertoire
                </div>
              )}
              <div className="dir-ens-row">
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
                    {isClassGroup(e) && ` · ${e.collegeLevel ? 'college ' : ''}${isMasterClass(e) ? 'master class' : 'class'}`}
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
