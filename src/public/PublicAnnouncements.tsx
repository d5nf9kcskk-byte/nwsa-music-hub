import { useMemo, useState } from 'react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useAnnouncements, visibleAnnouncements, useMinuteTick } from '../director/hooks/useAnnouncements';
import { todayStr, musicEnsembles } from '../director/utils';
import { PubEnsembleSelect } from './components/PubEnsembleSelect';
import { PubAnnouncements } from './components/PubAnnouncements';
import { useLang } from '../shared/i18n';
import { dailyPun } from '../shared/whimsy';

/** Every current announcement, school-wide and per-ensemble, in one place. */
export function PublicAnnouncementsPage() {
  const lang = useLang(); // re-render (and rotate the empty-state pun) on EN/ES switch
  const { ensembles } = useEnsembles();
  const { announcements, loading } = useAnnouncements();
  const today = todayStr();
  // '' = everyone, 'school' = school-wide only, or an ensemble id.
  const [filter, setFilter] = useState('');

  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);
  const now = useMinuteTick(); // scheduled posts appear the minute they go live
  const all = useMemo(() => visibleAnnouncements(announcements, today, 'all', now), [announcements, today, now]);
  const items = useMemo(() => {
    if (filter === 'school') return all.filter(a => a.ensembleId === null);
    if (filter) return all.filter(a => a.ensembleId === filter);
    return all;
  }, [all, filter]);

  const orderedEns = useMemo(() => musicEnsembles([...ensembles].sort((a, b) => a.order - b.order)), [ensembles]);

  return (
    <div className="pub-page">
      <h1 className="pub-h1">Announcements</h1>
      <PubEnsembleSelect ensembles={orderedEns} value={filter} onChange={setFilter} extraOptions={[{ value: 'school', label: 'School-wide' }]} />
      {loading ? (
        <div className="pub-muted">Loading…</div>
      ) : items.length === 0 ? (
        <div className="pub-card pub-muted">
          {lang === 'es'
            ? `No hay anuncios${filter ? ' con este filtro' : ' por ahora'}. ${dailyPun('announce').es}`
            : `No announcements${filter ? ' for this filter' : ' right now'}. ${dailyPun('announce').en}`}
        </div>
      ) : (
        <PubAnnouncements items={items} ensembleMap={ensembleMap} title="" />
      )}
    </div>
  );
}
