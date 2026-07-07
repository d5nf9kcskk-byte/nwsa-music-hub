import { useEffect, useMemo, useReducer } from 'react';
import { Link, useLocation } from 'react-router';
import { useEvents } from '../../director/hooks/useEvents';
import { useAnnouncements, visibleAnnouncements } from '../../director/hooks/useAnnouncements';
import { useEnsembles } from '../../director/hooks/useEnsembles';
import { todayStr } from '../../director/utils';
import { getIdentity, onIdentityChange } from '../../shared/identity';
import { t, useLang } from '../../shared/i18n';

/**
 * Site-wide alert strip (#18 + #19): shows today's cancellations/changes and
 * urgent announcements on EVERY public page — with a positive all-clear state
 * so "no banner" is never ambiguous with "page didn't load".
 */
export function GlobalAlerts() {
  useLang();
  const { events } = useEvents();
  const { announcements } = useAnnouncements();
  const { ensembles } = useEnsembles();
  const { pathname } = useLocation();
  const today = todayStr();

  // Watch EVERY saved student (parents can save several) and re-render when
  // the saved list changes — filtering by just the first child could show
  // "all clear" while another child's rehearsal is cancelled.
  const [, bump] = useReducer(x => x + 1, 0);
  useEffect(() => onIdentityChange(bump), []);
  const saved = getIdentity().students;
  const myEnsembles = saved.length > 0 ? saved.flatMap(s => s.ensembleIds) : null;

  const problems = useMemo(() =>
    events.filter(e => e.date === today
      && (e.status === 'Cancelled' || e.changeNote)
      && (!myEnsembles || e.ensembleIds.length === 0 || e.ensembleIds.some(id => myEnsembles.includes(id)))),
    [events, today, myEnsembles]);

  const urgent = useMemo(() =>
    visibleAnnouncements(announcements, today, 'all').filter(a => a.priority === 'urgent'),
    [announcements, today]);

  const ensName = (ids: string[]) =>
    ids.map(id => ensembles.find(e => e.id === id)?.name).filter(Boolean).join(' + ') || 'School';

  // Home renders its own richer banner; skip the duplicate there unless urgent.
  const onHome = pathname === '/';

  if (urgent.length === 0 && (problems.length === 0 || onHome)) {
    // Positive all-clear — only on non-home pages, only when we actually have data.
    if (onHome || events.length === 0) return null;
    return (
      <div className="pub-allclear" role="status">
        ✓ {t('alert.allClear')}
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite">
      {urgent.map(a => (
        <Link key={a.id} to="/announcements" className="pub-urgent-banner">
          🚨 <strong>{a.title}</strong>{a.body ? ` — ${a.body.slice(0, 90)}${a.body.length > 90 ? '…' : ''}` : ''}
        </Link>
      ))}
      {!onHome && problems.map(e => (
        <Link key={e.id} to={`/event/${e.id}`} className="pub-strip-alert">
          ⚠ {e.status === 'Cancelled' ? t('alert.cancelledToday') : t('alert.changedToday')}: {e.title || ensName(e.ensembleIds)}
          {e.changeNote ? ` — ${e.changeNote}` : ''}
        </Link>
      ))}
    </div>
  );
}
