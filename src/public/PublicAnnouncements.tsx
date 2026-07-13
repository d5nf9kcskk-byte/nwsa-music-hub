import { useMemo, useState } from 'react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useAnnouncements, visibleAnnouncements } from '../director/hooks/useAnnouncements';
import { todayStr, musicEnsembles } from '../director/utils';
import { PubAnnouncements } from './components/PubAnnouncements';

/** Every current announcement, school-wide and per-ensemble, in one place. */
export function PublicAnnouncementsPage() {
  const { ensembles } = useEnsembles();
  const { announcements, loading } = useAnnouncements();
  const today = todayStr();
  // '' = everyone, 'school' = school-wide only, or an ensemble id.
  const [filter, setFilter] = useState('');

  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);
  const all = useMemo(() => visibleAnnouncements(announcements, today, 'all'), [announcements, today]);
  const items = useMemo(() => {
    if (filter === 'school') return all.filter(a => a.ensembleId === null);
    if (filter) return all.filter(a => a.ensembleId === filter);
    return all;
  }, [all, filter]);

  const orderedEns = useMemo(() => musicEnsembles([...ensembles].sort((a, b) => a.order - b.order)), [ensembles]);

  return (
    <div className="pub-page">
      <h1 className="pub-h1">Announcements</h1>
      <div className="pub-filter-row">
        <button className={`pub-filter-btn ${!filter ? 'active' : ''}`} onClick={() => setFilter('')}>All</button>
        <button className={`pub-filter-btn ${filter === 'school' ? 'active' : ''}`} onClick={() => setFilter('school')}>School-wide</button>
        {orderedEns.map(e => (
          <button key={e.id} className={`pub-filter-btn ${filter === e.id ? 'active' : ''}`} onClick={() => setFilter(f => f === e.id ? '' : e.id)}>
            {e.name}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="pub-muted">Loading…</div>
      ) : items.length === 0 ? (
        <div className="pub-card pub-muted">No announcements{filter ? ' for this filter' : ' right now'}. Check back soon!</div>
      ) : (
        <PubAnnouncements items={items} ensembleMap={ensembleMap} title="" />
      )}
    </div>
  );
}
