import { useMemo, useState } from 'react';
import { Plus, Settings2, UserPlus, ChevronRight, GraduationCap, Sparkles } from 'lucide-react';
import { EnsembleManager } from '../roster/EnsembleManager';
import { EnsembleRosterEditor } from './EnsembleRosterEditor';
import { useEnsembles } from '../hooks/useEnsembles';
import { useStudents } from '../hooks/useStudents';
import { useEvents } from '../hooks/useEvents';
import { todayStr, parseDate, formatTimeRange, ensembleColor, highSchoolClasses, isClassGroup, isMasterClass, groupKindLabel } from '../utils';
import { seedAcademicClasses } from '../seedAcademicClasses';
import { seedMasterclasses } from '../seedMasterclasses';
import { ACADEMIC_CLASSES } from '../academicClasses';
import { MASTERCLASS_SECTIONS } from '../masterclassSections';
import { ORG } from '../../org';
import type { DirNavigate } from '../types-nav';

/**
 * All Classes — high-school classes only (#classes, #college). College
 * dual-enrollment courses live on the College tab.
 */
export function ClassesView({ onNavigate }: { onNavigate: DirNavigate }) {
  const { ensembles } = useEnsembles();
  const { students } = useStudents();
  const { events } = useEvents();
  const [managing, setManaging] = useState<'list' | 'new' | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [seedState, setSeedState] = useState<'idle' | 'seeding' | 'done' | 'error'>('idle');
  const [seedMsg, setSeedMsg] = useState('');
  const [mcSeedState, setMcSeedState] = useState<'idle' | 'seeding' | 'done' | 'error'>('idle');
  const [mcSeedMsg, setMcSeedMsg] = useState('');

  const today = todayStr();
  const classes = useMemo(
    () => highSchoolClasses([...ensembles].sort((a, b) => a.order - b.order)),
    [ensembles],
  );
  const hasAcademicSet = ACADEMIC_CLASSES.every(c => ensembles.some(e => e.id === c.id));
  const hasMasterclassSet = MASTERCLASS_SECTIONS.every(s =>
    ensembles.some(e => e.id === s.id && isMasterClass(e)),
  );
  const memberCount = (id: string) =>
    students.filter(s => s.status === 'Active' && s.ensembleIds?.includes(id)).length;
  const nextMeeting = (id: string) =>
    events
      .filter(e => (e.type === 'Class' || e.type === 'Rehearsal') && e.status !== 'Cancelled' && e.date >= today && e.ensembleIds.includes(id))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '99').localeCompare(b.startTime ?? '99'))[0];

  const addingClass = ensembles.find(e => e.id === addingTo);

  async function handleSeedAcademic() {
    setSeedState('seeding');
    setSeedMsg('');
    try {
      const r = await seedAcademicClasses();
      setSeedMsg(`Created ${r.groups} class groups; enrolled ${r.enrolled} student(s); linked ${r.linked} calendar session(s).`);
      setSeedState('done');
    } catch (e) {
      setSeedMsg(e instanceof Error ? e.message : String(e));
      setSeedState('error');
    }
  }

  async function handleSeedMasterclasses() {
    setMcSeedState('seeding');
    setMcSeedMsg('');
    try {
      const r = await seedMasterclasses();
      setMcSeedMsg(`Created ${r.groups} master class sections; enrolled ${r.enrolled} string player(s); replaced ${r.replaced} generic calendar block(s).`);
      setMcSeedState('done');
    } catch (e) {
      setMcSeedMsg(e instanceof Error ? e.message : String(e));
      setMcSeedState('error');
    }
  }

  return (
    <div className="dir-tab-page">
      <div className="dir-sc-intro">
        <GraduationCap size={18} />
        <span>
          Every class in one place — theory, history, vocal lit, master classes.
          Open a class to post assignments and announcements for its roster, take roll, and share documents.
        </span>
      </div>

      <div className="dir-page-body">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="dir-btn dir-btn-primary" onClick={() => setManaging('new')}>
            <Plus size={16} style={{ verticalAlign: '-3px' }} /> New Class
          </button>
          <button className="dir-btn dir-btn-ghost" onClick={() => setManaging('list')}>
            <Settings2 size={16} style={{ verticalAlign: '-3px' }} /> Edit / Reorder
          </button>
          {ORG.features.calendarSeed && !hasAcademicSet && seedState !== 'done' && (
            <button className="dir-btn dir-btn-ghost" onClick={handleSeedAcademic} disabled={seedState === 'seeding'}>
              <Sparkles size={16} style={{ verticalAlign: '-3px' }} />
              {seedState === 'seeding' ? 'Setting up…' : 'Set up academic classes'}
            </button>
          )}
          {ORG.features.calendarSeed && !hasMasterclassSet && mcSeedState !== 'done' && (
            <button className="dir-btn dir-btn-ghost" onClick={handleSeedMasterclasses} disabled={mcSeedState === 'seeding'}>
              <Sparkles size={16} style={{ verticalAlign: '-3px' }} />
              {mcSeedState === 'seeding' ? 'Setting up…' : 'Set up string master classes'}
            </button>
          )}
        </div>
        {(seedState === 'done' || seedState === 'error') && seedMsg && (
          <div className="dir-field-hint" style={{ marginTop: 8, color: seedState === 'error' ? 'var(--dir-danger)' : undefined }}>
            {seedMsg}
          </div>
        )}
        {(mcSeedState === 'done' || mcSeedState === 'error') && mcSeedMsg && (
          <div className="dir-field-hint" style={{ marginTop: 8, color: mcSeedState === 'error' ? 'var(--dir-danger)' : undefined }}>
            {mcSeedMsg}
          </div>
        )}

        {classes.length === 0 ? (
          <div className="dir-empty-inline">
            No classes yet — tap <strong>New Class</strong> to create one, or use the setup buttons for NWSA theory, choir, and string master classes.
          </div>
        ) : (
          classes.map(e => {
            const count = memberCount(e.id);
            const next = nextMeeting(e.id);
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
                    {` · ${groupKindLabel(e)}`}
                    {next && ` · next meeting ${parseDate(next.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${next.startTime ? ` ${formatTimeRange(next.startTime, next.endTime)}` : ''}`}
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
          defaultKind="class"
          onCreated={id => { setManaging(null); setAddingTo(id); }}
          onClose={() => setManaging(null)}
        />
      )}

      {addingClass && isClassGroup(addingClass) && (
        <EnsembleRosterEditor
          ensembleId={addingClass.id}
          ensembleName={addingClass.name}
          onNavigate={onNavigate}
          onClose={() => setAddingTo(null)}
        />
      )}
    </div>
  );
}
