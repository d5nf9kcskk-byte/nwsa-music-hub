import { useState } from 'react';
import { NotebookPen, FileText } from 'lucide-react';
import { useStudents } from '../hooks/useStudents';
import { useProgressNotes } from '../hooks/useProgressNotes';
import { NoteForm } from './NoteForm';
import type { ProgressNote } from '../types';
import { Linkify } from '../components/Linkify';

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function NotesView() {
  const { students } = useStudents();
  const [filterStudentId, setFilterStudentId] = useState('');
  const { notes, addNote, updateNote, deleteNote } = useProgressNotes(filterStudentId || undefined);
  const [editing, setEditing] = useState<ProgressNote | null | 'new'>(null);

  const studentMap = Object.fromEntries(students.map(s => [s.id, s.name]));

  return (
    <div>
      {/* Student filter */}
      <div className="dir-filter-bar">
        <select
          className="dir-select"
          style={{ flex: 1 }}
          value={filterStudentId}
          onChange={e => setFilterStudentId(e.target.value)}
        >
          <option value="">All students</option>
          {students.filter(s => s.status === 'Active').map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="dir-note-list">
        {notes.length === 0 ? (
          <div className="dir-empty">
            <FileText size={40} />
            <h3>No notes yet</h3>
            <p>Tap + to add a progress note.</p>
          </div>
        ) : (
          notes.map(n => (
            <div key={n.id} className="dir-note-card" onClick={() => setEditing(n)}>
              <div className="dir-note-header">
                <span className="dir-note-student">{studentMap[n.studentId] ?? 'Unknown'}</span>
                <span className="dir-note-date">{formatDate(n.date)}</span>
              </div>
              <div className="dir-note-content"><Linkify text={n.content} /></div>
              {n.category && n.category !== 'General' && (
                <span className="dir-note-category">{n.category}</span>
              )}
            </div>
          ))
        )}
      </div>

      <button className="dir-fab" onClick={() => setEditing('new')} aria-label="New note">
        <NotebookPen size={22} />
      </button>

      {editing !== null && (
        <NoteForm
          note={editing === 'new' ? null : editing}
          students={students}
          defaultStudentId={filterStudentId || undefined}
          onSave={async data => {
            if (editing === 'new') await addNote(data);
            else await updateNote(editing.id, data);
          }}
          onDelete={editing !== 'new' ? async () => deleteNote(editing.id) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
