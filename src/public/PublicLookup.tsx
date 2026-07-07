import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router';
import { Search, UserCircle, X, ChevronRight } from 'lucide-react';
import { useStudents } from '../director/hooks/useStudents';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { sortStudents, lastName, type StudentSort } from '../director/scoreOrder';
import { getIdentity, rememberStudent, forgetStudent, setParentMode } from '../shared/identity';
import { ensembleColor } from '../director/utils';
import type { Student } from '../director/types';

/** Diacritic-stripped lowercase for forgiving matching (#3): José → jose. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Common nickname → formal-name stems (#3). Both directions are checked. */
const NICKNAMES: Record<string, string[]> = {
  alex: ['alejandro', 'alejandra', 'alexander', 'alexandra', 'alexis'],
  tony: ['antonio', 'anthony'], toni: ['antonia'],
  pepe: ['jose'], pancho: ['francisco'], paco: ['francisco'],
  memo: ['guillermo'], lupe: ['guadalupe'], chuy: ['jesus'],
  mike: ['michael', 'miguel'], nick: ['nicholas', 'nicolas'],
  liz: ['elizabeth'], beth: ['elizabeth'], eli: ['elizabeth', 'elias', 'elijah'],
  kate: ['katherine', 'catherine'], katie: ['katherine', 'catherine'],
  sofi: ['sofia'], gabi: ['gabriela', 'gabriella'], gabe: ['gabriel'],
  dani: ['daniel', 'daniela'], danny: ['daniel'],
  javi: ['javier'], rafa: ['rafael'], nacho: ['ignacio'],
  will: ['william'], billy: ['william'], bill: ['william'],
  jen: ['jennifer'], jenny: ['jennifer'], jess: ['jessica'],
  sam: ['samuel', 'samantha'], matt: ['matthew', 'mateo'],
  chris: ['christopher', 'christian', 'cristian', 'christina', 'cristina'],
};

function matchesQuery(s: Student, q: string): boolean {
  if (!q) return true;
  const hay = fold(s.name) + ' ' + fold(s.preferredName ?? '');
  if (hay.includes(q)) return true;
  const stems = NICKNAMES[q] ?? [];
  if (stems.some(st => hay.includes(st))) return true;
  for (const [nick, formals] of Object.entries(NICKNAMES)) {
    if (formals.some(f => f.startsWith(q))) {
      if (hay.includes(nick)) return true;
    }
  }
  return false;
}

