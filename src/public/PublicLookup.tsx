import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { useStudents } from '../director/hooks/useStudents';

export function PublicLookup() {
  const { students } = useStudents();
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  const matches = students
    .filter(s => s.status === 'Active' && s.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 30);

  return (
    <div className="pub-page">
      <h1 className="pub-h1">My Schedule</h1>
      <p className="pub-muted">Find your name to see where you should be and when.</p>

      <div className="pub-search">
        <Search size={18} />
        <input
          autoFocus
          className="pub-search-input"
          placeholder="Type your name…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>

      <div className="pub-card pub-roster">
        {matches.length === 0 ? (
          <div className="pub-muted">{q ? 'No matching names.' : 'Start typing to search.'}</div>
        ) : (
          matches.map(s => (
            <button key={s.id} className="pub-roster-row pub-lookup-row" onClick={() => navigate(`/student/${s.id}`)}>
              <span className="pub-roster-name">{s.name}</span>
              <span className="pub-roster-instr">{s.instrument}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
