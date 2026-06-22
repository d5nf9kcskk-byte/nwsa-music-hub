import { useState, useMemo } from 'react';
import { UserPlus, Users, SlidersHorizontal, Music } from 'lucide-react';
import { useEnsembles } from '../hooks/useEnsembles';
import { useStudents } from '../hooks/useStudents';
import { useAllAttendance } from '../hooks/useAttendance';
import { useContacts } from '../hooks/useContacts';
import { StudentForm } from './StudentForm';
import { StudentDetail } from './StudentDetail';
import { EnsembleManager } from './EnsembleManager';
import { RepertoireManager } from '../repertoire/RepertoireManager';
import { ensembleColor } from '../utils';
import { seedRoster, seedStudents, seedEnsembles } from '../seedData';
import type { Student } from '../types';

export function RosterView() {
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
  const [search, setSearch] = useState('');
  const [managingEnsembles, setManagingEnsembles] = useState(false);
  const [managingRepertoire, setManagingRepertoire] = useState(false);
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

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.instrument.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = ensembles.map(e => ({
    ensemble: e,
    students: filtered.filter(s => s.ensembleIds?.includes(e.id)),
  }));
  const unassigned = filtered.filter(s => !s.ensembleIds?.length);

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
        <button className="dir-tool-btn" onClick={() => setManagingEnsembles(true)}>
          <SlidersHorizontal size={15} /> Ensembles
        </button>
        <button className="dir-tool-btn" onClick={() => setManagingRepertoire(true)}>
          <Music size={15} /> Repertoire
        </button>
      </div>

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
          onSave={async (data, contactDraft) => {
            if (editingStudent === 'new') {
              const newId = await addStudent(data);
              if (newId) await saveContact(newId, contactDraft);
            } else {
              await updateStudent(editingStudent.id, data);
              await saveContact(editingStudent.id, contactDraft);
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