const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function PublicLookup() {
  const { students } = useStudents();
  const { ensembles } = useEnsembles();
  const [q, setQ] = useState('');
  const [ensembleId, setEnsembleId] = useState('');
  const [sort, setSort] = useState<StudentSort>('lastName');
  const [letter, setLetter] = useState('');
  const [confirming, setConfirming] = useState<Student | null>(null);
  const [, setTick] = useState(0); // re-render after identity changes
  const navigate = useNavigate();

  const identity = getIdentity();
  const orderedEns = useMemo(() => [...ensembles].sort((a, b) => a.order - b.order), [ensembles]);

  const qFolded = fold(q.trim());
  const matches = useMemo(() => {
    const base = students
      .filter(s => s.status === 'Active')
      .filter(s => !ensembleId || s.ensembleIds?.includes(ensembleId))
      .filter(s => matchesQuery(s, qFolded))
      // The rail letter follows the active sort: last-name lists filter by
      // last name, score-order lists by first name — so "G" finds Garcia.
      .filter(s => !letter || fold(sort === 'lastName' ? lastName(s.name) : s.name).startsWith(fold(letter)));
    return sortStudents(base, sort).slice(0, 80);
  }, [students, ensembleId, qFolded, sort, letter]);

  function confirm() {
    if (!confirming) return;
    rememberStudent(
      { id: confirming.id, name: confirming.name, ensembleIds: confirming.ensembleIds ?? [], instrument: confirming.instrument },
      identity.parentMode,
    );
    const id = confirming.id;
    setConfirming(null);
    navigate(`/student/${id}`);
  }

  return (
    <div className="pub-page">
      <h1 className="pub-h1">My Schedule</h1>
      <p className="pub-muted">Find your name to see where you should be and when.</p>

      {/* Saved students (remember-me #1 / parent mode #11) */}
      {identity.students.length > 0 && (
        <div className="pub-card" style={{ marginBottom: 12, padding: 12 }}>
          <div className="pub-section-title" style={{ margin: '0 0 8px' }}>
            {identity.parentMode ? 'Your students' : 'Welcome back'}
          </div>
          {identity.students.map(st => (
            <div key={st.id} className="pub-saved-row">
              <Link to={`/student/${st.id}`} className="pub-saved-link">
                <UserCircle size={18} />
                <span className="pub-saved-name">{st.name}</span>
                {st.instrument && <span className="pub-saved-instr">{st.instrument}</span>}
                <ChevronRight size={15} style={{ marginLeft: 'auto', opacity: 0.5 }} />
              </Link>
              <button
                className="pub-saved-forget"
                aria-label={`Forget ${st.name}`}
                onClick={() => {
                  if (window.confirm(`Forget ${st.name} on this device? You can always find them again.`)) {
                    forgetStudent(st.id);
                    setTick(t => t + 1);
                  }
                }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <label className="pub-parent-toggle">
            <input
              type="checkbox"
              checked={identity.parentMode}
              onChange={e => { setParentMode(e.target.checked); setTick(t => t + 1); }}
            />
            I'm a parent — let me save more than one student
          </label>
        </div>
      )}

      <div className="pub-search">
        <Search size={18} />
        <input
          autoFocus={identity.students.length === 0}
          className="pub-search-input"
          placeholder="Type your name (nicknames OK)…"
          value={q}
          onChange={e => { setQ(e.target.value); setLetter(''); }}
        />
      </div>

      {/* A–Z rail (#3) */}
      <div className="pub-az-rail" role="group" aria-label="Jump to letter">
        {AZ.map(L => (
          <button
            key={L}
            className={`pub-az-btn ${letter === L ? 'active' : ''}`}
            onClick={() => { setLetter(l => l === L ? '' : L); setQ(''); }}
          >
            {L}
          </button>
        ))}
      </div>

      <div className="pub-filter-row">
        <button className={`pub-filter-btn ${!ensembleId ? 'active' : ''}`} onClick={() => setEnsembleId('')}>All</button>
        {orderedEns.map(e => (
          <button key={e.id} className={`pub-filter-btn ${ensembleId === e.id ? 'active' : ''}`} onClick={() => setEnsembleId(id => id === e.id ? '' : e.id)}>
            {e.name}
          </button>
        ))}
      </div>

      <div className="pub-filter-row" style={{ marginTop: -4 }}>
        <button className={`pub-filter-btn ${sort === 'lastName' ? 'active' : ''}`} onClick={() => setSort('lastName')}>By last name</button>
        <button className={`pub-filter-btn ${sort === 'scoreOrder' ? 'active' : ''}`} onClick={() => setSort('scoreOrder')}>By score order</button>
      </div>

      <div className="pub-card pub-roster">
        {matches.length === 0 ? (
          <div className="pub-muted">{q || ensembleId || letter ? 'No matching names — try fewer letters, or your formal name.' : 'Start typing, or tap a letter above.'}</div>
        ) : (
          matches.map(s => (
            <button key={s.id} className="pub-roster-row pub-lookup-row" onClick={() => setConfirming(s)}>
              <span className="pub-roster-name">{s.name}</span>
              <span className="pub-roster-instr">{s.instrument}</span>
            </button>
          ))
        )}
      </div>

      {/* "Is this you?" confirm card (#3) — prevents the two-Sofias problem */}
      {confirming && (
        <div className="pub-confirm-overlay" onClick={e => e.target === e.currentTarget && setConfirming(null)}>
          <div className="pub-confirm-card">
            <div className="pub-confirm-title">Is this you{identity.parentMode ? 'r student' : ''}?</div>
            <div className="pub-confirm-name">{confirming.name}</div>
            <div className="pub-confirm-detail">
              {[confirming.instrument, confirming.grade].filter(Boolean).join(' · ')}
            </div>
            <div className="pub-tag-row" style={{ justifyContent: 'center', marginTop: 8 }}>
              {(confirming.ensembleIds ?? []).map(id => {
                const e = ensembles.find(x => x.id === id);
                return e ? <span key={id} className="pub-ens-tag" style={{ background: ensembleColor(e) }}>{e.name}</span> : null;
              })}
            </div>
            <div className="pub-confirm-actions">
              <button className="pub-confirm-no" onClick={() => setConfirming(null)}>No, go back</button>
              <button className="pub-confirm-yes" onClick={confirm}>Yes — show my schedule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
