import { useMemo, useState } from 'react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { useEvents } from '../director/hooks/useEvents';
import { ensembleColor } from '../director/utils';
import { PubRepertoire } from './components/PubRepertoire';

export function PublicRepertoire() {
  const { ensembles } = useEnsembles();
  const { pieces } = useRepertoire();
  const { events } = useEvents();
  const [filter, setFilter] = useState('');

  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);

  const piecesByEnsemble = useMemo(() => {
    const m: Record<string, typeof pieces> = {};
    for (const p of pieces) {
      if (!m[p.ensembleId]) m[p.ensembleId] = [];
      m[p.ensembleId].push(p);
    }
    return m;
  }, [pieces]);

  const sorted = useMemo(
    () => [...ensembles].sort((a, b) => a.order - b.order),
    [ensembles],
  );

  const ensemblesWithPieces = sorted.filter(e => (piecesByEnsemble[e.id]?.length ?? 0) > 0);
  const visible = filter ? ensemblesWithPieces.filter(e => e.id === filter) : ensemblesWithPieces;

  return (
    <div className="pub-page">
      <h1 className="pub-h1">Repertoire</h1>
      {ensemblesWithPieces.length > 1 && (
        <div className="pub-filter-row">
          <button className={`pub-filter-btn ${!filter ? 'active' : ''}`} onClick={() => setFilter('')}>All ensembles</button>
          {ensemblesWithPieces.map(e => (
            <button key={e.id} className={`pub-filter-btn ${filter === e.id ? 'active' : ''}`} onClick={() => setFilter(f => f === e.id ? '' : e.id)}>
              {e.name}
            </button>
          ))}
        </div>
      )}
      {pieces.length === 0 ? (
        <div className="pub-card pub-muted">No repertoire added yet.</div>
      ) : (
        visible.map(ensemble => (
          <div key={ensemble.id}>
            <h2 className="pub-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: ensembleColor(ensemble), display: 'inline-block', flexShrink: 0 }} />
              {ensemble.name}
            </h2>
            <PubRepertoire pieces={piecesByEnsemble[ensemble.id]} eventsById={eventsById} />
          </div>
        ))
      )}
    </div>
  );
}
