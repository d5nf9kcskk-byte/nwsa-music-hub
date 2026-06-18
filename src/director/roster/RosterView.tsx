import { useState } from 'react';
import { UserPlus, Users } from 'lucide-react';
import { useEnsembles } from '../hooks/useEnsembles';
import { useStudents } from '../hooks/useStudents';
import { StudentForm } from './StudentForm';
import { seedRoster, seedStudents, seedEnsembles } from '../seedData';
import type { Student } from '../types';

export function RosterView() {
  const { ensembles, loading: ensemblesLoading } = useEnsembles();
  const { students, loading: studentsLoading, addStudent, updateStudent, deleteStudent } = useStudents();
  const [editingStudent, setEditingStudent] = useState<Student | null | 'new'>(null);
  const [search, setSearch] = useState('');
  const [importState, setImportState] = useState<'idle' | 'importing' | 'error'>('idle');
  const [importError, setImportError] = useState('');

  const loading = ensemblesLoading || studentsLoading;
  const isEmpty = !loading && students.length === 0;

  async function handleImport() {
    setImportState('importing');
    setImportError('');
    try {
      await seedRoster();
      // The real-time listeners pick up the new docs and re-render automatically.
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
      setImportState('error');
    }
  }

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.instrument.toLowerCase().includes(search.toLowerCase())
  );

  // Group by ensemble; students with no ensemble go in a separate bucket
  const grouped = ensembles.map(e => ({
    ensemble: e,
    students: filtered.filter(s => s.ensembleIds?.includes(e.id)),
  }));
  const unassigned = filtered.filter(s => !s.ensembleIds?.length);

  return (
    <div>
      {students.length > 0 && (
        <div className="dir-filter-bar">
          <input
            className="dir-input"
            placeholder="Search students…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {grouped.map(({ ensemble, students: grp }) =>
        grp.length === 0 ? null : (
          <div key={ensemble.id} className="dir-roster-group">
            <div className="dir-roster-group-header">
              {ensemble.name}
              <span className="dir-roster-count">{grp.length}</span>
            </div>
            <div className="dir-roster-list">
              {grp.map(s => (
                <StudentRow key={s.id} student={s} onEdit={() => setEditingStudent(s)} />
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
              <StudentRow key={s.id} student={s} onEdit={() => setEditingStudent(s)} />
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
          <p>No students match “{search}”.</p>
        </div>
      )}

      <button className="dir-fab" onClick={() => setEditingStudent('new')} aria-label="Add student">
        <UserPlus size={22} />
      </button>

      {editingStudent !== null && (
        <StudentForm
          student={editingStudent === 'new' ? null : editingStudent}
          ensembles={ensembles}
          onSave={async data => {
            if (editingStudent === 'new') {
              await addStudent(data);
            } else {
              await updateStudent(editingStudent.id, data);
            }
          }}
          onDelete={editingStudent !== 'new' ? async () => {
            await deleteStudent(editingStudent.id);
          } : undefined}
          onClose={() => setEditingStudent(null)}
        />
      )}
    </div>
  );
}

function StudentRow({ student, onEdit }: { student: Student; onEdit: () => void }) {
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
    </div>
  );
}
