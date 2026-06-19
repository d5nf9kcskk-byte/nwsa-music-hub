import { useMemo } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useStudents } from '../director/hooks/useStudents';
import { ensembleColor } from '../director/utils';

export function PublicEnsembles() {
  const { ensembles, loading } = useEnsembles();
  const { students } = useStudents();

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of students) {
      if (s.status !== 'Active') continue;
      for (const id of s.ensembleIds ?? []) m[id] = (m[id] ?? 0) + 1;
    }
    return m;
  }, [students]);

  return (
    <div className="pub-page">
      <h1 className="pub-h1">Ensembles</h1>
      {loading ? (
        <div className="pub-muted">Loading…</div>
      ) : ensembles.length === 0 ? (
        <div className="pub-card pub-muted">No ensembles yet.</div>
      ) : (
        ensembles.map(e => (
          <Link key={e.id} to={`/ensemble/${e.id}`} className="pub-ens-card">
            <span className="pub-ens-stripe" style={{ background: ensembleColor(e) }} />
            <div className="pub-ens-info">
              <div className="pub-ens-name">{e.name}</div>
              <div className="pub-ens-sub">
                {counts[e.id] ?? 0} member{(counts[e.id] ?? 0) !== 1 ? 's' : ''}
                {e.defaultLocation ? ` · ${e.defaultLocation}` : ''}
              </div>
            </div>
            <ChevronRight size={18} className="pub-ens-chev" />
          </Link>
        ))
      )}
    </div>
  );
}
