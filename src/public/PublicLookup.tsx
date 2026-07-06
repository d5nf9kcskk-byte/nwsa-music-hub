import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { useStudents } from '../director/hooks/useStudents';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { sortStudents, type StudentSort } from '../director/scoreOrder';
import { rememberStudent } from '../shared/identity';

export function PublicLookup() {
  const { students } = useStudents();
  const { ensembles } = useEnsembles();
  const [q, setQ] = useState('');
  const [ensembleId, setEnsembleId] = useState('');
  const [sort, setSort] = useState<StudentSort>('lastName');
  const navigate = useNavigate();

  const orderedEns = useMemo(() => [...ensembles].sort((a, b) => a.order - b.order), [ensembles]);

  const matches = useMemo(() => {
    const base = students
      .filter(s => s.status === 'Active')
      .filter(s => !ensembleId || s.ensembleIds?.includes(ensembleId))
      .filter(s => s.name.toLowerCase().includes(q.toLowerCase()));
    return sortStudents(base, sort).slice(0, 60);
  }, [students, ensembleId, q, sort]);

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

      {/* Filter by ensemble */}
      <div className="pub-filter-row">
        <button className={`pub-filter-btn ${!ensembleId ? 'active' : ''}`} onClick={() => setEnsembleId('')}>All</button>
        {orderedEns.map(e => (
          <button key={e.id} className={`pub-filter-btn ${ensembleId === e.id ? 'active' : ''}`} onClick={() => setEnsembleId(id => id === e.id ? '' : e.id)}>
            {e.name}
          </button>
        ))}
      </div>

      {/* Sort */}
      <div className="pub-filter-row" style={{ marginTop: -4 }}>
        <button className={`pub-filter-btn ${sort === 'lastName' ? 'active' : ''}`} onClick={() => setSort('lastName')}>By last name</button>
        <button className={`pub-filter-btn ${sort === 'scoreOrder' ? 'active' : ''}`} onClick={() => setSort('scoreOrder')}>By score order</button>
      </div>

      <div className="pub-card pub-roster">
        {matches.length === 0 ? (
          <div className="pub-muted">{q || ensembleId ? 'No matching names.' : 'Start typing to search.'}</div>
        ) : (
          matches.map(s => (
            <button
              key={s.id}
              className="pub-roster-row pub-lookup-row"
              onClick={() => {
                rememberStudent({ id: s.id, name: s.name, ensembleIds: s.ensembleIds ?? [], instrument: s.instrument });
                navigate(`/student/${s.id}`);
              }}
            >
              <span className="pub-roster-name">{s.name}</span>
              <span className="pub-roster-instr">{s.instrument}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
