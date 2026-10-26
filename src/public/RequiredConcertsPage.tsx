import { useEffect, useMemo, useReducer, useState } from 'react';
import { usePublicEvents } from './hooks/usePublicEvents';
import { useStudentsPublic, usePublicOverrides } from './hooks/usePublicRoster';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { studentExpectation } from '../director/rosterResolver';
import { todayStr, musicEnsembles, ensembleDisplayName } from '../director/utils';
import { requiredAudienceEvents, audienceEnsembleIds } from '../shared/requiredAudience';
import { getIdentity, onIdentityChange } from '../shared/identity';
import { t, useLang } from '../shared/i18n';
import { PageHeader, SkeletonCards } from './components/PageHeader';
import { PubEventCard } from './components/PubEventCard';
import type { CalendarEvent } from '../director/types';

const MINE = '__mine';

/**
 * Required Attendance Concerts (#required-audience): every concert someone has
 * to sit in the audience for without playing, as ordinary concert cards. A
 * device with a saved student opens on THEIR list, answered by the same
 * `studentExpectation()` their schedule uses (so a senior the concert excuses
 * is not told to come, and a student who plays on it is not told to sit in
 * the audience); anyone else picks a group.
 */
export function RequiredConcertsPage() {
  useLang();
  const { events, loading } = usePublicEvents();
  const { ensembles } = useEnsembles();
  const { students } = useStudentsPublic();
  const { overrides } = usePublicOverrides();
  const { pieces } = useRepertoire();

  const [, bump] = useReducer(x => x + 1, 0);
  useEffect(() => onIdentityChange(bump), []);
  const saved = getIdentity().students;
  const [filter, setFilter] = useState(() => (getIdentity().students.length > 0 ? MINE : ''));
  const activeFilter = filter === MINE && saved.length === 0 ? '' : filter;

  const today = todayStr();
  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);
  const piecesById = useMemo(() => Object.fromEntries(pieces.map(p => [p.id, p])), [pieces]);
  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);

  const concerts = useMemo(
    () => requiredAudienceEvents(events.filter(e => e.type === 'Concert')),
    [events],
  );

  // Only groups that actually appear in an audience list are worth offering.
  const groups = useMemo(() => {
    const ids = new Set(concerts.flatMap(audienceEnsembleIds));
    return musicEnsembles([...ensembles].sort((a, b) => a.order - b.order)).filter(e => ids.has(e.id));
  }, [concerts, ensembles]);

  const shown = useMemo(() => {
    if (activeFilter === MINE) {
      return concerts.filter(e => saved.some(s => isAudienceFor(s, e)));
    }
    return activeFilter ? requiredAudienceEvents(concerts, activeFilter) : concerts;

    function isAudienceFor(s: { id: string; ensembleIds: string[] }, e: CalendarEvent): boolean {
      // The roster answer when the public roster has them; the saved groups
      // until it loads (or if the record is gone), so the page never blanks.
      if (students.some(st => st.id === s.id)) {
        return studentExpectation(s.id, e, students, overrides, eventsById).attendanceOnly;
      }
      return audienceEnsembleIds(e).some(id => s.ensembleIds.includes(id))
        || (e.attendanceStudentIds ?? []).includes(s.id);
    }
  }, [activeFilter, concerts, saved, students, overrides, eventsById]);

  const upcoming = shown.filter(e => e.date >= today);
  const past = shown.filter(e => e.date < today).reverse();
  const mineName = saved.map(s => s.name.split(/[ ,]/)[0]).filter(Boolean).join(', ');

  return (
    <div className="pub-page">
      <PageHeader title={t('required.title')} intro={t('required.intro')} />

      <select
        className="pub-ens-select"
        value={activeFilter}
        onChange={e => setFilter(e.target.value)}
        aria-label="Filter by ensemble"
      >
        {saved.length > 0 && <option value={MINE}>{t('required.mine', { name: mineName })}</option>}
        <option value="">{t('nav.allEnsembles')}</option>
        {groups.map(g => <option key={g.id} value={g.id}>{ensembleDisplayName(g)}</option>)}
      </select>

      {loading ? (
        <SkeletonCards n={3} slim />
      ) : (
        <>
          {upcoming.length === 0 && (
            <div className="pub-card pub-muted">
              {activeFilter === MINE ? t('required.noneMine') : t('required.none')}
            </div>
          )}
          {upcoming.map(e => (
            <PubEventCard key={e.id} event={e} ensembleMap={ensembleMap} piecesById={piecesById} showDate showNotes attendanceOnly />
          ))}

          {past.length > 0 && (
            <details className="pub-required-past">
              <summary className="pub-section-title">{t('season.earlier')} ({past.length})</summary>
              {past.map(e => (
                <PubEventCard key={e.id} event={e} ensembleMap={ensembleMap} piecesById={piecesById} showDate attendanceOnly />
              ))}
            </details>
          )}
        </>
      )}
    </div>
  );
}
