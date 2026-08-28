import { useMemo, useState } from 'react';
import { Plus, Settings2, UserPlus, ChevronRight, GraduationCap, Sparkles, Music } from 'lucide-react';
import { EnsembleManager } from '../roster/EnsembleManager';
import { EnsembleRosterEditor } from './EnsembleRosterEditor';
import { useEnsembles } from '../hooks/useEnsembles';
import { useStudents } from '../hooks/useStudents';
import { useEvents } from '../hooks/useEvents';
import {
  todayStr, parseDate, formatTimeRange, ensembleColor,
  collegeEnsembles, collegeClasses, groupKindLabel,
} from '../utils';
import { seedCollegeProgram } from '../seedCollege';
import { COLLEGE_CLASSES, COLLEGE_ENSEMBLES } from '../collegeClasses';
import { ORG } from '../../org';
import type { DirNavigate } from '../types-nav';

/**
 * College area — dual-enrollment ensembles and classes in one place, kept
 * out of All Ensembles / All Classes so HS lists stay clean.
 */
export function CollegeView({ onNavigate }: { onNavigate: DirNavigate }) {
  const { ensembles } = useEnsembles();
  const { students } = useStudents();
  const { events } = useEvents();
  const [managing, setManaging] = useState<'list' | 'new-ensemble' | 'new-class' | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [seedState, setSeedState] = useState<'idle' | 'seeding' | 'done' | 'error'>('idle');
  const [seedMsg, setSeedMsg] = useState('');

  const today = todayStr();
  const ens = useMemo(
    () => collegeEnsembles([...ensembles].sort((a, b) => a.order - b.order)),
    [ensembles],
  );
  const classes = useMemo(
    () => collegeClasses([...ensembles].sort((a, b) => a.order - b.order)),
    [ensembles],
  );
  const hasSeedSet =
    COLLEGE_ENSEMBLES.every(c => ensembles.some(e => e.id === c.id && e.collegeLevel))
    && COLLEGE_CLASSES.every(c => ensembles.some(e => e.id === c.id && e.collegeLevel));

  const memberCount = (id: string) =>
    students.filter(s => s.status === 'Active' && s.ensembleIds?.includes(id)).length;
  const nextMeeting = (id: string) =>
    events
      .filter(e =>
        (e.type === 'Class' || e.type === 'Rehearsal')
        && e.status !== 'Cancelled'
        && e.date >= today
        && e.ensembleIds.includes(id),
      )
      .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '99').localeCompare(b.startTime ?? '99'))[0];

  const addingGroup = ensembles.find(e => e.id === addingTo);

  async function handleSeed() {
    setSeedState('seeding');
    setSeedMsg('');
    try {
      const r = await seedCollegeProgram();
      setSeedMsg(
        `College: ${r.ensembles} ensemble(s), ${r.classes} class(es), ${r.sessions} calendar session(s).`,
      );
      setSeedState('done');
    } catch (e) {
      setSeedMsg(e instanceof Error ? e.message : String(e));
      setSeedState('error');
    }
  }

  function row(e: (typeof ensembles)[number]) {
    const count = memberCount(e.id);
    const next = nextMeeting(e.id);
    const kind = groupKindLabel(e);
    return (
      <div key={e.id} className="dir-ens-row">
        <span className="dir-ens-swatch" style={{ background: ensembleColor(e) }} />
        <button
          className="dir-ens-info"
          style={{ background: 'none', border: 'none', textAlign: 'left', padding: 0, cursor: 'pointer' }}
          onClick={() => onNavigate('ensembleHub', { ensembleId: e.id })}
        >
          <div className="dir-ens-name">
            {e.name} <ChevronRight size={14} style={{ verticalAlign: '-2px', opacity: 0.5 }} />
          </div>
          <div className="dir-ens-sub">
            {kind ? `${kind} · ` : ''}
            {count} student{count === 1 ? '' : 's'}
            {e.conductorName ? ` · ${e.conductorName}` : ''}
            {next && ` · next ${parseDate(next.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${next.startTime ? ` ${formatTimeRange(next.startTime, next.endTime)}` : ''}`}
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
  }

  return (
    <div className="dir-tab-page">
      <div className="dir-sc-intro">
        <GraduationCap size={18} />
        <span>
          College ensembles and dual-enrollment classes — separate from the high-school lists.
          College students still play in Symphony and other shared groups; those stay under Ensembles.
        </span>
      </div>

      <div className="dir-page-body">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="dir-btn dir-btn-primary" onClick={() => setManaging('new-ensemble')}>
            <Plus size={16} style={{ verticalAlign: '-3px' }} /> New College Ensemble
          </button>
          <button className="dir-btn dir-btn-primary" onClick={() => setManaging('new-class')}>
            <Plus size={16} style={{ verticalAlign: '-3px' }} /> New College Class
          </button>
          <button className="dir-btn dir-btn-ghost" onClick={() => setManaging('list')}>
            <Settings2 size={16} style={{ verticalAlign: '-3px' }} /> Edit / Reorder
          </button>
          {ORG.features.calendarSeed && !hasSeedSet && seedState !== 'done' && (
            <button className="dir-btn dir-btn-ghost" onClick={handleSeed} disabled={seedState === 'seeding'}>
              <Sparkles size={16} style={{ verticalAlign: '-3px' }} />
              {seedState === 'seeding' ? 'Setting up…' : 'Set up college program'}
            </button>
          )}
        </div>
        {(seedState === 'done' || seedState === 'error') && seedMsg && (
          <div className="dir-field-hint" style={{ marginTop: 8, color: seedState === 'error' ? 'var(--dir-danger)' : undefined }}>
            {seedMsg}
          </div>
        )}

        <h2 className="dir-section-title" style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Music size={16} /> College Ensembles
        </h2>
        {ens.length === 0 ? (
          <div className="dir-empty-inline">No college ensembles yet — use Set up college program or New College Ensemble.</div>
        ) : ens.map(row)}

        <h2 className="dir-section-title" style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 8 }}>
          <GraduationCap size={16} /> College Classes
        </h2>
        {classes.length === 0 ? (
          <div className="dir-empty-inline">No college classes yet — use Set up college program or New College Class.</div>
        ) : classes.map(row)}
      </div>

      {managing && (
        <EnsembleManager
          startNew={managing === 'new-ensemble' || managing === 'new-class'}
          defaultKind={managing === 'new-class' ? 'class' : 'ensemble'}
          defaultCollegeLevel
          onCreated={id => { setManaging(null); setAddingTo(id); }}
          onClose={() => setManaging(null)}
        />
      )}
      {addingGroup && (
        <EnsembleRosterEditor
          ensembleId={addingGroup.id}
          ensembleName={addingGroup.name}
          onNavigate={onNavigate}
          onClose={() => setAddingTo(null)}
        />
      )}
    </div>
  );
}
