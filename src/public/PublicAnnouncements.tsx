import { useMemo } from 'react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useAnnouncements, visibleAnnouncements } from '../director/hooks/useAnnouncements';
import { todayStr } from '../director/utils';
import { PubAnnouncements } from './components/PubAnnouncements';

/** Every current announcement, school-wide and per-ensemble, in one place. */
export function PublicAnnouncementsPage() {
  const { ensembles } = useEnsembles();
  const { announcements, loading } = useAnnouncements();
  const today = todayStr();

  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);
  const items = useMemo(() => visibleAnnouncements(announcements, today, 'all'), [announcements, today]);

  return (
    <div className="pub-page">
      <h1 className="pub-h1">Announcements</h1>
      {loading ? (
        <div className="pub-muted">Loading…</div>
      ) : items.length === 0 ? (
        <div className="pub-card pub-muted">No announcements right now. Check back soon!</div>
      ) : (
        <PubAnnouncements items={items} ensembleMap={ensembleMap} title="" />
      )}
    </div>
  );
}
