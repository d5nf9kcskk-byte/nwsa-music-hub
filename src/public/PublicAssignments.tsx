import { useMemo, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ClipboardCheck } from 'lucide-react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useAssignments } from '../director/hooks/useAssignments';
import { useStudentsPublic } from './hooks/usePublicRoster';
import { useMinuteTick } from '../director/hooks/useAnnouncements';
import { todayStr, addDays, ensembleColor, ensembleDisplayName, musicEnsembles, isPublished } from '../director/utils';
import { AssignmentCard } from './components/AssignmentCard';
import { PageHeader, SkeletonCards, EmptyState } from './components/PageHeader';
import { t, useLang, getLang } from '../shared/i18n';
import { dailyPun, say } from '../shared/whimsy';
import type { Assignment, Ensemble } from '../director/types';

/** How far back "recently due" reaches. Three weeks covers a test still being
 *  chased and the exam a student missed while out sick, without turning the
 *  page into an archive of the year. */
const PAST_WINDOW_DAYS = 21;

/**
 * Public list of assignments & exams, grouped by ensemble — what is coming,
 * and behind a fold what was recently due.
 *
 * Every card here is a SUMMARY that opens the assignment's own page
 * (`/assignments/:id`) — instructions, the music it's on, files, and the
 * recorder all live there, where there is room to read them.
 */
export function PublicAssignments() {
  useLang();
  const [showPast, setShowPast] = useState(false);
  const { ensembles } = useEnsembles();
  const { assignments, loading } = useAssignments();
  const { students } = useStudentsPublic();
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get('focus');
  const today = todayStr();
  const now = useMinuteTick(); // a scheduled assignment appears the minute it publishes

  // Older deep links (?focus=) still land on the right card and flash it.
  // Anything made from here on points straight at /assignments/:id.
  useEffect(() => {
    if (!focusId || loading) return;
    const el = document.getElementById(`assign-${focusId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('pub-assign-focus');
    }
  }, [focusId, loading]);

  const studentName = (id: string) => students.find(s => s.id === id)?.name ?? 'a student';

  // Upcoming (due today or later), earliest first.
  const upcoming = useMemo(
    () => assignments
      .filter(a => a.dueDate >= today && isPublished(a, now))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [assignments, today, now],
  );

  /**
   * Recently due, newest first, behind a fold.
   *
   * This page used to drop an assignment the instant its due date passed, so a
   * written test vanished from the whole site the morning after it was due —
   * while the director was still chasing the people who had not sent it, and
   * while a student who missed it had nowhere left to look up what it was.
   * A due date says when work is DUE, not when it stops existing.
   *
   * Bounded by days rather than by count: the cut-off is "still current", and
   * last term's exams are not, however few of them there are.
   */
  const past = useMemo(() => {
    const cutoff = addDays(today, -PAST_WINDOW_DAYS);
    return assignments
      .filter(a => a.dueDate < today && a.dueDate >= cutoff && isPublished(a, now))
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  }, [assignments, today, now]);

  const byEnsemble = useMemo(() => {
    const m: Record<string, Assignment[]> = {};
    const individual: Assignment[] = [];
    for (const a of upcoming) {
      if (a.ensembleIds.length === 0 && (a.studentIds?.length ?? 0) > 0) { individual.push(a); continue; }
      for (const eid of a.ensembleIds) (m[eid] ??= []).push(a);
    }
    return { m, individual };
  }, [upcoming]);

  const orderedEns = musicEnsembles([...ensembles].sort((a, b) => a.order - b.order)).filter(e => byEnsemble.m[e.id]?.length);

  return (
    <div className="pub-page">
      <PageHeader
        title={<><ClipboardCheck size={22} style={{ verticalAlign: '-4px' }} /> {t('nav.assignments')}</>}
        intro={t('assign.intro')}
      />

      {loading ? (
        <SkeletonCards n={3} slim />
      ) : upcoming.length === 0 ? (
        <>
          <EmptyState icon={<ClipboardCheck size={26} />}>
            {t('assign.nothingDue')} {say(dailyPun('assign'), getLang())}
          </EmptyState>
          {/* Nothing DUE is not nothing to see: the exam from last week is
              still the thing a student came here to look up. */}
          <PastWork items={past} ensembles={ensembles} open={showPast} onOpen={() => setShowPast(true)} />
        </>
      ) : (
        <>
          {/* Soonest first, across all ensembles — the by-ensemble groups follow */}
          {upcoming.length > 1 && (
            <>
              <h2 className="pub-section-title">{t('assign.dueSoon')}</h2>
              {upcoming.slice(0, 4).map(a => (
                <AssignmentCard key={`soon-${a.id}`} assignment={a} ensembles={ensembles} withAnchor={false} />
              ))}
            </>
          )}
          {orderedEns.map(e => (
            <div key={e.id}>
              <h2 className="pub-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: ensembleColor(e), display: 'inline-block' }} />
                {ensembleDisplayName(e)}
              </h2>
              {byEnsemble.m[e.id].map(a => (
                <AssignmentCard key={a.id} assignment={a} ensembles={ensembles} showEnsembles={false} />
              ))}
            </div>
          ))}
          {byEnsemble.individual.length > 0 && (
            <div>
              <h2 className="pub-section-title">{t('assign.individual')}</h2>
              {byEnsemble.individual.map(a => (
                <div key={a.id}>
                  <AssignmentCard assignment={a} ensembles={ensembles} />
                  <div className="pub-assign-for">For: {(a.studentIds ?? []).map(studentName).join(', ')}</div>
                </div>
              ))}
            </div>
          )}
          <PastWork items={past} ensembles={ensembles} open={showPast} onOpen={() => setShowPast(true)} />
        </>
      )}
    </div>
  );
}

/** Recently due work, folded shut. Shut by default because this page is about
 *  what is coming; present at all because it used to be absent. */
function PastWork({ items, ensembles, open, onOpen }: {
  items: Assignment[];
  ensembles: Ensemble[];
  open: boolean;
  onOpen: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h2 className="pub-section-title">Recently due</h2>
      {open ? (
        items.map(a => <AssignmentCard key={`past-${a.id}`} assignment={a} ensembles={ensembles} withAnchor={false} />)
      ) : (
        <button className="pub-showall-btn" onClick={onOpen}>
          {t('misc.showAll', { count: items.length })}
        </button>
      )}
    </div>
  );
}
