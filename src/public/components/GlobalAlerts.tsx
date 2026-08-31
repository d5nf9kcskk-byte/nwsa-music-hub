import { useEffect, useMemo, useReducer, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { doc, getDoc } from 'firebase/firestore';
import { CheckCircle2, Siren, AlertTriangle } from 'lucide-react';
import { usePublicEvents } from '../hooks/usePublicEvents';
import { useAnnouncements, visibleAnnouncements, useMinuteTick } from '../../director/hooks/useAnnouncements';
import { useEnsembles } from '../../director/hooks/useEnsembles';
import { db } from '../../director/firebase';
import { directorEmailId } from '../../director/hooks/useDirectors';
import { todayStr, ensembleDisplayName } from '../../director/utils';
import { getIdentity, onIdentityChange } from '../../shared/identity';
import { t, useLang, getLang } from '../../shared/i18n';
import { groupScheduleAlerts, groupUrgentAnnouncements } from '../../shared/groupAlerts';
import { AlertGroupSections } from '../../shared/AlertGroupSections';
import { allClearExtraLine } from '../../shared/whimsy';
import { CheckinStrip } from './CheckinStrip';

/**
 * Alert strip for the pages where schedule noise belongs: Home and Calendar.
 * Ensemble hubs use EnsembleAlerts instead. Event/class/rehearsal detail pages
 * stay quiet so opening a card isn't drowned in site-wide banners.
 *
 * Signed-in staff tapping an urgent banner land in the director Announcement
 * editor (edit / remove). Families keep the public announcements list.
 */
export function GlobalAlerts() {
  const { pathname } = useLocation();
  // Ensemble pages render EnsembleAlerts in-page; everywhere else (event
  // detail, repertoire, documents, …) stays clear of this strip. It lives in
  // the public layout, so gating BEFORE the hooks keeps every one of those
  // pages from opening the events / announcements listeners at all (#reads).
  if (pathname !== '/' && pathname !== '/calendar') return null;
  return <AlertStrip onHome={pathname === '/'} />;
}

function AlertStrip({ onHome }: { onHome: boolean }) {
  useLang();
  const { events } = usePublicEvents();
  const { announcements } = useAnnouncements();
  const { ensembles } = useEnsembles();
  const today = todayStr();
  const now = useMinuteTick();
  const [isStaff, setIsStaff] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    Promise.all([import('firebase/auth'), import('../../director/firebaseAuth')])
      .then(([{ onAuthStateChanged }, { auth }]) => {
        if (cancelled || !auth) return;
        unsub = onAuthStateChanged(auth, async (u) => {
          if (!u?.email || !db) { setIsStaff(false); return; }
          try {
            const snap = await getDoc(doc(db, 'directors', directorEmailId(u.email)));
            setIsStaff(snap.exists());
          } catch {
            setIsStaff(false);
          }
        });
      })
      .catch(() => { /* chunk unavailable */ });
    return () => { cancelled = true; unsub?.(); };
  }, []);

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
    visibleAnnouncements(announcements, today, 'all', now).filter(a => a.priority === 'urgent'),
    [announcements, today, now]);

  const ensName = (ids: string[]) =>
    ids.map(id => ensembleDisplayName(ensembles.find(e => e.id === id))).filter(Boolean).join(' + ') || 'School';

  // The check-in strip (#concert-checkin). Rendered in BOTH exits below: an
  // otherwise quiet night must not swallow the one banner a student standing
  // in a concert lobby actually needs.
  const checkinStrip = <CheckinStrip events={events} ensembles={ensembles} />;

  const urgentGroups = useMemo(() => groupUrgentAnnouncements(urgent, ensembles), [urgent, ensembles]);
  const problemGroups = useMemo(() => groupScheduleAlerts(problems, ensembles), [problems, ensembles]);

  if (urgent.length === 0 && (problems.length === 0 || onHome)) {
    if (onHome || events.length === 0) return checkinStrip;
    return (
      <>
      {checkinStrip}
      <div className="pub-allclear" role="status">
        <CheckCircle2 size={15} style={{ verticalAlign: '-2.5px' }} /> {t('alert.allClear')}{' '}
        <span className="pub-allclear-extra">{allClearExtraLine(getLang())}</span>
      </div>
      </>
    );
  }

  return (
    <div role="status" aria-live="polite" className="pub-global-alert-groups">
      {checkinStrip}
      <AlertGroupSections
        groups={urgentGroups}
        renderItem={a => (
          <Link
            key={a.id}
            to={isStaff ? `/director/announcements?announcement=${encodeURIComponent(a.id)}` : '/announcements'}
            className="pub-urgent-banner"
          >
            <Siren size={15} style={{ verticalAlign: '-2.5px' }} /> <strong>{a.title}</strong>
            {a.body ? ` — ${a.body.slice(0, 90)}${a.body.length > 90 ? '…' : ''}` : ''}
            {isStaff ? ' · Edit' : ''}
          </Link>
        )}
      />
      {!onHome && (
        <AlertGroupSections
          groups={problemGroups}
          renderItem={e => (
            <Link key={e.id} to={`/event/${e.id}`} className="pub-strip-alert">
              <AlertTriangle size={14} style={{ verticalAlign: '-2px' }} />{' '}
              {e.status === 'Cancelled' ? t('alert.cancelledToday') : t('alert.changedToday')}:{' '}
              {e.title || ensName(e.ensembleIds)}
              {e.changeNote ? ` — ${e.changeNote}` : ''}
            </Link>
          )}
        />
      )}
    </div>
  );
}
