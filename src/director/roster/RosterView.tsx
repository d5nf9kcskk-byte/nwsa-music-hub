import { useState, useMemo } from 'react';
import { UserPlus, Users, SlidersHorizontal, Music, MapPinned, CalendarX, FileSpreadsheet } from 'lucide-react';
import { useEnsembles } from '../hooks/useEnsembles';
import { useStudents } from '../hooks/useStudents';
import { useAllAttendance } from '../hooks/useAttendance';
import { useContacts } from '../hooks/useContacts';
import { StudentForm } from './StudentForm';
import { StudentDetail } from './StudentDetail';
import { EnsembleManager } from './EnsembleManager';
import { RepertoireManager } from '../repertoire/RepertoireManager';
import { LocationsManager } from '../locations/LocationsManager';
import { RosterImport } from './RosterImport';
import { ensembleColor } from '../utils';
import { EnsembleFilter } from '../components/EnsembleFilter';
import { seedRoster, seedStudents, seedEnsembles } from '../seedData';
import { resetToBaseline, importBaselineContacts } from '../resetBaseline';
import { sortStudents, type StudentSort } from '../scoreOrder';
import { SortToggle } from '../components/SortToggle';
import type { Student } from '../types';

export function RosterView({ initialEnsembleId = '', initialStudentId, onNavigate }: { initialEnsembleId?: string; initialStudentId?: string; onNavigate?: import('../types-nav').DirNavigate }) {
  const { ensembles, loading: ensemblesLoading } = useEnsembles();
  const { students, loading: studentsLoading, addStudent, updateStudent, deleteStudent } = useStudents();
  const { records } = useAllAttendance();
  const { contacts, saveContact } = useContacts();

  const absenceCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of records) if (r.status === 'Absent') m[r.studentId] = (m[r.studentId] ?? 0) + 1;
    return m;
  }, [records]);
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null | 'new'>(null);

  // Deep-link from search: open the student's profile once the roster loads
  // (React's adjust-state-during-render pattern, guarded by the consumed id).
  const [consumedStudentId, setConsumedStudentId] = useState<string | null>(null);
  if (initialStudentId && consumedStudentId !== initialStudentId && students.length > 0) {
    setConsumedStudentId(initialStudentId);
    const target = students.find(x => x.id === initialStudentId);
    if (target) setViewingStudent(target);
  }
  const [search, setSearch] = useState('');
  const [filterEnsembleId, setFilterEnsembleId] = useState(initialEnsembleId);
  const [sort, setSort] = useState<StudentSort>('lastName');
  // Saved views (redesign Phase 6): fixed, not user-configurable — the two
  // real gaps beyond per-ensemble chips. 'Missing info' = no grade,
  // instrument, or any contact detail on file.
  const [view, setView] = useState<'' | 'seniors' | 'missing' | 'archived'>('');
  const [managingEnsembles, setManagingEnsembles] = useState(false);
  const [managingRepertoire, setManagingRepertoire] = useState(false);
  const [managingLocations, setManagingLocations] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importState, setImportState] = useState<'idle' | 'importing' | 'error'>('idle');
  const [importError, setImportError] = useState('');

  const loading = ensemblesLoading || studentsLoading;
  const isEmpty = !loading && students.length === 0;

  async function handleImport() {
    setImportState('importing');
    setImportError('');
    try {
      await seedRoster();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
      setImportState('error');
    }
  }

  const filtered = students.filter(s => {
    if (!(s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.instrument.toLowerCase().includes(search.toLowerCase()))) return false;
    // Archived (graduated/inactive) students are kept but hidden from every
    // view except the dedicated Archived one.
    if (view === 'archived') return s.status !== 'Active';
    if (s.status !== 'Active') return false;
    if (view === 'seniors') return s.grade === '12th';
    if (view === 'missing') {
      const c = contacts[s.id];
      return !s.grade || !s.instrument || !c || (!c.email && !c.parentEmail && !c.phone && !c.guardians?.length);
    }
    return true;
  });

  const grouped = ensembles
    .filter(e => !filterEnsembleId || e.id === filterEnsembleId)
    .map(e => ({
      ensemble: e,
      students: sortStudents(filtered.filter(s => s.ensembleIds?.includes(e.id)), sort),
    }));
  const unassigned = filterEnsembleId ? [] : sortStudents(filtered.filter(s => !s.ensembleIds?.length), sort);

  return (
    <div>
      <div className="dir-filter-bar">
        {students.length > 0 && (
          <input
            className="dir-input"
            placeholder="Search students…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        )}
        {onNavigate && (
          <button className="dir-tool-btn" onClick={() => onNavigate('whosOut', { ensembleId: filterEnsembleId || undefined })}>
            <CalendarX size={15} /> Who’s out
          </button>
        )}
        <button className="dir-tool-btn" onClick={() => setManagingEnsembles(true)}>
          <SlidersHorizontal size={15} /> Ensembles
        </button>
        <button className="dir-tool-btn" onClick={() => setManagingRepertoire(true)}>
          <Music size={15} /> Repertoire
        </button>
        <button className="dir-tool-btn" onClick={() => setManagingLocations(true)}>
          <MapPinned size={15} /> Locations
        </button>
        <button className="dir-tool-btn" onClick={() => setImporting(true)}>
          <FileSpreadsheet size={15} /> Import
        </button>
      </div>

      {/* Show only my ensemble(s): filter chips + sort */}
      {ensembles.length > 0 && students.length > 0 && (
        <>
          <EnsembleFilter ensembles={ensembles} value={filterEnsembleId} onChange={setFilterEnsembleId} />
          <div className="dir-tabs">
            <button className={`dir-tab dir-tab-view ${view === 'seniors' ? 'active' : ''}`} onClick={() => setView(v => v === 'seniors' ? '' : 'seniors')}>
              Seniors
            </button>
            <button className={`dir-tab dir-tab-view ${view === 'missing' ? 'active' : ''}`} onClick={() => setView(v => v === 'missing' ? '' : 'missing')}>
              Missing info
            </button>
            <button className={`dir-tab dir-tab-view ${view === 'archived' ? 'active' : ''}`} onClick={() => setView(v => v === 'archived' ? '' : 'archived')}>
              Archived
            </button>
          </div>
          <div style={{ padding: '2px 16px 6px' }}>
            <SortToggle value={sort} onChange={setSort} />
          </div>
        </>
      )}

      {grouped.map(({ ensemble, students: grp }) =>
        grp.length === 0 ? null : (
          <div key={ensemble.id} className="dir-roster-group">
            <div className="dir-roster-group-header">
              <span className="dir-roster-swatch" style={{ background: ensembleColor(ensemble) }} />
              {ensemble.name}
              <span className="dir-roster-count">{grp.length}</span>
            </div>
            <div className="dir-roster-list">
              {grp.map(s => (
                <StudentRow key={s.id} student={s} absences={absenceCounts[s.id] ?? 0} onEdit={() => setViewingStudent(s)} />
              ))}
            </div>
          </div>
        )
      )}

      {unassigned.length > 0 && (
        <div className="dir-roster-group">
          <div className="dir-roster-group-header">
            Unassigned
            <span className="dir-roster-count">{unassigned.length}</span>
          </div>
          <div className="dir-roster-list">
            {unassigned.map(s => (
              <StudentRow key={s.id} student={s} absences={absenceCounts[s.id] ?? 0} onEdit={() => setViewingStudent(s)} />
            ))}
          </div>
        </div>
      )}

      {isEmpty && (
        <div className="dir-empty">
          <Users size={40} />
          <h3>No students yet</h3>
          <p>
            Import your NWSA roster — {seedStudents.length} students across{' '}
            {seedEnsembles.length} ensembles — or tap + to add one manually.
          </p>
          {importState === 'error' && (
            <p className="dir-import-error">Import failed: {importError}</p>
          )}
          <button
            className="dir-import-btn"
            onClick={handleImport}
            disabled={importState === 'importing'}
          >
            {importState === 'importing' ? 'Importing…' : 'Import NWSA roster'}
          </button>
        </div>
      )}

      {!isEmpty && filtered.length === 0 && (
        <div className="dir-empty">
          <Users size={40} />
          <h3>No matches</h3>
          <p>No students match "{search}".</p>
        </div>
      )}

      <ResetToBaseline />

      <button className="dir-fab" onClick={() => setEditingStudent('new')} aria-label="Add student">
        <UserPlus size={22} />
      </button>

      {viewingStudent !== null && (
        <StudentDetail
          student={viewingStudent}
          students={students}
          contact={contacts[viewingStudent.id] ?? null}
          ensembles={ensembles}
          onEdit={() => { setEditingStudent(viewingStudent); setViewingStudent(null); }}
          onClose={() => setViewingStudent(null)}
        />
      )}

      {editingStudent !== null && (
        <StudentForm
          student={editingStudent === 'new' ? null : editingStudent}
          contact={editingStudent !== 'new' ? contacts[editingStudent.id] ?? null : null}
          ensembles={ensembles}
          onSave={async (data, contact) => {
            if (editingStudent === 'new') {
              const newId = await addStudent(data);
              if (newId) await saveContact(newId, contact);
            } else {
              await updateStudent(editingStudent.id, data);
              await saveContact(editingStudent.id, contact);
            }
          }}
          onDelete={editingStudent !== 'new' ? async () => {
            await saveContact(editingStudent.id, { email: '', parentEmail: '', phone: '' });
            await deleteStudent(editingStudent.id);
          } : undefined}
          onClose={() => setEditingStudent(null)}
        />
      )}

      {managingEnsembles && <EnsembleManager onClose={() => setManagingEnsembles(false)} />}
      {managingRepertoire && <RepertoireManager onClose={() => setManagingRepertoire(false)} />}
      {managingLocations && <LocationsManager onClose={() => setManagingLocations(false)} />}
      {importing && <RosterImport onClose={() => setImporting(false)} />}
    </div>
  );
}

/**
 * Redesign test-cycle tool (July 2026): wipe student-linked data and import
 * the 2025-26 baseline roster, then load the private contacts file. Quiet by
 * default; destructive action requires typing RESET.
 */
function ResetToBaseline() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [log, setLog] = useState<string[]>([]);
  const [contactsMsg, setContactsMsg] = useState('');

  async function run() {
    setState('running');
    setLog([]);
    try {
      const result = await resetToBaseline(msg => setLog(l => [...l, msg]));
      setLog(l => [...l, `Done — ${result.deleted} old records cleared, ${result.students} students imported.`]);
      setState('done');
    } catch (e) {
      setLog(l => [...l, `Failed: ${e instanceof Error ? e.message : String(e)}`]);
      setState('error');
    }
    setConfirm('');
  }

  async function onContactsFile(file: File | undefined) {
    if (!file) return;
    setContactsMsg('Importing contacts…');
    try {
      const count = await importBaselineContacts(JSON.parse(await file.text()));
      setContactsMsg(`Imported contact info for ${count} students.`);
    } catch (e) {
      setContactsMsg(`Contacts import failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="dir-roster-group" style={{ marginTop: 28, opacity: open ? 1 : 0.75 }}>
      <button
        className="dir-roster-group-header"
        style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit' }}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        Redesign test data {open ? '▾' : '▸'}
      </button>
      {open && (
        <div style={{ padding: '10px 14px', fontSize: 13.5, display: 'grid', gap: 10 }}>
          <p style={{ margin: 0 }}>
            <strong>Reset to the 2025–26 baseline:</strong> clears students, contacts,
            attendance, progress notes, planned absences, sub/pull-outs, seating charts,
            and assignment results, then imports the 86-student baseline roster with
            provisional ensemble assignments. Ensembles, schedule, repertoire,
            announcements, and locations are kept.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Type RESET to confirm"
              aria-label="Type RESET to confirm"
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--dir-border, #ccc)', fontSize: 14 }}
            />
            <button
              className="dir-import-btn"
              disabled={confirm !== 'RESET' || state === 'running'}
              onClick={run}
            >
              {state === 'running' ? 'Resetting…' : 'Reset to baseline'}
            </button>
          </div>
          {log.length > 0 && (
            <div role="status" style={{ fontSize: 12.5, color: state === 'error' ? '#b3372e' : 'inherit' }}>
              {log.map((m, i) => <div key={i}>{m}</div>)}
            </div>
          )}
          <label style={{ display: 'grid', gap: 4 }}>
            <span><strong>Contacts file</strong> (private JSON — never committed to the repo):</span>
            <input type="file" accept=".json,application/json" onChange={e => onContactsFile(e.target.files?.[0])} />
          </label>
          {contactsMsg && <div role="status" style={{ fontSize: 12.5 }}>{contactsMsg}</div>}
        </div>
      )}
    </div>
  );
}

function StudentRow({ student, absences, onEdit }: { student: Student; absences: number; onEdit: () => void }) {
  return (
    <div className="dir-roster-card" onClick={onEdit}>
      <div className={`dir-status-dot ${student.status}`} />
      <div className="dir-roster-info">
        <div className="dir-roster-name">{student.name}</div>
        <div className="dir-roster-detail">
          {[student.instrument, student.section, student.grade].filter(Boolean).join(' · ')}
          {student.status !== 'Active' && ` · ${student.status}`}
        </div>
      </div>
      {absences > 0 && (
        <span className="dir-absence-pill" title={`${absences} absence${absences !== 1 ? 's' : ''}`}>
          {absences} abs
        </span>
      )}
    </div>
  );
}
